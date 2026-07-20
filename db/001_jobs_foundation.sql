do $$
begin
  if to_regclass('public.app_users') is null
    or to_regclass('public.app_auth_accounts') is null
    or to_regclass('public.app_sessions') is null
    or to_regclass('public.jobs') is null
    or to_regclass('public.equipment') is null
    or to_regclass('public.planner_assignments') is null then
    raise exception 'Required Substrata Ops Manager tables are missing. Apply Ops migrations first.';
  end if;
end $$;

create schema if not exists jobs_app;

create or replace function jobs_app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists jobs_app.catalogue_versions (
  version integer primary key,
  effective_from timestamptz not null,
  is_current boolean not null default false,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists catalogue_versions_one_current_idx
  on jobs_app.catalogue_versions (is_current)
  where is_current;

create table if not exists jobs_app.catalogue_items (
  id uuid primary key default gen_random_uuid(),
  catalogue_version integer not null references jobs_app.catalogue_versions(version) on delete restrict,
  catalogue_type text not null check (catalogue_type in ('activity', 'ancillary', 'material', 'service', 'measurement', 'subcontractor')),
  code text not null,
  label text not null,
  division text check (division in ('Water', 'Geotech', 'Shared') or division is null),
  unit text,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalogue_version, catalogue_type, code),
  check (code ~ '^[A-Z0-9][A-Z0-9_.-]*$')
);

create table if not exists jobs_app.devices (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  device_label text,
  platform text,
  app_version text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_sync_cursor text,
  metadata jsonb not null default '{}'::jsonb,
  unique (id, user_id)
);

create table if not exists jobs_app.sync_probes (
  id uuid primary key,
  device_id uuid not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  client_created_at timestamptz not null,
  server_received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  foreign key (device_id, user_id) references jobs_app.devices(id, user_id) on delete cascade
);

drop trigger if exists set_updated_at_catalogue_items on jobs_app.catalogue_items;
create trigger set_updated_at_catalogue_items
before update on jobs_app.catalogue_items
for each row execute function jobs_app.set_updated_at();

insert into jobs_app.catalogue_versions (version, effective_from, is_current)
values (1, '2026-07-20T00:00:00Z', true)
on conflict (version) do nothing;

insert into jobs_app.catalogue_items (
  catalogue_version, catalogue_type, code, label, division, unit, sort_order
)
values
  (1, 'activity', 'PRESTART', 'Pre-start and site setup', 'Shared', null, 10),
  (1, 'activity', 'PACKDOWN', 'Pack down and site tidy', 'Shared', null, 20),
  (1, 'activity', 'GT_ROTARY_SONIC', 'Rotary sonic drilling', 'Geotech', null, 100),
  (1, 'activity', 'GT_SPT', 'SPT and sampling', 'Geotech', null, 110),
  (1, 'activity', 'GT_INSTALL', 'Standpipe installation', 'Geotech', null, 120),
  (1, 'activity', 'WT_MUD_ROTARY', 'Mud rotary drilling', 'Water', null, 200),
  (1, 'activity', 'WT_CASING', 'Casing installation', 'Water', null, 210),
  (1, 'activity', 'WT_DEVELOP', 'Air-lift development', 'Water', null, 220),
  (1, 'ancillary', 'ANC_WORKSHOP', 'Workshop', 'Shared', 'hour', 10),
  (1, 'ancillary', 'ANC_YARD', 'Yard duties', 'Shared', 'hour', 20),
  (1, 'ancillary', 'ANC_TRAVEL_NONJOB', 'Non-job travel', 'Shared', 'hour', 30),
  (1, 'ancillary', 'ANC_TRAINING', 'Training', 'Shared', 'hour', 40),
  (1, 'measurement', 'GT_SPT_TEST', 'SPT test', 'Geotech', 'each', 100),
  (1, 'material', 'GT_CEMENT', 'Cement grout', 'Geotech', 'bag', 110),
  (1, 'material', 'WT_CASING_STEEL_150', 'Steel casing 150 mm', 'Water', 'm', 200),
  (1, 'material', 'WT_WATER_DELIVERED', 'Water delivered', 'Water', 'L', 210)
on conflict (catalogue_version, catalogue_type, code) do nothing;
