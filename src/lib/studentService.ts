import { supabase } from './supabase/client';
import type { Student } from '@/types/database';

// ─── Citește toți elevii (sortați după data creării) ──────────────────────────
export async function getAllStudents(): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[students] getAllStudents error:', error.message);
    return [];
  }
  return (data ?? []).map(normalizeStudent);
}

// ─── Adaugă un elev nou ────────────────────────────────────────────────────────
export async function addStudent(
  name: string,
  level: string
): Promise<Student | null> {
  const { data, error } = await supabase
    .from('students')
    .insert({
      name: name.trim(),
      level,
      xp: 0,
      skills: { speaking: 20, grammar: 15, vocabulary: 30 },
    })
    .select('*')
    .single();

  if (error) {
    console.warn('[students] addStudent error:', error.message);
    return null;
  }
  return normalizeStudent(data);
}

// ─── Șterge un elev după ID ────────────────────────────────────────────────────
export async function deleteStudent(id: string): Promise<boolean> {
  const { error } = await supabase.from('students').delete().eq('id', id);
  if (error) {
    console.warn('[students] deleteStudent error:', error.message);
    return false;
  }
  return true;
}

// ─── Actualizează numele, nivelul și segmentul de vârstă al elevului ──────────
export async function updateStudentDetails(
  id: string,
  name: string,
  level: string,
  ageSegment: 'child' | 'teenager' | 'adult'
): Promise<boolean> {
  const { error } = await supabase
    .from('students')
    .update({ name: name.trim(), level, age_segment: ageSegment })
    .eq('id', id);
  if (error) {
    console.warn('[students] updateStudentDetails error:', error.message);
    return false;
  }
  return true;
}

// ─── Actualizează XP și skills după o sesiune ─────────────────────────────────
export async function updateStudentProgress(
  id: string,
  xp: number,
  skills: Student['skills']
): Promise<boolean> {
  const { error } = await supabase
    .from('students')
    .update({ xp, skills })
    .eq('id', id);

  if (error) {
    console.warn('[students] updateStudentProgress error:', error.message);
    return false;
  }
  return true;
}

// ─── Citește un elev după ID ──────────────────────────────────────────────────
export async function getStudentById(id: string): Promise<Student | null> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.warn('[students] getStudentById error:', error.message);
    return null;
  }
  return data ? normalizeStudent(data) : null;
}

// ─── Normalizare JSONB skills (fallback dacă DB-ul returnează null) ───────────
function normalizeStudent(raw: Record<string, unknown>): Student {
  const rawSkills = raw.skills as Record<string, unknown> | null;
  return {
    id: raw.id as string,
    name: raw.name as string,
    level: (raw.level as string) ?? 'B1',
    age_segment: (raw.age_segment as 'child' | 'teenager' | 'adult') ?? 'adult',
    xp: (raw.xp as number) ?? 0,
    skills: {
      speaking: (rawSkills?.speaking as number) ?? 20,
      grammar: (rawSkills?.grammar as number) ?? 15,
      vocabulary: (rawSkills?.vocabulary as number) ?? 30,
    },
    notes: (raw.notes as string) ?? '',
    vocabulary: Array.isArray(raw.vocabulary) ? raw.vocabulary : [],
    created_at: raw.created_at as string,
  };
}
