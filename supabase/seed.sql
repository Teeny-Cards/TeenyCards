-- =============================================================================
-- Local dev seed data — runs automatically after `supabase migrations up`
-- resets the local DB (see [db.seed] in supabase/config.toml).
--
-- Creates one member ("Cheesy") with two decks of dummy cards, so a fresh
-- local DB always has something to look at without manual setup.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Auth user. The create_member_on_new_user() trigger (see migration
--    20250124191125) creates the matching public.members row automatically.
-- -----------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'cheesy@example.com',
  crypt('password', gen_salt('bf')),
  now(),
  jsonb_build_object('display_name', 'Cheesy'),
  now(),
  now(),
  '', '', '', ''
)
on conflict (id) do nothing;

-- Promote Cheesy to admin. The feedback board's roadmap-item seed migration
-- (20260715000004) skips itself on a fresh DB because no admin exists yet at
-- migration time — this also gives the feedback board something to moderate
-- locally.
update public.members set role = 'admin' where id = '00000000-0000-0000-0000-000000000001';

-- Pin the paid plan's test-mode Stripe price (the plans migration leaves it NULL).
update public.plans set stripe_price_id = 'price_1Tqwq7IuBoRqjURoOfra7y5M' where id = 'paid';

-- -----------------------------------------------------------------------------
-- Rewards catalogue. Measures are the countable things a source reports under;
-- milestones are retunable data (measure + threshold + paperclip payload). The
-- name is an i18n key placeholder, never English copy. Inserted as postgres —
-- both tables are catalogue-only (SELECT for authenticated, no client writes).
-- -----------------------------------------------------------------------------
insert into public.reward_measures (key) values
  ('study.cards_reviewed'),
  ('study.correct_answers'),
  ('study.sessions_completed')
on conflict (key) do nothing;

insert into public.milestones (measure, threshold, rewards, name_key) values
  ('study.cards_reviewed',    100,  '[{"kind":"paperclips","amount":50}]'::jsonb,   'rewards.milestone.cards-reviewed-100'),
  ('study.cards_reviewed',    500,  '[{"kind":"paperclips","amount":150}]'::jsonb,  'rewards.milestone.cards-reviewed-500'),
  ('study.cards_reviewed',    1000, '[{"kind":"paperclips","amount":300}]'::jsonb,  'rewards.milestone.cards-reviewed-1000'),
  ('study.cards_reviewed',    5000, '[{"kind":"paperclips","amount":1000}]'::jsonb, 'rewards.milestone.cards-reviewed-5000'),
  ('study.correct_answers',   50,   '[{"kind":"paperclips","amount":40}]'::jsonb,   'rewards.milestone.correct-answers-50'),
  ('study.correct_answers',   250,  '[{"kind":"paperclips","amount":120}]'::jsonb,  'rewards.milestone.correct-answers-250'),
  ('study.correct_answers',   1000, '[{"kind":"paperclips","amount":400}]'::jsonb,  'rewards.milestone.correct-answers-1000'),
  ('study.sessions_completed', 5,   '[{"kind":"paperclips","amount":30}]'::jsonb,   'rewards.milestone.sessions-completed-5'),
  ('study.sessions_completed', 25,  '[{"kind":"paperclips","amount":100}]'::jsonb,  'rewards.milestone.sessions-completed-25'),
  ('study.sessions_completed', 100, '[{"kind":"paperclips","amount":400}]'::jsonb,  'rewards.milestone.sessions-completed-100')
on conflict (measure, threshold) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Impersonate Cheesy so member_id / rank triggers and RLS policies behave
--    exactly as they would for a real authenticated request (same pattern as
--    tests.set_claims() in supabase/tests/00000_helpers.sql).
-- -----------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);

set local role = 'authenticated';

-- -----------------------------------------------------------------------------
-- 3. Decks
-- -----------------------------------------------------------------------------
insert into public.decks (title, description)
select 'Deck One', 'Dummy seed deck'
where not exists (
  select 1 from public.decks
  where title = 'Deck One' and member_id = '00000000-0000-0000-0000-000000000001'
);

insert into public.decks (title, description)
select 'Deck Two', 'Dummy seed deck'
where not exists (
  select 1 from public.decks
  where title = 'Deck Two' and member_id = '00000000-0000-0000-0000-000000000001'
);

-- -----------------------------------------------------------------------------
-- 4. Cards — plain inserts, the same shape the FE now writes. Ranks are
--    fractional-indexing keys computed by the client, so there is no RPC left
--    to route through; these are literal keys in the package's canonical form
--    (see the rank migration for the anatomy of 'a0' + digits + '1').
--    member_id still comes from the set_member_id trigger, and the per-deck cap
--    still runs — as a statement trigger over the whole batch.
-- -----------------------------------------------------------------------------
insert into public.cards (deck_id, rank, front_text, back_text)
select
  (select id from public.decks
    where title = 'Deck One' and member_id = '00000000-0000-0000-0000-000000000001'),
  'a0' || lpad(i::text, 6, '0') || '1',
  'Card ' || i || ' front',
  'Card ' || i || ' back'
from generate_series(1, 500) i
where not exists (
  select 1 from public.cards c
  join public.decks d on d.id = c.deck_id
  where d.title = 'Deck One' and d.member_id = '00000000-0000-0000-0000-000000000001'
);

insert into public.cards (deck_id, rank, front_text, back_text)
select
  (select id from public.decks
    where title = 'Deck Two' and member_id = '00000000-0000-0000-0000-000000000001'),
  'a0' || lpad(i::text, 6, '0') || '1',
  'Card ' || i || ' front',
  'Card ' || i || ' back'
from generate_series(1, 200) i
where not exists (
  select 1 from public.cards c
  join public.decks d on d.id = c.deck_id
  where d.title = 'Deck Two' and d.member_id = '00000000-0000-0000-0000-000000000001'
);

-- -----------------------------------------------------------------------------
-- 5. Feedback board roadmap items — same seed list as migration
--    20260715000004, which skips itself when no admin exists yet.
-- -----------------------------------------------------------------------------
insert into public.feedback_items (title, body, type, status, visibility)
select title, body, type, 'accepted', 'public'
from (values
  (
    'Import & Export Decks',
    'Import/export support for common flashcard formats so switching tools doesn''t mean losing your decks.',
    'idea'::feedback_type
  ),
  (
    'Card Audio Upload',
    'Add sound to your cards — perfect for language decks, music theory, or anything that needs to be heard, not just read.',
    'idea'::feedback_type
  ),
  (
    'Share Decks with the Community',
    'A community hub where members browse, save, and study each other''s public decks.',
    'idea'::feedback_type
  ),
  (
    'Challenges',
    'Complete daily/weekly challenges to earn bonus rewards on top of normal study.',
    'idea'::feedback_type
  ),
  (
    'Collect Rewards for Everything You Do',
    'Rewards for both big milestones and small daily actions, so there''s always something to work toward.',
    'idea'::feedback_type
  ),
  (
    'Paperclips & a Shop to Spend Them In',
    'Paperclips are the in-app currency — earn them, then spend on shop items.',
    'idea'::feedback_type
  )
) as seed(title, body, type)
where not exists (
  select 1 from public.feedback_items f where f.title = seed.title
);

set local role = 'postgres';
select set_config('request.jwt.claims', '', true);

commit;
