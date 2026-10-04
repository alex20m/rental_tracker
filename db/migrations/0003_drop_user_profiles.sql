-- The name printed on the declaration now comes from the account (Neon Auth's
-- user name, required at sign-up), so the per-person profile table is retired.
-- Nothing reads or writes it: the code stopped referencing it in the previous
-- deploy, which is why this can drop it while that deployment is still serving.
-- Rolling back a deployment does not bring the table back.

drop table user_profiles;
