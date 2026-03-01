'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen } from 'lucide-react';

export default function HomeworkLanding() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleEnter = () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      setError('Introdu codul primit de la profesor.');
      return;
    }
    router.push(`/homework/${trimmed}`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="bg-white rounded-[28px] p-8 shadow-xl max-w-sm w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto">
            <BookOpen className="text-violet-600" size={28} />
          </div>
          <h1 className="text-2xl font-black uppercase italic tracking-tighter text-slate-800">
            Tema mea
          </h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            English with Medéa
          </p>
        </div>

        <div className="space-y-3">
          <input
            className="w-full px-4 py-4 rounded-xl bg-slate-50 border-2 border-slate-200 outline-none font-black text-slate-800 text-center text-3xl uppercase tracking-[0.25em] focus:border-violet-400 transition-colors"
            placeholder="ABC123"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleEnter()}
            maxLength={6}
            autoFocus
          />
          {error && (
            <p className="text-rose-500 text-xs font-bold text-center">{error}</p>
          )}
          <button
            onClick={handleEnter}
            disabled={!code.trim()}
            className="w-full bg-violet-600 text-white py-3.5 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-violet-700 transition-all disabled:opacity-40 shadow-lg"
          >
            Deschide tema →
          </button>
        </div>

        <p className="text-[10px] text-slate-400 text-center leading-relaxed">
          Profesorul tău ți-a dat un cod de 6 caractere.<br />
          Introdu-l mai sus pentru a accesa exercițiile.
        </p>
      </div>
    </div>
  );
}
