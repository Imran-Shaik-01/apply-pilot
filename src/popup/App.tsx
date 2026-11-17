import { useEffect, useState } from 'react'
import {
  clearPopupDraft,
  getSettings,
  listJobs,
  saveJob,
  updateSettings,
} from '../shared/storage'
import { defaultSettings, type JobApplication, type Settings } from '../shared/types'
import { isoNow } from '../shared/utils'

type Draft = {
  title: string
  company: string
  location: string
  workMode: string
  salary: string
  employmentType: string
}

const emptyDraft: Draft = {
  title: '',
  company: '',
  location: '',
  workMode: '',
  salary: '',
  employmentType: '',
}

const getPageHostname = (pageUrl: string) => {
  try {
    const url = new URL(pageUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.hostname : ''
  } catch {
    return ''
  }
}

const getActivePage = async (): Promise<{ url: string; capture?: Partial<JobApplication> }> => {
  if (typeof chrome === 'undefined' || !chrome.tabs) return { url: '' }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return { url: tab?.url ?? '' }

  let injectionAttempted = false
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CAPTURE' })
      if (response?.ok && response.data) {
        return { url: tab.url ?? '', capture: response.data as Partial<JobApplication> }
      }
      if (response?.disabled || response?.refreshed) {
        return { url: tab.url ?? '' }
      }
      if (response?.isJobPage === false && attempt >= 2) {
        return { url: tab.url ?? '' }
      }
    } catch {
      if (!injectionAttempted && chrome.scripting) {
        injectionAttempted = true
        let injectionSucceeded = false
        const contentScripts = chrome.runtime.getManifest().content_scripts ?? []
        const scriptPaths = contentScripts.flatMap((script) => script.js ?? [])
        const injectionPaths = scriptPaths.some((file) => file.endsWith('content.js'))
          ? scriptPaths.filter((file) => file.endsWith('content.js'))
          : ['dist/content.js', 'content.js']
        for (const file of injectionPaths) {
          try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [file] })
            injectionSucceeded = true
            break
          } catch {
            // Try the alternate path for extensions loaded from the repository root or dist folder.
          }
        }
        if (!injectionSucceeded) return { url: tab.url ?? '' }
      } else {
        return { url: tab.url ?? '' }
      }
    }

    if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 250))
  }
  return { url: tab.url ?? '' }
}

