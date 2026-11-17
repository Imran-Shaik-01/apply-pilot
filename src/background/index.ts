import { z } from 'zod'
import { defaultSettings, type PopupDraft, type Settings } from '../shared/types'
import { deleteJob, getSettings, listJobs, saveJob, updateSettings } from '../shared/storage'
import { jobSchema, settingsSchema } from '../shared/schema'
import { isoNow } from '../shared/utils'

const popupDraftTtlMs = 24 * 60 * 60 * 1000

const automaticCaptureSchema = z.object({
  title: z.string().trim().min(1).max(500),
  company: z.string().trim().min(1).max(500),
  location: z.string().max(500).optional(),
  workMode: z.string().max(200).optional(),
  salary: z.string().max(200).optional(),
  employmentType: z.string().max(200).optional(),
  pageUrl: z.string().url(),
})

const saveJobPayloadSchema = jobSchema.omit({ createdAt: true, updatedAt: true }).extend({
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
})

const deleteJobPayloadSchema = z.object({ id: z.string().min(1) })

const openDashboard = () => {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') })
  }
}

const getCapturePageKey = (pageUrl: string) => {
  const url = new URL(pageUrl)
  url.hash = ''
  return url.toString()
}

const cleanupExpiredPopupDraft = async () => {
  const { popupDraftExpiry } = await chrome.storage.local.get(['popupDraftExpiry'])
  if (
    typeof popupDraftExpiry !== 'number' ||
    !Number.isFinite(popupDraftExpiry) ||
    Date.now() >= popupDraftExpiry
  ) {
    await chrome.storage.local.remove(['popupDraft', 'popupDraftExpiry'])
  }
}

