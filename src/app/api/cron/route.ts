import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import {
  fetchAllUserConfigs,
  normalizeRunTimeToUtcHour,
  runAgentForUsers,
} from "@/lib/agent";

// Called by an external scheduler once per hour (NOT Vercel Cron - see
// README). Each call only sends to users whose stored run_time (a UTC
// hour, converted from whatever local time they picked in /setup - e.g.
// Jordan time) matches the current UTC hour, so every user gets exactly
// one digest per day, at their own chosen hour.
//
// The actual work (Gemini + Telegram + daily_reports, per matched user)
// can take well over 10 seconds, which is longer than some external
// schedulers' request timeout. So this route authorizes and computes the
// current hour synchronously, kicks the real work off via waitUntil()
// (which keeps this serverless function alive in the background after the
// response is sent, instead of it being killed), and responds
// immediately with { status: "started", hour }.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Unlike /api/run-agent's optional check, this endpoint is the one meant to
// be called unattended by a third-party scheduler, so CRON_SECRET is
// mandatory here: if it isn't configured, or the caller's bearer token
// doesn't match it, the request is rejected.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set on the server - rejecting request.");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Runs in the background after the HTTP response has already been sent
// (via waitUntil below) - must not throw, since there's no request left to
// attach an error response to; any failure is only visible via logs.
async function runMatchedUsersInBackground(currentHour: number): Promise<void> {
  try {
    const users = await fetchAllUserConfigs();
    console.log(`[cron] Loaded ${users.length} user_config row(s) total.`);

    const matchedUsers = users.filter((user) => {
      const hour = normalizeRunTimeToUtcHour(user.run_time);
      if (hour === null) {
        console.error(
          `[cron] ${user.email}: could not parse run_time "${user.run_time}", skipping.`
        );
        return false;
      }
      return hour === currentHour;
    });

    console.log(
      `[cron] ${matchedUsers.length} of ${users.length} user(s) match UTC hour ${currentHour}.`
    );

    const results = await runAgentForUsers(matchedUsers);

    const sentCount = results.filter((r) => r.status === "sent").length;
    const failedCount = results.filter((r) => r.status === "error").length;

    console.log(
      `[cron] Done for hour ${currentHour}: ${matchedUsers.length} matched, ${sentCount} sent, ${failedCount} failed.`
    );
  } catch (err) {
    console.error(
      `[cron] Background run for hour ${currentHour} failed -`,
      err instanceof Error ? err.stack ?? err.message : err
    );
  }
}

function handle(request: Request) {
  if (!isAuthorized(request)) {
    console.error(
      "[cron] Unauthorized request - missing or incorrect Authorization header."
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentHour = new Date().getUTCHours();
  console.log(
    `[cron] Triggered. Current UTC hour: ${currentHour}. Starting background run.`
  );

  // Deliberately not awaited: the response below returns right away, and
  // waitUntil keeps this invocation alive until the promise settles.
  waitUntil(runMatchedUsersInBackground(currentHour));

  return NextResponse.json({ status: "started", hour: currentHour });
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}
