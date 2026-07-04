import type { DailyReportArticle } from "@/lib/supabase";

// Trimmed defensively: a stray trailing newline/space in the env var (easy
// to introduce pasting into Vercel's dashboard) would otherwise get baked
// into the URL below, causing fetch() to throw a URL-parse error before
// any network request is ever attempted.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN environment variable");
}

const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

export type TelegramSendResult =
  | { success: true }
  | { success: false; error: string };

// Sends an HTML-formatted message to a Telegram chat via the Bot API.
// Never throws - failures (bad chat_id, bot blocked, network error, etc.)
// are returned as { success: false, error } so callers can handle them
// per-user without one failure taking down the whole run.
export async function sendTelegramMessage(
  chatId: string,
  html: string
): Promise<TelegramSendResult> {
  const trimmedChatId = chatId.trim();

  if (!trimmedChatId) {
    const error = "chat_id is empty after trimming.";
    console.error(`[telegram] ${error}`);
    return { success: false, error };
  }

  console.log(
    `[telegram] Sending message to chat_id=${trimmedChatId} (${html.length} chars)...`
  );

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: trimmedChatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });

    // Read as text first (not .json()) so we can log the raw body even if
    // Telegram (or a proxy in front of it) returns something non-JSON.
    const rawBody = await response.text();
    console.log(
      `[telegram] chat_id=${trimmedChatId}: HTTP ${response.status} - ${rawBody}`
    );

    let data: { ok?: boolean; description?: string } = {};
    try {
      data = JSON.parse(rawBody);
    } catch {
      // leave data as {} - handled by the !data.ok check below
    }

    if (!response.ok || !data.ok) {
      const error =
        data.description ?? `Telegram API error (HTTP ${response.status})`;
      console.error(`[telegram] chat_id=${trimmedChatId}: send failed - ${error}`);
      return { success: false, error };
    }

    console.log(`[telegram] chat_id=${trimmedChatId}: sent successfully.`);
    return { success: true };
  } catch (err) {
    const error =
      err instanceof Error
        ? err.message
        : "Unknown error sending Telegram message";
    console.error(
      `[telegram] chat_id=${trimmedChatId}: exception before/during fetch - ${error}`
    );
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    return { success: false, error };
  }
}

// Builds a Telegram-friendly digest message. Telegram's HTML parse mode
// only supports a small subset of tags (b, i, a, code, pre, etc.) - no
// div/table/style like the old email template, so this is plain text with
// bold titles and links instead.
export function buildTelegramDigestMessage({
  articles,
  keywords,
  dateLabel,
}: {
  articles: DailyReportArticle[];
  keywords: string[];
  dateLabel: string;
}): string {
  const header = `<b>📰 Daily Architecture &amp; Sustainability Digest</b>\n${escapeHtml(
    dateLabel
  )} · tracking ${escapeHtml(keywords.join(", "))}`;

  const body = articles
    .map(
      (article, index) =>
        `${index + 1}. <b>${escapeHtml(article.title)}</b>\n${escapeHtml(
          article.summary
        )}\n<a href="${escapeAttribute(article.source_url)}">Read source</a>`
    )
    .join("\n\n");

  return `${header}\n\n${body}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
