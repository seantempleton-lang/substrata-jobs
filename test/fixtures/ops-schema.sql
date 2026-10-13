create extension if not exists pgcrypto;

create table public.app_users (
  id uuid primary key,
  employee_code text not null unique,
  full_name text not null,
  role_title text,
  app_role text not null,
  division text,
  region text,
  email text,
  login_username text not null unique,
  is_active boolean not null default true
);

create table public.app_auth_accounts (
  id uuid primary key,
  user_id uuid not null references public.app_users(id),
  login_email text not null unique,
  password_hash text not null,
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  last_failed_login_at timestamptz,
  last_login_at timestamptz,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.app_auth_accounts(id),
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.app_auth_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  account_id uuid,
  user_id uuid,
  session_id uuid,
  login_identifier text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key,
  name text not null
);

create table public.jobs (
  id uuid primary key,
  job_number text not null unique,
  title text not null,
  division text not null,
  site_name text,
  site_address text,
  client_id uuid references public.clients(id)
);

create table public.equipment (
  id uuid primary key,
  equipment_code text not null unique,
  name text not null,
  equipment_type text,
  division text
);

create table public.planner_assignments (
  id uuid primary key,
  assignment_type text not null,
  title text not null,
  start_date date not null,
  end_date date not null,
  personnel jsonb not null default '[]'::jsonb,
  equipment_id uuid not null references public.equipment(id),
  job_id uuid references public.jobs(id),
  updated_at timestamptz not null default now()
);

insert into public.app_users (
  id, employee_code, full_name, role_title, app_role, division, region, email, login_username
) values (
  '31eb28f2-0bf1-4cee-813c-075f0436b5e7', 'ST001', 'Local Test Driller', 'Driller',
  'FieldUser', 'Geotech', 'North', 'local.driller@example.test', 'localdriller'
);

insert into public.app_auth_accounts (id, user_id, login_email, password_hash)
values (
  'aaf1cf44-d899-4c2a-b89f-45da31791e29',
  '31eb28f2-0bf1-4cee-813c-075f0436b5e7',
  'local.driller@example.test',
  'scrypt$local-docker-test$bfc0a3d5d7a5348ce6d7a5beef17571ef275f46272d122e2dfd507b8e8ac4aa42ef95134637c8c528c7a893a9525050d19972931fc0e6ba761402b4020a0330b'
);

insert into public.clients (id, name)
values ('fbda6c09-e52d-4b51-b10c-e5cc5d55543f', 'Local Test Client');

insert into public.jobs (id, job_number, title, division, site_name, site_address, client_id)
values (
  '8954b2f8-484a-4521-a34f-f79368c86d4b', '302670', 'Local integration job', 'Geotech',
  'Docker test site', 'Auckland', 'fbda6c09-e52d-4b51-b10c-e5cc5d55543f'
);

insert into public.equipment (id, equipment_code, name, equipment_type, division)
values (
  '2cdad674-37d3-4c02-a3f0-b18a810fa62f', 'N107', 'N107', 'Drill rig', 'Geotech'
);

insert into public.planner_assignments (
  id, assignment_type, title, start_date, end_date, personnel, equipment_id, job_id
) values (
  '6994af79-c56e-4c51-b7e9-32e548d6375e', 'job', 'Local integration assignment',
  current_date - 1, current_date + 13,
  '[{"userId":"31eb28f2-0bf1-4cee-813c-075f0436b5e7","employeeCode":"ST001","displayName":"Local Test Driller"}]'::jsonb,
  '2cdad674-37d3-4c02-a3f0-b18a810fa62f', '8954b2f8-484a-4521-a34f-f79368c86d4b'
);

insert into public.app_users(id,employee_code,full_name,role_title,app_role,division,region,email,login_username) values
('a44ebd89-2c88-4405-90ac-51d6e9893d01','LB001','Local Crew North','Assistant','FieldUser','Geotech','North','crew.north@example.test','localcrew'),
('a44ebd89-2c88-4405-90ac-51d6e9893d02','TR001','Local Crew South','Assistant','FieldUser','Water','South','crew.south@example.test','localsouth'),
('a44ebd89-2c88-4405-90ac-51d6e9893d03','SP001','Local Supervisor','Supervisor','Supervisor','Geotech','North','supervisor@example.test','localsupervisor');
insert into public.app_auth_accounts(id,user_id,login_email,password_hash)
select 'ad75f5f9-13fa-49bb-9b0e-52a65370b991','a44ebd89-2c88-4405-90ac-51d6e9893d03','supervisor@example.test',password_hash from public.app_auth_accounts limit 1;
update public.planner_assignments set personnel=personnel || '[{"userId":"a44ebd89-2c88-4405-90ac-51d6e9893d01","employeeCode":"LB001","displayName":"Local Crew North"}]'::jsonb;
insert into public.jobs(id,job_number,title,division,site_name) values('ae4ebd89-2c88-4405-90ac-51d6e9893d11','302684','Local Water job','Water','Water test site');
insert into public.equipment(id,equipment_code,name,equipment_type,division) values('ae4ebd89-2c88-4405-90ac-51d6e9893d12','W12','W12','Drill rig','Water');
insert into public.planner_assignments(id,assignment_type,title,start_date,end_date,personnel,equipment_id,job_id) values
('ae4ebd89-2c88-4405-90ac-51d6e9893d13','job','Local Water assignment',current_date-1,current_date+13,'["Local Crew South"]','ae4ebd89-2c88-4405-90ac-51d6e9893d12','ae4ebd89-2c88-4405-90ac-51d6e9893d11');
