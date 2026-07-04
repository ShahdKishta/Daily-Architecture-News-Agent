# Daily Architecture News Agent

An autonomous daily agent that researches architecture and sustainability
news, summarizes it with Gemini, and emails you a digest — no manual
research required.

## What it does

Each day (or on demand via the dashboard's "Run now" button), the agent:

1. Loops through every configured user.
2. For each user, calls the Gemini API with Google Search grounding to find
   recent, credible news matching their tracked keywords (architecture,
   sustainable design, BIM, green building, etc.).
3. Asks Gemini to pick and summarize the user's chosen number of top
   stories, each with a title, a one-line summary, and a source link.
4. Saves the report to Supabase (`daily_reports`).
5. Emails the user a formatted HTML digest via Resend.

One user's failure (a bad API response, a send error, etc.) never blocks
the others — each user is processed independently and the run result
reports per-user success/failure.

## First-time setup

1. Run `npm install`.
2. Create a Supabase project and run [supabase/schema.sql](supabase/schema.sql)
   in the Supabase SQL editor to create the `user_config` and
   `daily_reports` tables.
3. Copy `.env.example` to `.env.local` and fill in real values (see
   [Environment variables](#environment-variables) below).
4. Run `npm run dev` and open `http://localhost:3000`.
5. You'll be redirected to `/setup` (no config exists yet for your email).
   Fill in:
   - **Email address** — where your daily digest is sent.
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
| `RESEND_API_KEY` | Resend API key, used to send the daily HTML email. |
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
**every** row in `user_config` and emails each user their digest.

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
