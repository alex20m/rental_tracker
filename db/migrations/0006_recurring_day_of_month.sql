-- The day of the month a recurring entry books on. Until now it was always the
-- 1st, which stays the default, so the deployment still serving while this runs
-- keeps working against the new schema. Capped at the 28th so that every month
-- has the day, February included.

alter table recurring_entries
  add column day_of_month smallint not null default 1 check (day_of_month between 1 and 28);
