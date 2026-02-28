'use client';

import { useState, useEffect, useRef } from 'react';
import { Clock, Loader2, CheckCircle2, XCircle, Sparkles, RefreshCw, User } from 'lucide-react';
import { FormattedLabel } from '@/components/FormattedLabel';
import { generateTimeTravelContent, clearTimeTravelContent } from '@/app/actions/gemini';
import { playWrongSound } from '@/lib/sound';
import { supabase } from '@/lib/supabase/client';
import type { TimeTravelData } from '@/types/database';

const ENGLISH_TENSES = [
  'Present Simple',
  'Present Continuous',
  'Present Perfect',
  'Present Perfect Continuous',
  'Past Simple',
  'Past Continuous',
  'Past Perfect',
  'Past Perfect Continuous',
  'Future Simple (will)',
  'Future Continuous',
  'Future Perfect',
  'Future Perfect Continuous',
  'First Conditional',
  'Second Conditional',
  'Third Conditional',
] as const;

const WRONG_FLASH_MS = 1500;
const N = 15; // numărul de exerciții generat

export type StudentTimeTravelAnswers = {
  timeTravelKey?: string | null;
  lockedAnswers: (number | null)[];
  flashWrong: (number | null)[];
  wrongEventTs: number | null;
};

type TimeTravelViewProps = {
  studentLevel: string;
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
  // Starea React este asincronă: un al doilea click rapid poate trece garda înainte
  // de re-render. Refs sunt citite sincron → previn race condition.
  const lockedRef = useRef<(number | null)[]>(Array(N).fill(null));
  const flashRef = useRef<(number | null)[]>(Array(N).fill(null));
  const xpAwardedRef = useRef<boolean[]>(Array(N).fill(false));

  // ── Stare generare (profesorul) ───────────────────────────────────────────────
  const [topic, setTopic] = useState('');
  const [tense, setTense] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  // Debounce ref pentru sync la DB
  const syncRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resetare completă când profesorul trimite exerciții NOI.
  // IMPORTANT: nu folosim [timeTravelData] ca dep — e obiect nou la fiecare Realtime update
  // (chiar dacă conținutul e identic), ceea ce ar reseta starea elevului după fiecare sync.
  // Folosim un string-key derivat din prima propoziție: egal prin valoare, nu prin referință.
  const timeTravelKey = timeTravelData?.[0]?.sentence_en ?? null;
  useEffect(() => {
    if (timeTravelKey && studentAnswers?.timeTravelKey === timeTravelKey) {
      // Același exercițiu, pagina a fost reîncărcată → restaurează răspunsurile salvate
      const restored = studentAnswers.lockedAnswers;
      lockedRef.current = [...restored];
      xpAwardedRef.current = restored.map((v) => v !== null);
      flashRef.current = Array(N).fill(null);
      setLockedAnswers([...restored]);
      setFlashWrong(Array(N).fill(null));
      setWrongEventTs(null);
    } else {
      // Exercițiu nou sau prima încărcare fără răspunsuri salvate → reset complet
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
    // Garda sincronă via refs — imună la race condition de dublu-click rapid
    if (lockedRef.current[sentenceIdx] !== null) return;   // deja rezolvată
    if (flashRef.current[sentenceIdx] !== null) return;    // în curs de flash

    const item = timeTravelData[sentenceIdx];

    if (optionIdx === item.correct_index) {
      // Marchează SINCRON ca rezolvat înainte de orice re-render
      lockedRef.current = lockedRef.current.map((v, i) => (i === sentenceIdx ? optionIdx : v));
      // XP acordat o singură dată per propoziție (ref sincron)
      if (!xpAwardedRef.current[sentenceIdx]) {
        xpAwardedRef.current[sentenceIdx] = true;
        addXp(50);
      }
      setLockedAnswers((prev) => prev.map((v, i) => (i === sentenceIdx ? optionIdx : v)));
    } else {
      // Marchează SINCRON ca „în flash" înainte de orice re-render
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
  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenError('');
    try {
      await generateTimeTravelContent(
        sessionId,
        studentLevel,
        topic.trim() || undefined,
        tense || undefined
      );
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Eroare la generare. Încearcă din nou.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClear = async () => {
    await clearTimeTravelContent(sessionId);
  };

  // ── Stare de afișare ──────────────────────────────────────────────────────────
  // Profesorul vede starea elevului (din DB via Realtime); elevul vede starea lui locală
  const displayLocked: (number | null)[] = isTeacher
    ? (studentAnswers?.lockedAnswers ?? Array(N).fill(null))
    : lockedAnswers;
  const displayFlash: (number | null)[] = isTeacher
    ? (studentAnswers?.flashWrong ?? Array(N).fill(null))
    : flashWrong;

  const studentHasAnswered =
    displayLocked.some((v) => v !== null) || displayFlash.some((v) => v !== null);

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
            <input
              className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-400 transition-all font-bold text-slate-700 text-sm placeholder:font-medium placeholder:text-slate-300"
              placeholder="Subiect / scenariu... (ex: At the airport)"
              value={topic}
              onChange={(e) => { setTopic(e.target.value); setGenError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              disabled={isGenerating}
            />
            <select
              className="sm:w-56 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 outline-none focus:border-indigo-400 transition-all font-bold text-slate-700 text-sm cursor-pointer"
              value={tense}
              onChange={(e) => { setTense(e.target.value); setGenError(''); }}
              disabled={isGenerating}
            >
              <option value="">Auto (mix timpuri)</option>
              {ENGLISH_TENSES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shrink-0"
            >
              {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={15} />}
              {isGenerating ? 'Generez...' : timeTravelData ? 'Re-generează' : 'Generează'}
            </button>
          </div>
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
            <FormattedLabel
              level={studentLevel}
              en="Wait for the teacher to launch Time Travel..."
              ro="Așteaptă ca profesorul să lanseze Time Travel..."
              dark
            />
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

            // Propoziția cu blank completat (doar când e rezolvată)
            const displaySentenceEn = isSolved
              ? item.sentence_en.replace('___', item.options[displayLocked[sentenceIdx]!])
              : item.sentence_en;

            return (
              <div
                key={sentenceIdx}
                className="bg-white p-5 rounded-[24px] shadow-lg border border-slate-50 space-y-4"
              >
                {/* Număr propoziție + iconiță rezultat */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md">
                    {String(sentenceIdx + 1).padStart(2, '0')}
                  </span>
                  {isSolved && <CheckCircle2 size={14} className="text-emerald-500 ml-auto" />}
                  {isFlashing && <XCircle size={14} className="text-rose-500 ml-auto" />}
                </div>

                {/* Propoziție bilingvă */}
                <FormattedLabel
                  level={studentLevel}
                  en={displaySentenceEn}
                  ro={item.sentence_ro}
                />

                {/* Opțiuni 2×2 */}
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
                      // Profesor: vizual-only, fără interacțiune
                      btnClass += 'bg-slate-50 border-slate-100 text-slate-500 cursor-default';
                    } else {
                      // Elev: interactiv
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
