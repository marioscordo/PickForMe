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

create index if not exists allergy_warning_confirmations_user_hash_created_at_idx
  on public.allergy_warning_confirmations (user_id_hash, created_at desc);

alter table public.allergy_warning_confirmations enable row level security;

grant insert on public.allergy_warning_confirmations to service_role;
