create table if not exists public.test_feedback_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null,
  severity text,
  message text not null,
  expected_behavior text,
  steps_to_reproduce text,
  restaurant_name text,
  city text,
  contact_allowed boolean not null default false,
  app_version text,
  build_number text,
  platform text,
  os_version text,
  device_model text,
  locale text,
  screen_context text,
  status text not null default 'new',
  admin_note text,
  constraint test_feedback_reports_category_valid
    check (category in ('menu_discovery', 'photo_menu', 'recommendation', 'profile', 'allergens_exclusions', 'login', 'display', 'other')),
  constraint test_feedback_reports_severity_valid
    check (severity is null or severity in ('blocker', 'annoying', 'minor')),
  constraint test_feedback_reports_message_length
    check (char_length(message) between 1 and 1600),
  constraint test_feedback_reports_expected_behavior_length
    check (expected_behavior is null or char_length(expected_behavior) <= 1200),
  constraint test_feedback_reports_steps_length
    check (steps_to_reproduce is null or char_length(steps_to_reproduce) <= 1200),
  constraint test_feedback_reports_status_valid
    check (status in ('new', 'triaged', 'resolved', 'closed'))
);

create index if not exists test_feedback_reports_status_created_at_idx
  on public.test_feedback_reports (status, created_at desc);

create index if not exists test_feedback_reports_user_id_created_at_idx
  on public.test_feedback_reports (user_id, created_at desc);

alter table public.test_feedback_reports enable row level security;

grant insert on public.test_feedback_reports to service_role;
