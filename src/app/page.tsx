'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  Trophy,
  Image as ImageIcon,
  Sword,
  BookOpen,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Puzzle as PuzzleIcon,
  Target,
  Zap,
  AlertCircle,
  ShieldAlert,
  FileWarning,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lock,
  Hash,
  LogOut,
  DoorOpen,
  UserPlus,
  Trash2,
  WifiOff,
  RefreshCw,
  Sparkles,
  Send,
  Pencil,
  Check,
  X,
  Clock,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Shuffle,
  Users,
  Mic,
  PenLine,
  Star,
  ExternalLink,
  Copy,
  CheckCheck,
} from 'lucide-react';
import { useSyncSession } from '@/hooks/useSyncSession';
import { supabase } from '@/lib/supabase/client';
import {
  seedSession,
  checkRoomExists,
  linkStudentToSession,
  fetchSessionStudentId,
} from '@/lib/seedSession';
import { roomCodeToSessionId, generateRoomCode, isValidRoomCode } from '@/lib/roomCode';
import { playSuccessSound, playWrongSound, setSoundMuted } from '@/lib/sound';
import { FormattedLabel } from '@/components/FormattedLabel';
import { filterUncommonWords } from '@/lib/commonWords';
import { AGE_TOPICS } from '@/lib/ageTopics';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TimeTravelView, StudentTimeTravelAnswers } from '@/components/features/TimeTravel';
import {
  getAllStudents,
  addStudent as dbAddStudent,
  deleteStudent as dbDeleteStudent,
  updateStudentProgress,
  updateStudentDetails,
  getStudentById,
} from '@/lib/studentService';
import type { SessionState, DebugError, Student as DBStudent, PuzzleData, VoyagerData, QuestData, TimeTravelData, DictationData, StudentDictationAnswer, VocabWord, SessionLog, WritingData, WritingFeedback, StudentWritingAnswer } from '@/types/database';
import {
  generatePuzzleContent,
  clearPuzzleContent,
  setPuzzleShowTranslation,
  generateVoyagerContent,
  clearVoyagerContent,
  deleteVoyagerImage,
  generateQuestContent,
  clearQuestContent,
  updateStudentNotes,
  addVocabularyToStudent,
  generateDictationContent,
  clearDictationContent,
  evaluateDictationAnswer,
  generateWritingPrompt,
  clearWritingContent,
  evaluateWriting,
  deleteVocabularyWord,
} from '@/app/actions/gemini';
import { verifyTeacherCredentials } from '@/app/actions/auth';
import { saveSessionLog, getSessionLogs, getAllRecentSessionLogs } from '@/app/actions/sessionActions';
import { createHomework, getTeacherHomework, getStudentHomework, deleteHomework } from '@/app/actions/homework';
import type { HomeworkAssignment, DraftHomework, DraftHomeworkItem } from '@/types/database';

// ─── Constante ────────────────────────────────────────────────────────────────
const teacherPhoto =
  'https://drive.google.com/thumbnail?id=1Uhe13UjR4ihaMYvgNdBKay_sz2HB6hS4&sz=w1000';
const AVATARS = ['🦊', '🐱', '🐶', '🦁', '🐸', '🐼', '🐨', '🐯', '🦄', '🐲'];
const AVATAR_COLORS = [
  'bg-rose-500', 'bg-indigo-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-purple-500', 'bg-cyan-500',
];
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// ─── localStorage helpers ─────────────────────────────────────────────────────
const LS = {
  role: 'ewm_role',
  roomCode: 'ewm_room_code',
  studentDbId: 'ewm_student_db_id',
  voyagerImageUrl: 'ewm_voyager_image_url',
} as const;

function saveStoredSession(
  role: 'teacher' | 'student',
  roomCode: string,
  studentDbId: string
) {
  try {
    localStorage.setItem(LS.role, role);
    localStorage.setItem(LS.roomCode, roomCode);
    localStorage.setItem(LS.studentDbId, studentDbId);
  } catch { /* SSR / private browsing */ }
}

function loadStoredSession(): {
  role: 'teacher' | 'student' | null;
  roomCode: string | null;
  studentDbId: string | null;
} {
  try {
    return {
      role: localStorage.getItem(LS.role) as 'teacher' | 'student' | null,
      roomCode: localStorage.getItem(LS.roomCode),
      studentDbId: localStorage.getItem(LS.studentDbId),
    };
  } catch {
    return { role: null, roomCode: null, studentDbId: null };
  }
}

