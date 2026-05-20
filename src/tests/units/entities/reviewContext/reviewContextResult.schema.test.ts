import { describe, it, expect } from 'vitest'
import { reviewContextResultSchema } from '@/modules/review-execution/entities/reviewContext/reviewContextResult.schema.js'

describe('reviewContextResultSchema', () => {
  it('should validate a complete result', () => {
    const data = {
      blocking: 0,
      warnings: 2,
      suggestions: 3,
      score: 10,
      verdict: 'ready_to_merge',
    }

    const result = reviewContextResultSchema.safeParse(data)

    expect(result.success).toBe(true)
  })

  it('should reject result with invalid verdict', () => {
    const data = {
      blocking: 0,
      warnings: 0,
      suggestions: 0,
      score: 10,
      verdict: 'invalid_verdict',
    }

    const result = reviewContextResultSchema.safeParse(data)

    expect(result.success).toBe(false)
  })
})
