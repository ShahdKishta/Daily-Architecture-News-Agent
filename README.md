# Daily Architecture News Agent

An autonomous daily agent that researches architecture and sustainability
news, summarizes it with Gemini, and delivers it to you on Telegram — no
manual research required.

## What it does

Each day (or on demand via the dashboard's "Run now" button), the agent:

1. Loops through every configured user.
2. For each user, calls the Gemini API with Google Search grounding to find
   recent, credible news matching their tracked keywords (architecture,
   sustainable design, BIM, green building, etc.).
3. Asks Gemini to pick and summarize the user's chosen number of top
   stories, each with a title, a one-line summary, and a source link.
4. Saves the report to Supabase (`daily_reports`).
5. Sends the user a formatted digest message via their Telegram bot chat.

One user's failure (a bad API response, a send error, etc.) never blocks
the others — each user is processed independently and the run result
reports per-user success/failure.

## Setting up a Telegram bot

1. In Telegram, message [@BotFather](https://t.me/BotFather) and send
   `/newbot`, following the prompts to name your bot.
2. BotFather replies with a bot token that looks like
   `123456789:AAExampleTokenValue` — this is your `TELEGRAM_BOT_TOKEN`.
3. Each user then needs their own **chat ID** so the bot knows where to
   deliver their digest:
   - Have them start a conversation with your bot (search for its
     username in Telegram and press **Start**, or send it any message) —
     Telegram bots can't message a user until the user has messaged the
     bot first.
   - Have them message [@userinfobot](https://t.me/userinfobot), which
     replies with their numeric chat ID.
   - That numeric ID is what goes into the "Telegram Chat ID" field on
     `/setup`.

## First-time setup

1. Run `npm install`.
2. Create a Supabase project and run [supabase/schema.sql](supabase/schema.sql)
   in the Supabase SQL editor to create the `user_config` and
   `daily_reports` tables (or apply the `alter table ... add column`
   migration inside it if you already have an older version of this
   schema applied).
3. Copy `.env.example` to `.env.local` and fill in real values (see
   [Environment variables](#environment-variables) below).
4. Run `npm run dev` and open `http://localhost:3000`.
5. You'll be redirected to `/setup` (no config exists yet for your email).
   Fill in:
   - **Email address** — used only to identify your account/config row,
     not for delivery.
   - **Telegram Chat ID** — where your daily digest is actually delivered
     (see [Setting up a Telegram bot](#setting-up-a-telegram-bot) above).
   - **Number of news items to summarize** — default 5.
   - **Keywords to track** — comma-separated, e.g. `Architecture,
     Sustainable Design, BIM, Green Building`.
   - **Preferred daily run time (UTC)** — a dropdown of hours. Note: this
     is currently stored for future use but does not yet control delivery
     timing — see [How the daily cron works](#how-the-daily-cron-works).
6. Submitting the form upserts your config in `user_config` (keyed by
   email, so re-submitting updates your existing row instead of creating a
   duplicate) and redirects you to `/dashboard`.
7. Revisit `/` any time — it checks your email (via cookie or `?email=`
   query param) against `user_config` and redirects you to `/setup` or
   `/dashboard` accordingly.

## Environment variables

Set these in `.env.local` (see `.env.example`):

| Variable | Description |
| --- | --- |
| `GEMINI_API_KEY` | Google Gemini API key, used for the digest generation + Google Search grounding tool. |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather, used to deliver the daily digest message. |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only — bypasses RLS, never expose to the browser). |
| `CRON_SECRET` | Optional. If set, `GET /api/run-agent` requires an `Authorization: Bearer <CRON_SECRET>` header (Vercel Cron sends this automatically when the env var is configured). Manual `POST` requests (e.g. the dashboard's "Run now" button) are not gated by this. |

## How the daily cron works

[vercel.json](vercel.json) schedules a single daily cron job:

```json
{
  "crons": [{ "path": "/api/run-agent", "schedule": "0 13 * * *" }]
}
```

This fires `GET /api/run-agent` once a day at 13:00 UTC, which processes
**every** row in `user_config` and sends each user their digest via
Telegram.

The `run_time` field collected during setup is stored on each user's row
but is **not** currently used to gate delivery — everyone is processed at
the same fixed cron time regardless of their preference. Per-user
scheduling would require switching to an hourly cron and having the route
check each user's `run_time` against the current UTC hour before sending;
that wasn't implemented here since it needs a Vercel plan that supports
more-frequent-than-daily cron schedules (Hobby only allows once/day).

You can also trigger a run manually at any time with:

```bash
curl -X POST http://localhost:3000/api/run-agent
```

or via the "Run now" button on `/dashboard`.
