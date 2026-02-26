import { supabase } from './supabase/client';
import { roomCodeToSessionId } from './roomCode';
import type { SessionState, DebugError } from '@/types/database';

// ─── Parsare sigură JSONB ─────────────────────────────────────────────────────
function safeJsonb<T>(value: unknown, fallback: T): { value: T; error: DebugError | null } {
  if (value === null || value === undefined) {
    return {
      value: fallback,
      error: {
        source: 'jsonb/null',
        code: null,
        message: `Câmp JSONB null sau lipsă — folosim fallback: ${JSON.stringify(fallback)}`,
        isRls: false,
        isJsonb: true,
        timestamp: new Date().toISOString(),
      },
    };
  }
  if (typeof value === 'string') {
    try {
      return { value: JSON.parse(value) as T, error: null };
    } catch {
      return {
        value: fallback,
        error: {
          source: 'jsonb/parse',
          code: null,
          message: `Eroare parsare JSONB: "${value.slice(0, 80)}"`,
          isRls: false,
          isJsonb: true,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }
  return { value: value as T, error: null };
}

// ─── Clasificare eroare Supabase ──────────────────────────────────────────────
function classifyError(
  source: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  err: any
): DebugError {
  const msg: string = err?.message ?? String(err);
  const code: string | null = err?.code ?? null;
  const status: number = err?.status ?? err?.statusCode ?? 0;

  const isRls =
    status === 403 ||
    code === '42501' ||
    code === 'PGRST301' ||
    msg.toLowerCase().includes('row-level security') ||
    msg.toLowerCase().includes('permission denied');

  const isJsonb =
    msg.toLowerCase().includes('jsonb') ||
    msg.toLowerCase().includes('invalid input syntax for type json') ||
    msg.toLowerCase().includes('json');

  return {
    source,
    code,
    message: msg,
    isRls,
    isJsonb,
    timestamp: new Date().toISOString(),
  };
}

// ─── Tipul rezultat al seed-ului ──────────────────────────────────────────────
export type SeedResult = {
  sessionState: SessionState;
  errors: DebugError[];
};

const FALLBACK_STATE: SessionState = {
  session_id: '',
  current_view: 'dashboard',
  exercise_data: {},
  teacher_pings: [],
  updated_at: new Date().toISOString(),
};

// ─── Seed principal ───────────────────────────────────────────────────────────
// ─── Verifică dacă o cameră există deja în DB ─────────────────────────────────
// Returnează true dacă session_state conține rândul corespunzător codului.
export async function checkRoomExists(roomCode: string): Promise<boolean> {
  const sessionId = roomCodeToSessionId(roomCode);
  const { data, error } = await supabase
    .from('session_state')
    .select('session_id')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) {
    console.warn('[checkRoom] Eroare:', error.message);
    return false;
  }
  return data !== null;
}

export async function seedSession(sessionId: string): Promise<SeedResult> {
  const errors: DebugError[] = [];

  // ── Pasul 1: Verifică / creează rândul în tabelul `sessions`
  const { data: existingSession, error: sessionFetchErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionFetchErr) {
    errors.push(classifyError('sessions/fetch', sessionFetchErr));
  }

  if (!existingSession && !sessionFetchErr) {
    const { error: sessionInsertErr } = await supabase
      .from('sessions')
      .insert({ id: sessionId });

    if (sessionInsertErr) {
      errors.push(classifyError('sessions/insert', sessionInsertErr));
    }
  }

  // ── Pasul 2: Verifică / creează rândul în `session_state`
  const { data: existingState, error: stateFetchErr } = await supabase
    .from('session_state')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (stateFetchErr) {
    errors.push(classifyError('session_state/fetch', stateFetchErr));
  }

  if (existingState) {
    // Validăm câmpurile JSONB
    const { value: exerciseData, error: exErr } = safeJsonb(
      existingState.exercise_data,
      {}
    );
    const { value: teacherPings, error: pingsErr } = safeJsonb(
      existingState.teacher_pings,
      []
    );
    if (exErr) errors.push(exErr);
    if (pingsErr) errors.push(pingsErr);

    return {
      sessionState: {
        ...existingState,
        exercise_data: exerciseData,
        teacher_pings: teacherPings,
      } as SessionState,
      errors,
    };
  }

  // ── Pasul 3: Inserare session_state dacă lipsește
  const { data: inserted, error: stateInsertErr } = await supabase
    .from('session_state')
    .insert({
      session_id: sessionId,
      current_view: 'dashboard',
      exercise_data: {},
      teacher_pings: [],
    })
    .select('*')
    .single();

  if (stateInsertErr) {
    errors.push(classifyError('session_state/insert', stateInsertErr));
    // Returnăm fallback local — UI se afișează oricum
    return {
      sessionState: { ...FALLBACK_STATE, session_id: sessionId },
      errors,
    };
  }

  return {
    sessionState: inserted as SessionState,
    errors,
  };
}

// ─── Leagă un elev de sesiunea activă ─────────────────────────────────────────
// Stochează student_id în exercise_data al session_state
export async function linkStudentToSession(
  sessionId: string,
  studentId: string
): Promise<boolean> {
  // Citim exercise_data existent pentru a nu suprascrie alte câmpuri
  const { data: current, error: fetchErr } = await supabase
    .from('session_state')
    .select('exercise_data')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (fetchErr) {
    console.warn('[linkStudent] fetch error:', fetchErr.message);
    return false;
  }

  const existing =
    typeof current?.exercise_data === 'object' && current.exercise_data !== null
      ? (current.exercise_data as Record<string, unknown>)
      : {};

  const { error: updateErr } = await supabase
    .from('session_state')
    .update({ exercise_data: { ...existing, student_id: studentId } })
    .eq('session_id', sessionId);

  if (updateErr) {
    console.warn('[linkStudent] update error:', updateErr.message);
    return false;
  }
  return true;
}

// ─── Citește student_id din session_state ─────────────────────────────────────
export async function fetchSessionStudentId(
  sessionId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('session_state')
    .select('exercise_data')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) {
    console.warn('[fetchStudentId] error:', error.message);
    return null;
  }

  const ed = data?.exercise_data;
  if (!ed || typeof ed !== 'object') return null;
  return (ed as Record<string, unknown>).student_id as string | null;
}
