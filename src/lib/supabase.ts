import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
  );
}

// Server-side Supabase client using the service role key.
// This bypasses Row Level Security, so it must never be imported into
// client components — only use it from route handlers / server components.
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
  },
});

export type UserConfig = {
  id: string;
  email: string;
  keywords: string[];
  news_count: number;
  run_time: string;
  created_at: string;
};

export type DailyReportArticle = {
  title: string;
  summary: string;
  source_url: string;
};

export type DailyReport = {
  id: string;
  user_config_id: string;
  summary: string;
  articles: DailyReportArticle[];
  created_at: string;
};
