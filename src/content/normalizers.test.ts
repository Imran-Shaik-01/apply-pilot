import { describe, expect, it } from 'vitest'
import {
  getConfirmationTitle,
  isApplicationConfirmation,
  isSubmissionMessage,
  normalizeEmploymentType,
  normalizeText,
  normalizeWorkMode,
  workModeFromLocation,
} from './normalizers'

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

  it('avoids repeating currency or unit already included in a money value', () => {
    expect(normalizeText({ value: '7 Lacs P.A.', currency: 'INR', unitText: 'P.A.' }))
      .toBe('INR 7 Lacs P.A.')
    expect(normalizeText({ minValue: '80,000', maxValue: '100,000', currency: 'USD', unitText: 'YEAR' }))
      .toBe('USD 80,000–100,000 YEAR')
  })

  it('normalizes schema.org work mode values and preserves unknown values', () => {
    expect(normalizeWorkMode('https://schema.org/TELECOMMUTE')).toBe('Remote')
    expect(normalizeWorkMode('http://schema.org/Hybrid')).toBe('Hybrid')
    expect(normalizeWorkMode('ON_SITE')).toBe('On-site')
    expect(normalizeWorkMode('Flexible')).toBe('Flexible')
  })

  it('derives work mode only from an already-scoped location value', () => {
    expect(workModeFromLocation('Hybrid - Bengaluru')).toBe('Hybrid')
    expect(workModeFromLocation('Remote')).toBe('Remote')
    expect(workModeFromLocation('Bengaluru, India')).toBe('')
  })

  it('normalizes multi-value employment types and preserves unknown values', () => {
    expect(normalizeEmploymentType('FULL_TIME, INTERN')).toBe('Full-time, Internship')
    expect(normalizeEmploymentType('PART_TIME, CONTRACTOR')).toBe('Part-time, Contract')
    expect(normalizeEmploymentType('Freelance')).toBe('Freelance')
  })

  it('detects application confirmations and extracts a quoted title', () => {
    const text = "You have successfully applied to 'Digital Specialist Engineer (Trainee)'"
    expect(isApplicationConfirmation(text)).toBe(true)
    expect(getConfirmationTitle(text)).toBe('Digital Specialist Engineer (Trainee)')
    expect(isApplicationConfirmation('Explore more jobs you might like')).toBe(false)
  })

  it('recognizes submission messages without matching incidental apply/submitted text', () => {
    for (const text of [
      'Application submitted',
      'Application sent',
      'Successfully applied',
      'Thank you for applying',
      'You applied',
      'Application is done',
    ]) expect(isSubmissionMessage(text)).toBe(true)

    expect(isSubmissionMessage('Please apply before the deadline.')).toBe(false)
    expect(isSubmissionMessage('Reports are submitted every Friday.')).toBe(false)
    expect(isSubmissionMessage('This description explains how to apply.')).toBe(false)
  })
})
