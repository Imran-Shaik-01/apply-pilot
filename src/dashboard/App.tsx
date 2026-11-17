import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react'
import { liveQuery } from 'dexie'
import { db, deleteJob, getSettings, listJobs, saveJob, updateSettings } from '../shared/storage'
import {
  defaultSettings,
  statusOptions,
  type JobApplication,
  type JobStatus,
  type Settings,
} from '../shared/types'
import { canonicalizeJobUrl, formatDate, getAppSummary, isoNow, safeUrl } from '../shared/utils'
import {
  emptyJobDraft,
  jobApplicationFromDraft,
  jobDraftFromApplication,
  type JobDraft,
} from './job-form'

type View = 'Overview' | 'Applications' | 'Insights' | 'Settings'

const views: View[] = ['Overview', 'Applications', 'Insights', 'Settings']

type JobRowsProps = {
  items: JobApplication[]
  hasApplications: boolean
  pendingDeleteId: string | null
  onAddFirstApplication: () => void
  onEdit: (job: JobApplication) => void
  onDelete: (job: JobApplication) => Promise<void>
  onStatusChange: (job: JobApplication, status: JobStatus) => void | Promise<void>
  onRequestDelete: (jobId: string) => void
  onCancelDelete: () => void
}

const JobRows = memo(function JobRows({
  items,
  hasApplications,
  pendingDeleteId,
  onAddFirstApplication,
  onEdit,
  onDelete,
  onStatusChange,
  onRequestDelete,
  onCancelDelete,
}: JobRowsProps) {
  return (
    <div className="job-table">
      <div className="job-row job-header">
        <span>Role</span>
        <span>Status</span>
        <span>Applied</span>
        <span className="actions-heading">Actions</span>
      </div>
      {items.length === 0 ? (
        <div className="empty-state">
          {!hasApplications ? (
            <>
              <p>No applications yet. Add one to start your pipeline.</p>
              <button type="button" className="primary-button" onClick={onAddFirstApplication}>Add your first application</button>
            </>
          ) : 'No applications match these filters.'}
        </div>
      ) : items.map((job) => {
        const jobUrl = safeUrl(job.applicationUrl || job.url)
        return (
          <div className="job-row" key={job.id}>
            <div className="job-role">
              {jobUrl
                ? <a className="job-link" href={jobUrl} target="_blank" rel="noopener noreferrer">{job.title}</a>
                : <strong>{job.title}</strong>}
              <span>{job.company}{job.location ? ` · ${job.location}` : ''}</span>
              <span className="mobile-applied-date">Applied {formatDate(job.appliedAt)}</span>
            </div>
            <label className="status-control">
              <span className="sr-only">Status for {job.title} at {job.company}</span>
              <select
                className={`status-select ${job.status.toLowerCase()}`}
                value={job.status}
                onChange={(event) => void onStatusChange(job, event.target.value as JobStatus)}
              >
                {statusOptions.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <span className="applied-date">{formatDate(job.appliedAt)}</span>
            <div className="row-actions">
              <button type="button" className="text-button" onClick={() => onEdit(job)}>Edit</button>
              {pendingDeleteId === job.id ? (
                <span className="delete-confirmation" role="group" aria-label={`Confirm deleting ${job.title} at ${job.company}`}>
                  <button type="button" className="text-button danger" onClick={() => void onDelete(job)}>Confirm</button>
                  <button type="button" className="text-button" onClick={onCancelDelete}>Cancel</button>
                </span>
              ) : (
                <button type="button" className="text-button danger" onClick={() => onRequestDelete(job.id)}>Delete</button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
})

export function DashboardApp() {
  const [jobs, setJobs] = useState<JobApplication[]>([])
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [view, setView] = useState<View>('Overview')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'All'>('All')
  const [editingJob, setEditingJob] = useState<JobApplication | null>(null)
  const [draft, setDraft] = useState<JobDraft>(emptyJobDraft())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const dialogTriggerRef = useRef<HTMLElement | null>(null)
  const recentJobs = useMemo(() => jobs.slice(0, 5), [jobs])
  const cancelPendingDelete = useCallback(() => setPendingDeleteId(null), [])

  useEffect(() => {
    const subscription = liveQuery(() => db.jobs.orderBy('appliedAt').reverse().toArray()).subscribe({
      next: (nextJobs) => {
        setJobs(nextJobs)
        setLoading(false)
      },
      error: () => {
        setError('Could not load your saved applications.')
        setLoading(false)
      },
    })
    void getSettings().then(setSettings).catch(() => {
      setError('Could not load your saved applications.')
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!dialogOpen) {
      dialogTriggerRef.current?.focus()
      dialogTriggerRef.current = null
      return
    }

    const firstInput = dialogRef.current?.querySelector<HTMLElement>('input:not([disabled])')
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    const target = firstInput ?? firstFocusable
    target?.focus()
  }, [dialogOpen])

  const summary = useMemo(() => getAppSummary(jobs, settings.weekStartDay), [jobs, settings.weekStartDay])
  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const job of jobs) {
      const source = job.source || 'Other'
      counts.set(source, (counts.get(source) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [jobs])
  const { respondedCount, responseRate, interviewRate } = useMemo(() => {
    const responded = jobs.filter((job) =>
      ['Interviewing', 'Offer', 'Rejected'].includes(job.status),
    ).length
    const interviewed = jobs.filter((job) =>
      ['Interviewing', 'Offer'].includes(job.status),
    ).length
    return {
      respondedCount: responded,
      responseRate: jobs.length ? Math.round((responded / jobs.length) * 100) : 0,
      interviewRate: jobs.length ? Math.round((interviewed / jobs.length) * 100) : 0,
    }
  }, [jobs])
  const filteredJobs = useMemo(() => jobs.filter((job) => {
    const searchable = `${job.title} ${job.company} ${job.source} ${job.location ?? ''}`.toLowerCase()
    return searchable.includes(query.toLowerCase()) && (statusFilter === 'All' || job.status === statusFilter)
  }), [jobs, query, statusFilter])

  const openNewJob = useCallback(() => {
    dialogTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEditingJob(null)
    setDraft(emptyJobDraft())
    setError('')
    setDialogOpen(true)
  }, [])

  const openEditJob = useCallback((job: JobApplication) => {
    dialogTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEditingJob(job)
    setDraft(jobDraftFromApplication(job))
    setError('')
    setDialogOpen(true)
  }, [])

  const closeDialog = () => {
    setDialogOpen(false)
    setError('')
    setNotice('')
  }

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDialog()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getClientRects().length > 0)
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const handleSaveJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setNotice('')
    const url = canonicalizeJobUrl(draft.url.trim())
    if (!url) {
      setError('Enter a valid http or https job link.')
      return
    }

    const appliedDate = new Date(draft.appliedAt)
    if (!draft.appliedAt || Number.isNaN(appliedDate.getTime())) {
      setError('Enter a valid application date and time.')
      return
    }
    const appliedAt = appliedDate.toISOString()
    const applicationUrl = canonicalizeJobUrl(draft.applicationUrl.trim()) || url

    const timestamp = isoNow()
    const job = jobApplicationFromDraft(
      draft,
      editingJob,
      url,
      applicationUrl,
      appliedAt,
      timestamp,
    )

    setSaving(true)
    try {
      if (!editingJob && (await listJobs()).some((existing) =>
        existing.id === job.id || canonicalizeJobUrl(existing.url) === url,
      )) {
        setError('This application is already saved.')
        return
      }
      await saveJob(job)
      closeDialog()
      setNotice(editingJob ? 'Application updated.' : 'Application added.')
    } catch {
      setError('Could not save this application. Check the details and try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteJob = useCallback(async (job: JobApplication) => {
    setError('')
    setNotice('')
    try {
      await deleteJob(job.id)
      setPendingDeleteId(null)
      setNotice('Application deleted.')
    } catch {
      setError('Could not delete this application.')
    }
  }, [])

  const handleStatusChange = useCallback(async (job: JobApplication, status: JobStatus) => {
    setError('')
    const updatedAt = isoNow()
    try {
      const statusHistory = job.statusHistory ?? [{ status: job.status, changedAt: job.updatedAt }]
      await saveJob({
        ...job,
        status,
        updatedAt,
        statusHistory: status === job.status
          ? statusHistory
          : [...statusHistory, { status, changedAt: updatedAt }],
      })
    } catch {
      setError(`Could not update ${job.company}'s application status.`)
    }
  }, [])

  const handleSettingsChange = async (patch: Partial<Settings>) => {
    setError('')
    try {
      const nextSettings = await updateSettings(patch)
      setSettings(nextSettings)
    } catch {
      setError('Could not save that setting.')
    }
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="./icons/app-icon.png" alt="" />
          <div>
            <p>Apply Pilot</p>
            <small>Job pipeline</small>
          </div>
        </div>

        <nav className="nav" aria-label="Dashboard sections">
          {views.map((item) => (
            <button
              type="button"
              key={item}
              className={`nav-item ${view === item ? 'active' : ''}`}
              aria-current={view === item ? 'page' : undefined}
              onClick={() => {
                setView(item)
                setError('')
                setNotice('')
              }}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">{view}</p>
            <h1>{view === 'Overview' ? 'Application overview' : view}</h1>
          </div>
          {view !== 'Settings' && (
            <button type="button" className="primary-button" onClick={openNewJob}>Add application</button>
          )}
        </header>

        {error && <p className="dashboard-feedback error" role="alert">{error}</p>}
        {notice && <p className="dashboard-feedback success" role="status">{notice}</p>}

        {loading ? <p className="dashboard-feedback" role="status">Loading your applications…</p> : null}
        {!loading && view === 'Overview' && (
          <>
            <section className="stats-grid" aria-label="Application totals">
              <article className="stat-card"><span>Total applied</span><strong>{summary.total}</strong><small>Across all roles</small></article>
              <article className="stat-card"><span>Applied today</span><strong>{summary.today}</strong><small>Local time</small></article>
              <article className="stat-card"><span>Applied this week</span><strong>{summary.week}</strong><small>Based on your week start</small></article>
              <article className="stat-card"><span>Applied this month</span><strong>{summary.month}</strong><small>Current month</small></article>
            </section>

            <section className="insights-row">
              <div className="insight-panel">
                <h2>Top sources</h2>
                {sourceCounts.length === 0 ? <p className="muted">Sources will appear as you add jobs.</p> : (
                  <ul>{sourceCounts.map(([source, count]) => (
                    <li key={source}><span>{source}</span><strong>{Math.round((count / jobs.length) * 100)}%</strong></li>
                  ))}</ul>
                )}
              </div>
              <div className="insight-panel">
                <h2>Response rate</h2>
                {jobs.length === 0 ? <p className="muted">Add applications to see your response rate.</p> : (
                  <div className="rate-summary">
                    <div className="ring" style={{ '--rate': `${responseRate}%` } as CSSProperties}><span>{responseRate}%</span></div>
                    <p>{respondedCount} of {jobs.length} applications received a response.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="jobs-panel">
              <div className="panel-header"><h2>Recent applications</h2><button className="text-button" type="button" onClick={() => setView('Applications')}>View all</button></div>
              <JobRows
                items={recentJobs}
                hasApplications={jobs.length > 0}
                pendingDeleteId={pendingDeleteId}
                onAddFirstApplication={openNewJob}
                onEdit={openEditJob}
                onDelete={handleDeleteJob}
                onStatusChange={handleStatusChange}
                onRequestDelete={setPendingDeleteId}
                onCancelDelete={cancelPendingDelete}
              />
            </section>
          </>
        )}

        {!loading && view === 'Applications' && (
          <section className="jobs-panel">
            <div className="panel-header">
              <div><h2>Applications</h2><span className="muted">{filteredJobs.length} of {jobs.length}</span></div>
              <div className="filters">
                <input
                  type="search"
                  aria-label="Search applications"
                  placeholder="Search role or company"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as JobStatus | 'All')}
                >
                  <option value="All">All statuses</option>
                  {statusOptions.map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
            </div>
            <JobRows
              items={filteredJobs}
              hasApplications={jobs.length > 0}
              pendingDeleteId={pendingDeleteId}
              onAddFirstApplication={openNewJob}
              onEdit={openEditJob}
              onDelete={handleDeleteJob}
              onStatusChange={handleStatusChange}
              onRequestDelete={setPendingDeleteId}
              onCancelDelete={cancelPendingDelete}
            />
          </section>
        )}

        {!loading && view === 'Insights' && (
          <section className="insight-grid">
            <article className="insight-panel">
              <h2>Application status</h2>
              {jobs.length === 0 ? <p className="muted">Status breakdown appears after you save applications.</p> : (
                <ul>{statusOptions.map((status) => {
                  const count = jobs.filter((job) => job.status === status).length
                  return <li key={status}><span>{status}</span><strong>{count} · {Math.round((count / jobs.length) * 100)}%</strong></li>
                })}</ul>
              )}
            </article>
            <article className="insight-panel">
              <h2>Response &amp; interview rates</h2>
              <div className="rate-lines">
                <p><span>Response rate</span><strong>{responseRate}%</strong></p>
                <p><span>Interview rate</span><strong>{interviewRate}%</strong></p>
                <small>Responses include interview, offer, and rejection updates.</small>
              </div>
            </article>
            <article className="insight-panel">
              <h2>Sources</h2>
              {sourceCounts.length === 0 ? <p className="muted">Source trends appear as you add applications.</p> : (
                <ul>{sourceCounts.map(([source, count]) => (
                  <li key={source}><span>{source}</span><strong>{count}</strong></li>
                ))}</ul>
              )}
            </article>
          </section>
        )}

        {!loading && view === 'Settings' && (
          <section className="settings-panel">
            <h2>Preferences</h2>
            <label className="setting-row">
              <span><strong>Application capture</strong><small>Allow Apply Pilot to read job details from the active page.</small></span>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) => void handleSettingsChange({ enabled: event.target.checked })}
              />
            </label>
            <label className="setting-row">
              <span><strong>Week starts on</strong><small>Used for weekly application totals.</small></span>
              <select
                value={settings.weekStartDay}
                onChange={(event) => void handleSettingsChange({ weekStartDay: Number(event.target.value) })}
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={6}>Saturday</option>
              </select>
            </label>
          </section>
        )}
      </main>

      {dialogOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDialog()
        }}>
          <section
            ref={dialogRef}
            className="job-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-dialog-title"
            onKeyDown={handleDialogKeyDown}
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow">{editingJob ? 'Edit application' : 'New application'}</p>
                <h2 id="job-dialog-title">{editingJob ? 'Update job details' : 'Add a job'}</h2>
              </div>
              <button type="button" className="close-button" aria-label="Close dialog" onClick={closeDialog}>✕</button>
            </div>
            <form className="job-form" onSubmit={(event) => void handleSaveJob(event)}>
              <label>Role<input required autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
              <label>Company<input required value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} /></label>
              <label className="full-width">Job link<input required type="url" placeholder="https://…" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>
              <label className="full-width">Application link<input type="url" placeholder="https://…" value={draft.applicationUrl} onChange={(event) => setDraft({ ...draft, applicationUrl: event.target.value })} /></label>
              <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as JobStatus })}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label>Applied at<input required type="datetime-local" value={draft.appliedAt} onChange={(event) => setDraft({ ...draft, appliedAt: event.target.value })} /></label>
              <label>Platform<input value={draft.platform} onChange={(event) => setDraft({ ...draft, platform: event.target.value })} /></label>
              <label>Recruiter<input value={draft.recruiter} onChange={(event) => setDraft({ ...draft, recruiter: event.target.value })} /></label>
              <label>Location<input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
              <label>Work mode<input value={draft.workMode} onChange={(event) => setDraft({ ...draft, workMode: event.target.value })} /></label>
              <label>Salary<input value={draft.salary} onChange={(event) => setDraft({ ...draft, salary: event.target.value })} /></label>
              <label>Employment type<input value={draft.employmentType} onChange={(event) => setDraft({ ...draft, employmentType: event.target.value })} /></label>
              <label className="full-width">Notes<textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
              {editingJob && (
                <section className="full-width" aria-label="Status history">
                  <h3>Status history</h3>
                  <ul>
                    {(editingJob.statusHistory ?? [{ status: editingJob.status, changedAt: editingJob.updatedAt }])
                      .map((change, index) => (
                        <li key={`${change.changedAt}-${index}`}>{change.status} · {formatDate(change.changedAt)}</li>
                      ))}
                  </ul>
                </section>
              )}
              {error && <p className="form-error full-width" role="alert">{error}</p>}
              <div className="dialog-actions full-width">
                <button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button>
                <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : editingJob ? 'Save changes' : 'Add application'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
