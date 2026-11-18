import { afterEach, describe, expect, it, vi } from 'vitest'
import { getActivePage, getPopupJobUrl } from './active-page'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('active page capture', () => {
  it('retries empty job-page replies until a capture arrives', async () => {
    const capture = {
      fields: {
        title: 'Engineer',
        company: '',
        location: '',
        workMode: '',
        salary: '',
        employmentType: '',
      },
      jobUrl: 'https://jobs.example/jobs/42',
      sourceHost: 'jobs.example',
    }
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ ok: true, isJobPage: false })
      .mockResolvedValueOnce({
        ok: true,
        isJobPage: true,
        currentPageUrl: capture.jobUrl,
        capture,
      })
    vi.stubGlobal('chrome', { tabs: { sendMessage } })
    vi.stubGlobal('window', {
      setTimeout: (callback: () => void) => {
        callback()
        return 1
      },
    })

    await expect(getActivePage(5, capture.jobUrl)).resolves.toMatchObject({ capture })
    expect(sendMessage).toHaveBeenCalledTimes(2)
  })

  it('stops polling when capture is disabled', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, disabled: true })
    vi.stubGlobal('chrome', { tabs: { sendMessage } })

    await getActivePage(5, 'https://jobs.example/jobs/42')

    expect(sendMessage).toHaveBeenCalledTimes(1)
  })
})

describe('popup job URL prefill', () => {
  it('canonicalizes the active URL without creating a draft', () => {
    expect(getPopupJobUrl(
      undefined,
      'https://jobs.example/jobs?trackingId=mail&currentJobId=42#details',
    )).toBe('https://jobs.example/jobs?currentJobId=42')
  })

  it('preserves locked and user-entered posting URLs', () => {
    expect(getPopupJobUrl({
      jobUrl: 'https://jobs.example/jobs/42',
      userEdited: {},
    }, 'https://company.example/confirmation')).toBe('https://jobs.example/jobs/42')
    expect(getPopupJobUrl({
      jobUrl: '',
      userEdited: { jobUrl: true },
    }, 'https://jobs.example/jobs/42')).toBe('')
  })
})
