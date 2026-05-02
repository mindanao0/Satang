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
  id text primary key,
  salary numeric not null default 0,
  tax_deductions jsonb not null default '{}'::jsonb
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
