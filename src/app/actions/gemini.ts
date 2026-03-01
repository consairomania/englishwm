'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '@/lib/supabase/client';
import type { PuzzleData, VoyagerData, QuestData, TimeTravelData } from '@/types/database';

const GEMINI_TEXT_MODEL = 'gemini-2.5-flash';

function getAgeInstruction(ageSegment: 'child' | 'teenager' | 'adult'): string {
  switch (ageSegment) {
    case 'child':
      return 'The student is a child (6-11 years old). Use simple vocabulary and short sentences. When choosing a random topic, pick ONE from this curated list: Animals & Wildlife, Dinosaurs & Prehistoric Life, Superheroes & Powers, Fairy Tales & Magic, School Adventures, Sports & Games, Nature & Plants, Space & Planets, Cooking & Food, The Seasons & Weather, Pets & Animal Care, Friendship & Kindness, Family Life, The Ocean & Sea Creatures, Bugs & Insects, Holidays & Celebrations, The Jungle & Safari, A Day at the Zoo, Circus & Performers, Toys & Inventions. Avoid adult themes, violence, or romance.';
    case 'teenager':
      return 'The student is a teenager (12-17 years old). Use engaging, modern language. When choosing a random topic, pick ONE from this curated list: Social Media & Online Life, Music & Concerts, Sports & Competitions, Gaming & Esports, Fashion & Personal Style, School & Exams, Travel & Adventure, Environmental Issues, Technology & Apps, Movies & TV Series, Volunteering & Community, Part-time Jobs, Learning New Skills, Street Food & Restaurants, Friendships & Social Life, Mental Health & Wellbeing, Future Careers, Hobbies & Passions, Science Discoveries, Cultural Exchange. Keep content age-appropriate.';
    case 'adult':
      return 'The student is an adult (18+ years old). Use sophisticated, mature vocabulary. When choosing a random topic, pick ONE from this curated list: Work-Life Balance, Artificial Intelligence at Work, Remote vs. Office Work, Leadership and Management, Entrepreneurship, Stress Management, Healthy Habits, Emotional Intelligence, Lifelong Learning, Minimalism as a Lifestyle, Sustainable Tourism, The Impact of Social Media, Financial Literacy, Cultural Differences, The Future of Cities, Gastronomy as a Cultural Experience, The Evolution of Cinema, Hobbies in Adulthood, The Power of Volunteering, Climate Change, Friendship in Adulthood, Quality vs. Quantity, Childhood Friendships, The Influence of Social Circle, Dating in the Digital Age, Dynamics of the Modern Family, Long-Distance Relationships, Balance in a Relationship, The Art of Active Listening, Managing Conflicts, Body Language, Setting Boundaries, Authentic Networking, Mentoring, Social Intelligence at Work.';
  }
}

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
  level: string,
  ageSegment: 'child' | 'teenager' | 'adult' = 'adult'
): Promise<{ data: PuzzleData; chosenTopic: string }> {
  const isRandom = !topic.trim();
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: GEMINI_TEXT_MODEL,
    systemInstruction: `You are an Expert English Teacher creating sentence scramble puzzles.
The student's level is ${level} (CEFR: A1–C2). Adjust complexity accordingly.
${getAgeInstruction(ageSegment)}

${isRandom
  ? 'Pick ONE topic from the curated age-appropriate list above. Be creative in how you build the sentence from it.'
  : `TASK: Create ONE coherent English sentence about: "${topic}".`
}

CONSTRAINTS:
- Maximum 12 words total.
- Sentence ends with correct punctuation attached to last word (e.g. "hotel.").
- All words in "scrambled" come from "sentence" — no additions.
- "scrambled" must be in a DIFFERENT order than the sentence.
- In "scrambled", each word must appear EXACTLY as in "sentence" — including any trailing punctuation. Never separate or strip punctuation.

Return ONLY valid JSON (no markdown) matching exactly:
{ "chosen_topic": "the topic in English (2-5 words)", "sentence": string, "sentence_ro": string, "scrambled": string[], "instruction_en": string, "hint_en": string, "hint_ro": string }
Where sentence_ro is a natural Romanian translation of the full English sentence.`,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
  } as Parameters<typeof genAI.getGenerativeModel>[0]);

  const contentPrompt = isRandom
    ? 'Create a puzzle — choose an interesting and varied topic yourself'
    : `Create puzzle about: "${topic}"`;
  const result = await model.generateContent(contentPrompt);
  const text = result.response.text();
  const raw = JSON.parse(text) as PuzzleData & { chosen_topic?: string };
  const chosenTopic = topic.trim() || raw.chosen_topic || 'Random puzzle';
  const puzzle: PuzzleData = {
    sentence: raw.sentence,
    sentence_ro: raw.sentence_ro,
    scrambled: raw.scrambled,
    instruction_en: raw.instruction_en,
    hint_en: raw.hint_en,
    hint_ro: raw.hint_ro,
  };

  // Sanitizare completă: normalizăm casing-ul și punctuația din scrambled față de sentence
  const sentenceWords = puzzle.sentence.split(/\s+/).filter(Boolean);

  // Construim un word bank: lowercase → coada formelor exacte din sentence
  // (tratăm corect duplicate, ex: "the" apare ca "The" și "the" în aceeași propoziție)
  const wordBank = new Map<string, string[]>();
  for (const w of sentenceWords) {
    const key = w.toLowerCase();
    if (!wordBank.has(key)) wordBank.set(key, []);
    wordBank.get(key)!.push(w);
  }
  // Înlocuim fiecare cuvânt din scrambled cu forma sa exactă din sentence
  puzzle.scrambled = puzzle.scrambled.map(w => {
    const queue = wordBank.get(w.toLowerCase());
    if (queue && queue.length > 0) return queue.shift()!;
    return w;
  });

  // Fallback: dacă ultimul cuvânt din sentence are punctuație și nu apare în scrambled, o adăugăm
  const lastSentenceWord = sentenceWords[sentenceWords.length - 1];
  const punctMatch = lastSentenceWord.match(/[.!?,;:]+$/);
  if (punctMatch) {
    const punct = punctMatch[0];
    const baseWord = lastSentenceWord.slice(0, -punct.length);
    const alreadyOk = puzzle.scrambled.some(
      w => w.toLowerCase() === lastSentenceWord.toLowerCase()
    );
    if (!alreadyOk) {
      const idx = puzzle.scrambled.findIndex(
        w => w.toLowerCase() === baseWord.toLowerCase()
      );
      if (idx !== -1) puzzle.scrambled[idx] = puzzle.scrambled[idx] + punct;
    }
  }

  // Resetăm progresul elevului și vizibilitatea traducerii când profesorul generează un puzzle nou
  await mergeExerciseData(sessionId, { puzzle_data: puzzle, student_puzzle_progress: null, puzzle_show_translation: null });
  return { data: puzzle, chosenTopic };
}

