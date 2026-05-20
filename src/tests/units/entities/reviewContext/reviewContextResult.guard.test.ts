import { describe, it, expect } from 'vitest'
import {
  parseReviewContextResult,
  isValidReviewContextResult,
} from '@/modules/review-execution/entities/reviewContext/reviewContextResult.guard.js'

describe('reviewContextResult.guard', () => {
  describe('parseReviewContextResult', () => {
    it('should parse a valid result', () => {
      const data = {
        blocking: 0,
        warnings: 1,
        suggestions: 2,
        score: 9,
        verdict: 'ready_to_merge',
      }

      const result = parseReviewContextResult(data)

      expect(result.verdict).toBe('ready_to_merge')
      expect(result.score).toBe(9)
    })
  })

  describe('isValidReviewContextResult', () => {
    it('should return true for valid result', () => {
      const data = {
        blocking: 1,
        warnings: 0,
        suggestions: 0,
        score: 5,
        verdict: 'needs_fixes',
      }

      expect(isValidReviewContextResult(data)).toBe(true)
    })

    it('should return false for invalid result', () => {
      expect(isValidReviewContextResult({ verdict: 'bad' })).toBe(false)
    })
  })
})
