import { describe, expect, it } from 'vitest'
import { normalizeEmploymentType, normalizeText, normalizeWorkMode } from './normalizers'

describe('job detail normalizers', () => {
  it('normalizes structured text and salary ranges', () => {
    expect(normalizeText('  Senior   Engineer ')).toBe('Senior Engineer')
    expect(normalizeText({ minValue: 100, maxValue: 150, currency: 'USD', unitText: 'YEAR' }))
      .toBe('USD 100–150 YEAR')
  })

  it('normalizes common work modes and employment types', () => {
    expect(normalizeWorkMode('https://schema.org/TELECOMMUTE')).toBe('Remote')
    expect(normalizeWorkMode('Hybrid')).toBe('Hybrid')
    expect(normalizeEmploymentType('FULL_TIME, INTERN')).toBe('Full-time, Internship')
  })
})
