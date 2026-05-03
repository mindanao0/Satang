-- Add flattened deduction columns if upgrading from an older `user_profile` definition.

alter table public.user_profile add column if not exists personal_allowance numeric not null default 60000;
alter table public.user_profile add column if not exists social_security numeric not null default 0;
alter table public.user_profile add column if not exists life_insurance numeric not null default 0;
alter table public.user_profile add column if not exists ssf numeric not null default 0;
alter table public.user_profile add column if not exists rmf numeric not null default 0;
