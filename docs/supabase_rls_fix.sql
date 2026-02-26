-- ============================================================
-- FIX RLS: Politici pentru rolul `anon`
-- Rulează acest script în Supabase → SQL Editor
-- URL: https://supabase.com/dashboard/project/rqtkfqyfujujfswgkoyi/sql
-- ============================================================

-- ── Tabelul: session_state ────────────────────────────────────

-- Permite oricui (anon) să citească starea sesiunii
CREATE POLICY "anon can select session_state"
ON public.session_state
FOR SELECT
TO anon
USING (true);

-- Permite oricui (anon) să creeze o sesiune nouă (seed auto)
CREATE POLICY "anon can insert session_state"
ON public.session_state
FOR INSERT
TO anon
WITH CHECK (true);

-- Permite oricui (anon) să schimbe view-ul (Teacher Control Panel)
CREATE POLICY "anon can update session_state"
ON public.session_state
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- ── Tabelul: sessions ─────────────────────────────────────────

-- Permite oricui (anon) să citească lista de sesiuni
CREATE POLICY "anon can select sessions"
ON public.sessions
FOR SELECT
TO anon
USING (true);

-- Permite oricui (anon) să creeze o sesiune nouă (seed auto)
CREATE POLICY "anon can insert sessions"
ON public.sessions
FOR INSERT
TO anon
WITH CHECK (true);
