export type JobStatus =
  | 'Applied'
  | 'Interviewing'
  | 'Offer'
  | 'Rejected'
  | 'Withdrawn'
  | 'Ghosted'

export interface JobApplication {
  id: string
  jobId?: string
  title: string
  company: string
  url: string
  applicationUrl?: string
  status: JobStatus
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

export const statusOptions: JobStatus[] = [
  'Applied',
  'Interviewing',
  'Offer',
  'Rejected',
  'Withdrawn',
  'Ghosted',
]
