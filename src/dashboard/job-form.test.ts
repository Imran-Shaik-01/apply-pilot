import { describe, expect, it } from 'vitest'
import type { JobApplication } from '../shared/types'
import {
  jobApplicationFromDraft,
  jobDraftFromApplication,
} from './job-form'

const existingJob: JobApplication = {
  id: 'jobs.example-1',
  title: 'Engineer',
  company: 'Northstar',
  url: 'https://jobs.example/roles/1',
  applicationUrl: 'https://jobs.example/apply/confirmation',
  status: 'Applied',
  statusHistory: [{ status: 'Applied', changedAt: '2026-11-16T00:00:00.000Z' }],
  source: 'jobs.example',
  platform: 'Naukri Campus',
  recruiter: 'Jordan Lee',
  appliedAt: '2026-11-16T00:00:00.000Z',
  createdAt: '2026-11-16T00:00:00.000Z',
  updatedAt: '2026-11-16T00:00:00.000Z',
}

describe('application edit mapping', () => {
  it('preserves application URL, platform, and recruiter through an edit', () => {
    const draft = jobDraftFromApplication(existingJob)
    const updated = jobApplicationFromDraft(
      draft,
      existingJob,
      existingJob.url,
      draft.applicationUrl,
      existingJob.appliedAt,
      '2026-11-17T00:00:00.000Z',
    )

    expect(draft).toMatchObject({
      applicationUrl: existingJob.applicationUrl,
      platform: existingJob.platform,
      recruiter: existingJob.recruiter,
    })
    expect(updated).toMatchObject({
      applicationUrl: existingJob.applicationUrl,
      platform: existingJob.platform,
      recruiter: existingJob.recruiter,
      id: existingJob.id,
    })
  })
})
