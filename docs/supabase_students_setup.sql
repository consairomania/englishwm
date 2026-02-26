-- ============================================================
-- MIGRAȚIE: Tabelul `students` pentru persistența elevilor
-- Rulează o singură dată în Supabase → SQL Editor
-- URL: https://supabase.com/dashboard/project/rqtkfqyfujujfswgkoyi/sql/new
-- ============================================================

CREATE TABLE IF NOT EXISTS public.students (
  id         UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT         NOT NULL,
  level      TEXT         NOT NULL DEFAULT 'B1',
  xp         INTEGER      NOT NULL DEFAULT 0,
  skills     JSONB        NOT NULL DEFAULT '{"speaking":20,"grammar":15,"vocabulary":30}',
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- Activează Row Level Security
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Permite rolului anon să citească toți elevii
CREATE POLICY "anon select students"
  ON public.students FOR SELECT TO anon USING (true);

-- Permite rolului anon să adauge elevi noi
CREATE POLICY "anon insert students"
  ON public.students FOR INSERT TO anon WITH CHECK (true);

-- Permite rolului anon să actualizeze progresul (XP, skills)
CREATE POLICY "anon update students"
  ON public.students FOR UPDATE TO anon
  USING (true) WITH CHECK (true);

-- Permite rolului anon să șteargă elevi
CREATE POLICY "anon delete students"
  ON public.students FOR DELETE TO anon USING (true);
