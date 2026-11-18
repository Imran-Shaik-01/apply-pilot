import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { attemptCapture } from '../../src/content/extract'

const directory = fileURLToPath(new URL('.', import.meta.url))
const fixtureNames = readdirSync(directory).filter((name) => /-job\.html$/i.test(name))
const expectedFields = [
  'title',
  'company',
  'jobUrl',
  'location',
  'workMode',
  'salary',
  'employmentType',
] as const

const fixtures = fixtureNames.map((file) => {
  const html = readFileSync(new URL(file, import.meta.url), 'utf8')
  const stem = file.replace(/\.html$/i, '')
  const urlPath = new URL(`${stem}.url`, import.meta.url)
  const headerUrl = html.match(/<!--\s*(?:page[- ]?)?url\s*[:=]\s*(https?:\/\/[^ \r\n]+)\s*-->/i)?.[1]
  const url = headerUrl || (existsSync(urlPath) ? readFileSync(urlPath, 'utf8').trim() : '')
  const expected = JSON.parse(readFileSync(new URL(`${stem}.expected.json`, import.meta.url), 'utf8'))
  return { file, html, url, expected }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('saved portal fixture matrix', () => {
  if (!fixtures.length) {
    it.skip('runs when saved job-page fixtures are added', () => {})
    return
  }

  it.each(fixtures)('$file matches its expected extraction', ({ html, url, expected }) => {
    expect(url).toMatch(/^https?:\/\//)
    expect(expected).toEqual(expect.objectContaining(
      Object.fromEntries(expectedFields.map((field) => [field, expect.any(String)])),
    ))
    const dom = new JSDOM(html, { url })
    vi.stubGlobal('window', dom.window)
    vi.stubGlobal('document', dom.window.document)

    const result = attemptCapture()
    expect(result.isJobPage).toBe(true)
    expect({
      title: result.data.title ?? '',
      company: result.data.company ?? '',
      jobUrl: result.data.url ?? '',
      location: result.data.location ?? '',
      workMode: result.data.workMode ?? '',
      salary: result.data.salary ?? '',
      employmentType: result.data.employmentType ?? '',
    }).toEqual(expected)
  })
})
