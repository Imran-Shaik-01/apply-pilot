import { describe, expect, it } from 'vitest'
import { draftCaptureSchema, jobSchema, settingsSchema } from './schema'

const validJob = {
  id: 'job-1',
  title: 'Product Designer',
  company: 'Northstar Labs',
  url: 'https://jobs.example/roles/1',
  status: 'Applied',
  source: 'jobs.example',
  appliedAt: '2026-11-16T00:00:00.000Z',
  createdAt: '2026-11-16T00:00:00.000Z',
  updatedAt: '2026-11-16T00:00:00.000Z',
}

describe('jobSchema', () => {
  it('accepts a valid application', () => {
    expect(jobSchema.safeParse(validJob).success).toBe(true)
  })

  it('rejects invalid status and date values', () => {
    expect(jobSchema.safeParse({ ...validJob, status: 'Pending' }).success).toBe(false)
    expect(jobSchema.safeParse({ ...validJob, appliedAt: 'not-a-date' }).success).toBe(false)
  })

  it('validates optional status history entries', () => {
    expect(jobSchema.safeParse({
      ...validJob,
      statusHistory: [{ status: 'Applied', changedAt: validJob.updatedAt }],
    }).success).toBe(true)
    expect(jobSchema.safeParse({
      ...validJob,
      statusHistory: [{ status: 'Pending', changedAt: validJob.updatedAt }],
    }).success).toBe(false)
  })
})

describe('settingsSchema', () => {
  it('applies defaults and rejects an invalid week start', () => {
    expect(settingsSchema.parse({})).toEqual({ enabled: true, weekStartDay: 1 })
    expect(settingsSchema.safeParse({ weekStartDay: 7 }).success).toBe(false)
  })
})

describe('draftCaptureSchema', () => {
  const capture = {
    fields: {
      title: 'Engineer',
      company: '',
      location: '',
      workMode: '',
      salary: '',
      employmentType: '',
    },
    jobUrl: 'https://jobs.example/jobs/42',
    sourceHost: 'jobs.example',
  }

  it('accepts a partial capture with either role or company', () => {
    expect(draftCaptureSchema.safeParse(capture).success).toBe(true)
    expect(draftCaptureSchema.safeParse({
      ...capture,
      fields: { ...capture.fields, title: '', company: 'Northstar' },
    }).success).toBe(true)
  })

  it('rejects a capture when both title and company are empty', () => {
    expect(draftCaptureSchema.safeParse({
      ...capture,
      fields: { ...capture.fields, title: '', company: '' },
    }).success).toBe(false)
  })
})
