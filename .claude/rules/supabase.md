---
lastUpdated: 2026-04-16T23:13:06Z
paths:
  - 'supabase/**/*'
  - 'src/api/**/*'
---

# Supabase Conventions

**Scope: `supabase/` and `src/api/` — the database, its policies, and the edge functions.**

RLS gives multi-tenant isolation; complex reads go through PostgreSQL RPCs (e.g.
`get_member_decks_with_due_count`); a trigger mints the `members` row on signup. Deno edge functions
live one directory per function under `supabase/functions/`, alongside the shared `_shared/` helpers.

Local Supabase: API on 54321, PostgreSQL on 54322. Start with `supabase start`.

**Explain the SQL when asked.** Name the keywords the answer leans on (`using` vs `with check`,
`security definer`, `stable`, `$$` quoting, `::` casting) rather than assuming the idiom is
self-evident. Don't volunteer a lesson unprompted.

## Buckets in migrations, not config.toml

Provision storage buckets via SQL migrations. `[storage.buckets.X]` in `config.toml` requires `supabase seed buckets` which doesn't run on deploy — stage/prod will diverge.

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cards', 'cards', true, 10485760, ARRAY['image/png', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
```

## storage.objects RLS — always add SELECT

Gate on `auth.uid()::text = (storage.foldername(name))[1]` when paths start with `<member_id>/...`. **Always include a SELECT policy** when the client uploads: `supabase-js` upsert-upload emits `INSERT ... ON CONFLICT DO UPDATE`, which needs SELECT for the conflict check. Without it, every upload fails with "new row violates row-level security policy."

`auth.uid()` **does** resolve inside storage-api's SQL session, so gate per-member isolation on it. Avoid `NEW.owner::text = foldername[1]`: that's a _consistency_ check — the row's owner matches its own path, true regardless of caller — not isolation.

`storage.protect_delete` blocks direct `DELETE FROM storage.objects` regardless of RLS, so DELETE policies aren't pgTAP-testable. Verify DELETE behaviour through a real upload-replacement flow instead.

## Capability functions for authorization

Gate role/plan-based access through named capability functions, not inline `auth_role()`/`auth_plan()` checks. Mirrors `src/composables/can.ts`'s naming rule: name for the grant, not the role — `can_manage_members()`, never `is_admin()`.

- One SQL function per capability, `stable`, returns `boolean`, body combines `auth_role()`/`auth_plan()`.
- Colocate a new capability function in the migration of the feature that first needs it — don't pre-create capabilities for hypothetical future features.
- Every capability function needs `grant execute on function public.can_x() to authenticated` — required for edge functions to reach it via `rpc()`.
- RLS policies: `using (can_x())`. Edge functions: `requireCapability(req, 'can_x')` from `supabase/functions/_shared/require-capability.ts`.

## Table naming matches the existing convention

A new domain doesn't invent its own naming scheme; it follows the one already in the schema. Mirrors
the capability-function rule above: name for what the row is, not for the scheme a new domain feels
like starting.

- Name a new table bare-plural for a global entity (`cards`, `decks`), or `<domain>_<thing>` for a
  feature-scoped catalogue or definition (`feedback_items`, `shop_items`) — never a new prefix scheme
  invented for one domain.
- Reserve a `member_` prefix for a table that is genuinely per-member; carry per-member scoping on
  every other table through an FK instead of the name.
- Keep a table name to two words or fewer, and never a noun vague enough to leave what it holds
  unclear (`progress`, `state`).

## Declarative schemas — the default workflow

`supabase/schemas/` is the source of truth for all DDL (tables, views, functions, triggers, policies, grants). **Never hand-write DDL migrations.** To change schema:

1. Edit the object's file in `supabase/schemas/` — files are hand-organized by domain (single files like `20_members.sql`, or domain dirs like `30_decks/` whose `00_tables.sql` holds tables/policies/grants and each big RPC gets its own file, e.g. `30_decks/save_deck.sql`).
2. `supabase db diff -f <migration-name>` — generates the migration by diffing declared state against migration history.
3. Review the generated file, then `supabase migration up --local`.

Apply order is `schema_paths` in `config.toml` — new files must be added there. `scripts/dump-schemas` writes a raw type-bucketed snapshot of the local DB to git-ignored `supabase/.schema-snapshot/` for drift comparison; it never touches `supabase/schemas/`.

### `db diff` returning empty is necessary, not sufficient (→[K:proxy-pass-not-evidence])

It compares a subset of the catalog. Two blind spots have already shipped bugs:

- **Function grants** — emits none, so a new `SECURITY DEFINER` function lands executable by `anon`. Hand-write the `REVOKE`s.
- **View reloptions** — emits none. Any change forcing a view to be dropped and recreated resets `security_invoker`, and the generated `create or replace view` omits it; the view then runs as its owner and RLS stops applying per-caller.

Also untracked, so still hand-written: DML (storage bucket inserts, `cron.schedule`, vault secrets, seed rows), default privileges, comment changes.

**After any migration that recreates an object, diff the object itself** — `\d+`, `pg_class.reloptions`, `has_function_privilege` — rather than trusting the tool's summary. Both blind spots above are now guarded by pgTAP (`00042_view_security_invoker_guard`, `00043_definer_function_anon_grants`), which is where a new one belongs: a class-wide catalog assertion covers the object nobody has written yet.

**CREATE OR REPLACE FUNCTION only replaces an identical argument list** — a changed signature silently creates a second overload. The declarative flow generates the DROP for you; the pgTAP overload guard (`tests/00029`) fails CI if a duplicate slips through.

## Migration workflow

- **Migrations are an ordered log, not a set of facts.** The live value of any seeded/updated row is
  set by the _last_ migration that writes it — grep, sort by timestamp, and read to the end before
  quoting a value. Never assert a DB value (a plan limit, a default, a seeded row) from the first
  matching migration.
- `supabase migration up --local` immediately after writing — catches errors while the context is fresh. Never `supabase db reset`.
- **Editing a migration is fair game until it ships.** If it hasn't been deployed and hasn't merged to `master`, rewrite it in place — all-local work is free game. Once it's on `master` or deployed anywhere, it's immutable: write a new timestamped migration instead. Check with `supabase migration list --local` and `git log master -- <file>`.
- To rewrite an applied branch-local migration before PR: `supabase migration repair --status reverted --local <version>` → edit → `migration up --include-all`. Don't do this for anything already shipped.

## Views and function signatures

- `SELECT d.*` in a view is expanded at creation time. New table columns don't propagate — `DROP VIEW` + `CREATE VIEW` to pick them up.
- `CREATE OR REPLACE FUNCTION` can't change `RETURNS TABLE(...)` column names or types. Rename → `DROP` + `CREATE`.

## pgTAP

`BEGIN; SELECT plan(N); ... SELECT * FROM finish(); ROLLBACK;`. Use `tests.create_user()` + `tests.set_claims()` from `00000_helpers.sql`. Switch roles with `SET LOCAL role = 'authenticated' | 'postgres'` — re-set claims before each role switch.

"Bad plan. You planned N but ran M" means an earlier statement threw — scroll up for the actual error.

## Error codes crossing PostgREST

PostgREST reserves the **`PT` SQLSTATE class**: raising `PTxyz` makes it respond with **HTTP status `xyz`**. `PT001` therefore becomes status `001` — an invalid status that hangs the request and returns a garbled body rather than a clean error the client can branch on.

Raising a code the client matches on? Either pick a non-`PT` SQLSTATE, or use `PTxyz` with a **valid three-digit HTTP status**. The deck card-limit gate uses `PT402` (Payment Required, "upgrade your plan"), matched client-side in `useCardLimitGate`.

## `INSERT … RETURNING` re-checks the SELECT policy

`RETURNING` doesn't just check the INSERT policy's `WITH CHECK` — to hand the row back it also re-checks the table's **SELECT** policy against that new row, and fails with the _same_ generic message (`new row violates row-level security policy`), so the error can't tell you which policy broke.

This bites whenever a default puts the new row into a state its own SELECT policy hides — a `visibility` defaulting to `internal`, a pending/hidden status. Encode "you can always read the row you just created" explicitly (`OR member_id = auth.uid()`) rather than relying on the general visibility condition. If a `RETURNING` RPC starts throwing a bare RLS violation right after a default changed, check the SELECT policy first.

## Local dev

- **`pg_net` / `pg_cron` calling an edge function needs the kong hostname**, not loopback: the Vault `supabase_url` secret must be `http://supabase_kong_TaroFlash:8000`. From inside the DB container `127.0.0.1` is the database itself, and `host.docker.internal` resolves to IPv6, which never reaches the published IPv4 gateway. Prod and stage are fine — there the secret is the real project URL.

  ```sql
  select vault.update_secret((select id from vault.secrets where name='supabase_url'), 'http://supabase_kong_TaroFlash:8000');
  ```

  Persists across `supabase stop/start`; re-set after a reset. Inspect delivery with `select status_code, error_msg, content from net._http_response order by created desc limit 5;`

- **Start the stack under Doppler** — `doppler run -- supabase start` (or `pnpm dev`). `config.toml` reads secrets via `env(...)` placeholders sourced from Doppler; a bare `supabase start` doesn't fail, it passes the literal string `env(AUTH_EXTERNAL_GOOGLE_CLIENT_ID)` to GoTrue and Google rejects the OAuth popup with `invalid_client`. A `config.toml` change needs a restart to take effect.

## Spokes

- [`stripe-local-probing`](./supabase/stripe-local-probing.md) — Doppler secrets, the worktree bootstrap, and the probing traps
