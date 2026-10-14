alter table jobs_app.daily_logs drop constraint daily_logs_status_check;
alter table jobs_app.daily_logs add constraint daily_logs_status_check
  check (status in ('draft','submitted','under_review','returned','awaiting_driller_confirmation','approved','reopened'));

create table jobs_app.signature_assets (
  id uuid primary key,
  daily_log_id uuid not null references jobs_app.daily_logs(id) on delete restrict,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  content_hash text not null,
  acknowledged_content jsonb not null,
  acknowledgement jsonb not null,
  payload_hash text not null,
  encrypted_content bytea not null,
  nonce bytea not null,
  auth_tag bytea not null,
  key_id text not null,
  created_at timestamptz not null default now()
);

create table jobs_app.log_revisions (
  daily_log_id uuid not null references jobs_app.daily_logs(id) on delete restrict,
  revision integer not null check (revision > 0),
  request_id uuid not null unique,
  request_hash text not null,
  snapshot jsonb not null,
  content_sha256 text not null,
  signature_asset_id uuid references jobs_app.signature_assets(id) on delete restrict,
  created_by_user_id uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (daily_log_id, revision)
);

create table jobs_app.document_artifacts (
  id uuid primary key default gen_random_uuid(),
  daily_log_id uuid not null,
  revision integer not null,
  state text not null default 'pending' check (state in ('pending','ready','failed')),
  template_version text not null default 'draft-v1',
  content bytea,
  sha256 text,
  error_code text,
  generated_at timestamptz,
  unique (daily_log_id,revision),
  foreign key (daily_log_id,revision) references jobs_app.log_revisions(daily_log_id,revision) on delete restrict,
  check ((state='ready' and content is not null and sha256 is not null) or state<>'ready')
);

create table jobs_app.email_deliveries (
  request_id uuid primary key,
  daily_log_id uuid not null,
  revision integer not null,
  artifact_id uuid not null references jobs_app.document_artifacts(id) on delete restrict,
  artifact_sha256 text not null,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  recipient text not null,
  from_address text not null,
  reply_to text,
  provider text not null,
  provider_message_id text,
  state text not null check (state in ('queued','sent','failed','unknown')),
  error_code text,
  requested_at timestamptz not null default now(),
  attempted_at timestamptz,
  completed_at timestamptz,
  resend_of uuid references jobs_app.email_deliveries(request_id) on delete restrict,
  foreign key (daily_log_id,revision) references jobs_app.log_revisions(daily_log_id,revision) on delete restrict
);
create index email_deliveries_log_idx on jobs_app.email_deliveries(daily_log_id,requested_at);

-- Revisions/signatures and ready PDFs must survive application bugs as well as
-- normal draft synchronization. No UPDATE/DELETE path for immutable records.
create function jobs_app.prevent_immutable_change() returns trigger language plpgsql as $$
begin raise exception 'Immutable submitted content cannot be changed'; end;
$$;
create trigger immutable_revision before update or delete on jobs_app.log_revisions
for each row execute function jobs_app.prevent_immutable_change();
create trigger immutable_signature before update or delete on jobs_app.signature_assets
for each row execute function jobs_app.prevent_immutable_change();
create function jobs_app.protect_ready_document() returns trigger language plpgsql as $$
begin
  if old.state='ready' then raise exception 'Ready document cannot be changed'; end if;
  return new;
end;
$$;
create trigger immutable_document before update or delete on jobs_app.document_artifacts
for each row execute function jobs_app.protect_ready_document();