export function PopupApp() {
  const [todayCount, setTodayCount] = useState(0)
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [pageUrl, setPageUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [draftReady, setDraftReady] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [jobs, nextSettings, activePage] = await Promise.all([
          listJobs(),
          getSettings(),
          getActivePage(),
        ])
        const today = new Date().toDateString()
        setTodayCount(jobs.filter((job) => new Date(job.appliedAt).toDateString() === today).length)
        setSettings(nextSettings)
        setPageUrl(activePage.url)
        const capture = activePage.capture
        if (capture?.title && capture.company?.trim()) {
          setDraft({
            title: capture.title,
            company: capture.company,
            location: capture.location ?? '',
            workMode: capture.workMode ?? '',
            salary: capture.salary ?? '',
            employmentType: capture.employmentType ?? '',
          })
        }
        setDraftReady(true)
      } catch {
        setError('Could not load your extension data.')
      }
    }

    void load()
  }, [])

  useEffect(() => {
    if (!message) return
    const timeoutId = window.setTimeout(() => setMessage(''), 3500)
    return () => window.clearTimeout(timeoutId)
  }, [message])

  const updateDraft = (nextDraft: Draft) => {
    setDraft(nextDraft)
    setError('')
  }

  const handleQuickAdd = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const title = draft.title.trim()
    const company = draft.company.trim()
    let url: URL
    try {
      url = new URL(pageUrl)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported URL')
    } catch {
      setError('Open the job posting in this tab before saving.')
      return
    }

    if (!title || !company) {
      setError('Add the role and company to save this application.')
      return
    }

    const now = isoNow()
    const job: JobApplication = {
      id: `manual-${crypto.randomUUID()}`,
      title,
      company,
      url: url.toString(),
      applicationUrl: url.toString(),
      status: 'Applied',
      source: url.hostname,
      platform: url.hostname,
      location: draft.location.trim() || undefined,
      workMode: draft.workMode.trim() || undefined,
      salary: draft.salary.trim() || undefined,
      employmentType: draft.employmentType.trim() || undefined,
      appliedAt: now,
      createdAt: now,
      updatedAt: now,
    }

    setSaving(true)
    try {
      await saveJob(job)
      setTodayCount((count) => count + 1)
      setDraft(emptyDraft)
      setMessage('Application saved.')
      try {
        await clearPopupDraft(url.toString())
      } catch {
        setError('Application saved, but the saved draft could not be cleared.')
      }
    } catch {
      setError('Could not save this application. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async () => {
    setError('')
    try {
      const nextSettings = await updateSettings({ enabled: !settings.enabled })
      setSettings(nextSettings)
    } catch {
      setError('Could not update the capture setting.')
    }
  }

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div className="brand">
          <img className="brand-icon" src="./icons/app-icon.svg" alt="" />
          <h1>Apply Pilot</h1>
        </div>
        <div className="capture-toggle">
          <span className="capture-label">Capture</span>
          <button
            type="button"
            className={`switch ${settings.enabled ? 'on' : ''}`}
            role="switch"
            aria-label="Automatic capture"
            aria-checked={settings.enabled}
            onClick={handleToggle}
          >
            <span className="switch-thumb" />
          </button>
        </div>
      </header>

      <div className="today-count" aria-live="polite">
        <span className="count-number">{draftReady ? todayCount : '…'}</span>
        <span>{draftReady ? 'applied today' : 'Loading applications'}</span>
      </div>

      <form className="quick-add" onSubmit={handleQuickAdd}>
        <label>
          Role
          <input
            autoComplete="off"
            placeholder="e.g. Product Designer"
            value={draft.title}
            disabled={!draftReady}
            onChange={(event) => updateDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label>
          Company
          <input
            autoComplete="organization"
            placeholder="e.g. Northstar Labs"
            value={draft.company}
            disabled={!draftReady}
            onChange={(event) => updateDraft({ ...draft, company: event.target.value })}
          />
        </label>
        <details
          className="extra-fields"
          open={Boolean(draft.location || draft.workMode || draft.salary || draft.employmentType)}
        >
          <summary>Location, salary &amp; more</summary>
          <div className="extra-grid">
            <label>
              Location
              <input
                autoComplete="off"
                placeholder="City or region"
                value={draft.location}
                disabled={!draftReady}
                onChange={(event) => updateDraft({ ...draft, location: event.target.value })}
              />
            </label>
            <label>
              Work mode
              <input
                autoComplete="off"
                placeholder="Remote, hybrid…"
                value={draft.workMode}
                disabled={!draftReady}
                onChange={(event) => updateDraft({ ...draft, workMode: event.target.value })}
              />
            </label>
            <label>
              Salary
              <input
                autoComplete="off"
                placeholder="Optional"
                value={draft.salary}
                disabled={!draftReady}
                onChange={(event) => updateDraft({ ...draft, salary: event.target.value })}
              />
            </label>
            <label>
              Employment type
              <input
                autoComplete="off"
                placeholder="Full-time, contract…"
                value={draft.employmentType}
                disabled={!draftReady}
                onChange={(event) => updateDraft({ ...draft, employmentType: event.target.value })}
              />
            </label>
          </div>
        </details>
        <button type="submit" className="primary" disabled={saving || !draftReady}>
          {saving ? 'Saving…' : 'Save application'}
        </button>
      </form>

      {error && <p className="feedback error" role="alert">{error}</p>}
      {message && <p className="feedback success" role="status">{message}</p>}

      <footer className="popup-footer">
        <span className="page-context" title={pageUrl}>
          {getPageHostname(pageUrl) || 'Open a job page to save its link'}
        </span>
        <a href="./dashboard.html" target="_blank" rel="noreferrer">Dashboard <span aria-hidden="true">→</span></a>
      </footer>
    </main>
  )
}
