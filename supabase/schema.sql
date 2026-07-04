-- Daily Architecture News Agent - Supabase schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────
-- user_config: one row per user, keyed by email
-- ─────────────────────────────────────────────────────────
create table if not exists user_config (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  keywords    text[] not null default '{}',
  news_count  integer not null default 5,
  run_time    text not null default '13', -- preferred hour to run, UTC, "0"-"23"
  created_at  timestamptz not null default now()
);

-- Enforce one config per email and make email lookups (and the upsert's
-- ON CONFLICT (email) target) fast.
create unique index if not exists user_config_email_key
  on user_config (email);

-- ─────────────────────────────────────────────────────────
-- daily_reports: one row per generated report, linked to a user_config
-- ─────────────────────────────────────────────────────────
create table if not exists daily_reports (
  id              uuid primary key default gen_random_uuid(),
  user_config_id  uuid not null references user_config (id) on delete cascade,
  summary         text,
  articles        jsonb not null default '[]',
  created_at      timestamptz not null default now()
);

-- Speeds up "all reports for this user, newest first" (the dashboard query).
create index if not exists daily_reports_user_config_id_created_at_idx
  on daily_reports (user_config_id, created_at desc);

-- ─────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────
-- The app only ever talks to Supabase from the server using the
-- SUPABASE_SERVICE_ROLE_KEY (see src/lib/supabase.ts), which bypasses RLS
-- entirely. Enabling RLS here with no policies means the anon/public key
-- (if it ever leaks or gets used client-side) cannot read or write these
-- tables at all.
alter table user_config enable row level security;
alter table daily_reports enable row level security;
