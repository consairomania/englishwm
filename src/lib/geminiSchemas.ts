import { z } from 'zod';

// ─── Puzzle ───────────────────────────────────────────────────────────────────
export const PuzzleSchema = z.object({
  chosen_topic: z.string().optional(),
  sentence: z.string().min(1),
  sentence_ro: z.string().min(1),
  scrambled: z.array(z.string()).min(2),
  instruction_en: z.string().min(1),
  hint_en: z.string().min(1),
  hint_ro: z.string().min(1),
});

// ─── Voyager ──────────────────────────────────────────────────────────────────
export const VoyagerSchema = z.object({
  chosen_topic: z.string().optional(),
  image_prompt: z.string().min(1),
  story_en: z.string().min(1),
  story_ro: z.string().min(1),
  vocabulary: z
    .array(z.object({ en: z.string().min(1), ro: z.string().min(1) }))
    .length(5),
  tasks: z
    .array(z.object({ en: z.string().min(1), ro: z.string().min(1) }))
    .length(3),
});

// ─── Quest ────────────────────────────────────────────────────────────────────
export const QuestSchema = z.object({
  chosen_topic: z.string().optional(),
  title: z.string().min(1),
  mission_brief_en: z.string().min(1),
  mission_brief_ro: z.string().min(1),
  roleplay_setup_en: z.string().min(1),
  roleplay_setup_ro: z.string().min(1),
  vocabulary_to_use: z.array(z.string().min(1)).length(5),
  boosters: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        xp: z.number().int().positive(),
      })
    )
    .length(4),
});

// ─── Time Travel ──────────────────────────────────────────────────────────────
export const TimeTravelItemSchema = z.object({
  sentence_en: z.string().min(1),
  sentence_ro: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  correct_index: z.number().int().min(0).max(3),
});

export const TimeTravelSchema = z.object({
  chosen_topic: z.string().optional(),
  exercises: z.array(TimeTravelItemSchema).min(1).max(20),
});

// ─── Dictation ────────────────────────────────────────────────────────────────
export const DictationSchema = z.object({
  sentence_en: z.string().min(1),
  sentence_ro: z.string().min(1),
  hint_ro: z.string().min(1),
  topic: z.string().optional(),
});

export const DictationEvalSchema = z.object({
  score: z.enum(['exact', 'partial', 'wrong']),
  feedback_en: z.string().min(1),
  feedback_ro: z.string().min(1),
});
