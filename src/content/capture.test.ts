import { afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { createDraftCapture } from './capture'
import { attemptCapture } from './extract'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('partial page captures', () => {
  it('creates a capture when only the title is available', () => {
    const dom = new JSDOM('<main><h1>Software Engineer</h1></main>', {
      url: 'https://jobs.example/jobs/42',
    })
    vi.stubGlobal('window', dom.window)
    vi.stubGlobal('document', dom.window.document)

    expect(createDraftCapture(attemptCapture())).toMatchObject({
      fields: { title: 'Software Engineer', company: '' },
      jobUrl: 'https://jobs.example/jobs/42',
      sourceHost: 'jobs.example',
    })
  })

  it('creates no capture when the page path has no title or company', () => {
    const dom = new JSDOM('<main><p>Job results</p></main>', {
      url: 'https://jobs.example/jobs/42',
    })
    vi.stubGlobal('window', dom.window)
    vi.stubGlobal('document', dom.window.document)

    expect(createDraftCapture(attemptCapture())).toBeUndefined()
  })
})
