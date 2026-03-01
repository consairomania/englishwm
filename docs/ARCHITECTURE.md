# System Architecture — English with Medéa

## Core Pattern: Master-Mirror
- **Source of Truth**: Supabase table `session_state` (un rând per sesiune activă).
- **Sync Mechanism**: Postgres Changes (Realtime) — `useSyncSession.ts`.
- **Navigation**: Controlled by `current_view` column (`dashboard` | `puzzle` | `voyager` | `arena` | `tense_arena`).
- **Master (Teacher)**: Writes `current_view` + `exercise_data` to DB.
- **Mirror (Student)**: Reads and reacts to DB changes in real-time.

---

## Navigation Flow

### Teacher
Landing → Teacher Login (Supabase Auth) → Teacher Home (student CRUD) → Room Setup (cod 4 cifre) → App (bottom nav) → module-uri

### Student
Landing → Student Login (cod cameră) → App (pasiv, așteaptă profesorul) → module-uri

### Screen States (frontend only, nu în DB)
`restoring` → `landing` → `teacher-login` / `room-setup` → `app` → `session-ended`

---

## Teacher Home — Student Management
- **CRUD complet**: Add (name + level), Edit (name + level + age_segment), Delete (confirmare)
- **Câmpuri student în DB**: `id`, `name`, `level` (A1–C2), `age_segment` ('child'|'teenager'|'adult'), `xp`, `skills` {speaking, grammar, vocabulary}, `created_at`
- **Câmpuri locale computate**: `avatar` (emoji random), `avatarColor` (Tailwind class), `nextLevelXp` (fix 1000)

---

## Modules

### 1. Puzzle (view: `puzzle`)
- AI generează o propoziție engleză (max 12 cuvinte) + traducere română + cuvinte amestecate.
- Elevul reconstituie propoziția; **+200 XP auto** la primul răspuns corect.
- Profesorul poate afișa/ascunde traducerea română în timp real (`puzzle_show_translation`).
- **Server Actions**: `generatePuzzleContent`, `clearPuzzleContent`, `setPuzzleShowTranslation`

### 2. Voyager (view: `voyager`)
- AI generează poveste bilingvă (2–3 propoziții) + 5 perechi vocabular + 3 task-uri de vorbire.
- **Imagine**: Imagen 4.0 Fast → PNG stocat în Supabase Storage (bucket `lesson-images`).
- Profesorul acordă **+50 XP per task** completat de elev (manual, click pe buton).
- Imaginea veche se șterge automat la regenerare sau logout.
- **Server Actions**: `generateVoyagerContent`, `clearVoyagerContent`, `deleteVoyagerImage`

### 3. Quest (view: `arena`)
- AI generează misiune roleplay: titlu + briefing + setup + 5 cuvinte țintă + 4 boostere (50–150 XP fiecare).
- Profesorul acordă XP per booster când elevul îndeplinește obiectivul (click pe booster).
- **Server Actions**: `generateQuestContent`, `clearQuestContent`

### 4. Time Travel (view: `tense_arena`)
- AI generează 15 exerciții gramaticale (fill-in-the-blank, 4 opțiuni).
- Suportă 36 tense-uri/structuri organizate în 7 categorii (accordion dropdown).
- **+50 XP auto** per răspuns corect; elevul poate încerca de mai multe ori.
- Profesorul vede răspunsurile elevului live (badge puls albastru).
- Multi-blank support pentru forme compuse (e.g., "should have left", "was written").
- **Server Actions**: `generateTimeTravelContent`, `clearTimeTravelContent`

---

## AI Stack
| Model | Utilizare |
|-------|-----------|
| Gemini 2.5 Flash | Generare text pentru toate cele 4 module (JSON mode) |
| Imagen 4.0 Fast | Generare imagine pentru Voyager |

- **Temperature**: 0.85–0.9 (creativ dar stabil)
- **Response format**: `application/json` (structurat per modul)
- **Age adaptation**: Prompt-uri diferite per `child` / `teenager` / `adult`

---

## exercise_data JSONB (session_state)
Toate datele exercițiilor sunt stocate într-un singur câmp JSONB.
`mergeExerciseData(sessionId, patch)` face shallow-merge fără a suprascrie cheile altor module.

Chei active:
- `puzzle_data`, `student_puzzle_progress`, `puzzle_show_translation`
- `voyager_data` (include `image_url`, `image_path`, `story_en/ro`, `vocabulary`, `tasks`)
- `student_voyager_tasks` (boolean[3])
- `quest_data` (include `boosters[]`), `student_quest_boosters` (string[] de ID-uri)
- `time_travel_data` (TimeTravelItem[15]), `student_time_travel_answers`
- `student_xp`, `student_skills`, `session_closed`

---

## XP System
| Modul | Sumă | Cine acordă |
|-------|------|-------------|
| Puzzle | 200 XP (o singură dată) | Auto (student, primul răspuns corect) |
| Voyager | 50 XP × 3 task-uri = max 150 | Profesor (manual per task) |
| Quest | 50–150 XP × 4 boostere = max ~500 | Profesor (manual per booster) |
| Time Travel | 50 XP × 15 exerciții = max 750 | Auto (student, per răspuns corect) |

- **Level up**: 1000 XP per nivel (fix, fără scalare)
- **Sync**: Debounced 300ms → `students.xp` în Supabase
- **Toast**: Notificare vizuală 2s la câștig XP

---

## Sunet & UI Helpers
- **Sound**: success tone (XP câștigat), wrong buzz (răspuns greșit); toggle mute → `localStorage.ewm_sound_muted`
- **Debug Panel**: Erori DB vizibile (RLS 42501, JSONB parse) — colț dreapta-jos
- **FormattedLabel**: toate textele bilingve EN bold / RO italic — obligatoriu

## localStorage Keys
| Cheie | Conținut |
|-------|----------|
| `ewm_role` | 'teacher' \| 'student' |
| `ewm_room_code` | Codul camerei (e.g., "1234") |
| `ewm_student_db_id` | UUID student |
| `ewm_voyager_image_url` | URL imagine Voyager (cache) |
| `ewm_sound_muted` | 'true' \| 'false' |
