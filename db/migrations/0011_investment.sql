-- An owner's own view of the apartment as an investment: what they borrowed
-- for their part and what they think it is worth now, and their loan year by
-- year from the bank's annual statement. Personal, like `sales`: one owner's
-- rows are never shown to another. The loan's interest is not here; it is a
-- cost, logged with the apartment's other costs.
--
-- Both tables are new and nothing reads them yet, so the deployment still
-- serving while this runs is unaffected.

create table investments (
  apartment_id  uuid          not null references apartments (id) on delete cascade,
  user_id       text          not null,
  loan_amount   numeric(12,2) not null default 0 check (loan_amount >= 0),
  market_value  numeric(12,2) not null default 0 check (market_value >= 0),
  primary key (apartment_id, user_id)
);

create table loan_years (
  apartment_id  uuid          not null references apartments (id) on delete cascade,
  user_id       text          not null,
  year          integer       not null check (year between 1900 and 2100),
  amortization  numeric(12,2) not null default 0 check (amortization >= 0),
  balance       numeric(12,2) not null default 0 check (balance >= 0),
  primary key (apartment_id, user_id, year)
);