export async function clearPuzzleContent(sessionId: string): Promise<void> {
  await mergeExerciseData(sessionId, { puzzle_data: null, student_puzzle_progress: null, puzzle_show_translation: null });
}

export async function setPuzzleShowTranslation(sessionId: string, show: boolean): Promise<void> {
  await mergeExerciseData(sessionId, { puzzle_show_translation: show });
}

// ─── Voyager ──────────────────────────────────────────────────────────────────
export async function generateVoyagerContent(
  sessionId: string,
  topic: string,
  level: string,
  ageSegment: 'child' | 'teenager' | 'adult' = 'adult'
): Promise<{ data: VoyagerData; chosenTopic: string }> {
  const isRandom = !topic.trim();
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: GEMINI_TEXT_MODEL,
    systemInstruction: `You are a Creative English Teacher creating visual storytelling lessons.
Student level: ${level} (CEFR).
${getAgeInstruction(ageSegment)}
${isRandom
  ? 'Pick ONE topic from the curated age-appropriate list above and imagine a vivid, concrete scene that brings it to life visually.'
  : `Topic: "${topic}".`
}

Generate a rich bilingual scene for language learning.

Return ONLY valid JSON (no markdown):
{
  "chosen_topic": "the scene topic in English (2-5 words)",
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

  const contentPrompt = isRandom
    ? 'Create visual scene — choose a creative and surprising topic yourself'
    : `Create visual scene about: "${topic}"`;
  const result = await model.generateContent(contentPrompt);
  const text = result.response.text();
  const raw = JSON.parse(text) as Omit<VoyagerData, 'image_url' | 'image_path'> & { chosen_topic?: string };
  const chosenTopic = topic.trim() || raw.chosen_topic || 'Random scene';
  const { chosen_topic: _ct, ...generatedFields } = raw;
  const generated = generatedFields as Omit<VoyagerData, 'image_url' | 'image_path'>;

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
  return { data: voyagerData, chosenTopic };
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
  level: string,
  ageSegment: 'child' | 'teenager' | 'adult' = 'adult'
): Promise<{ data: QuestData; chosenTopic: string }> {
  const isRandom = !topic.trim();
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: GEMINI_TEXT_MODEL,
    systemInstruction: `You are an Expert English Coach creating immersive roleplay quests.
Student level: ${level} (CEFR).
${getAgeInstruction(ageSegment)}
${isRandom
  ? 'Pick ONE topic from the curated age-appropriate list above and build a roleplay scenario around it.'
  : `Context/topic: "${topic}".`
}

Create an engaging mission scenario for English practice.

Return ONLY valid JSON (no markdown):
{
  "chosen_topic": "the quest context in English (2-5 words)",
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

  const contentPrompt = isRandom
    ? 'Create quest — choose a creative and varied context yourself'
    : `Create quest for: "${topic}"`;
  const result = await model.generateContent(contentPrompt);
  const text = result.response.text();
  const raw = JSON.parse(text) as QuestData & { chosen_topic?: string };
  const chosenTopic = topic.trim() || raw.chosen_topic || 'Random quest';
  const { chosen_topic: _ct, ...questFields } = raw;
  const quest = questFields as QuestData;

  await mergeExerciseData(sessionId, { quest_data: quest, student_quest_boosters: null });
  return { data: quest, chosenTopic };
}

export async function clearQuestContent(sessionId: string): Promise<void> {
  await mergeExerciseData(sessionId, { quest_data: null, student_quest_boosters: null });
}

// ─── Time Travel ───────────────────────────────────────────────────────────────
export async function generateTimeTravelContent(
  sessionId: string,
  level: string,
  topic?: string,
  tenses?: string[],
  ageSegment: 'child' | 'teenager' | 'adult' = 'adult'
): Promise<{ data: TimeTravelData; chosenTopic: string }> {
  const genAI = getGenAI();

  const hasTenseFilter = tenses && tenses.length > 0;
  const tenseConstraint = hasTenseFilter
    ? `Distribute the 15 exercises RANDOMLY across only these tenses/structures: ${tenses!.join(', ')}.`
    : 'Vary the tenses freely across all 15 exercises (use a wide mix of different tenses).';

  const topicConstraint = topic
    ? `All sentences must relate to this topic or scenario: "${topic}".`
    : 'Pick ONE topic from the curated age-appropriate list above for all sentences and report it in "chosen_topic".';

  const specialStructureInstructions = `
Special structure guidance (apply when the selected tenses/structures include these):
- MODAL VERBS (Should/Would/Can/Could/May/Might/Must/Have to/Need to/Used to): Use ONE blank. Options must be 4 different modals or modal phrases (e.g. "should", "must", "might", "could") — the correct one fits the context (advice, obligation, possibility, habit). Example: "You ___ see a doctor." → options: ["should", "would", "might", "used to"]
- MODAL + PRESENT PERFECT: Use TWO blanks — modal + "have" + past participle (e.g. "should have gone"). Options: 4 different modals before "have ___". Example: "She ___ ___ earlier." → options: ["should have left", "must have left", "could have left", "would have left"]
- PASSIVE VOICE (any tense): Use TWO blanks for auxiliary + past participle. Options: 4 different passive forms for the same verb. Example: "The letter ___ ___ yesterday." → options: ["was written", "is written", "has been written", "will be written"]
- TYPE 0 CONDITIONAL: "If + present simple, present simple". Both clauses reflect universal truths or scientific facts. Use ONE blank in the result clause.
- FUTURE IN THE PAST: Correct answer uses "would + infinitive". Distractors: other modals (will, could, should). Example: "She said she ___ help." → options: ["would", "will", "could", "should"]
- HAD BETTER: Use ONE blank with options: "had better", "should", "must", "ought to". Example: "You ___ leave now." → correct: "had better"
- STATIVE VERBS (know, love, understand, believe, want, need, seem, own, etc.): Test that stative verbs are NOT used in continuous form. Correct option: present simple. Distractors: present continuous, present perfect, past simple. Example: "She ___ the answer." → options: ["knows", "is knowing", "has known", "knew"] → correct: "knows"`;

  const model = genAI.getGenerativeModel({
    model: GEMINI_TEXT_MODEL,
    systemInstruction: `You are an Expert English Grammar Teacher creating verb tense and grammar exercises for CEFR level ${level}.
${getAgeInstruction(ageSegment)}

Generate exactly 15 sentence exercises and return a JSON object with this structure:
{
  "chosen_topic": "At the airport",
  "exercises": [
    {
      "sentence_en": "She ___ to Paris last year.",
      "sentence_ro": "Ea a mers la Paris anul trecut.",
      "options": ["go", "went", "has gone", "will go"],
      "correct_index": 1
    }
  ]
}

Rules:
- chosen_topic: a short descriptive topic label (always include even when topic was given)
- sentence_en: Use one blank ___ for single-word answers. For multi-word answers (e.g. "was written", "should have left"), use TWO blanks in correct positions: "The book ___ ___ by Tolstoy." — the blanks match the words in the correct option when split by spaces.
- sentence_ro: Complete Romanian translation of the sentence (with the correct verb form, NOT a blank)
- options: exactly 4 verb forms or structures that could plausibly fill the blank(s); only one is correct for the context
- correct_index: integer 0–3 indicating the correct option
- ${tenseConstraint}
- ${topicConstraint}
- Level-appropriate vocabulary and sentence complexity for ${level}
${specialStructureInstructions}`,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.85 },
  } as Parameters<typeof genAI.getGenerativeModel>[0]);

  const prompt = [
    'Generate 15 verb tense exercises.',
    hasTenseFilter ? `Tenses to use: ${tenses!.join(', ')}.` : '',
    topic ? `Topic: ${topic}.` : '',
  ].filter(Boolean).join(' ');

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const raw = JSON.parse(text) as { chosen_topic?: string; exercises: TimeTravelData };
  const data: TimeTravelData = raw.exercises;
  const chosenTopic = raw.chosen_topic ?? topic ?? '';

  await mergeExerciseData(sessionId, { time_travel_data: data });
  return { data, chosenTopic };
}

export async function clearTimeTravelContent(sessionId: string): Promise<void> {
  await mergeExerciseData(sessionId, { time_travel_data: null, student_time_travel_answers: null });
}
