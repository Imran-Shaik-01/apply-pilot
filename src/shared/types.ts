export const statusOptions = [
  'Applied',
  'Interviewing',
  'Offer',
  'Rejected',
  'Withdrawn',
  'Ghosted',
] as const

export type JobStatus = (typeof statusOptions)[number]

export interface StatusChange {
  status: JobStatus
  changedAt: string
}

export interface JobApplication {
  id: string
  jobId?: string
  title: string
  company: string
  url: string
  applicationUrl?: string
  status: JobStatus
  statusHistory?: StatusChange[]
  source: string
  appliedAt: string
  createdAt: string
  updatedAt: string
  location?: string
  workMode?: string
  salary?: string
  employmentType?: string
  notes?: string
  recruiter?: string
  platform?: string
}

export interface Settings {
  enabled: boolean
  weekStartDay: number
}

export const draftFields = [
  'title',
  'company',
  'jobUrl',
  'location',
  'workMode',
  'salary',
  'employmentType',
] as const

export type DraftField = (typeof draftFields)[number]

export interface DraftFields {
  title: string
  company: string
  location: string
  workMode: string
  salary: string
  employmentType: string
}

export interface DraftCapture {
  id?: string
  jobId?: string
  fields: DraftFields
  jobUrl: string
  sourceHost: string
}

export interface GlobalDraft {
  status: 'provisional' | 'locked' | 'submitted'
  fields: DraftFields
  userEdited: Partial<Record<DraftField, true>>
  jobUrl: string
  currentPageUrl: string
  sourceHost: string
  id?: string
  jobId?: string
  createdAt: string
  updatedAt: string
  lockedAt?: string
  submittedAt?: string
  notified?: boolean
  expiresAt: number
  flowTabIds?: number[]
}

export interface GlobalDraftState {
  draft?: GlobalDraft
  suppressedJobUrl?: string
}

export const defaultSettings: Settings = {
  enabled: true,
  weekStartDay: 1,
}
