'use client';

import { useState, useEffect, useRef } from 'react';
import { Clock, Loader2, CheckCircle2, XCircle, Sparkles, RefreshCw, User, Shuffle, ChevronDown } from 'lucide-react';
import { FormattedLabel } from '@/components/FormattedLabel';
import { generateTimeTravelContent, clearTimeTravelContent, regenerateTimeTravelItem } from '@/app/actions/gemini';
import { playWrongSound } from '@/lib/sound';
import { supabase } from '@/lib/supabase/client';
import type { TimeTravelData } from '@/types/database';
import { AGE_TOPICS } from '@/lib/ageTopics';

type TenseCategory = { label: string; tenses: string[] };

const TENSE_CATEGORIES: TenseCategory[] = [
  {
    label: 'Present Tenses',
    tenses: ['Present Simple', 'Present Continuous', 'Present Perfect', 'Present Perfect Continuous'],
  },
  {
    label: 'Past Tenses',
    tenses: ['Past Simple', 'Past Continuous', 'Past Perfect', 'Past Perfect Continuous'],
  },
  {
    label: 'Future Tenses',
    tenses: ['Future Simple (will)', 'Future Continuous', 'Future Perfect', 'Future Perfect Continuous'],
  },
  {
    label: 'Conditionals',
    tenses: ['Type 0 Conditional', 'First Conditional', 'Second Conditional', 'Third Conditional'],
  },
  {
    label: 'Modal Verbs',
    tenses: ['Should', 'Would', 'Can', 'Could', 'Used to', 'Have to', 'Need to', 'Must', 'May', 'Might', 'Modal + Present Perfect'],
  },
  {
    label: 'Passive Voice',
    tenses: ['Present Simple Passive', 'Past Simple Passive', 'Present Perfect Passive', 'Future Simple Passive', 'Past Perfect Passive', 'Present Continuous Passive'],
  },
  {
    label: 'Other Structures',
    tenses: ['Future in the Past', 'Had better', 'Stative Verbs'],
  },
];

const ALL_TENSES = TENSE_CATEGORIES.flatMap((cat) => cat.tenses);
type EnglishTense = string;

const WRONG_FLASH_MS = 1500;
const N = 15; // numărul de exerciții generat

// ── Nivel CEFR per structură gramaticală ──────────────────────────────────────
const TENSE_LEVELS: Record<string, string> = {
  'Present Simple': 'A1', 'Can': 'A1',
  'Present Continuous': 'A2', 'Past Simple': 'A2', 'Future Simple (will)': 'A2',
  'Could': 'A2', 'Should': 'A2', 'Have to': 'A2', 'Need to': 'A2',
  'Present Perfect': 'B1', 'Past Continuous': 'B1', 'Type 0 Conditional': 'B1',
  'First Conditional': 'B1', 'Would': 'B1', 'Used to': 'B1', 'Must': 'B1',
  'May': 'B1', 'Might': 'B1', 'Present Simple Passive': 'B1', 'Past Simple Passive': 'B1',
  'Stative Verbs': 'B1',
  'Present Perfect Continuous': 'B2', 'Past Perfect': 'B2', 'Future Continuous': 'B2',
  'Second Conditional': 'B2', 'Present Perfect Passive': 'B2', 'Future Simple Passive': 'B2',
  'Future in the Past': 'B2', 'Had better': 'B2',
  'Past Perfect Continuous': 'C1', 'Future Perfect': 'C1', 'Future Perfect Continuous': 'C1',
  'Third Conditional': 'C1', 'Modal + Present Perfect': 'C1', 'Past Perfect Passive': 'C1',
  'Present Continuous Passive': 'C1',
};

const LEVEL_BADGE_COLORS: Record<string, string> = {
  A1: 'bg-emerald-100 text-emerald-700',
  A2: 'bg-lime-100 text-lime-700',
  B1: 'bg-amber-100 text-amber-700',
  B2: 'bg-orange-100 text-orange-700',
  C1: 'bg-purple-100 text-purple-700',
  C2: 'bg-indigo-100 text-indigo-700',
};

