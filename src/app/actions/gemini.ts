'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '@/lib/supabase/client';
import type { PuzzleData, VoyagerData, QuestData, TimeTravelData } from '@/types/database';

const GEMINI_TEXT_MODEL = 'gemini-2.5-flash';

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  return new GoogleGenerativeAI(apiKey);
}

async function mergeExerciseData(
  sessionId: string,
  patch: Record<string, unknown>
): Promise<void> {
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
    .update({ exercise_data: { ...existing, ...patch } })
    .eq('session_id', sessionId);
}

// ─── Puzzle ───────────────────────────────────────────────────────────────────
export async function generatePuzzleContent(
  sessionId: string,
  topic: string,
  level: string
): Promise<PuzzleData> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: GEMINI_TEXT_MODEL,
    systemInstruction: `You are an Expert English Teacher creating sentence scramble puzzles.
The student's level is ${level} (CEFR: A1–C2). Adjust complexity accordingly.

TASK: Create ONE coherent English sentence about: "${topic}".

CONSTRAINTS:
- Maximum 12 words total.
- Sentence ends with correct punctuation attached to last word (e.g. "hotel.").
- All words in "scrambled" come from "sentence" — no additions.
- "scrambled" must be in a DIFFERENT order than the sentence.

Return ONLY valid JSON (no markdown) matching exactly:
{ "sentence": string, "scrambled": string[], "instruction_en": string, "hint_en": string, "hint_ro": string }`,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
  } as Parameters<typeof genAI.getGenerativeModel>[0]);

  const result = await model.generateContent(`Create puzzle about: "${topic}"`);
  const text = result.response.text();
  const puzzle = JSON.parse(text) as PuzzleData;

  // Resetăm progresul elevului când profesorul generează un puzzle nou
  await mergeExerciseData(sessionId, { puzzle_data: puzzle, student_puzzle_progress: null });
  return puzzle;
}

export async function clearPuzzleContent(sessionId: string): Promise<void> {
  await mergeExerciseData(sessionId, { puzzle_data: null, student_puzzle_progress: null });
}

// ─── Voyager ──────────────────────────────────────────────────────────────────
export async function generateVoyagerContent(
  sessionId: string,
  topic: string,
  level: string
): Promise<VoyagerData> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: GEMINI_TEXT_MODEL,
    systemInstruction: `You are a Creative English Teacher creating visual storytelling lessons.
Student level: ${level} (CEFR). Topic: "${topic}".

Generate a rich bilingual scene for language learning.

Return ONLY valid JSON (no markdown):
{
  "image_prompt": "Detailed English prompt for image generation (max 30 words, vivid scene description)",
  "story_en": "Short engaging scene story in English (2-3 sentences, level-appropriate)",
  "story_ro": "Romanian translation of the story",
  "vocabulary": [{"en": "word", "ro": "cuvânt"}],
  "tasks": [
    {"en": "Describe 3 objects you see.", "ro": "Descrie 3 obiecte pe care le vezi."},
    {"en": "What are the characters feeling?", "ro": "Ce simt personajele?"},
    {"en": "Make a prediction for the next scene.", "ro": "Prezice ce se va întâmpla."}
  ]
}

Rules:
- vocabulary: exactly 5 words relevant to the scene
- tasks: exactly 3 speaking tasks (use the exact template above, adapted to the scene)
- level-appropriate vocabulary in story_en`,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
  } as Parameters<typeof genAI.getGenerativeModel>[0]);

  const result = await model.generateContent(`Create visual scene about: "${topic}"`);
  const text = result.response.text();
  const generated = JSON.parse(text) as Omit<VoyagerData, 'image_url' | 'image_path'>;

  // Șterge imaginea veche din Storage dacă există
  const { data: current } = await supabase
    .from('session_state')
    .select('exercise_data')
    .eq('session_id', sessionId)
    .maybeSingle();
  const existingEd =
    typeof current?.exercise_data === 'object' && current.exercise_data !== null
      ? (current.exercise_data as Record<string, unknown>)
      : {};
  const oldVoyager = existingEd.voyager_data as Record<string, unknown> | null | undefined;
  if (oldVoyager?.image_path && typeof oldVoyager.image_path === 'string') {
    await supabase.storage.from('lesson-images').remove([oldVoyager.image_path]);
  }

  // Generare imagine cu Imagen 3 (necesită billing activat)
  let imageUrl: string | null = null;
  let imagePath: string | null = null;
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const imgRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [
              { prompt: `${generated.image_prompt}, digital illustration, vibrant colors, educational style for language learning` },
            ],
            parameters: { sampleCount: 1 },
          }),
        }
      );
      if (imgRes.ok) {
        const imgData = await imgRes.json();
        const b64 = imgData?.predictions?.[0]?.bytesBase64Encoded as string | undefined;
        if (b64) {
          const buffer = Buffer.from(b64, 'base64');
          const path = `voyager-${sessionId}-${Date.now()}.png`;
          const { error: uploadErr } = await supabase.storage
            .from('lesson-images')
            .upload(path, buffer, { contentType: 'image/png', upsert: true });
          if (uploadErr) {
            console.error('[Voyager] Eroare upload Storage:', uploadErr.message);
          } else {
            const { data: urlData } = supabase.storage
              .from('lesson-images')
              .getPublicUrl(path);
            imageUrl = urlData.publicUrl;
            imagePath = path;
            console.log('[Voyager] Imagine Imagen 4 Fast urcată OK:', imageUrl);
          }
        } else {
          console.warn('[Voyager] Imagen 4 nu a returnat date imagine');
        }
      } else {
        const errText = await imgRes.text();
        console.error('[Voyager] Imagen 4 API error:', imgRes.status, errText);
      }
    } catch (e) {
      console.error('[Voyager] Excepție la generare/upload imagine:', e);
    }
  }

  const voyagerData: VoyagerData = {
    ...generated,
    image_url: imageUrl,
    image_path: imagePath,
  };
  await mergeExerciseData(sessionId, { voyager_data: voyagerData, student_voyager_tasks: null });
  return voyagerData;
}

