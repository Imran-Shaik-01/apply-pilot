export type JobStatus =
  | 'Applied'
  | 'Interviewing'
  | 'Offer'
  | 'Rejected'
  | 'Withdrawn'
  | 'Ghosted'

export type ThemeMode = 'light' | 'dark' | 'system'

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
  autoSave: boolean
  weekStartDay: number
  theme: ThemeMode
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
  autoSave: false,
  weekStartDay: 1,
  theme: 'system',
}

export const statusOptions: JobStatus[] = [
  'Applied',
  'Interviewing',
  'Offer',
  'Rejected',
  'Withdrawn',
  'Ghosted',
]
