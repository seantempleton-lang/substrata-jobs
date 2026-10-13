alter table jobs_app.daily_logs add column aggregate jsonb;
alter table jobs_app.daily_logs drop constraint daily_logs_shift_label_check;
alter table jobs_app.daily_logs add constraint daily_logs_shift_label_check check (shift_label in ('day','night','morning','afternoon','custom'));

create table jobs_app.field_handoffs (
  id uuid primary key,
  token_hash text not null unique,
  daily_log_id uuid not null references jobs_app.daily_logs(id),
  actor_user_id uuid not null references public.app_users(id),
  context jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index field_handoffs_expiry_idx on jobs_app.field_handoffs(expires_at);
