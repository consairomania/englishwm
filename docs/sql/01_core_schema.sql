-- ============================================================
-- 01 — CORE SCHEMA
-- Tabele fundament: profiles, sessions, session_state, shared_loot
-- Sursa originală: Medea_Core_Schema + Medea_Security_Policies (Supabase)
-- ============================================================


-- ── Tabelul: profiles ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id          UUID        REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name   TEXT,
  role        TEXT        CHECK (role IN ('teacher', 'student')) DEFAULT 'student',
  avatar_url  TEXT,
  xp_total    INTEGER     DEFAULT 0,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ── Tabelul: sessions ────────────────────────────────────────────────────────
-- Notă: teacher_id și student_id sunt UUID-uri care referențiază profiles.
-- Aplicația curentă inserează sesiuni cu teacher_id = NULL (anon, fără auth).
-- UUID-ul sesiunii este generat determinist din room code (roomCodeToSessionId).

CREATE TABLE IF NOT EXISTS sessions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id  UUID        REFERENCES profiles(id),
  student_id  UUID        REFERENCES profiles(id),
  is_active   BOOLEAN     DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ── Tabelul: session_state ───────────────────────────────────────────────────
-- Inima sincronizării Master-Mirror. Profesorul scrie, elevii citesc via Realtime.

CREATE TABLE IF NOT EXISTS session_state (
  session_id    UUID    REFERENCES sessions(id) ON DELETE CASCADE PRIMARY KEY,
  current_view  TEXT    DEFAULT 'dashboard',
  exercise_data JSONB   DEFAULT '{}',
  teacher_pings JSONB   DEFAULT '[]',
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ── Tabelul: shared_loot ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shared_loot (
  id                    UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id            UUID    REFERENCES sessions(id) ON DELETE CASCADE,
  en_word               TEXT    NOT NULL,
  ro_word               TEXT,
  collected_by_student  BOOLEAN DEFAULT false,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ── Realtime ─────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE session_state;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;


-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_loot  ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- sessions — auth-based (pentru viitor, când se adaugă autentificare)
CREATE POLICY "Teachers can create sessions"
  ON sessions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher')
  );

CREATE POLICY "Participants can view their sessions"
  ON sessions FOR SELECT USING (
    auth.uid() = teacher_id OR auth.uid() = student_id
  );

-- sessions — acces anon (aplicația curentă, fără auth)
CREATE POLICY "anon can select sessions"
  ON sessions FOR SELECT TO anon USING (true);

CREATE POLICY "anon can insert sessions"
  ON sessions FOR INSERT TO anon WITH CHECK (true);

-- session_state — auth-based
CREATE POLICY "Session participants can view state"
  ON session_state FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE id = session_id
        AND (auth.uid() = teacher_id OR auth.uid() = student_id)
    )
  );

CREATE POLICY "Only teachers can update session state"
  ON session_state FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE id = session_id AND auth.uid() = teacher_id
    )
  );

-- session_state — acces anon
CREATE POLICY "anon can select session_state"
  ON session_state FOR SELECT TO anon USING (true);

CREATE POLICY "anon can insert session_state"
  ON session_state FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon can update session_state"
  ON session_state FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- shared_loot
CREATE POLICY "Participants can view loot"
  ON shared_loot FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE id = session_id
        AND (auth.uid() = teacher_id OR auth.uid() = student_id)
    )
  );

CREATE POLICY "Teachers can add loot"
  ON shared_loot FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE id = session_id AND auth.uid() = teacher_id
    )
  );