// Tense-uri recomandate per nivel CEFR (pentru butonul Surpriză)
const LEVEL_TENSES: Record<string, string[]> = {
  A1: ['Present Simple', 'Can'],
  A2: ['Present Simple', 'Present Continuous', 'Past Simple', 'Future Simple (will)', 'Could', 'Should', 'Have to', 'Need to'],
  B1: ['Present Simple', 'Present Continuous', 'Present Perfect', 'Past Simple', 'Past Continuous',
       'Future Simple (will)', 'Type 0 Conditional', 'First Conditional', 'Would', 'Used to',
       'Must', 'May', 'Might', 'Present Simple Passive', 'Past Simple Passive', 'Stative Verbs'],
  B2: ['Present Perfect', 'Present Perfect Continuous', 'Past Perfect', 'Future Continuous',
       'Second Conditional', 'Modal + Present Perfect', 'Present Perfect Passive',
       'Future Simple Passive', 'Future in the Past', 'Had better'],
  C1: ALL_TENSES,
  C2: ALL_TENSES,
};

function fillBlanks(sentence: string, option: string): string {
  const blanks = (sentence.match(/___/g) || []).length;
  const words = option.trim().split(/\s+/);
  if (blanks <= 1) return sentence.replace('___', option);
  let result = sentence;
  for (let i = 0; i < blanks; i++) {
    const isLast = i === blanks - 1;
    const word = isLast ? words.slice(i).join(' ') : (words[i] ?? '');
    result = result.replace('___', word);
  }
  return result;
}

const TT_WAITING_MESSAGES = [
  'Profesorul configurează exercițiile...',
  'Se generează întrebările gramaticale...',
  'Time Travel e pe drum!',
  'Pregătește-te să călătorești în timp!',
];

function TTWaitingForTeacher() {
  const [msgIdx, setMsgIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setMsgIdx((prev) => (prev + 1) % TT_WAITING_MESSAGES.length);
        setVisible(true);
      }, 400);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-5xl" style={{ animation: 'bounce 2s infinite' }}>⏰</div>
      <p
        className="text-white/70 font-bold text-sm text-center transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {TT_WAITING_MESSAGES[msgIdx]}
      </p>
    </div>
  );
}

export type StudentTimeTravelAnswers = {
  timeTravelKey?: string | null;
  lockedAnswers: (number | null)[];
  flashWrong: (number | null)[];
  wrongEventTs: number | null;
};

type TimeTravelViewProps = {
  studentLevel: string;
  ageSegment?: 'child' | 'teenager' | 'adult';
  sessionId: string;
  timeTravelData: TimeTravelData | null;
  isTeacher: boolean;
  onBack?: () => void;
  addXp: (amount: number) => void;
  /** Răspunsurile live ale elevului — citite din exercise_data de profesor */
  studentAnswers?: StudentTimeTravelAnswers | null;
};

