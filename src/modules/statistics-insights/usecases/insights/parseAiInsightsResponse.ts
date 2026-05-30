import type { AiInsightsResult } from '@/modules/statistics-insights/entities/insight/aiInsight.js';
import { aiInsightsRawResponseSchema } from '@/modules/statistics-insights/entities/insight/aiInsight.schema.js';

function stripMarkdownFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.substring(firstNewline + 1);
    }
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3).trim();
  }
  return cleaned;
}

export function parseAiInsightsResponse(rawOutput: string): Omit<AiInsightsResult, 'generatedAt'> {
  const cleaned = stripMarkdownFences(rawOutput);
  const parsed: unknown = JSON.parse(cleaned);
  return aiInsightsRawResponseSchema.parse(parsed);
}
