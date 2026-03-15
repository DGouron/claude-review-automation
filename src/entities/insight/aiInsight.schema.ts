import { z } from 'zod';

export const aiDeveloperInsightSchema = z.object({
  developerName: z.string().min(1),
  title: z.string().min(1),
  titleExplanation: z.string().min(1),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),
  summary: z.string().min(1),
});

export const aiTeamInsightSchema = z.object({
  summary: z.string().min(1),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),
  dynamics: z.string().min(1),
});

export const aiInsightsResultSchema = z.object({
  developers: z.array(aiDeveloperInsightSchema),
  team: aiTeamInsightSchema,
  generatedAt: z.string().min(1),
});
