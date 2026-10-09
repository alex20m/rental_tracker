-- A sale is one owner's own: their part of the apartment, what it cost them and
-- what they sold it for, which no other owner sees. 0007 stored the sale on the
-- apartment, as the whole apartment's, and the acquisition costs without an
-- owner.
--
-- sales: one row per owner per apartment, the owner's own purchase and sale.
--
-- acquisition_costs.user_id: whose cost it is. Nullable on purpose: the
-- deployment still serving while this runs inserts rows without it, and the new
-- code never reads a row that has none.
--
-- Existing data is carried over to the person who created the apartment, scaled
-- to their share (the old amounts were the whole apartment's). A cost whose
-- creator no longer owns the apartment belongs to no one and is dropped.
--
-- apartments.sale_date / sale_price / sale_costs are no longer read or written.
-- They stay until a later change, so the previous deployment still has them.

create table sales (
  apartment_id    uuid          not null references apartments (id) on delete cascade,
  user_id         text          not null,
  purchase_date   date,
  purchase_price  numeric(12,2) not null default 0 check (purchase_price >= 0),
  sale_date       date,
  sale_price      numeric(12,2) not null default 0 check (sale_price >= 0),
  sale_costs      numeric(12,2) not null default 0 check (sale_costs >= 0),
  primary key (apartment_id, user_id)
);

alter table acquisition_costs add column user_id text;

create index acquisition_costs_user_id_idx on acquisition_costs (apartment_id, user_id);

insert into sales (apartment_id, user_id, purchase_date, purchase_price, sale_date, sale_price, sale_costs)
select a.id, o.user_id, a.purchase_date,
       round(a.purchase_price * o.share_pct / 100, 2), a.sale_date,
       round(a.sale_price * o.share_pct / 100, 2), round(a.sale_costs * o.share_pct / 100, 2)
  from apartments a
  join apartment_owners o on o.apartment_id = a.id and o.user_id = a.created_by
 where a.sale_date is not null;

update acquisition_costs c
   set user_id = o.user_id,
       amount = greatest(round(c.amount * o.share_pct / 100, 2), 0.01)
  from apartments a
  join apartment_owners o on o.apartment_id = a.id and o.user_id = a.created_by
 where c.apartment_id = a.id and c.user_id is null;

delete from acquisition_costs where user_id is null;