// Șterge imaginea din Storage (apelat la logout / clear)
export async function deleteVoyagerImage(imagePath: string): Promise<void> {
  await supabase.storage.from('lesson-images').remove([imagePath]);
}

export async function clearVoyagerContent(sessionId: string): Promise<void> {
  const { data: current } = await supabase
    .from('session_state')
    .select('exercise_data')
    .eq('session_id', sessionId)
    .maybeSingle();
  const existingEd =
    typeof current?.exercise_data === 'object' && current.exercise_data !== null
      ? (current.exercise_data as Record<string, unknown>)
      : {};
  const oldVoyager = existingEd.voyager_data as Record<string, unknown> | null | undefined;
  if (oldVoyager?.image_path && typeof oldVoyager.image_path === 'string') {
    await supabase.storage.from('lesson-images').remove([oldVoyager.image_path]);
  }
  await mergeExerciseData(sessionId, { voyager_data: null, student_voyager_tasks: null });
}

// ─── Quest / Arena ────────────────────────────────────────────────────────────
export async function generateQuestContent(
  sessionId: string,
  topic: string,
  level: string
): Promise<QuestData> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: GEMINI_TEXT_MODEL,
    systemInstruction: `You are an Expert English Coach creating immersive roleplay quests.
Student level: ${level} (CEFR). Context/topic: "${topic}".

Create an engaging mission scenario for English practice.

Return ONLY valid JSON (no markdown):
{
  "title": "Quest title (English, max 5 words)",
  "mission_brief_en": "Mission briefing in English (2-3 sentences, level-appropriate)",
  "mission_brief_ro": "Romanian translation of mission brief",
  "roleplay_setup_en": "Roleplay scenario setup in English (1-2 sentences)",
  "roleplay_setup_ro": "Romanian translation of roleplay setup",
  "vocabulary_to_use": ["word1", "word2", "word3", "word4", "word5"],
  "boosters": [
    {"id": "b1", "label": "Introduce yourself", "xp": 50},
    {"id": "b2", "label": "Ask for help politely", "xp": 75},
    {"id": "b3", "label": "Use target vocabulary", "xp": 100},
    {"id": "b4", "label": "Complete the mission", "xp": 150}
  ]
}

Rules:
- boosters: exactly 4 items, all in English, relevant to the topic
- vocabulary_to_use: exactly 5 words relevant to the topic
- boosters.label: short imperative phrases (max 4 words each)`,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.85 },
  } as Parameters<typeof genAI.getGenerativeModel>[0]);

  const result = await model.generateContent(`Create quest for: "${topic}"`);
  const text = result.response.text();
  const quest = JSON.parse(text) as QuestData;

  await mergeExerciseData(sessionId, { quest_data: quest, student_quest_boosters: null });
  return quest;
}

export async function clearQuestContent(sessionId: string): Promise<void> {
  await mergeExerciseData(sessionId, { quest_data: null, student_quest_boosters: null });
}

// ─── Time Travel ───────────────────────────────────────────────────────────────
export async function generateTimeTravelContent(
  sessionId: string,
  level: string,
  topic?: string,
  tense?: string
): Promise<TimeTravelData> {
  const genAI = getGenAI();

  const tenseConstraint = tense
    ? `All 3 exercises MUST use the ${tense} tense exclusively.`
    : 'Vary the tenses across the 3 exercises (e.g. Past Simple, Present Perfect, Future Simple, Past Continuous, etc.).';

  const topicConstraint = topic
    ? `All sentences must relate to this topic or scenario: "${topic}".`
    : 'Choose varied, everyday topics for the sentences.';

  const model = genAI.getGenerativeModel({
    model: GEMINI_TEXT_MODEL,
    systemInstruction: `You are an Expert English Grammar Teacher creating verb tense exercises for CEFR level ${level}.

Generate an array of exactly 15 sentence exercises.

Return ONLY a valid JSON array (no markdown, no wrapping object), with exactly this structure per item:
[
  {
    "sentence_en": "She ___ to Paris last year.",
    "sentence_ro": "Ea a mers la Paris anul trecut.",
    "options": ["go", "went", "has gone", "will go"],
    "correct_index": 1
  }
]

Rules:
- sentence_en: English sentence with exactly one blank ___ for the missing verb form
- sentence_ro: Complete Romanian translation of the sentence (with the correct verb, NOT a blank)
- options: exactly 4 forms of the SAME verb in different tenses/aspects
- correct_index: integer 0–3 indicating the correct option
- ${tenseConstraint}
- ${topicConstraint}
- Level-appropriate vocabulary and sentence complexity for ${level}`,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.85 },
  } as Parameters<typeof genAI.getGenerativeModel>[0]);

  const prompt = [
    'Generate 15 verb tense exercises.',
    tense ? `Tense: ${tense}.` : '',
    topic ? `Topic: ${topic}.` : '',
  ].filter(Boolean).join(' ');

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const data = JSON.parse(text) as TimeTravelData;

  await mergeExerciseData(sessionId, { time_travel_data: data });
  return data;
}

export async function clearTimeTravelContent(sessionId: string): Promise<void> {
  await mergeExerciseData(sessionId, { time_travel_data: null, student_time_travel_answers: null });
}
