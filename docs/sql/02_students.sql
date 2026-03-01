-- ============================================================
-- 02 — STUDENTS
-- Tabelul elevilor cu toate coloanele (inclusiv migrații)
-- Sursa originală: Students table with RLS and open anon access
--               + Student age segment column
--               + Student Session & Homework Extensions (Supabase)
-- ============================================================


-- ── Creare tabel (setup fresh) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.students (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name         TEXT        NOT NULL,
  level        TEXT        NOT NULL DEFAULT 'B1',
  age_segment  TEXT        NOT NULL DEFAULT 'adult'
                           CHECK (age_segment IN ('child', 'teenager', 'adult')),
  xp           INTEGER     NOT NULL DEFAULT 0,
  skills       JSONB       NOT NULL DEFAULT '{"speaking":20,"grammar":15,"vocabulary":30}',
  vocabulary   JSONB                DEFAULT '[]'::jsonb,
  notes        TEXT                 DEFAULT '',
  created_at   TIMESTAMPTZ          DEFAULT NOW()
);


-- ── Migrație (dacă tabela exista deja fără coloanele noi) ────────────────────

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS age_segment TEXT NOT NULL DEFAULT 'adult';

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS vocabulary JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';


-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon select students" ON public.students;
DROP POLICY IF EXISTS "anon insert students" ON public.students;
DROP POLICY IF EXISTS "anon update students" ON public.students;
DROP POLICY IF EXISTS "anon delete students" ON public.students;

CREATE POLICY "anon select students"
  ON public.students FOR SELECT TO anon USING (true);

CREATE POLICY "anon insert students"
  ON public.students FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon update students"
  ON public.students FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon delete students"
  ON public.students FOR DELETE TO anon USING (true);
