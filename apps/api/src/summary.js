import { z } from 'zod';

// Llama 3.1 8B was deprecated by Groq on 2026-08-16. This fast production
// replacement is available on the current developer plan.
export const GROQ_MODEL = 'openai/gpt-oss-20b';

const contextSchema = z.object({
  label: z.enum(['Untapped', 'Competitive', 'Oversupplied']),
  score: z.number().finite().min(0).max(100),
  confidence: z.enum(['standard', 'limited']),
  reasons: z.array(z.string().trim().min(1).max(500)).min(1).max(6),
  metrics: z.record(z.string().trim().min(1).max(40), z.number().finite()).refine(metrics => Object.keys(metrics).length <= 12)
}).strict();

export function parseSummaryContext(value) {
  const parsed = contextSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function buildSummaryPrompt(context) {
  const limited = context.confidence === 'limited' ? ', limited confidence' : '';
  return `Summarize this location analysis in exactly two short sentences for a first-time small business owner. Use only the facts below. Do not invent numbers, competitor names, or claims. Do not use markdown, bullet points, or headings. Do not mention that you are an AI. State the verdict plainly.\n\nVerdict: ${context.label} (score ${context.score}/100${limited})\nEvidence: ${context.reasons.join(' ')}\nKey figures: ${JSON.stringify(context.metrics)}\n\nReturn exactly two plain sentences.`;
}

const numberKey = value => String(Number(value));
export function allowedNumbers(context) {
  return new Set(['100', ...(JSON.stringify(context).match(/\d+(?:\.\d+)?/g) || [])].map(numberKey));
}

export function validateSummaryText(value, context) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || text.length > 500 || /[`*_#>[\]\r\n]|(^|\s)[•-]\s/.test(text)) return null;
  const endings = text.match(/[.!?](?=\s|$)/g) || [];
  if (endings.length !== 2 || !/[.!?]$/.test(text)) return null;
  const allowed = allowedNumbers(context);
  const numbers = text.match(/\d+(?:\.\d+)?/g) || [];
  if (!numbers.every(number => allowed.has(numberKey(number)))) return null;
  return text;
}
