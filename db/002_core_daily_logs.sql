create table jobs_app.daily_logs (
  id uuid primary key,
  log_type text not null check (log_type in ('rig_shift', 'ancillary')),
  division text check (division in ('Water', 'Geotech') or division is null),
  assignment_id uuid references public.planner_assignments(id) on delete set null,
  job_id uuid references public.jobs(id) on delete restrict,
  job_number_snapshot text,
  job_snapshot jsonb,
  equipment_id uuid references public.equipment(id) on delete restrict,
  equipment_code_snapshot text,
  equipment_snapshot jsonb,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  owner_snapshot jsonb not null,
  shift_label text not null check (shift_label in ('day', 'night', 'morning', 'afternoon')),
  shift_started_at timestamptz not null,
  shift_ended_at timestamptz,
  timezone text not null default 'Pacific/Auckland' check (timezone = 'Pacific/Auckland'),
  status text not null default 'draft' check (status in ('draft', 'returned', 'reopened')),
  current_document_revision integer not null default 0,
  server_revision bigint not null default 0,
  carried_from_log_id uuid references jobs_app.daily_logs(id) on delete set null,
  client_acknowledgement jsonb not null default '{"status":"not_required"}'::jsonb,
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (
    (log_type = 'rig_shift' and job_id is not null and equipment_id is not null)
    or (log_type = 'ancillary' and job_id is null and equipment_id is null and division is null)
  ),
  check (shift_ended_at is null or shift_ended_at > shift_started_at)
);

create table jobs_app.log_points (
  id uuid primary key,
  daily_log_id uuid not null references jobs_app.daily_logs(id) on delete cascade,
  job_number text not null,
  point_id text not null,
  sequence integer not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  start_depth_m numeric(10,3),
  end_depth_m numeric(10,3),
  end_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (daily_log_id, sequence),
  check (ended_at is null or ended_at >= started_at),
  check (start_depth_m is null or start_depth_m >= 0),
  check (end_depth_m is null or end_depth_m >= 0),
  check (end_depth_m is null or start_depth_m is null or end_depth_m >= start_depth_m)
);

create table jobs_app.crew_attendance (
  id uuid primary key,
  daily_log_id uuid not null references jobs_app.daily_logs(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete restrict,
  employee_code_snapshot text,
  display_name_snapshot text not null,
  role_snapshot text,
  attended_from timestamptz not null,
  attended_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(display_name_snapshot)) > 0),
  check (attended_to is null or attended_to > attended_from)
);

create table jobs_app.activities (
  id uuid primary key,
  daily_log_id uuid not null references jobs_app.daily_logs(id) on delete cascade,
  point_segment_id uuid references jobs_app.log_points(id) on delete set null,
  sequence integer not null,
  activity_code text not null,
  activity_label_snapshot text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  allocation_type text not null check (allocation_type in ('job', 'ancillary')),
  allocation_job_id uuid references public.jobs(id) on delete restrict,
  allocation_job_number_snapshot text,
  ancillary_code text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (daily_log_id, sequence),
  check (ended_at is null or ended_at > started_at),
  check (
    (allocation_type = 'job' and allocation_job_id is not null and ancillary_code is null)
    or (allocation_type = 'ancillary' and allocation_job_id is null and ancillary_code is not null)
  )
);

create table jobs_app.log_items (
  id uuid primary key,
  daily_log_id uuid not null references jobs_app.daily_logs(id) on delete cascade,
  point_segment_id uuid references jobs_app.log_points(id) on delete set null,
  item_type text not null check (item_type in ('material', 'service', 'measurement', 'subcontractor')),
  item_code text not null,
  item_label_snapshot text not null,
  quantity numeric(14,3) not null check (quantity >= 0),
  unit text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table jobs_app.audit_events (
  id uuid primary key default gen_random_uuid(),
  daily_log_id uuid references jobs_app.daily_logs(id) on delete restrict,
  actor_user_id uuid references public.app_users(id) on delete set null,
  event_type text not null,
  material_change boolean not null default false,
  before_revision bigint,
  after_revision bigint,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id uuid,
  occurred_at timestamptz not null default now()
);

create table jobs_app.sync_mutations (
  mutation_id uuid primary key,
  batch_id uuid not null,
  device_id uuid not null,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null check (operation in ('upsert', 'delete_draft_child')),
  base_revision bigint not null,
  payload_hash text not null,
  result_status text not null check (result_status in ('applied', 'duplicate', 'conflict', 'rejected')),
  result_revision bigint,
  error_code text,
  result_message text,
  received_at timestamptz not null default now()
);

create index daily_logs_owner_shift_idx on jobs_app.daily_logs (owner_user_id, shift_started_at desc);
create index daily_logs_job_shift_idx on jobs_app.daily_logs (job_id, shift_started_at desc) where job_id is not null;
create index log_points_point_idx on jobs_app.log_points (job_number, point_id, started_at desc);
create index crew_attendance_user_idx on jobs_app.crew_attendance (user_id, attended_from) where user_id is not null;
create index activities_log_time_idx on jobs_app.activities (daily_log_id, started_at);
create index audit_events_log_time_idx on jobs_app.audit_events (daily_log_id, occurred_at);
create index sync_mutations_device_time_idx on jobs_app.sync_mutations (device_id, received_at, mutation_id);

create trigger set_updated_at_daily_logs before update on jobs_app.daily_logs
for each row execute function jobs_app.set_updated_at();
create trigger set_updated_at_log_points before update on jobs_app.log_points
for each row execute function jobs_app.set_updated_at();
create trigger set_updated_at_crew_attendance before update on jobs_app.crew_attendance
for each row execute function jobs_app.set_updated_at();
create trigger set_updated_at_activities before update on jobs_app.activities
for each row execute function jobs_app.set_updated_at();
create trigger set_updated_at_log_items before update on jobs_app.log_items
for each row execute function jobs_app.set_updated_at();
