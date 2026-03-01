'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Check, X, Loader2, BookOpen, Clock, Mic, PenLine, Puzzle,
  ChevronLeft, ChevronRight, Send, Copy, CheckCheck,
} from 'lucide-react';
import { getHomework, submitHomeworkAnswers } from '@/app/actions/homework';
import { evaluateDictationAnswer, evaluateWriting } from '@/app/actions/gemini';
import type { HomeworkAssignment } from '@/types/database';
import type { TimeTravelItem, PuzzleData, DictationData, WritingData, WritingFeedback } from '@/types/database';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fillBlanks(sentence: string, option: string): string {
  const words = option.split(' ');
  const blanks = (sentence.match(/___/g) || []).length;
  if (blanks <= 1) return sentence.replace('___', option);
  let result = sentence;
  for (let i = 0; i < blanks; i++) {
    const word = i === blanks - 1 ? words.slice(i).join(' ') : (words[i] ?? '');
    result = result.replace('___', word);
  }
  return result;
}

// ─── Time Travel Section ──────────────────────────────────────────────────────
function TimeTravelSection({
  items,
  answers,
  onChange,
  submitted,
}: {
  items: TimeTravelItem[];
  answers: number[];
  onChange: (idx: number, optIdx: number) => void;
  submitted: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const item = items[current];
  if (!item) return null;
  const answered = answers.filter((a) => a >= 0).length;

  return (
    <div className="bg-white rounded-[24px] shadow-lg border border-slate-50 overflow-hidden">
      <div className="bg-slate-900 px-5 py-4 flex items-center gap-3">
        <Clock className="text-indigo-400 shrink-0" size={18} />
        <div className="flex-1">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Gramatică · {answered}/{items.length} răspunsuri
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            disabled={current === 0}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition-all"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-black text-white px-1">
            {current + 1}/{items.length}
          </span>
          <button
            onClick={() => setCurrent((c) => Math.min(items.length - 1, c + 1))}
            disabled={current === items.length - 1}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition-all"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="text-center space-y-1.5">
          <p className="text-base font-black text-slate-800 leading-snug">
            {answers[current] >= 0
              ? fillBlanks(item.sentence_en, item.options[answers[current]]!)
              : item.sentence_en}
          </p>
          <p className="text-sm text-slate-400 italic">{item.sentence_ro}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {item.options.map((opt, oi) => {
            const selected = answers[current] === oi;
            const correct = submitted && oi === item.correct_index;
            const wrong = submitted && selected && oi !== item.correct_index;
            return (
              <button
                key={oi}
                onClick={() => !submitted && onChange(current, oi)}
                disabled={submitted}
                className={`px-3 py-2.5 rounded-xl text-sm font-bold text-left transition-all border ${
                  correct
                    ? 'bg-emerald-100 border-emerald-400 text-emerald-800'
                    : wrong
                    ? 'bg-rose-100 border-rose-400 text-rose-800'
                    : selected
                    ? 'bg-indigo-100 border-indigo-400 text-indigo-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
                } disabled:cursor-default`}
              >
                <span className="flex items-center gap-2">
                  {submitted && correct && <Check size={13} className="shrink-0 text-emerald-600" />}
                  {submitted && wrong && <X size={13} className="shrink-0 text-rose-500" />}
                  {opt}
                </span>
              </button>
            );
          })}
        </div>

        {submitted && (
          <p className={`text-xs font-bold text-center ${answers[current] === item.correct_index ? 'text-emerald-600' : 'text-rose-600'}`}>
            {answers[current] === item.correct_index
              ? '✓ Corect!'
              : `✗ Răspuns corect: "${item.options[item.correct_index]}"`}
          </p>
        )}

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 flex-wrap">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === current
                  ? 'bg-indigo-500 scale-125'
                  : submitted
                  ? answers[i] === items[i]!.correct_index
                    ? 'bg-emerald-400'
                    : answers[i] >= 0
                    ? 'bg-rose-400'
                    : 'bg-slate-300'
                  : answers[i] >= 0
                  ? 'bg-indigo-300'
                  : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Puzzle Section ────────────────────────────────────────────────────────────
function PuzzleSection({
  puzzle,
  selected,
  onToggle,
  submitted,
}: {
  puzzle: PuzzleData;
  selected: string[];
  onToggle: (word: string, inSelected: boolean) => void;
  submitted: boolean;
}) {
  const reconstructed = selected.join(' ');
  const correct = submitted ? reconstructed.toLowerCase() === puzzle.sentence.toLowerCase() : null;
  const remaining = puzzle.scrambled.filter((w) => !selected.includes(w));

  return (
    <div className="bg-white rounded-[24px] shadow-lg border border-slate-50 overflow-hidden">
      <div className="bg-pink-600 px-5 py-4 flex items-center gap-3">
        <Puzzle className="text-white/80 shrink-0" size={18} />
        <div>
          <p className="text-[10px] font-black text-pink-200 uppercase tracking-widest">Puzzle — Ordonează cuvintele</p>
        </div>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-500 italic text-center">{puzzle.sentence_ro}</p>
        <p className="text-[10px] text-slate-400 text-center">{puzzle.instruction_en}</p>

        {/* Selected words */}
        <div className="min-h-[52px] bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 px-3 py-2 flex flex-wrap gap-1.5 items-center">
          {selected.length === 0 && (
            <span className="text-slate-300 text-sm italic w-full text-center">Apasă cuvintele de mai jos...</span>
          )}
          {selected.map((w, i) => (
            <button
              key={i}
              onClick={() => !submitted && onToggle(w, true)}
              disabled={submitted}
              className="px-2.5 py-1 bg-pink-100 text-pink-800 border border-pink-300 rounded-lg font-bold text-sm hover:bg-rose-100 transition-all disabled:cursor-default"
            >
              {w}
            </button>
          ))}
        </div>

        {/* Remaining words */}
        {!submitted && (
          <div className="flex flex-wrap gap-1.5 justify-center">
            {remaining.map((w, i) => (
              <button
                key={i}
                onClick={() => onToggle(w, false)}
                className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold text-sm hover:border-pink-400 hover:bg-pink-50 transition-all"
              >
                {w}
              </button>
            ))}
          </div>
        )}

        {submitted && (
          <div className={`rounded-xl p-3 text-center ${correct ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'}`}>
            {correct ? (
              <p className="text-emerald-700 font-black text-sm">✓ Corect! Propoziție completă.</p>
            ) : (
              <>
                <p className="text-rose-700 font-bold text-xs">Varianta ta: <em>{reconstructed || '(nimic)'}</em></p>
                <p className="text-emerald-700 font-bold text-xs mt-1">Corect: <strong>{puzzle.sentence}</strong></p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dictation Section ────────────────────────────────────────────────────────
function DictationSection({
  dictation,
  text,
  onChange,
  feedback,
  submitted,
}: {
  dictation: DictationData;
  text: string;
  onChange: (v: string) => void;
  feedback: { score: string; feedback_en: string; feedback_ro: string } | null;
  submitted: boolean;
}) {
  return (
    <div className="bg-white rounded-[24px] shadow-lg border border-slate-50 overflow-hidden">
      <div className="bg-orange-500 px-5 py-4 flex items-center gap-3">
        <Mic className="text-white/80 shrink-0" size={18} />
        <p className="text-[10px] font-black text-orange-100 uppercase tracking-widest">
          Traducere — Scrie în engleză
        </p>
      </div>
      <div className="p-5 space-y-3">
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 space-y-1">
          <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Traduce în engleză:</p>
          <p className="text-base font-black text-slate-800">{dictation.sentence_ro}</p>
          <p className="text-xs text-slate-500 italic">Indiciu: {dictation.hint_ro}</p>
        </div>
        <textarea
          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 outline-none font-medium text-slate-800 text-sm resize-none focus:border-orange-400 transition-colors"
          rows={3}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Scrie propoziția în engleză..."
          disabled={submitted}
        />
        {feedback && (
          <div className={`rounded-xl p-3 space-y-1 border ${
            feedback.score === 'exact' ? 'bg-emerald-50 border-emerald-200'
            : feedback.score === 'partial' ? 'bg-amber-50 border-amber-200'
            : 'bg-rose-50 border-rose-200'
          }`}>
            <p className={`text-xs font-black ${
              feedback.score === 'exact' ? 'text-emerald-700'
              : feedback.score === 'partial' ? 'text-amber-700'
              : 'text-rose-700'
            }`}>
              {feedback.score === 'exact' ? '✓ Perfect!' : feedback.score === 'partial' ? '~ Parțial corect' : '✗ Necesită îmbunătățire'}
            </p>
            <p className="text-xs text-slate-600">{feedback.feedback_ro}</p>
            <p className="text-[10px] text-slate-400 italic">{feedback.feedback_en}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Writing Section ──────────────────────────────────────────────────────────
function WritingSection({
  writing,
  text,
  onChange,
  feedback,
  submitted,
}: {
  writing: WritingData;
  text: string;
  onChange: (v: string) => void;
  feedback: WritingFeedback | null;
  submitted: boolean;
}) {
  return (
    <div className="bg-white rounded-[24px] shadow-lg border border-slate-50 overflow-hidden">
      <div className="bg-violet-600 px-5 py-4 flex items-center gap-3">
        <PenLine className="text-white/80 shrink-0" size={18} />
        <p className="text-[10px] font-black text-violet-200 uppercase tracking-widest">Writing</p>
      </div>
      <div className="p-5 space-y-3">
        <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
          <p className="text-[9px] font-black text-violet-500 uppercase tracking-widest mb-1">Subiect</p>
          <p className="text-base font-black text-slate-800">{writing.prompt_en}</p>
          <p className="text-sm text-slate-500 italic mt-1">{writing.prompt_ro}</p>
        </div>
        <textarea
          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 outline-none font-medium text-slate-800 text-sm resize-none focus:border-violet-400 transition-colors leading-relaxed"
          rows={7}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Scrie răspunsul tău în engleză..."
          disabled={submitted}
        />
        <div className="text-[10px] text-slate-400">
          {text.split(/\s+/).filter(Boolean).length} cuvinte
        </div>
        {feedback && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1 bg-violet-50 border border-violet-100 rounded-xl p-3 text-center">
                <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">Scor</p>
                <p className="text-2xl font-black text-violet-700">{feedback.score}<span className="text-sm">/100</span></p>
              </div>
              <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">CEFR</p>
                <p className="text-2xl font-black text-slate-700">{feedback.cefr_estimate}</p>
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
              <p className="text-xs text-slate-700">{feedback.overall_comment_ro}</p>
            </div>
            {feedback.grammar_errors.length > 0 && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 space-y-1.5">
                <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Greșeli</p>
                {feedback.grammar_errors.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="line-through text-rose-600 font-bold">{e.error}</span>
                    <span className="text-slate-400">→</span>
                    <span className="text-emerald-700 font-bold">{e.correction}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Completed Screen ─────────────────────────────────────────────────────────
function CompletedScreen({ xp, correct, total }: { xp: number; correct: number; total: number }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="bg-white rounded-[28px] p-8 shadow-xl max-w-sm w-full space-y-5 text-center">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-black uppercase italic tracking-tighter text-slate-800">
          Temă trimisă!
        </h2>
        {total > 0 && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
            <p className="text-3xl font-black text-indigo-700">{correct}/{total}</p>
            <p className="text-xs text-indigo-500 font-bold uppercase tracking-widest">răspunsuri corecte</p>
          </div>
        )}
        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
          <p className="text-3xl font-black text-violet-700">+{xp} XP</p>
          <p className="text-xs text-violet-500 font-bold uppercase tracking-widest">XP câștigat</p>
        </div>
        <p className="text-sm text-slate-500">Profesorul tău a primit răspunsurile tale. Bravo! 🌟</p>
        <a
          href="/homework"
          className="block w-full py-3 bg-violet-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-violet-700 transition-all"
        >
          Înapoi la start
        </a>
      </div>
    </div>
  );
}

// ─── Main Exercise Page ────────────────────────────────────────────────────────
export default function HomeworkExercisePage() {
  const params = useParams();
  const code = ((params.code as string) ?? '').toUpperCase();

  const [hw, setHw] = useState<HomeworkAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);

  // Time Travel answers: index per question (-1 = unanswered)
  const [ttAnswers, setTtAnswers] = useState<number[]>([]);

  // Puzzle: selected words in order
  const [puzzleSelected, setPuzzleSelected] = useState<string[]>([]);

  // Dictation text + feedback
  const [dictText, setDictText] = useState('');
  const [dictFeedback, setDictFeedback] = useState<{ score: string; feedback_en: string; feedback_ro: string } | null>(null);

  // Writing text + feedback
  const [writingText, setWritingText] = useState('');
  const [writingFeedback, setWritingFeedback] = useState<WritingFeedback | null>(null);

  // Results
  const [finalXp, setFinalXp] = useState(0);
  const [finalCorrect, setFinalCorrect] = useState(0);
  const [finalTotal, setFinalTotal] = useState(0);

  useEffect(() => {
    getHomework(code).then((data) => {
      if (!data) {
        setNotFound(true);
      } else {
        setHw(data);
        if (data.completed) {
          setSubmitted(true);
          setFinalXp(data.xp_earned);
        }
        // Init Time Travel answers (support both old flat format and new items format)
        const exItems = data.exercises.items;
        if (Array.isArray(exItems)) {
          // New format: { items: DraftHomeworkItem[] }
          let ttLen = 0;
          for (const item of exItems as { type: string; data: unknown }[]) {
            if (item.type === 'time_travel' && Array.isArray(item.data)) {
              ttLen += (item.data as unknown[]).length;
            }
          }
          if (ttLen > 0) setTtAnswers(new Array(ttLen).fill(-1));
        } else {
          const ttData = data.exercises.time_travel_data;
          if (Array.isArray(ttData)) {
            setTtAnswers(new Array((ttData as unknown[]).length).fill(-1));
          }
        }
      }
      setLoading(false);
    });
  }, [code]);

  const handleSubmit = async () => {
    if (!hw || submitting) return;
    setSubmitting(true);

    const ex = hw.exercises;
    const answers: Record<string, unknown> = {};
    let xp = 0;
    let correct = 0;
    let total = 0;

    // Extrage exerciții (suport format nou items[] și format vechi flat)
    let allTtItems: TimeTravelItem[] = [];
    let puzzleDataForSubmit: PuzzleData | null = null;
    let dictDataForSubmit: DictationData | null = null;
    let writingDataForSubmit: WritingData | null = null;

    if (Array.isArray(ex.items)) {
      for (const item of ex.items as { type: string; data: unknown }[]) {
        if (item.type === 'time_travel' && Array.isArray(item.data))
          allTtItems = [...allTtItems, ...(item.data as TimeTravelItem[])];
        else if (item.type === 'puzzle' && !puzzleDataForSubmit)
          puzzleDataForSubmit = item.data as PuzzleData;
        else if (item.type === 'dictation' && !dictDataForSubmit)
          dictDataForSubmit = item.data as DictationData;
        else if (item.type === 'writing' && !writingDataForSubmit)
          writingDataForSubmit = item.data as WritingData;
      }
    } else {
      if (Array.isArray(ex.time_travel_data)) allTtItems = ex.time_travel_data as TimeTravelItem[];
      if (ex.puzzle_data) puzzleDataForSubmit = ex.puzzle_data as PuzzleData;
      if (ex.dictation_data) dictDataForSubmit = ex.dictation_data as DictationData;
      if (ex.writing_data) writingDataForSubmit = ex.writing_data as WritingData;
    }

    // ── Time Travel ──────────────────────────────────────────────────────────
    if (allTtItems.length > 0) {
      const ttCorrect = allTtItems.filter((item, i) => ttAnswers[i] === item.correct_index).length;
      total += allTtItems.length;
      correct += ttCorrect;
      xp += ttCorrect * 50;
      answers.time_travel_answers = ttAnswers;
      answers.time_travel_score = `${ttCorrect}/${allTtItems.length}`;
    }

    // ── Puzzle ───────────────────────────────────────────────────────────────
    const puzzleData = puzzleDataForSubmit;
    if (puzzleData) {
      const reconstructed = puzzleSelected.join(' ');
      const isCorrect = reconstructed.toLowerCase() === puzzleData.sentence.toLowerCase();
      total += 1;
      if (isCorrect) { correct += 1; xp += 150; }
      answers.puzzle_answer = reconstructed;
      answers.puzzle_correct = isCorrect;
    }

    // ── Dictation (AI eval) ──────────────────────────────────────────────────
    if (dictDataForSubmit && dictText.trim()) {
      try {
        const fb = await evaluateDictationAnswer(dictDataForSubmit.sentence_en, dictText.trim());
        setDictFeedback(fb);
        answers.dictation_answer = dictText.trim();
        answers.dictation_feedback = fb;
        total += 1;
        if (fb.score === 'exact') { correct += 1; xp += 150; }
        else if (fb.score === 'partial') { xp += 75; }
      } catch {
        answers.dictation_answer = dictText.trim();
      }
    }

    // ── Writing (AI eval) ────────────────────────────────────────────────────
    if (writingDataForSubmit && writingText.trim()) {
      try {
        const level = (ex.level as string) ?? 'B1';
        const fb = await evaluateWriting(writingDataForSubmit.prompt_en, writingText.trim(), level);
        setWritingFeedback(fb);
        answers.writing_answer = writingText.trim();
        answers.writing_feedback = fb;
        xp += Math.round((fb.score / 100) * 200);
      } catch {
        answers.writing_answer = writingText.trim();
      }
    }

    setFinalXp(xp);
    setFinalCorrect(correct);
    setFinalTotal(total);

    try {
      await submitHomeworkAnswers(code, answers, xp);
      setSubmitted(true);
    } catch (e) {
      console.error('[Homework] Submit error', e);
    }
    setSubmitting(false);
  };

  // ── Early exits ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Loader2 className="animate-spin text-violet-400" size={32} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="bg-white rounded-[28px] p-8 shadow-xl max-w-sm w-full space-y-4 text-center">
          <div className="text-5xl">🔍</div>
          <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">
            Codul nu există
          </h2>
          <p className="text-sm text-slate-500">
            Verifică codul primit de la profesor și încearcă din nou.
          </p>
          <a
            href="/homework"
            className="block w-full py-3 bg-violet-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-violet-700 transition-all"
          >
            ← Încearcă din nou
          </a>
        </div>
      </div>
    );
  }

  if (submitted) {
    return <CompletedScreen xp={finalXp} correct={finalCorrect} total={finalTotal} />;
  }

  if (!hw) return null;

  const ex = hw.exercises;
  // Suport format nou { items: [...] } și format vechi plat
  let ttData: TimeTravelItem[] | null = null;
  let puzzleData: PuzzleData | null = null;
  let dictData: DictationData | null = null;
  let writingData: WritingData | null = null;
  if (Array.isArray(ex.items)) {
    const allTt: TimeTravelItem[] = [];
    for (const item of ex.items as { type: string; data: unknown }[]) {
      if (item.type === 'time_travel' && Array.isArray(item.data))
        allTt.push(...(item.data as TimeTravelItem[]));
      else if (item.type === 'puzzle' && !puzzleData)
        puzzleData = item.data as PuzzleData;
      else if (item.type === 'dictation' && !dictData)
        dictData = item.data as DictationData;
      else if (item.type === 'writing' && !writingData)
        writingData = item.data as WritingData;
    }
    if (allTt.length > 0) ttData = allTt;
  } else {
    ttData = Array.isArray(ex.time_travel_data) ? (ex.time_travel_data as TimeTravelItem[]) : null;
    puzzleData = ex.puzzle_data ? (ex.puzzle_data as PuzzleData) : null;
    dictData = ex.dictation_data ? (ex.dictation_data as DictationData) : null;
    writingData = ex.writing_data ? (ex.writing_data as WritingData) : null;
  }

  const hasContent = ttData || puzzleData || dictData || writingData;
  const moduleIcons: Record<string, string> = {
    tense_arena: '⏰', puzzle: '🧩', dictation: '🎙️', writing: '✍️',
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xl border-b border-slate-100 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="text-violet-600 shrink-0" size={18} />
            <div>
              <h1 className="font-black text-slate-800 text-sm uppercase tracking-tighter">Tema mea</h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                {hw.modules.map((m) => moduleIcons[m] ?? '📚').join(' ')} · {hw.modules.length} modul{hw.modules.length !== 1 ? 'e' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-black text-slate-500 text-sm tracking-widest">{code}</span>
            <button
              onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-violet-100 text-slate-400 hover:text-violet-600 transition-all"
            >
              {copied ? <CheckCheck size={13} className="text-violet-600" /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      </div>

      {/* Exercises */}
      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {!hasContent ? (
          <div className="bg-white rounded-[24px] p-8 shadow-lg text-center space-y-2">
            <p className="text-3xl">📭</p>
            <p className="text-sm font-bold text-slate-500">Niciun exercițiu în această temă.</p>
          </div>
        ) : (
          <>
            {ttData && ttData.length > 0 && (
              <TimeTravelSection
                items={ttData}
                answers={ttAnswers}
                onChange={(idx, optIdx) =>
                  setTtAnswers((prev) => { const n = [...prev]; n[idx] = optIdx; return n; })
                }
                submitted={false}
              />
            )}
            {puzzleData && (
              <PuzzleSection
                puzzle={puzzleData}
                selected={puzzleSelected}
                onToggle={(word, inSelected) => {
                  if (inSelected) {
                    setPuzzleSelected((prev) => prev.filter((w) => w !== word));
                  } else {
                    setPuzzleSelected((prev) => [...prev, word]);
                  }
                }}
                submitted={false}
              />
            )}
            {dictData && (
              <DictationSection
                dictation={dictData}
                text={dictText}
                onChange={setDictText}
                feedback={dictFeedback}
                submitted={false}
              />
            )}
            {writingData && (
              <WritingSection
                writing={writingData}
                text={writingText}
                onChange={setWritingText}
                feedback={writingFeedback}
                submitted={false}
              />
            )}
          </>
        )}
      </div>

      {/* Submit button */}
      {hasContent && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 px-4 py-4">
          <div className="max-w-lg mx-auto">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-4 bg-violet-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-violet-700 transition-all disabled:opacity-60 shadow-lg"
            >
              {submitting ? (
                <><Loader2 className="animate-spin" size={16} /> Se evaluează și se trimite...</>
              ) : (
                <><Send size={16} /> Trimite temele</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
