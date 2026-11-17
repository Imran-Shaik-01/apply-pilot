import type { JobApplication, JobStatus } from '../shared/types'
import { getStableJobId } from '../shared/utils'

export type JobDraft = {
  title: string
  company: string
  url: string
  applicationUrl: string
  platform: string
  recruiter: string
  status: JobStatus
  appliedAt: string
  location: string
  workMode: string
  salary: string
  employmentType: string
  notes: string
}

export const localDateTimeValue = (date = new Date()) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

export const emptyJobDraft = (): JobDraft => ({
  title: '',
  company: '',
  url: '',
  applicationUrl: '',
  platform: '',
  recruiter: '',
  status: 'Applied',
  appliedAt: localDateTimeValue(),
  location: '',
  workMode: '',
  salary: '',
  employmentType: '',
  notes: '',
})

export const jobDraftFromApplication = (job: JobApplication): JobDraft => ({
  title: job.title,
  company: job.company,
  url: job.url,
  applicationUrl: job.applicationUrl ?? job.url,
  platform: job.platform ?? '',
  recruiter: job.recruiter ?? '',
  status: job.status,
  appliedAt: localDateTimeValue(new Date(job.appliedAt)),
  location: job.location ?? '',
  workMode: job.workMode ?? '',
  salary: job.salary ?? '',
  employmentType: job.employmentType ?? '',
  notes: job.notes ?? '',
})

export const jobApplicationFromDraft = (
  draft: JobDraft,
  editingJob: JobApplication | null,
  url: string,
  applicationUrl: string,
  appliedAt: string,
  timestamp: string,
): JobApplication => {
  const statusHistory = editingJob?.statusHistory ?? (
    editingJob ? [{ status: editingJob.status, changedAt: editingJob.updatedAt }] : []
  )

  return {
    id: editingJob?.id ?? getStableJobId(url),
    jobId: editingJob?.jobId,
    title: draft.title.trim(),
    company: draft.company.trim(),
    url,
    applicationUrl,
    status: draft.status,
    statusHistory: draft.status === editingJob?.status
      ? statusHistory
      : [...statusHistory, { status: draft.status, changedAt: timestamp }],
    source: editingJob?.source ?? new URL(url).hostname,
    appliedAt,
    createdAt: editingJob?.createdAt ?? timestamp,
    updatedAt: timestamp,
    location: draft.location.trim() || undefined,
    workMode: draft.workMode.trim() || undefined,
    salary: draft.salary.trim() || undefined,
    employmentType: draft.employmentType.trim() || undefined,
    notes: draft.notes.trim() || undefined,
    recruiter: draft.recruiter.trim() || undefined,
    platform: draft.platform.trim() || undefined,
  }
}
