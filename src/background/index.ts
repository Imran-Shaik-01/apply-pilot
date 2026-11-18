import { z } from 'zod'
import {
  type GlobalDraft,
  type GlobalDraftState,
} from '../shared/types'
import { deleteJob, getSettings, listJobs, saveJob, updateSettings } from '../shared/storage'
import {
  globalDraftMessageSchema,
  globalDraftStateSchema,
  jobSchema,
  popupDraftCacheEntrySchema,
} from '../shared/schema'
import {
  applyPageCapture,
  canonicalJobUrlKey,
  editDraft,
  expireDraft,
  lockDraft,
  markDraftSubmitted,
  refreshDraft,
  restoreDraftFromCache,
  saveDraft,
} from '../shared/draft-state'
import { isoNow } from '../shared/utils'

const draftStorageKey = 'apply-pilot-global-draft'
const draftExpiryAlarm = 'apply-pilot-global-draft-expiry'
const popupDraftCachePrefix = 'apply-pilot-popup-draft:'
const popupDraftCacheMaxEntries = 20
const notificationId = 'apply-pilot-application-submitted'
const submissionPattern =
  /(successfully applied|application (has been |was )?(submitted|sent|received|complete[d]?)|thank(s| you) for applying|you('ve| have) applied|you applied|applied successfully|application (is )?done)/i
const globalDraftMessageTypes = new Set([
  'GET_GLOBAL_DRAFT',
  'GET_POPUP_DRAFT',
  'GET_DRAFT_STATUS',
  'CACHE_POPUP_DRAFT',
  'CLEAR_POPUP_DRAFT_CACHE',
  'RESTORE_GLOBAL_DRAFT',
  'PAGE_STATE',
  'LOCK_DRAFT',
  'EDIT_DRAFT',
  'APPLICATION_SUBMITTED',
  'REFRESH_DRAFT',
  'SAVE_DRAFT',
])

const saveJobPayloadSchema = jobSchema.omit({ createdAt: true, updatedAt: true }).extend({
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
})
const deleteJobPayloadSchema = z.object({ id: z.string().min(1) })

let captureQueue = Promise.resolve()
const serializeCaptureOperation = <T,>(operation: () => Promise<T>) => {
  const result = captureQueue.then(operation, operation)
  captureQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

const readGlobalState = async (): Promise<GlobalDraftState> => {
  const stored = await chrome.storage.local.get(draftStorageKey)
  if (stored[draftStorageKey] === undefined) return {}
  const parsed = globalDraftStateSchema.safeParse(stored[draftStorageKey])
  if (!parsed.success) {
    console.error('Apply Pilot found an invalid persisted draft and cleared it.')
    await writeGlobalState({})
    return {}
  }
  const state = expireDraft(parsed.data)
  if (state.draft !== parsed.data.draft) await writeGlobalState(state)
  return state
}

const writeGlobalState = async (state: GlobalDraftState) => {
  const parsed = globalDraftStateSchema.parse(state)
  if (!parsed.draft && !parsed.suppressedJobUrl) {
    await chrome.storage.local.remove(draftStorageKey)
    await chrome.alarms.clear(draftExpiryAlarm)
    return
  }
  await chrome.storage.local.set({ [draftStorageKey]: parsed })
  if (parsed.draft) {
    chrome.alarms.create(draftExpiryAlarm, { when: parsed.draft.expiresAt })
  } else {
    await chrome.alarms.clear(draftExpiryAlarm)
  }
}

const isHttpUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

const popupDraftCacheKey = (url: string) =>
  `${popupDraftCachePrefix}${canonicalJobUrlKey(url)}`

const clearPopupDraftCache = async (urls?: string[]) => {
  if (urls) {
    const keys = [...new Set(urls.filter(isHttpUrl).map(popupDraftCacheKey))]
    if (keys.length) await chrome.storage.session.remove(keys)
    return
  }

  const stored = await chrome.storage.session.get(null)
  const keys = Object.keys(stored).filter((key) => key.startsWith(popupDraftCachePrefix))
  if (keys.length) await chrome.storage.session.remove(keys)
}

const readPopupDraftCache = async (url: string) => {
  if (!isHttpUrl(url)) return undefined
  const canonicalUrl = canonicalJobUrlKey(url)
  const key = popupDraftCacheKey(canonicalUrl)
  const stored = await chrome.storage.session.get(key)
  const parsed = popupDraftCacheEntrySchema.safeParse(stored[key])
  if (!parsed.success || parsed.data.url !== canonicalUrl) {
    if (stored[key] !== undefined) {
      console.error('Apply Pilot found an invalid popup cache entry and removed it.')
      await chrome.storage.session.remove(key)
    }
    return undefined
  }
  if (Date.now() >= parsed.data.draft.expiresAt) {
    await chrome.storage.session.remove(key)
    return undefined
  }
  return parsed.data.draft
}

const writePopupDraftCache = async (draft: GlobalDraft, urls: string[]) => {
  if (Date.now() >= draft.expiresAt) throw new Error('Cannot cache an expired draft.')
  const now = Date.now()
  const nextEntries = new Map<string, z.infer<typeof popupDraftCacheEntrySchema>>()
  for (const url of new Set(urls.filter(isHttpUrl).map(canonicalJobUrlKey))) {
    nextEntries.set(popupDraftCacheKey(url), { url, draft, cachedAt: now })
  }
  if (!nextEntries.size) return

  const stored = await chrome.storage.session.get(null)
  const allCacheKeys = Object.keys(stored).filter((key) => key.startsWith(popupDraftCachePrefix))
  const existing = Object.entries(stored)
    .filter(([key]) => key.startsWith(popupDraftCachePrefix))
    .flatMap(([key, value]) => {
      const parsed = popupDraftCacheEntrySchema.safeParse(value)
      return parsed.success && Date.now() < parsed.data.draft.expiresAt
        ? [{ key, cachedAt: parsed.data.cachedAt }]
        : []
    })
  const retained = existing
    .filter(({ key }) => !nextEntries.has(key))
    .concat([...nextEntries].map(([key, entry]) => ({ key, cachedAt: entry.cachedAt })))
    .sort((left, right) => right.cachedAt - left.cachedAt)
  const retainedKeys = new Set(retained.slice(0, popupDraftCacheMaxEntries).map(({ key }) => key))
  const removeKeys = allCacheKeys.filter((key) => !retainedKeys.has(key))

  await chrome.storage.session.set(Object.fromEntries(nextEntries))
  if (removeKeys.length) await chrome.storage.session.remove(removeKeys)
}

const getPageSender = (sender: chrome.runtime.MessageSender) => {
  if (sender.tab?.id === undefined || sender.frameId !== 0 || !sender.url) return null
  try {
    const url = new URL(sender.url)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return {
      tabId: sender.tab.id,
      windowId: sender.tab.windowId,
      openerTabId: sender.tab.openerTabId,
      url,
    }
  } catch {
    return null
  }
}

const isExtensionSender = (sender: chrome.runtime.MessageSender) =>
  Boolean(sender.url && sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`))

const currentPageMatchesSender = (currentPageUrl: string, senderUrl: URL) => {
  try {
    return new URL(currentPageUrl).origin === senderUrl.origin
  } catch {
    return false
  }
}

const setSubmittedBadge = async (enabled: boolean) => {
  await chrome.action.setBadgeText({ text: enabled ? '✓' : '' })
  if (enabled) {
    await chrome.action.setBadgeBackgroundColor({ color: '#16803c' })
  }
}

const showSubmissionToast = async (tabId: number) => {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SHOW_SUBMISSION_TOAST' })
  } catch (error) {
    console.error('Apply Pilot could not show the submission toast.', error)
  }
}

const showNotificationFallback = async () => {
  try {
    await setSubmittedBadge(true)
  } catch (error) {
    console.error('Apply Pilot could not set the submission badge.', error)
  }
  try {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/app-128.png'),
      title: 'Apply Pilot',
      message: 'Application submitted? Click to review and save',
    })
  } catch (error) {
    console.error('Apply Pilot could not show a submission notification.', error)
  }
}

const tryOpenPopup = async (windowId?: number) => {
  try {
    const focused = windowId === undefined
      ? (await chrome.windows.getLastFocused()).focused
      : (await chrome.windows.get(windowId)).focused
    if (windowId === undefined) await chrome.action.openPopup()
    else await chrome.action.openPopup({ windowId })
    return focused === true
  } catch (error) {
    console.error('Apply Pilot could not open the popup automatically.', error)
    return false
  }
}

const handleNewSubmission = async (tabId: number, windowId?: number) => {
  await showSubmissionToast(tabId)
  if (!await tryOpenPopup(windowId)) await showNotificationFallback()
}

const processPageState = async (
  request: Extract<z.infer<typeof globalDraftMessageSchema>, { type: 'PAGE_STATE' }>,
  sender: chrome.runtime.MessageSender,
) => {
  const context = getPageSender(sender)
  if (!context || !currentPageMatchesSender(request.payload.currentPageUrl, context.url)) return false
  const settings = await getSettings()
  if (!settings.enabled) return false

  const state = await readGlobalState()
  const next = applyPageCapture(
    state,
    request.payload.capture,
    request.payload.strongSignal,
    request.payload.currentPageUrl,
    Date.now(),
    context.tabId,
    context.openerTabId,
  )
  if (next === state) return true
  await writeGlobalState(next)
  return true
}

const restoreDraftExpiryAlarm = async () => {
  const state = await readGlobalState()
  await writeGlobalState(state)
}

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    try {
      const settings = await getSettings()
      await updateSettings(settings)
    } catch (error) {
      console.error('Apply Pilot could not initialize extension settings.', error)
    }

    void serializeCaptureOperation(restoreDraftExpiryAlarm).catch((error: unknown) => {
      console.error('Apply Pilot could not restore the draft expiry alarm after installation.', error)
    })

    if (typeof chrome !== 'undefined' && chrome.contextMenus) {
      chrome.contextMenus.removeAll(() => {
        if (chrome.runtime.lastError) {
          console.error('Apply Pilot could not reset the context menu.', chrome.runtime.lastError.message)
          return
        }
        chrome.contextMenus.create({
          id: 'apply-pilot-save',
          title: 'Save this job',
          contexts: ['page'],
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('Apply Pilot could not create the context menu.', chrome.runtime.lastError.message)
          }
        })
      })
    }
  })()
})

chrome.runtime.onStartup.addListener(() => {
  void serializeCaptureOperation(restoreDraftExpiryAlarm).catch((error: unknown) => {
    console.error('Apply Pilot could not restore its draft expiry alarm on startup.', error)
  })
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !('settings' in changes)) return
  const settings = changes.settings.newValue as { enabled?: boolean } | undefined
  const previousSettings = changes.settings.oldValue as { enabled?: boolean } | undefined
  if (settings?.enabled === true && previousSettings?.enabled === false) {
    void serializeCaptureOperation(() => clearPopupDraftCache()).catch((error: unknown) => {
      console.error('Apply Pilot could not clear the popup cache after capture was enabled.', error)
    })
    return
  }
  if (settings?.enabled !== false) return

  void serializeCaptureOperation(async () => {
    await writeGlobalState({})
    await clearPopupDraftCache()
    await setSubmittedBadge(false)
    await chrome.notifications.clear(notificationId)
  }).catch((error: unknown) => {
    console.error('Apply Pilot could not clear the global draft after capture was disabled.', error)
  })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const parsed = globalDraftMessageSchema.safeParse(message)
  if (parsed.success) {
    void serializeCaptureOperation(async () => {
      const request = parsed.data

      if (request.type === 'PAGE_STATE') {
        return { accepted: await processPageState(request, sender) }
      }

      if (request.type === 'LOCK_DRAFT' || request.type === 'APPLICATION_SUBMITTED') {
        const context = getPageSender(sender)
        if (!context || !currentPageMatchesSender(request.payload.currentPageUrl, context.url)) {
          throw new Error('A matching top-level HTTP(S) page is required.')
        }
        if (!await getSettings().then((settings) => settings.enabled)) {
          return { accepted: false }
        }
        const state = await readGlobalState()
        if (request.type === 'LOCK_DRAFT') {
          const capture = request.payload.capture
          if (capture && !currentPageMatchesSender(capture.jobUrl, context.url)) {
            throw new Error('A job capture must come from the current page origin.')
          }
          const locked = lockDraft(
            state,
            capture,
            request.payload.currentPageUrl,
            Date.now(),
            context.tabId,
            context.openerTabId,
          )
          await writeGlobalState(locked)
          return { accepted: true, status: locked.draft?.status }
        }
        let submissionTextMatched = submissionPattern.test(request.payload.text)
        if (!submissionTextMatched) {
          try {
            const path = new URL(request.payload.currentPageUrl).pathname
            submissionTextMatched =
              /(?:confirmation|thank-you|submitted|success)/i.test(path) &&
              /^done[.!]?$/i.test(request.payload.text)
          } catch {
            submissionTextMatched = false
          }
        }
        if (!submissionTextMatched) return { accepted: false }
        const result = markDraftSubmitted(
          state,
          request.payload.currentPageUrl,
          Date.now(),
          context.tabId,
          context.openerTabId,
        )
        if (!result.newlySubmitted) return { accepted: true, newlySubmitted: false }
        await writeGlobalState(result.state)
        await handleNewSubmission(context.tabId, context.windowId)
        return { accepted: true, newlySubmitted: true }
      }

      if (request.type === 'GET_DRAFT_STATUS') {
        const context = getPageSender(sender)
        if (!context) throw new Error('A top-level HTTP(S) page is required.')
        const state = await readGlobalState()
        return { status: state.draft?.status ?? 'none' }
      }

      if (!isExtensionSender(sender)) {
        throw new Error('An Apply Pilot extension page is required for this draft operation.')
      }

      if (request.type === 'GET_GLOBAL_DRAFT') {
        return readGlobalState()
      }

      if (request.type === 'GET_POPUP_DRAFT') {
        const [state, settings] = await Promise.all([readGlobalState(), getSettings()])
        const cachedDraft = settings.enabled
          ? await readPopupDraftCache(request.payload.currentPageUrl)
          : undefined
        return { ...state, cachedDraft }
      }

      if (request.type === 'CACHE_POPUP_DRAFT') {
        await writePopupDraftCache(request.payload.draft, request.payload.urls)
        return { cached: true }
      }

      if (request.type === 'CLEAR_POPUP_DRAFT_CACHE') {
        await clearPopupDraftCache(request.payload.urls)
        return { cleared: true }
      }

      if (request.type === 'RESTORE_GLOBAL_DRAFT') {
        const state = await readGlobalState()
        if (!await getSettings().then((settings) => settings.enabled)) return state
        const next = restoreDraftFromCache(state, request.payload.draft)
        if (next !== state) await writeGlobalState(next)
        return next
      }

      if (request.type === 'EDIT_DRAFT') {
        const state = await readGlobalState()
        const activeTab = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]
        const next = editDraft(
          state,
          request.payload.field,
          request.payload.value,
          request.payload.currentPageUrl,
          request.payload.sourceHost,
          Date.now(),
          activeTab?.id,
        )
        await writeGlobalState(next)
        return next
      }

      if (request.type === 'REFRESH_DRAFT') {
        const previous = await readGlobalState()
        const settings = await getSettings()
        const capture = settings.enabled ? request.payload.capture : undefined
        const next = refreshDraft(
          previous,
          capture,
          request.payload.currentPageUrl,
          Date.now(),
          (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id,
        )
        await writeGlobalState(next)
        await clearPopupDraftCache([
          previous.draft?.jobUrl,
          previous.draft?.currentPageUrl,
          request.payload.currentPageUrl,
        ].filter((url): url is string => Boolean(url && isHttpUrl(url))))
        await setSubmittedBadge(false)
        await chrome.notifications.clear(notificationId)
        return next
      }

      const previous = await readGlobalState()
      const next = saveDraft(previous, request.payload.jobUrl)
      await writeGlobalState(next)
      await clearPopupDraftCache()
      await setSubmittedBadge(false)
      await chrome.notifications.clear(notificationId)
      return next
    }).then((data) => {
      sendResponse({ ok: true, ...data })
    }).catch((error: unknown) => {
      sendResponse({
        ok: false,
        message: error instanceof Error ? error.message : 'Could not update the global draft.',
      })
    })
    return true
  }

  const rawType = typeof message === 'object' && message !== null
    ? (message as { type?: unknown }).type
    : undefined
  if (typeof rawType === 'string' && globalDraftMessageTypes.has(rawType)) {
    sendResponse({ ok: false, message: 'Invalid draft message.' })
    return false
  }

  const { type, payload } = message ?? {}
  ;(async () => {
    try {
      switch (type) {
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

chrome.notifications.onClicked.addListener(() => {
  void (async () => {
    try {
      const window = await chrome.windows.getLastFocused()
      await chrome.action.openPopup({ windowId: window.id })
      await chrome.notifications.clear(notificationId)
    } catch (error) {
      console.error('Apply Pilot could not reopen the popup from its notification.', error)
    }
  })()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== draftExpiryAlarm) return
  void serializeCaptureOperation(async () => {
    const state = await readGlobalState()
    await writeGlobalState(state)
    if (!state.draft) {
      await setSubmittedBadge(false)
      await chrome.notifications.clear(notificationId)
    }
  }).catch((error: unknown) => {
    console.error('Apply Pilot could not expire the global draft.', error)
  })
})
