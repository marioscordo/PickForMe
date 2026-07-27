create table if not exists public.restaurant_discovery_searches (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id_hash text not null,
  created_at timestamptz not null default now(),
  constraint restaurant_discovery_searches_user_id_hash_format
    check (user_id_hash ~ '^[a-f0-9]{64}$')
);

-- Ein Log-Eintrag pro Discovery-Suche (nicht pro Menu-Isolierung) - dient
-- ausschliesslich dem Tageslimit/Kostenbremse in /api/restaurant-discovery.
-- Zaehlung erfolgt per COUNT(*) ueber user_id_hash + created_at, analog zum
-- Muster in allergy_warning_confirmations.
create index if not exists restaurant_discovery_searches_user_hash_created_at_idx
  on public.restaurant_discovery_searches (user_id_hash, created_at desc);

alter table public.restaurant_discovery_searches enable row level security;

grant insert, select on public.restaurant_discovery_searches to service_role;
