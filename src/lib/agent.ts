import { gemini, GEMINI_MODEL } from "@/lib/gemini";
import { sendTelegramMessage, buildTelegramDigestMessage } from "@/lib/telegram";
import { supabase, type DailyReportArticle, type UserConfig } from "@/lib/supabase";

// Shared by both /api/run-agent (manual/all-users trigger, used by the
// dashboard's "Run now" button) and /api/cron (hourly external-scheduler
// trigger, targeted to whichever users' run_time matches the current UTC
// hour) so the Gemini + Telegram + daily_reports logic exists in one place.

export type UserRunResult =
  | { email: string; status: "sent"; articleCount: number }
  | { email: string; status: "error"; error: string };

// `run_time` is written by the setup form as a plain UTC hour string
// ("0"-"23"), but this tolerates a couple of other shapes defensively
// (a number, or an "HH:mm" string) in case older/malformed rows exist.
// Returns null if the value can't be parsed as a valid 0-23 hour.
export function normalizeRunTimeToUtcHour(
  rawRunTime: string | number | null | undefined
): number | null {
  if (rawRunTime === null || rawRunTime === undefined) return null;
  const hourPart = String(rawRunTime).split(":")[0].trim();
  const hour = Number.parseInt(hourPart, 10);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return null;
  }
  return hour;
}

export async function fetchAllUserConfigs(): Promise<UserConfig[]> {
  const { data, error } = await supabase.from("user_config").select("*");

  if (error) {
    console.error("[agent] Failed to load user_config:", error.message);
    throw new Error(`Failed to load user_config: ${error.message}`);
  }

  return (data ?? []) as UserConfig[];
}

async function fetchTopArticles(
  keywords: string[],
  newsCount: number
): Promise<DailyReportArticle[]> {
  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
    contents: `Find the latest architecture and sustainability news matching these keywords: ${keywords.join(
      ", "
    )}.`,
    config: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      systemInstruction: `You are a research assistant building a daily architecture and sustainability news digest. Use Google Search to find recent, credible news articles (ideally published in the last 7 days) that closely match the given keywords. Prioritize reputable architecture, design, engineering, and sustainability publications, and avoid duplicate stories or duplicate domains.

After searching, respond with ONLY a single JSON object and nothing else - no markdown code fences, no commentary before or after. Use exactly this shape:
{"articles": [{"title": string, "summary": string, "source_url": string}]}

"summary" must be a single, information-dense sentence. "source_url" must be the direct URL of the article. Return exactly ${newsCount} articles, ranked by relevance and recency.`,
      tools: [{ googleSearch: {} }],
    },
  });

  const text = (response.text ?? "").trim();
  console.log(`[agent] Gemini raw response length: ${text.length} chars.`);

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    console.error("[agent] Gemini response had no '{...}' to extract:", text);
    throw new Error("Gemini did not return a parseable JSON response.");
  }

  let parsed: { articles?: unknown };
  try {
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    console.error(
      "[agent] JSON.parse failed on Gemini response:",
      err instanceof Error ? err.message : err
    );
    throw new Error("Failed to parse JSON returned by Gemini.");
  }

  if (!Array.isArray(parsed.articles)) {
    console.error("[agent] Parsed Gemini JSON had no 'articles' array:", parsed);
    throw new Error("Gemini response was missing an 'articles' array.");
  }

  const articles = parsed.articles
    .filter(
      (item): item is DailyReportArticle =>
        !!item &&
        typeof item === "object" &&
        typeof (item as DailyReportArticle).title === "string" &&
        typeof (item as DailyReportArticle).summary === "string" &&
        typeof (item as DailyReportArticle).source_url === "string"
    )
    .slice(0, newsCount);

  if (articles.length === 0) {
    throw new Error("Gemini did not return any usable articles.");
  }

  return articles;
}

function buildMarkdownSummary(
  articles: DailyReportArticle[],
  keywords: string[],
  dateLabel: string
): string {
  const header = `# Daily Architecture & Sustainability Digest — ${dateLabel}\n\nTracking: ${keywords.join(
    ", "
  )}\n`;
  const body = articles
    .map(
      (article, index) =>
        `${index + 1}. **${article.title}** — ${article.summary} ([source](${article.source_url}))`
    )
    .join("\n");
  return `${header}\n${body}`;
}

export async function processUser(user: UserConfig): Promise<UserRunResult> {
  const dateLabel = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  console.log(`[agent] ${user.email}: starting (user_config_id=${user.id}).`);

  if (!user.telegram_chat_id) {
    console.error(`[agent] ${user.email}: no telegram_chat_id on file, skipping.`);
    throw new Error("Missing telegram_chat_id for this user.");
  }

  let articles: DailyReportArticle[];
  try {
    articles = await fetchTopArticles(user.keywords, user.news_count);
    console.log(
      `[agent] ${user.email}: Gemini responded, parsed ${articles.length} article(s).`
    );
  } catch (err) {
    console.error(
      `[agent] ${user.email}: Gemini call or response parsing failed -`,
      err instanceof Error ? err.stack ?? err.message : err
    );
    throw err;
  }

  const summary = buildMarkdownSummary(articles, user.keywords, dateLabel);

  try {
    const { error: insertError } = await supabase.from("daily_reports").insert({
      user_config_id: user.id,
      summary,
      articles,
    });

    if (insertError) {
      throw new Error(`Failed to save report: ${insertError.message}`);
    }
    console.log(`[agent] ${user.email}: report saved to daily_reports.`);
  } catch (err) {
    console.error(
      `[agent] ${user.email}: saving to daily_reports failed -`,
      err instanceof Error ? err.stack ?? err.message : err
    );
    throw err;
  }

  let telegramMessage: string;
  try {
    telegramMessage = buildTelegramDigestMessage({
      articles,
      keywords: user.keywords,
      dateLabel,
    });
  } catch (err) {
    console.error(
      `[agent] ${user.email}: building Telegram message failed -`,
      err instanceof Error ? err.stack ?? err.message : err
    );
    throw err;
  }

  console.log(
    `[agent] ${user.email}: about to send Telegram message to chat_id=${user.telegram_chat_id}.`
  );

  const sendResult = await sendTelegramMessage(user.telegram_chat_id, telegramMessage);

  if (!sendResult.success) {
    console.error(`[agent] ${user.email}: Telegram send failed - ${sendResult.error}`);
    throw new Error(`Failed to send Telegram message: ${sendResult.error}`);
  }

  console.log(`[agent] ${user.email}: Telegram message sent successfully.`);

  return { email: user.email, status: "sent", articleCount: articles.length };
}

// Each user is isolated in its own try/catch: one user's Gemini/DB/Telegram
// failure is logged and recorded, but never stops the loop from continuing
// to the next user.
export async function runAgentForUsers(users: UserConfig[]): Promise<UserRunResult[]> {
  const results: UserRunResult[] = [];

  for (const user of users) {
    try {
      results.push(await processUser(user));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[agent] ${user.email}: FAILED - ${message}`);
      results.push({
        email: user.email,
        status: "error",
        error: message,
      });
    }
  }

  const sentCount = results.filter((r) => r.status === "sent").length;
  const failedCount = results.filter((r) => r.status === "error").length;
  console.log(`[agent] Done: ${sentCount} sent, ${failedCount} failed.`);

  return results;
}
