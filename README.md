# Daily Architecture News Agent

An autonomous daily agent that researches architecture and sustainability
news, summarizes it with Gemini, and delivers it to you on Telegram — no
manual research required.

## What it does

Every hour (via an external scheduler calling `/api/cron`), or on demand
via the dashboard's "Run now" button, the agent:

1. Loops through every configured user (the hourly cron only processes
   users whose chosen delivery hour matches the current UTC hour, so each
   user gets exactly one digest per day, at their own preferred time).
2. For each matching user, calls the Gemini API with Google Search
   grounding to find recent, credible news matching their tracked keywords
   (architecture, sustainable design, BIM, green building, etc.).
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
   - **Preferred daily run time (Jordan time)** — a dropdown of hours,
     shown in Jordan/Amman local time (permanently UTC+3, no daylight
     saving) and converted to a UTC hour before it's stored. This is what
     `/api/cron` matches against the current UTC hour — see
     [Scheduled delivery](#scheduled-delivery-apicron) below.
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
| `CRON_SECRET` | **Required** for `/api/cron` — the external scheduler must send it as `Authorization: Bearer <CRON_SECRET>`, or the request is rejected with 401. Also optionally gates `GET /api/run-agent` the same way (that one falls back to open access if `CRON_SECRET` is unset, since it's meant for manual/local use). |

## Scheduled delivery (`/api/cron`)

Delivery is **not** scheduled via Vercel Cron — there's no `crons` entry in
`vercel.json`. Instead, an external scheduler (e.g. a free service like
cron-job.org, EasyCron, or a scheduled GitHub Actions workflow) should call
this endpoint **once every hour**:

```
GET https://<your-deployment>/api/cron
Authorization: Bearer <CRON_SECRET>
```

(`POST` works identically, in case your scheduler only supports POST.)

Each call:

1. Requires the `Authorization: Bearer <CRON_SECRET>` header — a missing
   or incorrect token returns `401 Unauthorized`, and requests are
   rejected outright if `CRON_SECRET` isn't configured on the server at
   all (unlike `/api/run-agent`, this endpoint has no open-access
   fallback, since it's the one meant to be hit unattended by a
   third-party service).
2. Determines the current UTC hour and responds **immediately** with:
   ```json
   { "status": "started", "hour": 13 }
   ```
   Fetching from Gemini and sending Telegram messages for every matched
   user can take well over 10 seconds, which is longer than many external
   schedulers' request timeout (e.g. Crontap times out at 10s). So the
   route doesn't wait for that work before responding - it kicks it off in
   the background via Vercel's `waitUntil()` (from `@vercel/functions`),
   which keeps the serverless function alive until the background work
   finishes, then returns the fast response above right away.
3. In the background: loads every row in `user_config`, filters to only
   the users whose stored `run_time` (a UTC hour - converted from
   whatever local time, e.g. Jordan time, they picked in `/setup`) matches
   the current UTC hour, then runs the same Gemini + Telegram +
   `daily_reports` pipeline as `/api/run-agent` for just that matched set
   - so each user gets exactly one digest per day, at their own chosen
   hour, no matter how often the scheduler calls in.

Every stage is logged (current UTC hour, users loaded, users matched,
per-user Gemini/DB/Telegram results, final sent/failed tally) — check your
deployment's function logs to see the outcome of the background run, since
the HTTP response itself only confirms the run *started*, not that it
finished successfully.

### Manual / all-user trigger (`/api/run-agent`)

`/api/run-agent` still exists separately and is unaffected by the above —
it processes **every** user regardless of their `run_time`, and is what
the dashboard's "Run now" button calls (via `POST`, no auth required) for
on-demand testing:

```bash
curl -X POST http://localhost:3000/api/run-agent
```

Both routes share the same underlying logic (`src/lib/agent.ts`) so
there's one code path for fetching articles, saving reports, and sending
Telegram messages - `/api/cron` just adds the current-hour filter on top.
