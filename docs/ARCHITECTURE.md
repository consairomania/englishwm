# System Architecture
- **Source of Truth**: Supabase table `session_state`.
- **Sync Mechanism**: Postgres Changes (Realtime).
- **Navigation**: Controlled by the `current_view` column.
- **Master-Mirror**: Teacher writes to DB, Student listens to DB.