function clearStoredSession() {
  try {
    Object.values(LS).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// ─── Tipuri ───────────────────────────────────────────────────────────────────
type AppScreen =
  | 'landing'
  | 'teacher-login'
  | 'teacher-home'
  | 'room-setup'
  | 'seeding'
  | 'student-join'
  | 'loading-profile'
  | 'restoring'
  | 'app';

type Student = {
  dbId: string;
  name: string;
  level: string;
  age_segment: 'child' | 'teenager' | 'adult';
  xp: number;
  nextLevelXp: number;
  skills: { speaking: number; grammar: number; vocabulary: number };
  notes: string;
  vocabulary: VocabWord[];
  avatar: string;
  avatarColor: string;
};

function dbStudentToLocal(s: DBStudent): Student {
  const idx = s.id.charCodeAt(0) % AVATARS.length;
  const colorIdx = (s.id.charCodeAt(1) ?? 0) % AVATAR_COLORS.length;
  return {
    dbId: s.id,
    name: s.name,
    level: s.level,
    age_segment: s.age_segment ?? 'adult',
    xp: s.xp,
    nextLevelXp: 1000,
    skills: s.skills,
    notes: s.notes ?? '',
    vocabulary: s.vocabulary ?? [],
    avatar: AVATARS[idx],
    avatarColor: AVATAR_COLORS[colorIdx],
  };
}

// ─── Ecran de start ────────────────────────────────────────────────────────────
function Landing({ onTeacher, onStudent }: { onTeacher: () => void; onStudent: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen space-y-8 p-6 bg-[#F8FAFC]">
      <div className="text-center space-y-4">
        <div className="relative mx-auto w-28 h-28">
          <div className="w-28 h-28 rounded-full border-4 border-pink-600 p-0.5 shadow-2xl overflow-hidden bg-white">
            <img src={teacherPhoto} alt="Medéa" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div className="absolute inset-0 bg-pink-500/20 rounded-full blur-2xl scale-125 animate-pulse pointer-events-none" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-4xl font-black text-slate-800 tracking-tight italic uppercase">
            English with Medéa
        </h1>
          <p className="text-slate-500 font-bold text-sm tracking-widest uppercase">
            Creative Fluency Missions
          </p>
        </div>
      </div>
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={onTeacher}
          className="w-full bg-pink-600 hover:bg-pink-700 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl hover:shadow-pink-200 hover:-translate-y-0.5 active:translate-y-0"
        >
          <Lock size={18} /> Sunt Profesor
        </button>
        <button
          onClick={onStudent}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl hover:-translate-y-0.5 active:translate-y-0"
        >
          <Hash size={18} /> Sunt Elev
        </button>
      </div>
    </div>
  );
}

// ─── Login profesor ────────────────────────────────────────────────────────────
function TeacherLogin({ onSuccess, onBack }: { onSuccess: () => void; onBack: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    const ok = await verifyTeacherCredentials(username, password);
    if (ok) {
      onSuccess();
    } else {
      setError('Credențiale incorecte. Încearcă din nou.');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#F8FAFC]">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-pink-100 rounded-2xl flex items-center justify-center mx-auto">
            <Lock className="text-pink-600" size={28} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 italic uppercase tracking-tighter">
            Autentificare Profesor
          </h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            English with Medéa
          </p>
        </div>
        <div className="bg-white p-6 rounded-[28px] shadow-2xl border border-slate-50 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Utilizator</label>
            <input
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:border-pink-400 transition-all font-bold text-slate-700"
              placeholder="Username..."
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Parolă</label>
            <input
              type="password"
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:border-pink-400 transition-all font-bold text-slate-700"
              placeholder="••••••••"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl px-4 py-2.5">
              <AlertCircle size={14} className="shrink-0" />
              <span className="text-xs font-bold">{error}</span>
            </div>
          )}
          <button 
            onClick={handleLogin}
            disabled={!username.trim() || !password || loading}
            className="w-full bg-pink-600 text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-pink-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <>Intră <ChevronRight size={18} /></>}
          </button>
        </div>
        <button
          onClick={onBack}
          className="w-full text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-slate-600 transition-colors py-2"
        >
          ← Înapoi
        </button>
      </div>
    </div>
  );
}

// ─── Teacher Home: management elevi + selectare ────────────────────────────────
function TeacherHome({
  onOpenRoom,
  onBack,
  backLabel = '← Înapoi',
}: {
  onOpenRoom: (student: DBStudent) => void;
  onBack: () => void;
  backLabel?: string;
}) {
  const [students, setStudents] = useState<DBStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newLevel, setNewLevel] = useState('B1');
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [addError, setAddError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLevel, setEditLevel] = useState('');
  const [editAgeSegment, setEditAgeSegment] = useState<'child' | 'teenager' | 'adult'>('adult');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [historyStudentId, setHistoryStudentId] = useState<string | null>(null);
  const [historyLogs, setHistoryLogs] = useState<SessionLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'students' | 'dashboard' | 'homework'>('students');
  const [dashboardLogs, setDashboardLogs] = useState<SessionLog[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [homeworkList, setHomeworkList] = useState<HomeworkAssignment[]>([]);
  const [homeworkLoading, setHomeworkLoading] = useState(false);
  const [expandedHwId, setExpandedHwId] = useState<string | null>(null);
  const [deletingHwId, setDeletingHwId] = useState<string | null>(null);

  useEffect(() => {
    getAllStudents().then((data) => {
      setStudents(data);
      setLoading(false);
    });
  }, []);

  const handleSwitchToDashboard = async () => {
    setActiveTab('dashboard');
    if (dashboardLogs.length > 0) return;
    setDashboardLoading(true);
    const logs = await getAllRecentSessionLogs(120);
    setDashboardLogs(logs);
    setDashboardLoading(false);
  };

  const handleSwitchToHomework = async () => {
    setActiveTab('homework');
    if (homeworkList.length > 0) return;
    setHomeworkLoading(true);
    const list = await getTeacherHomework('medea');
    setHomeworkList(list);
    setHomeworkLoading(false);
  };

  const handleDeleteHomework = async (id: string) => {
    setDeletingHwId(id);
    try {
      await deleteHomework(id);
      setHomeworkList((prev) => prev.filter((h) => h.id !== id));
      if (expandedHwId === id) setExpandedHwId(null);
    } catch (e) {
      console.error('[Homework] delete error', e);
    }
    setDeletingHwId(null);
  };

  const handleAdd = async () => {
    if (!newName.trim()) { setAddError('Introdu un nume valid.'); return; }
    setAddError('');
    setAdding(true);
    const s = await dbAddStudent(newName.trim(), newLevel);
    if (s) {
      setStudents((prev) => [...prev, s]);
      setNewName('');
    } else {
      setAddError('Eroare la adăugare. Verifică RLS în Supabase (anon INSERT pe students).');
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const ok = await dbDeleteStudent(id);
    if (ok) {
      setStudents((prev) => prev.filter((s) => s.id !== id));
      if (selectedId === id) setSelectedId('');
    }
    setDeleting(null);
  };

  const handleStartEdit = (s: DBStudent) => {
    setConfirmDeleteId(null);
    setEditingId(s.id);
    setEditName(s.name);
    setEditLevel(s.level);
    setEditAgeSegment(s.age_segment ?? 'adult');
    setEditNotes(s.notes ?? '');
  };

  const handleCancelEdit = () => {
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
    setEditingId(null);
    setEditName('');
    setEditLevel('');
    setEditAgeSegment('adult');
    setEditNotes('');
  };

  const handleToggleHistory = async (id: string) => {
    if (historyStudentId === id) {
      setHistoryStudentId(null);
      return;
    }
    setHistoryStudentId(id);
    setHistoryLoading(true);
    const logs = await getSessionLogs(id);
    setHistoryLogs(logs);
    setHistoryLoading(false);
  };

  const handleNotesChange = (id: string, value: string) => {
    setEditNotes(value);
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
    notesDebounceRef.current = setTimeout(async () => {
      await updateStudentNotes(id, value);
      setStudents(prev => prev.map(s => s.id === id ? { ...s, notes: value } : s));
    }, 1000);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editingId) return;
    setSaving(true);
    const ok = await updateStudentDetails(editingId, editName, editLevel, editAgeSegment);
    if (ok) {
      setStudents((prev) =>
        prev.map((s) => s.id === editingId ? { ...s, name: editName.trim(), level: editLevel, age_segment: editAgeSegment } : s)
      );
      setEditingId(null);
    }
    setSaving(false);
  };

  const sortedStudents = [...students].sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  const selectedStudent = students.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 pb-12">
      <div className="max-w-lg mx-auto space-y-5">
        <div className="pt-6 text-center space-y-1">
          <div className="w-16 h-16 rounded-full overflow-hidden mx-auto shadow-md border-2 border-pink-200">
            <img src={teacherPhoto} alt="Medéa" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800">
            Teacher Home
          </h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            English with Medéa
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
          <button
            onClick={() => setActiveTab('students')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'students' ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Users size={13} /> Elevi
          </button>
          <button
            onClick={handleSwitchToDashboard}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'dashboard' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Trophy size={13} /> Stats
          </button>
          <button
            onClick={handleSwitchToHomework}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'homework' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <BookOpen size={13} /> Teme
          </button>
        </div>

        {/* ── Dashboard Agregat ─────────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            {dashboardLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin text-violet-400" size={22} />
              </div>
            ) : dashboardLogs.length === 0 ? (
              <div className="bg-white rounded-[24px] p-8 shadow-lg border border-slate-50 text-center space-y-2">
                <p className="text-3xl">📊</p>
                <p className="text-sm font-bold text-slate-500">Nicio sesiune înregistrată încă.</p>
                <p className="text-xs text-slate-400">Logurile apar după prima sesiune completă.</p>
              </div>
            ) : (() => {
              // Agregare per student
              const byStudent: Record<string, { logs: SessionLog[]; totalXp: number; totalSessions: number; lastDate: string; moduleCount: Record<string, number>; vocabCount: number }> = {};
              for (const log of dashboardLogs) {
                if (!log.student_id) continue;
                if (!byStudent[log.student_id]) {
                  byStudent[log.student_id] = { logs: [], totalXp: 0, totalSessions: 0, lastDate: '', moduleCount: {}, vocabCount: 0 };
                }
                const entry = byStudent[log.student_id];
                entry.logs.push(log);
                entry.totalXp += log.xp_earned;
                entry.totalSessions += 1;
                if (!entry.lastDate || log.date > entry.lastDate) entry.lastDate = log.date;
                for (const m of log.modules_used) entry.moduleCount[m] = (entry.moduleCount[m] ?? 0) + 1;
                entry.vocabCount += log.vocabulary_learned.length;
              }
              const ranked = Object.entries(byStudent)
                .map(([studentId, data]) => {
                  const student = students.find(s => s.id === studentId);
                  return { studentId, student, ...data };
                })
                .sort((a, b) => b.totalXp - a.totalXp);
              const maxXp = Math.max(...ranked.map(r => r.totalXp), 1);
              const moduleIcons: Record<string, string> = { puzzle: '🧩', voyager: '🌍', arena: '⚔️', tense_arena: '⏰', dictation: '🎙️', writing: '✍️' };
              return (
                <div className="space-y-3">
                  <div className="bg-white rounded-[24px] p-5 shadow-lg border border-slate-50 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Trophy size={11} className="text-violet-500" /> Clasament XP
                      </h3>
                      <span className="text-[9px] text-slate-300 italic">ultimele {dashboardLogs.length} sesiuni</span>
                    </div>
                    {ranked.map((r, i) => {
                      const pct = Math.round((r.totalXp / maxXp) * 100);
                      const topModules = Object.entries(r.moduleCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
                      return (
                        <div key={r.studentId} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black w-5 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-slate-300'}`}>#{i + 1}</span>
                              <p className="font-black text-slate-800 text-sm">{r.student?.name ?? r.studentId.slice(0, 8)}</p>
                              <span className="text-[9px] font-black text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded">{r.student?.level ?? '?'}</span>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-violet-700">{r.totalXp} XP</p>
                              <p className="text-[9px] text-slate-400">{r.totalSessions} sesiuni</p>
                            </div>
                          </div>
                          {/* XP bar */}
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-violet-400 to-pink-500 transition-all duration-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {/* Module chips + stats */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {topModules.map(([m, count]) => (
                              <span key={m} className="flex items-center gap-0.5 text-[9px] bg-slate-50 border border-slate-100 rounded-lg px-1.5 py-0.5 font-bold text-slate-500">
                                {moduleIcons[m] ?? '📚'} ×{count}
                              </span>
                            ))}
                            {r.vocabCount > 0 && (
                              <span className="text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-1.5 py-0.5 font-bold">
                                {r.vocabCount} cuvinte
                              </span>
                            )}
                            <span className="text-[9px] text-slate-300 ml-auto">
                              Ultima: {r.lastDate}
                            </span>
                          </div>
                          {/* Mini sessions bar chart — last 6 */}
                          {r.logs.length > 1 && (
                            <div className="flex items-end gap-0.5 h-6 mt-0.5">
                              {r.logs.slice(0, 6).reverse().map((log, li) => {
                                const maxLogXp = Math.max(...r.logs.slice(0, 6).map(l => l.xp_earned), 1);
                                const barPct = Math.max((log.xp_earned / maxLogXp) * 100, 8);
                                return (
                                  <div key={li} className="flex-1 flex flex-col justify-end" title={`${log.date}: ${log.xp_earned} XP`}>
                                    <div className="w-full rounded-t bg-violet-300" style={{ height: `${barPct}%` }} />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Global stats */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Sesiuni totale', value: dashboardLogs.length, color: 'text-violet-700 bg-violet-50 border-violet-100' },
                      { label: 'XP total acordat', value: dashboardLogs.reduce((s, l) => s + l.xp_earned, 0), color: 'text-pink-700 bg-pink-50 border-pink-100' },
                      { label: 'Cuvinte învățate', value: dashboardLogs.reduce((s, l) => s + l.vocabulary_learned.length, 0), color: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
                    ].map(stat => (
                      <div key={stat.label} className={`rounded-2xl border p-3 text-center ${stat.color}`}>
                        <p className="text-xl font-black">{stat.value}</p>
                        <p className="text-[8px] font-black uppercase tracking-widest opacity-70 mt-0.5">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => { setDashboardLogs([]); handleSwitchToDashboard(); }}
                    className="w-full text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-violet-600 transition-colors py-1 flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw size={11} /> Reîncarcă date
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Teme trimise ─────────────────────────────────────────────────────── */}
        {activeTab === 'homework' && (
          <div className="space-y-3">
            {homeworkLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin text-emerald-400" size={22} />
              </div>
            ) : homeworkList.length === 0 ? (
              <div className="bg-white rounded-[24px] p-8 shadow-lg border border-slate-50 text-center space-y-2">
                <p className="text-3xl">📭</p>
                <p className="text-sm font-bold text-slate-500">Nicio temă trimisă încă.</p>
                <p className="text-xs text-slate-400">Folosește butonul 📤 din sesiune pentru a trimite exerciții ca temă.</p>
                <a href="/homework" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-2 hover:underline">
                  <ExternalLink size={11} /> Pagina elevului: /homework
                </a>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {homeworkList.length} temă{homeworkList.length !== 1 ? 'e' : ''} trimise
                  </p>
                  <button
                    onClick={() => { setHomeworkList([]); handleSwitchToHomework(); }}
                    className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600 transition-colors flex items-center gap-1"
                  >
                    <RefreshCw size={10} /> Reîncarcă
                  </button>
                </div>
                {homeworkList.map((hw) => {
                  const hwStudent = students.find((s) => s.id === hw.student_id);
                  const moduleIcons: Record<string, string> = { tense_arena: '⏰', puzzle: '🧩', dictation: '🎙️', writing: '✍️' };
                  const isExpanded = expandedHwId === hw.id;
                  const ex = hw.exercises as Record<string, unknown>;
                  return (
                    <div key={hw.id} className="bg-white rounded-[20px] shadow-lg border border-slate-50 overflow-hidden">
                      {/* ── Header card (clickabil pentru expand) ── */}
                      <div
                        className="px-5 py-4 space-y-2 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setExpandedHwId(isExpanded ? null : hw.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-slate-800 text-sm">{hwStudent?.name ?? 'Elev necunoscut'}</p>
                            <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">{hw.created_at.slice(0, 10)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${hw.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {hw.completed ? '✓ Rezolvată' : '⏳ Aștept...'}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteHomework(hw.id); }}
                              disabled={deletingHwId === hw.id}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all disabled:opacity-40"
                              title="Șterge tema"
                            >
                              {deletingHwId === hw.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                            {isExpanded ? <ChevronUp size={13} className="text-slate-400 shrink-0" /> : <ChevronDown size={13} className="text-slate-400 shrink-0" />}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1 bg-slate-900 text-white rounded-lg px-3 py-1" onClick={(e) => e.stopPropagation()}>
                            <span className="font-black text-sm tracking-widest">{hw.code}</span>
                            <button onClick={() => navigator.clipboard.writeText(hw.code)} className="text-slate-400 hover:text-white transition-colors ml-1">
                              <Copy size={11} />
                            </button>
                          </div>
                          <div className="flex gap-1">
                            {hw.modules.map((m) => <span key={m} className="text-sm" title={m}>{moduleIcons[m] ?? '📚'}</span>)}
                          </div>
                          {hw.completed && <span className="text-xs font-black text-violet-700 ml-auto">+{hw.xp_earned} XP</span>}
                        </div>
                        {/* Scoruri rezumat */}
                        {hw.completed && typeof hw.student_answers === 'object' && hw.student_answers !== null && (() => {
                          const ans = hw.student_answers as Record<string, unknown>;
                          const ttScore = ans.time_travel_score as string | undefined;
                          const puzzleCorrect = ans.puzzle_correct as boolean | undefined;
                          const writingFb = ans.writing_feedback as { score?: number } | undefined;
                          return (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {ttScore && <span className="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg px-2 py-0.5 font-bold">⏰ {ttScore}</span>}
                              {puzzleCorrect !== undefined && <span className={`text-[9px] rounded-lg px-2 py-0.5 font-bold border ${puzzleCorrect ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>🧩 {puzzleCorrect ? 'OK' : 'Greșit'}</span>}
                              {writingFb?.score !== undefined && <span className="text-[9px] bg-violet-50 border border-violet-100 text-violet-700 rounded-lg px-2 py-0.5 font-bold">✍️ {writingFb.score}/100</span>}
                            </div>
                          );
                        })()}
                      </div>
                      {/* ── Conținut expandat ── */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50 space-y-3">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Conținut temă</p>
                          {Array.isArray(ex.time_travel_data) && ex.time_travel_data.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-indigo-600">⏰ Time Travel — {(ex.time_travel_data as unknown[]).length} întrebări</p>
                              <p className="text-[10px] text-slate-500 italic">„{((ex.time_travel_data as Record<string,unknown>[])[0]?.sentence_en as string) ?? ''}..."</p>
                            </div>
                          )}
                          {!!(ex.puzzle_data && (ex.puzzle_data as Record<string,unknown>).sentence) && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-purple-600">🧩 Puzzle</p>
                              <p className="text-[10px] text-slate-500 italic">„{(ex.puzzle_data as Record<string,unknown>).sentence as string}"</p>
                            </div>
                          )}
                          {!!(ex.dictation_data && ((ex.dictation_data as Record<string,unknown>).sentence_en || (ex.dictation_data as Record<string,unknown>).sentences)) && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-rose-600">🎙️ Dictation</p>
                              <p className="text-[10px] text-slate-500 italic">„{(Array.isArray((ex.dictation_data as Record<string,unknown>).sentences) ? ((ex.dictation_data as Record<string,unknown>).sentences as {sentence_en:string}[])[0]?.sentence_en : (ex.dictation_data as Record<string,unknown>).sentence_en as string) ?? ''}..."</p>
                            </div>
                          )}
                          {!!(ex.writing_data && (ex.writing_data as Record<string,unknown>).prompt_en) && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-violet-600">✍️ Writing</p>
                              <p className="text-[10px] text-slate-500 italic">„{(ex.writing_data as Record<string,unknown>).prompt_en as string}"</p>
                            </div>
                          )}
                          {/* Răspunsurile elevului dacă rezolvată */}
                          {hw.completed && typeof hw.student_answers === 'object' && hw.student_answers !== null && (() => {
                            const ans = hw.student_answers as Record<string, unknown>;
                            const puzzleAnswer = ans.puzzle_answer as string | undefined;
                            const dictAnswer = ans.dictation_answer as string | undefined;
                            const writingAnswer = ans.writing_answer as string | undefined;
                            const writingFb = ans.writing_feedback as { feedback_ro?: string } | undefined;
                            if (!puzzleAnswer && !dictAnswer && !writingAnswer) return null;
                            return (
                              <div className="border-t border-slate-200 pt-3 space-y-2">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Răspunsurile elevului</p>
                                {puzzleAnswer && <p className="text-[10px] text-slate-600">🧩 <span className="font-bold">Puzzle:</span> „{puzzleAnswer}"</p>}
                                {dictAnswer && <p className="text-[10px] text-slate-600">🎙️ <span className="font-bold">Dictare:</span> „{dictAnswer}"</p>}
                                {writingAnswer && <p className="text-[10px] text-slate-600">✍️ <span className="font-bold">Writing:</span> „{writingAnswer.slice(0, 120)}{writingAnswer.length > 120 ? '...' : ''}"</p>}
                                {writingFb?.feedback_ro && <p className="text-[10px] text-violet-600 italic">{writingFb.feedback_ro.slice(0, 200)}{writingFb.feedback_ro.length > 200 ? '...' : ''}</p>}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
                <a href="/homework" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest py-2 hover:underline">
                  <ExternalLink size={11} /> Pagina elevului: /homework
                </a>
              </>
            )}
          </div>
        )}

        {activeTab === 'students' && (
        <div className="space-y-5">
        <div className="bg-white rounded-[24px] p-5 shadow-lg border border-slate-50 space-y-3">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Selectează elevul pentru lecție
          </h3>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="animate-spin text-pink-400" size={22} />
            </div>
          ) : students.length === 0 ? (
            <p className="text-slate-400 text-xs font-bold italic text-center py-3">
              Niciun elev în portofoliu. Adaugă primul elev mai jos.
            </p>
          ) : (
            <select
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:border-pink-400 transition-all font-bold text-slate-700"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">— Alege elevul —</option>
              {sortedStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.level} · {s.xp} XP
                </option>
              ))}
            </select>
          )}
          <button 
            onClick={() => selectedStudent && onOpenRoom(selectedStudent)}
            disabled={!selectedStudent}
            className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
          >
            Deschide Camera <ChevronRight size={18} />
          </button>
        </div>

        <div className="bg-white rounded-[24px] p-5 shadow-lg border border-slate-50 space-y-3">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <UserPlus size={12} /> Elev Nou
          </h3>
          <input
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:border-pink-400 transition-all font-bold text-slate-700"
            placeholder="Numele elevului..."
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setAddError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <div className="grid grid-cols-3 gap-2">
            {LEVELS.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setNewLevel(lvl)}
                className={`py-2 rounded-lg font-black text-sm border transition-all ${
                  newLevel === lvl
                    ? 'bg-pink-600 text-white border-pink-600 shadow-sm'
                    : 'bg-white text-slate-400 border-slate-100 hover:border-pink-300'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
          {addError && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl px-4 py-2.5">
              <AlertCircle size={14} className="shrink-0" />
              <span className="text-xs font-bold">{addError}</span>
            </div>
          )}
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || adding}
            className="w-full bg-pink-600 text-white py-3 rounded-xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-pink-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {adding ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <><UserPlus size={16} /> Adaugă Elev</>
            )}
          </button>
        </div>

        {students.length > 0 && (
          <div className="bg-white rounded-[24px] p-5 shadow-lg border border-slate-50 space-y-2">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
              Toți elevii ({students.length})
            </h3>
            {sortedStudents.map((s) => (
              <div key={s.id} className="space-y-1">
              <div className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-100">
                {editingId === s.id ? (
                  <div className="space-y-2">
                    <input
                      className="w-full px-3 py-2 rounded-lg bg-white border border-pink-300 outline-none font-bold text-slate-800 text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Nume elev..."
                      autoFocus
                    />
                    <div className="flex flex-wrap gap-1">
                      {LEVELS.map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setEditLevel(lvl)}
                          className={`px-2.5 py-1 rounded-lg font-black text-xs border transition-all ${
                            editLevel === lvl
                              ? 'bg-pink-600 text-white border-pink-600'
                              : 'bg-white text-slate-400 border-slate-200 hover:border-pink-300'
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      {([['child', 'Copil (6-11)'], ['teenager', 'Adolescent (12-17)'], ['adult', 'Adult (18+)']] as const).map(([seg, label]) => (
                        <button
                          key={seg}
                          onClick={() => setEditAgeSegment(seg)}
                          className={`flex-1 px-2 py-1 rounded-lg font-black text-[10px] border transition-all ${
                            editAgeSegment === seg
                              ? 'bg-violet-600 text-white border-violet-600'
                              : 'bg-white text-slate-400 border-slate-200 hover:border-violet-300'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 outline-none text-slate-700 text-xs resize-none focus:border-pink-300"
                      rows={3}
                      value={editNotes}
                      onChange={(e) => handleNotesChange(s.id, e.target.value)}
                      placeholder="Observații despre elev (se salvează automat)..."
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={!editName.trim() || saving}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-600 text-white rounded-lg font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-40"
                      >
                        {saving ? <Loader2 className="animate-spin" size={13} /> : <><Check size={13} /> Salvează</>}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white text-slate-500 rounded-lg font-black text-xs uppercase tracking-widest hover:bg-slate-100 border border-slate-200 transition-all"
                      >
                        <X size={13} /> Anulează
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-800 text-sm truncate">{s.name}</p>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        {s.level} · {s.age_segment === 'child' ? 'Copil' : s.age_segment === 'teenager' ? 'Adolescent' : 'Adult'} · {s.xp} XP · Speaking {s.skills.speaking}% · Grammar {s.skills.grammar}%
                      </p>
                      {s.notes && (
                        <p className="text-[10px] text-slate-400 italic mt-0.5 truncate">{s.notes.slice(0, 60)}{s.notes.length > 60 ? '…' : ''}</p>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {confirmDeleteId === s.id ? (
                        <>
                          <button
                            onClick={() => { handleDelete(s.id); setConfirmDeleteId(null); }}
                            disabled={deleting === s.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all disabled:opacity-40"
                          >
                            {deleting === s.id ? <Loader2 className="animate-spin" size={12} /> : <><Trash2 size={12} /> Da, șterge</>}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 border border-slate-200 transition-all"
                          >
                            <X size={12} /> Anulează
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleToggleHistory(s.id)}
                            className={`p-2 rounded-xl border transition-all ${historyStudentId === s.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white hover:bg-violet-50 text-slate-300 hover:text-violet-500 border-slate-100'}`}
                            title="Istoric sesiuni"
                          >
                            <Clock size={14} />
                          </button>
                          <button
                            onClick={() => handleStartEdit(s)}
                            className="p-2 rounded-xl bg-white hover:bg-blue-50 text-slate-300 hover:text-blue-500 transition-all border border-slate-100"
                            title="Editează"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(s.id)}
                            className="p-2 rounded-xl bg-white hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-all border border-slate-100"
                            title="Șterge"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Panou istoric sesiuni */}
              {historyStudentId === s.id && (
                <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-violet-600 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock size={11} /> Istoric sesiuni — {s.name}
                    </span>
                    {historyLoading && <Loader2 size={12} className="animate-spin text-violet-400" />}
                  </div>
                  {!historyLoading && historyLogs.length === 0 && (
                    <p className="text-xs text-slate-400 italic">Nicio sesiune înregistrată încă.</p>
                  )}
                  {!historyLoading && historyLogs.length > 0 && (
                    <div className="space-y-2">
                      {/* Mini XP chart — ultimele 8 sesiuni */}
                      {historyLogs.length > 1 && (
                        <div className="flex items-end gap-1 h-10">
                          {historyLogs.slice(0, 8).reverse().map((log, i) => {
                            const maxXp = Math.max(...historyLogs.slice(0, 8).map(l => l.xp_earned), 1);
                            const pct = Math.max((log.xp_earned / maxXp) * 100, 4);
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${log.date}: ${log.xp_earned} XP`}>
                                <div
                                  className="w-full rounded-t bg-violet-400 transition-all"
                                  style={{ height: `${pct}%` }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Timeline */}
                      {historyLogs.map((log) => {
                        const moduleIcons: Record<string, string> = { puzzle: '🧩', voyager: '🌍', arena: '⚔️', tense_arena: '⏰', dictation: '🎙️' };
                        return (
                          <div key={log.id} className="bg-white rounded-xl px-3 py-2 flex items-start gap-3 border border-violet-100">
                            <div className="shrink-0 text-center">
                              <p className="text-[10px] font-black text-slate-500">{log.date.slice(8)}-{log.date.slice(5, 7)}</p>
                              <p className="text-[9px] text-slate-300">{log.date.slice(0, 4)}</p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-black text-violet-700">+{log.xp_earned} XP</span>
                                <div className="flex gap-0.5">
                                  {log.modules_used.map(m => (
                                    <span key={m} title={m} className="text-sm">{moduleIcons[m] ?? '📚'}</span>
                                  ))}
                                </div>
                              </div>
                              {log.vocabulary_learned.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {log.vocabulary_learned.slice(0, 5).map((w, i) => (
                                    <span key={i} className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold">{w.en}</span>
                                  ))}
                                  {log.vocabulary_learned.length > 5 && (
                                    <span className="text-[9px] text-slate-400">+{log.vocabulary_learned.length - 5}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              </div>
            ))}
          </div>
        )}
        </div>
        )}

        <button
          onClick={onBack}
          className="w-full text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-slate-600 transition-colors py-2"
        >
          {backLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Creare cameră (profesor) ─────────────────────────────────────────────────
function RoomSetup({
  studentName,
  onStart,
  onBack,
}: {
  studentName: string;
  onStart: (code: string) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState(generateRoomCode);
  const [error, setError] = useState('');

  const handleStart = () => {
    if (!isValidRoomCode(code)) {
      setError('Codul trebuie să fie exact 4 cifre (ex: 1234).');
      return;
    }
    setError('');
    onStart(code.trim());
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#F8FAFC]">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
            <Hash className="text-emerald-600" size={28} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 italic uppercase tracking-tighter">
            Deschide Camera
          </h2>
          <p className="text-slate-500 font-bold text-sm">
            Lecție cu <span className="text-pink-600 font-black">{studentName}</span>
          </p>
        </div>
        <div className="bg-white p-6 rounded-[28px] shadow-2xl border border-slate-50 space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Codul Camerei
            </label>
            <input
              className="w-full text-center text-2xl sm:text-4xl font-black tracking-[0.5em] px-4 py-4 rounded-xl bg-slate-50 border-2 border-slate-200 outline-none focus:border-pink-400 transition-all text-slate-800"
              placeholder="1234"
              value={code}
              maxLength={4}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, '').slice(0, 4));
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              autoFocus
            />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">
              Comunică acest cod elevului tău
            </p>
          </div>
          <button
            onClick={() => setCode(generateRoomCode())}
            className="w-full bg-slate-100 text-slate-600 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
          >
            Generează cod aleatoriu
          </button>
          {error && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl px-4 py-2.5">
              <AlertCircle size={14} className="shrink-0" />
              <span className="text-xs font-bold">{error}</span>
            </div>
          )}
          <button
            onClick={handleStart}
            disabled={!isValidRoomCode(code)}
            className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
          >
            Start Session <ChevronRight size={18} />
          </button>
        </div>
        <button
          onClick={onBack}
          className="w-full text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-slate-600 transition-colors py-2"
        >
          ← Înapoi
        </button>
      </div>
    </div>
  );
}

// ─── Intrare elev ─────────────────────────────────────────────────────────────
function StudentJoin({ onJoin, onBack }: { onJoin: (code: string) => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleJoin = async () => {
    if (!isValidRoomCode(code)) {
      setError('Introdu un cod valid de 4 cifre.');
      return;
    }
    setError('');
    setChecking(true);
    const exists = await checkRoomExists(code);
    setChecking(false);
    if (!exists) {
      setError('Camera nu există sau nu a fost deschisă încă. Verifică codul cu profesorul.');
      return;
    }
    onJoin(code.trim());
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[#F8FAFC]">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="relative mx-auto w-20 h-20">
            <div className="w-20 h-20 rounded-full border-4 border-pink-600 p-0.5 overflow-hidden bg-white shadow-xl">
              <img src={teacherPhoto} alt="Medéa" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-slate-800 italic uppercase tracking-tighter">
            Intră în Cameră
          </h2>
          <p className="text-slate-500 font-bold text-sm">
            Introdu codul furnizat de profesorul tău.
          </p>
        </div>
        <div className="bg-white p-6 rounded-[28px] shadow-2xl border border-slate-50 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Codul Camerei
            </label>
            <input
              className="w-full text-center text-2xl sm:text-4xl font-black tracking-[0.5em] px-4 py-4 rounded-xl bg-slate-50 border-2 border-slate-200 outline-none focus:border-pink-400 transition-all text-slate-800"
              placeholder="----"
              value={code}
              maxLength={4}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, '').slice(0, 4));
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              autoFocus
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl px-4 py-2.5">
              <AlertCircle size={14} className="shrink-0" />
              <span className="text-xs font-bold">{error}</span>
            </div>
          )}
          <button
            onClick={handleJoin}
            disabled={!isValidRoomCode(code) || checking}
            className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-pink-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
          >
            {checking ? <Loader2 className="animate-spin" size={18} /> : <>Intră <ChevronRight size={18} /></>}
          </button>
        </div>
        <a
          href="/homework"
          className="w-full bg-violet-50 border-2 border-violet-200 hover:border-violet-400 text-violet-600 hover:text-violet-700 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all"
        >
          <BookOpen size={16} /> Am o temă
        </a>
        <button
          onClick={onBack}
          className="w-full text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-slate-600 transition-colors py-2"
        >
          ← Înapoi
        </button>
      </div>
    </div>
  );
}

// ─── Loading screens ───────────────────────────────────────────────────────────
function SeedingScreen({ message = 'Se pregătește camera...' }: { message?: string }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-pink-600 overflow-hidden">
            <img src={teacherPhoto} alt="Medéa" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <Loader2 className="animate-spin text-pink-600 absolute -bottom-1 -right-1 bg-white rounded-full p-0.5" size={22} />
        </div>
        <p className="text-slate-500 font-bold text-sm">{message}</p>
      </div>
    </div>
  );
}

// ─── Session Closed Overlay — "Ce am învățat azi" ─────────────────────────────
type SessionEndStatsType = {
  xpEarned: number;
  correctAnswers: number;
  vocabulary: { en: string; ro: string }[];
};
function SessionClosedOverlay({ stats }: { stats: SessionEndStatsType | null }) {
  const motivational = !stats || stats.xpEarned === 0
    ? 'Mult succes la lecția următoare! 🌟'
    : stats.xpEarned >= 500
    ? 'Sesiune excelentă! Ai muncit din greu! 🏆'
    : stats.xpEarned >= 200
    ? 'Bravo! Ai progresat mult astăzi! ⭐'
    : 'Bine! Continuă să exersezi! 💪';

  return (
    <div className="fixed inset-0 z-200 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-[32px] p-8 shadow-2xl text-center space-y-5 max-w-sm w-full mx-4">
        <div className="text-5xl">🎓</div>
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
          Lecția s-a încheiat!
        </h2>
        <p className="text-slate-500 text-sm font-medium italic">{motivational}</p>

        {stats && (
          <div className="space-y-3 text-left">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-pink-50 rounded-2xl p-3">
                <p className="text-xs text-pink-400 font-bold uppercase mb-1">XP câștigat</p>
                <p className="text-2xl font-black text-pink-600">+{stats.xpEarned}</p>
              </div>
              {stats.correctAnswers > 0 && (
                <div className="bg-emerald-50 rounded-2xl p-3">
                  <p className="text-xs text-emerald-500 font-bold uppercase mb-1">Time Travel</p>
                  <p className="text-2xl font-black text-emerald-600">{stats.correctAnswers} ✓</p>
                </div>
              )}
            </div>

            {stats.vocabulary.length > 0 && (
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-xs text-slate-400 font-bold uppercase mb-2">Vocabular nou</p>
                <div className="space-y-1">
                  {stats.vocabulary.map((v, i) => (
                    <div key={i} className="flex gap-2 items-baseline">
                      <strong lang="en" className="text-slate-800 text-sm font-black">{v.en}</strong>
                      <span lang="ro" className="text-slate-400 text-xs italic">{v.ro}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-slate-400 text-xs">Vei fi redirecționat în câteva secunde...</p>
        <div className="flex justify-center">
          <Loader2 className="animate-spin text-pink-400" size={20} />
        </div>
      </div>
    </div>
  );
}

// ─── XP Toast ─────────────────────────────────────────────────────────────────
function XpToast({ amount, onDone }: { amount: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // deps gol — timer pornește o singură dată la mount, re-render-urile nu îl mai resetează
  return (
    <div className="fixed top-20 right-4 z-100 bg-yellow-400 text-yellow-900 px-4 py-2 rounded-2xl font-black text-sm shadow-xl flex items-center gap-2 animate-bounce">
      <Zap size={16} /> +{amount} XP
    </div>
  );
}

// ─── Level Up Toast ────────────────────────────────────────────────────────────
function LevelUpToast({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-[300] flex flex-col items-center gap-3 pointer-events-none">
      <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-black text-2xl px-10 py-5 rounded-3xl shadow-2xl uppercase tracking-widest animate-bounce text-center">
        🎉 LEVEL UP!
      </div>
      <p className="text-white font-black text-sm bg-slate-900/80 px-4 py-2 rounded-xl">
        Continuă să înveți!
      </p>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardView({
  student,
  vocabularyLoot,
  addVocab,
  addXp,
  onNavigate,
  isTeacher,
  onResetXp,
  onAdjustSkill,
  onGoToPortfolio,
  onGoToHomework,
  onDeleteVocabWord,
}: {
  student: Student;
  vocabularyLoot: string[];
  addVocab: (word: string) => void;
  addXp: (amount: number) => void;
  onNavigate: (view: SessionState['current_view']) => void;
  isTeacher: boolean;
  onResetXp?: () => void;
  onAdjustSkill?: (skill: keyof Student['skills'], delta: number) => void;
  onGoToPortfolio?: () => void;
  onGoToHomework?: () => void;
  onDeleteVocabWord?: (en: string) => void;
}) {
  const xpPercent = Math.min((student.xp / student.nextLevelXp) * 100, 100);
  const activities = [
    { id: 'voyager' as const, icon: ImageIcon, color: 'text-pink-600', bg: 'bg-pink-50', label: 'Imagine', desc: 'Visual Voyager', xp: 50 },
    { id: 'arena' as const, icon: Sword, color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Quests', desc: 'Story Arena', xp: 300 },
    { id: 'puzzle' as const, icon: PuzzleIcon, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Puzzle', desc: 'Sentence Builder', xp: 200 },
    { id: 'tense_arena' as const, icon: Clock, color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'Time Travel', desc: 'Tense Arena', xp: 150 },
  ];

  return (
    <div className="space-y-4 max-w-5xl mx-auto px-4 pb-24">
      {isTeacher && (
        <div className="flex items-center gap-4 flex-wrap">
          {onGoToPortfolio && (
            <button
              onClick={onGoToPortfolio}
              className="flex items-center gap-2 text-slate-400 hover:text-pink-600 transition-colors font-black text-xs uppercase tracking-widest"
            >
              <Users size={13} /> Teacher Home
            </button>
          )}
          {onGoToHomework && (
            <button
              onClick={onGoToHomework}
              className="flex items-center gap-2 text-slate-400 hover:text-emerald-600 transition-colors font-black text-xs uppercase tracking-widest"
            >
              <BookOpen size={13} /> Teme
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-linear-to-br from-pink-600 to-pink-800 rounded-[30px] p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[180px]">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-pink-400/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex items-center gap-5">
            <div className={`w-16 h-16 ${student.avatarColor} rounded-2xl flex items-center justify-center border-2 border-white/20 shadow-lg text-3xl`}>
              {student.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-black tracking-tight">{student.name}</h2>
              <div className="flex gap-2 mt-1 flex-wrap items-center">
                <span className="bg-white/10 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">{student.level} Explorer</span>
                <span className="bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1"><Zap size={9} /> {student.xp} XP</span>
                {onResetXp && (
                  <button
                    onClick={onResetXp}
                    className="bg-white/10 hover:bg-rose-500/80 border border-white/20 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-white/70 hover:text-white transition-all"
                    title="Resetează XP-ul elevului la 0"
                  >
                    ↺ Reset XP
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-1.5 relative z-10">
            <div className="flex justify-between text-[9px] font-black uppercase tracking-widest opacity-80">
              <span>Nivel {Math.floor(student.xp / 1000)}</span>
              <span>{Math.round(xpPercent)}%</span>
            </div>
            <div className="w-full bg-black/20 h-4 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: `${xpPercent}%`,
                  background: 'linear-gradient(90deg, #facc15, #f97316)',
                  boxShadow: xpPercent > 10 ? '0 0 8px rgba(251,191,36,0.7)' : 'none',
                }}
              />
            </div>
            <div className="flex justify-between text-[8px] font-bold opacity-60">
              <span>{student.xp} XP</span>
              <span>→ Nivel {Math.floor(student.xp / 1000) + 1} ({1000 - (student.xp % 1000)} XP rămași)</span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-[30px] p-5 shadow-lg border border-slate-50 flex flex-col justify-center">
          <h3 className="text-[10px] font-black text-slate-400 mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
            <Trophy className="text-yellow-500" size={14} /> Skills Mastery
          </h3>
          <div className="space-y-3">
            {(Object.entries(student.skills) as [keyof Student['skills'], number][]).map(([key, val]) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between text-[9px] font-black uppercase text-slate-500">
                  <span>{key}</span>
                  {onAdjustSkill ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onAdjustSkill(key, -10)}
                        disabled={val <= 0}
                        className="w-5 h-5 rounded-md bg-slate-100 hover:bg-pink-100 text-slate-500 hover:text-pink-600 font-black text-xs flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                      >
                        −
                      </button>
                      <span className="text-pink-600 w-10 text-center">Lvl {Math.floor(val / 10)}</span>
                      <button
                        onClick={() => onAdjustSkill(key, 10)}
                        disabled={val >= 100}
                        className="w-5 h-5 rounded-md bg-slate-100 hover:bg-pink-100 text-slate-500 hover:text-pink-600 font-black text-xs flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <span className="text-pink-600">Lvl {Math.floor(val / 10)}</span>
                  )}
                </div>
                <div className="w-full bg-slate-50 h-1.5 rounded-full overflow-hidden border border-slate-100">
                  <div className="bg-pink-600 h-full rounded-full transition-all duration-700" style={{ width: `${val}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {activities.map((action) => (
          <div
            key={action.id}
            onClick={isTeacher ? () => onNavigate(action.id) : undefined}
            className={`bg-white p-4 rounded-2xl border border-slate-50 shadow-md transition-all flex flex-col items-center text-center space-y-2 group ${
              isTeacher
                ? 'cursor-pointer hover:shadow-xl hover:-translate-y-0.5 hover:ring-2 hover:ring-pink-300'
                : 'cursor-default opacity-80'
            }`}
          >
            <div className={`p-3 ${action.bg} rounded-xl ${isTeacher ? 'group-hover:scale-110' : ''} transition-transform duration-300`}>
              <action.icon className={action.color} size={24} />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest italic">{action.label}</h3>
              <p className="text-[9px] text-slate-400 font-bold mt-0.5">{action.desc}</p>
              {isTeacher && (
                <p className="text-[8px] text-pink-400 font-black mt-1 uppercase tracking-widest">Click → Go Live</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {student.vocabulary && filterUncommonWords(student.vocabulary).length > 0 && (
        <div className="bg-white rounded-[30px] p-5 shadow-lg border border-slate-50">
          <h3 className="text-[10px] font-black text-slate-400 mb-3 uppercase tracking-[0.2em] flex items-center gap-2">
            <BookOpen className="text-violet-500" size={14} /> {isTeacher ? 'Cuvintele elevului' : 'Cuvintele mele'} ({filterUncommonWords(student.vocabulary).length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {filterUncommonWords(student.vocabulary).slice(0, 20).map((w, i) => (
              <div key={i} className="relative group flex flex-col bg-violet-50 border border-violet-100 px-3 py-1.5 rounded-xl">
                <span className="font-black text-violet-800 text-[11px]">{w.en}</span>
                <span className="text-violet-400 italic text-[10px]">{w.ro}</span>
                {onDeleteVocabWord && (
                  <button
                    onClick={() => onDeleteVocabWord(w.en)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-slate-200 hover:bg-red-100 text-slate-400 hover:text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                    title="Șterge cuvântul"
                  >
                    <X size={9} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="bg-slate-900 rounded-[30px] p-6 text-white shadow-2xl relative overflow-hidden border-t-2 border-pink-600">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--tw-gradient-stops))] from-pink-900/30 via-transparent to-transparent pointer-events-none" />
        <h3 className="text-xs font-black flex items-center gap-2 uppercase tracking-widest italic mb-4 relative z-10">
          <BookOpen className="text-yellow-400" size={16} /> Loot Box
        </h3>
        <div className="flex flex-wrap gap-2 relative z-10 min-h-[32px]">
          {vocabularyLoot.length === 0 ? (
            <p className="text-slate-500 italic text-xs">Pungile de loot sunt goale...</p>
          ) : (
            vocabularyLoot.map((word, i) => (
              <span key={i} className="bg-pink-600/20 border border-pink-400/30 px-3 py-1.5 rounded-lg text-pink-100 font-bold text-[11px]">{word}</span>
            ))
          )}
        </div>
        <div className="mt-6 pt-4 border-t border-white/5 relative z-10">
          <input
            type="text"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:border-pink-500 transition-colors font-bold text-pink-100 placeholder:text-slate-500"
            placeholder="New loot expression... (Enter)"
            onKeyDown={(e) => {
              const t = e.target as HTMLInputElement;
              if (e.key === 'Enter' && t.value.trim()) {
                addVocab(t.value.trim());
                addXp(20);
                t.value = '';
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── WaitingForTeacher — animație tematică per modul ─────────────────────────
const WAITING_CONFIGS: Record<string, { icon: string; messages: string[] }> = {
  puzzle: {
    icon: '🧩',
    messages: [
      'Profesorul pregătește puzzle-ul...',
      'Se construiește propoziția...',
      'Pregătește-te să ordonezi cuvintele!',
      'Aproape gata!',
    ],
  },
  voyager: {
    icon: '🌍',
    messages: [
      'Se generează scena vizuală...',
      'Profesorul explorează un loc nou...',
      'Imaginea se creează...',
      'Aventura e pe drum!',
    ],
  },
  arena: {
    icon: '⚔️',
    messages: [
      'Profesorul pregătește misiunea...',
      'Briefing-ul se elaborează...',
      'Misiunea e aproape gata!',
      'Pregătește-te pentru roleplay!',
    ],
  },
  tense_arena: {
    icon: '⏰',
    messages: [
      'Profesorul configurează exercițiile...',
      'Se generează întrebările gramaticale...',
      'Time Travel e pe drum!',
      'Pregătește-te să călătorești în timp!',
    ],
  },
  dictation: {
    icon: '🎙️',
    messages: [
      'Profesorul pregătește dictarea...',
      'Fii atent la ce auzi!',
      'Exercițiul de dictare e aproape gata...',
      'Pregătește-te să scrii!',
    ],
  },
  writing: {
    icon: '✍️',
    messages: [
      'Profesorul pregătește subiectul...',
      'Se formulează prompt-ul de scriere...',
      'Exercițiul de writing e aproape gata...',
      'Pregătește-te să scrii!',
    ],
  },
};

function WaitingForTeacher({ module }: { module: keyof typeof WAITING_CONFIGS }) {
  const config = WAITING_CONFIGS[module] ?? WAITING_CONFIGS.puzzle;
  const [msgIdx, setMsgIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setMsgIdx((prev) => (prev + 1) % config.messages.length);
        setVisible(true);
      }, 400);
    }, 3000);
    return () => clearInterval(interval);
  }, [config.messages.length]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-5xl" style={{ animation: 'bounce 2s infinite' }}>
        {config.icon}
      </div>
      <p
        className="text-white/70 font-bold text-sm text-center transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {config.messages[msgIdx]}
      </p>
    </div>
  );
}

// ─── View-uri activitate ──────────────────────────────────────────────────────
type PuzzleProgress = { selection: { word: string; idx: number }[]; is_correct: boolean };

function PuzzleView({
  student,
  onBack,
  isTeacher,
  sessionId,
  puzzleData,
  onPuzzleGenerated,
  addXp,
  studentProgress,
  showTranslation,
}: {
  student: Student;
  onBack?: () => void;
  isTeacher: boolean;
  sessionId: string;
  puzzleData: PuzzleData | null;
  onPuzzleGenerated: (data: PuzzleData | null) => void;
  addXp: (amount: number) => void;
  studentProgress?: PuzzleProgress | null;
  showTranslation: boolean;
}) {
  const [topic, setTopic] = useState('');
  const [usedTopics, setUsedTopics] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`ewm_used_topics_puzzle_${student.dbId}`) ?? '[]'); } catch { return []; }
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [genError, setGenError] = useState('');
  const [userSelection, setUserSelection] = useState<{ word: string; idx: number }[]>([]);
  const [isCorrect, setIsCorrect] = useState(false);
  const [isWrong, setIsWrong] = useState(false);
  const [xpAwarded, setXpAwarded] = useState(false);
  const progressSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const puzzleCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try { localStorage.setItem(`ewm_used_topics_puzzle_${student.dbId}`, JSON.stringify(usedTopics)); } catch {}
  }, [usedTopics, student.dbId]);

  // Reset sau restaurare când se schimbă puzzle-ul (sau la mount după refresh)
  useEffect(() => {
    // Restaurare la refresh: dacă există progres salvat (selecții / răspuns corect), îl refolosim
    // student_puzzle_progress este resetat la null de server când profesorul generează un puzzle nou,
    // deci dacă există date, aparțin cu siguranță puzzle-ului curent.
    if (studentProgress?.is_correct || (studentProgress?.selection?.length ?? 0) > 0) {
      setUserSelection(studentProgress!.selection);
      setIsCorrect(studentProgress!.is_correct);
      setXpAwarded(studentProgress!.is_correct); // previne re-acordarea XP la refresh
    } else {
      setUserSelection([]);
      setIsCorrect(false);
      setXpAwarded(false);
    }
    setIsWrong(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleData?.sentence]);

  // Elev → salvează selecția în exercise_data (debounced 400ms) → profesor vede live
  useEffect(() => {
    if (isTeacher || !sessionId) return;
    if (progressSyncRef.current) clearTimeout(progressSyncRef.current);
    progressSyncRef.current = setTimeout(async () => {
      const { data: current } = await supabase
        .from('session_state')
        .select('exercise_data')
        .eq('session_id', sessionId)
        .maybeSingle();
      const existing =
        typeof current?.exercise_data === 'object' && current.exercise_data !== null
          ? (current.exercise_data as Record<string, unknown>)
          : {};
      await supabase
        .from('session_state')
        .update({
          exercise_data: {
            ...existing,
            student_puzzle_progress: { selection: userSelection, is_correct: isCorrect },
          },
        })
        .eq('session_id', sessionId);
    }, 400);
    return () => {
      if (progressSyncRef.current) clearTimeout(progressSyncRef.current);
    };
  }, [userSelection, isCorrect, isTeacher, sessionId]);

  const handleGenerate = async () => {
    if (isGenerating || isCoolingDown) return;
    setIsGenerating(true);
    setGenError('');
    try {
      const isRandom = !topic.trim();
      const { data, chosenTopic } = await generatePuzzleContent(sessionId, topic.trim(), student.level, student.age_segment, isRandom && usedTopics.length > 0 ? usedTopics : undefined);
      onPuzzleGenerated(data);
      setTopic('');
      if (isRandom) {
        setUsedTopics(prev => {
          const next = [...prev, chosenTopic];
          return next.length >= AGE_TOPICS[student.age_segment].length ? [] : next;
        });
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Eroare necunoscută. Încearcă din nou.');
    }
    setIsGenerating(false);
    if (puzzleCooldownRef.current) clearTimeout(puzzleCooldownRef.current);
    setIsCoolingDown(true);
    puzzleCooldownRef.current = setTimeout(() => setIsCoolingDown(false), 4000);
  };

  const handleWordClick = (word: string, idx: number) => {
    if (isCorrect) return;
    setUserSelection(prev => [...prev, { word, idx }]);
    setIsWrong(false);
  };

  const handleRemoveWord = (selIdx: number) => {
    if (isCorrect) return;
    setUserSelection(prev => prev.filter((_, i) => i !== selIdx));
    setIsWrong(false);
  };

  const handleCheck = () => {
    if (!puzzleData || isCorrect) return;
    const constructed = userSelection.map(s => s.word).join(' ');
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalize(constructed) === normalize(puzzleData.sentence)) {
      setIsCorrect(true);
      setIsWrong(false);
      if (!xpAwarded) {
        addXp(200);
        setXpAwarded(true);
      }
    } else {
      setIsWrong(true);
    }
  };

  const handleRetry = () => {
    setUserSelection([]);
    setIsWrong(false);
  };

  const handleClearPuzzle = async () => {
    await clearPuzzleContent(sessionId);
    onPuzzleGenerated(null);
  };

  const handleToggleTranslation = async () => {
    await setPuzzleShowTranslation(sessionId, !showTranslation);
  };

  const usedIndices = new Set(userSelection.map(s => s.idx));

  return (
    <div className="max-w-2xl mx-auto space-y-4 px-4 py-2 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-black text-slate-800 uppercase italic tracking-tighter flex items-center gap-2 flex-1">
          <PuzzleIcon className="text-purple-600" size={22} /> Sentence Puzzle
        </h2>
        {onBack && (
          <button
            onClick={onBack}
            className="text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-slate-600 transition-colors flex items-center gap-1"
          >
            ← Dashboard
          </button>
        )}
      </div>

      {/* Profesor: generare puzzle */}
      {isTeacher && (
        <div className="bg-white p-5 rounded-[24px] shadow-lg border border-slate-50 space-y-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Sparkles size={11} className="text-purple-500" /> Generează Puzzle cu AI
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:border-purple-400 transition-all font-bold text-slate-700 text-sm placeholder:font-medium placeholder:text-slate-300"
              placeholder="Scenariu / subiect... (lasă gol pentru random)"
              value={topic}
              onChange={(e) => { setTopic(e.target.value); setGenError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              disabled={isGenerating || isCoolingDown}
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || isCoolingDown}
              className="px-5 py-3 bg-purple-600 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-purple-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
            >
              {isGenerating
                ? <Loader2 className="animate-spin" size={16} />
                : isCoolingDown ? <Clock size={15} />
                : topic.trim() ? <Send size={15} /> : <Shuffle size={15} />}
              {isGenerating ? 'Generez...' : isCoolingDown ? 'Cooldown...' : topic.trim() ? 'Build' : 'Random'}
            </button>
          </div>
          {genError && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl px-4 py-2.5">
              <AlertCircle size={13} className="shrink-0" />
              <span className="text-xs font-bold">{genError}</span>
            </div>
          )}
        </div>
      )}

      {/* Profesor: monitor live elev */}
      {isTeacher && puzzleData && (
        <div className="bg-white p-4 rounded-[20px] shadow border border-slate-100 space-y-2">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <User size={10} className="text-purple-500" /> Elev — Live
            {studentProgress?.is_correct && (
              <span className="ml-auto bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">✓ Corect!</span>
            )}
          </p>
          {(!studentProgress || studentProgress.selection.length === 0) ? (
            <p className="text-slate-300 text-xs font-medium italic">Elevul nu a selectat niciun cuvânt încă...</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {studentProgress.selection.map((item, i) => (
                <span
                  key={i}
                  className={`px-2.5 py-1.5 rounded-lg font-black text-xs border ${
                    studentProgress.is_correct
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-purple-50 border-purple-100 text-purple-800'
                  }`}
                >
                  {item.word}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Profesor: traducere română + toggle vizibilitate elev */}
      {isTeacher && puzzleData?.sentence_ro && (
        <div className="bg-indigo-50 p-4 rounded-[20px] border border-indigo-100 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">
              Traducere RO
            </p>
            <button
              onClick={handleToggleTranslation}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                showTranslation
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white border border-indigo-200 text-indigo-500 hover:bg-indigo-100'
              }`}
            >
              {showTranslation ? <Eye size={11} /> : <EyeOff size={11} />}
              {showTranslation ? 'Vizibil elevului' : 'Arată elevului'}
            </button>
          </div>
          <p className="text-sm text-indigo-900 font-medium italic">{puzzleData.sentence_ro}</p>
        </div>
      )}

      {/* Profesor: soluția EN — doar pentru profesor, nu se poate trimite elevului */}
      {isTeacher && puzzleData?.sentence && (
        <div className="bg-emerald-50 p-4 rounded-[20px] border border-emerald-100 space-y-1">
          <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">
            Soluție EN — doar profesor
          </p>
          <p className="text-sm text-emerald-900 font-semibold">{puzzleData.sentence}</p>
        </div>
      )}

      {/* Niciun puzzle activ */}
      {!puzzleData ? (
        <div className="bg-white p-6 sm:p-10 rounded-[30px] shadow-xl border border-slate-50 text-center space-y-4">
          <div className="p-4 bg-purple-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto">
            <PuzzleIcon className="text-purple-500" size={32} />
          </div>
          {isTeacher ? (
            <p className="text-slate-400 font-bold text-sm">
              Introdu un subiect și generează primul puzzle pentru elev.
            </p>
          ) : (
            <WaitingForTeacher module="puzzle" />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Instrucțiune + Hint */}
          <div className="bg-white p-5 rounded-[24px] shadow-md border border-slate-50 space-y-4">
            <div>
              <p className="text-[9px] font-black text-purple-600 uppercase tracking-widest mb-1">
                Obiectiv
              </p>
              <p className="text-sm font-black text-slate-800">{puzzleData.instruction_en}</p>
            </div>
            <div className="pt-3 border-t border-slate-50">
              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2">
                Hint ✨
              </p>
              <FormattedLabel
                level={student.level}
                en={puzzleData.hint_en}
                ro={puzzleData.hint_ro}
              />
            </div>
            {!isTeacher && showTranslation && puzzleData.sentence_ro && (
              <div className="pt-3 border-t border-slate-50">
                <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1">
                  Traducere
                </p>
                <p className="text-sm text-slate-600 italic">{puzzleData.sentence_ro}</p>
              </div>
            )}
          </div>

          {/* Zona de construcție */}
          <div className="relative bg-slate-50 border-2 border-dashed border-slate-200 rounded-[30px] min-h-[100px] p-5 flex flex-wrap gap-2 justify-center items-center shadow-inner">
            {userSelection.length > 0 && !isCorrect && (
              <button
                onClick={handleRetry}
                className="absolute top-3 right-3 text-slate-300 hover:text-rose-400 transition-colors"
                title="Resetează selecția"
              >
                <RefreshCw size={14} />
              </button>
            )}
            {userSelection.length === 0 && (
              <span className="text-slate-300 font-black uppercase tracking-widest text-[10px] select-none">
                Apasă cuvintele de mai jos pentru a construi propoziția
              </span>
            )}
            {userSelection.map((item, i) => (
              <button
                key={i}
                onClick={() => handleRemoveWord(i)}
                className={`px-3 py-2 rounded-lg shadow-sm border font-black text-sm transition-all ${
                  isCorrect
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default'
                    : 'bg-white border-slate-100 text-slate-800 hover:border-rose-200 hover:shadow-md active:scale-95'
                }`}
              >
                {item.word}
              </button>
            ))}
          </div>

          {/* Feedback greșit */}
          {isWrong && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl space-y-1">
              <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest">
                Ordinea nu este corectă. Încearcă din nou!
              </p>
              <p className="text-sm text-slate-500 italic font-medium">
                Propoziția corectă: <span className="font-black text-slate-700">„{puzzleData.sentence}"</span>
              </p>
            </div>
          )}

          {/* Feedback corect */}
          {isCorrect && (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center gap-3">
              <CheckCircle2 className="text-emerald-500 shrink-0" size={22} />
              <div>
                <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                  Perfect! +200 XP câștigat! 🎉
                </p>
                <p className="text-sm font-black text-slate-800 italic mt-0.5">
                  „{puzzleData.sentence}"
                </p>
              </div>
            </div>
          )}

          {/* Cuvinte amestecate */}
          <div className="flex flex-wrap gap-2 justify-center py-2">
            {puzzleData.scrambled.map((word, i) => {
              const isUsed = usedIndices.has(i);
              return (
                <button
                  key={i}
                  disabled={isUsed || isCorrect}
                  onClick={() => handleWordClick(word, i)}
                  className={`px-4 py-2 rounded-xl font-black text-xs border transition-all shadow-sm ${
                    isUsed
                      ? 'opacity-0 pointer-events-none scale-90'
                      : isCorrect
                        ? 'opacity-25 cursor-default bg-white text-slate-400 border-slate-100'
                        : 'bg-white text-slate-700 border-slate-100 hover:border-purple-300 hover:shadow-md active:scale-95 cursor-pointer'
                  }`}
                >
                  {word}
                </button>
              );
            })}
          </div>

          {/* Butoane acțiune */}
          <div className="flex gap-3 pt-2">
            {isTeacher && (
              <button
                onClick={handleClearPuzzle}
                className="px-4 py-3 bg-white border border-slate-200 text-slate-400 rounded-xl shadow-sm hover:text-rose-500 hover:border-rose-200 transition-all"
                title="Șterge puzzle-ul și generează altul"
              >
                <RefreshCw size={16} />
              </button>
            )}
            {!isCorrect && (
              <button
                onClick={isWrong ? handleRetry : handleCheck}
                disabled={userSelection.length === 0}
                className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] ${
                  isWrong
                    ? 'bg-rose-500 text-white hover:bg-rose-600'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {isWrong ? '↺ Încearcă din nou' : 'Verifică propoziția'}
              </button>
            )}
            {isCorrect && (
              <div className="flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-widest text-center bg-emerald-600 text-white shadow-lg">
                ✨ Excelent! Puzzle rezolvat!
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function VoyagerView({
  student,
  onBack,
  isTeacher,
  sessionId,
  voyagerData,
  onVoyagerGenerated,
  addXp,
  studentTaskProgress,
  cachedImageUrl,
}: {
  student: Student;
  onBack?: () => void;
  isTeacher: boolean;
  sessionId: string;
  voyagerData: VoyagerData | null;
  onVoyagerGenerated: (data: VoyagerData | null) => void;
  addXp: (amount: number) => void;
  studentTaskProgress?: boolean[] | null;
  cachedImageUrl?: string | null;
}) {
  const [topic, setTopic] = useState('');
  const [usedTopics, setUsedTopics] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`ewm_used_topics_voyager_${student.dbId}`) ?? '[]'); } catch { return []; }
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [genError, setGenError] = useState('');
  // Stare locală optimistă — doar profesorul actualizează (UI snap înainte ca Realtime să confirme)
  const [localTasks, setLocalTasks] = useState<boolean[]>([false, false, false]);
  // Dacă avem deja un URL (din DB sau cache), nu pornim cu spinner
  const [imageLoading, setImageLoading] = useState(!voyagerData?.image_url && !cachedImageUrl);
  const [imageError, setImageError] = useState(false);
  const voyagerCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref pentru a nu reseta imageLoading la primul mount (când imaginea există deja)
  const isFirstRender = useRef(true);

  useEffect(() => {
    try { localStorage.setItem(`ewm_used_topics_voyager_${student.dbId}`, JSON.stringify(usedTopics)); } catch {}
  }, [usedTopics, student.dbId]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setLocalTasks([false, false, false]);
    setImageLoading(true);
    setImageError(false);
  }, [voyagerData?.image_prompt]);

  // Starea efectivă: merge DB (studentTaskProgress) cu local optimist
  const effectiveTasks = (voyagerData?.tasks ?? []).map((_, i) =>
    (studentTaskProgress?.[i] ?? false) || (localTasks[i] ?? false)
  );

  const handleGenerate = async () => {
    if (isGenerating || isCoolingDown) return;
    setIsGenerating(true);
    setGenError('');
    try {
      const isRandom = !topic.trim();
      const { data, chosenTopic } = await generateVoyagerContent(sessionId, topic.trim(), student.level, student.age_segment, isRandom && usedTopics.length > 0 ? usedTopics : undefined);
      onVoyagerGenerated(data);
      setTopic('');
      if (isRandom) {
        setUsedTopics(prev => {
          const next = [...prev, chosenTopic];
          return next.length >= AGE_TOPICS[student.age_segment].length ? [] : next;
        });
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Eroare la generare. Încearcă din nou.');
    }
    setIsGenerating(false);
    if (voyagerCooldownRef.current) clearTimeout(voyagerCooldownRef.current);
    setIsCoolingDown(true);
    voyagerCooldownRef.current = setTimeout(() => setIsCoolingDown(false), 4000);
  };

  const handleClear = async () => {
    await clearVoyagerContent(sessionId);
    onVoyagerGenerated(null);
  };

  // Doar profesorul poate marca task-uri → scrie direct în DB → Realtime propagă la elev
  const handleTeacherMarkTask = async (i: number) => {
    if (!isTeacher || !voyagerData || effectiveTasks[i]) return;
    const updated = [...effectiveTasks];
    updated[i] = true;
    setLocalTasks(updated); // optimistic
    addXp(50);
    // Salvează vocabularul Voyager în banca de cuvinte a elevului (prima marcare a primului task)
    if (i === 0 && voyagerData.vocabulary?.length && student.dbId) {
      const words: VocabWord[] = voyagerData.vocabulary.map(w => ({
        en: w.en, ro: w.ro, source: 'voyager', date: new Date().toISOString().split('T')[0],
      }));
      addVocabularyToStudent(student.dbId, words).catch(console.error);
    }
    const { data: current } = await supabase
      .from('session_state')
      .select('exercise_data')
      .eq('session_id', sessionId)
      .maybeSingle();
    const existing =
      typeof current?.exercise_data === 'object' && current.exercise_data !== null
        ? (current.exercise_data as Record<string, unknown>)
        : {};
    await supabase
      .from('session_state')
      .update({ exercise_data: { ...existing, student_voyager_tasks: updated } })
      .eq('session_id', sessionId);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 px-4 py-2 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-black text-slate-800 uppercase italic tracking-tighter flex items-center gap-2 flex-1">
          <ImageIcon className="text-pink-600" size={22} /> Visual Voyager
        </h2>
        {onBack && (
          <button onClick={onBack} className="text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-slate-600 transition-colors flex items-center gap-1">
            ← Dashboard
          </button>
        )}
      </div>

      {/* Profesor: input scenă */}
      {isTeacher && (
        <div className="bg-white p-5 rounded-[24px] shadow-lg border border-slate-50 space-y-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Sparkles size={11} className="text-pink-500" /> Generează Scenă
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <textarea
              className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:border-pink-400 transition-all font-bold text-slate-700 text-sm placeholder:font-medium placeholder:text-slate-300 resize-none"
              placeholder="Descrie scena... (lasă gol pentru random)"
              rows={2}
              value={topic}
              onChange={(e) => { setTopic(e.target.value); setGenError(''); }}
              disabled={isGenerating || isCoolingDown}
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || isCoolingDown}
              className="px-5 py-3 bg-pink-600 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-pink-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md self-end"
            >
              {isGenerating ? <Loader2 className="animate-spin" size={16} /> : isCoolingDown ? <Clock size={15} /> : topic.trim() ? <Sparkles size={15} /> : <Shuffle size={15} />}
              {isGenerating ? 'Generez...' : isCoolingDown ? 'Cooldown...' : topic.trim() ? 'Build' : 'Random'}
            </button>
          </div>
          {genError && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl px-4 py-2.5">
              <AlertCircle size={13} className="shrink-0" />
              <span className="text-xs font-bold">{genError}</span>
            </div>
          )}
        </div>
      )}

      {/* Fără scenă activă */}
      {!voyagerData ? (
        <div className="bg-slate-900 rounded-[40px] overflow-hidden min-h-[320px] flex flex-col items-center justify-center shadow-inner border-t-2 border-pink-600 gap-4 p-8">
          <div className="text-center opacity-40">
            <ImageIcon size={60} className="mx-auto text-white" />
            <p className="font-black uppercase tracking-widest text-[9px] mt-2 text-white">Blank Void</p>
          </div>
          <div className="opacity-60">
            {isTeacher
              ? <p className="text-white font-bold text-sm text-center">Introdu o descriere și generează prima scenă.</p>
              : <WaitingForTeacher module="voyager" />
            }
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Imagine generată sau placeholder */}
          <div className="bg-slate-900 rounded-[40px] overflow-hidden border-t-2 border-pink-600 shadow-2xl relative min-h-[300px] flex items-center justify-center">
            {voyagerData.image_url && !imageError ? (
              <>
                {imageLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 z-10">
                    <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-white/40 text-xs text-center italic max-w-xs mt-2">{voyagerData.image_prompt}</p>
                  </div>
                )}
                <img
                  src={voyagerData.image_url}
                  alt="Generated scene"
                  className={`w-full object-contain max-h-[500px] transition-opacity duration-700 ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
                  onLoad={() => setImageLoading(false)}
                  onError={() => { setImageLoading(false); setImageError(true); }}
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 p-8">
                <div className="text-center opacity-30">
                  <ImageIcon size={48} className="mx-auto text-white" />
                  <p className="font-black uppercase tracking-widest text-[9px] mt-2 text-white">
                    {imageError ? 'Image Error' : 'Scene Generated'}
                  </p>
                </div>
                <p className="text-white/50 text-xs font-bold text-center italic max-w-xs">
                  {voyagerData.image_prompt}
                </p>
              </div>
            )}
            {isTeacher && (
              <button
                onClick={handleClear}
                className="absolute top-3 right-3 bg-black/50 text-white/70 hover:text-rose-400 p-2 rounded-xl transition-colors"
                title="Șterge scena"
              >
                <RefreshCw size={14} />
              </button>
            )}
          </div>

          {/* Story bilingv */}
          <div className="bg-white p-5 rounded-[24px] shadow-md border border-slate-50 space-y-3">
            <p className="text-[9px] font-black text-pink-600 uppercase tracking-widest">Povestea scenei</p>
            <FormattedLabel level={student.level} en={voyagerData.story_en} ro={voyagerData.story_ro} />
          </div>

          {/* Vocabular */}
          <div className="bg-white p-5 rounded-[24px] shadow-md border border-slate-50 space-y-3">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <BookOpen size={11} className="text-pink-500" /> Vocabular scenă
            </p>
            <div className="flex flex-wrap gap-2">
              {voyagerData.vocabulary.map((v, i) => (
                <div key={i} className="bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl">
                  <span className="font-black text-slate-800 text-sm">{v.en}</span>
                  <span className="text-slate-400 text-xs font-medium ml-2 italic">{v.ro}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tasks de conversație */}
          <div className="bg-slate-900 p-6 rounded-[30px] border-t-2 border-pink-600 shadow-xl space-y-3">
            <p className="text-[9px] font-black text-pink-400 uppercase tracking-widest flex items-center gap-2">
              Speaking Tasks
              {isTeacher && (
                <span className="ml-auto text-[8px] text-pink-300/60 normal-case font-medium">apasă pentru a acorda XP</span>
              )}
            </p>
            {voyagerData.tasks.map((task, i) => {
              const done = effectiveTasks[i] ?? false;
              return (
                <button
                  key={i}
                  onClick={() => handleTeacherMarkTask(i)}
                  disabled={done || !isTeacher}
                  className={`w-full flex gap-3 p-4 rounded-xl border transition-all text-left ${
                    done
                      ? 'bg-emerald-500/10 border-emerald-500/40 cursor-default'
                      : isTeacher
                        ? 'bg-white/5 border-white/10 hover:border-pink-500 hover:bg-white/10 cursor-pointer active:scale-[0.98]'
                        : 'bg-white/5 border-white/10 cursor-default'
                  }`}
                >
                  <span className={`text-lg shrink-0 ${done ? '' : 'opacity-50'}`}>
                    {done ? '✅' : `${i + 1}.`}
                  </span>
                  <div className="space-y-1">
                    <FormattedLabel level={student.level} en={task.en} ro={task.ro} dark />
                    {done && (
                      <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">+50 XP</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ArenaView({
  student,
  onBack,
  isTeacher,
  sessionId,
  questData,
  onQuestGenerated,
  addXp,
  studentBoosterProgress,
}: {
  student: Student;
  onBack?: () => void;
  isTeacher: boolean;
  sessionId: string;
  questData: QuestData | null;
  onQuestGenerated: (data: QuestData | null) => void;
  addXp: (amount: number) => void;
  studentBoosterProgress?: string[] | null;
}) {
  const [topic, setTopic] = useState('');
  const [usedTopics, setUsedTopics] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`ewm_used_topics_quest_${student.dbId}`) ?? '[]'); } catch { return []; }
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [genError, setGenError] = useState('');
  // Stare locală optimistă — doar profesorul actualizează
  const [localClaimed, setLocalClaimed] = useState<string[]>([]);
  const arenaCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try { localStorage.setItem(`ewm_used_topics_quest_${student.dbId}`, JSON.stringify(usedTopics)); } catch {}
  }, [usedTopics, student.dbId]);

  useEffect(() => {
    setLocalClaimed([]);
  }, [questData?.title]);

  // Starea efectivă: merge DB cu local optimist
  const effectiveClaimed = new Set([...(studentBoosterProgress ?? []), ...localClaimed]);

  const handleGenerate = async () => {
    if (isGenerating || isCoolingDown) return;
    setIsGenerating(true);
    setGenError('');
    try {
      const isRandom = !topic.trim();
      const { data, chosenTopic } = await generateQuestContent(sessionId, topic.trim(), student.level, student.age_segment, isRandom && usedTopics.length > 0 ? usedTopics : undefined);
      onQuestGenerated(data);
      setTopic('');
      if (isRandom) {
        setUsedTopics(prev => {
          const next = [...prev, chosenTopic];
          return next.length >= AGE_TOPICS[student.age_segment].length ? [] : next;
        });
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Eroare la generare. Încearcă din nou.');
    }
    setIsGenerating(false);
    if (arenaCooldownRef.current) clearTimeout(arenaCooldownRef.current);
    setIsCoolingDown(true);
    arenaCooldownRef.current = setTimeout(() => setIsCoolingDown(false), 4000);
  };

  const handleClear = async () => {
    await clearQuestContent(sessionId);
    onQuestGenerated(null);
  };

  // Doar profesorul poate acorda boostere → scrie direct în DB → Realtime propagă la elev
  const handleTeacherClaimBooster = async (booster: QuestData['boosters'][0]) => {
    if (!isTeacher || !questData || effectiveClaimed.has(booster.id)) return;
    const updatedIds = [...Array.from(effectiveClaimed), booster.id];
    setLocalClaimed(prev => [...prev, booster.id]); // optimistic
    addXp(booster.xp);
    // Salvează vocabularul quest în banca de cuvinte la primul booster acordat
    if (effectiveClaimed.size === 0 && questData.vocabulary_to_use?.length && student.dbId) {
      const words: VocabWord[] = questData.vocabulary_to_use.map(w => ({
        en: w, ro: w, source: 'quest', date: new Date().toISOString().split('T')[0],
      }));
      addVocabularyToStudent(student.dbId, words).catch(console.error);
    }
    const { data: current } = await supabase
      .from('session_state')
      .select('exercise_data')
      .eq('session_id', sessionId)
      .maybeSingle();
    const existing =
      typeof current?.exercise_data === 'object' && current.exercise_data !== null
        ? (current.exercise_data as Record<string, unknown>)
        : {};
    await supabase
      .from('session_state')
      .update({ exercise_data: { ...existing, student_quest_boosters: updatedIds } })
      .eq('session_id', sessionId);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 px-4 py-2 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Target size={22} className="text-emerald-600" />
        <h2 className="text-lg font-black text-slate-800 uppercase italic tracking-tighter flex-1">Quest Arena</h2>
        {onBack ? (
          <button onClick={onBack} className="text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-slate-600 transition-colors flex items-center gap-1">
            ← Dashboard
          </button>
        ) : (
          !questData && <span className="bg-emerald-100 text-emerald-700 px-3 py-0.5 rounded-full font-black text-[9px] uppercase tracking-widest">Standby</span>
        )}
      </div>

      {/* Profesor: input context */}
      {isTeacher && (
        <div className="bg-white p-5 rounded-[24px] shadow-lg border border-slate-50 space-y-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Sparkles size={11} className="text-emerald-500" /> Generează Quest
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:border-emerald-400 transition-all font-bold text-slate-700 text-sm placeholder:font-medium placeholder:text-slate-300"
              placeholder="Contextul misiunii... (lasă gol pentru random)"
              value={topic}
              onChange={(e) => { setTopic(e.target.value); setGenError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              disabled={isGenerating || isCoolingDown}
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || isCoolingDown}
              className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
            >
              {isGenerating ? <Loader2 className="animate-spin" size={16} /> : isCoolingDown ? <Clock size={15} /> : topic.trim() ? <Sword size={15} /> : <Shuffle size={15} />}
              {isGenerating ? 'Generez...' : isCoolingDown ? 'Cooldown...' : topic.trim() ? 'Launch' : 'Random'}
            </button>
          </div>
          {genError && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl px-4 py-2.5">
              <AlertCircle size={13} className="shrink-0" />
              <span className="text-xs font-bold">{genError}</span>
            </div>
          )}
        </div>
      )}

      {/* Niciun quest activ */}
      {!questData ? (
        <div className="bg-slate-900 p-6 sm:p-10 rounded-[40px] border-t-2 border-emerald-600 shadow-2xl flex flex-col items-center justify-center gap-4 min-h-[240px]">
          <Target size={48} className="text-white opacity-20" />
          {isTeacher
            ? <p className="text-white/50 font-bold text-sm text-center">Introdu contextul și lansează prima misiune.</p>
            : <WaitingForTeacher module="arena" />
          }
        </div>
      ) : (
        <div className="space-y-4">
          {/* Mission Brief */}
          <div className="bg-slate-900 p-6 rounded-[30px] border-t-2 border-emerald-500 shadow-2xl relative space-y-4">
            {isTeacher && (
              <button
                onClick={handleClear}
                className="absolute top-3 right-3 text-white/30 hover:text-rose-400 transition-colors"
                title="Șterge quest-ul"
              >
                <RefreshCw size={14} />
              </button>
            )}
            <div>
              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Mission</p>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">{questData.title}</h3>
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Briefing</p>
              <FormattedLabel level={student.level} en={questData.mission_brief_en} ro={questData.mission_brief_ro} dark />
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Roleplay Setup</p>
              <FormattedLabel level={student.level} en={questData.roleplay_setup_en} ro={questData.roleplay_setup_ro} dark />
            </div>
          </div>

          {/* Vocabular */}
          <div className="bg-white p-5 rounded-[24px] shadow-md border border-slate-50 space-y-3">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <BookOpen size={11} className="text-emerald-500" /> Vocabular de folosit
            </p>
            <div className="flex flex-wrap gap-2">
              {questData.vocabulary_to_use.map((word, i) => (
                <span key={i} className="bg-emerald-50 border border-emerald-100 text-emerald-800 font-black text-xs px-3 py-1.5 rounded-xl">
                  {word}
                </span>
              ))}
            </div>
          </div>

          {/* XP Boosters */}
          <div className="bg-white p-5 rounded-[24px] shadow-md border border-slate-50 space-y-3">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Zap size={11} className="text-amber-500" /> Quest Loot
              {isTeacher && (
                <span className="ml-auto text-[8px] text-slate-400/60 normal-case font-medium">apasă pentru a acorda XP</span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {questData.boosters.map((booster) => {
                const claimed = effectiveClaimed.has(booster.id);
                return (
                  <button
                    key={booster.id}
                    onClick={() => handleTeacherClaimBooster(booster)}
                    disabled={claimed || !isTeacher}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      claimed
                        ? 'bg-emerald-50 border-emerald-200 cursor-default'
                        : isTeacher
                          ? 'bg-slate-50 border-slate-100 hover:border-emerald-300 hover:shadow-sm active:scale-[0.98] cursor-pointer'
                          : 'bg-slate-50 border-slate-100 cursor-default'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[9px] font-black uppercase tracking-widest ${claimed ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {claimed ? '✓ Claimed' : `+${booster.xp} XP`}
                      </span>
                    </div>
                    <p className="text-xs font-black text-slate-700">{booster.label}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dictation ─────────────────────────────────────────────────────────────────
function DictationView({
  student,
  onBack,
  isTeacher,
  sessionId,
  dictationData,
  onDictationGenerated,
  addXp,
  studentDictationAnswer,
  studentDictationDraft,
}: {
  student: Student;
  onBack?: () => void;
  isTeacher: boolean;
  sessionId: string;
  dictationData: DictationData | null;
  onDictationGenerated: (data: DictationData | null) => void;
  addXp: (amount: number) => void;
  studentDictationAnswer?: StudentDictationAnswer | null;
  studentDictationDraft?: string | null;
}) {
  const [topic, setTopic] = useState('');
  const [usedTopics, setUsedTopics] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`ewm_used_topics_dictation_${student.dbId}`) ?? '[]'); } catch { return []; }
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [genError, setGenError] = useState('');
  const [studentText, setStudentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dictationCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try { localStorage.setItem(`ewm_used_topics_dictation_${student.dbId}`, JSON.stringify(usedTopics)); } catch {}
  }, [usedTopics, student.dbId]);

  // Reset student text when new dictation is generated
  useEffect(() => {
    setStudentText('');
  }, [dictationData?.sentences?.[0]?.sentence_en]);

  const handleGenerate = async () => {
    if (isGenerating || isCoolingDown) return;
    setIsGenerating(true);
    setGenError('');
    try {
      const isRandom = !topic.trim();
      const { data } = await generateDictationContent(sessionId, topic.trim(), student.level, student.age_segment, isRandom && usedTopics.length > 0 ? usedTopics : undefined);
      onDictationGenerated(data);
      setTopic('');
      if (isRandom && data.topic) {
        setUsedTopics(prev => {
          const next = [...prev, data.topic];
          return next.length >= AGE_TOPICS[student.age_segment].length ? [] : next;
        });
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Eroare la generare. Încearcă din nou.');
    }
    setIsGenerating(false);
    if (dictationCooldownRef.current) clearTimeout(dictationCooldownRef.current);
    setIsCoolingDown(true);
    dictationCooldownRef.current = setTimeout(() => setIsCoolingDown(false), 4000);
  };

  const handleClear = async () => {
    await clearDictationContent(sessionId);
    onDictationGenerated(null);
  };

  const handleStudentSubmit = async () => {
    if (!studentText.trim() || !dictationData || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const originalText = dictationData.sentences.map(s => s.sentence_en).join(' ');
      const result = await evaluateDictationAnswer(originalText, studentText.trim());
      const answer: StudentDictationAnswer = {
        text: studentText.trim(),
        ...result,
        submitted_at: new Date().toISOString(),
      };
      // Write to exercise_data
      const { data: current } = await supabase
        .from('session_state')
        .select('exercise_data')
        .eq('session_id', sessionId)
        .maybeSingle();
      const existing = typeof current?.exercise_data === 'object' && current.exercise_data !== null
        ? (current.exercise_data as Record<string, unknown>) : {};
      await supabase.from('session_state')
        .update({ exercise_data: { ...existing, student_dictation_answer: answer, student_dictation_draft: null } })
        .eq('session_id', sessionId);
    } catch (e) {
      console.error('[Dictation] Submit error', e);
    }
    setIsSubmitting(false);
  };

  const handleTeacherGrantXp = (amount: number) => {
    addXp(amount);
  };

  const scoreColor = {
    exact: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    partial: 'text-amber-600 bg-amber-50 border-amber-200',
    wrong: 'text-rose-600 bg-rose-50 border-rose-200',
  };
  const scoreLabel = {
    exact: '✓ Exact',
    partial: '~ Parțial',
    wrong: '✗ Greșit',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 px-4 py-2 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-black text-slate-800 uppercase italic tracking-tighter flex items-center gap-2 flex-1">
          <Mic className="text-pink-600" size={22} /> Dictation
        </h2>
        {onBack && (
          <button onClick={onBack} className="text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-slate-600 transition-colors flex items-center gap-1">
            ← Dashboard
          </button>
        )}
      </div>

      {isTeacher && (
        <div className="bg-white rounded-[24px] p-5 shadow-lg border border-slate-50 space-y-3">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Generează dictare</h3>
          <div className="flex gap-2">
            <input
              className="flex-1 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 text-sm focus:border-pink-300 transition-colors placeholder:text-slate-300"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="Subiect (opțional — lasă gol pentru random)"
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || isCoolingDown}
              className="flex items-center gap-2 px-5 py-2 bg-pink-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-pink-700 transition-all disabled:opacity-40 shrink-0"
            >
              {isGenerating ? <Loader2 className="animate-spin" size={15} /> : isCoolingDown ? <><Clock size={15}/> Cooldown...</> : <><Mic size={15} /> Generează</>}
            </button>
            {dictationData && (
              <button
                onClick={handleClear}
                className="px-4 py-2 bg-slate-100 text-slate-400 rounded-xl font-black text-xs hover:bg-rose-50 hover:text-rose-500 transition-all uppercase tracking-widest"
              >
                Șterge
              </button>
            )}
          </div>
          {genError && <p className="text-rose-500 text-xs font-bold">{genError}</p>}

          {/* Sentence — TEACHER ONLY */}
          {dictationData && (
            <div className="bg-pink-50 border-2 border-pink-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] font-black text-pink-600 bg-pink-100 px-2 py-0.5 rounded-full uppercase tracking-widest">TEACHER ONLY</span>
                <span className="text-[10px] text-slate-400 italic">Citește cu voce tare</span>
              </div>
              <div className="space-y-3">
                {dictationData.sentences.map((s, i) => (
                  <div key={i} className="space-y-0.5">
                    <p className="text-base font-black text-slate-800">{i + 1}. {s.sentence_en}</p>
                    <p className="text-xs text-slate-500 italic pl-4">{s.sentence_ro}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-pink-500 font-bold">Indiciu RO: {dictationData.hint_ro}</p>
            </div>
          )}

          {/* Live typing draft — vizibil profesorului în timp real */}
          {dictationData && !studentDictationAnswer && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 min-h-[72px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Elevul scrie live</span>
                {studentDictationDraft ? (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                    <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Live</span>
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-300 italic">Nicio tastare încă...</span>
                )}
              </div>
              {studentDictationDraft ? (
                <p className="font-bold text-slate-800 text-sm">{studentDictationDraft}</p>
              ) : (
                <p className="text-slate-300 text-sm italic">Așteptând răspunsul elevului...</p>
              )}
            </div>
          )}

          {/* Student answer visible to teacher */}
          {studentDictationAnswer && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Răspunsul elevului</h4>
              <div className={`border rounded-2xl p-4 space-y-2 ${scoreColor[studentDictationAnswer.score]}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full border ${scoreColor[studentDictationAnswer.score]}`}>
                    {scoreLabel[studentDictationAnswer.score]}
                  </span>
                </div>
                <p className="font-bold text-sm">&ldquo;{studentDictationAnswer.text}&rdquo;</p>
                <p className="text-xs">{studentDictationAnswer.feedback_en}</p>
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => handleTeacherGrantXp(150)}
                  className="flex-1 py-2 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all"
                >
                  +150 XP Exact
                </button>
                <button
                  onClick={() => handleTeacherGrantXp(75)}
                  className="flex-1 py-2 bg-amber-500 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-amber-600 transition-all"
                >
                  +75 XP Parțial
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Student side */}
      {!isTeacher && (
        <div className="bg-white rounded-[24px] p-5 shadow-lg border border-slate-50 space-y-4">
          {!dictationData ? (
            <WaitingForTeacher module="dictation" />
          ) : studentDictationAnswer ? (
            <div className="space-y-3 text-center">
              <div className={`inline-block border rounded-2xl px-5 py-3 ${scoreColor[studentDictationAnswer.score]}`}>
                <p className="text-lg font-black">{scoreLabel[studentDictationAnswer.score]}</p>
              </div>
              <p className="text-sm text-slate-600">{studentDictationAnswer.feedback_ro}</p>
              <p className="text-xs text-slate-400">Răspunsul tău: <span className="italic">&ldquo;{studentDictationAnswer.text}&rdquo;</span></p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 text-center">
                <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest mb-1">Indiciu</p>
                <p className="text-sm font-bold text-slate-700 italic">{dictationData.hint_ro}</p>
              </div>
              <p className="text-sm text-slate-600 text-center font-bold">Scrie toate propozițiile dictate:</p>
              <textarea
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-800 text-sm resize-none focus:border-pink-400 transition-colors"
                rows={6}
                value={studentText}
                onChange={e => {
                  const val = e.target.value;
                  setStudentText(val);
                  // Trimite draft live la profesor (debounce 500ms)
                  if (draftSyncRef.current) clearTimeout(draftSyncRef.current);
                  draftSyncRef.current = setTimeout(async () => {
                    const { data: cur } = await supabase
                      .from('session_state')
                      .select('exercise_data')
                      .eq('session_id', sessionId)
                      .maybeSingle();
                    const ex = typeof cur?.exercise_data === 'object' && cur.exercise_data !== null
                      ? (cur.exercise_data as Record<string, unknown>) : {};
                    await supabase.from('session_state')
                      .update({ exercise_data: { ...ex, student_dictation_draft: val } })
                      .eq('session_id', sessionId);
                  }, 500);
                }}
                placeholder="Scrie propozițiile dictate..."
                disabled={isSubmitting}
              />
              <button
                onClick={handleStudentSubmit}
                disabled={!studentText.trim() || isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 bg-pink-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-pink-700 transition-all disabled:opacity-40"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={15} /> : <><Send size={15} /> Trimite</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Writing View ─────────────────────────────────────────────────────────────
function WritingView({
  student,
  onBack,
  isTeacher,
  sessionId,
  writingData,
  addXp,
  studentWritingAnswer,
  studentWritingDraft,
}: {
  student: Student;
  onBack?: () => void;
  isTeacher: boolean;
  sessionId: string;
  writingData: WritingData | null;
  addXp: (amount: number) => void;
  studentWritingAnswer?: StudentWritingAnswer | null;
  studentWritingDraft?: string | null;
}) {
  const [topic, setTopic] = useState('');
  const [usedTopics, setUsedTopics] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`ewm_used_topics_writing_${student.dbId}`) ?? '[]'); } catch { return []; }
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [genError, setGenError] = useState('');
  const [studentText, setStudentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const writingCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try { localStorage.setItem(`ewm_used_topics_writing_${student.dbId}`, JSON.stringify(usedTopics)); } catch {}
  }, [usedTopics, student.dbId]);

  useEffect(() => {
    setStudentText('');
    setShowExample(false);
  }, [writingData?.prompt_en]);

  const handleGenerate = async () => {
    if (isGenerating || isCoolingDown) return;
    setIsGenerating(true);
    setGenError('');
    try {
      const isRandom = !topic.trim();
      const { chosenTopic } = await generateWritingPrompt(sessionId, topic.trim(), student.level, student.age_segment, isRandom && usedTopics.length > 0 ? usedTopics : undefined);
      setTopic('');
      if (isRandom) {
        setUsedTopics(prev => {
          const next = [...prev, chosenTopic];
          return next.length >= AGE_TOPICS[student.age_segment].length ? [] : next;
        });
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Eroare la generare. Încearcă din nou.');
    }
    setIsGenerating(false);
    if (writingCooldownRef.current) clearTimeout(writingCooldownRef.current);
    setIsCoolingDown(true);
    writingCooldownRef.current = setTimeout(() => setIsCoolingDown(false), 4000);
  };

  const handleClear = async () => {
    await clearWritingContent(sessionId);
  };

  const handleStudentSubmit = async () => {
    if (!studentText.trim() || !writingData || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const feedback = await evaluateWriting(writingData.prompt_en, studentText.trim(), student.level);
      const answer: StudentWritingAnswer = {
        text: studentText.trim(),
        feedback,
        submitted_at: new Date().toISOString(),
      };
      const { data: cur } = await supabase
        .from('session_state')
        .select('exercise_data')
        .eq('session_id', sessionId)
        .maybeSingle();
      const ex = typeof cur?.exercise_data === 'object' && cur.exercise_data !== null
        ? (cur.exercise_data as Record<string, unknown>) : {};
      await supabase.from('session_state')
        .update({ exercise_data: { ...ex, student_writing_answer: answer, student_writing_draft: null } })
        .eq('session_id', sessionId);
    } catch (e) {
      console.error('[Writing] Submit error', e);
    }
    setIsSubmitting(false);
  };

  const scoreColor = (score: number) =>
    score >= 80 ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
    : score >= 60 ? 'text-amber-600 bg-amber-50 border-amber-200'
    : 'text-rose-600 bg-rose-50 border-rose-200';

  const scoreLabel = (score: number) =>
    score >= 80 ? 'Excelent' : score >= 60 ? 'Bine' : 'De îmbunătățit';

  return (
    <div className="max-w-4xl mx-auto space-y-4 px-4 py-2 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-black text-slate-800 uppercase italic tracking-tighter flex items-center gap-2 flex-1">
          <PenLine className="text-violet-600" size={22} /> Writing
        </h2>
        {onBack && (
          <button onClick={onBack} className="text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-slate-600 transition-colors flex items-center gap-1">
            ← Dashboard
          </button>
        )}
      </div>

      {isTeacher && (
        <div className="bg-white rounded-[24px] p-5 shadow-lg border border-slate-50 space-y-3">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Generează prompt</h3>
          <div className="flex gap-2">
            <input
              className="flex-1 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none font-bold text-slate-700 text-sm focus:border-violet-300 transition-colors placeholder:text-slate-300"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="Subiect (opțional — lasă gol pentru random)"
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || isCoolingDown}
              className="flex items-center gap-2 px-5 py-2 bg-violet-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-violet-700 transition-all disabled:opacity-40 shrink-0"
            >
              {isGenerating ? <Loader2 className="animate-spin" size={15} /> : isCoolingDown ? <><Clock size={15}/> Cooldown...</> : <><PenLine size={15} /> Generează</>}
            </button>
            {writingData && (
              <button
                onClick={handleClear}
                className="px-4 py-2 bg-slate-100 text-slate-400 rounded-xl font-black text-xs hover:bg-rose-50 hover:text-rose-500 transition-all uppercase tracking-widest"
              >
                Șterge
              </button>
            )}
          </div>
          {genError && <p className="text-rose-500 text-xs font-bold">{genError}</p>}

          {/* Prompt + exemplu — TEACHER ONLY */}
          {writingData && (
            <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-black text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full uppercase tracking-widest">PROMPT</span>
                <span className="text-[10px] text-slate-400 italic">Subiect: {writingData.topic}</span>
              </div>
              <p className="text-base font-black text-slate-800">{writingData.prompt_en}</p>
              <p className="text-sm text-slate-500 italic">{writingData.prompt_ro}</p>
              <button
                onClick={() => setShowExample(v => !v)}
                className="text-[10px] font-black text-violet-500 uppercase tracking-widest hover:text-violet-700 transition-colors"
              >
                {showExample ? '▲ Ascunde exemplu' : '▼ Vezi exemplu răspuns'}
              </button>
              {showExample && (
                <div className="bg-white/70 rounded-xl p-3 border border-violet-100 mt-1">
                  <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest mb-1">Exemplu model</p>
                  <p className="text-sm text-slate-700 italic">{writingData.example_en}</p>
                </div>
              )}
            </div>
          )}

          {/* Live draft profesorului */}
          {writingData && !studentWritingAnswer && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 min-h-[72px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Elevul scrie live</span>
                {studentWritingDraft ? (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse" />
                    <span className="text-[9px] font-black text-violet-500 uppercase tracking-widest">Live</span>
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-300 italic">Nicio tastare încă...</span>
                )}
              </div>
              {studentWritingDraft ? (
                <p className="font-bold text-slate-800 text-sm whitespace-pre-wrap">{studentWritingDraft}</p>
              ) : (
                <p className="text-slate-300 text-sm italic">Așteptând răspunsul elevului...</p>
              )}
            </div>
          )}

          {/* Răspuns evaluat + XP */}
          {studentWritingAnswer && (
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Răspunsul elevului</h4>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                <p className="text-sm text-slate-700 italic whitespace-pre-wrap">&ldquo;{studentWritingAnswer.text}&rdquo;</p>
              </div>
              <WritingFeedbackCard feedback={studentWritingAnswer.feedback} />
              <div className="flex gap-2 flex-wrap mt-1">
                {[300, 200, 150, 100].map(xp => (
                  <button
                    key={xp}
                    onClick={() => addXp(xp)}
                    className={`flex-1 min-w-[80px] py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                      xp === 300 ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : xp === 200 ? 'bg-violet-600 hover:bg-violet-700 text-white'
                      : xp === 150 ? 'bg-amber-500 hover:bg-amber-600 text-white'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                    }`}
                  >
                    +{xp} XP
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Student side */}
      {!isTeacher && (
        <div className="bg-white rounded-[24px] p-5 shadow-lg border border-slate-50 space-y-4">
          {!writingData ? (
            <WaitingForTeacher module="writing" />
          ) : studentWritingAnswer ? (
            <div className="space-y-4">
              <div className={`border rounded-2xl p-4 text-center ${scoreColor(studentWritingAnswer.feedback.score)}`}>
                <p className="text-3xl font-black">{studentWritingAnswer.feedback.score}<span className="text-lg">/100</span></p>
                <p className="text-sm font-bold mt-1">{scoreLabel(studentWritingAnswer.feedback.score)}</p>
                <p className="text-[11px] mt-0.5 opacity-70">CEFR estimat: {studentWritingAnswer.feedback.cefr_estimate}</p>
              </div>
              <p className="text-sm text-slate-600 text-center">{studentWritingAnswer.feedback.overall_comment_ro}</p>
              <WritingFeedbackCard feedback={studentWritingAnswer.feedback} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
                <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest mb-2">Subiect</p>
                <p className="text-base font-black text-slate-800">{writingData.prompt_en}</p>
                <p className="text-sm text-slate-500 italic mt-1">{writingData.prompt_ro}</p>
              </div>
              <textarea
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 outline-none font-medium text-slate-800 text-sm resize-none focus:border-violet-400 transition-colors leading-relaxed"
                rows={7}
                value={studentText}
                onChange={e => {
                  const val = e.target.value;
                  setStudentText(val);
                  if (draftSyncRef.current) clearTimeout(draftSyncRef.current);
                  draftSyncRef.current = setTimeout(async () => {
                    const { data: cur } = await supabase
                      .from('session_state')
                      .select('exercise_data')
                      .eq('session_id', sessionId)
                      .maybeSingle();
                    const ex = typeof cur?.exercise_data === 'object' && cur.exercise_data !== null
                      ? (cur.exercise_data as Record<string, unknown>) : {};
                    await supabase.from('session_state')
                      .update({ exercise_data: { ...ex, student_writing_draft: val } })
                      .eq('session_id', sessionId);
                  }, 500);
                }}
                placeholder="Scrie răspunsul tău în engleză..."
                disabled={isSubmitting}
              />
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>{studentText.split(/\s+/).filter(Boolean).length} cuvinte</span>
                <span>Apasă Trimite când ești gata</span>
              </div>
              <button
                onClick={handleStudentSubmit}
                disabled={!studentText.trim() || isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-violet-700 transition-all disabled:opacity-40"
              >
                {isSubmitting ? <><Loader2 className="animate-spin" size={15} /> Se evaluează...</> : <><Send size={15} /> Trimite pentru evaluare</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WritingFeedbackCard({ feedback }: { feedback: WritingFeedback }) {
  return (
    <div className="space-y-3">
      {/* Score + CEFR */}
      <div className="flex gap-2">
        <div className="flex-1 bg-violet-50 border border-violet-100 rounded-xl p-3 text-center">
          <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">Scor</p>
          <p className="text-2xl font-black text-violet-700">{feedback.score}<span className="text-sm">/100</span></p>
        </div>
        <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">CEFR estimat</p>
          <p className="text-2xl font-black text-slate-700">{feedback.cefr_estimate}</p>
        </div>
      </div>

      {/* Comment */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Feedback</p>
        <p className="text-sm text-slate-700">{feedback.overall_comment_en}</p>
      </div>

      {/* Grammar errors */}
      {feedback.grammar_errors.length > 0 && (
        <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 space-y-2">
          <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Greșeli gramaticale</p>
          {feedback.grammar_errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="text-rose-500 font-bold shrink-0 line-through">{e.error}</span>
              <span className="text-slate-400">→</span>
              <span className="text-emerald-700 font-bold">{e.correction}</span>
            </div>
          ))}
        </div>
      )}

      {/* Vocabulary suggestions */}
      {feedback.vocabulary_suggestions.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2">
          <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Vocabular mai bun</p>
          {feedback.vocabulary_suggestions.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-bold">{s.original}</span>
              <span className="text-slate-400">→</span>
              <Star size={10} className="text-amber-500 shrink-0" />
              <span className="text-amber-700 font-black">{s.better}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Homework Review Overlay ──────────────────────────────────────────────────
type ReviewData = {
  code: string;
  modules: string[];
  exercises: Record<string, unknown>;
  student_answers?: Record<string, unknown>;
  completed?: boolean;
  page?: number;
};

type DictFeedback = { score?: string; feedback_en?: string; feedback_ro?: string };
type WritingFb = { score?: number; cefr_estimate?: string; overall_comment_ro?: string; grammar_errors?: { error: string; correction: string }[] };

function HomeworkReviewOverlay({
  data, onClose, isTeacher, page, onNavigate,
}: {
  data: ReviewData;
  onClose?: () => void;
  isTeacher: boolean;
  page: number;
  onNavigate?: (p: number) => void;
}) {
  const ex = data.exercises;
  const sa = (data.student_answers ?? {}) as Record<string, unknown>;
  const completed = data.completed ?? false;
  const ttAnswers = Array.isArray(sa.time_travel_answers) ? (sa.time_travel_answers as number[]) : null;

  // ── Render răspuns elev Time Travel ─────────────────────────────────────────
  function renderTTItems(
    ttItems: { sentence_en: string; sentence_ro: string; options: string[]; correct_index: number }[],
    offset: number,
  ) {
    return (
      <div className="space-y-3">
        {ttItems.map((q, i) => {
          const globalIdx = offset + i;
          const selected = ttAnswers?.[globalIdx] ?? -1;
          return (
            <div key={i} className="bg-white/10 rounded-xl p-3 space-y-2">
              <p className="text-xs font-black text-white">{i + 1}. {q.sentence_en.replace(/___/g, '______')}</p>
              <p className="text-[10px] text-white/60 italic">{q.sentence_ro}</p>
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt, j) => {
                  const isCorrect = j === q.correct_index;
                  const isStudentWrong = completed && j === selected && !isCorrect;
                  const isStudentCorrect = completed && j === selected && isCorrect;
                  return (
                    <span key={j} className={`text-[10px] px-2 py-1 rounded-lg font-bold border ${
                      isCorrect
                        ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400/40'
                        : isStudentWrong
                        ? 'bg-rose-500/30 text-rose-200 border-rose-400/40'
                        : 'bg-white/10 text-white/70 border-transparent'
                    }`}>
                      {isCorrect && !isStudentCorrect && '✓ '}
                      {isStudentCorrect && '✓ '}
                      {isStudentWrong && '✗ '}
                      {opt}
                      {isStudentWrong && <span className="text-rose-300/70 ml-1 text-[9px]">(elev)</span>}
                      {isStudentCorrect && <span className="text-emerald-300/70 ml-1 text-[9px]">(elev)</span>}
                    </span>
                  );
                })}
              </div>
              {completed && selected === -1 && (
                <p className="text-[10px] text-amber-300">⚠ Necompletat</p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Caseta răspuns elev ──────────────────────────────────────────────────────
  function studentBox(children: React.ReactNode, correct?: boolean) {
    const border = correct === undefined ? 'border-white/20' : correct ? 'border-emerald-400/40' : 'border-rose-400/40';
    const bg = correct === undefined ? 'bg-white/10' : correct ? 'bg-emerald-500/15' : 'bg-rose-500/15';
    return (
      <div className={`rounded-xl p-3 mt-2 border ${border} ${bg} space-y-1`}>
        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Răspunsul elevului</p>
        {children}
      </div>
    );
  }

  const sections: { key: string; label: string; icon: string; content: React.ReactNode }[] = [];

  // Format nou: exercises.items este un array de DraftHomeworkItem
  if (Array.isArray(ex.items)) {
    let ttOffset = 0;
    let puzzleIdx = 0;
    let dictIdx = 0;
    let writingIdx = 0;
    const puzzleAnswersArr = Array.isArray(sa.puzzle_answers) ? (sa.puzzle_answers as { answer: string; correct: boolean }[]) : null;
    const dictAnswersArr = Array.isArray(sa.dictation_answers) ? (sa.dictation_answers as { answer: string; feedback: DictFeedback | null }[]) : null;
    const writingAnswersArr = Array.isArray(sa.writing_answers) ? (sa.writing_answers as { answer: string; feedback: WritingFb | null }[]) : null;
    const items = ex.items as DraftHomeworkItem[];
    items.forEach((item, idx) => {
      const d = item.data as Record<string, unknown>;
      if (item.type === 'time_travel' && Array.isArray(item.data)) {
        const ttItems = item.data as { sentence_en: string; sentence_ro: string; options: string[]; correct_index: number }[];
        const localOffset = ttOffset;
        ttOffset += ttItems.length;
        sections.push({
          key: `tt_${idx}`, label: item.label, icon: '⏰',
          content: renderTTItems(ttItems, localOffset),
        });
      } else if (item.type === 'puzzle' && d.sentence) {
        const pAns = puzzleAnswersArr?.[puzzleIdx];
        puzzleIdx++;
        const stuAns = pAns?.answer;
        const stuCorrect = pAns?.correct;
        sections.push({
          key: `puzzle_${idx}`, label: item.label, icon: '🧩',
          content: (
            <div className="space-y-2">
              <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Răspuns corect</p>
              <p className="text-sm font-black text-emerald-200 leading-relaxed">„{d.sentence as string}"</p>
              {!!d.sentence_ro && <p className="text-xs text-white/60 italic">{d.sentence_ro as string}</p>}
              {completed && stuAns !== undefined
                ? studentBox(
                    <p className={`text-xs font-bold ${stuCorrect ? 'text-emerald-200' : 'text-rose-200'}`}>
                      {stuCorrect ? '✓' : '✗'} „{stuAns}"
                    </p>,
                    stuCorrect,
                  )
                : completed && <p className="text-[10px] text-amber-300 mt-1">⚠ Necompletat</p>}
            </div>
          ),
        });
      } else if (item.type === 'dictation' && (d.sentences || d.sentence_en)) {
        const dAns = dictAnswersArr?.[dictIdx];
        dictIdx++;
        const stuAns = dAns?.answer;
        const stuFb = dAns?.feedback ?? null;
        const scoreVal = stuFb?.score;
        const dictSentences = Array.isArray(d.sentences)
          ? (d.sentences as { sentence_en: string; sentence_ro: string }[])
          : [{ sentence_en: d.sentence_en as string, sentence_ro: d.sentence_ro as string }];
        sections.push({
          key: `dict_${idx}`, label: item.label, icon: '🎙️',
          content: (
            <div className="space-y-2">
              {dictSentences.map((s, si) => (
                <div key={si} className="space-y-0.5">
                  <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">{si + 1}. {s.sentence_ro}</p>
                  <p className="text-sm font-black text-emerald-200">{s.sentence_en}</p>
                </div>
              ))}
              {!!d.hint_ro && <p className="text-[10px] text-amber-300">💡 {d.hint_ro as string}</p>}
              {completed && stuAns !== undefined
                ? studentBox(
                    <>
                      <p className="text-xs font-bold text-white/80">„{stuAns}"</p>
                      {stuFb?.score && (
                        <p className={`text-[10px] font-bold ${scoreVal === 'exact' ? 'text-emerald-300' : scoreVal === 'partial' ? 'text-amber-300' : 'text-rose-300'}`}>
                          {scoreVal === 'exact' ? '✓ Perfect' : scoreVal === 'partial' ? '~ Parțial corect' : '✗ Incorect'}
                        </p>
                      )}
                    </>,
                    scoreVal === 'exact' ? true : scoreVal === 'partial' ? undefined : false,
                  )
                : completed && <p className="text-[10px] text-amber-300 mt-1">⚠ Necompletat</p>}
            </div>
          ),
        });
      } else if (item.type === 'writing' && d.prompt_en) {
        const wAns = writingAnswersArr?.[writingIdx];
        writingIdx++;
        const stuAns = wAns?.answer;
        const stuFb = wAns?.feedback ?? null;
        sections.push({
          key: `writing_${idx}`, label: item.label, icon: '✍️',
          content: (
            <div className="space-y-2">
              <p className="text-sm font-black text-white">{d.prompt_en as string}</p>
              {!!d.prompt_ro && <p className="text-xs text-white/60 italic">{d.prompt_ro as string}</p>}
              {completed && stuAns !== undefined
                ? studentBox(
                    <>
                      <p className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap">{stuAns}</p>
                      {stuFb && (
                        <div className="flex gap-3 pt-1">
                          <span className="text-[10px] font-black text-violet-300">Scor: {stuFb.score ?? '?'}/100</span>
                          <span className="text-[10px] font-black text-slate-400">CEFR: {stuFb.cefr_estimate ?? '?'}</span>
                        </div>
                      )}
                      {stuFb?.overall_comment_ro && (
                        <p className="text-[10px] text-white/60 italic leading-relaxed">{stuFb.overall_comment_ro}</p>
                      )}
                      {stuFb?.grammar_errors && stuFb.grammar_errors.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <p className="text-[9px] font-black text-rose-300 uppercase tracking-widest">Greșeli</p>
                          {stuFb.grammar_errors.slice(0, 3).map((e, i) => (
                            <p key={i} className="text-[10px] text-white/70">
                              <span className="line-through text-rose-300">{e.error}</span>
                              <span className="text-white/40 mx-1">→</span>
                              <span className="text-emerald-300 font-bold">{e.correction}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </>,
                  )
                : completed && <p className="text-[10px] text-amber-300 mt-1">⚠ Necompletat</p>}
            </div>
          ),
        });
      }
    });
  } else {
    // Format vechi: dict cu chei puzzle_data, time_travel_data, etc.
    if (Array.isArray(ex.time_travel_data) && (ex.time_travel_data as unknown[]).length > 0) {
      const ttItems = ex.time_travel_data as { sentence_en: string; sentence_ro: string; options: string[]; correct_index: number }[];
      sections.push({
        key: 'tense_arena', label: 'Time Travel', icon: '⏰',
        content: renderTTItems(ttItems, 0),
      });
    }
    if (ex.puzzle_data && (ex.puzzle_data as Record<string, unknown>).sentence) {
      const p = ex.puzzle_data as Record<string, unknown>;
      const stuAns = sa.puzzle_answer as string | undefined;
      const stuCorrect = sa.puzzle_correct as boolean | undefined;
      sections.push({
        key: 'puzzle', label: 'Puzzle', icon: '🧩',
        content: (
          <div className="space-y-2">
            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Răspuns corect</p>
            <p className="text-sm font-black text-emerald-200 leading-relaxed">„{p.sentence as string}"</p>
            {!!p.translation_ro && <p className="text-xs text-white/60 italic">{p.translation_ro as string}</p>}
            {completed && stuAns !== undefined
              ? studentBox(
                  <p className={`text-xs font-bold ${stuCorrect ? 'text-emerald-200' : 'text-rose-200'}`}>
                    {stuCorrect ? '✓' : '✗'} „{stuAns}"
                  </p>,
                  stuCorrect,
                )
              : completed && <p className="text-[10px] text-amber-300 mt-1">⚠ Necompletat</p>}
          </div>
        ),
      });
    }
    if (ex.dictation_data && ((ex.dictation_data as Record<string, unknown>).sentence_en || (ex.dictation_data as Record<string, unknown>).sentences)) {
      const d = ex.dictation_data as Record<string, unknown>;
      const stuAns = sa.dictation_answer as string | undefined;
      const stuFb = (sa.dictation_feedback ?? null) as DictFeedback | null;
      const scoreVal = stuFb?.score;
      const dictSentences = Array.isArray(d.sentences)
        ? (d.sentences as { sentence_en: string; sentence_ro: string }[])
        : [{ sentence_en: d.sentence_en as string, sentence_ro: d.sentence_ro as string }];
      sections.push({
        key: 'dictation', label: 'Dictare', icon: '🎙️',
        content: (
          <div className="space-y-2">
            {dictSentences.map((s, si) => (
              <div key={si} className="space-y-0.5">
                <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">{si + 1}. {s.sentence_ro}</p>
                <p className="text-sm font-black text-emerald-200">{s.sentence_en}</p>
              </div>
            ))}
            {!!d.hint_ro && <p className="text-[10px] text-amber-300">💡 {d.hint_ro as string}</p>}
            {completed && stuAns !== undefined
              ? studentBox(
                  <>
                    <p className="text-xs font-bold text-white/80">„{stuAns}"</p>
                    {stuFb?.score && (
                      <p className={`text-[10px] font-bold ${scoreVal === 'exact' ? 'text-emerald-300' : scoreVal === 'partial' ? 'text-amber-300' : 'text-rose-300'}`}>
                        {scoreVal === 'exact' ? '✓ Perfect' : scoreVal === 'partial' ? '~ Parțial corect' : '✗ Incorect'}
                      </p>
                    )}
                  </>,
                  scoreVal === 'exact' ? true : scoreVal === 'partial' ? undefined : false,
                )
              : completed && <p className="text-[10px] text-amber-300 mt-1">⚠ Necompletat</p>}
          </div>
        ),
      });
    }
    if (ex.writing_data && (ex.writing_data as Record<string, unknown>).prompt_en) {
      const w = ex.writing_data as Record<string, unknown>;
      const stuAns = sa.writing_answer as string | undefined;
      const stuFb = (sa.writing_feedback ?? null) as WritingFb | null;
      sections.push({
        key: 'writing', label: 'Writing', icon: '✍️',
        content: (
          <div className="space-y-2">
            <p className="text-sm font-black text-white">{w.prompt_en as string}</p>
            {!!w.prompt_ro && <p className="text-xs text-white/60 italic">{w.prompt_ro as string}</p>}
            {completed && stuAns !== undefined
              ? studentBox(
                  <>
                    <p className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap">{stuAns}</p>
                    {stuFb && (
                      <div className="flex gap-3 pt-1">
                        <span className="text-[10px] font-black text-violet-300">Scor: {stuFb.score ?? '?'}/100</span>
                        <span className="text-[10px] font-black text-slate-400">CEFR: {stuFb.cefr_estimate ?? '?'}</span>
                      </div>
                    )}
                    {stuFb?.overall_comment_ro && (
                      <p className="text-[10px] text-white/60 italic leading-relaxed">{stuFb.overall_comment_ro}</p>
                    )}
                    {stuFb?.grammar_errors && stuFb.grammar_errors.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <p className="text-[9px] font-black text-rose-300 uppercase tracking-widest">Greșeli</p>
                        {stuFb.grammar_errors.slice(0, 3).map((e, i) => (
                          <p key={i} className="text-[10px] text-white/70">
                            <span className="line-through text-rose-300">{e.error}</span>
                            <span className="text-white/40 mx-1">→</span>
                            <span className="text-emerald-300 font-bold">{e.correction}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </>,
                )
              : completed && <p className="text-[10px] text-amber-300 mt-1">⚠ Necompletat</p>}
          </div>
        ),
      });
    }
  }

  if (sections.length === 0) return null;
  const current = sections[Math.min(page, sections.length - 1)]!;

  return (
    <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-xl">📚</span>
          <div>
            <p className="text-xs font-black text-white uppercase tracking-widest">Revizuim tema împreună</p>
            <p className="text-[9px] text-white/50 font-bold tracking-widest">
              COD: {data.code}{completed ? ' · ✓ Completat' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {sections.map((s, i) => (
              <button
                key={s.key}
                onClick={() => isTeacher && onNavigate?.(i)}
                disabled={!isTeacher}
                className={`text-base p-1.5 rounded-lg transition-all ${i === page ? 'bg-white/20 scale-110' : 'opacity-50 hover:opacity-80'} disabled:cursor-default`}
                title={s.label}
              >
                {s.icon}
              </button>
            ))}
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg bg-white/10 hover:bg-rose-500/30 text-white/70 hover:text-rose-200 transition-all ml-1" title="Închide review">
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">{current.icon}</span>
          <p className="text-xs font-black text-white/70 uppercase tracking-widest">{current.label}</p>
          <span className="text-[9px] text-white/30 ml-auto">{page + 1} / {sections.length}</span>
        </div>
        {current.content}
      </div>
      {/* Nav — doar profesorul poate naviga; elevul asistă */}
      {sections.length > 1 && (
        <div className="flex gap-2 px-5 py-4 border-t border-white/10">
          <button
            onClick={() => onNavigate?.(Math.max(0, page - 1))}
            disabled={!isTeacher || page === 0}
            className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-30 transition-all flex items-center justify-center gap-1"
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <button
            onClick={() => onNavigate?.(Math.min(sections.length - 1, page + 1))}
            disabled={!isTeacher || page === sections.length - 1}
            className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-30 transition-all flex items-center justify-center gap-1"
          >
            Următor <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Teacher Control Panel ────────────────────────────────────────────────────
function TeacherControlPanel({
  currentView,
  onChangeView,
  isSaving,
  roomCode,
  onAddToDraft,
  draftCount,
  hasExerciseData,
}: {
  currentView: SessionState['current_view'];
  onChangeView: (view: SessionState['current_view']) => void;
  isSaving: boolean;
  roomCode: string;
  onAddToDraft?: () => void;
  draftCount?: number;
  hasExerciseData?: boolean;
}) {
  const views = [
    { id: 'dashboard' as const, label: 'DASH', icon: User },
    { id: 'voyager' as const, label: 'IMAGE', icon: ImageIcon },
    { id: 'puzzle' as const, label: 'PUZZLE', icon: PuzzleIcon },
    { id: 'arena' as const, label: 'QUEST', icon: Sword },
    { id: 'tense_arena' as const, label: 'TIME', icon: Clock },
    { id: 'dictation' as const, label: 'DICT', icon: Mic },
    { id: 'writing' as const, label: 'WRITE', icon: PenLine },
  ];
  const count = draftCount ?? 0;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-[28px] px-5 py-3 shadow-2xl flex items-center gap-5 z-50">
      <div className="flex flex-col items-center shrink-0">
        <span className="text-[7px] font-black text-pink-600 uppercase tracking-[0.25em] border border-pink-200 rounded-md px-1.5 py-0.5">MASTER</span>
        <span className="text-[8px] font-black text-slate-400 mt-0.5 tracking-widest">#{roomCode}</span>
      </div>
      {views.map((v) => {
        const active = currentView === v.id;
        return (
          <button
            key={v.id}
            onClick={() => onChangeView(v.id)}
            disabled={isSaving}
            className={`flex flex-col items-center gap-0.5 transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-50 ${active ? 'text-pink-600 scale-110' : 'text-slate-400 hover:text-pink-400'}`}
          >
            <v.icon size={20} />
            <span className="font-black uppercase text-[7px] tracking-widest">{v.label}</span>
            {active && <span className="w-1.5 h-1.5 bg-pink-600 rounded-full" />}
          </button>
        );
      })}
      {onAddToDraft && (
        <button
          onClick={onAddToDraft}
          disabled={!hasExerciseData || count >= 10 || isSaving}
          className="flex flex-col items-center gap-0.5 transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-30 text-emerald-600 hover:text-emerald-700 relative"
          title={count >= 10 ? 'Tema are deja 10 exerciții (maxim)' : 'Adaugă la temă'}
        >
          <BookOpen size={20} />
          <span className="font-black uppercase text-[7px] tracking-widest">TEMĂ</span>
          {count > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {count}
            </span>
          )}
        </button>
      )}
      {isSaving && <Loader2 size={14} className="animate-spin text-pink-400 shrink-0" />}
    </div>
  );
}

// ─── Debug Panel ──────────────────────────────────────────────────────────────
function DebugPanel({ errors }: { errors: DebugError[] }) {
  const [open, setOpen] = useState(false);
  const rlsCount = errors.filter((e) => e.isRls).length;
  const jsonbCount = errors.filter((e) => e.isJsonb).length;

  if (errors.length === 0) {
    return (
      <div className="fixed bottom-20 right-4 z-40 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5 shadow-md">
        <CheckCircle2 size={12} className="text-emerald-600" />
        <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">DB OK</span>
      </div>
    );
  }
  return (
    <div className="fixed bottom-20 right-4 z-40 max-w-xs w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-2.5 shadow-lg"
      >
        <div className="flex items-center gap-2">
          <AlertCircle size={14} className="text-rose-600" />
          <span className="text-[9px] font-black text-rose-700 uppercase tracking-widest">{errors.length} erori</span>
          {rlsCount > 0 && <span className="flex items-center gap-0.5 bg-rose-100 px-1.5 py-0.5 rounded text-[8px] font-black text-rose-600"><ShieldAlert size={10} /> {rlsCount} RLS</span>}
          {jsonbCount > 0 && <span className="flex items-center gap-0.5 bg-amber-100 px-1.5 py-0.5 rounded text-[8px] font-black text-amber-600"><FileWarning size={10} /> {jsonbCount} JSONB</span>}
        </div>
        {open ? <ChevronDown size={14} className="text-rose-400" /> : <ChevronUp size={14} className="text-rose-400" />}
      </button>
      {open && (
        <div className="mt-1 bg-white border border-rose-100 rounded-2xl shadow-xl overflow-hidden">
          <div className="max-h-64 overflow-y-auto divide-y divide-rose-50">
            {errors.map((err, i) => (
              <div key={i} className="px-4 py-3 space-y-0.5">
                <div className="flex items-center gap-2">
                  {err.isRls ? <ShieldAlert size={11} className="text-rose-500 shrink-0" /> : <FileWarning size={11} className="text-amber-500 shrink-0" />}
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">{err.source}</span>
                  {err.code && <code className="text-[8px] bg-slate-100 px-1 rounded text-slate-500 ml-auto">{err.code}</code>}
                </div>
                <p className="text-[10px] text-slate-500 font-medium leading-tight pl-4">{err.message}</p>
                {err.isRls && <p className="text-[8px] text-rose-500 font-bold pl-4 uppercase tracking-wider">→ Verifică RLS în Supabase (anon INSERT/SELECT)</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Homework Portfolio View ──────────────────────────────────────────────────
function HomeworkPortfolioView({
  isTeacher,
  draft,
  studentName,
  homeworks,
  loading,
  onBack,
  onRemoveDraftItem,
  onSendDraft,
  onReviewHomework,
  onDeleteHomework,
}: {
  isTeacher: boolean;
  draft: DraftHomework | null;
  studentName?: string;
  homeworks: HomeworkAssignment[];
  loading: boolean;
  onBack?: () => void;
  onRemoveDraftItem: (idx: number) => void;
  onSendDraft: () => void;
  onReviewHomework: (hw: HomeworkAssignment) => void;
  onDeleteHomework?: (id: string) => Promise<void>;
}) {
  const moduleIcons: Record<string, string> = { tense_arena: '⏰', puzzle: '🧩', dictation: '🎙️', writing: '✍️' };
  const draftItems = draft?.items ?? [];
  const [deletingHwId, setDeletingHwId] = useState<string | null>(null);

  return (
    <div className="max-w-2xl mx-auto px-4 pb-28 pt-2 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-white/80 hover:bg-slate-100 border border-slate-100 text-slate-500 hover:text-slate-700 transition-all shadow-sm"
            title="Înapoi la dashboard"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        <div>
          <h2 className="text-base font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <BookOpen size={16} className="text-emerald-600" />
            {isTeacher ? `Teme — ${studentName ?? 'Elev'}` : 'Temele mele'}
          </h2>
          {isTeacher && <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Draft curent + teme trimise</p>}
        </div>
      </div>

      {/* TEACHER: Draft curent */}
      {isTeacher && (
        <div className="bg-white rounded-[24px] p-5 shadow-lg border border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Pencil size={12} className="text-emerald-500" /> Draft curent
            </h3>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${draftItems.length >= 10 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
              {draftItems.length}/10 exerciții
            </span>
          </div>

          {draftItems.length === 0 ? (
            <div className="text-center py-4 space-y-1">
              <p className="text-2xl">📝</p>
              <p className="text-xs font-bold text-slate-400">Niciun exercițiu adăugat încă.</p>
              <p className="text-[10px] text-slate-300">Navighează la Puzzle, Time Travel, Dictare sau Writing și apasă butonul <span className="font-black">TEMĂ</span> din bara de jos.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {draftItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
                  <span className="text-base">{moduleIcons[item.type === 'time_travel' ? 'tense_arena' : item.type] ?? '📚'}</span>
                  <span className="flex-1 text-xs font-black text-slate-700">{item.label}</span>
                  <span className="text-[9px] text-slate-400">{item.added_at.slice(11, 16)}</span>
                  <button
                    onClick={() => onRemoveDraftItem(idx)}
                    className="p-1 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                    title="Elimină din draft"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {draftItems.length > 0 && (
            <button
              onClick={onSendDraft}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md"
            >
              <Send size={13} /> Trimite tema ({draftItems.length} {draftItems.length === 1 ? 'exercițiu' : 'exerciții'})
            </button>
          )}
        </div>
      )}

      {/* STUDENT: Draft în construcție */}
      {!isTeacher && draftItems.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-[20px] p-4 flex items-center gap-3">
          <span className="text-xl">🔨</span>
          <div>
            <p className="text-xs font-black text-emerald-700">Profesorul construiește o temă</p>
            <p className="text-[10px] text-emerald-500">{draftItems.length} {draftItems.length === 1 ? 'exercițiu adăugat' : 'exerciții adăugate'} până acum</p>
          </div>
        </div>
      )}

      {/* Teme trimise */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
          <BookOpen size={12} /> {isTeacher ? 'Teme trimise' : 'Temele mele'}
        </h3>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-emerald-400" size={22} />
          </div>
        ) : homeworks.length === 0 ? (
          <div className="bg-white rounded-[20px] p-6 text-center shadow-sm border border-slate-50">
            <p className="text-2xl mb-1">📭</p>
            <p className="text-sm font-bold text-slate-400">{isTeacher ? 'Nicio temă trimisă pentru acest elev.' : 'Nu ai nicio temă primită.'}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {homeworks.map((hw) => (
              <div
                key={hw.id}
                className="bg-white rounded-[20px] p-4 shadow-sm border border-slate-50 space-y-2.5"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${hw.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {hw.completed ? '✓ Rezolvată' : '⏳ În așteptare'}
                  </span>
                  <span className="text-xs font-black text-slate-500 tracking-widest bg-slate-100 px-2 py-0.5 rounded-lg">{hw.code}</span>
                  <span className="text-[9px] text-slate-400">{hw.created_at.slice(0, 10)}</span>
                  <div className="flex gap-0.5 ml-auto">
                    {(Array.isArray((hw.exercises as Record<string,unknown>)?.items)
                      ? [...new Set((hw.exercises as { items: DraftHomeworkItem[] }).items.map(i => i.type === 'time_travel' ? 'tense_arena' : i.type))]
                      : hw.modules
                    ).map((m) => <span key={m} className="text-sm" title={m}>{moduleIcons[m] ?? '📚'}</span>)}
                  </div>
                  {hw.completed && <span className="text-[9px] font-black text-violet-600">+{hw.xp_earned} XP</span>}
                </div>
                {isTeacher && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => onReviewHomework(hw)}
                      className="flex-1 py-2 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-500 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
                    >
                      <Eye size={12} /> Revizuiește cu elevul
                    </button>
                    {onDeleteHomework && (
                      <button
                        onClick={async () => {
                          setDeletingHwId(hw.id);
                          await onDeleteHomework(hw.id);
                          setDeletingHwId(null);
                        }}
                        disabled={deletingHwId === hw.id}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-all disabled:opacity-40"
                        title="Șterge tema"
                      >
                        {deletingHwId === hw.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Root Page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [screen, setScreen] = useState<AppScreen>('restoring');
  const [portfolioReturnScreen, setPortfolioReturnScreen] = useState<AppScreen | null>(null);
  const [homeworkCode, setHomeworkCode] = useState<string | null>(null);
  const [homeworkSending, setHomeworkSending] = useState(false);
  const [hwCopied, setHwCopied] = useState(false);
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  const [draftToast, setDraftToast] = useState<string | null>(null);
  const [studentHomeworkList, setStudentHomeworkList] = useState<HomeworkAssignment[]>([]);
  const [studentHomeworkLoading, setStudentHomeworkLoading] = useState(false);
  const [_reviewingHomework, setReviewingHomework] = useState<HomeworkAssignment | null>(null);
  const [reviewPage, setReviewPage] = useState(0);
  // Actualizare optimistă pentru draft — nu aşteaptă Realtime (fix latency/deploy)
  const [pendingDraft, setPendingDraft] = useState<DraftHomework | null>(null);
  const prevDraftLengthRef = useRef(0);
  const [isTeacher, setIsTeacher] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [roomCode, setRoomCode] = useState<string>('');
  const [localSession, setLocalSession] = useState<SessionState | null>(null);
  const [debugErrors, setDebugErrors] = useState<DebugError[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [vocabularyLoot, setVocabularyLoot] = useState<string[]>([]);
  const [xpToast, setXpToast] = useState<number | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedDBStudent, setSelectedDBStudent] = useState<DBStudent | null>(null);
  const [profileError, setProfileError] = useState('');
  const [soundMuted, setSoundMutedState] = useState<boolean>(() => {
    try { return localStorage.getItem('ewm_sound_muted') === 'true'; } catch { return false; }
  });
  const [sessionClosedVisible, setSessionClosedVisible] = useState(false);
  const sessionClosedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStartXpRef = useRef<number | null>(null);
  const lastVoyagerVocabRef = useRef<{ en: string; ro: string }[]>([]);
  const [sessionEndStats, setSessionEndStats] = useState<{
    xpEarned: number;
    correctAnswers: number;
    vocabulary: { en: string; ro: string }[];
  } | null>(null);
  const [studentLocalView, setStudentLocalView] = useState<SessionState['current_view'] | null>(null);
  const [cachedVoyagerImageUrl, setCachedVoyagerImageUrl] = useState<string | null>(() => {
    try { return localStorage.getItem(LS.voyagerImageUrl); } catch { return null; }
  });

  const { state: liveState } = useSyncSession(sessionId);
  const effectiveState = liveState ?? localSession;

  // Profesorul controlează view-ul via DB; elevul poate naviga local, dar teacher override
  const teacherView = effectiveState?.current_view ?? 'dashboard';
  const currentView = !isTeacher && studentLocalView ? studentLocalView : teacherView;

  // ── Helper: reset complet stare ───────────────────────────────────────────────
  const resetAppState = useCallback(() => {
    setIsTeacher(false);
    setSessionId('');
    setRoomCode('');
    setLocalSession(null);
    setStudent(null);
    setSelectedDBStudent(null);
    setVocabularyLoot([]);
    setDebugErrors([]);
    setProfileError('');
    setSessionClosedVisible(false);
    setSessionEndStats(null);
  }, []);

  // ── Sincronizează flagul de mute la nivelul modulului sound.ts ──────────────
  useEffect(() => { setSoundMuted(soundMuted); }, [soundMuted]);

  // ── Capturăm XP-ul de start sesiune (pentru End Screen) ──────────────────────
  useEffect(() => {
    if (screen === 'app' && !isTeacher && student && sessionStartXpRef.current === null) {
      sessionStartXpRef.current = student.xp;
    }
    if (screen !== 'app') {
      sessionStartXpRef.current = null;
      lastVoyagerVocabRef.current = [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, isTeacher]);

  // ── Salvăm vocabularul Voyager curent (pentru End Screen) ─────────────────────
  useEffect(() => {
    if (!liveState || isTeacher) return;
    const ed = liveState.exercise_data as Record<string, unknown>;
    const vd = ed?.voyager_data;
    if (vd && typeof vd === 'object' && !Array.isArray(vd)) {
      const vocab = (vd as { vocabulary?: { en: string; ro: string }[] }).vocabulary;
      if (vocab && vocab.length > 0) {
        lastVoyagerVocabRef.current = vocab;
      }
    }
  }, [liveState, isTeacher]);

  // ── Detectare Level Up ────────────────────────────────────────────────────────
  const prevXpForLevelRef = useRef<number | null>(null);
  useEffect(() => {
    if (!student || isTeacher || screen !== 'app') return;
    const prevXp = prevXpForLevelRef.current;
    prevXpForLevelRef.current = student.xp;
    if (prevXp === null || prevXp === student.xp) return;
    const oldLevel = Math.floor(prevXp / 1000);
    const newLevel = Math.floor(student.xp / 1000);
    if (newLevel > oldLevel) {
      setShowLevelUp(true);
      setTimeout(() => setShowLevelUp(false), 3500);
    }
  }, [student?.xp, student, isTeacher, screen]);

  const handleToggleSound = () => {
    const next = !soundMuted;
    setSoundMutedState(next);
    try { localStorage.setItem('ewm_sound_muted', String(next)); } catch {}
  };

  // Ref pentru oglindirea badge-ului XP pe ecranul profesorului
  const lastXpEventTsRef = useRef<number>(0);
  // Ref pentru deduplicarea sunetului de răspuns greșit pe ecranul profesorului
  const lastWrongEventTsRef = useRef<number>(0);

  // ── Curăță pendingDraft când Realtime aduce starea reală din DB ─────────────
  useEffect(() => {
    if (liveState) setPendingDraft(null);
  }, [liveState]);

  // activeDraft: draft-ul vizibil — optimistic local sau din Realtime (când vine)
  const activeDraft = pendingDraft ?? (effectiveState?.exercise_data?.draft_homework as DraftHomework | undefined) ?? null;

  // ── Sync loot box din Realtime → ambii văd adăugările profesorului ───────────
  useEffect(() => {
    if (!liveState) return;
    const vocabFromDB = (liveState.exercise_data as Record<string, unknown>)?.vocabulary_loot;
    if (Array.isArray(vocabFromDB)) {
      setVocabularyLoot(vocabFromDB as string[]);
    }
  }, [liveState]);

  // ── Persistă image_url Voyager în localStorage → supraviețuiește la refresh ───
  useEffect(() => {
    if (!liveState) return; // sesiune nepornită — nu atingem cache-ul
    const ed = liveState.exercise_data as Record<string, unknown> | null;
    const rawVoyager = ed?.voyager_data;
    // rawVoyager undefined → voyager_data nu a fost setat niciodată, păstrăm cache-ul
    if (rawVoyager === undefined) return;
    const imageUrl = rawVoyager && typeof rawVoyager === 'object' && !Array.isArray(rawVoyager)
      ? ((rawVoyager as Record<string, unknown>).image_url as string | null) ?? null
      : null;
    try {
      if (imageUrl) {
        localStorage.setItem(LS.voyagerImageUrl, imageUrl);
        setCachedVoyagerImageUrl(imageUrl);
      } else {
        localStorage.removeItem(LS.voyagerImageUrl);
        setCachedVoyagerImageUrl(null);
      }
    } catch { /* SSR / private browsing */ }
  }, [liveState]);

  // ── Profesor: oglindire badge XP când elevul câștigă XP autonom ──────────────
  useEffect(() => {
    if (!isTeacher || screen !== 'app' || !liveState) return;
    const ev = (liveState.exercise_data as Record<string, unknown>)?.xp_event as
      { amount: number; ts: number } | null | undefined;
    if (!ev) return;
    if (lastXpEventTsRef.current === 0) {
      lastXpEventTsRef.current = ev.ts;
      return; // nu afișa toast pentru starea existentă la încărcare
    }
    if (ev.ts !== lastXpEventTsRef.current) {
      lastXpEventTsRef.current = ev.ts;
      setXpToast(ev.amount);
      playSuccessSound(ev.amount);
    }
  }, [isTeacher, screen, liveState]);

  // ── Profesor: oglindire sunet răspuns greșit când elevul greșește în Time Travel ─
  useEffect(() => {
    if (!isTeacher || screen !== 'app' || !liveState) return;
    const answers = (liveState.exercise_data as Record<string, unknown>)
      ?.student_time_travel_answers as { wrongEventTs?: number | null } | null | undefined;
    const ts = answers?.wrongEventTs;
    if (ts && ts !== lastWrongEventTsRef.current) {
      lastWrongEventTsRef.current = ts;
      playWrongSound();
    }
  }, [isTeacher, screen, liveState]);

  // ── Profesor: sync XP + skills în exercise_data → elev vede prin Realtime ────
  // Debounce 300ms pentru a nu suprasolicita DB la click repetat pe +/-
  const progressSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isTeacher || !student || !sessionId || screen !== 'app') return;
    if (progressSyncRef.current) clearTimeout(progressSyncRef.current);
    progressSyncRef.current = setTimeout(async () => {
      const { data: current } = await supabase
        .from('session_state')
        .select('exercise_data')
        .eq('session_id', sessionId)
        .maybeSingle();
      const existing =
        typeof current?.exercise_data === 'object' && current.exercise_data !== null
          ? (current.exercise_data as Record<string, unknown>)
          : {};
      await supabase
        .from('session_state')
        .update({
          exercise_data: {
            ...existing,
            student_xp: student.xp,
            student_skills: student.skills,
          },
        })
        .eq('session_id', sessionId);
    }, 300);
    return () => {
      if (progressSyncRef.current) clearTimeout(progressSyncRef.current);
    };
  }, [student?.xp, student?.skills, isTeacher, sessionId, screen]);

  // ── Elev: sync XP + skills în exercise_data → profesor vede prin Realtime ────
  const studentProgressSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isTeacher || !student || !sessionId || screen !== 'app') return;
    if (studentProgressSyncRef.current) clearTimeout(studentProgressSyncRef.current);
    studentProgressSyncRef.current = setTimeout(async () => {
      const { data: current } = await supabase
        .from('session_state')
        .select('exercise_data')
        .eq('session_id', sessionId)
        .maybeSingle();
      const existing =
        typeof current?.exercise_data === 'object' && current.exercise_data !== null
          ? (current.exercise_data as Record<string, unknown>)
          : {};
      await supabase
        .from('session_state')
        .update({
          exercise_data: {
            ...existing,
            student_xp: student.xp,
            student_skills: student.skills,
          },
        })
        .eq('session_id', sessionId);
    }, 300);
    return () => {
      if (studentProgressSyncRef.current) clearTimeout(studentProgressSyncRef.current);
    };
  }, [student?.xp, student?.skills, isTeacher, sessionId, screen]);

  // ── Elev + Profesor: primește XP + skills prin Realtime și actualizează starea locală ───
  useEffect(() => {
    if (screen !== 'app' || !liveState) return;
    const ed = liveState.exercise_data as Record<string, unknown> | null;
    if (!ed) return;
    const liveXp = ed.student_xp;
    const liveSkills = ed.student_skills;
    if (liveXp === undefined && liveSkills === undefined) return;
    setStudent((prev) => {
      if (!prev) return prev;
      const newXp = typeof liveXp === 'number' ? liveXp : prev.xp;
      const newSkills =
        liveSkills &&
        typeof liveSkills === 'object' &&
        !Array.isArray(liveSkills)
          ? (liveSkills as Student['skills'])
          : prev.skills;
      if (newXp === prev.xp && JSON.stringify(newSkills) === JSON.stringify(prev.skills)) return prev;
      return { ...prev, xp: newXp, skills: newSkills };
    });
  }, [liveState?.exercise_data, isTeacher, screen]);

  // ── Profesor: generare / ștergere puzzle → stocăm în exercise_data → elev vede ──
  // Server Action se ocupă de Supabase — aici actualizăm doar starea locală a profesorului
  // (elevul primește update via Realtime automat)
  const handlePuzzleGenerated = useCallback(
    (_data: PuzzleData | null) => {
      // Starea locală pentru profesor se va actualiza prin liveState (Realtime)
      // Nu mai e nevoie de update manual Supabase — generatePuzzleContent / clearPuzzleContent se ocupă
    },
    []
  );

  // ── Teacher schimbă view-ul via Realtime → reset view local al elevului ───────
  useEffect(() => {
    if (!isTeacher) setStudentLocalView(null);
  }, [teacherView, isTeacher]);

  // ── Auto-restaurare sesiune la reload ─────────────────────────────────────────
  useEffect(() => {
    const { role, roomCode: savedCode, studentDbId } = loadStoredSession();

    if (!role || !savedCode || !studentDbId) {
      setScreen('landing');
      return;
    }

    const sid = roomCodeToSessionId(savedCode);

    if (role === 'teacher') {
      setRoomCode(savedCode);
      setSessionId(sid);
      setIsTeacher(true);
      getStudentById(studentDbId).then((dbStudent) => {
        if (!dbStudent) {
          clearStoredSession();
          setScreen('landing');
          return;
        }
        setStudent(dbStudentToLocal(dbStudent));
        setSelectedDBStudent(dbStudent);
        setScreen('app');
      });
    } else {
      setRoomCode(savedCode);
      setSessionId(sid);
      setIsTeacher(false);
      getStudentById(studentDbId).then((dbStudent) => {
        if (!dbStudent) {
          clearStoredSession();
          setScreen('landing');
          return;
        }
        setStudent(dbStudentToLocal(dbStudent));
        setScreen('app');
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Detecție session_closed via Realtime (pentru elev) ────────────────────────
  // IMPORTANT: fără cleanup → timer-ul nu se anulează la fiecare update Realtime.
  // Garda via ref împiedică pornirea unui al doilea timer.
  useEffect(() => {
    if (screen !== 'app' || isTeacher || !liveState) return;
    const ed = liveState.exercise_data;
    if (ed && typeof ed === 'object' && (ed as Record<string, unknown>).session_closed === true) {
      if (sessionClosedTimerRef.current) return; // timer deja pornit, ignorăm

      // Calculăm statisticile sesiunii pentru End Screen
      const xpEarned = Math.max(0, (student?.xp ?? 0) - (sessionStartXpRef.current ?? 0));
      const rawTTAnswers = (ed as Record<string, unknown>).student_time_travel_answers;
      const ttAnswers = rawTTAnswers && typeof rawTTAnswers === 'object'
        ? (rawTTAnswers as { lockedAnswers?: (number | null)[] })
        : null;
      const correctAnswers = ttAnswers?.lockedAnswers?.filter((a) => a !== null).length ?? 0;
      const vocabulary = lastVoyagerVocabRef.current.slice(0, 5);

      setSessionEndStats({ xpEarned, correctAnswers, vocabulary });
      setSessionClosedVisible(true);
      sessionClosedTimerRef.current = setTimeout(() => {
        sessionClosedTimerRef.current = null;
        if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
        clearStoredSession();
        resetAppState();
        setScreen('landing');
      }, 6000);
    }
  }, [liveState, screen, isTeacher, resetAppState, student]);

  // ── Auto-save skills elev (debounce 2s) — XP NU se persistă, e per-sesiune ───
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!student?.dbId || isTeacher || screen !== 'app') return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      // Salvăm doar skills; XP-ul se resetează la fiecare sesiune nouă
      updateStudentProgress(student.dbId, 0, student.skills);
    }, 2000);
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    };
  }, [student?.skills, student?.dbId, isTeacher, screen]);

  // ── Profesor: login → home ────────────────────────────────────────────────────
  const handleTeacherLoginSuccess = () => setScreen('teacher-home');

  // ── Profesor: selectează elev → setup cameră ─────────────────────────────────
  const handleSelectStudent = (s: DBStudent) => {
    setSelectedDBStudent(s);
    setScreen('room-setup');
  };

  // ── Profesor: pornește camera ─────────────────────────────────────────────────
  const handleRoomStart = async (code: string) => {
    if (!selectedDBStudent) return;
    const sid = roomCodeToSessionId(code);
    setRoomCode(code);
    setSessionId(sid);
    setIsTeacher(true);
    setScreen('seeding');

    const { sessionState, errors } = await seedSession(sid);
    setLocalSession(sessionState);
    setDebugErrors(errors);

    await linkStudentToSession(sid, selectedDBStudent.id);
    setStudent(dbStudentToLocal(selectedDBStudent));

    // Persistă sesiunea în localStorage
    saveStoredSession('teacher', code, selectedDBStudent.id);
    setScreen('app');
  };

  // ── Elev: intră cu cod → încarcă profil din DB ────────────────────────────────
  const handleStudentJoin = async (code: string) => {
    const sid = roomCodeToSessionId(code);
    setRoomCode(code);
    setSessionId(sid);
    setIsTeacher(false);
    setProfileError('');
    setScreen('loading-profile');

    const studentId = await fetchSessionStudentId(sid);
    if (!studentId) {
      setProfileError('Nu a fost găsit un elev asociat acestei camere. Contactează profesorul.');
      setScreen('student-join');
      return;
    }

    const dbStudent = await getStudentById(studentId);
    if (!dbStudent) {
      setProfileError('Profilul elevului nu a putut fi încărcat. Verifică conexiunea.');
      setScreen('student-join');
      return;
    }

    setStudent(dbStudentToLocal(dbStudent));
    // Persistă sesiunea în localStorage
    saveStoredSession('student', code, studentId);
    setScreen('app');
  };

  // ── Profesor: logout → resetează XP + semnalează session_closed în DB ─────────
  const handleTeacherLogout = useCallback(async () => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    if (progressSyncRef.current) clearTimeout(progressSyncRef.current);
    setIsSaving(true);
    try {
      // 1. Citește exercise_data curent (necesar pentru log + cleanup)
      const { data: current } = await supabase
        .from('session_state')
        .select('exercise_data')
        .eq('session_id', sessionId)
        .maybeSingle();
      const existing =
        typeof current?.exercise_data === 'object' && current.exercise_data !== null
          ? (current.exercise_data as Record<string, unknown>)
          : {};

      // 2. Salvează session log (înainte de reset XP, ca să avem XP-ul câștigat)
      if (student?.dbId && student.xp > 0) {
        const voyagerForLog = existing.voyager_data as Record<string, unknown> | null | undefined;
        const vocabLearned = Array.isArray(voyagerForLog?.vocabulary)
          ? (voyagerForLog!.vocabulary as { en: string; ro: string }[])
          : [];
        const modulesUsed = (
          [
            existing.puzzle_data ? 'puzzle' : null,
            existing.voyager_data ? 'voyager' : null,
            existing.quest_data ? 'arena' : null,
            existing.time_travel_data ? 'tense_arena' : null,
            existing.dictation_data ? 'dictation' : null,
            existing.writing_data ? 'writing' : null,
          ] as (string | null)[]
        ).filter((m): m is string => m !== null);
        saveSessionLog({
          session_id: sessionId,
          student_id: student.dbId,
          xp_earned: student.xp,
          modules_used: modulesUsed,
          vocabulary_learned: vocabLearned,
          tenses_practiced: [],
          notes: '',
        }).catch(console.warn);
      }

      // 3. Resetează XP-ul elevului la 0 (XP valid doar per sesiune; skill-urile rămân)
      if (student?.dbId) {
        await updateStudentProgress(student.dbId, 0, student.skills);
      }

      // 4. Șterge imaginea Voyager din Storage (dacă există) și marchează sesiunea ca închisă
      const voyagerDataLogout = existing.voyager_data as Record<string, unknown> | null | undefined;
      if (voyagerDataLogout?.image_path && typeof voyagerDataLogout.image_path === 'string') {
        try {
          await deleteVoyagerImage(voyagerDataLogout.image_path);
        } catch (e) {
          console.warn('[logout] Nu s-a putut șterge imaginea din Storage:', e);
        }
      }

      await supabase
        .from('session_state')
        .update({
          exercise_data: {
            ...existing,
            voyager_data: null,     // curăță inclusiv image_url/image_path
            session_closed: true,
            student_xp: 0,          // elevul vede XP 0 via Realtime înainte de redirect
          },
        })
        .eq('session_id', sessionId);
    } catch (e) {
      console.warn('[logout] Eroare la cleanup sesiune:', e);
    }
    setIsSaving(false);
    clearStoredSession();
    resetAppState();
    setScreen('landing');
  }, [sessionId, student, resetAppState]);

  // ── Elev: ieși din sesiune (fără a șterge sesiunea din DB) ───────────────────
  const handleStudentLeave = useCallback(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    // Salvăm doar skills la ieșire; XP nu se persistă (per-sesiune)
    if (student?.dbId) {
      updateStudentProgress(student.dbId, 0, student.skills);
    }
    clearStoredSession();
    resetAppState();
    setScreen('landing');
  }, [student, resetAppState]);

  // ── XP & vocab ────────────────────────────────────────────────────────────────
  const addXp = useCallback((amount: number) => {
    setXpToast(amount);
    playSuccessSound(amount);
    setStudent((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        xp: prev.xp + amount,
        skills: {
          speaking: Math.min(prev.skills.speaking + Math.floor(amount / 20), 100),
          grammar: Math.min(prev.skills.grammar + Math.floor(amount / 40), 100),
          vocabulary: Math.min(prev.skills.vocabulary + Math.floor(amount / 25), 100),
        },
      };
    });
    // Elev: salvează evenimentul XP în exercise_data → profesorul vede badge-ul prin Realtime
    if (!isTeacher && sessionId) {
      const ts = Date.now();
      supabase
        .from('session_state')
        .select('exercise_data')
        .eq('session_id', sessionId)
        .maybeSingle()
        .then(({ data: cur }) => {
          const ex =
            typeof cur?.exercise_data === 'object' && cur.exercise_data !== null
              ? (cur.exercise_data as Record<string, unknown>)
              : {};
          return supabase
            .from('session_state')
            .update({ exercise_data: { ...ex, xp_event: { amount, ts } } })
            .eq('session_id', sessionId);
        });
    }
  }, [isTeacher, sessionId]);

  const handleDeleteVocabWord = useCallback(async (wordEn: string) => {
    if (!student?.dbId) return;
    setStudent((prev) => {
      if (!prev) return prev;
      return { ...prev, vocabulary: prev.vocabulary.filter(w => w.en.toLowerCase() !== wordEn.toLowerCase()) };
    });
    await deleteVocabularyWord(student.dbId, wordEn);
  }, [student?.dbId]);

  const addVocab = useCallback(async (word: string) => {
    if (vocabularyLoot.includes(word)) return;
    const newLoot = [...vocabularyLoot, word];
    // Optimistic update imediat
    setVocabularyLoot(newLoot);
    // Persistă în exercise_data → elevul vede prin Realtime
    const { data: current } = await supabase
      .from('session_state')
      .select('exercise_data')
      .eq('session_id', sessionId)
      .maybeSingle();
    const existingEd =
      typeof current?.exercise_data === 'object' && current.exercise_data !== null
        ? (current.exercise_data as Record<string, unknown>)
        : {};
    await supabase
      .from('session_state')
      .update({ exercise_data: { ...existingEd, vocabulary_loot: newLoot } })
      .eq('session_id', sessionId);
  }, [vocabularyLoot, sessionId]);

  const changeView = useCallback(async (newView: SessionState['current_view']) => {
    setLocalSession((prev) => (prev ? { ...prev, current_view: newView } : prev));
    setIsSaving(true);
    const { error } = await supabase
      .from('session_state')
      .update({ current_view: newView })
      .eq('session_id', sessionId);
    if (error) {
      setDebugErrors((prev) => [...prev, {
        source: 'session_state/update',
        code: error.code ?? null,
        message: error.message,
        isRls: error.code === '42501' || error.code === 'PGRST301' || error.message.includes('row-level security'),
        isJsonb: false,
        timestamp: new Date().toISOString(),
      }]);
    }
    setIsSaving(false);
  }, [sessionId, student]);

  // ── Ajustare nivel skill (profesor only) ─────────────────────────────────────
  const adjustSkill = useCallback(async (
    skill: keyof Student['skills'],
    delta: number
  ) => {
    if (!student) return;
    const newSkills = {
      ...student.skills,
      [skill]: Math.max(0, Math.min(100, student.skills[skill] + delta)),
    };
    setStudent((prev) => (prev ? { ...prev, skills: newSkills } : prev));
    if (student.dbId) {
      await updateStudentProgress(student.dbId, student.xp, newSkills);
    }
  }, [student]);

  // ── Fetch teme elev curent (profesor in sesiune) ─────────────────────────────
  const fetchStudentHomework = useCallback(async () => {
    if (!student?.dbId) return;
    setStudentHomeworkLoading(true);
    const list = await getStudentHomework(student.dbId);
    setStudentHomeworkList(list);
    setStudentHomeworkLoading(false);
  }, [student?.dbId]);

  useEffect(() => {
    if (currentView === 'homework_portfolio' && student?.dbId) {
      fetchStudentHomework();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, student?.dbId]);

  // Toast pentru elev când profesorul adaugă la draft
  const draftItems = (effectiveState?.exercise_data?.draft_homework as DraftHomework | undefined)?.items;
  const draftLen = draftItems?.length ?? 0;
  useEffect(() => {
    if (isTeacher) { prevDraftLengthRef.current = draftLen; return; }
    const prevLen = prevDraftLengthRef.current;
    prevDraftLengthRef.current = draftLen;
    if (draftLen > prevLen) {
      const last = draftItems?.[draftLen - 1];
      if (last) {
        setDraftToast(`${last.label} adăugat la temă! (${draftLen}/10)`);
        const t = setTimeout(() => setDraftToast(null), 3500);
        return () => clearTimeout(t);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftLen]);

  // ── Review temă cu elevul (profesor → Realtime → elev) ───────────────────────
  const handleReviewHomework = useCallback(async (hw: HomeworkAssignment | null) => {
    if (!sessionId) return;
    setReviewingHomework(hw);
    if (hw) setReviewPage(0);
    const current = await supabase.from('session_state').select('exercise_data').eq('session_id', sessionId).maybeSingle();
    const existing = (typeof current?.data?.exercise_data === 'object' && current.data.exercise_data !== null)
      ? (current.data.exercise_data as Record<string, unknown>)
      : {};
    const patch = hw
      ? { homework_review_data: { code: hw.code, modules: hw.modules, exercises: hw.exercises, student_answers: hw.student_answers, completed: hw.completed, page: 0 } }
      : { homework_review_data: null };
    await supabase.from('session_state').update({ exercise_data: { ...existing, ...patch } }).eq('session_id', sessionId);
  }, [sessionId]);

  // ── Navigare în review (profesor controlează, elev urmărește via Realtime) ────
  const handleReviewNavigate = useCallback(async (newPage: number) => {
    setReviewPage(newPage);
    const current = await supabase.from('session_state').select('exercise_data').eq('session_id', sessionId).maybeSingle();
    const existing = (typeof current?.data?.exercise_data === 'object' && current.data.exercise_data !== null)
      ? (current.data.exercise_data as Record<string, unknown>)
      : {};
    const rd = existing.homework_review_data as Record<string, unknown> | undefined;
    if (!rd) return;
    await supabase.from('session_state').update({
      exercise_data: { ...existing, homework_review_data: { ...rd, page: newPage } },
    }).eq('session_id', sessionId);
  }, [sessionId]);

  // ── Reset XP elev (profesor only) ────────────────────────────────────────────
  const resetXp = useCallback(async () => {
    if (!student?.dbId) return;
    const initialSkills = { speaking: 20, grammar: 15, vocabulary: 30 };
    setStudent((prev) => (prev ? { ...prev, xp: 0, skills: initialSkills } : prev));
    await updateStudentProgress(student.dbId, 0, initialSkills);
  }, [student?.dbId]);

  const handleAddToDraft = useCallback(async () => {
    if (!sessionId) return;
    const ex = (liveState ?? localSession)?.exercise_data ?? {};
    // Preferă pendingDraft (mai recent) față de liveState când Realtime întârzie
    const currentDraft = pendingDraft ?? ((ex.draft_homework as DraftHomework | undefined) ?? { items: [] });
    if (currentDraft.items.length >= 10) return;
    const cv = effectiveState?.current_view;
    let newItem: DraftHomeworkItem | null = null;
    const countOf = (type: string) => currentDraft.items.filter((i) => i.type === type).length + 1;
    if (cv === 'puzzle' && ex.puzzle_data)
      newItem = { type: 'puzzle', data: ex.puzzle_data, label: `🧩 Puzzle #${countOf('puzzle')}`, added_at: new Date().toISOString() };
    else if (cv === 'tense_arena' && ex.time_travel_data)
      newItem = { type: 'time_travel', data: ex.time_travel_data, label: `⏰ Time Travel #${countOf('time_travel')}`, added_at: new Date().toISOString() };
    else if (cv === 'dictation' && ex.dictation_data)
      newItem = { type: 'dictation', data: ex.dictation_data, label: `🎙️ Dictare #${countOf('dictation')}`, added_at: new Date().toISOString() };
    else if (cv === 'writing' && ex.writing_data)
      newItem = { type: 'writing', data: ex.writing_data, label: `✍️ Writing #${countOf('writing')}`, added_at: new Date().toISOString() };
    if (!newItem) return;
    const updatedDraft: DraftHomework = { items: [...currentDraft.items, newItem] };
    const existing = typeof ex === 'object' && ex !== null ? ex : {};
    setPendingDraft(updatedDraft); // optimistic update — apare imediat fără a aştepta Realtime
    await supabase.from('session_state').update({ exercise_data: { ...existing, draft_homework: updatedDraft } }).eq('session_id', sessionId);
    setDraftToast(`${newItem.label} adăugat! (${updatedDraft.items.length}/10)`);
    const t = setTimeout(() => setDraftToast(null), 3500);
    return () => clearTimeout(t);
  }, [sessionId, liveState, localSession, effectiveState, pendingDraft]);

  const handleRemoveDraftItem = useCallback(async (idx: number) => {
    if (!sessionId) return;
    const ex = (liveState ?? localSession)?.exercise_data ?? {};
    const currentDraft = (ex.draft_homework as DraftHomework | undefined) ?? { items: [] };
    const updatedItems = currentDraft.items.filter((_, i) => i !== idx);
    const existing = typeof ex === 'object' && ex !== null ? ex : {};
    setPendingDraft({ items: updatedItems }); // optimistic update
    await supabase.from('session_state').update({ exercise_data: { ...existing, draft_homework: { items: updatedItems } } }).eq('session_id', sessionId);
  }, [sessionId, liveState, localSession]);

  const handleSendDraft = useCallback(async () => {
    if (!student || homeworkSending || !sessionId) return;
    const ex = (liveState ?? localSession)?.exercise_data ?? {};
    const draft = pendingDraft ?? ((ex.draft_homework as DraftHomework | undefined) ?? { items: [] });
    if (draft.items.length === 0) return;
    setHomeworkSending(true);
    try {
      const modules = [...new Set(draft.items.map((i) => i.type === 'time_travel' ? 'tense_arena' : i.type))];
      const { code } = await createHomework({
        studentId: student.dbId,
        teacherId: 'medea',
        exercises: { items: draft.items },
        modules,
      });
      // Golește draft optimistic + DB
      setPendingDraft({ items: [] });
      const existing = typeof ex === 'object' && ex !== null ? ex : {};
      await supabase.from('session_state').update({ exercise_data: { ...existing, draft_homework: { items: [] } } }).eq('session_id', sessionId);
      setHomeworkCode(code);
      const list = await getStudentHomework(student.dbId);
      setStudentHomeworkList(list);
    } catch (e) {
      console.error('[Homework] send draft error', e);
    }
    setHomeworkSending(false);
  }, [student, homeworkSending, sessionId, liveState, localSession, pendingDraft]);

  // Navigare unificată: profesor → update DB + Realtime; elev → navigare locală
  const handleNavigate = useCallback((view: SessionState['current_view']) => {
    if (isTeacher) {
      changeView(view);
    } else {
      setStudentLocalView(view);
    }
  }, [isTeacher, changeView]);

  // ── Router ────────────────────────────────────────────────────────────────────
  if (screen === 'restoring') {
    return <SeedingScreen message="Se reconectează la sesiune..." />;
  }
  if (screen === 'landing') {
    return <Landing onTeacher={() => setScreen('teacher-login')} onStudent={() => setScreen('student-join')} />;
  }
  if (screen === 'teacher-login') {
    return <TeacherLogin onSuccess={handleTeacherLoginSuccess} onBack={() => setScreen('landing')} />;
  }
  if (screen === 'teacher-home') {
    return (
      <TeacherHome
        onOpenRoom={handleSelectStudent}
        onBack={() => setScreen(portfolioReturnScreen ?? 'teacher-login')}
        backLabel={portfolioReturnScreen === 'app' ? '← Înapoi la sesiune' : '← Înapoi'}
      />
    );
  }
  if (screen === 'room-setup') {
    return (
      <RoomSetup
        studentName={selectedDBStudent?.name ?? ''}
        onStart={handleRoomStart}
        onBack={() => setScreen('teacher-home')}
      />
    );
  }
  if (screen === 'seeding') return <SeedingScreen />;
  if (screen === 'loading-profile') return <SeedingScreen message="Se încarcă profilul elevului..." />;
  if (screen === 'student-join') {
    return (
      <div>
        <StudentJoin
          onJoin={handleStudentJoin}
          onBack={() => { setProfileError(''); setScreen('landing'); }}
        />
        {profileError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-5 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 max-w-xs text-center">
            <AlertCircle size={14} className="shrink-0" /> {profileError}
          </div>
        )}
      </div>
    );
  }

  if (!student) return null;

  // ── Derivare date secțiuni din exercise_data ─────────────────────────────────
  const ed = (effectiveState?.exercise_data as Record<string, unknown> | null) ?? {};

  const rawPuzzle = ed.puzzle_data;
  const puzzleData: PuzzleData | null =
    rawPuzzle && typeof rawPuzzle === 'object' && !Array.isArray(rawPuzzle)
      ? (rawPuzzle as PuzzleData)
      : null;

  const puzzleShowTranslation = ed.puzzle_show_translation === true;

  const rawVoyager = ed.voyager_data;
  const voyagerData: VoyagerData | null =
    rawVoyager && typeof rawVoyager === 'object' && !Array.isArray(rawVoyager)
      ? (rawVoyager as VoyagerData)
      : null;

  const rawQuest = ed.quest_data;
  const questData: QuestData | null =
    rawQuest && typeof rawQuest === 'object' && !Array.isArray(rawQuest)
      ? (rawQuest as QuestData)
      : null;

  // Callbacks simpli (nu useCallback — sunt după early return)
  const handleVoyagerGenerated = (_data: VoyagerData | null) => {};
  const handleQuestGenerated = (_data: QuestData | null) => {};

  // ── Progres elev (live, din exercise_data via Realtime) ───────────────────────
  const rawPuzzleProgress = ed.student_puzzle_progress;
  const studentPuzzleProgress: PuzzleProgress | null =
    rawPuzzleProgress && typeof rawPuzzleProgress === 'object' && !Array.isArray(rawPuzzleProgress)
      ? (rawPuzzleProgress as PuzzleProgress)
      : null;

  const rawVoyagerTasks = ed.student_voyager_tasks;
  const studentVoyagerTasks: boolean[] | null = Array.isArray(rawVoyagerTasks)
    ? (rawVoyagerTasks as boolean[])
    : null;

  const rawQuestBoosters = ed.student_quest_boosters;
  const studentQuestBoosters: string[] | null = Array.isArray(rawQuestBoosters)
    ? (rawQuestBoosters as string[])
    : null;

  const rawTimeTravel = ed.time_travel_data;
  const timeTravelData: TimeTravelData | null = Array.isArray(rawTimeTravel)
    ? (rawTimeTravel as TimeTravelData)
    : null;

  const rawStudentTTAnswers = ed.student_time_travel_answers;
  const studentTimeTravelAnswers: StudentTimeTravelAnswers | null =
    rawStudentTTAnswers &&
    typeof rawStudentTTAnswers === 'object' &&
    Array.isArray((rawStudentTTAnswers as StudentTimeTravelAnswers).lockedAnswers)
      ? (rawStudentTTAnswers as StudentTimeTravelAnswers)
      : null;

  const rawDictation = ed.dictation_data;
  const dictationData: DictationData | null =
    rawDictation && typeof rawDictation === 'object' && !Array.isArray(rawDictation)
      ? (rawDictation as DictationData)
      : null;

  const rawStudentDictation = ed.student_dictation_answer;
  const studentDictationAnswer: StudentDictationAnswer | null =
    rawStudentDictation && typeof rawStudentDictation === 'object' && !Array.isArray(rawStudentDictation)
      ? (rawStudentDictation as StudentDictationAnswer)
      : null;

  const studentDictationDraft: string | null =
    typeof ed.student_dictation_draft === 'string' ? ed.student_dictation_draft : null;

  const rawWriting = ed.writing_data;
  const writingData: WritingData | null =
    rawWriting && typeof rawWriting === 'object' && !Array.isArray(rawWriting)
      ? (rawWriting as WritingData)
      : null;

  const rawStudentWriting = ed.student_writing_answer;
  const studentWritingAnswer: StudentWritingAnswer | null =
    rawStudentWriting && typeof rawStudentWriting === 'object' && !Array.isArray(rawStudentWriting)
      ? (rawStudentWriting as StudentWritingAnswer)
      : null;

  const studentWritingDraft: string | null =
    typeof ed.student_writing_draft === 'string' ? ed.student_writing_draft : null;

  // ── App principal ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 selection:bg-pink-200 selection:text-pink-900 font-sans antialiased overflow-x-hidden">
      {/* Overlay sesiune închisă (pentru elev) */}
      {sessionClosedVisible && <SessionClosedOverlay stats={sessionEndStats} />}

      {xpToast !== null && <XpToast amount={xpToast} onDone={() => setXpToast(null)} />}
      {showLevelUp && <LevelUpToast onDone={() => setShowLevelUp(false)} />}

      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-pink-600 overflow-hidden bg-white shrink-0 shadow-sm">
              <img src={teacherPhoto} alt="Medéa" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div>
              <h1 className="text-sm sm:text-lg font-black text-slate-800 tracking-tight italic uppercase leading-none">
                <span className="hidden sm:inline">English with Medéa</span>
                <span className="sm:hidden">E. w. Medéa</span>
              </h1>
              <p className="hidden sm:block text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Creative Fluency Missions</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-full px-3 py-1.5">
              <Hash size={11} className="text-slate-400" />
              <span className="text-[10px] font-black text-slate-600 tracking-widest">{roomCode}</span>
            </div>
            {!isTeacher && (
              <div className="hidden sm:flex items-center gap-1.5 bg-pink-50 border border-pink-100 rounded-full px-3 py-1">
                <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-pulse" />
                <span className="text-[9px] font-black text-pink-600 uppercase tracking-widest">{currentView}</span>
              </div>
            )}
            <span className={`px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-widest ${isTeacher ? 'bg-pink-600 text-white' : 'bg-slate-900 text-white'}`}>
              {isTeacher ? 'Profesor' : student.name}
            </span>

            {/* Mute/Unmute sunete — vizibil pentru toți */}
            <button
              onClick={handleToggleSound}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 transition-all"
              title={soundMuted ? 'Activează sunetele' : 'Dezactivează sunetele'}
            >
              {soundMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            {/* Profesor: buton LogOut (închide sesiunea pentru toți) */}
            {isTeacher && (
              <button
                onClick={handleTeacherLogout}
                disabled={isSaving}
                className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-all disabled:opacity-40"
                title="Închide sesiunea"
              >
                <LogOut size={16} />
              </button>
            )}

            {/* Elev: buton Ieși (local leave, sesiunea rămâne în DB) */}
            {!isTeacher && (
              <button
                onClick={handleStudentLeave}
                className="p-2 rounded-xl bg-slate-100 hover:bg-amber-50 text-slate-400 hover:text-amber-500 transition-all"
                title="Ieși din cameră"
              >
                <DoorOpen size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="pt-4 pb-28 sm:pt-6">
        {currentView === 'dashboard' && (
          <DashboardView
            student={student}
            vocabularyLoot={vocabularyLoot}
            addVocab={addVocab}
            addXp={addXp}
            onNavigate={handleNavigate}
            isTeacher={isTeacher}
            onResetXp={isTeacher ? resetXp : undefined}
            onAdjustSkill={isTeacher ? adjustSkill : undefined}
            onGoToPortfolio={isTeacher ? () => { setPortfolioReturnScreen(screen); setScreen('teacher-home'); } : undefined}
            onGoToHomework={isTeacher ? () => changeView('homework_portfolio') : undefined}
            onDeleteVocabWord={student.dbId ? handleDeleteVocabWord : undefined}
          />
        )}
        {currentView === 'homework_portfolio' && (
          <HomeworkPortfolioView
            isTeacher={isTeacher}
            draft={activeDraft}
            studentName={student.name}
            homeworks={studentHomeworkList}
            loading={studentHomeworkLoading}
            onBack={isTeacher ? () => changeView('dashboard') : undefined}
            onRemoveDraftItem={handleRemoveDraftItem}
            onSendDraft={() => setShowDraftPreview(true)}
            onReviewHomework={handleReviewHomework}
            onDeleteHomework={isTeacher ? async (id) => {
              await deleteHomework(id);
              setStudentHomeworkList((prev) => prev.filter((h) => h.id !== id));
            } : undefined}
          />
        )}
        {currentView === 'puzzle' && (
          <ErrorBoundary moduleName="Puzzle">
          <PuzzleView
            student={student}
            onBack={isTeacher ? () => changeView('dashboard') : undefined}
            isTeacher={isTeacher}
            sessionId={sessionId}
            puzzleData={puzzleData}
            onPuzzleGenerated={handlePuzzleGenerated}
            addXp={addXp}
            studentProgress={studentPuzzleProgress}
            showTranslation={puzzleShowTranslation}
          />
          </ErrorBoundary>
        )}
        {currentView === 'voyager' && (
          <ErrorBoundary moduleName="Voyager">
          <VoyagerView
            student={student}
            onBack={isTeacher ? () => changeView('dashboard') : undefined}
            isTeacher={isTeacher}
            sessionId={sessionId}
            voyagerData={voyagerData}
            onVoyagerGenerated={handleVoyagerGenerated}
            addXp={addXp}
            studentTaskProgress={studentVoyagerTasks}
            cachedImageUrl={cachedVoyagerImageUrl}
          />
          </ErrorBoundary>
        )}
        {currentView === 'arena' && (
          <ErrorBoundary moduleName="Quest">
          <ArenaView
            student={student}
            onBack={isTeacher ? () => changeView('dashboard') : undefined}
            isTeacher={isTeacher}
            sessionId={sessionId}
            questData={questData}
            onQuestGenerated={handleQuestGenerated}
            addXp={addXp}
            studentBoosterProgress={studentQuestBoosters}
          />
          </ErrorBoundary>
        )}
        {currentView === 'tense_arena' && (
          <ErrorBoundary moduleName="Time Travel">
          <TimeTravelView
            studentLevel={student.level}
            ageSegment={student.age_segment ?? 'adult'}
            sessionId={sessionId}
            timeTravelData={timeTravelData}
            isTeacher={isTeacher}
            onBack={isTeacher ? () => changeView('dashboard') : undefined}
            addXp={addXp}
            studentAnswers={studentTimeTravelAnswers}
          />
          </ErrorBoundary>
        )}
        {currentView === 'dictation' && (
          <ErrorBoundary moduleName="Dictation">
          <DictationView
            student={student}
            onBack={isTeacher ? () => changeView('dashboard') : undefined}
            isTeacher={isTeacher}
            sessionId={sessionId}
            dictationData={dictationData}
            onDictationGenerated={() => {}}
            addXp={addXp}
            studentDictationAnswer={studentDictationAnswer}
            studentDictationDraft={studentDictationDraft}
          />
          </ErrorBoundary>
        )}
        {currentView === 'writing' && (
          <ErrorBoundary moduleName="Writing">
          <WritingView
            student={student}
            onBack={isTeacher ? () => changeView('dashboard') : undefined}
            isTeacher={isTeacher}
            sessionId={sessionId}
            writingData={writingData}
            addXp={addXp}
            studentWritingAnswer={studentWritingAnswer}
            studentWritingDraft={studentWritingDraft}
          />
          </ErrorBoundary>
        )}
      </main>

      {isTeacher && (
        <>
          <TeacherControlPanel
            currentView={currentView}
            onChangeView={changeView}
            isSaving={isSaving}
            roomCode={roomCode}
            onAddToDraft={(['puzzle', 'tense_arena', 'writing'] as SessionState['current_view'][]).includes(currentView) ? handleAddToDraft : undefined}
            draftCount={activeDraft?.items?.length ?? 0}
            hasExerciseData={
              (currentView === 'puzzle' && !!effectiveState?.exercise_data?.puzzle_data) ||
              (currentView === 'tense_arena' && !!effectiveState?.exercise_data?.time_travel_data) ||
              (currentView === 'writing' && !!effectiveState?.exercise_data?.writing_data)
            }
          />
          <DebugPanel errors={debugErrors} />
        </>
      )}

      {/* Homework review overlay — profesor și elev */}
      {(() => {
        const reviewData = effectiveState?.exercise_data?.homework_review_data;
        if (!reviewData || typeof reviewData !== 'object') return null;
        const rd = reviewData as ReviewData;
        const studentPage = rd.page ?? 0;
        return (
          <HomeworkReviewOverlay
            data={rd}
            onClose={isTeacher ? () => handleReviewHomework(null) : undefined}
            isTeacher={isTeacher}
            page={isTeacher ? reviewPage : studentPage}
            onNavigate={isTeacher ? handleReviewNavigate : undefined}
          />
        );
      })()}

      {/* Draft preview modal — confirmare trimitere */}
      {showDraftPreview && (() => {
        const draftItems = activeDraft?.items ?? [];
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[28px] p-7 max-w-sm w-full shadow-2xl space-y-5">
              <div>
                <h3 className="text-lg font-black uppercase italic tracking-tighter text-slate-800">Trimite tema</h3>
                {student && <p className="text-xs text-slate-400 mt-0.5">pentru <span className="font-bold text-slate-600">{student.name}</span></p>}
              </div>
              {draftItems.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tema va conține {draftItems.length} {draftItems.length === 1 ? 'exercițiu' : 'exerciții'}:</p>
                  {draftItems.map((item, idx) => {
                    const colors: Record<string, string> = { puzzle: 'bg-purple-50 text-purple-700', time_travel: 'bg-indigo-50 text-indigo-700', dictation: 'bg-rose-50 text-rose-700', writing: 'bg-violet-50 text-violet-700' };
                    const icons: Record<string, string> = { puzzle: '🧩', time_travel: '⏰', dictation: '🎙️', writing: '✍️' };
                    return (
                      <div key={idx} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${colors[item.type] ?? 'bg-slate-50 text-slate-600'}`}>
                        <span>{icons[item.type] ?? '📚'}</span>
                        <span className="text-xs font-black">{item.label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-3">Niciun exercițiu în draft.</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowDraftPreview(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl font-black text-sm text-slate-500 hover:border-slate-300 transition-all"
                >
                  Anulează
                </button>
                <button
                  onClick={() => { setShowDraftPreview(false); handleSendDraft(); }}
                  disabled={draftItems.length === 0 || homeworkSending}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {homeworkSending ? <Loader2 size={15} className="animate-spin" /> : '📤 Trimite'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Draft toast — teacher + student */}
      {draftToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] bg-emerald-600 text-white px-5 py-2.5 rounded-full shadow-lg font-bold text-sm whitespace-nowrap">
          ✓ {draftToast}
        </div>
      )}

      {/* Homework code modal */}
      {homeworkCode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[28px] p-8 max-w-sm w-full shadow-2xl space-y-5 text-center">
            <div className="text-5xl">📤</div>
            <div>
              <h3 className="text-xl font-black uppercase italic tracking-tighter text-slate-800">Temă creată!</h3>
              <p className="text-xs text-slate-400 mt-1">Dă-i elevului acest cod:</p>
            </div>
            <div className="bg-slate-900 rounded-2xl p-5">
              <p className="text-4xl font-black text-white tracking-[0.25em]">{homeworkCode}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { navigator.clipboard.writeText(homeworkCode); setHwCopied(true); setTimeout(() => setHwCopied(false), 2000); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm uppercase tracking-widest transition-all border ${hwCopied ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 hover:border-violet-300 text-slate-600 hover:text-violet-600'}`}
              >
                {hwCopied ? <><CheckCheck size={15} /> Copiat!</> : <><Copy size={15} /> Copiază</>}
              </button>
              <button
                onClick={() => { setHomeworkCode(null); setHwCopied(false); }}
                className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-violet-700 transition-all"
              >
                Gata
              </button>
            </div>
            <a
              href="/homework"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:underline"
            >
              <ExternalLink size={11} /> Deschide /homework
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
