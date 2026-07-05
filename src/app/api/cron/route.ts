import { NextResponse } from "next/server";
import {
  fetchAllUserConfigs,
  normalizeRunTimeToUtcHour,
  runAgentForUsers,
} from "@/lib/agent";

// Called by an external scheduler once per hour (NOT Vercel Cron - see
// vercel.json / README). Each call only sends to users whose stored
// run_time (a UTC hour, converted from whatever local time they picked in
// /setup - e.g. Jordan time) matches the current UTC hour, so every user
// gets exactly one digest per day, at their own chosen hour.
export const maxDuration = 300;
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

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    console.error(
      "[cron] Unauthorized request - missing or incorrect Authorization header."
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentHour = new Date().getUTCHours();
  console.log(`[cron] Triggered. Current UTC hour: ${currentHour}.`);

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

  return NextResponse.json({
    hour: currentHour,
    totalUsers: users.length,
    matchedUsers: matchedUsers.length,
    sent: sentCount,
    failed: failedCount,
    results,
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
