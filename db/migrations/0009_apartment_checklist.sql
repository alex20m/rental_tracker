-- One checklist per apartment, shared by all its owners: free text in which a
-- line written "- [ ] thing" or "- [x] thing" is a task that can be ticked.
--
-- It is kept as the text itself rather than as rows, so what an owner types is
-- exactly what every other owner reads, and ticking a task only flips the
-- brackets on its line.
--
-- Additive only, so the deployment still serving while this runs keeps working:
-- it never selects the new column, and the default fills it for rows it inserts.

alter table apartments
  add column checklist text not null default '' check (char_length(checklist) <= 20000);
