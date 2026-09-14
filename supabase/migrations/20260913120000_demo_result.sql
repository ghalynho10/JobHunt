-- Spec 0021: the seeded demo results behind the public `/demo` page.
--
-- Twelve fixed rows, six per example profile, written here rather than fetched
-- or scored. Nothing on `/demo` costs an Adzuna call or an AI call (AC-2),
-- because every value it shows was prepared in advance and lives in this file.
--
-- THIS IS A MIGRATION AND NOT `supabase/seed.sql`, deliberately. That file
-- applies only on a local `db reset` and never on a hosted project, and the
-- whole point of this feature is a link somebody can be sent, which means the
-- rows have to exist in production.
--
-- NO FOREIGN KEY AND NO RELATIONSHIP TO ANY OTHER TABLE. This data belongs to
-- nobody, describes nobody, and is never joined to a real row.
--
-- THE STATEMENT ORDER BELOW IS THE CORRECTNESS, not a style, and it is the same
-- order `20260821120000_app_settings.sql` uses for the same reasons. Each block
-- says why it sits where it does.

create table public.demo_result (
  id uuid primary key default gen_random_uuid(),

  -- Exactly two example profiles, checked by the database rather than by
  -- convention. A third slug arriving here would render on a page whose
  -- switcher does not know it exists.
  persona_slug text not null check (
    persona_slug in ('backend-engineer', 'product-designer')
  ),

  -- THE TIEBREAK WITHIN ONE BAND, AND IT HAS TO BE A COLUMN. Every row in this
  -- table is inserted by this one migration, inside one transaction, so every
  -- `created_at` below shares a single `now()` and cannot order anything.
  sort_order smallint not null check (sort_order > 0),

  title text not null check (length(trim(title)) > 0),
  company_name text not null check (length(trim(company_name)) > 0),
  location text,

  -- A PLAIN STATED FIGURE, NEVER A PREDICTED ONE. `/search` has to tell those
  -- two apart because Adzuna predicts some of them (spec 0013 AC-7); here the
  -- distinction cannot arise, since nothing predicted anything. There is no
  -- currency column: every row would carry the same `USD`, so the read path
  -- passes it as a constant instead of storing twelve copies of it.
  salary_min integer check (salary_min > 0),
  salary_max integer check (salary_max > 0),
  check (salary_min is null or salary_max is null or salary_max >= salary_min),

  -- A GENUINELY TRUNCATED EXCERPT ON EVERY ROW, never a whole description, and
  -- this is load bearing rather than a style rule. The card reuses
  -- `SCORING_COPY.notMentionedCaption` verbatim ("This posting only shows part
  -- of the description, so this is not a confirmed gap."). On `/search` that
  -- sentence is true because Adzuna returns an excerpt of a real posting. Here
  -- the demo authors wrote the whole fake description themselves, so it is true
  -- only by construction, and a complete one would make the reused caption
  -- false on the one page whose entire premise is that nothing on it misleads.
  description_snippet text,

  -- The same five values `src/features/scoring/rubric.ts`'s `BANDS` declares,
  -- restated here because the database cannot import them. The read path parses
  -- this column against `BANDS` itself, so a drift between the two is caught at
  -- the boundary rather than rendered.
  band text not null check (
    band in (
      'strong_match',
      'good_match',
      'possible_match',
      'weak_match',
      'not_a_match'
    )
  ),

  matched_skills text[] not null default '{}',

  -- NAMED FOR THE PRODUCT'S OWN FIELD (`notMentionedSkills` in `rubric.ts`),
  -- never "missing". The two are different claims, and the whole reason the
  -- real card uses this wording is that an excerpt cannot prove a gap.
  not_mentioned_skills text[] not null default '{}',

  -- The same 600 character ceiling the real reasoning field carries.
  reasoning text not null check (
    length(trim(reasoning)) > 0 and length(reasoning) <= 600
  ),

  created_at timestamptz not null default now()
);

-- The read path always asks for one profile's rows in display order, so the
-- index carries the sort as well as the filter.
create index demo_result_persona_sort_idx
  on public.demo_result (persona_slug, sort_order);

comment on table public.demo_result is
  'Spec 0021: fixed, fabricated, already scored results for the public /demo page. Read by the secret key client only. Never written to after this migration.';

-- THE INSERT COMES BEFORE ROW LEVEL SECURITY IS FORCED, DELIBERATELY, and this
-- is `app_settings`'s reasoning applied unchanged: forced row level security
-- applies to the table owner too, and a table with policies forced and zero
-- policies denies an insert to any role that respects them. Whether the hosted
-- `postgres` role carries BYPASSRLS is not something this repository can
-- confirm, so a migration that forced first and inserted second could pass
-- locally and be refused on its first application to a hosted project.
--
-- TWO POSTINGS APPEAR UNDER BOTH PROFILES ON PURPOSE (AC-6): "Platform
-- Engineer" at "Fictional Fintech Co" and "Founding Product Engineer" at
-- "Faux Systems Inc". Same title, same company, same location, same salary,
-- same description, different band and different reasoning. That repetition is
-- the feature, not a duplicate to tidy away: it is the only thing on the page
-- that demonstrates the product's actual claim, which is that the score depends
-- on the person rather than on the posting.
--
-- EVERY COMPANY NAME READS AS FICTIONAL (AC-3). No real employer appears here.
insert into public.demo_result (
  persona_slug,
  sort_order,
  title,
  company_name,
  location,
  salary_min,
  salary_max,
  description_snippet,
  band,
  matched_skills,
  not_mentioned_skills,
  reasoning
) values

-- ---------------------------------------------------------------------------
-- backend-engineer: six rows spanning all five bands, `possible_match` twice.
-- ---------------------------------------------------------------------------

(
  'backend-engineer',
  1,
  'Platform Engineer',
  'Fictional Fintech Co',
  'Remote (US)',
  165000,
  195000,
  'Fictional Fintech Co is hiring a Platform Engineer to own the services our payments teams build on. You will work in Go against PostgreSQL, run workloads on Kubernetes, and manage the infrastructure underneath them in Terraform. The team is four engineers and owns its own on call rotation. We care more about how you reason through a failure than about…',
  'strong_match',
  '{"Go","PostgreSQL","Kubernetes","Terraform"}',
  '{"gRPC"}',
  'Backend engineer, this is about as clean a match as postings get: your Go, PostgreSQL, Kubernetes and Terraform experience covers everything this platform team lists as required. gRPC isn''t mentioned here, so there''s nothing to weigh it against, but nothing suggests it matters for this role.'
),
(
  'backend-engineer',
  2,
  'Senior Backend Engineer',
  'Imaginary Logistics Group',
  'Chicago, IL',
  150000,
  175000,
  'Imaginary Logistics Group runs the routing services behind several thousand deliveries a day, and we are adding a senior backend engineer to the team that owns them. The work is Go and PostgreSQL, exposed over REST APIs our partner integrations depend on, with a CI/CD pipeline you will help keep fast. We want somebody who has carried a service…',
  'good_match',
  '{"Go","PostgreSQL","REST APIs","CI/CD"}',
  '{"Kubernetes","gRPC"}',
  'Backend engineer, your Go and PostgreSQL work lines up directly with the routing services this team owns, and the posting''s emphasis on REST APIs and delivery pipelines covers ground you have already worked. The one stretch is the scale it describes, which is a step up from what your history shows, though nothing here reads as out of reach.'
),
(
  'backend-engineer',
  3,
  'Founding Product Engineer',
  'Faux Systems Inc',
  'Austin, TX',
  140000,
  null,
  'Faux Systems Inc is looking for a founding product engineer to build the first version of our scheduling product end to end. You will design the data model in PostgreSQL, write the application in TypeScript, own the CI/CD pipeline that ships it, and open Figma when a screen needs drawing before it is built. Design taste counts for as much here as…',
  'possible_match',
  '{"PostgreSQL","TypeScript","CI/CD"}',
  '{"Kubernetes","Terraform"}',
  'Backend engineer, this founding role wants someone comfortable across the stack, and your PostgreSQL, TypeScript and CI/CD experience covers real ground here. It reads more full stack than pure backend though, and your Kubernetes and Terraform depth isn''t mentioned as something this posting is looking for.'
),
(
  'backend-engineer',
  4,
  'Backend Engineer, Data Platform',
  'Notional Retail Partners',
  'Remote (US)',
  null,
  null,
  'Notional Retail Partners is building out the data platform every other team here reports from. The role covers ingestion from our store systems, the Go services that move that data, and the PostgreSQL models the analytics team queries against. Experience with streaming ingestion is the part we most want to talk about, and we are happy to…',
  'possible_match',
  '{"Go","PostgreSQL"}',
  '{"Terraform","CI/CD"}',
  'Backend engineer, the Go and PostgreSQL experience you have carries into the ingestion work described here, but a real part of this role is the streaming and warehouse side, which your history does not cover. Applying would mean arguing that your database depth transfers rather than pointing at somewhere you have already done it.'
),
(
  'backend-engineer',
  5,
  'Site Reliability Engineer',
  'Placeholder Health Systems',
  'Boston, MA',
  158000,
  158000,
  'Placeholder Health Systems is hiring a site reliability engineer to hold the line on availability for our clinical scheduling platform. Day to day is incident response, observability, capacity planning, and the Kubernetes and Terraform work that supports all three. You will share an on call rotation with five others and own the postmortem process for…',
  'weak_match',
  '{"Kubernetes","Terraform"}',
  '{"Go","PostgreSQL"}',
  'Backend engineer, your Kubernetes and Terraform work is real overlap with the platform half of this role, but most of what the posting describes is incident response, observability and capacity planning rather than building services. That is a different day to day from the one your history shows.'
),
(
  'backend-engineer',
  6,
  'Enterprise Sales Engineer',
  'Invented Analytics Ltd',
  'New York, NY',
  null,
  210000,
  'Invented Analytics Ltd is looking for an enterprise sales engineer to sit between our account executives and the customers evaluating us. You will run technical demos, scope pilot deployments, and answer the security questionnaires that arrive with a six figure contract. A background close enough to engineering to be credible in the room matters, but this…',
  'not_a_match',
  '{}',
  '{"Go","PostgreSQL","Kubernetes"}',
  'Backend engineer, this is a customer facing sales role: the posting is about running demos, scoping pilots and closing enterprise contracts, and none of your Go, PostgreSQL or Kubernetes work appears anywhere in what it asks for. There is no real overlap here to build a case on.'
),

-- ---------------------------------------------------------------------------
-- product-designer: six rows spanning all five bands, `possible_match` twice.
-- The two shared postings repeat verbatim except for the judgment (AC-6).
-- ---------------------------------------------------------------------------

(
  'product-designer',
  1,
  'Senior Product Designer',
  'Fabricated Software Studio',
  'Remote (US)',
  145000,
  170000,
  'Fabricated Software Studio is hiring a senior product designer to own the design systems work behind our whole product surface. You will be in Figma every day, take ideas from a rough prototyping stage through to shipped screens, and set the patterns three other designers build on. We work in short cycles and expect a designer to sit with the…',
  'strong_match',
  '{"Figma","design systems","prototyping"}',
  '{"user research"}',
  'Product designer, this is about as clean a match as postings get: the design systems work, the Figma fluency and the prototyping this team asks for are all things your profile already covers. User research isn''t mentioned in what they published, so there''s nothing to weigh it against, but nothing here suggests it would count against you.'
),
(
  'product-designer',
  2,
  'Product Designer, Growth',
  'Hypothetical Media Co',
  'Los Angeles, CA',
  null,
  null,
  'Hypothetical Media Co is adding a product designer to the growth team. The work is fast: you will run user research to find where readers drop off, design the fix in Figma, and ship it behind an experiment the same week. Comfort reading a results dashboard and arguing for the next test matters as much as the craft, and we will expect you to…',
  'good_match',
  '{"Figma","user research"}',
  '{"design systems"}',
  'Product designer, the Figma work and the user research this growth team runs are both things you have done, and the posting''s focus on testing an idea in a week matches how your history reads. The stretch is the experimentation and metrics side, which is a real part of this role and not something your profile shows yet.'
),
(
  'product-designer',
  3,
  'Brand and Product Designer',
  'Make Believe Consumer Goods',
  'Portland, OR',
  110000,
  135000,
  'Make Believe Consumer Goods wants a designer who can hold both halves of our identity: the packaging and brand work that goes on a shelf, and the app our customers use once they get home. You will spend part of the week in Figma prototyping screens and part of it with the brand team. We are small and would rather hire somebody who…',
  'possible_match',
  '{"Figma","prototyping"}',
  '{"design systems","user research"}',
  'Product designer, the Figma and prototyping side of this role is squarely within what you have done, and there is real ground to stand on there. The other half is brand and packaging work, which your profile does not cover, so applying would mean arguing that your product craft transfers rather than pointing at it.'
),
(
  'product-designer',
  4,
  'UX Designer, Internal Tools',
  'Pretend Manufacturing Corp',
  'Detroit, MI',
  null,
  null,
  'Pretend Manufacturing Corp runs its plants on internal tools nobody has redesigned in a decade, and we want a UX designer to change that. You will spend real time on the factory floor doing user research, then work in Figma to rebuild the screens our operators stare at for eight hours a day. Density and speed matter more than polish here, and…',
  'possible_match',
  '{"user research","Figma"}',
  '{"design systems","prototyping"}',
  'Product designer, the user research and Figma work here overlaps with what you have done, and the posting''s interest in watching people work is a real part of your history. The rest is dense internal tooling for factory floor staff, which is a different kind of problem from the consumer work your profile shows.'
),
(
  'product-designer',
  5,
  'Founding Product Engineer',
  'Faux Systems Inc',
  'Austin, TX',
  140000,
  null,
  'Faux Systems Inc is looking for a founding product engineer to build the first version of our scheduling product end to end. You will design the data model in PostgreSQL, write the application in TypeScript, own the CI/CD pipeline that ships it, and open Figma when a screen needs drawing before it is built. Design taste counts for as much here as…',
  'weak_match',
  '{"Figma"}',
  '{"user research","design systems"}',
  'Product designer, this posting mentions design taste and product sense alongside heavy engineering ownership, and Figma is the one thing here that lines up with what you''ve listed. User research and design systems work aren''t mentioned, and most of what the posting asks for reads like engineering skills rather than design ones.'
),
(
  'product-designer',
  6,
  'Platform Engineer',
  'Fictional Fintech Co',
  'Remote (US)',
  165000,
  195000,
  'Fictional Fintech Co is hiring a Platform Engineer to own the services our payments teams build on. You will work in Go against PostgreSQL, run workloads on Kubernetes, and manage the infrastructure underneath them in Terraform. The team is four engineers and owns its own on call rotation. We care more about how you reason through a failure than about…',
  'not_a_match',
  '{}',
  '{"Figma","user research","design systems"}',
  'Product designer, this platform engineering role asks for infrastructure and backend skills that don''t appear anywhere in your profile, and it doesn''t mention Figma, user research, or design systems work at all. There''s no real overlap here to build a case on.'
);

-- The database is the guarantee, not a check in application code.
alter table public.demo_result enable row level security;

-- Policies apply to the table owner too, so a bug running as the owner cannot
-- quietly read or change these rows.
alter table public.demo_result force row level security;

-- NO POLICIES EXIST ON THIS TABLE, deliberately, the same shape `app_settings`
-- uses. Row level security on with no policy denies every action to every role
-- that respects policies, which is every role except one carrying BYPASSRLS.
--
-- THIS IS WHAT ACTUALLY SATISFIES AC-4. A visitor cannot corrupt `/demo` for
-- the next visitor because no write path exists for them to reach, not because
-- a check in the application happens to catch them.

-- Two independent gates, the same pattern `app_settings` uses. No grant to
-- `anon` and none to `authenticated`, so a query carrying a user's token is
-- refused at the privilege check before row level security is ever consulted.
--
-- Written even though this project does not expose a new table to the Data API
-- automatically, because "it holds nothing by default" is a setting somebody
-- can change later.
revoke all on public.demo_result from anon, authenticated;

-- THE ONE GRANT, AND IT IS LOAD BEARING.
--
-- BYPASSRLS bypasses policies but NOT table privileges. Those are two separate
-- checks in Postgres and only the first is bypassed, so the one intended reader
-- still has to be named here.
--
-- Without this grant the read is refused and `/demo` renders its failure state
-- (AC-12) on every request, in a deployed application, looking exactly as
-- designed. `select` only: nothing in this feature ever writes.
--
-- `service_role` is the role the secret key authenticates as, and the client
-- built with that key is constructible in exactly one file (binding rule 1).
grant select on public.demo_result to service_role;
