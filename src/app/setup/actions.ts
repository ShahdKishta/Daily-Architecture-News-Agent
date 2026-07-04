"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { EMAIL_COOKIE } from "@/lib/constants";

export type SetupFormInput = {
  email: string;
  newsCount: number;
  keywords: string[];
  runTime: string;
  telegramChatId: string;
};

export type SaveUserConfigResult = { error: string };

// Upserts the user's config keyed by email (one row per user), then
// redirects to the dashboard. Returns { error } instead of throwing so the
// client form can show a friendly validation/DB error inline.
export async function saveUserConfig(
  input: SetupFormInput
): Promise<SaveUserConfigResult | void> {
  const email = input.email.trim().toLowerCase();
  const keywords = input.keywords.map((k) => k.trim()).filter(Boolean);
  const telegramChatId = input.telegramChatId.trim();

  if (!email || !email.includes("@")) {
    return { error: "Please enter a valid email address." };
  }
  if (keywords.length === 0) {
    return { error: "Please enter at least one keyword." };
  }
  if (!Number.isFinite(input.newsCount) || input.newsCount < 1) {
    return { error: "Number of news items must be at least 1." };
  }
  if (!/^\d{1,2}$/.test(input.runTime) || Number(input.runTime) > 23) {
    return { error: "Please choose a valid run time." };
  }
  if (!telegramChatId) {
    return { error: "Please enter your Telegram Chat ID." };
  }

  const { error } = await supabase.from("user_config").upsert(
    {
      email,
      keywords,
      news_count: input.newsCount,
      run_time: input.runTime,
      telegram_chat_id: telegramChatId,
    },
    { onConflict: "email" }
  );

  if (error) {
    return { error: error.message };
  }

  cookies().set(EMAIL_COOKIE, email, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect(`/dashboard?email=${encodeURIComponent(email)}`);
}
