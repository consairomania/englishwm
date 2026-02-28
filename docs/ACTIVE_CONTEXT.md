# ACTIVE_CONTEXT — English with Medéa App

## Status: Implementat complet — Modul Time Travel (Tense Arena)

---

## Flux complet aplicație

```
Landing
  ├── Profesor → TeacherLogin (Teachmed / Teachpas-0525)
  │     └── TeacherHome
  │           ├── Adaugă / Șterge elevi (INSERT / DELETE students)
  │           └── Selectează elev din dropdown → RoomSetup (cod 4 cifre)
  │                 └── Seeding → seedSession + linkStudentToSession → App (isTeacher=true)
  │
  └── Elev → StudentJoin (doar cod cameră)
        └── LoadingProfile → fetchSessionStudentId → getStudentById → App (isTeacher=false)
```

---

## Fișiere cheie

| Fișier | Rol |
|--------|-----|
| `src/app/page.tsx` | UI principal: toate ecranele, logica XP, auto-save |
| `src/hooks/useSyncSession.ts` | Realtime sync via Supabase Postgres Changes |
| `src/lib/supabase/client.ts` | Client Supabase (anon key) |
| `src/lib/seedSession.ts` | Seed sesiune, linkStudentToSession, fetchSessionStudentId |
| `src/lib/roomCode.ts` | Mapare deterministă cod 4 cifre ↔ UUID sesiune |
| `src/lib/studentService.ts` | CRUD elevi: getAllStudents, addStudent, deleteStudent, updateStudentProgress, getStudentById |
| `src/types/database.ts` | Tipuri TypeScript: SessionState, Student, DebugError, TimeTravelData |
| `src/components/FormattedLabel.tsx` | Component bilingv EN bold / RO italic |
| `src/components/features/TimeTravel.tsx` | Modul Time Travel — exerciții de timp verbal |
| `src/app/actions/gemini.ts` | Server Actions AI: Puzzle, Voyager, Quest, Time Travel |
| `docs/supabase_rls_fix.sql` | Politici RLS pentru sessions + session_state |
| `docs/supabase_students_setup.sql` | CREATE TABLE students + politici RLS |

---

## Migrații SQL necesare (rulează o singură dată în Supabase SQL Editor)

### 1. sessions + session_state RLS
→ `docs/supabase_rls_fix.sql`

### 2. Tabel students
→ `docs/supabase_students_setup.sql`

```sql
CREATE TABLE IF NOT EXISTS public.students (
  id         UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT         NOT NULL,
  level      TEXT         NOT NULL DEFAULT 'B1',
  xp         INTEGER      NOT NULL DEFAULT 0,
  skills     JSONB        NOT NULL DEFAULT '{"speaking":20,"grammar":15,"vocabulary":30}',
  created_at TIMESTAMPTZ  DEFAULT NOW()
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon select students" ON public.students FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert students" ON public.students FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update students" ON public.students FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete students" ON public.students FOR DELETE TO anon USING (true);
```

---

## Funcționalități implementate

### Autentificare
- Profesor: credențiale hardcodate (`Teachmed` / `Teachpas-0525`) — fără Supabase Auth
- Elev: doar codul camerei (4 cifre), fără alte date

### Teacher Home (ecran nou)
- Dropdown cu toți elevii din `students` table
- Formular "Elev Nou": nume + selector nivel CEFR (A1→C2) + buton Adaugă
- Listă completă cu buton Șterge per rând
- Buton "Deschide Camera" activ doar dacă un elev e selectat

### Sesiune & sincronizare
- Profesorul deschide camera cu un cod de 4 cifre
- `seedSession`: creează/verifică rândul în `sessions` + `session_state`
- `linkStudentToSession`: stochează `student_id` în `exercise_data` al `session_state`
- Elevul intră cu codul → `fetchSessionStudentId` → `getStudentById` → profil încărcat automat
- `useSyncSession`: Realtime Postgres Changes pe `session_state`
- Profesorul controlează `current_view` (dashboard/voyager/puzzle/arena) → elevii văd live

### Time Travel (Tense Arena)
- View ID: `tense_arena` în `SessionState.current_view`
- Profesor apasă butonul "TIME" din control panel → `changeView('tense_arena')` → auto-generare AI
- Gemini generează array de 3 obiecte `TimeTravelItem` (sentence_en cu ___, sentence_ro, options[4], correct_index)
- Rezultatul se salvează în `exercise_data.time_travel_data` via `mergeExerciseData`
- Elevul vede exercițiile via Realtime; alege dintr-un grid 2×2 de butoane
- Feedback instant: verde (corect) / roșu (greșit), blocat după selecție
- +50 XP per răspuns corect (acordat o singură dată per propoziție)
- Profesorul poate re-genera sau șterge din `TimeTravelView`

### Progres persistent
- XP și skills salvate în `students.xp` și `students.skills` (JSONB)
- Auto-save debounced 2 secunde la orice schimbare de XP/skills
- Salvare finală la logout

### Debug Panel (vizibil doar pentru profesor)
- Clasificare erori: RLS (42501/PGRST301) vs JSONB
- Badge "DB OK" când nu există erori

---

## Arhitectură Master-Mirror

```
Profesor (MASTER)
  → scrie current_view în Supabase session_state
  → scrie student_id în exercise_data

Elev (MIRROR)
  → citește current_view via Realtime
  → UI-ul se actualizează automat

Progres elev
  → se salvează în students table (XP + skills)
  → auto-save la 2s după ultima schimbare
```

---

## Variabile de mediu necesare

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Configurate în `.env.local` (nu se commitează).
