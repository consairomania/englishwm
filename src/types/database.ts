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
  current_view: 'dashboard' | 'puzzle' | 'voyager' | 'arena' | 'tense_arena' | 'dictation' | 'writing' | 'homework_portfolio';
  exercise_data: Record<string, unknown>;
  teacher_pings: unknown[];
  updated_at: string;
};

export interface DraftHomeworkItem {
  type: 'puzzle' | 'time_travel' | 'dictation' | 'writing';
  data: unknown;
  label: string;
  added_at: string;
}

export interface DraftHomework {
  items: DraftHomeworkItem[];
}

export type VocabWord = {
  en: string;
  ro: string;
  source: 'voyager' | 'quest';
  date: string;
};

export type Student = {
  id: string;
  name: string;
  level: string;
  age_segment: 'child' | 'teenager' | 'adult';
  xp: number;
  skills: { speaking: number; grammar: number; vocabulary: number };
  notes: string;
  vocabulary: VocabWord[];
  created_at: string;
};

export type PuzzleData = {
  sentence: string;
  sentence_ro: string;
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

export type DictationSentence = {
  sentence_en: string;
  sentence_ro: string;
};

export type DictationData = {
  sentences: DictationSentence[];
  hint_ro: string;
  topic: string;
};

export type StudentDictationAnswer = {
  text: string;
  score: 'exact' | 'partial' | 'wrong';
  feedback_en: string;
  feedback_ro: string;
  submitted_at: string;
};

export type SessionLog = {
  id: string;
  session_id: string;
  student_id: string;
  date: string;
  xp_earned: number;
  modules_used: string[];
  vocabulary_learned: { en: string; ro: string }[];
  tenses_practiced: string[];
  notes: string;
  created_at: string;
};

export type WritingData = {
  prompt_en: string;
  prompt_ro: string;
  example_en: string;
  topic: string;
};

export type WritingFeedback = {
  grammar_errors: { error: string; correction: string }[];
  vocabulary_suggestions: { original: string; better: string }[];
  cefr_estimate: string;
  overall_comment_en: string;
  overall_comment_ro: string;
  score: number;
};

export type StudentWritingAnswer = {
  text: string;
  feedback: WritingFeedback;
  submitted_at: string;
};

export type HomeworkAssignment = {
  id: string;
  code: string;
  student_id: string;
  teacher_id: string;
  exercises: Record<string, unknown>;
  modules: string[];
  due_date: string | null;
  completed: boolean;
  student_answers: Record<string, unknown>;
  xp_earned: number;
  created_at: string;
  completed_at: string | null;
};

// Erori structurate pentru debug panel
export type DebugError = {
  source: string;
  code: string | null;
  message: string;
  isRls: boolean;
  isJsonb: boolean;
  timestamp: string;
};
