-- Spec 0002, AC-11: deliberately cannot apply. Proves the migration workflow
-- fails visibly on a broken migration rather than reporting success.
-- Removed once the failure is confirmed.
alter table public.does_not_exist add column deliberately_broken text;
