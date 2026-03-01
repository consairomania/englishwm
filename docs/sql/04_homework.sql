-- ============================================================
-- 04 — HOMEWORK ASSIGNMENTS
-- Temele async trimise de profesor elevilor (cod 6 caractere)
-- Sursa originală: Homework assignments table (Supabase)
-- ============================================================


-- ── Creare tabel ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.homework_assignments (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  code            TEXT        UNIQUE NOT NULL,
  student_id      UUID        REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id      TEXT        NOT NULL,
  exercises       JSONB       NOT NULL,
  modules         TEXT[]      NOT NULL,
  due_date        DATE,
  completed       BOOLEAN     DEFAULT FALSE,
  student_answers JSONB       DEFAULT '{}'::jsonb,
  xp_earned       INTEGER     DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);


-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.homework_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "homework_open"                     ON public.homework_assignments;
DROP POLICY IF EXISTS "Allow all for homework_assignments" ON public.homework_assignments;

CREATE POLICY "Allow all for homework_assignments"
  ON public.homework_assignments FOR ALL USING (true) WITH CHECK (true);
