-- The deduction rules as vero.fi states them.
--
-- property_type: a share in a housing company (osakehuoneisto, form 7H) or a
-- property of one's own (kiinteistö, form 7K). Only a property's building is
-- depreciated; a share's purchase price never is. Every existing apartment is
-- a share — the only kind the app knew — so building depreciation stops
-- applying to them, which is the correction.
--
-- financing_charge_deductible: whether the housing company books the
-- financing charge as income. Only then is it deductible. Off keeps what the
-- app did until now.
--
-- depreciation_rate: 4 % of the remaining cost is the most a residential
-- building may be depreciated. 2.5 % was the old default and had no source, so
-- rows still at it move to 4.
--
-- costs: new categories, and spread_years for a basic improvement (1–10 years)
-- or for furniture over 1 200 € that lasts under three years (1).
--
-- Everything is added with a default, so the deployment still serving while
-- this runs keeps working against the new schema.

alter table apartments
  add column property_type text not null default 'share' check (property_type in ('share', 'property')),
  add column financing_charge_deductible boolean not null default false,
  alter column depreciation_rate set default 4;

update apartments set depreciation_rate = 4 where depreciation_rate = 2.5;

alter table costs drop constraint costs_category_check;
alter table costs
  add constraint costs_category_check check (category in (
    'maintenance_charge', 'water_charge', 'financing_charge', 'repairs', 'improvement', 'furniture',
    'loan_interest', 'insurance', 'brokerage', 'travel', 'utilities', 'property_tax', 'other')),
  add column spread_years smallint not null default 10 check (spread_years between 1 and 10);
