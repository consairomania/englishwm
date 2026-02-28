export type Profile = {
  id: string;
  full_name: string | null;
  role: 'teacher' | 'student';
  xp_total: number;
};

export type Session = {
  id: string;
  name: string;
  created_at: string;
};

export type SessionState = {
  session_id: string;
  current_view: 'dashboard' | 'puzzle' | 'voyager' | 'arena' | 'tense_arena';
  exercise_data: Record<string, unknown>;
  teacher_pings: unknown[];
  updated_at: string;
};

export type Student = {
  id: string;
  name: string;
  level: string;
  xp: number;
  skills: { speaking: number; grammar: number; vocabulary: number };
  created_at: string;
};

export type PuzzleData = {
  sentence: string;
  scrambled: string[];
  instruction_en: string;
  hint_en: string;
  hint_ro: string;
};

export type VoyagerData = {
  image_url: string | null;
  image_path: string | null;
  image_prompt: string;
  story_en: string;
  story_ro: string;
  vocabulary: { en: string; ro: string }[];
  tasks: { en: string; ro: string }[];
};

export type QuestData = {
  title: string;
  mission_brief_en: string;
  mission_brief_ro: string;
  roleplay_setup_en: string;
  roleplay_setup_ro: string;
  vocabulary_to_use: string[];
  boosters: { id: string; label: string; xp: number }[];
};

export type TimeTravelItem = {
  sentence_en: string;
  sentence_ro: string;
  options: string[];
  correct_index: number;
};

export type TimeTravelData = TimeTravelItem[];

// Erori structurate pentru debug panel
export type DebugError = {
  source: string;
  code: string | null;
  message: string;
  isRls: boolean;
  isJsonb: boolean;
  timestamp: string;
};
