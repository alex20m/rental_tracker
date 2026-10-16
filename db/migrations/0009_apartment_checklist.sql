-- One checklist per apartment, shared by all its owners: a list of items, each
-- of which can be ticked.
--
-- Kept as one text, a line per item marked "- [ ]" or "- [x]"; the app writes
-- and reads the marks, owners never see them (lib/domain/apartmentChecklist.ts).
--
-- Additive only, so the deployment still serving while this runs keeps working:
-- it never selects the new column, and the default fills it for rows it inserts.

alter table apartments
  add column checklist text not null default '' check (char_length(checklist) <= 20000);
