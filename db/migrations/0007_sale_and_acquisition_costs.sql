-- Selling an apartment, and what it cost to acquire.
--
-- sale_date / sale_price / sale_costs: the sale being worked out, the whole
-- apartment's (every owner's part follows from the ownership shares). A null
-- sale_date means nothing is being sold.
--
-- acquisition_costs: what counts towards the cost of acquiring the apartment
-- besides its price and the purchase_costs already on the apartment — the
-- transfer tax, the agent's and other fees of the purchase, an inspection, a
-- basic improvement made while owned, a financing charge the housing company
-- booked as an investment. They are only read when the apartment is sold.
--
-- Additive only, so the deployment still serving while this runs keeps working:
-- it never selects from the new table and never sets the new columns.

alter table apartments
  add column sale_date  date,
  add column sale_price numeric(12,2) not null default 0 check (sale_price >= 0),
  add column sale_costs numeric(12,2) not null default 0 check (sale_costs >= 0);

create table acquisition_costs (
  id            uuid          primary key default gen_random_uuid(),
  apartment_id  uuid          not null references apartments (id) on delete cascade,
  date          date          not null,
  kind          text          not null check (kind in (
                  'transfer_tax', 'purchase_fees', 'inspection', 'improvement', 'funded_charge', 'other')),
  description   text          not null default '',
  amount        numeric(12,2) not null check (amount > 0),
  created_at    timestamptz   not null default now()
);

create index acquisition_costs_apartment_id_date_idx on acquisition_costs (apartment_id, date);
