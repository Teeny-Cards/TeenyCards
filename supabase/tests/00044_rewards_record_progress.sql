-- =============================================================================
-- Rewards V1 generic core: record_progress + apply_reward contract
-- =============================================================================
-- Covers:
--   • crossing a milestone threshold earns it (member_milestones row written)
--   • one-shot guard — a second call past the same threshold pays nothing again
--   • the ledger entry's member_milestone_id links back to the earning row
--   • apply_reward persists the resolved numeric amount, never the spec payload
--   • apply_reward raises on an unknown reward kind
--   • an inactive milestone is never earned
-- =============================================================================

BEGIN;

SELECT plan(12);

-- ── Setup ─────────────────────────────────────────────────────────────────────

SELECT tests.create_user('44444444-4444-4444-4444-444444444444'::uuid, 'rewards_member');

-- Fresh measure + controlled milestones, isolated from the seeded catalogue.
INSERT INTO public.reward_measures (key) VALUES ('test.widgets_00044');

INSERT INTO public.milestones (id, measure, threshold, rewards, name_key, is_active) VALUES
  (900044, 'test.widgets_00044', 50, '[{"kind":"paperclips","amount":10}]'::jsonb, 'test.milestone-50', true),
  (900045, 'test.widgets_00044', 75, '[{"kind":"paperclips","amount":20}]'::jsonb, 'test.milestone-75-inactive', false);


-- ── Crossing detection + earned row ──────────────────────────────────────────

-- Test 1: a delta that pushes the tally past the threshold succeeds.
SELECT lives_ok(
  $$ SELECT public.record_progress('44444444-4444-4444-4444-444444444444'::uuid, 'test.widgets_00044', 60) $$,
  'record_progress crosses the 50 threshold on the first call'
);

-- Test 2: the earned member_milestones row exists for this member + milestone.
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.member_milestones
     WHERE member_id = '44444444-4444-4444-4444-444444444444'::uuid
       AND milestone_id = 900044
  ),
  'crossing the threshold writes a member_milestones row for that milestone'
);

-- Test 3: exactly one member_milestones row was written for the active milestone.
SELECT is(
  (SELECT count(*) FROM public.member_milestones
    WHERE member_id = '44444444-4444-4444-4444-444444444444'::uuid
      AND milestone_id = 900044)::int,
  1,
  'only one member_milestones row is written for the crossed milestone'
);


-- ── Ledger provenance ─────────────────────────────────────────────────────────

-- Test 4: a paperclip_ledger row exists whose member_milestone_id points back
-- at the member_milestones row that earned it.
SELECT is(
  (SELECT pl.member_milestone_id
     FROM public.paperclip_ledger pl
     JOIN public.member_milestones mm ON mm.id = pl.member_milestone_id
    WHERE mm.member_id = '44444444-4444-4444-4444-444444444444'::uuid
      AND mm.milestone_id = 900044),
  (SELECT id FROM public.member_milestones
    WHERE member_id = '44444444-4444-4444-4444-444444444444'::uuid
      AND milestone_id = 900044),
  'the ledger entry''s member_milestone_id references the earning member_milestones row'
);

-- Test 5: the ledger amount is the resolved numeric amount from the spec, not
-- the jsonb payload itself.
SELECT is(
  (SELECT pl.amount
     FROM public.paperclip_ledger pl
     JOIN public.member_milestones mm ON mm.id = pl.member_milestone_id
    WHERE mm.member_id = '44444444-4444-4444-4444-444444444444'::uuid
      AND mm.milestone_id = 900044),
  10::bigint,
  'apply_reward persists the resolved numeric amount from the reward spec'
);


-- ── One-shot guard ────────────────────────────────────────────────────────────

-- Test 6: a second call that stays past the same already-earned threshold
-- succeeds (no error) but pays nothing new.
SELECT lives_ok(
  $$ SELECT public.record_progress('44444444-4444-4444-4444-444444444444'::uuid, 'test.widgets_00044', 5) $$,
  'a second call past the same threshold does not raise'
);

-- Test 7: still exactly one member_milestones row for that milestone.
SELECT is(
  (SELECT count(*) FROM public.member_milestones
    WHERE member_id = '44444444-4444-4444-4444-444444444444'::uuid
      AND milestone_id = 900044)::int,
  1,
  'the one-shot guard prevents a second member_milestones row for the same milestone'
);

-- Test 8: still exactly one paperclip_ledger entry tied to that milestone.
SELECT is(
  (SELECT count(*)
     FROM public.paperclip_ledger pl
     JOIN public.member_milestones mm ON mm.id = pl.member_milestone_id
    WHERE mm.member_id = '44444444-4444-4444-4444-444444444444'::uuid
      AND mm.milestone_id = 900044)::int,
  1,
  'the one-shot guard prevents a second ledger payout for the same milestone'
);


-- ── Inactive milestone is never earned ────────────────────────────────────────

-- Test 9: pushing the tally past the inactive milestone's threshold (75) earns
-- nothing for it, even though the active 50-threshold sibling already fired.
SELECT lives_ok(
  $$ SELECT public.record_progress('44444444-4444-4444-4444-444444444444'::uuid, 'test.widgets_00044', 20) $$,
  'record_progress past the inactive milestone''s threshold does not raise'
);

SELECT is_empty(
  $$
    SELECT 1 FROM public.member_milestones
     WHERE member_id = '44444444-4444-4444-4444-444444444444'::uuid
       AND milestone_id = 900045
  $$,
  'an inactive milestone is never earned, even after its threshold is crossed'
);

SELECT is_empty(
  $$
    SELECT 1 FROM public.paperclip_ledger pl
     WHERE pl.member_milestone_id IN (
       SELECT id FROM public.member_milestones
        WHERE member_id = '44444444-4444-4444-4444-444444444444'::uuid
          AND milestone_id = 900045
     )
  $$,
  'an inactive milestone pays no ledger entry'
);


-- ── apply_reward: unknown reward kind ────────────────────────────────────────

-- Test 11: apply_reward raises on a reward spec of an unrecognized kind.
SELECT throws_ok(
  $$ SELECT public.apply_reward('44444444-4444-4444-4444-444444444444'::uuid, '[{"kind":"bogus"}]'::jsonb, NULL) $$,
  'Unknown reward kind: bogus',
  'apply_reward raises on an unrecognized reward kind'
);

SELECT * FROM finish();
ROLLBACK;
