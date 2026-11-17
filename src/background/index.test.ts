import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteJob, listJobs, saveJob } from '../shared/storage'
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

type Message = { type: string; payload?: unknown }
type MessageHandler = (
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => unknown

const send = (message: Message) => new Promise<unknown>((resolve) => {
  const handler = listeners.get('message') as MessageHandler
  handler(message, {} as chrome.runtime.MessageSender, resolve)
})

beforeAll(async () => {
  vi.stubGlobal('chrome', {
    runtime: {
      onInstalled: event('installed'),
      onStartup: event('startup'),
      onMessage: event('message'),
      getURL: vi.fn(),
    },
    contextMenus: { onClicked: event('contextMenu') },
    alarms: { onAlarm: event('alarm') },
  })
  await import('./index')
})

beforeEach(() => {
  vi.clearAllMocks()
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

    expect(response).toMatchObject({
      ok: true,
      data: {
        id: application.id,
        statusHistory: application.statusHistory,
      },
    })
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