let captureQueue = Promise.resolve()
const serializeCaptureOperation = <T,>(operation: () => Promise<T>) => {
  const result = captureQueue.then(operation, operation)
  captureQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

const saveAutomaticCapture = async (payload: unknown, sender: chrome.runtime.MessageSender) => {
  if (!sender.tab || sender.frameId !== 0 || !sender.url) return false
  const parsedCapture = automaticCaptureSchema.safeParse(payload)
  if (!parsedCapture.success) return false
  const capture = parsedCapture.data

  let pageUrl: URL
  let senderUrl: URL
  try {
    pageUrl = new URL(capture.pageUrl)
    senderUrl = new URL(sender.url)
  } catch {
    return false
  }
  if (!['http:', 'https:'].includes(pageUrl.protocol) || pageUrl.hostname !== senderUrl.hostname) return false

  const stored = await chrome.storage.local.get([
    'settings',
    'popupDraft',
    'popupDraftExpiry',
    'suppressedAutoCaptureUrl',
  ])
  const settings = stored.settings as Pick<Settings, 'enabled'> | undefined
  if (settings?.enabled !== true) return false

  const pageKey = getCapturePageKey(pageUrl.toString())
  if (stored.suppressedAutoCaptureUrl === pageKey) return false

  const currentDraft = stored.popupDraft as PopupDraft | undefined
  const draftExpired =
    currentDraft &&
    (
      typeof stored.popupDraftExpiry !== 'number' ||
      !Number.isFinite(stored.popupDraftExpiry) ||
      Date.now() >= stored.popupDraftExpiry
    )
  if (draftExpired) {
    await chrome.storage.local.remove(['popupDraft', 'popupDraftExpiry'])
  }
  if (currentDraft && !draftExpired && currentDraft.autoCaptured !== true) return false

  if (stored.suppressedAutoCaptureUrl) {
    await chrome.storage.local.remove('suppressedAutoCaptureUrl')
  }

  const autoDraft: PopupDraft = {
    title: capture.title,
    company: capture.company,
    location: capture.location ?? '',
    workMode: capture.workMode ?? '',
    salary: capture.salary ?? '',
    employmentType: capture.employmentType ?? '',
    pageUrl: pageUrl.toString(),
    autoCaptured: true,
  }
  const popupDraftExpiry = Date.now() + popupDraftTtlMs
  await chrome.storage.local.set({
    popupDraft: autoDraft,
    popupDraftExpiry,
  })
  chrome.alarms.create('popup-draft-expiry', { when: popupDraftExpiry })
  return true
}

const clearSavedPopupDraft = async (payload: unknown) => {
  if (!payload || typeof payload !== 'object' || !('pageUrl' in payload) || typeof payload.pageUrl !== 'string') {
    throw new Error('A valid page URL is required to clear the saved draft.')
  }

  let pageKey: string
  try {
    const url = new URL(payload.pageUrl)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported page URL.')
    pageKey = getCapturePageKey(url.toString())
  } catch {
    throw new Error('A valid page URL is required to clear the saved draft.')
  }

  await chrome.storage.local.set({ suppressedAutoCaptureUrl: pageKey })
  await chrome.storage.local.remove(['popupDraft', 'popupDraftExpiry'])
}

const clearReloadedAutomaticCapture = async (
  payload: unknown,
  sender: chrome.runtime.MessageSender,
) => {
  if (
    !sender.tab ||
    sender.frameId !== 0 ||
    !sender.url ||
    !payload ||
    typeof payload !== 'object' ||
    !('pageUrl' in payload) ||
    typeof payload.pageUrl !== 'string'
  ) {
    return false
  }

  let pageUrl: URL
  let senderUrl: URL
  try {
    pageUrl = new URL(payload.pageUrl)
    senderUrl = new URL(sender.url)
  } catch {
    return false
  }
  if (!['http:', 'https:'].includes(pageUrl.protocol) || pageUrl.hostname !== senderUrl.hostname) return false

  const pageKey = getCapturePageKey(pageUrl.toString())
  const stored = await chrome.storage.local.get(['popupDraft', 'popupDraftExpiry'])
  const currentDraft = stored.popupDraft as PopupDraft | undefined
  if (
    currentDraft?.autoCaptured === true &&
    getCapturePageKey(currentDraft.pageUrl) === pageKey
  ) {
    await chrome.storage.local.remove(['popupDraft', 'popupDraftExpiry'])
  }
  await chrome.storage.local.set({ suppressedAutoCaptureUrl: pageKey })
  return true
}

chrome.runtime.onInstalled.addListener(async () => {
  await cleanupExpiredPopupDraft().catch((error: unknown) => {
    console.error('Apply Pilot could not clean up expired job-page data.', error)
  })
  const settings = await getSettings().catch(() => defaultSettings)
  await updateSettings(settings)

  if (typeof chrome !== 'undefined' && chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'apply-pilot-save',
        title: 'Save this job',
        contexts: ['page'],
      })

      chrome.runtime.onStartup.addListener(() => {
        void cleanupExpiredPopupDraft().catch((error: unknown) => {
          console.error('Apply Pilot could not clean up expired job-page data.', error)
        })
      })
    })
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message ?? {}

  ;(async () => {
    try {
      switch (type) {
        case 'GET_SETTINGS': {
          sendResponse({ ok: true, data: await getSettings() })
          break
        }
        case 'AUTO_CAPTURE_PAGE': {
          sendResponse({
            ok: true,
            saved: await serializeCaptureOperation(() => saveAutomaticCapture(payload, sender)),
          })
          break
        }
        case 'CLEAR_SAVED_POPUP_DRAFT': {
          await serializeCaptureOperation(() => clearSavedPopupDraft(payload))
          sendResponse({ ok: true })
          break
        }
        case 'CLEAR_RELOADED_AUTO_CAPTURE': {
          sendResponse({
            ok: true,
            cleared: await serializeCaptureOperation(() => clearReloadedAutomaticCapture(payload, sender)),
          })
          break
        }
        case 'UPDATE_SETTINGS': {
          const settingsPatch = settingsSchema.partial().parse(payload)
          const settings = await updateSettings(settingsPatch)
          sendResponse({ ok: true, data: settings })
          break
        }
        case 'GET_JOBS': {
          sendResponse({ ok: true, data: await listJobs() })
          break
        }
        case 'SAVE_JOB': {
          const parsedJob = saveJobPayloadSchema.parse(payload)
          const now = isoNow()
          const recorded = await saveJob({
            ...parsedJob,
            updatedAt: now,
            createdAt: parsedJob.createdAt ?? now,
          })
          sendResponse({ ok: true, data: recorded })
          break
        }
        case 'DELETE_JOB': {
          const { id } = deleteJobPayloadSchema.parse(payload)
          await deleteJob(id)
          sendResponse({ ok: true })
          break
        }
        case 'OPEN_DASHBOARD': {
          openDashboard()
          sendResponse({ ok: true })
          break
        }
        default:
          sendResponse({ ok: false, message: 'Unknown message type' })
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unknown error'
      sendResponse({ ok: false, message: messageText })
    }
  })()

  return true
})

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'apply-pilot-save' && tab?.id) {
    void chrome.action.openPopup({ windowId: tab.windowId }).catch((error: unknown) => {
      console.error('Could not open the Apply Pilot popup from the context menu.', error)
    })
  }
})

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === 'popup-draft-expiry') {
    void cleanupExpiredPopupDraft().catch((error: unknown) => {
      console.error('Apply Pilot could not clean up expired job-page data.', error)
    })
    return
  }

  if (alarm.name === 'follow-up') {
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/app-128.png'),
      title: 'Apply Pilot reminder',
      message: 'A role in your pipeline may need a follow-up.',
    })
  }
})
