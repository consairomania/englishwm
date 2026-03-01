'use server';

import { supabase } from '@/lib/supabase/client';
import type { HomeworkAssignment } from '@/types/database';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0,O,1,I

function generateCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

export async function createHomework(data: {
  studentId: string;
  teacherId: string;
  exercises: Record<string, unknown>;
  modules: string[];
}): Promise<{ code: string }> {
  let code = generateCode();
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await supabase
      .from('homework_assignments')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    if (!existing) break;
    code = generateCode();
  }
  const { error } = await supabase.from('homework_assignments').insert({
    code,
    student_id: data.studentId,
    teacher_id: data.teacherId,
    exercises: data.exercises,
    modules: data.modules,
  });
  if (error) throw new Error('Nu s-a putut crea tema: ' + error.message);
  return { code };
}

export async function getHomework(code: string): Promise<HomeworkAssignment | null> {
  const { data, error } = await supabase
    .from('homework_assignments')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (error || !data) return null;
  return data as HomeworkAssignment;
}

export async function submitHomeworkAnswers(
  code: string,
  answers: Record<string, unknown>,
  xpEarned: number
): Promise<void> {
  const { error } = await supabase
    .from('homework_assignments')
    .update({
      completed: true,
      student_answers: answers,
      xp_earned: xpEarned,
      completed_at: new Date().toISOString(),
    })
    .eq('code', code.toUpperCase());
  if (error) throw new Error('Nu s-au putut salva răspunsurile: ' + error.message);
}

export async function getTeacherHomework(teacherId: string): Promise<HomeworkAssignment[]> {
  const { data, error } = await supabase
    .from('homework_assignments')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as HomeworkAssignment[];
}
