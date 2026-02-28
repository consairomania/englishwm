'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  Trophy,
  Image as ImageIcon,
  Sword,
  BookOpen,
  Loader2,
  ChevronRight,
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
import { TimeTravelView, StudentTimeTravelAnswers } from '@/components/features/TimeTravel';
import {
  getAllStudents,
  addStudent as dbAddStudent,
  deleteStudent as dbDeleteStudent,
  updateStudentProgress,
  updateStudentDetails,
  getStudentById,
} from '@/lib/studentService';
import type { SessionState, DebugError, Student as DBStudent, PuzzleData, VoyagerData, QuestData, TimeTravelData } from '@/types/database';
import {
  generatePuzzleContent,
  clearPuzzleContent,
  setPuzzleShowTranslation,
  generateVoyagerContent,
  clearVoyagerContent,
  deleteVoyagerImage,
  generateQuestContent,
  clearQuestContent,
} from '@/app/actions/gemini';
import { verifyTeacherCredentials } from '@/app/actions/auth';

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
  xp: number;
  nextLevelXp: number;
  skills: { speaking: number; grammar: number; vocabulary: number };
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
    xp: s.xp,
    nextLevelXp: 1000,
    skills: s.skills,
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
}: {
  onOpenRoom: (student: DBStudent) => void;
  onBack: () => void;
}) {
  const [students, setStudents] = useState<DBStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newLevel, setNewLevel] = useState('B1');
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [addError, setAddError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLevel, setEditLevel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAllStudents().then((data) => {
      setStudents(data);
      setLoading(false);
    });
  }, []);

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
    setEditingId(s.id);
    setEditName(s.name);
    setEditLevel(s.level);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditLevel('');
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editingId) return;
    setSaving(true);
    const ok = await updateStudentDetails(editingId, editName, editLevel);
    if (ok) {
      setStudents((prev) =>
        prev.map((s) => s.id === editingId ? { ...s, name: editName.trim(), level: editLevel } : s)
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
          <div className="w-14 h-14 bg-pink-100 rounded-2xl flex items-center justify-center mx-auto">
            <User className="text-pink-600" size={26} />
          </div>
          <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800">
            Portofoliu Elevi
          </h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            English with Medéa
          </p>
        </div>

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
              <div key={s.id} className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-100">
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
                        {s.level} · {s.xp} XP · Speaking {s.skills.speaking}% · Grammar {s.skills.grammar}%
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => handleStartEdit(s)}
                        className="p-2 rounded-xl bg-white hover:bg-blue-50 text-slate-300 hover:text-blue-500 transition-all border border-slate-100"
                        title="Editează"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        disabled={deleting === s.id}
                        className="p-2 rounded-xl bg-white hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-all border border-slate-100 disabled:opacity-40"
                        title="Șterge"
                      >
                        {deleting === s.id ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

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

// ─── Session Closed Overlay (pentru elev) ─────────────────────────────────────
function SessionClosedOverlay() {
  return (
    <div className="fixed inset-0 z-200 bg-slate-900/80 backdrop-blur-md flex items-center justify-center">
      <div className="bg-white rounded-[32px] p-8 shadow-2xl text-center space-y-4 max-w-xs mx-4">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto">
          <WifiOff className="text-slate-500" size={28} />
        </div>
        <h2 className="text-xl font-black text-slate-800 italic uppercase tracking-tighter">
          Sesiunea a fost închisă
        </h2>
        <p className="text-slate-500 text-sm font-bold">
          Profesorul a terminat lecția. Vei fi redirecționat...
        </p>
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
}: {
  student: Student;
  vocabularyLoot: string[];
  addVocab: (word: string) => void;
  addXp: (amount: number) => void;
  onNavigate: (view: SessionState['current_view']) => void;
  isTeacher: boolean;
  onResetXp?: () => void;
  onAdjustSkill?: (skill: keyof Student['skills'], delta: number) => void;
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
              <span>Progression</span><span>{Math.round(xpPercent)}%</span>
            </div>
            <div className="w-full bg-black/20 h-2.5 rounded-full overflow-hidden">
              <div className="bg-yellow-400 h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${xpPercent}%` }} />
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [userSelection, setUserSelection] = useState<{ word: string; idx: number }[]>([]);
  const [isCorrect, setIsCorrect] = useState(false);
  const [isWrong, setIsWrong] = useState(false);
  const [xpAwarded, setXpAwarded] = useState(false);
  const progressSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (isGenerating) return;
    setIsGenerating(true);
    setGenError('');
    try {
      const { data, chosenTopic } = await generatePuzzleContent(sessionId, topic.trim(), student.level);
      onPuzzleGenerated(data);
      setTopic(topic.trim() ? '' : chosenTopic);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Eroare necunoscută. Încearcă din nou.');
    }
    setIsGenerating(false);
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
              disabled={isGenerating}
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-5 py-3 bg-purple-600 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-purple-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
            >
              {isGenerating
                ? <Loader2 className="animate-spin" size={16} />
                : topic.trim() ? <Send size={15} /> : <Shuffle size={15} />}
              {isGenerating ? 'Generez...' : topic.trim() ? 'Build' : 'Random'}
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
            <>
              <p className="text-slate-700 font-black text-sm uppercase tracking-widest">
                Aștepți puzzle-ul...
              </p>
              <div className="flex justify-center">
                <Loader2 className="animate-spin text-purple-400" size={22} />
              </div>
              <p className="text-slate-400 font-medium text-xs">
                Profesorul pregătește o propoziție pentru tine
              </p>
            </>
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  // Stare locală optimistă — doar profesorul actualizează (UI snap înainte ca Realtime să confirme)
  const [localTasks, setLocalTasks] = useState<boolean[]>([false, false, false]);
  // Dacă avem deja un URL (din DB sau cache), nu pornim cu spinner
  const [imageLoading, setImageLoading] = useState(!voyagerData?.image_url && !cachedImageUrl);
  const [imageError, setImageError] = useState(false);
  // Ref pentru a nu reseta imageLoading la primul mount (când imaginea există deja)
  const isFirstRender = useRef(true);

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
    if (isGenerating) return;
    setIsGenerating(true);
    setGenError('');
    try {
      const { data, chosenTopic } = await generateVoyagerContent(sessionId, topic.trim(), student.level);
      onVoyagerGenerated(data);
      setTopic(topic.trim() ? '' : chosenTopic);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Eroare la generare. Încearcă din nou.');
    }
    setIsGenerating(false);
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
              disabled={isGenerating}
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-5 py-3 bg-pink-600 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-pink-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md self-end"
            >
              {isGenerating ? <Loader2 className="animate-spin" size={16} /> : topic.trim() ? <Sparkles size={15} /> : <Shuffle size={15} />}
              {isGenerating ? 'Generez...' : topic.trim() ? 'Build' : 'Random'}
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
              : <FormattedLabel level={student.level} en="Waiting for the scene..." ro="Se pregătește scena..." dark />
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  // Stare locală optimistă — doar profesorul actualizează
  const [localClaimed, setLocalClaimed] = useState<string[]>([]);

  useEffect(() => {
    setLocalClaimed([]);
  }, [questData?.title]);

  // Starea efectivă: merge DB cu local optimist
  const effectiveClaimed = new Set([...(studentBoosterProgress ?? []), ...localClaimed]);

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenError('');
    try {
      const { data, chosenTopic } = await generateQuestContent(sessionId, topic.trim(), student.level);
      onQuestGenerated(data);
      setTopic(topic.trim() ? '' : chosenTopic);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Eroare la generare. Încearcă din nou.');
    }
    setIsGenerating(false);
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
              disabled={isGenerating}
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
            >
              {isGenerating ? <Loader2 className="animate-spin" size={16} /> : topic.trim() ? <Sword size={15} /> : <Shuffle size={15} />}
              {isGenerating ? 'Generez...' : topic.trim() ? 'Launch' : 'Random'}
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
            : <FormattedLabel level={student.level} en="Wait for the teacher to launch the mission..." ro="Așteaptă ca profesorul să lanseze misiunea..." dark />
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

// ─── Teacher Control Panel ────────────────────────────────────────────────────
function TeacherControlPanel({
  currentView,
  onChangeView,
  isSaving,
  roomCode,
}: {
  currentView: SessionState['current_view'];
  onChangeView: (view: SessionState['current_view']) => void;
  isSaving: boolean;
  roomCode: string;
}) {
  const views = [
    { id: 'dashboard' as const, label: 'DASH', icon: User },
    { id: 'voyager' as const, label: 'IMAGE', icon: ImageIcon },
    { id: 'puzzle' as const, label: 'PUZZLE', icon: PuzzleIcon },
    { id: 'arena' as const, label: 'QUEST', icon: Sword },
    { id: 'tense_arena' as const, label: 'TIME', icon: Clock },
  ];
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

// ─── Root Page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [screen, setScreen] = useState<AppScreen>('restoring');
  const [isTeacher, setIsTeacher] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [roomCode, setRoomCode] = useState<string>('');
  const [localSession, setLocalSession] = useState<SessionState | null>(null);
  const [debugErrors, setDebugErrors] = useState<DebugError[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [vocabularyLoot, setVocabularyLoot] = useState<string[]>([]);
  const [xpToast, setXpToast] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedDBStudent, setSelectedDBStudent] = useState<DBStudent | null>(null);
  const [profileError, setProfileError] = useState('');
  const [soundMuted, setSoundMutedState] = useState<boolean>(() => {
    try { return localStorage.getItem('ewm_sound_muted') === 'true'; } catch { return false; }
  });
  const [sessionClosedVisible, setSessionClosedVisible] = useState(false);
  const sessionClosedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  }, []);

  // ── Sincronizează flagul de mute la nivelul modulului sound.ts ──────────────
  useEffect(() => { setSoundMuted(soundMuted); }, [soundMuted]);

  const handleToggleSound = () => {
    const next = !soundMuted;
    setSoundMutedState(next);
    try { localStorage.setItem('ewm_sound_muted', String(next)); } catch {}
  };

  // Ref pentru oglindirea badge-ului XP pe ecranul profesorului
  const lastXpEventTsRef = useRef<number>(0);
  // Ref pentru deduplicarea sunetului de răspuns greșit pe ecranul profesorului
  const lastWrongEventTsRef = useRef<number>(0);

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
    if (ev && ev.ts !== lastXpEventTsRef.current) {
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
    (data: PuzzleData | null) => {
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
      setSessionClosedVisible(true);
      sessionClosedTimerRef.current = setTimeout(() => {
        sessionClosedTimerRef.current = null;
        if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
        clearStoredSession();
        resetAppState();
        setScreen('landing');
      }, 3000);
    }
  }, [liveState, screen, isTeacher, resetAppState]);

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
      // 1. Resetează XP-ul elevului la 0 (XP valid doar per sesiune; skill-urile rămân)
      if (student?.dbId) {
        await updateStudentProgress(student.dbId, 0, student.skills);
      }

      // 2. Șterge imaginea Voyager din Storage (dacă există) și marchează sesiunea ca închisă
      const { data: current } = await supabase
        .from('session_state')
        .select('exercise_data')
        .eq('session_id', sessionId)
        .maybeSingle();
      const existing =
        typeof current?.exercise_data === 'object' && current.exercise_data !== null
          ? (current.exercise_data as Record<string, unknown>)
          : {};
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

  // ── Reset XP elev (profesor only) ────────────────────────────────────────────
  const resetXp = useCallback(async () => {
    if (!student?.dbId) return;
    const initialSkills = { speaking: 20, grammar: 15, vocabulary: 30 };
    setStudent((prev) => (prev ? { ...prev, xp: 0, skills: initialSkills } : prev));
    await updateStudentProgress(student.dbId, 0, initialSkills);
  }, [student?.dbId]);

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
    return <TeacherHome onOpenRoom={handleSelectStudent} onBack={() => setScreen('teacher-login')} />;
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

  // ── App principal ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 selection:bg-pink-200 selection:text-pink-900 font-sans antialiased overflow-x-hidden">
      {/* Overlay sesiune închisă (pentru elev) */}
      {sessionClosedVisible && <SessionClosedOverlay />}

      {xpToast !== null && <XpToast amount={xpToast} onDone={() => setXpToast(null)} />}

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
          />
        )}
        {currentView === 'puzzle' && (
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
        )}
        {currentView === 'voyager' && (
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
        )}
        {currentView === 'arena' && (
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
        )}
        {currentView === 'tense_arena' && (
          <TimeTravelView
            studentLevel={student.level}
            sessionId={sessionId}
            timeTravelData={timeTravelData}
            isTeacher={isTeacher}
            onBack={isTeacher ? () => changeView('dashboard') : undefined}
            addXp={addXp}
            studentAnswers={studentTimeTravelAnswers}
          />
        )}
      </main>

      {isTeacher && (
        <>
          <TeacherControlPanel
            currentView={currentView}
            onChangeView={changeView}
            isSaving={isSaving}
            roomCode={roomCode}
          />
          <DebugPanel errors={debugErrors} />
        </>
      )}
    </div>
  );
}
