-- ============================================================
-- 03 — SESSION LOGS
-- Istoricul sesiunilor per elev (XP, module, vocabular, timpuri)
-- Sursa originală: Student Session & Homework Extensions (Supabase)
-- ============================================================


-- ── Creare tabel ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_logs (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id         TEXT        NOT NULL,
  student_id         UUID        REFERENCES public.students(id) ON DELETE SET NULL,
  date               DATE        NOT NULL DEFAULT CURRENT_DATE,
  xp_earned          INTEGER     DEFAULT 0,
  modules_used       TEXT[]      DEFAULT '{}',
  vocabulary_learned JSONB       DEFAULT '[]'::jsonb,
  tenses_practiced   TEXT[]      DEFAULT '{}',
  notes              TEXT        DEFAULT '',
  created_at         TIMESTAMPTZ DEFAULT NOW()
);


-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for session_logs" ON public.session_logs;

CREATE POLICY "Allow all for session_logs"
  ON public.session_logs FOR ALL USING (true) WITH CHECK (true);
