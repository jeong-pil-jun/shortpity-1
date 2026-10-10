-- ShortPity: Polar billing state
-- Run once in Supabase Dashboard > SQL Editor (or `supabase db push`).
--
-- Rows are written ONLY by Edge Functions using the service role (webhook / sync).
-- Users can read their own row but never write it, so the plan can't be self-assigned.

create table if not exists public.subscriptions (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  plan                  text not null default 'free' check (plan in ('free', 'pro', 'premium')),
  -- Polar subscription status (active, trialing, past_due, canceled, ...) or 'none'
  status                text not null default 'none',
  polar_customer_id     text,
  polar_subscription_id text,
  product_id            text,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  updated_at            timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

-- Webhook receipts, keyed by the Standard Webhooks `webhook-id` so redeliveries are idempotent.
-- RLS on with no policies: only the service role can touch it.
create table if not exists public.polar_webhook_events (
  webhook_id   text primary key,
  type         text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  attempts     integer not null default 1,
  last_error   text
);

alter table public.polar_webhook_events enable row level security;
