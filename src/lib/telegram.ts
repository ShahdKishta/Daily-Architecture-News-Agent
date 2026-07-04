import type { DailyReportArticle } from "@/lib/supabase";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });

    const data: { ok?: boolean; description?: string } = await response
      .json()
      .catch(() => ({}));

    if (!response.ok || !data.ok) {
      return {
        success: false,
        error: data.description ?? `Telegram API error (HTTP ${response.status})`,
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Unknown error sending Telegram message",
    };
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
