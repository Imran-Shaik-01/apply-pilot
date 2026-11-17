import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cachePopupDraft,
  clearPopupDraftCache,
  editGlobalDraft,
  getGlobalDraft,
  getPopupDraft,
  getSettings,
  listJobs,
  restoreGlobalDraft,
  refreshGlobalDraft,
  saveGlobalDraft,
  saveJob,
  updateSettings,
} from '../shared/storage'
import {
  defaultSettings,
  type DraftCapture,
  type DraftField,
  type GlobalDraft,
  type GlobalDraftState,
  type JobApplication,
  type Settings,
} from '../shared/types'
import { canonicalizeJobUrl, getStableJobId, isoNow } from '../shared/utils'
import { draftCaptureSchema } from '../shared/schema'
import { editDraft } from '../shared/draft-state'
import { mergeVerifiedDraft } from './draft-merge'

const isHttpUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

const getActivePage = async (
  tabId: number | undefined,
  tabUrl: string,
): Promise<{ url: string; capture?: DraftCapture }> => {
  if (
    typeof chrome === 'undefined' ||
    !chrome.tabs ||
    tabId === undefined ||
    !isHttpUrl(tabUrl)
  ) return { url: tabUrl }

  let injectionAttempted = false
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CAPTURE' })
      if (response?.ok) {
        return {
          url: response.currentPageUrl ?? tabUrl,
          capture: response.capture ? draftCaptureSchema.parse(response.capture) : undefined,
        }
      }
      if (response?.disabled || response?.isJobPage === false) return { url: tabUrl }
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
            await chrome.scripting.executeScript({ target: { tabId }, files: [file] })
            injectionSucceeded = true
            break
          } catch {
            continue
          }
        }
        if (!injectionSucceeded) return { url: tabUrl }
      } else {
        return { url: tabUrl }
      }
    }

    if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 250))
  }
  return { url: tabUrl }
}

const sourceHost = (value: string) => {
  try {
    return new URL(value).hostname
  } catch {
    return ''
  }
}

const draftState = (draft: GlobalDraft | undefined): GlobalDraftState =>
  draft ? { draft } : {}

