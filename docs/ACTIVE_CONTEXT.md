🧠 ACTIVE_CONTEXT — English with Medea (Master-Mirror)
🎯 Status: Operational — 5 module-uri complet funcționale.

🛑 Agent Safety Protocols (CRITICAL)
Zero-Overwrite Rule: Do NOT perform massive refactors of src/app/page.tsx or src/hooks/useSyncSession.ts. Modify only specific functions or components.

JSONB Integrity: Before updating exercise_data, always perform a shallow merge (...exercise_data) to prevent deleting keys from other modules (e.g., student_id).

Bilingual Constraint: All UI text must use the FormattedLabel component (EN bold / RO italic).

Pre-Flight Check: Before writing code, read src/types/database.ts to align with the existing schema.

🏗️ Architecture & Data Flow
Master-Mirror Logic
Teacher (Master): Writes current_view and exercise_data to Supabase session_state.
Student (Mirror): Listens via useSyncSession.ts and reacts to state changes via Realtime.
Persistence: Student XP and skills auto-saved to the students table (debounced, 300ms).

JSONB Schema (exercise_data) — chei complete
{
  // ── Puzzle ──────────────────────────────────────────────────────────────────
  puzzle_data?: {
    sentence: string;
    sentence_ro: string;
    scrambled: string[];
    instruction_en: string;
    hint_en: string;
    hint_ro: string;
  } | null;
  student_puzzle_progress?: {
    selection: { word: string; idx: number }[];
    is_correct: boolean;
  } | null;
  puzzle_show_translation?: boolean;

  // ── Voyager ─────────────────────────────────────────────────────────────────
  voyager_data?: {
    image_url: string | null;
    image_path: string | null;       // Supabase Storage path (pentru cleanup)
    image_prompt: string;
    story_en: string;
    story_ro: string;
    vocabulary: { en: string; ro: string }[];  // Exact 5
    tasks: { en: string; ro: string }[];        // Exact 3
  } | null;
  student_voyager_tasks?: boolean[] | null;     // 3 task-uri completate

  // ── Quest (Arena) ───────────────────────────────────────────────────────────
  quest_data?: {
    title: string;
    mission_brief_en: string;
    mission_brief_ro: string;
    roleplay_setup_en: string;
    roleplay_setup_ro: string;
    vocabulary_to_use: string[];   // Exact 5 cuvinte
    boosters: { id: string; label: string; xp: number }[];  // Exact 4
  } | null;
  student_quest_boosters?: string[] | null;     // ID-urile boosterelor revendicate

  // ── Time Travel ─────────────────────────────────────────────────────────────
  time_travel_data?: {
    sentence_en: string;    // Cu ___ pentru blank-uri
    sentence_ro: string;    // Complet (fără blank)
    options: string[];      // Exact 4
    correct_index: number;  // 0–3
  }[] | null;               // Exact 15 itemi
  student_time_travel_answers?: {
    timeTravelKey?: string | null;
    lockedAnswers: (number | null)[];
    flashWrong: (number | null)[];
    wrongEventTs: number | null;
  } | null;

  // ── Sync student ─────────────────────────────────────────────────────────────
  student_xp?: number;
  student_skills?: { speaking: number; grammar: number; vocabulary: number };
  session_closed?: boolean;
}

📂 Key File Map
File                                      Role
src/app/page.tsx                          Main UI Engine & State Orchestration (monolitic)
src/hooks/useSyncSession.ts               Realtime Postgres Changes Subscription (NU refactoriza)
src/app/actions/gemini.ts                 Server Actions: Gemini 2.5 Flash + Imagen 4.0 Fast
src/components/features/TimeTravel.tsx    Modul Time Travel (fișier separat)
src/types/database.ts                     Tipuri partajate (Student, SessionState, TimeTravelData etc.)
src/components/FormattedLabel.tsx         Standard pentru text bilingv (EN bold / RO italic)
src/lib/roomCode.ts                       Cod de 4 cifre ↔ UUID sesiune

🛠️ Module Operaționale
| Modul        | view id      | exercise_data key(s)                              | XP                          |
|--------------|--------------|---------------------------------------------------|-----------------------------|
| Puzzle       | puzzle       | puzzle_data, student_puzzle_progress              | 200 (auto, student)         |
| Voyager      | voyager      | voyager_data, student_voyager_tasks               | 50/task (profesor acordă)   |
| Quest        | arena        | quest_data, student_quest_boosters                | 50–150/booster (profesor)   |
| Time Travel  | tense_arena  | time_travel_data, student_time_travel_answers     | 50/răspuns corect (auto)    |

📝 Vocabular (Cuvintele mele)
- `VocabWord[]` stocat în coloana `vocabulary` JSONB pe tabelul `students`
- Max 20 cuvinte (FIFO — cel mai vechi dispare când apare unul nou); enforced în `addVocabularyToStudent`
- `deleteVocabularyWord(studentId, wordEn)` — server action în gemini.ts care șterge un cuvânt din DB
- `handleDeleteVocabWord` în DashboardPage: update optimistic local + apel server action
- Secțiunea "Cuvintele mele" vizibilă atât pentru elev cât și pentru profesor în DashboardView
- Buton X per cuvânt (apare la hover) — disponibil dacă `onDeleteVocabWord` prop este pasat
- Teacher Home: titlu = "Teacher Home", avatar = poza profesorului (teacherPhoto URL)

📊 Categorii Time Travel (36 tense-uri/structuri în 7 categorii)
- Present Tenses (4): Present Simple, Continuous, Perfect, Perfect Continuous
- Past Tenses (4): Past Simple, Continuous, Perfect, Perfect Continuous
- Future Tenses (4): Future Simple (will), Continuous, Perfect, Perfect Continuous
- Conditionals (4): Type 0, First, Second, Third Conditional
- Modal Verbs (11): Should, Would, Can, Could, Used to, Have to, Need to, Must, May, Might, Modal + Present Perfect
- Passive Voice (6): Present/Past/Present Perfect/Future/Past Perfect/Present Continuous Passive
- Other Structures (3): Future in the Past, Had better, Stative Verbs

🎨 Age Segment (content adaptation)
- child (6–11): vocabular simplu, propoziții scurte, teme: Animals, Space, Superheroes etc.
- teenager (12–17): limbaj modern, teme: Social Media, Gaming, Music etc.
- adult (18+): vocabular sofisticat, teme: Work-Life Balance, AI, Travel etc.
