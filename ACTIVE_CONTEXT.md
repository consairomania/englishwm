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

## Bug-uri rezolvate
- Butonul TEMĂ nu funcționa: `localSession.exercise_data` era mereu gol; fix: `(liveState ?? localSession)?.exercise_data`
- Homework section eliminată din DashboardView (acum dedicată în HomeworkPortfolioView)
