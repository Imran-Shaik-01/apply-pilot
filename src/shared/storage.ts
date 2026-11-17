import Dexie, { type Table } from 'dexie'
import {
  defaultSettings,
  type DraftCapture,
  type DraftField,
  type GlobalDraft,
  type GlobalDraftState,
  type JobApplication,
  type Settings,
} from './types'
import {
  globalDraftSchema,
  globalDraftStateSchema,
  jobSchema,
  settingsSchema,
} from './schema'

const storageKey = 'apply-pilot-settings'

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

  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['settings'], (result) => {
      const lastError = chrome.runtime.lastError
      if (lastError) {
        reject(new Error(lastError.message ?? 'Could not read extension settings.'))
        return
      }
      try {
        resolve(settingsSchema.parse(result.settings ?? defaultSettings))
      } catch (error) {
        reject(error)
      }
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

let settingsQueue = Promise.resolve()
export const updateSettings = (patch: Partial<Settings>) => {
  const task = settingsQueue.then(async () => {
    const next = settingsSchema.parse({ ...(await getSettings()), ...patch })
    await writeChromeSettings(next)
    return next
  })
  settingsQueue = task.then(() => undefined, () => undefined)
  return task
}

const sendDraftRequest = async (type: string, payload?: unknown) => {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    throw new Error('Apply Pilot draft storage is unavailable outside the extension.')
  }
  const response = await chrome.runtime.sendMessage({ type, payload })
  if (!response?.ok) throw new Error(response?.message ?? 'Could not update the global draft.')
  return response
}

const parseGlobalDraftState = (value: unknown): GlobalDraftState =>
  globalDraftStateSchema.parse(value)

export const getGlobalDraft = async () => {
  const response = await sendDraftRequest('GET_GLOBAL_DRAFT')
  return parseGlobalDraftState({
    draft: response.draft,
    suppressedJobUrl: response.suppressedJobUrl,
  })
}

export const getPopupDraft = async (currentPageUrl: string) => {
  const response = await sendDraftRequest('GET_POPUP_DRAFT', { currentPageUrl })
  const state = parseGlobalDraftState({
    draft: response.draft,
    suppressedJobUrl: response.suppressedJobUrl,
  })
  const parsedCache = globalDraftSchema.safeParse(response.cachedDraft)
  return {
    ...state,
    cachedDraft: parsedCache.success ? parsedCache.data : undefined,
  }
}

export const cachePopupDraft = async (draft: GlobalDraft, urls: string[]) =>
  sendDraftRequest('CACHE_POPUP_DRAFT', { draft, urls })

export const clearPopupDraftCache = async (urls: string[]) =>
  sendDraftRequest('CLEAR_POPUP_DRAFT_CACHE', { urls })

export const restoreGlobalDraft = async (draft: GlobalDraft) =>
  parseGlobalDraftState(await sendDraftRequest('RESTORE_GLOBAL_DRAFT', { draft }))

export const editGlobalDraft = async (
  field: DraftField,
  value: string,
  currentPageUrl: string,
  sourceHost: string,
) => parseGlobalDraftState(await sendDraftRequest('EDIT_DRAFT', {
  field,
  value,
  currentPageUrl,
  sourceHost,
}))

export const refreshGlobalDraft = async (
  currentPageUrl: string,
  capture?: DraftCapture,
) => parseGlobalDraftState(await sendDraftRequest('REFRESH_DRAFT', {
  currentPageUrl,
  capture,
}))

export const saveGlobalDraft = async (jobUrl: string) =>
  parseGlobalDraftState(await sendDraftRequest('SAVE_DRAFT', { jobUrl }))

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
