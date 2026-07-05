import { NextResponse } from "next/server";
import { fetchAllUserConfigs, runAgentForUsers } from "@/lib/agent";

// Web search + multiple users can take a while; allow up to 5 minutes.
// (Requires a Vercel plan that supports function durations beyond the
// Hobby default of 10s.)
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Manual/all-users trigger - used by the dashboard's "Run now" button and
// for local testing. Scheduled, per-user-hour delivery now happens via
// /api/cron instead (see src/app/api/cron/route.ts).
async function runAgentForAllUsers() {
  const users = await fetchAllUserConfigs();
  console.log(`[run-agent] Loaded ${users.length} user_config row(s).`);
  return runAgentForUsers(users);
}

function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured (e.g. local dev) - allow
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

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
