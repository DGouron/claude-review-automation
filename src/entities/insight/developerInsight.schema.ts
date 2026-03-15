import { z } from 'zod';
import { insightCategorySchema } from '@/entities/insight/insightCategory.js';
import { insightTrendSchema } from '@/entities/insight/insightTrend.js';
import { developerTitleSchema } from '@/entities/insight/developerTitle.js';

export const categoryLevelSchema = z.object({
  level: z.number().int().min(1).max(10),
  trend: insightTrendSchema,
});

export const categoryLevelsSchema = z.object({
  quality: categoryLevelSchema,
  responsiveness: categoryLevelSchema,
  codeVolume: categoryLevelSchema,
  iteration: categoryLevelSchema,
});

export const developerMetricsSchema = z.object({
  averageScore: z.number(),
  averageBlocking: z.number(),
  averageWarnings: z.number(),
  averageDuration: z.number(),
  totalFollowups: z.number().nullable(),
  averageAdditions: z.number(),
  averageDeletions: z.number(),
  firstReviewQualityRate: z.number(),
});

export const insightDescriptionSchema = z.object({
  category: insightCategorySchema,
  type: z.enum(['strength', 'weakness']),
  descriptionKey: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number()])).nullable(),
});

export const developerInsightSchema = z.object({
  developerName: z.string().min(1),
  title: developerTitleSchema,
  overallLevel: z.number().int().min(1).max(10),
  categoryLevels: categoryLevelsSchema,
  strengths: z.array(insightCategorySchema),
  weaknesses: z.array(insightCategorySchema),
  topPriority: insightCategorySchema.nullable(),
  reviewCount: z.number().int().min(0),
  metrics: developerMetricsSchema,
  insightDescriptions: z.array(insightDescriptionSchema),
});
