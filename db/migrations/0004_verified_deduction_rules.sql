-- Settings the verified rental income rules need (docs/finnish-rental-tax-rules.md).
--
-- purchase_costs: transfer tax, registration, agent and lawyer fees of the
-- purchase. The building's part adds to its cost, which is what depreciation
-- is calculated from.
--
-- building_kind: residential or office buildings depreciate at most 4 %, shops,
-- warehouses, factories and workshops 7 %.
--
-- depreciation_from_year: the first tax year the app calculates building
-- depreciation for, with depreciation_prior being what was deducted before it;
-- 0 means the year of the first rent logged. Depreciation now goes down year by
-- year with what is left, so the app needs to know where its own count begins.
-- A property that already deducts depreciation had entered "depreciated in
-- earlier years" as of now, so its count begins this year.
--
-- furnishing, room_class: a furnished flat can take the flat-rate deduction
-- (40 € a month for a studio, 60 € for a larger flat) instead of the furniture's
-- actual cost. 'actual' is what the app did until now.
--
-- below_market_rent: rent under the usual. Deductions may not exceed the rent
-- and loan interest is not deductible.
--
-- let_share_pct: the share of the home that is let; the costs of the whole home
-- count only by this much.
--
-- Everything is added with a default that keeps the old behaviour, so the
-- deployment still serving while this runs keeps working against the new schema.

alter table apartments
  add column purchase_costs         numeric(12,2) not null default 0 check (purchase_costs >= 0),
  add column building_kind          text          not null default 'residential' check (building_kind in ('residential', 'commercial')),
  add column depreciation_from_year smallint      not null default 0 check (depreciation_from_year = 0 or depreciation_from_year between 2000 and 2100),
  add column furnishing             text          not null default 'actual' check (furnishing in ('actual', 'flat')),
  add column room_class             text          not null default 'larger' check (room_class in ('studio', 'larger')),
  add column below_market_rent      boolean       not null default false,
  add column let_share_pct          numeric(5,2)  not null default 100 check (let_share_pct > 0 and let_share_pct <= 100);

update apartments
   set depreciation_from_year = extract(year from now())::int
 where property_type = 'property' and use_depreciation;
