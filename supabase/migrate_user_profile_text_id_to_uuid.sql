-- Run once if `user_profile.id` is still `text` (e.g. legacy 'default' row).
-- Skip if the table was created from schema.sql with uuid already.

alter table public.user_profile drop constraint if exists user_profile_pkey;

alter table public.user_profile
  alter column id drop default;

alter table public.user_profile
  alter column id type uuid using (
    case
      when id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then id::text::uuid
      else gen_random_uuid()
    end
  );

alter table public.user_profile
  alter column id set default gen_random_uuid();

alter table public.user_profile add primary key (id);
