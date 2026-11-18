import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteJob, getSettings, listJobs, saveJob } from '../shared/storage'
import type { JobApplication } from '../shared/types'

vi.mock('../shared/storage', () => ({
  deleteJob: vi.fn(),
  getSettings: vi.fn(),
  listJobs: vi.fn(),
  saveJob: vi.fn(),
  updateSettings: vi.fn(),
}))

const listeners = new Map<string, unknown>()
const event = (name: string) => ({
  addListener: (listener: unknown) => listeners.set(name, listener),
})
const localValues = new Map<string, unknown>()
const localGet = vi.fn(async (key: string) => ({ [key]: localValues.get(key) }))
const localSet = vi.fn(async (values: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(values)) localValues.set(key, value)
})
const localRemove = vi.fn(async (key: string) => {
  localValues.delete(key)
})
const sessionValues = new Map<string, unknown>()
const sessionGet = vi.fn(async (keys: string | string[] | null) => {
  if (keys === null) return Object.fromEntries(sessionValues)
  const requested = typeof keys === 'string' ? [keys] : keys
  return Object.fromEntries(
    requested
      .filter((key) => sessionValues.has(key))
      .map((key) => [key, sessionValues.get(key)]),
  )
})
const sessionSet = vi.fn(async (values: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(values)) sessionValues.set(key, value)
})
const sessionRemove = vi.fn(async (keys: string | string[]) => {
  for (const key of typeof keys === 'string' ? [keys] : keys) sessionValues.delete(key)
})
const mockWindowsGet = vi.fn().mockResolvedValue({ focused: true })

const application: JobApplication = {
  id: 'jobs.example-/roles/1',
  title: 'Engineer',
  company: 'Northstar',
  url: 'https://jobs.example/roles/1',
  status: 'Applied',
  statusHistory: [{ status: 'Applied', changedAt: '2026-11-16T00:00:00.000Z' }],
  source: 'jobs.example',
  appliedAt: '2026-11-16T00:00:00.000Z',
  createdAt: '2026-11-16T00:00:00.000Z',
  updatedAt: '2026-11-16T00:00:00.000Z',
}

type MessageHandler = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => unknown

const send = (message: unknown, sender = {} as chrome.runtime.MessageSender) =>
  new Promise<unknown>((resolve) => {
    const handler = listeners.get('message') as MessageHandler
    handler(message, sender, resolve)
  })

const sendFromTab = (message: unknown, tabId = 42) =>
  send(message, {
    tab: { id: tabId, windowId: 7 },
    frameId: 0,
    url: 'https://jobs.example/roles/1',
  } as chrome.runtime.MessageSender)

const sendFromPopup = (message: unknown) =>
  send(message, {
    url: 'chrome-extension://extension-id/popup.html',
  } as chrome.runtime.MessageSender)

const capture = {
  id: 'jobs.example-1',
  jobId: '1',
  fields: {
    title: 'Engineer',
    company: 'Northstar',
    location: 'Toronto',
    workMode: 'Hybrid',
    salary: 'INR 7 Lacs P.A.',
    employmentType: 'Full-time',
  },
  jobUrl: 'https://jobs.example/roles/1',
  sourceHost: 'jobs.example',
}

beforeAll(async () => {
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'extension-id',
      onInstalled: event('installed'),
      onStartup: event('startup'),
      onMessage: event('message'),
      getURL: vi.fn((path: string) => `chrome-extension://extension-id/${path}`),
    },
    contextMenus: { onClicked: event('contextMenu'), removeAll: vi.fn(), create: vi.fn() },
    alarms: {
      onAlarm: event('alarm'),
      create: vi.fn(),
      clear: vi.fn().mockResolvedValue(true),
    },
    tabs: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([{ id: 42, windowId: 7 }]),
    },
    windows: {
      get: mockWindowsGet,
      getLastFocused: vi.fn().mockResolvedValue({ id: 7, focused: true }),
    },
    storage: {
      onChanged: event('storageChanged'),
      local: { get: localGet, set: localSet, remove: localRemove },
      session: { get: sessionGet, set: sessionSet, remove: sessionRemove },
    },
    notifications: {
      onClicked: event('notificationClicked'),
      create: vi.fn().mockResolvedValue('notification-id'),
      clear: vi.fn().mockResolvedValue(true),
    },
    action: {
      setBadgeText: vi.fn().mockResolvedValue(undefined),
      setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
      openPopup: vi.fn().mockResolvedValue(undefined),
    },
  })
  await import('./index')
})

beforeEach(() => {
  vi.clearAllMocks()
  localValues.clear()
  sessionValues.clear()
})