export function PopupApp() {
  const [todayCount, setTodayCount] = useState(0)
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [draft, setDraft] = useState<GlobalDraft>()
  const [tabId, setTabId] = useState<number>()
  const [pageUrl, setPageUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshArmed, setRefreshArmed] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [draftReady, setDraftReady] = useState(false)
  const pendingEdits = useRef(new Map<DraftField, string>())
  const draftRef = useRef<GlobalDraft | undefined>(undefined)
  const editFlush = useRef<Promise<boolean> | undefined>(undefined)
  const editTimer = useRef<number | undefined>(undefined)
  const cacheTimer = useRef<number | undefined>(undefined)
  const refreshTimer = useRef<number | undefined>(undefined)
  const commitDraft = (next: GlobalDraft | undefined) => {
    draftRef.current = next
    setDraft(next)
  }
  const cacheDraft = (next: GlobalDraft, aliases: string[] = []) => {
    if (cacheTimer.current !== undefined) {
      window.clearTimeout(cacheTimer.current)
      cacheTimer.current = undefined
    }
    const urls = [...new Set([next.currentPageUrl, next.jobUrl, ...aliases].filter(isHttpUrl))]
    if (!urls.length) return
    void cachePopupDraft(next, urls).catch((cacheError: unknown) => {
      console.error('Apply Pilot could not cache the popup draft for this session.', cacheError)
    })
  }
  const scheduleDraftCache = (next: GlobalDraft, aliases: string[] = []) => {
    if (cacheTimer.current !== undefined) window.clearTimeout(cacheTimer.current)
    cacheTimer.current = window.setTimeout(() => cacheDraft(next, aliases), 120)
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const tabs = typeof chrome !== 'undefined' && chrome.tabs
          ? await chrome.tabs.query({ active: true, currentWindow: true })
          : []
        const tab = tabs[0]
        const activeTabId = tab?.id
        const activeTabUrl = tab?.url ?? ''
        if (!active) return
        setTabId(activeTabId)
        setPageUrl(activeTabUrl)

        const storedState = isHttpUrl(activeTabUrl)
          ? await getPopupDraft(activeTabUrl)
          : { ...await getGlobalDraft(), cachedDraft: undefined }
        const cacheIsSuppressed = Boolean(
          storedState.cachedDraft &&
          canonicalizeJobUrl(storedState.cachedDraft.jobUrl) === storedState.suppressedJobUrl,
        )
        let visibleDraft = storedState.draft
        if (visibleDraft && storedState.cachedDraft) {
          visibleDraft = mergeVerifiedDraft(
            storedState.cachedDraft,
            visibleDraft,
            pendingEdits.current,
          )
        }
        if (visibleDraft) {
          commitDraft(visibleDraft)
          setPageUrl(visibleDraft.currentPageUrl || activeTabUrl)
          cacheDraft(visibleDraft, [activeTabUrl])
          setDraftReady(true)
          if (storedState.cachedDraft) {
            try {
              const restored = await restoreGlobalDraft(visibleDraft)
              if (!active) return
              if (restored.draft) {
                visibleDraft = mergeVerifiedDraft(
                  draftRef.current,
                  restored.draft,
                  pendingEdits.current,
                )
                commitDraft(visibleDraft)
              }
            } catch (restoreError) {
              console.error('Apply Pilot could not reconcile the popup session cache.', restoreError)
            }
          }
        } else if (storedState.cachedDraft && !cacheIsSuppressed) {
          visibleDraft = storedState.cachedDraft
          commitDraft(visibleDraft)
          setDraftReady(true)
          try {
            const restored = await restoreGlobalDraft(visibleDraft)
            if (!active) return
            if (restored.draft) {
              visibleDraft = mergeVerifiedDraft(
                draftRef.current,
                restored.draft,
                pendingEdits.current,
              )
              commitDraft(visibleDraft)
            }
          } catch (restoreError) {
            console.error('Apply Pilot could not restore the cached popup draft.', restoreError)
          }
        }
        if (cacheIsSuppressed) {
          void clearPopupDraftCache([storedState.cachedDraft?.currentPageUrl ?? activeTabUrl])
            .catch((cacheError: unknown) => {
              console.error('Apply Pilot could not clear a saved popup draft cache.', cacheError)
            })
        }
        setDraftReady(true)

        void (async () => {
          const activePage = await getActivePage(activeTabId, activeTabUrl)
          if (!active) return
          setPageUrl(activePage.url)

          const verifiedState = isHttpUrl(activePage.url)
            ? await getPopupDraft(activePage.url)
            : { ...await getGlobalDraft(), cachedDraft: undefined }
          if (!active) return
          if (verifiedState.draft) {
            const verifiedDraft = mergeVerifiedDraft(
              draftRef.current,
              verifiedState.draft,
              pendingEdits.current,
            )
            commitDraft(verifiedDraft)
            cacheDraft(verifiedDraft, [activePage.url])
            setPageUrl(verifiedDraft.currentPageUrl || activePage.url)
          } else if (
            verifiedState.suppressedJobUrl &&
            canonicalizeJobUrl(activePage.url) === verifiedState.suppressedJobUrl
          ) {
            commitDraft(undefined)
            void clearPopupDraftCache([activePage.url]).catch((cacheError: unknown) => {
              console.error('Apply Pilot could not clear a saved popup draft cache.', cacheError)
            })
          } else if (activePage.capture && !verifiedState.draft && !visibleDraft) {
            const captured = {
              ...activePage.capture,
              status: 'provisional' as const,
              userEdited: {},
              currentPageUrl: activePage.url,
              createdAt: isoNow(),
              updatedAt: isoNow(),
              expiresAt: Date.now() + 24 * 60 * 60 * 1000,
            }
            cacheDraft(captured, [activePage.url])
            commitDraft(captured)
          }
        })().catch((verifyError: unknown) => {
          console.error('Apply Pilot could not verify the popup draft against the active page.', verifyError)
        })

        try {
          const [jobs, nextSettings] = await Promise.all([listJobs(), getSettings()])
          if (!active) return
          const today = new Date().toDateString()
          setTodayCount(jobs.filter((job) => new Date(job.appliedAt).toDateString() === today).length)
          setSettings(nextSettings)
        } catch {
          if (active) setError('Could not load your extension data.')
        }
      } catch {
        if (active) setError('Could not load your extension data.')
      }
    }

    void load()
    return () => {
      active = false
      if (editTimer.current !== undefined) window.clearTimeout(editTimer.current)
      if (cacheTimer.current !== undefined) window.clearTimeout(cacheTimer.current)
      if (refreshTimer.current !== undefined) window.clearTimeout(refreshTimer.current)
    }
  }, [])

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return
      const settings = changes.settings?.newValue as Settings | undefined
      if (settings) setSettings(settings)
      if (settings?.enabled === false) {
        pendingEdits.current.clear()
        commitDraft(undefined)
        return
      }
      if (!('apply-pilot-global-draft' in changes)) return
      void getGlobalDraft().then((state) => {
        const remote = state.draft
        if (!remote) {
          if (pendingEdits.current.size === 0) commitDraft(undefined)
          return
        }
        const merged = mergeVerifiedDraft(draftRef.current, remote, pendingEdits.current)
        commitDraft(merged)
        cacheDraft(merged, [pageUrl])
      }).catch((storageError: unknown) => {
        console.error('Apply Pilot could not synchronize the popup draft.', storageError)
        setError('Could not synchronize your saved draft.')
      })
    }
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [pageUrl])

  useEffect(() => {
    if (!message) return
    const timeoutId = window.setTimeout(() => setMessage(''), 3500)
    return () => window.clearTimeout(timeoutId)
  }, [message])

  const flushPendingEdits = useCallback(async () => {
    if (editFlush.current) return editFlush.current
    const flush = async () => {
      if (editTimer.current !== undefined) {
        window.clearTimeout(editTimer.current)
        editTimer.current = undefined
      }
      if (typeof chrome === 'undefined') return true
      while (pendingEdits.current.size > 0) {
        const edits = [...pendingEdits.current.entries()]
        try {
          for (const [field, value] of edits) {
            await editGlobalDraft(
              field,
              value,
              draftRef.current?.currentPageUrl || pageUrl,
              sourceHost(draftRef.current?.currentPageUrl || pageUrl),
            )
            if (pendingEdits.current.get(field) === value) pendingEdits.current.delete(field)
          }
        } catch {
          setError('Could not keep your draft edit. Please try again.')
          return false
        }
      }
      return true
    }
    const task = flush()
    editFlush.current = task
    void task.then(() => {
      if (editFlush.current === task) editFlush.current = undefined
    })
    return task
  }, [pageUrl])

  useEffect(() => {
    const persistBeforeClose = () => {
      void flushPendingEdits()
      if (draftRef.current) cacheDraft(draftRef.current, [pageUrl])
    }
    window.addEventListener('pagehide', persistBeforeClose)
    return () => window.removeEventListener('pagehide', persistBeforeClose)
  }, [flushPendingEdits, pageUrl])

  const updateDraftField = (field: DraftField, value: string) => {
    const currentPageUrl = draft?.currentPageUrl || pageUrl
    const updatedState = editDraft(
      draftState(draft),
      field,
      value,
      currentPageUrl,
      sourceHost(currentPageUrl),
    )
    commitDraft(updatedState.draft)
    setError('')
    pendingEdits.current.set(field, value)
    if (updatedState.draft) scheduleDraftCache(updatedState.draft, [pageUrl])
    if (editTimer.current !== undefined) window.clearTimeout(editTimer.current)
    editTimer.current = window.setTimeout(() => void flushPendingEdits(), 300)
  }

  const handleFieldBlur = () => {
    void flushPendingEdits()
    if (draftRef.current) cacheDraft(draftRef.current, [pageUrl])
  }

  const handleRefresh = async () => {
    const requiresConfirmation = Boolean(
      draft && (
        draft.status !== 'provisional' ||
        Object.keys(draft.userEdited).length > 0
      ),
    )
    if (requiresConfirmation && !refreshArmed) {
      setRefreshArmed(true)
      if (refreshTimer.current !== undefined) window.clearTimeout(refreshTimer.current)
      refreshTimer.current = window.setTimeout(() => setRefreshArmed(false), 4000)
      return
    }

    if (cacheTimer.current !== undefined) {
      window.clearTimeout(cacheTimer.current)
      cacheTimer.current = undefined
    }
    if (refreshTimer.current !== undefined) {
      window.clearTimeout(refreshTimer.current)
      refreshTimer.current = undefined
    }
    if (editTimer.current !== undefined) window.clearTimeout(editTimer.current)
    pendingEdits.current.clear()
    setRefreshing(true)
    setRefreshArmed(false)
    setError('')
    setMessage('')
    try {
      const activePage = await getActivePage(tabId, pageUrl)
      const nextState = await refreshGlobalDraft(activePage.url, activePage.capture)
      commitDraft(nextState.draft)
      if (nextState.draft) cacheDraft(nextState.draft, [activePage.url])
      setPageUrl(activePage.url)
    } catch {
      setError('Could not refresh the draft.')
    } finally {
      setRefreshing(false)
    }
  }

  const handleQuickAdd = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const title = draft?.fields.title.trim() ?? ''
    const company = draft?.fields.company.trim() ?? ''
    let url: URL
    try {
      const canonicalUrl = canonicalizeJobUrl(draft?.jobUrl ?? '')
      if (!canonicalUrl) throw new Error('Unsupported URL')
      url = new URL(canonicalUrl)
    } catch {
      setError('Enter a valid job posting link before saving.')
      return
    }

    if (!title || !company) {
      setError('Add the role and company to save this application.')
      return
    }

    const now = isoNow()
    let applicationUrl: string
    try {
      const parsedApplicationUrl = new URL(draft?.currentPageUrl || pageUrl)
      if (!['http:', 'https:'].includes(parsedApplicationUrl.protocol)) throw new Error('Unsupported URL')
      applicationUrl = parsedApplicationUrl.toString()
    } catch {
      setError('The current page does not have a valid application link.')
      return
    }
    const job: JobApplication = {
      id: draft?.id || getStableJobId(url.toString(), draft?.jobId),
      jobId: draft?.jobId,
      title,
      company,
      url: url.toString(),
      applicationUrl,
      status: 'Applied',
      statusHistory: [{ status: 'Applied', changedAt: now }],
      source: url.hostname,
      platform: url.hostname,
      location: draft?.fields.location.trim() || undefined,
      workMode: draft?.fields.workMode.trim() || undefined,
      salary: draft?.fields.salary.trim() || undefined,
      employmentType: draft?.fields.employmentType.trim() || undefined,
      appliedAt: now,
      createdAt: now,
      updatedAt: now,
    }

    setSaving(true)
    try {
      if (cacheTimer.current !== undefined) {
        window.clearTimeout(cacheTimer.current)
        cacheTimer.current = undefined
      }
      if (!await flushPendingEdits()) return
      const existingJobs = await listJobs()
      if (existingJobs.some((existing) =>
        existing.id === job.id || canonicalizeJobUrl(existing.url) === job.url,
      )) {
        await saveGlobalDraft(job.url)
        commitDraft(undefined)
        setMessage('This application is already saved.')
        return
      }
      await saveJob(job)
      await saveGlobalDraft(job.url)
      void clearPopupDraftCache([draft?.jobUrl ?? '', draft?.currentPageUrl ?? '', job.url])
        .catch((cacheError: unknown) => {
          console.error('Apply Pilot could not clear the saved popup draft cache.', cacheError)
        })
      setTodayCount((count) => count + 1)
      commitDraft(undefined)
      setMessage('Application saved.')
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
      if (!nextSettings.enabled) {
        if (cacheTimer.current !== undefined) {
          window.clearTimeout(cacheTimer.current)
          cacheTimer.current = undefined
        }
        pendingEdits.current.clear()
        commitDraft(undefined)
      }
    } catch {
      setError('Could not update the capture setting.')
    }
  }

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div className="brand">
          <img className="brand-icon" src="./icons/app-icon.png" alt="" />
          <h1>Apply Pilot</h1>
        </div>
        <div className="capture-controls">
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
          <button
            type="button"
            className={`refresh-button${refreshArmed ? ' is-armed' : ''}`}
            onClick={() => void handleRefresh()}
            disabled={!draftReady || refreshing}
            aria-label={refreshArmed ? 'Confirm refresh and discard draft' : 'Refresh draft'}
            aria-pressed={refreshArmed}
            aria-busy={refreshing}
            title={refreshArmed ? 'Click again to discard and refresh' : 'Refresh draft'}
          >
            <svg
              className={`refresh-icon${refreshing ? ' is-spinning' : ''}`}
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 7v5h-5" />
              <path d="M4 17v-5h5" />
              <path d="M5.7 9a7 7 0 0 1 11.6-2L20 12M4 12l2.7 5a7 7 0 0 0 11.6-2" />
            </svg>
          </button>
        </div>
      </header>

      {draft?.status === 'submitted' && (
        <p className="feedback success" role="status">Application submitted? Verify the details and save.</p>
      )}

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
            value={draft?.fields.title ?? ''}
            disabled={!draftReady}
            onChange={(event) => updateDraftField('title', event.target.value)}
            onBlur={handleFieldBlur}
          />
        </label>
        <label>
          Company
          <input
            autoComplete="organization"
            placeholder="e.g. Northstar Labs"
            value={draft?.fields.company ?? ''}
            disabled={!draftReady}
            onChange={(event) => updateDraftField('company', event.target.value)}
            onBlur={handleFieldBlur}
          />
        </label>
        <label>
          Job posting URL
          <input
            autoComplete="url"
            placeholder="https://…"
            value={draft?.jobUrl ?? ''}
            disabled={!draftReady}
            onChange={(event) => updateDraftField('jobUrl', event.target.value)}
            onBlur={handleFieldBlur}
          />
        </label>
        <details
          className="extra-fields"
          open={Boolean(
            draft?.fields.location ||
            draft?.fields.workMode ||
            draft?.fields.salary ||
            draft?.fields.employmentType,
          )}
        >
          <summary>Location, salary &amp; more</summary>
          <div className="extra-grid">
            <label>
              Location
              <input
                autoComplete="off"
                placeholder="City or region"
                value={draft?.fields.location ?? ''}
                disabled={!draftReady}
                onChange={(event) => updateDraftField('location', event.target.value)}
                onBlur={handleFieldBlur}
              />
            </label>
            <label>
              Work mode
              <input
                autoComplete="off"
                placeholder="Remote, hybrid…"
                value={draft?.fields.workMode ?? ''}
                disabled={!draftReady}
                onChange={(event) => updateDraftField('workMode', event.target.value)}
                onBlur={handleFieldBlur}
              />
            </label>
            <label>
              Salary
              <input
                autoComplete="off"
                placeholder="Optional"
                value={draft?.fields.salary ?? ''}
                disabled={!draftReady}
                onChange={(event) => updateDraftField('salary', event.target.value)}
                onBlur={handleFieldBlur}
              />
            </label>
            <label>
              Employment type
              <input
                autoComplete="off"
                placeholder="Full-time, contract…"
                value={draft?.fields.employmentType ?? ''}
                disabled={!draftReady}
                onChange={(event) => updateDraftField('employmentType', event.target.value)}
                onBlur={handleFieldBlur}
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
          {sourceHost(pageUrl) || 'Open a job page to save its link'}
        </span>
        <a href="./dashboard.html" target="_blank" rel="noreferrer">Dashboard <span aria-hidden="true">→</span></a>
      </footer>
    </main>
  )
}
