import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAppSummary, getWeekStart, safeUrl } from './utils'

describe('safeUrl', () => {
  it('accepts absolute HTTP and HTTPS URLs', () => {
    expect(safeUrl('https://jobs.example/roles/1')).toBe('https://jobs.example/roles/1')
    expect(safeUrl('http://jobs.example/roles/1')).toBe('http://jobs.example/roles/1')
  })

  it('rejects unsupported and relative URLs', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('')
    // Relative paths are invalid because safeUrl deliberately does not resolve against a page URL.
    expect(safeUrl('/roles/1')).toBe('')
    expect(safeUrl('not a URL')).toBe('')
  })
})

describe('application summaries', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('finds the configured start of the week', () => {
    const date = new Date(2026, 10, 18, 12)
    const monday = getWeekStart(date, 1)
    const sunday = getWeekStart(date, 0)

    expect([monday.getFullYear(), monday.getMonth(), monday.getDate()]).toEqual([2026, 10, 16])
    expect([sunday.getFullYear(), sunday.getMonth(), sunday.getDate()]).toEqual([2026, 10, 15])
  })

  it('calculates daily, weekly, and monthly totals', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 18, 15))
    const appliedAt = (day: number, month = 10) => new Date(2026, month, day, 10).toISOString()
    const summary = getAppSummary([
      { appliedAt: appliedAt(18) },
      { appliedAt: appliedAt(16) },
      { appliedAt: appliedAt(15) },
      { appliedAt: appliedAt(31, 9) },
    ])

    expect(summary).toEqual({ total: 4, today: 1, week: 2, month: 3 })
  })
})
