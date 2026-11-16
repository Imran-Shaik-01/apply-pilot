import { describe, expect, it } from 'vitest'
import { normalizeEmploymentType, normalizeText, normalizeWorkMode } from './normalizers'

describe('job detail normalizers', () => {
  it('normalizes strings and numbers', () => {
    expect(normalizeText('  Senior   Engineer ')).toBe('Senior Engineer')
    expect(normalizeText(123)).toBe('123')
  })

  it('handles nullish text values', () => {
    expect(normalizeText(null)).toBe('')
    expect(normalizeText(undefined)).toBe('')
  })

  it('normalizes nested arrays', () => {
    expect(normalizeText(['New York', ['NY', null], 123])).toBe('New York, NY, 123')
  })

  it('extracts nested locations and salary ranges', () => {
    expect(normalizeText({ name: 'New York', addressRegion: 'NY', addressCountry: 'US' }))
      .toBe('New York, NY, US')
    expect(normalizeText({ minValue: 100, maxValue: 150, currency: 'USD', unitText: 'YEAR' }))
      .toBe('USD 100–150 YEAR')
  })

  it('normalizes schema.org work mode values and preserves unknown values', () => {
    expect(normalizeWorkMode('https://schema.org/TELECOMMUTE')).toBe('Remote')
    expect(normalizeWorkMode('http://schema.org/Hybrid')).toBe('Hybrid')
    expect(normalizeWorkMode('ON_SITE')).toBe('On-site')
    expect(normalizeWorkMode('Flexible')).toBe('Flexible')
  })

  it('normalizes multi-value employment types and preserves unknown values', () => {
    expect(normalizeEmploymentType('FULL_TIME, INTERN')).toBe('Full-time, Internship')
    expect(normalizeEmploymentType('PART_TIME, CONTRACTOR')).toBe('Part-time, Contract')
    expect(normalizeEmploymentType('Freelance')).toBe('Freelance')
  })
})
