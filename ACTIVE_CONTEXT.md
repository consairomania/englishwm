# ACTIVE_CONTEXT

## Ultima sesiune de lucru
Data: 2026-03-01

## Sistem Homework — Stare curentă

### Ce e implementat
- **Draft acumulativ**: buton TEMĂ în TeacherControlPanel adaugă exercițiul curent la `draft_homework.items` în `session_state.exercise_data` (max 10). Badge cu numărul curent pe buton.
- **Toast confirmare**: ambii (profesor + elev) văd toast verde "X adăugat! (N/10)" când un exercițiu este adăugat la draft (profesor imediat, elev via Realtime useEffect).
- **Pagina Teme** (`homework_portfolio` view): buton "Teme" lângă "Portofoliu elevi" în DashboardView → `changeView('homework_portfolio')` → ambii văd `HomeworkPortfolioView`
- **HomeworkPortfolioView (profesor)**: Draft curent (lista iteme + buton Trimite) + Lista teme trimise cu buton "Revizuiește cu elevul"
- **HomeworkPortfolioView (elev)**: "Profesorul construiește o temă: X exerciții" (dacă draft activ) + lista temelor proprii
- **Review comun**: profesor apasă "Revizuiește cu elevul" → `homework_review_data` scris în `session_state` → ambii văd `HomeworkReviewOverlay` (profesor are buton ✕ Închide)
- **Preview înainte de trimitere**: modal `showDraftPreview` listează itemele din draft
- **Trimitere**: `handleSendDraft` → `createHomework({ exercises: { items: [...] } })` → draft golit → `homeworkCode` modal cu codul

### Format nou exercises în DB
- **Nou**: `exercises: { items: DraftHomeworkItem[] }` (array de iteme cu tip, data, label)
- **Vechi** (backward compat în HomeworkReviewOverlay): `exercises: { puzzle_data, time_travel_data, ... }`

### Fișiere modificate
- `src/types/database.ts` — adăugat `DraftHomeworkItem`, `DraftHomework`, `homework_portfolio` în `current_view`
- `src/app/page.tsx` — toate modificările de mai sus

### State DashboardPage (homework-related)
- `homeworkCode` — codul temei create (modal confirmare)
- `homeworkSending` — loading trimitere
- `showDraftPreview` — modal preview înainte de trimitere
- `draftToast` — toast "X adăugat! (N/10)"
- `studentHomeworkList` — lista teme elev curent (încărcată la `homework_portfolio` view)
- `prevDraftLengthRef` — ref pentru detecție creștere draft (toast elev)

### Handlers
- `handleAddToDraft()` — adaugă exercițiul din view-ul curent la draft în session_state
- `handleRemoveDraftItem(idx)` — elimină un item din draft
- `handleSendDraft()` — trimite draft ca temă → golește draft → reîncarcă lista
- `handleReviewHomework(hw | null)` — scrie/șterge `homework_review_data` în session_state

### Limitare actuală
- Quest (`quest_data`) și Voyager nu sunt incluse în teme (structura lor e diferită)

### State DashboardPage (homework-related) — actualizat
- `reviewPage` — pagina curentă în HomeworkReviewOverlay (teacher-controlled)
- `handleReviewNavigate(p)` — profesor navighează la pagina p → scrie în session_state → elev urmărește
- `homework_review_data.page` — câmp adăugat în session_state pentru sincronizare pagină review

### Pagina /homework/[code] — suport format nou
- Format nou `{ items: DraftHomeworkItem[] }`: detectat cu `Array.isArray(ex.items)`
- Format vechi flat (`puzzle_data`, `time_travel_data` etc.): backward compat
- Ambele formate suportate în useEffect init, handleSubmit, și render

## Protecții nivel CEFR + Persistență teme random (2026-03-05)

### Problema 1 — Nivel CEFR protejat
- `updateStudentProgress` în `src/lib/studentService.ts` NU mai salvează XP în DB (parametru redenumit `_xp`, update trimite doar `{ skills }`). XP este per-sesiune.
- Codul JS nu a schimbat niciodată `student.level` (CEFR) automat. Cauza probabilă a schimbărilor observate: **trigger PostgreSQL în Supabase** care mapa XP→level.
- **ACȚIUNE MANUALĂ NECESARĂ**: mergi în Supabase Dashboard → Database → Triggers și verifică dacă există un trigger pe tabela `students` care actualizează `level` bazat pe `xp`. Dacă există, șterge-l.
- SQL diagnostic de rulat în Supabase SQL Editor:
  ```sql
  SELECT trigger_name, event_manipulation, action_statement
  FROM information_schema.triggers
  WHERE event_object_table = 'students';
  -- Dacă găsești un trigger care schimbă level, drop-uiește-l:
  -- DROP TRIGGER IF EXISTS <trigger_name> ON students;
  -- DROP FUNCTION IF EXISTS <function_name>();
  ```

### Problema 2 — Teme random persistente per elev
- `usedTopics` state în fiecare modul (Puzzle, Voyager, Quest, Dictation, Writing) este acum persistat în `localStorage`.
- Cheile folosite: `ewm_used_topics_{modul}_{student.dbId}`
- Inițializare lazy din localStorage la mount + useEffect care salvează la fiecare schimbare
- Reset automat la [] când toate temele au fost parcurse (comportament existent păstrat)

## Time Travel — Îmbunătățiri recente
- **Selector nr. exerciții**: profesorul poate alege 1–15 exerciții via input numeric (default 15); valoarea e transmisă la `generateTimeTravelContent(... count)` → prompt-ul Gemini generează exact N exerciții.
- **Regenerare item individual**: buton mic `RefreshCw` pe fiecare card (vizibil doar profesor) → `handleRegenerateItem(idx)` → `regenerateTimeTravelItem(sessionId, idx, ...)` în `gemini.ts` → înlocuiește itemul la indexul dat fără a afecta celelalte.
- `TT_SPECIAL_STRUCTURE_INSTRUCTIONS` extras ca modul-level constant în `gemini.ts` (reutilizat de ambele funcții).

## Bug-uri rezolvate
- Butonul TEMĂ nu funcționa: `localSession.exercise_data` era mereu gol; fix: `(liveState ?? localSession)?.exercise_data`
- Homework section eliminată din DashboardView (acum dedicată în HomeworkPortfolioView)
- Elev nu vedea exercițiile la coduri noi: render section folosea format vechi; fix: extracție duală
- Elev nu urmărea profesorul la pagina Teme: `isTeacher &&` eliminat din fetchStudentHomework useEffect
- Navigare review: Anterior/Următor dezactivate pentru elev; profesor sincronizează pagina via session_state
