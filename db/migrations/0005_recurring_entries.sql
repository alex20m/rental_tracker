-- Costs and rent that book themselves every month.
--
-- An entry books on the 1st of each month from next_month on. The app books
-- what is due whenever an apartment is opened (there is no scheduler), and then
-- moves next_month past the current month. What was booked are ordinary rows in
-- costs and rents, so deleting an entry stops the booking and keeps the history.
--
-- Additive only, so the deployment still serving while this runs keeps working:
-- it never selects from the new table and never sets the new column.

create table recurring_entries (
  id            uuid          primary key default gen_random_uuid(),
  apartment_id  uuid          not null references apartments (id) on delete cascade,
  kind          text          not null check (kind in ('cost', 'rent')),
  category      text,
  description   text          not null default '',
  amount        numeric(12,2) not null check (amount > 0),
  next_month    text          not null check (next_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  created_at    timestamptz   not null default now(),
  check ((kind = 'cost') = (category is not null))
);

create index recurring_entries_apartment_id_idx on recurring_entries (apartment_id);

-- Rent is one entry per month per apartment, so it repeats as one entry too.
create unique index recurring_entries_one_rent on recurring_entries (apartment_id) where kind = 'rent';

-- Which entry booked a cost. A second request that books the same month at the
-- same moment hits this index instead of double-booking.
alter table costs add column recurring_id uuid references recurring_entries (id) on delete set null;

create unique index costs_recurring_month on costs (recurring_id, date) where recurring_id is not null;
