-- The rental portfolio: apartments, who owns how much of each, and each
-- apartment's rent log, costs and receipt photos.
--
-- Access is per apartment, through apartment_owners: an owner sees every
-- apartment they have a row for and nothing else, so sharing one apartment
-- never exposes the rest of anyone's portfolio.
--
-- User ids are Neon Auth's (neon_auth schema), stored as text. There is no
-- foreign key into neon_auth: that schema is managed by Neon Auth, not by these
-- migrations, and it does not exist on a plain Postgres used for tests.

create table apartments (
  id                  uuid          primary key default gen_random_uuid(),
  name                text          not null,
  address             text          not null default '',
  housing_company     text          not null default '',
  purchase_date       date,
  purchase_price      numeric(12,2) not null default 0   check (purchase_price >= 0),
  building_share_pct  numeric(5,2)  not null default 100 check (building_share_pct between 0 and 100),
  depreciation_rate   numeric(5,2)  not null default 2.5 check (depreciation_rate between 0 and 100),
  depreciation_prior  numeric(12,2) not null default 0   check (depreciation_prior >= 0),
  use_depreciation    boolean       not null default false,
  monthly_rent        numeric(12,2) not null default 0   check (monthly_rent >= 0),
  created_by          text          not null,
  created_at          timestamptz   not null default now()
);

-- One row per owner per apartment. Shares across an apartment's owners and
-- its pending invites add up to 100; that is enforced by the application,
-- which changes them in single statements so the sum never goes through an
-- intermediate state another request could see.
create table apartment_owners (
  apartment_id  uuid          not null references apartments (id) on delete cascade,
  user_id       text          not null,
  -- For display only, captured when they joined. Identity is user_id.
  email         text          not null,
  share_pct     numeric(5,2)  not null check (share_pct between 0 and 100),
  joined_at     timestamptz   not null default now(),
  primary key (apartment_id, user_id)
);

create index apartment_owners_user_id_idx on apartment_owners (user_id);

-- Shared with an email address that has not signed in yet. Claimed — turned
-- into an apartment_owners row — the first time a user with that verified
-- email loads their portfolio.
create table apartment_invites (
  id            uuid          primary key default gen_random_uuid(),
  apartment_id  uuid          not null references apartments (id) on delete cascade,
  email         text          not null check (email = lower(email)),
  share_pct     numeric(5,2)  not null check (share_pct > 0 and share_pct <= 100),
  invited_by    text          not null,
  created_at    timestamptz   not null default now(),
  unique (apartment_id, email)
);

create index apartment_invites_email_idx on apartment_invites (email);

create table rents (
  apartment_id   uuid          not null references apartments (id) on delete cascade,
  month          text          not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status         text          not null check (status in ('paid', 'vacant', 'unpaid')),
  amount         numeric(12,2) not null default 0 check (amount >= 0),
  received_date  date,
  note           text          not null default '',
  primary key (apartment_id, month),
  check ((status = 'paid') = (received_date is not null))
);

create table costs (
  id            uuid          primary key default gen_random_uuid(),
  apartment_id  uuid          not null references apartments (id) on delete cascade,
  date          date          not null,
  category      text          not null check (category in (
                  'maintenance_charge', 'financing_charge', 'repairs', 'loan_interest',
                  'insurance', 'brokerage', 'utilities', 'other')),
  description   text          not null default '',
  amount        numeric(12,2) not null check (amount >= 0),
  created_at    timestamptz   not null default now()
);

create index costs_apartment_id_date_idx on costs (apartment_id, date);

create table receipts (
  cost_id       uuid  primary key references costs (id) on delete cascade,
  content_type  text  not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  data          bytea not null
);

-- Per person rather than per apartment: the name on their own declaration.
create table user_profiles (
  user_id        text        primary key,
  taxpayer_name  text        not null default '',
  updated_at     timestamptz not null default now()
);
