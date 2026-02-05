import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/index.js';
import type { ExtractedQuestion, AIExtractionResult, AIProvider } from '../../../shared/types/index.js';

// Initialize AI clients
const openai = config.ai.openai.apiKey ? new OpenAI({ apiKey: config.ai.openai.apiKey }) : null;
const gemini = config.ai.gemini.apiKey ? new GoogleGenerativeAI(config.ai.gemini.apiKey) : null;

// System prompt for question extraction
const EXTRACTION_PROMPT = `You are an expert at analyzing examination papers. Extract all questions from the provided content and classify them.

For each question, identify:
1. Question number (if present)
2. Question type: mcq (multiple choice), descriptive, true_false, short_answer
3. The question text
4. Options (for MCQ questions)
5. Correct answer (if visible)
6. Marks/points (if specified)

Return a JSON array with the following structure for each question:
{
  "question_number": number or null,
  "type": "mcq" | "descriptive" | "true_false" | "short_answer",
  "text": "The question text",
  "options": ["Option A", "Option B", ...] or null,
  "correct_answer": "answer" or index (0-based) or null,
  "marks": number or null,
  "confidence_score": 0.0-1.0 (your confidence in the extraction accuracy)
}

Guidelines:
- For MCQ: Include all options, mark correct_answer as the 0-based index if known
- For True/False: Set type as "true_false", options as ["True", "False"]
- For descriptive/essay questions: Set type as "descriptive"
- For short answer (1-2 sentences expected): Set type as "short_answer"
- Preserve any special formatting, equations, or code in the text
- If marks are mentioned like "(5 marks)" or "[2 pts]", extract the number
- Set confidence_score based on how clearly the question was extracted

Return ONLY a valid JSON array, no additional text or markdown formatting.`;

/**
 * Extract questions using OpenAI GPT-4 Vision or text model
 */
async function extractWithOpenAI(
  content: string,
  isImage: boolean,
  imageBase64?: string
): Promise<ExtractedQuestion[]> {
  if (!openai) {
    throw new Error('OpenAI API key not configured');
  }

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: EXTRACTION_PROMPT }
  ];

  if (isImage && imageBase64) {
    messages.push({
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${imageBase64}`,
            detail: 'high'
          }
        },
        {
          type: 'text',
          text: 'Extract all questions from this examination paper image.'
        }
      ]
    });
  } else {
    messages.push({
      role: 'user',
      content: `Extract all questions from the following examination paper content:\n\n${content}`
    });
  }

  const response = await openai.chat.completions.create({
    model: config.ai.openai.model,
    messages,
    temperature: 0.1,
    max_tokens: 4096,
    response_format: { type: 'json_object' }
  });

  const responseText = response.choices[0]?.message?.content || '[]';
  
  try {
    const parsed = JSON.parse(responseText);
    // Handle both direct array and {questions: [...]} format
    return Array.isArray(parsed) ? parsed : (parsed.questions || []);
  } catch {
    console.error('Failed to parse OpenAI response:', responseText);
    return [];
  }
}

/**
 * Extract questions using Google Gemini
 */
async function extractWithGemini(
  content: string,
  isImage: boolean,
  imageBase64?: string,
  mimeType?: string
): Promise<ExtractedQuestion[]> {
  if (!gemini) {
    throw new Error('Gemini API key not configured');
  }

  const model = gemini.getGenerativeModel({ model: config.ai.gemini.model });

  let result;

  if (isImage && imageBase64 && mimeType) {
    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType
      }
    };

    result = await model.generateContent([
      EXTRACTION_PROMPT,
      imagePart,
      'Extract all questions from this examination paper image. Return only a valid JSON array.'
    ]);
  } else {
    result = await model.generateContent([
      EXTRACTION_PROMPT,
      `Extract all questions from the following examination paper content. Return only a valid JSON array.\n\n${content}`
    ]);
  }

  const responseText = result.response.text();
  
  // Clean the response - remove markdown code blocks if present
  let cleanedText = responseText
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleanedText);
    return Array.isArray(parsed) ? parsed : (parsed.questions || []);
  } catch {
    console.error('Failed to parse Gemini response:', cleanedText);
    return [];
  }
}

/**
 * Main extraction function with provider fallback
 */
export async function extractQuestionsFromContent(
  content: string,
  options: {
    provider?: AIProvider;
    isImage?: boolean;
    imageBase64?: string;
    mimeType?: string;
  } = {}
): Promise<AIExtractionResult> {
  const startTime = Date.now();
  const preferredProvider = options.provider || config.ai.preferredProvider;
  const isImage = options.isImage || false;

  let questions: ExtractedQuestion[] = [];
  let usedProvider: AIProvider = preferredProvider;
  let error: Error | null = null;

  // Try preferred provider first
  try {
    if (preferredProvider === 'openai') {
      questions = await extractWithOpenAI(content, isImage, options.imageBase64);
    } else {
      questions = await extractWithGemini(content, isImage, options.imageBase64, options.mimeType);
    }
  } catch (e) {
    error = e as Error;
    console.error(`${preferredProvider} extraction failed:`, e);

    // Fallback to other provider
    try {
      if (preferredProvider === 'openai' && gemini) {
        usedProvider = 'gemini';
        questions = await extractWithGemini(content, isImage, options.imageBase64, options.mimeType);
        error = null;
      } else if (preferredProvider === 'gemini' && openai) {
        usedProvider = 'openai';
        questions = await extractWithOpenAI(content, isImage, options.imageBase64);
        error = null;
      }
    } catch (fallbackError) {
      console.error('Fallback provider also failed:', fallbackError);
    }
  }

  const processingTime = Date.now() - startTime;

  if (error && questions.length === 0) {
    return {
      success: false,
      provider: usedProvider,
      questions: [],
      total_extracted: 0,
      processing_time_ms: processingTime,
      raw_text: content
    };
  }

  // Normalize question types
  questions = questions.map((q, index) => ({
    ...q,
    question_number: q.question_number || index + 1,
    type: normalizeQuestionType(q.type),
    confidence_score: q.confidence_score || 0.8
  }));

  return {
    success: true,
    provider: usedProvider,
    questions,
    total_extracted: questions.length,
    processing_time_ms: processingTime,
    raw_text: content
  };
}

/**
 * Normalize question types to our standard types
 */
function normalizeQuestionType(type: string): ExtractedQuestion['type'] {
  const normalized = type?.toLowerCase().trim();
  
  if (['mcq', 'multiple_choice', 'multiplechoice', 'mc'].includes(normalized)) {
    return 'mcq';
  }
  if (['true_false', 'truefalse', 'tf', 'boolean'].includes(normalized)) {
    return 'true_false';
  }
  if (['short_answer', 'shortanswer', 'short', 'fill_blank', 'fillblank'].includes(normalized)) {
    return 'short_answer';
  }
  if (['descriptive', 'essay', 'long_answer', 'longanswer', 'paragraph'].includes(normalized)) {
    return 'descriptive';
  }
  
  return 'descriptive'; // Default
}

/**
 * Check which AI providers are available
 */
export function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = [];
  if (openai) providers.push('openai');
  if (gemini) providers.push('gemini');
  return providers;
}

/**
 * Validate that at least one AI provider is configured
 */
export function isAIConfigured(): boolean {
  return getAvailableProviders().length > 0;
}
