import { NextResponse } from "next/server";
import { gemini, GEMINI_MODEL } from "@/lib/gemini";
import { sendTelegramMessage, buildTelegramDigestMessage } from "@/lib/telegram";
import { supabase, type DailyReportArticle, type UserConfig } from "@/lib/supabase";

// Web search + multiple users can take a while; allow up to 5 minutes.
// (Requires a Vercel plan that supports function durations beyond the
// Hobby default of 10s - see vercel.json.)
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type UserRunResult =
  | { email: string; status: "sent"; articleCount: number }
  | { email: string; status: "error"; error: string };

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
  console.log(`[run-agent] Gemini raw response length: ${text.length} chars.`);

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    console.error("[run-agent] Gemini response had no '{...}' to extract:", text);
    throw new Error("Gemini did not return a parseable JSON response.");
  }

  let parsed: { articles?: unknown };
  try {
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    console.error(
      "[run-agent] JSON.parse failed on Gemini response:",
      err instanceof Error ? err.message : err
    );
    throw new Error("Failed to parse JSON returned by Gemini.");
  }

  if (!Array.isArray(parsed.articles)) {
    console.error("[run-agent] Parsed Gemini JSON had no 'articles' array:", parsed);
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

async function processUser(user: UserConfig): Promise<UserRunResult> {
  const dateLabel = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  console.log(`[run-agent] ${user.email}: starting (user_config_id=${user.id}).`);

  if (!user.telegram_chat_id) {
    console.error(`[run-agent] ${user.email}: no telegram_chat_id on file, skipping.`);
    throw new Error("Missing telegram_chat_id for this user.");
  }

  let articles: DailyReportArticle[];
  try {
    articles = await fetchTopArticles(user.keywords, user.news_count);
    console.log(
      `[run-agent] ${user.email}: Gemini responded, parsed ${articles.length} article(s).`
    );
  } catch (err) {
    console.error(
      `[run-agent] ${user.email}: Gemini call or response parsing failed -`,
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
    console.log(`[run-agent] ${user.email}: report saved to daily_reports.`);
  } catch (err) {
    console.error(
      `[run-agent] ${user.email}: saving to daily_reports failed -`,
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
      `[run-agent] ${user.email}: building Telegram message failed -`,
      err instanceof Error ? err.stack ?? err.message : err
    );
    throw err;
  }

  console.log(
    `[run-agent] ${user.email}: about to send Telegram message to chat_id=${user.telegram_chat_id}.`
  );

  const sendResult = await sendTelegramMessage(user.telegram_chat_id, telegramMessage);

  if (!sendResult.success) {
    console.error(`[run-agent] ${user.email}: Telegram send failed - ${sendResult.error}`);
    throw new Error(`Failed to send Telegram message: ${sendResult.error}`);
  }

  console.log(`[run-agent] ${user.email}: Telegram message sent successfully.`);

  return { email: user.email, status: "sent", articleCount: articles.length };
}

async function runAgentForAllUsers(): Promise<UserRunResult[]> {
  const { data: users, error } = await supabase.from("user_config").select("*");

  if (error) {
    console.error("[run-agent] Failed to load user_config:", error.message);
    throw new Error(`Failed to load user_config: ${error.message}`);
  }

  console.log(`[run-agent] Loaded ${users?.length ?? 0} user_config row(s).`);

  const results: UserRunResult[] = [];

  // Each user is isolated in its own try/catch: one user's Gemini/DB/Telegram
  // failure is logged and recorded, but never stops the loop from continuing
  // to the next user.
  for (const user of (users ?? []) as UserConfig[]) {
    try {
      results.push(await processUser(user));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[run-agent] ${user.email}: FAILED - ${message}`);
      results.push({
        email: user.email,
        status: "error",
        error: message,
      });
    }
  }

  const sentCount = results.filter((r) => r.status === "sent").length;
  const failedCount = results.filter((r) => r.status === "error").length;
  console.log(`[run-agent] Done: ${sentCount} sent, ${failedCount} failed.`);

  return results;
}

function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured (e.g. local dev) - allow
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Invoked by Vercel Cron (see vercel.json).
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runAgentForAllUsers();
  return NextResponse.json({ results });
}

// Manual trigger, e.g. the dashboard's "Run now" button or local testing.
export async function POST() {
  const results = await runAgentForAllUsers();
  return NextResponse.json({ results });
}
