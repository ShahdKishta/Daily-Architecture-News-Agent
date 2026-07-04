import type { DailyReportArticle } from "@/lib/supabase";

export function buildDailyReportEmailHtml({
  articles,
  keywords,
  dateLabel,
}: {
  articles: DailyReportArticle[];
  keywords: string[];
  dateLabel: string;
}): string {
  const articleRows = articles
    .map(
      (article, index) => `
        <tr>
          <td style="padding: 20px 0; border-bottom: 1px solid #e5e7eb;">
            <div style="font-size: 12px; font-weight: 600; color: #9ca3af; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 6px;">
              ${index + 1}
            </div>
            <div style="font-size: 17px; font-weight: 600; color: #111827; margin-bottom: 6px; line-height: 1.4;">
              ${escapeHtml(article.title)}
            </div>
            <div style="font-size: 14px; color: #4b5563; line-height: 1.5; margin-bottom: 8px;">
              ${escapeHtml(article.summary)}
            </div>
            <a href="${escapeAttribute(article.source_url)}" style="font-size: 13px; color: #2563eb; text-decoration: none;">
              Read source →
            </a>
          </td>
        </tr>`
    )
    .join("");

  return `
  <!DOCTYPE html>
  <html>
    <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
              <tr>
                <td style="background-color: #111827; padding: 28px 32px;">
                  <div style="font-size: 20px; font-weight: 700; color: #ffffff;">
                    Daily Architecture &amp; Sustainability Digest
                  </div>
                  <div style="font-size: 13px; color: #9ca3af; margin-top: 4px;">
                    ${escapeHtml(dateLabel)} &middot; tracking ${escapeHtml(
    keywords.join(", ")
  )}
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 32px 0 32px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${articleRows}
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 24px 32px 32px 32px;">
                  <div style="font-size: 12px; color: #9ca3af; line-height: 1.5;">
                    You're receiving this because you set up the Daily
                    Architecture News Agent. Update your keywords, run time,
                    or number of stories anytime from the setup page.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
