Always check the ACTIVE_CONTEXT.md file to ensure you don't break any of the application's functionality.
If you have any uncertainties, ask me for further clarification.
Always comunnicate in romanian language with the user.
Update ACTIVE_CONTEXT.md after important changes in the  application

## Supabase — Regulă obligatorie
Fișierele din docs/sql/ sunt sursa de adevăr pentru schema bazei de date:
- 01_core_schema.sql — profiles, sessions, session_state, shared_loot
- 02_students.sql    — students (toate coloanele + RLS)
- 03_session_logs.sql — session_logs + RLS
- 04_homework.sql    — homework_assignments + RLS
- 05_storage_policies.sql — bucket lesson-images

Orice modificare de schemă (tabel nou, coloană nouă, politică RLS nouă) trebuie reflectată OBLIGATORIU în fișierul SQL corespunzător din docs/sql/ ÎNAINTE sau SIMULTAN cu modificarea din cod. Anunță mereu modificările din sql care trebuie urcate manual în Supabase, dacă sunt parte din docs/sql.
Niciodată nu modifica schema Supabase fără să actualizezi și fișierul SQL din docs/sql/.