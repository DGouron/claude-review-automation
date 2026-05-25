import { z } from 'zod'

export const reviewContextResultSchema = z.object({
  blocking: z.number(),
  warnings: z.number(),
  suggestions: z.number(),
  score: z.number(),
  verdict: z.enum(['ready_to_merge', 'needs_fixes', 'needs_discussion']),
  backfilledAt: z.string().optional(),
})

export type ReviewContextResult = z.infer<typeof reviewContextResultSchema>
