-- Hand-organized declarative schema (by domain). Edit freely — this file is the
-- canonical definition. Run `supabase db diff -f <name>` after editing to
-- produce the migration.
SET check_function_bodies = false;

CREATE FUNCTION public.record_progress(p_member uuid, p_metric text, p_delta bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_old bigint;
  v_new bigint;
  v_ms  public.reward_milestones%ROWTYPE;
  v_mm_id bigint;
BEGIN
  -- Ensure the tally row exists, then lock it for the rest of the transaction so
  -- two concurrent sources counting the same metric can't both read the same
  -- `old` and pay a milestone twice.
  INSERT INTO public.member_tallies (member_id, metric, tally)
  VALUES (p_member, p_metric, 0)
  ON CONFLICT (member_id, metric) DO NOTHING;

  SELECT tally INTO v_old
    FROM public.member_tallies
   WHERE member_id = p_member AND metric = p_metric
     FOR UPDATE;

  v_new := v_old + p_delta;

  UPDATE public.member_tallies
     SET tally = v_new, updated_at = now()
   WHERE member_id = p_member AND metric = p_metric;

  -- Milestones whose threshold falls in (old, new] and that this member hasn't
  -- already earned. The half-open interval is the one-shot guard: a later call
  -- that pushes the tally further never re-crosses a threshold already below old.
  FOR v_ms IN
    SELECT m.*
      FROM public.reward_milestones m
     WHERE m.metric = p_metric
       AND m.is_active
       AND m.threshold > v_old
       AND m.threshold <= v_new
       AND NOT EXISTS (
         SELECT 1 FROM public.member_rewards mm
          WHERE mm.member_id = p_member AND mm.reward_milestone_id = m.id
       )
     ORDER BY m.threshold
  LOOP
    -- The unique (member_id, reward_milestone_id) makes the insert the durable
    -- one-shot guard even under a race; DO NOTHING + null RETURNING means a
    -- concurrent winner already paid, so this call skips apply_reward.
    INSERT INTO public.member_rewards (member_id, reward_milestone_id)
    VALUES (p_member, v_ms.id)
    ON CONFLICT (member_id, reward_milestone_id) DO NOTHING
    RETURNING id INTO v_mm_id;

    IF v_mm_id IS NOT NULL THEN
      PERFORM public.apply_reward(p_member, v_ms.rewards, v_mm_id);
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION public.record_progress(p_member uuid, p_metric text, p_delta bigint) OWNER TO postgres;


-- The reusable seam every future source calls; internal, never client-callable.
-- db diff emits no grants, so a new definer function lands EXECUTE-able by PUBLIC
-- unless revoked by hand.
REVOKE ALL ON FUNCTION public.record_progress(p_member uuid, p_metric text, p_delta bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_progress(p_member uuid, p_metric text, p_delta bigint) FROM anon;
REVOKE ALL ON FUNCTION public.record_progress(p_member uuid, p_metric text, p_delta bigint) FROM authenticated;
GRANT ALL ON FUNCTION public.record_progress(p_member uuid, p_metric text, p_delta bigint) TO service_role;
