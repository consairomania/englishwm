'use server';

import { supabase } from '@/lib/supabase/client';
import type { SessionLog } from '@/types/database';

export async function saveSessionLog(data: {
  session_id: string;
  student_id: string;
  xp_earned: number;
  modules_used: string[];
  vocabulary_learned: { en: string; ro: string }[];
  tenses_practiced: string[];
  notes: string;
}): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const { error } = await supabase.from('session_logs').insert({
    session_id: data.session_id,
    student_id: data.student_id,
    date: today,
    xp_earned: data.xp_earned,
    modules_used: data.modules_used,
    vocabulary_learned: data.vocabulary_learned,
    tenses_practiced: data.tenses_practiced,
    notes: data.notes,
  });
  if (error) console.warn('[SessionLog] Eroare la salvare:', error.message);
}

export async function getSessionLogs(studentId: string): Promise<SessionLog[]> {
  const { data, error } = await supabase
    .from('session_logs')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.warn('[SessionLog] Eroare la fetch:', error.message);
    return [];
  }
  return (data ?? []) as SessionLog[];
}
