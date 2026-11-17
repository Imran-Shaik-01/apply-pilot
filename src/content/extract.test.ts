import { afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { attemptCapture } from './extract'
import { getConfirmationTitle, isSubmissionMessage } from './normalizers'

const setPage = (structuredData: string[], href = 'https://jobs.example/roles/1?utm_source=newsletter') => {
  const scripts = structuredData.map((text) => `<script type="application/ld+json">${text}</script>`).join('')
  const dom = new JSDOM(`<html><head>${scripts}</head><body></body></html>`, { url: href })
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('document', dom.window.document)
}

const setHtmlPage = (html: string, href = 'https://jobs.example/roles/1') => {
  const dom = new JSDOM(html, { url: href })
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('document', dom.window.document)
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

  it('uses a same-origin structured posting URL only for the same path', () => {
    setPage([
      JSON.stringify({
        '@type': 'JobPosting',
        title: 'Senior Engineer',
        url: 'https://jobs.example/roles/1?currentJobId=REQ-42&utm_source=feed#overview',
        hiringOrganization: { name: 'Northstar' },
      }),
    ], 'https://jobs.example/roles/1?currentJobId=REQ-42&trk=mail#details')
    expect(attemptCapture().data.url)
      .toBe('https://jobs.example/roles/1?currentJobId=REQ-42')

    setPage([
      JSON.stringify({
        '@type': 'JobPosting',
        title: 'Senior Engineer',
        url: 'https://external.example/roles/1',
        hiringOrganization: { name: 'Northstar' },
      }),
    ], 'https://jobs.example/roles/1?utm_source=feed')
    expect(attemptCapture().data.url).toBe('https://jobs.example/roles/1')
  })

  it('skips malformed structured data and does not classify an ordinary page as a job', () => {
    setPage(['{ malformed'])

    expect(attemptCapture().isJobPage).toBe(false)
  })

  it('scopes work-mode heuristics to the job container, excluding sidebar listings', () => {
    setHtmlPage(`
      <main>
        <article class="job-detail">
          <h1 data-testid="job-title">Systems Engineer</h1>
          <div data-testid="company-name">Northstar</div>
          <div class="job-location">Toronto</div>
          <div data-testid="structured-job-summary"><div>Hybrid</div></div>
          <aside>
            <div data-testid="structured-job-summary"><div>Remote</div></div>
          </aside>
        </article>
      </main>
    `)

    expect(attemptCapture()).toMatchObject({
      isJobPage: true,
      data: { workMode: 'Hybrid' },
    })
  })

  it('keeps the complete location while deriving work mode from that scoped value', () => {
    setHtmlPage(`
      <main>
        <article class="job-detail">
          <h1 data-testid="job-title">Systems Engineer</h1>
          <div data-testid="company-name">Northstar</div>
          <div class="job-location">Hybrid - Bengaluru, Karnataka, India</div>
        </article>
        <aside><div class="job-location">Remote - Other City</div></aside>
      </main>
    `)
    expect(attemptCapture().data).toMatchObject({
      location: 'Hybrid - Bengaluru, Karnataka, India',
      workMode: 'Hybrid',
    })
  })

  it('detects a confirmation page without treating recommendations as a job posting', () => {
    setHtmlPage(`
      <main>
        <h1>Apply Confirmation</h1>
        <p>You have successfully applied to 'Digital Specialist Engineer (Trainee)'</p>
        <aside><h2 data-testid="job-title">Recommended Software Developer</h2></aside>
      </main>
    `, 'https://jobs.example/myapply/saveApply')

    expect(attemptCapture().isJobPage).toBe(false)
    const text = "You have successfully applied to 'Digital Specialist Engineer (Trainee)'"
    expect(isSubmissionMessage(text)).toBe(true)
    expect(getConfirmationTitle(text)).toBe('Digital Specialist Engineer (Trainee)')
  })
})
