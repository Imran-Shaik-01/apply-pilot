import { afterEach, describe, expect, it, vi } from 'vitest'
import { attemptCapture } from './extract'

const setPage = (structuredData: string[], href = 'https://jobs.example/roles/1?utm_source=newsletter') => {
  const scripts = structuredData.map((textContent) => ({ textContent }))
  vi.stubGlobal('window', { location: new URL(href) })
  vi.stubGlobal('document', {
    body: { innerText: '' },
    querySelector: () => null,
    querySelectorAll: (selector: string) =>
      selector === 'script[type="application/ld+json"]' ? scripts : [],
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('attemptCapture', () => {
  it('extracts structured job details and canonicalizes its URL', () => {
    setPage([
      JSON.stringify({
        '@graph': [{
          '@type': 'JobPosting',
          title: 'Senior Engineer',
          hiringOrganization: { name: 'Northstar Labs' },
          identifier: { value: 'REQ-123' },
          jobLocation: { address: { addressLocality: 'Toronto' } },
          employmentType: 'FULL_TIME',
          jobLocationType: 'TELECOMMUTE',
        }],
      }),
    ])

    const result = attemptCapture()

    expect(result.isJobPage).toBe(true)
    expect(result.data).toMatchObject({
      id: 'jobs.example-REQ-123',
      jobId: 'REQ-123',
      title: 'Senior Engineer',
      company: 'Northstar Labs',
      url: 'https://jobs.example/roles/1',
      location: 'Toronto',
      employmentType: 'Full-time',
      workMode: 'Remote',
    })
  })

  it('skips malformed structured data and does not classify an ordinary page as a job', () => {
    setPage(['{ malformed'])

    expect(attemptCapture().isJobPage).toBe(false)
  })
})
