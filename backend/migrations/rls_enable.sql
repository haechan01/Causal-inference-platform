-- =============================================================================
-- Supabase Row-Level Security (RLS) Migration
-- =============================================================================
-- Context
-- -------
-- This application manages its own authentication (JWT via Flask-JWT-Extended)
-- and connects to Supabase through the *direct / pooler connection string*
-- (DATABASE_URL, port 5432 / 6543).  That connection uses the privileged
-- `postgres` or `service_role` database role, which BYPASSES RLS entirely.
-- The Flask backend therefore continues to work unchanged after enabling RLS.
--
-- What this migration fixes
-- -------------------------
-- Supabase's PostgREST layer exposes every table in the `public` schema
-- via its REST API.  Without RLS, any holder of an `anon` or `authenticated`
-- Supabase JWT (not the same as our app JWTs) could read or modify rows
-- directly through the REST API endpoint (https://<project>.supabase.co/rest).
-- Enabling RLS with a "deny-all" default (no policies added) closes that gap.
--
-- How to run
-- ----------
-- 1. Open the Supabase dashboard → SQL Editor.
-- 2. Paste this file and click "Run".
-- 3. Optionally verify with:
--      SELECT tablename, rowsecurity
--      FROM pg_tables
--      WHERE schemaname = 'public';
--    All listed tables should show rowsecurity = true.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1.  Enable RLS on every application table
--     Effect: all rows are *denied* by default for PostgREST roles (anon /
--     authenticated) unless an explicit GRANT + POLICY allows them.
--     The backend's direct-connection role is exempt and keeps full access.
-- ---------------------------------------------------------------------------

ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs    ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 2.  Revoke default public privileges
--     PostgREST inherits its table access from the `anon` and `authenticated`
--     roles.  Explicitly revoking prevents accidental access even if RLS
--     policies are added incorrectly later.
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.users            FROM anon, authenticated;
REVOKE ALL ON public.projects         FROM anon, authenticated;
REVOKE ALL ON public.datasets         FROM anon, authenticated;
REVOKE ALL ON public.analyses         FROM anon, authenticated;
REVOKE ALL ON public.project_datasets FROM anon, authenticated;
REVOKE ALL ON public.ai_usage_logs    FROM anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3.  (Optional / future) Per-row ownership policies
--
--     Uncomment and adapt these blocks ONLY if you later want to expose
--     data via Supabase Auth + PostgREST (e.g. a mobile client that calls
--     the Supabase REST endpoint directly).
--
--     Prerequisites:
--       a) Add a UUID column `auth_user_id uuid` to each table that
--          stores the Supabase auth.uid() of the owner.
--       b) GRANT SELECT / INSERT / UPDATE / DELETE back to `authenticated`.
--       c) Create the policies below.
--
-- ---------------------------------------------------------------------------

-- -- Allow authenticated users to read their own user row
-- CREATE POLICY "users: select own row"
--   ON public.users
--   FOR SELECT
--   TO authenticated
--   USING ( (SELECT auth.uid()) = auth_user_id );
--
-- -- Allow authenticated users to update their own user row
-- CREATE POLICY "users: update own row"
--   ON public.users
--   FOR UPDATE
--   TO authenticated
--   USING ( (SELECT auth.uid()) = auth_user_id )
--   WITH CHECK ( (SELECT auth.uid()) = auth_user_id );
--
-- -- Allow authenticated users to read their own projects
-- CREATE POLICY "projects: select own rows"
--   ON public.projects
--   FOR SELECT
--   TO authenticated
--   USING (
--     user_id = (
--       SELECT id FROM public.users
--       WHERE auth_user_id = (SELECT auth.uid())
--       LIMIT 1
--     )
--   );
--
-- -- (Repeat the pattern for datasets, analyses, etc.)


-- ---------------------------------------------------------------------------
-- 4.  Verify
-- ---------------------------------------------------------------------------

-- Run this after applying to confirm RLS is active on all tables:
--
-- SELECT tablename, rowsecurity
-- FROM   pg_tables
-- WHERE  schemaname = 'public'
-- ORDER  BY tablename;
