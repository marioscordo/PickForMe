-- GustaroAI V1 Supabase schema
-- Profile, structured rules, and recommendation feedback persistence.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  output_locale text not null,
  diet_style text not null default 'normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_output_locale_format
    check (output_locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  constraint user_profiles_diet_style_format
    check (diet_style ~ '^[a-z0-9_:-]+$')
);

create table if not exists public.user_profile_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_type text not null,
  rule_id text not null,
  display_label jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  source text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profile_rules_rule_type_valid
    check (rule_type in ('like', 'dislike', 'intolerance', 'exception')),
  constraint user_profile_rules_rule_id_format
    check (rule_id ~ '^[A-Z0-9_:-]+$'),
  constraint user_profile_rules_source_valid
    check (source in ('default', 'user', 'system')),
  constraint user_profile_rules_display_label_object
    check (jsonb_typeof(display_label) = 'object'),
  constraint user_profile_rules_unique_rule
    unique (user_id, rule_type, rule_id)
);

create table if not exists public.recommendation_feedback (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_name text,
  restaurant_url text,
  dish_name_original text not null,
  translated_name text,
  output_locale text not null,
  rating integer,
  accepted boolean not null default false,
  situation_id text,
  dish_role text,
  meal_type text,
  substance_level text,
  source_format text not null default 'unknown',
  matched_rule_ids text[] not null default '{}'::text[],
  dish_attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint recommendation_feedback_output_locale_format
    check (output_locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  constraint recommendation_feedback_rating_valid
    check (rating is null or rating between 1 and 5),
  constraint recommendation_feedback_situation_id_format
    check (situation_id is null or situation_id ~ '^[a-z0-9_:-]+$'),
  constraint recommendation_feedback_dish_role_format
    check (dish_role is null or dish_role ~ '^[a-z0-9_:-]+$'),
  constraint recommendation_feedback_meal_type_format
    check (meal_type is null or meal_type ~ '^[a-z0-9_:-]+$'),
  constraint recommendation_feedback_substance_level_format
    check (substance_level is null or substance_level ~ '^[a-z0-9_:-]+$'),
  constraint recommendation_feedback_source_format_valid
    check (source_format in ('html', 'pdf', 'text', 'ocr', 'image', 'manual', 'unknown')),
  constraint recommendation_feedback_dish_attributes_object
    check (jsonb_typeof(dish_attributes) = 'object')
);

create table if not exists public.allergy_warning_confirmations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id_hash text not null,
  confirmation_timestamp timestamptz not null,
  confirmation_version text not null,
  created_at timestamptz not null default now(),
  constraint allergy_warning_confirmations_user_id_hash_format
    check (user_id_hash ~ '^[a-f0-9]{64}$'),
  constraint allergy_warning_confirmations_version_length
    check (char_length(confirmation_version) between 1 and 80)
);

create index if not exists user_profile_rules_user_id_idx
  on public.user_profile_rules (user_id);

create index if not exists user_profile_rules_active_idx
  on public.user_profile_rules (user_id, rule_type, active);

create index if not exists recommendation_feedback_user_id_created_at_idx
  on public.recommendation_feedback (user_id, created_at desc);

create index if not exists recommendation_feedback_source_format_idx
  on public.recommendation_feedback (user_id, source_format);

create index if not exists allergy_warning_confirmations_user_hash_created_at_idx
  on public.allergy_warning_confirmations (user_id_hash, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row
  execute function public.set_updated_at();

drop trigger if exists user_profile_rules_set_updated_at on public.user_profile_rules;
create trigger user_profile_rules_set_updated_at
  before update on public.user_profile_rules
  for each row
  execute function public.set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.user_profile_rules enable row level security;
alter table public.recommendation_feedback enable row level security;
alter table public.allergy_warning_confirmations enable row level security;

drop policy if exists user_profiles_select_own on public.user_profiles;
create policy user_profiles_select_own
  on public.user_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_profiles_insert_own on public.user_profiles;
create policy user_profiles_insert_own
  on public.user_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_profiles_update_own on public.user_profiles;
create policy user_profiles_update_own
  on public.user_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_profiles_delete_own on public.user_profiles;
create policy user_profiles_delete_own
  on public.user_profiles
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_profile_rules_select_own on public.user_profile_rules;
create policy user_profile_rules_select_own
  on public.user_profile_rules
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_profile_rules_insert_own on public.user_profile_rules;
create policy user_profile_rules_insert_own
  on public.user_profile_rules
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_profile_rules_update_own on public.user_profile_rules;
create policy user_profile_rules_update_own
  on public.user_profile_rules
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_profile_rules_delete_own on public.user_profile_rules;
create policy user_profile_rules_delete_own
  on public.user_profile_rules
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists recommendation_feedback_select_own on public.recommendation_feedback;
create policy recommendation_feedback_select_own
  on public.recommendation_feedback
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists recommendation_feedback_insert_own on public.recommendation_feedback;
create policy recommendation_feedback_insert_own
  on public.recommendation_feedback
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists recommendation_feedback_update_own on public.recommendation_feedback;
create policy recommendation_feedback_update_own
  on public.recommendation_feedback
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists recommendation_feedback_delete_own on public.recommendation_feedback;
create policy recommendation_feedback_delete_own
  on public.recommendation_feedback
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_profiles to authenticated;
grant select, insert, update, delete on public.user_profile_rules to authenticated;
grant select, insert, update, delete on public.recommendation_feedback to authenticated;
grant insert on public.allergy_warning_confirmations to service_role;
