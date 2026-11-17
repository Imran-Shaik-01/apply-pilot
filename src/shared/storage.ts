import Dexie, { type Table } from 'dexie'
import { defaultSettings, type JobApplication, type Settings } from './types'
import { jobSchema, settingsSchema } from './schema'

const storageKey = 'apply-pilot-settings'
const popupDraftKey = 'apply-pilot-popup-draft'

class ApplyPilotDB extends Dexie {
  jobs!: Table<JobApplication, string>

  constructor() {
    super('apply-pilot-db')
    this.version(1).stores({
      jobs: 'id, status, source, company, title, appliedAt, url',
    })
    this.version(2)
      .stores({
        jobs: 'id, status, source, company, title, appliedAt, updatedAt, url',
      })
      .upgrade(async (transaction) => {
        await transaction.table('jobs').toCollection().modify((job: JobApplication) => {
          job.statusHistory ??= [{ status: job.status, changedAt: job.updatedAt }]
        })
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

const listJobsDirect = async (): Promise<JobApplication[]> => {
  return db.jobs.orderBy('appliedAt').reverse().toArray()
}

const saveJobDirect = async (job: JobApplication) => {
  const parsed = jobSchema.parse(job)
  await db.jobs.put(parsed)
  return parsed
}

const deleteJobDirect = async (id: string) => {
  await db.jobs.delete(id)
}

const isExtensionPage = () =>
  typeof chrome !== 'undefined' &&
  Boolean(chrome.runtime?.id) &&
  typeof document !== 'undefined'

const sendJobRequest = async <T,>(type: string, payload?: unknown): Promise<T> => {
  const response = await chrome.runtime.sendMessage({ type, payload })
  if (!response?.ok) {
    throw new Error(response?.message ?? `Could not complete ${type}.`)
  }
  return response.data as T
}

export const listJobs = async (): Promise<JobApplication[]> =>
  isExtensionPage() ? sendJobRequest<JobApplication[]>('GET_JOBS') : listJobsDirect()

export const saveJob = async (job: JobApplication) => {
  const parsed = jobSchema.parse(job)
  return isExtensionPage()
    ? sendJobRequest<JobApplication>('SAVE_JOB', parsed)
    : saveJobDirect(parsed)
}

export const deleteJob = async (id: string) => {
  if (isExtensionPage()) {
    await sendJobRequest<void>('DELETE_JOB', { id })
    return
  }
  await deleteJobDirect(id)
}
