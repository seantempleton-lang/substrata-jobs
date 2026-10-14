-- Daily-log observations only. Field remains the authority for bore/point
-- identity and technical modules; this does not change any Ops or Field table.
alter table jobs_app.log_points add column daily_details jsonb not null default '{}'::jsonb;
