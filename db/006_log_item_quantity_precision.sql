-- The v1 aggregate accepts finite non-negative numbers without a 3dp limit.
-- Preserve the captured quantity in child rows as well as immutable snapshots.
alter table jobs_app.log_items alter column quantity type numeric;
