import Dexie, { type Table } from 'dexie'
import { defaultSettings, type JobApplication, type PopupDraft, type Settings } from './types'
import { jobSchema, popupDraftSchema, settingsSchema } from './schema'

const storageKey = 'apply-pilot-settings'
const popupDraftKey = 'apply-pilot-popup-draft'

class ApplyPilotDB extends Dexie {
  jobs!: Table<JobApplication, string>

  constructor() {
    super('apply-pilot-db')
    this.version(1).stores({
      jobs: 'id, status, source, company, title, appliedAt, url',
    })
  }
}

export const db = new ApplyPilotDB()

const readChromeSettings = async (): Promise<Settings> => {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    const raw = localStorage.getItem(storageKey)
    return raw ? settingsSchema.parse(JSON.parse(raw)) : defaultSettings
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(['settings'], (result) => {
      const settings = result.settings ?? defaultSettings
      resolve(settingsSchema.parse(settings))
    })
  })
}

const writeChromeSettings = async (value: Settings) => {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    localStorage.setItem(storageKey, JSON.stringify(value))
    return
  }

  await chrome.storage.local.set({ settings: value })
}

export const getSettings = async (): Promise<Settings> => readChromeSettings()

export const updateSettings = async (patch: Partial<Settings>) => {
  const next = settingsSchema.parse({ ...(await getSettings()), ...patch })
  await writeChromeSettings(next)
  return next
}

export const getPopupDraft = async (): Promise<PopupDraft | null> => {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    const raw = localStorage.getItem(popupDraftKey)
    return raw ? popupDraftSchema.parse(JSON.parse(raw)) : null
  }

  const result = await chrome.storage.local.get(['popupDraft'])
  return result.popupDraft ? popupDraftSchema.parse(result.popupDraft) : null
}

export const savePopupDraft = async (draft: PopupDraft) => {
  const parsed = popupDraftSchema.parse(draft)
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    localStorage.setItem(popupDraftKey, JSON.stringify(parsed))
    return
  }

  await chrome.storage.local.set({ popupDraft: parsed })
}

export const clearPopupDraft = async (pageUrl: string) => {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    localStorage.removeItem(popupDraftKey)
    localStorage.setItem('apply-pilot-suppressed-autocapture-url', pageUrl)
    return
  }

  const response = await chrome.runtime.sendMessage({
    type: 'CLEAR_SAVED_POPUP_DRAFT',
    payload: { pageUrl },
  })
  if (!response?.ok) {
    throw new Error(response?.message ?? 'Could not clear the saved popup draft.')
  }
}

export const listJobs = async (): Promise<JobApplication[]> => {
  return db.jobs.orderBy('appliedAt').reverse().toArray()
}

export const saveJob = async (job: JobApplication) => {
  const parsed = jobSchema.parse(job)
  await db.jobs.put(parsed)
  return parsed
}

export const upsertJob = async (job: JobApplication) => {
  const parsed = jobSchema.parse(job)
  await db.jobs.put(parsed)
  return parsed
}

export const getJobById = async (id: string) => db.jobs.get(id)

export const deleteJob = async (id: string) => {
  await db.jobs.delete(id)
}

export const seedDemoJobs = async () => {
  const existing = await listJobs()
  if (existing.length > 0) return existing

  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 86400000)
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000)
  const sixDaysAgo = new Date(now.getTime() - 6 * 86400000)

  const demoJobs: JobApplication[] = [
    {
      id: 'demo-1',
      title: 'Senior Product Designer',
      company: 'Northstar Labs',
      url: 'https://northstar.example/jobs/product-designer',
      applicationUrl: 'https://northstar.example/jobs/product-designer',
      source: 'LinkedIn',
      status: 'Interviewing',
      appliedAt: oneDayAgo.toISOString(),
      createdAt: oneDayAgo.toISOString(),
      updatedAt: oneDayAgo.toISOString(),
      location: 'Remote',
      workMode: 'Remote',
      employmentType: 'Full-time',
      salary: '$115k - $150k',
      notes: 'Portfolio reviewed by design lead.',
    },
    {
      id: 'demo-2',
      title: 'Frontend Engineer',
      company: 'Blue Harbor',
      url: 'https://blueharbor.example/careers/frontend-engineer',
      applicationUrl: 'https://blueharbor.example/careers/frontend-engineer',
      source: 'Greenhouse',
      status: 'Applied',
      appliedAt: threeDaysAgo.toISOString(),
      createdAt: threeDaysAgo.toISOString(),
      updatedAt: threeDaysAgo.toISOString(),
      location: 'New York, NY',
      workMode: 'Hybrid',
      employmentType: 'Full-time',
      salary: '$120k - $145k',
      notes: 'Follow up after one week.',
    },
    {
      id: 'demo-3',
      title: 'Platform Engineer',
      company: 'Sable Systems',
      url: 'https://sablesystems.example/jobs/platform-engineer',
      applicationUrl: 'https://sablesystems.example/jobs/platform-engineer',
      source: 'Wellfound',
      status: 'Offer',
      appliedAt: sixDaysAgo.toISOString(),
      createdAt: sixDaysAgo.toISOString(),
      updatedAt: sixDaysAgo.toISOString(),
      location: 'Austin, TX',
      workMode: 'On-site',
      employmentType: 'Full-time',
      salary: '$140k - $180k',
      notes: 'Offer in review; compare with other leads.',
    },
  ]

  for (const job of demoJobs) {
    await db.jobs.put(job)
  }

  return demoJobs
}
