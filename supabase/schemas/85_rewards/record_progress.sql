-- Hand-organized declarative schema (by domain). Edit freely — this file is the
-- canonical definition. Run `supabase db diff -f <name>` after editing to
-- produce the migration.
SET check_function_bodies = false;

CREATE FUNCTION public.record_progress(p_member uuid, p_measure text, p_delta bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_old bigint;
  v_new bigint;
  v_ms  public.milestones%ROWTYPE;
  v_mm_id bigint;
BEGIN
  -- Ensure the tally row exists, then lock it for the rest of the transaction so
  -- two concurrent sources counting the same measure can't both read the same
  -- `old` and pay a milestone twice.
  INSERT INTO public.member_progress (member_id, measure, tally)
  VALUES (p_member, p_measure, 0)
  ON CONFLICT (member_id, measure) DO NOTHING;

  SELECT tally INTO v_old
    FROM public.member_progress
   WHERE member_id = p_member AND measure = p_measure
     FOR UPDATE;

  v_new := v_old + p_delta;

  UPDATE public.member_progress
     SET tally = v_new, updated_at = now()
   WHERE member_id = p_member AND measure = p_measure;

  -- Milestones whose threshold falls in (old, new] and that this member hasn't
  -- already earned. The half-open interval is the one-shot guard: a later call
  -- that pushes the tally further never re-crosses a threshold already below old.
  FOR v_ms IN
    SELECT m.*
      FROM public.milestones m
     WHERE m.measure = p_measure
       AND m.is_active
       AND m.threshold > v_old
       AND m.threshold <= v_new
       AND NOT EXISTS (
         SELECT 1 FROM public.member_milestones mm
          WHERE mm.member_id = p_member AND mm.milestone_id = m.id
       )
     ORDER BY m.threshold
  LOOP
    -- The unique (member_id, milestone_id) makes the insert the durable one-shot
    -- guard even under a race; DO NOTHING + null RETURNING means a concurrent
    -- winner already paid, so this call skips apply_reward.
    INSERT INTO public.member_milestones (member_id, milestone_id)
    VALUES (p_member, v_ms.id)
    ON CONFLICT (member_id, milestone_id) DO NOTHING
    RETURNING id INTO v_mm_id;

    IF v_mm_id IS NOT NULL THEN
      PERFORM public.apply_reward(p_member, v_ms.rewards, v_mm_id);
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION public.record_progress(p_member uuid, p_measure text, p_delta bigint) OWNER TO postgres;


-- The reusable seam every future source calls; internal, never client-callable.
-- db diff emits no grants, so a new definer function lands EXECUTE-able by PUBLIC
-- unless revoked by hand.
REVOKE ALL ON FUNCTION public.record_progress(p_member uuid, p_measure text, p_delta bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_progress(p_member uuid, p_measure text, p_delta bigint) FROM anon;
REVOKE ALL ON FUNCTION public.record_progress(p_member uuid, p_measure text, p_delta bigint) FROM authenticated;
GRANT ALL ON FUNCTION public.record_progress(p_member uuid, p_measure text, p_delta bigint) TO service_role;
