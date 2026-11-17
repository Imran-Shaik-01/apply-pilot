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

export interface PopupDraft {
  title: string
  company: string
  location: string
  workMode: string
  salary: string
  employmentType: string
  pageUrl: string
  autoCaptured?: boolean
}

export const defaultSettings: Settings = {
  enabled: true,
  weekStartDay: 1,
}
