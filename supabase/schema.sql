-- Run in Supabase SQL editor (or via migration). Adjust RLS for production.

create table if not exists public.transactions (
  id uuid primary key,
  type text not null check (type in ('income', 'expense')),
  category text not null,
  amount numeric not null,
  date text not null,
  note text not null default '',
  recurring_source_id text
);

create table if not exists public.recurring_transactions (
  id uuid primary key,
  name text not null,
  amount numeric not null,
  category text not null,
  type text not null check (type in ('income', 'expense')),
  day_of_month int not null check (day_of_month >= 1 and day_of_month <= 31),
  enabled boolean not null default true
);

create table if not exists public.savings_goals (
  id uuid primary key,
  name text not null,
  target_amount numeric not null,
  current_amount numeric not null,
  target_date text not null,
  monthly_contribution numeric not null
);

create table if not exists public.user_profile (
  id uuid primary key default gen_random_uuid(),
  salary numeric not null default 0,
  tax_deductions jsonb not null default '{}'::jsonb,
  personal_allowance numeric not null default 60000,
  social_security numeric not null default 0,
  life_insurance numeric not null default 0,
  ssf numeric not null default 0,
  rmf numeric not null default 0
);

create table if not exists public.budget_limits (
  category text primary key,
  amount numeric not null
);

alter table public.transactions enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.savings_goals enable row level security;
alter table public.user_profile enable row level security;
alter table public.budget_limits enable row level security;

-- Dev / single-user: allow anon full access. Replace with auth-based policies for production.
create policy "transactions_all" on public.transactions for all using (true) with check (true);
create policy "recurring_all" on public.recurring_transactions for all using (true) with check (true);
create policy "savings_goals_all" on public.savings_goals for all using (true) with check (true);
create policy "user_profile_all" on public.user_profile for all using (true) with check (true);
create policy "budget_limits_all" on public.budget_limits for all using (true) with check (true);

-- Wallet (กระเป๋าเงิน) — monthly cash wallet separate from transactions
create table if not exists public.monthly_wallet (
  id uuid default gen_random_uuid() primary key,
  month text not null unique,
  starting_balance numeric not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.wallet_entries (
  id uuid default gen_random_uuid() primary key,
  month text not null,
  name text not null,
  category text not null,
  amount numeric not null,
  date text not null,
  note text,
  created_at timestamp with time zone default now()
);

create table if not exists public.wallet_category_budgets (
  id uuid default gen_random_uuid() primary key,
  month text not null,
  category text not null,
  budget numeric not null default 0,
  created_at timestamp with time zone default now(),
  unique (month, category)
);

create index if not exists wallet_entries_month_idx on public.wallet_entries (month);
create index if not exists wallet_category_budgets_month_idx on public.wallet_category_budgets (month);

alter table public.monthly_wallet enable row level security;
alter table public.wallet_entries enable row level security;
alter table public.wallet_category_budgets enable row level security;

create policy "monthly_wallet_all" on public.monthly_wallet for all using (true) with check (true);
create policy "wallet_entries_all" on public.wallet_entries for all using (true) with check (true);
create policy "wallet_category_budgets_all" on public.wallet_category_budgets for all using (true) with check (true);
