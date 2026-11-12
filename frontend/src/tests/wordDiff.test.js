import { describe, expect, it } from 'vitest'
import { diffCounts, wordDiff } from '../lib/wordDiff'

describe('word diff of the AI draft and the reply', () => {
  it('marks added and removed words, and keeps the rest', () => {
    const parts = wordDiff('Please send us your password.', 'Please never send your password.')
    expect(parts.map((part) => part.type)).toContain('added')
    expect(parts.map((part) => part.type)).toContain('removed')
    expect(parts.filter((part) => part.type !== 'removed').map((part) => part.text).join('')).toBe(
      'Please never send your password.',
    )
    expect(parts.filter((part) => part.type !== 'added').map((part) => part.text).join('')).toBe(
      'Please send us your password.',
    )
    expect(diffCounts(parts)).toEqual({ added: 1, removed: 1 })
  })

  it('reports no change for identical text', () => {
    expect(wordDiff('Same words here.', 'Same words here.')).toEqual([{ type: 'same', text: 'Same words here.' }])
  })
})