describe('background job handlers', () => {
  it('returns saved records through GET_JOBS', async () => {
    vi.mocked(listJobs).mockResolvedValue([application])

    await expect(send({ type: 'GET_JOBS' })).resolves.toEqual({
      ok: true,
      data: [application],
    })
  })

  it('validates and stores a job through SAVE_JOB', async () => {
    vi.mocked(saveJob).mockImplementation(async (job) => job)

    const response = await send({ type: 'SAVE_JOB', payload: application })

    expect(response).toMatchObject({ ok: true, data: { id: application.id } })
    expect(saveJob).toHaveBeenCalledWith(expect.objectContaining({
      id: application.id,
      statusHistory: application.statusHistory,
    }))
  })

  it('deletes a job through DELETE_JOB', async () => {
    vi.mocked(deleteJob).mockResolvedValue()

    await expect(send({ type: 'DELETE_JOB', payload: { id: application.id } }))
      .resolves.toEqual({ ok: true })
    expect(deleteJob).toHaveBeenCalledWith(application.id)
  })
})

describe('global draft handlers', () => {
  it('stores captures globally from a top-level page sender', async () => {
    vi.mocked(getSettings).mockResolvedValue({ enabled: true, weekStartDay: 1 })

    await expect(sendFromTab({
      type: 'PAGE_STATE',
      payload: {
        currentPageUrl: 'https://jobs.example/roles/1',
        capture,
        strongSignal: true,
      },
    })).resolves.toMatchObject({ ok: true, accepted: true })

    expect(localSet).toHaveBeenCalledWith(expect.objectContaining({
      'apply-pilot-global-draft': expect.objectContaining({
        draft: expect.objectContaining({
          status: 'provisional',
          fields: expect.objectContaining({ title: 'Engineer' }),
        }),
      }),
    }))
  })

  it('reads the same global draft from an extension popup', async () => {
    localValues.set('apply-pilot-global-draft', {
      draft: {
        status: 'provisional',
        fields: capture.fields,
        userEdited: {},
        jobUrl: capture.jobUrl,
        currentPageUrl: capture.jobUrl,
        sourceHost: capture.sourceHost,
        createdAt: '2026-11-17T00:00:00.000Z',
        updatedAt: '2026-11-17T00:00:00.000Z',
        expiresAt: Date.now() + 60_000,
      },
    })

    await expect(sendFromPopup({ type: 'GET_GLOBAL_DRAFT' }))
      .resolves.toMatchObject({
        ok: true,
        draft: { status: 'provisional', fields: { title: 'Engineer' } },
      })
  })

  it('caches a draft per URL in session storage and returns it for popup refill', async () => {
    vi.mocked(getSettings).mockResolvedValue({ enabled: true, weekStartDay: 1 })
    const draft = {
      status: 'provisional',
      fields: capture.fields,
      userEdited: {},
      jobUrl: capture.jobUrl,
      currentPageUrl: capture.jobUrl,
      sourceHost: capture.sourceHost,
      createdAt: '2026-11-17T00:00:00.000Z',
      updatedAt: '2026-11-17T00:00:00.000Z',
      expiresAt: Date.now() + 60_000,
      flowTabIds: [42],
    }

    await expect(sendFromPopup({
      type: 'CACHE_POPUP_DRAFT',
      payload: { draft, urls: [capture.jobUrl] },
    })).resolves.toMatchObject({ ok: true, cached: true })

    await expect(sendFromPopup({
      type: 'GET_POPUP_DRAFT',
      payload: { currentPageUrl: `${capture.jobUrl}?utm_source=feed` },
    })).resolves.toMatchObject({
      ok: true,
      cachedDraft: { fields: { title: 'Engineer' } },
    })
  })

  it('does not refill or restore session drafts while capture is disabled', async () => {
    vi.mocked(getSettings).mockResolvedValue({ enabled: false, weekStartDay: 1 })
    const draft = {
      status: 'provisional',
      fields: capture.fields,
      userEdited: {},
      jobUrl: capture.jobUrl,
      currentPageUrl: capture.jobUrl,
      sourceHost: capture.sourceHost,
      createdAt: '2026-11-17T00:00:00.000Z',
      updatedAt: '2026-11-17T00:00:00.000Z',
      expiresAt: Date.now() + 60_000,
    }
    sessionValues.set(`apply-pilot-popup-draft:${capture.jobUrl}`, {
      url: capture.jobUrl,
      draft,
      cachedAt: Date.now(),
    })

    await expect(sendFromPopup({
      type: 'GET_POPUP_DRAFT',
      payload: { currentPageUrl: capture.jobUrl },
    })).resolves.toMatchObject({ ok: true, cachedDraft: undefined })

    const restored = await sendFromPopup({
      type: 'RESTORE_GLOBAL_DRAFT',
      payload: { draft },
    })
    expect(restored).toMatchObject({ ok: true })
    expect(restored).not.toHaveProperty('draft')
  })

  it('refreshes only the active draft cache instead of clearing another tab cache', async () => {
    vi.mocked(getSettings).mockResolvedValue({ enabled: true, weekStartDay: 1 })
    const now = new Date().toISOString()
    const activeDraft = {
      status: 'provisional',
      fields: capture.fields,
      userEdited: {},
      jobUrl: capture.jobUrl,
      currentPageUrl: capture.jobUrl,
      sourceHost: capture.sourceHost,
      createdAt: now,
      updatedAt: now,
      expiresAt: Date.now() + 60_000,
    }
    const otherUrl = 'https://other.example/jobs/2'
    const otherDraft = {
      ...activeDraft,
      jobUrl: otherUrl,
      currentPageUrl: otherUrl,
      sourceHost: 'other.example',
    }
    localValues.set('apply-pilot-global-draft', { draft: activeDraft })
    sessionValues.set(`apply-pilot-popup-draft:${capture.jobUrl}`, {
      url: capture.jobUrl,
      draft: activeDraft,
      cachedAt: Date.now(),
    })
    sessionValues.set(`apply-pilot-popup-draft:${otherUrl}`, {
      url: otherUrl,
      draft: otherDraft,
      cachedAt: Date.now(),
    })

    await sendFromPopup({
      type: 'REFRESH_DRAFT',
      payload: { currentPageUrl: capture.jobUrl },
    })

    expect(sessionValues.has(`apply-pilot-popup-draft:${capture.jobUrl}`)).toBe(false)
    expect(sessionValues.has(`apply-pilot-popup-draft:${otherUrl}`)).toBe(true)
  })

  it('restores a cached draft only when no persisted draft supersedes it', async () => {
    vi.mocked(getSettings).mockResolvedValue({ enabled: true, weekStartDay: 1 })
    const draft = {
      status: 'locked',
      fields: capture.fields,
      userEdited: { salary: true },
      jobUrl: capture.jobUrl,
      currentPageUrl: capture.jobUrl,
      sourceHost: capture.sourceHost,
      createdAt: '2026-11-17T00:00:00.000Z',
      updatedAt: '2026-11-17T00:00:00.000Z',
      lockedAt: '2026-11-17T00:00:00.000Z',
      expiresAt: Date.now() + 60_000,
      flowTabIds: [42],
    }

    await expect(sendFromPopup({
      type: 'RESTORE_GLOBAL_DRAFT',
      payload: { draft },
    })).resolves.toMatchObject({ ok: true, draft: { status: 'locked' } })

    await expect(sendFromPopup({
      type: 'RESTORE_GLOBAL_DRAFT',
      payload: {
        draft: { ...draft, jobUrl: 'https://other.example/job/2' },
      },
    })).resolves.toMatchObject({ ok: true, draft: { jobUrl: capture.jobUrl } })
  })

  it('merges a cached unsent field edit into the serialized persisted draft', async () => {
    vi.mocked(getSettings).mockResolvedValue({ enabled: true, weekStartDay: 1 })
    await sendFromTab({
      type: 'PAGE_STATE',
      payload: { currentPageUrl: capture.jobUrl, capture, strongSignal: true },
    })
    const stored = localValues.get('apply-pilot-global-draft') as {
      draft: Record<string, unknown> & { fields: typeof capture.fields }
    }
    const cachedDraft = {
      ...stored.draft,
      status: 'locked',
      userEdited: { salary: true },
      fields: { ...stored.draft.fields, salary: 'INR 9 Lacs P.A.' },
      lockedAt: new Date().toISOString(),
    }

    await expect(sendFromPopup({
      type: 'RESTORE_GLOBAL_DRAFT',
      payload: { draft: cachedDraft },
    })).resolves.toMatchObject({
      ok: true,
      draft: {
        status: 'locked',
        fields: { salary: 'INR 9 Lacs P.A.' },
        userEdited: { salary: true },
      },
    })
  })

  it('serializes concurrent field edits without losing the last value', async () => {
    vi.mocked(getSettings).mockResolvedValue({ enabled: true, weekStartDay: 1 })
    await sendFromTab({
      type: 'PAGE_STATE',
      payload: { currentPageUrl: capture.jobUrl, capture, strongSignal: true },
    })

    await Promise.all([
      sendFromPopup({
        type: 'EDIT_DRAFT',
        payload: {
          field: 'salary',
          value: 'INR 8 Lacs P.A.',
          currentPageUrl: capture.jobUrl,
          sourceHost: capture.sourceHost,
        },
      }),
      sendFromPopup({
        type: 'EDIT_DRAFT',
        payload: {
          field: 'salary',
          value: 'INR 9 Lacs P.A.',
          currentPageUrl: capture.jobUrl,
          sourceHost: capture.sourceHost,
        },
      }),
    ])

    expect((localValues.get('apply-pilot-global-draft') as {
      draft: { fields: typeof capture.fields }
    }).draft.fields.salary).toBe('INR 9 Lacs P.A.')
  })

  it('returns a validation error for malformed known draft messages', async () => {
    await expect(sendFromPopup({
      type: 'GET_POPUP_DRAFT',
      payload: { currentPageUrl: 'not a URL' },
    })).resolves.toEqual({ ok: false, message: 'Invalid draft message.' })
  })

  it('registers the startup listener at worker scope and restores draft expiry', async () => {
    const startup = listeners.get('startup') as () => void
    expect(startup).toBeTypeOf('function')
    startup()
    await vi.waitFor(() => {
      expect(chrome.alarms.clear).toHaveBeenCalledWith('apply-pilot-global-draft-expiry')
    })
  })

  it('clears the global draft and submission badge when capture is turned off', async () => {
    localValues.set('apply-pilot-global-draft', { draft: {} })
    sessionValues.set('apply-pilot-popup-draft:https://jobs.example/roles/1', {})
    const changed = listeners.get('storageChanged') as (
      changes: Record<string, { newValue?: unknown }>,
      areaName: string,
    ) => void
    changed({ settings: { newValue: { enabled: false } } }, 'local')

    await vi.waitFor(() => {
      expect(localValues.has('apply-pilot-global-draft')).toBe(false)
    })
    expect(sessionValues.size).toBe(0)
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' })
    expect(chrome.notifications.clear).toHaveBeenCalledWith('apply-pilot-application-submitted')
  })

  it('locks, submits once, and triggers popup/fallback actions', async () => {
    vi.mocked(getSettings).mockResolvedValue({ enabled: true, weekStartDay: 1 })
    await sendFromTab({
      type: 'PAGE_STATE',
      payload: { currentPageUrl: capture.jobUrl, capture, strongSignal: true },
    })
    await sendFromTab({
      type: 'LOCK_DRAFT',
      payload: { currentPageUrl: 'https://jobs.example/apply', capture },
    })

    await expect(sendFromTab({
      type: 'APPLICATION_SUBMITTED',
      payload: {
        currentPageUrl: 'https://jobs.example/confirmation',
        text: 'Application submitted',
      },
    })).resolves.toMatchObject({ ok: true, newlySubmitted: true })

    const stored = localValues.get('apply-pilot-global-draft') as {
      draft: { status: string }
    }
    expect(stored.draft.status).toBe('submitted')
    expect(chrome.action.openPopup).toHaveBeenCalledWith({ windowId: 7 })
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
      type: 'SHOW_SUBMISSION_TOAST',
    })

    const duplicate = await sendFromTab({
      type: 'APPLICATION_SUBMITTED',
      payload: {
        currentPageUrl: 'https://jobs.example/confirmation',
        text: 'Application submitted',
      },
    })
    expect(duplicate).toMatchObject({ ok: true, newlySubmitted: false })
    expect(chrome.action.openPopup).toHaveBeenCalledTimes(1)
  })

  it('shows a badge and notification when the submission popup cannot open', async () => {
    vi.mocked(getSettings).mockResolvedValue({ enabled: true, weekStartDay: 1 })
    mockWindowsGet.mockResolvedValue({ focused: false })
    vi.mocked(chrome.action.openPopup).mockRejectedValue(new Error('Popup unavailable'))
    await sendFromTab({
      type: 'PAGE_STATE',
      payload: { currentPageUrl: capture.jobUrl, capture, strongSignal: true },
    })
    await sendFromTab({
      type: 'LOCK_DRAFT',
      payload: { currentPageUrl: 'https://jobs.example/apply', capture },
    })

    await expect(sendFromTab({
      type: 'APPLICATION_SUBMITTED',
      payload: { currentPageUrl: 'https://jobs.example/success', text: 'Done' },
    })).resolves.toMatchObject({ ok: true, newlySubmitted: true })

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✓' })
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      'apply-pilot-application-submitted',
      expect.objectContaining({
        title: 'Apply Pilot',
        message: 'Application submitted? Click to review and save',
      }),
    )
  })
})