export function TimeTravelView({
  studentLevel,
  ageSegment = 'adult',
  sessionId,
  timeTravelData,
  isTeacher,
  onBack,
  addXp,
  studentAnswers,
}: TimeTravelViewProps) {
  // ── Stare locală vizuală (folosită doar de elev) ─────────────────────────────
  const [lockedAnswers, setLockedAnswers] = useState<(number | null)[]>(Array(N).fill(null));
  const [flashWrong, setFlashWrong] = useState<(number | null)[]>(Array(N).fill(null));
  const [wrongEventTs, setWrongEventTs] = useState<number | null>(null);

  // ── Refs sincrone pentru gardă anti-dublu-click ───────────────────────────────
  const lockedRef = useRef<(number | null)[]>(Array(N).fill(null));
  const flashRef = useRef<(number | null)[]>(Array(N).fill(null));
  const xpAwardedRef = useRef<boolean[]>(Array(N).fill(false));

  // ── Stare generare (profesorul) ───────────────────────────────────────────────
  const [topic, setTopic] = useState('');
  // selectedTenses: [] = Automix (nicio restricție); altfel = tense-urile alese
  const [selectedTenses, setSelectedTenses] = useState<EnglishTense[]>([]);
  const [exerciseCount, setExerciseCount] = useState(15);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [lastChosenTopic, setLastChosenTopic] = useState<string>('');
  const [usedTopics, setUsedTopics] = useState<string[]>([]);

  // Ref pentru click-outside pe dropdown
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce ref pentru sync la DB
  const syncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cooldown timer ref
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Click-outside închide dropdown-ul ────────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  // Resetare completă când profesorul trimite exerciții NOI.
  const timeTravelKey = timeTravelData?.[0]?.sentence_en ?? null;
  useEffect(() => {
    if (timeTravelKey && studentAnswers?.timeTravelKey === timeTravelKey) {
      const restored = studentAnswers.lockedAnswers;
      lockedRef.current = [...restored];
      xpAwardedRef.current = restored.map((v) => v !== null);
      flashRef.current = Array(N).fill(null);
      setLockedAnswers([...restored]);
      setFlashWrong(Array(N).fill(null));
      setWrongEventTs(null);
    } else {
      lockedRef.current = Array(N).fill(null);
      flashRef.current = Array(N).fill(null);
      xpAwardedRef.current = Array(N).fill(false);
      setLockedAnswers(Array(N).fill(null));
      setFlashWrong(Array(N).fill(null));
      setWrongEventTs(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeTravelKey]);

  // ── ELEV: sincronizează răspunsurile în exercise_data → profesor vede live ────
  useEffect(() => {
    if (isTeacher || !sessionId || !timeTravelData) return;
    if (syncRef.current) clearTimeout(syncRef.current);
    syncRef.current = setTimeout(async () => {
      const { data: cur } = await supabase
        .from('session_state')
        .select('exercise_data')
        .eq('session_id', sessionId)
        .maybeSingle();
      const ex =
        typeof cur?.exercise_data === 'object' && cur.exercise_data !== null
          ? (cur.exercise_data as Record<string, unknown>)
          : {};
      await supabase
        .from('session_state')
        .update({
          exercise_data: {
            ...ex,
            student_time_travel_answers: { timeTravelKey, lockedAnswers, flashWrong, wrongEventTs },
          },
        })
        .eq('session_id', sessionId);
    }, 150);
    return () => { if (syncRef.current) clearTimeout(syncRef.current); };
  }, [lockedAnswers, flashWrong, wrongEventTs, isTeacher, sessionId, timeTravelData]);

  // ── Selecție elev ─────────────────────────────────────────────────────────────
  const handleSelect = (sentenceIdx: number, optionIdx: number) => {
    if (!timeTravelData) return;
    if (lockedRef.current[sentenceIdx] !== null) return;
    if (flashRef.current[sentenceIdx] !== null) return;

    const item = timeTravelData[sentenceIdx];

    if (optionIdx === item.correct_index) {
      lockedRef.current = lockedRef.current.map((v, i) => (i === sentenceIdx ? optionIdx : v));
      if (!xpAwardedRef.current[sentenceIdx]) {
        xpAwardedRef.current[sentenceIdx] = true;
        addXp(50);
      }
      setLockedAnswers((prev) => prev.map((v, i) => (i === sentenceIdx ? optionIdx : v)));
    } else {
      flashRef.current = flashRef.current.map((v, i) => (i === sentenceIdx ? optionIdx : v));
      setFlashWrong((prev) => prev.map((v, i) => (i === sentenceIdx ? optionIdx : v)));
      setWrongEventTs(Date.now());
      playWrongSound();
      setTimeout(() => {
        flashRef.current = flashRef.current.map((v, i) => (i === sentenceIdx ? null : v));
        setFlashWrong((prev) => prev.map((v, i) => (i === sentenceIdx ? null : v)));
      }, WRONG_FLASH_MS);
    }
  };

  // ── Generare (profesor) ───────────────────────────────────────────────────────
  // overrideTopic: undefined = folosește topic din state; null = forțat random (fără temă)
  const handleGenerate = async (overrideTenses?: string[], overrideTopic?: string | null) => {
    if (isGenerating || isCoolingDown) return;
    const effectiveTopic = overrideTopic === null ? '' : (overrideTopic !== undefined ? overrideTopic : topic);
    setIsGenerating(true);
    setGenError('');
    try {
      const tensesToPass = overrideTenses ?? (selectedTenses.length > 0 ? selectedTenses : undefined);
      const isRandomGen = !effectiveTopic.trim();
      const { chosenTopic } = await generateTimeTravelContent(
        sessionId,
        studentLevel,
        effectiveTopic.trim() || undefined,
        tensesToPass,
        ageSegment,
        exerciseCount,
        isRandomGen && usedTopics.length > 0 ? usedTopics : undefined
      );
      setLastChosenTopic(chosenTopic);
      if (isRandomGen) {
        setUsedTopics(prev => {
          const next = [...prev, chosenTopic];
          return next.length >= AGE_TOPICS[ageSegment].length ? [] : next;
        });
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Eroare la generare. Încearcă din nou.');
    } finally {
      setIsGenerating(false);
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      setIsCoolingDown(true);
      cooldownRef.current = setTimeout(() => setIsCoolingDown(false), 4000);
    }
  };

  // ── Surpriză: tense-uri random potrivite nivelului elevului ──────────────────
  const handleSurprise = () => {
    if (isGenerating || isCoolingDown) return;
    const levelKey = studentLevel.toUpperCase().substring(0, 2);
    const pool = LEVEL_TENSES[levelKey] ?? ALL_TENSES;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, 5);
    setSelectedTenses(picked);
    setTopic('');
    // Trimitem null ca overrideTopic pentru a evita bug-ul async:
    // setTopic('') nu actualizează state-ul înainte ca handleGenerate să citească topic-ul
    handleGenerate(picked, null);
  };

  const handleClear = async () => {
    await clearTimeTravelContent(sessionId);
  };

  // ── Regenerare item individual (profesor) ─────────────────────────────────────
  const handleRegenerateItem = async (idx: number) => {
    if (regeneratingIdx !== null || isGenerating) return;
    setRegeneratingIdx(idx);
    try {
      const tensesToPass = selectedTenses.length > 0 ? selectedTenses : undefined;
      await regenerateTimeTravelItem(
        sessionId,
        idx,
        studentLevel,
        topic.trim() || undefined,
        tensesToPass,
        ageSegment
      );
    } catch {
      // eroare silențioasă — profesorul poate reîncerca
    } finally {
      setRegeneratingIdx(null);
    }
  };

  // ── Toggle tense în selecție ──────────────────────────────────────────────────
  const toggleTense = (t: EnglishTense) => {
    setSelectedTenses((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const toggleCategory = (label: string) =>
    setOpenCategories((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  const toggleCategoryAll = (cat: TenseCategory) => {
    const allSelected = cat.tenses.every((t) => selectedTenses.includes(t));
    setSelectedTenses((prev) =>
      allSelected
        ? prev.filter((t) => !cat.tenses.includes(t))
        : [...new Set([...prev, ...cat.tenses])]
    );
  };

  // ── Etichetă dropdown ─────────────────────────────────────────────────────────
  const dropdownLabel =
    selectedTenses.length === 0
      ? 'Automix'
      : selectedTenses.length === ALL_TENSES.length
        ? 'Toate timpurile'
        : `${selectedTenses.length} timp${selectedTenses.length !== 1 ? 'uri' : ''}`;

  // ── Stare de afișare ──────────────────────────────────────────────────────────
  const displayLocked: (number | null)[] = isTeacher
    ? (studentAnswers?.lockedAnswers ?? Array(N).fill(null))
    : lockedAnswers;
  const displayFlash: (number | null)[] = isTeacher
    ? (studentAnswers?.flashWrong ?? Array(N).fill(null))
    : flashWrong;

  const studentHasAnswered =
    displayLocked.some((v) => v !== null) || displayFlash.some((v) => v !== null);

  const isRandom = !topic.trim();

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-4 px-4 py-2 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Clock size={22} className="text-indigo-600" />
        <h2 className="text-lg font-black text-slate-800 uppercase italic tracking-tighter flex-1">
          Time Travel
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

      {/* Profesor: formular de generare — mereu vizibil */}
      {isTeacher && (
        <div className="bg-white p-5 rounded-[24px] shadow-lg border border-slate-50 space-y-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Sparkles size={11} className="text-indigo-500" /> Generează exerciții
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Input topic */}
            <input
              className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-400 transition-all font-bold text-slate-700 text-sm placeholder:font-medium placeholder:text-slate-300"
              placeholder="Subiect / scenariu... (lasă gol pentru random)"
              value={topic}
              onChange={(e) => { setTopic(e.target.value); setGenError(''); setLastChosenTopic(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              disabled={isGenerating}
            />

            {/* Dropdown multi-select tense */}
            <div className="relative sm:w-64" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen((v) => !v)}
                disabled={isGenerating}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-400 transition-all font-bold text-slate-700 text-sm cursor-pointer disabled:opacity-40"
              >
                <span>{dropdownLabel}</span>
                <ChevronDown
                  size={14}
                  className={`text-slate-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isDropdownOpen && (
                <div className="absolute top-full mt-1 left-0 w-full bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
                    {/* Automix option */}
                    <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-indigo-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTenses.length === 0}
                        onChange={() => setSelectedTenses([])}
                        className="accent-indigo-600 w-3.5 h-3.5"
                      />
                      <span className="text-sm font-black text-slate-700">Automix</span>
                    </label>
                    <div className="h-px bg-slate-100 mx-2 my-1" />
                    {/* Categorii accordion */}
                    {TENSE_CATEGORIES.map((cat) => {
                      const isOpen = openCategories.has(cat.label);
                      const allSelected = cat.tenses.every((t) => selectedTenses.includes(t));
                      return (
                        <div key={cat.label}>
                          {/* Header categorie */}
                          <div
                            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer select-none"
                            onClick={() => toggleCategory(cat.label)}
                          >
                            <ChevronDown
                              size={11}
                              className={`text-slate-400 transition-transform duration-150 shrink-0 ${isOpen ? '' : '-rotate-90'}`}
                            />
                            <span className="text-xs font-black text-slate-600 uppercase tracking-wide flex-1">{cat.label}</span>
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => toggleCategoryAll(cat)}
                              onClick={(e) => e.stopPropagation()}
                              className="accent-indigo-600 w-3.5 h-3.5 shrink-0"
                              title="Selectează toate"
                            />
                          </div>
                          {/* Tense-uri individuale */}
                          {isOpen && (
                            <div className="ml-4 space-y-0.5">
                              {cat.tenses.map((t) => (
                                <label key={t} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-indigo-50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedTenses.includes(t)}
                                    onChange={() => toggleTense(t)}
                                    className="accent-indigo-600 w-3.5 h-3.5"
                                  />
                                  <span className="text-sm font-medium text-slate-600 flex-1">{t}</span>
                                  {TENSE_LEVELS[t] && (
                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${LEVEL_BADGE_COLORS[TENSE_LEVELS[t]] ?? 'bg-slate-100 text-slate-500'}`}>
                                      {TENSE_LEVELS[t]}
                                    </span>
                                  )}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Input nr. exerciții */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Nr.:</span>
              <input
                type="number"
                min={1}
                max={15}
                value={exerciseCount}
                onChange={(e) => setExerciseCount(Math.max(1, Math.min(15, Number(e.target.value) || 1)))}
                disabled={isGenerating}
                className="w-14 px-2 py-3 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-400 transition-all font-black text-slate-700 text-sm text-center disabled:opacity-40"
              />
            </div>

            {/* Buton Surpriză */}
            <button
              onClick={handleSurprise}
              disabled={isGenerating || isCoolingDown}
              title={`Generează automat 5 tense-uri potrivite nivelului ${studentLevel}`}
              className="px-4 py-3 bg-violet-500 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-violet-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shrink-0"
            >
              🎲 Surpriză
            </button>

            {/* Buton generare */}
            <button
              onClick={() => handleGenerate()}
              disabled={isGenerating || isCoolingDown}
              className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shrink-0"
            >
              {isGenerating ? (
                <Loader2 className="animate-spin" size={16} />
              ) : isCoolingDown ? (
                <Clock size={15} />
              ) : isRandom ? (
                <Shuffle size={15} />
              ) : (
                <RefreshCw size={15} />
              )}
              {isGenerating ? 'Generez...' : isCoolingDown ? 'Cooldown...' : isRandom ? 'Random' : timeTravelData ? 'Re-generează' : 'Generează'}
            </button>
          </div>
          {lastChosenTopic && !genError && (
            <div className="flex items-center gap-2 text-slate-400">
              <Shuffle size={11} className="shrink-0 text-indigo-400" />
              <span className="text-[11px] font-bold">Temă aleasă: <span className="text-indigo-500">{lastChosenTopic}</span></span>
            </div>
          )}
          {genError && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl px-4 py-2.5">
              <XCircle size={13} className="shrink-0" />
              <span className="text-xs font-bold">{genError}</span>
            </div>
          )}
        </div>
      )}

      {/* Stare goală */}
      {!timeTravelData ? (
        <div className="bg-slate-900 p-6 sm:p-10 rounded-[40px] border-t-2 border-indigo-600 shadow-2xl flex flex-col items-center justify-center gap-4 min-h-[240px]">
          <Clock size={48} className="text-white opacity-20" />
          {isTeacher ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-white/50 font-bold text-sm">
                Configurează parametrii de mai sus și apasă Generează.
              </p>
              {isGenerating && <Loader2 className="animate-spin text-indigo-400" size={24} />}
            </div>
          ) : (
            <TTWaitingForTeacher />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Profesor: badge „Elev — Live" + buton Șterge */}
          {isTeacher && (
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <User size={10} className="text-indigo-500" />
                Elev — Live
                {studentHasAnswered ? (
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse inline-block" />
                ) : (
                  <span className="text-slate-300 font-medium normal-case tracking-normal">
                    (niciun răspuns încă)
                  </span>
                )}
              </p>
              <button
                onClick={handleClear}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-400 rounded-xl shadow-sm hover:text-rose-500 hover:border-rose-200 transition-all text-xs font-black uppercase tracking-widest flex items-center gap-1.5"
              >
                <XCircle size={12} /> Șterge
              </button>
            </div>
          )}

          {/* Carduri exerciții */}
          {timeTravelData.map((item, sentenceIdx) => {
            const isSolved = displayLocked[sentenceIdx] !== null;
            const flashIdx = displayFlash[sentenceIdx];
            const isFlashing = flashIdx !== null;

            const displaySentenceEn = isSolved
              ? fillBlanks(item.sentence_en, item.options[displayLocked[sentenceIdx]!])
              : item.sentence_en;

            return (
              <div
                key={sentenceIdx}
                className="bg-white p-5 rounded-[24px] shadow-lg border border-slate-50 space-y-4"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md">
                    {String(sentenceIdx + 1).padStart(2, '0')}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {isSolved && <CheckCircle2 size={14} className="text-emerald-500" />}
                    {isFlashing && <XCircle size={14} className="text-rose-500" />}
                    {isTeacher && (
                      <button
                        onClick={() => handleRegenerateItem(sentenceIdx)}
                        disabled={regeneratingIdx !== null || isGenerating}
                        title="Regenerează acest exercițiu"
                        className={`p-1.5 rounded-lg transition-all disabled:opacity-30 ${
                          regeneratingIdx === sentenceIdx
                            ? 'text-indigo-500 bg-indigo-50'
                            : 'text-slate-300 hover:text-indigo-500 hover:bg-indigo-50'
                        }`}
                      >
                        {regeneratingIdx === sentenceIdx ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <RefreshCw size={12} />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <FormattedLabel
                  level={studentLevel}
                  en={displaySentenceEn}
                  ro={item.sentence_ro}
                />

                <div className="grid grid-cols-2 gap-2">
                  {item.options.map((option, optionIdx) => {
                    let btnClass = 'p-3 rounded-xl border text-sm font-black text-left transition-all ';

                    if (isSolved) {
                      if (optionIdx === displayLocked[sentenceIdx]) {
                        btnClass += 'bg-emerald-50 border-emerald-300 text-emerald-800 cursor-default';
                      } else {
                        btnClass += 'bg-slate-50 border-slate-100 text-slate-300 cursor-default opacity-40';
                      }
                    } else if (isFlashing) {
                      if (optionIdx === flashIdx) {
                        btnClass += 'bg-rose-50 border-rose-300 text-rose-700 cursor-not-allowed';
                      } else {
                        btnClass += 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed opacity-50';
                      }
                    } else if (isTeacher) {
                      btnClass += 'bg-slate-50 border-slate-100 text-slate-500 cursor-default';
                    } else {
                      btnClass +=
                        'bg-slate-50 border-slate-100 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 active:scale-[0.98] cursor-pointer';
                    }

                    return (
                      <button
                        key={optionIdx}
                        onClick={() => !isTeacher && handleSelect(sentenceIdx, optionIdx)}
                        disabled={isSolved || isFlashing || isTeacher}
                        className={btnClass}
                      >
                        <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest block mb-0.5">
                          {['A', 'B', 'C', 'D'][optionIdx]}
                        </span>
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
