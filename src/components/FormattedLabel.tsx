'use client';

// Componentă pentru etichete bilingve: Engleză BOLD sus, Română dedesubt italic
type FormattedLabelProps = {
  level?: string;
  en: string;
  ro: string;
  dark?: boolean;
  forceEnglish?: boolean;
};

export function FormattedLabel({
  level,
  en,
  ro,
  dark = false,
  forceEnglish = false,
}: FormattedLabelProps) {
  const roClass = dark ? 'text-pink-200/60' : 'text-slate-500';
  const enClass = dark ? 'text-white' : 'text-slate-900';

  if (forceEnglish) {
    return <strong lang="en" className={`font-black ${enClass}`}>{en}</strong>;
  }

  if (level === 'A1' && (!en || en === ro)) {
    return <strong lang="ro" className={`font-black ${enClass}`}>{ro}</strong>;
  }

  return (
    <div className="flex flex-col text-left leading-tight">
      <strong lang="en" className={`font-black ${enClass} mb-1`}>{en}</strong>
      <span lang="ro" className={`${roClass} font-medium text-[0.85em] italic`}>{ro}</span>
    </div>
  );
}
