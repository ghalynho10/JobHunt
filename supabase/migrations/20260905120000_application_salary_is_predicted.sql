-- Spec 0014 AC-6: whether a snapshotted salary was Adzuna's guess or the
-- employer's own statement.
--
-- WHY THIS COLUMN EXISTS AT ALL. Feature 11 already refuses to show a predicted
-- salary indistinguishably from a stated one (spec 0013 AC-7): the results list
-- labels it "(estimated)" and carries a separate Jobsworth attribution. Without
-- somewhere for that flag to land, the distinction died at the moment a user
-- applied, and every later screen reading `application` (feature 23's dashboard)
-- would have shown a guess as a stated fact. Three specs deferred this decision
-- to feature 12 (spec 0003 Follow-up line 275, spec 0013 Follow-up line 224, and
-- feature 12's own scope row); spec 0014 settles it here.
--
-- NULLABLE, AND THAT IS THE WHOLE DESIGN. Adzuna sends `salary_is_predicted` on
-- every advert, including ones quoting no pay at all, so writing the boolean
-- straight through would stamp `false` on rows with no salary. `false` there
-- reads as "this figure was stated rather than predicted", which is a claim
-- about a figure that does not exist. Three states are needed because the data
-- has three: predicted, stated, and nothing said. Null is the third.
--
-- SAFE TO RUN AGAINST A LIVE TABLE. Adding a nullable column with no default
-- rewrites nothing and takes only a brief lock. The table also holds no rows in
-- any environment today, since feature 12 is the first thing that writes one.

alter table public.application
  add column if not exists salary_is_predicted boolean;

comment on column public.application.salary_is_predicted is
  'Spec 0014 AC-6. True when the source predicted the pay rather than the employer stating it, false when stated, null when the source quoted no pay at all. Null is not "not predicted": it means the question does not arise.';

-- The pairing check, mirroring `application_salary_currency_paired` directly
-- above it in the table. Postgres has no `add constraint if not exists`, so the
-- guard is a `do` block, per the supabase-postgres-best-practices skill.
--
-- IT IS AN EQUALITY BETWEEN TWO NULL TESTS, not an `and` of two conditions.
-- That is what makes it refuse BOTH mistakes: a flag with no salary to describe,
-- and a salary with no flag saying where it came from. A one directional check
-- would let the second through, which is the direction that silently loses the
-- distinction this column was added for.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'application_predicted_pairing'
      and conrelid = 'public.application'::regclass
  ) then
    alter table public.application
      add constraint application_predicted_pairing
      check ((salary_min is null and salary_max is null) = (salary_is_predicted is null));
  end if;
end $$;
