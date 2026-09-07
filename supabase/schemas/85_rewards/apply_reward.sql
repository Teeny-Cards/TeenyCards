-- Hand-organized declarative schema (by domain). Edit freely — this file is the
-- canonical definition. Run `supabase db diff -f <name>` after editing to
-- produce the migration.
SET check_function_bodies = false;

CREATE FUNCTION public.apply_reward(p_member uuid, p_rewards jsonb, p_member_milestone bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_reward jsonb;
  v_kind   text;
BEGIN
  -- Walk the reward list and dispatch on kind. Each branch resolves its payload
  -- entry as a spec and persists the concrete outcome, so a future randomized
  -- reward computes its value here without any change upstream in record_progress
  -- — and editing a milestone's reward payload later never touches what an
  -- already-earned member was actually paid →[K:reward-payout-is-resolved-not-spec].
  FOR v_reward IN SELECT * FROM jsonb_array_elements(p_rewards)
  LOOP
    v_kind := v_reward ->> 'kind';

    IF v_kind = 'paperclips' THEN
      -- The ledger is the only place a balance lives; this insert is the sole
      -- writer. The resolved amount is what gets stored, never the spec.
      INSERT INTO public.paperclip_ledger (member_id, amount, member_milestone_id)
      VALUES (p_member, (v_reward ->> 'amount')::bigint, p_member_milestone);
    ELSE
      RAISE EXCEPTION 'Unknown reward kind: %', v_kind;
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION public.apply_reward(p_member uuid, p_rewards jsonb, p_member_milestone bigint) OWNER TO postgres;


-- Internal seam, never client-callable: db diff emits no grants, so a new
-- definer function lands EXECUTE-able by PUBLIC unless revoked by hand.
REVOKE ALL ON FUNCTION public.apply_reward(p_member uuid, p_rewards jsonb, p_member_milestone bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_reward(p_member uuid, p_rewards jsonb, p_member_milestone bigint) FROM anon;
REVOKE ALL ON FUNCTION public.apply_reward(p_member uuid, p_rewards jsonb, p_member_milestone bigint) FROM authenticated;
GRANT ALL ON FUNCTION public.apply_reward(p_member uuid, p_rewards jsonb, p_member_milestone bigint) TO service_role;
