-- A photo kept with what an owner entered on the Sale page: one for each
-- acquisition cost (the receipt or invoice), and one for their own purchase
-- (the deed of sale). Like a cost's receipt, it is the proof the Tax
-- Administration can ask for when the sale is declared.
--
-- acquisition_photos goes with its acquisition cost, so it is gone whenever the
-- cost is — deleted, or erased with the owner who made it.
--
-- purchase_photos is keyed by owner, not by their sales row: that row is
-- removed whenever both the purchase and the sale are emptied, and a photo
-- saved before any price is typed still has to be kept. It goes with the
-- apartment; the application erases it with the owner.
--
-- Additive only, so the deployment still serving while this runs keeps working:
-- it never reads either table.

create table acquisition_photos (
  acquisition_id  uuid  primary key references acquisition_costs (id) on delete cascade,
  content_type    text  not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  data            bytea not null
);

create table purchase_photos (
  apartment_id  uuid  not null references apartments (id) on delete cascade,
  user_id       text  not null,
  content_type  text  not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  data          bytea not null,
  primary key (apartment_id, user_id)
);
