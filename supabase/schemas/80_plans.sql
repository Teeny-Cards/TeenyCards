-- Hand-organized declarative schema (by domain). Edit freely — this file is the
-- canonical definition. Run `supabase db diff -f <name>` after editing to
-- produce the migration.
--
-- `plans` outlived the retired shop: members.plan FKs to it, so it was lifted
-- out of the old 80_shop.sql when shop_items / shop_category / purchases were
-- dropped.
SET check_function_bodies = false;

CREATE TABLE public.plans (
    id text NOT NULL,
    stripe_price_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cards_per_deck_limit integer,
    deck_limit integer
);


ALTER TABLE public.plans OWNER TO postgres;


ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_stripe_price_id_key UNIQUE (stripe_price_id);


ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_plan_fkey FOREIGN KEY (plan) REFERENCES public.plans(id);


ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plans readable by authenticated users" ON public.plans FOR SELECT TO authenticated USING ((is_active = true));


GRANT ALL ON TABLE public.plans TO anon;
GRANT ALL ON TABLE public.plans TO authenticated;
GRANT ALL ON TABLE public.plans TO service_role;
