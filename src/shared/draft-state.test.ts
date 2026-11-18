import { describe, expect, it } from 'vitest'
import {
  applyPageCapture,
  editDraft,
  expireDraft,
  isDraftExpired,
  lockDraft,
  markDraftSubmitted,
  provisionalDraftTtlMs,
  refreshDraft,
  restoreDraftFromCache,
  saveDraft,
  lockedDraftTtlMs,
} from './draft-state'
import type { DraftCapture, GlobalDraftState } from './types'

const now = Date.parse('2026-11-17T00:00:00.000Z')
const capture = (
  jobUrl = 'https://jobs.example/roles/1?utm_source=feed',
  overrides: Partial<DraftCapture> = {},
): DraftCapture => ({
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
  jobUrl,
  sourceHost: 'jobs.example',
  ...overrides,
})

const provisional = (): GlobalDraftState =>
  applyPageCapture(
    {},
    capture(),
    true,
    'https://jobs.example/roles/1?utm_source=feed',
    now,
  )

describe('global draft state machine', () => {
  it('moves from none to provisional to locked to submitted to none on save', () => {
    const first = provisional()
    expect(first.draft?.status).toBe('provisional')
    expect(first.draft?.expiresAt).toBe(now + provisionalDraftTtlMs)

    const locked = lockDraft(first, capture(), 'https://jobs.example/apply', now + 1)
    expect(locked.draft?.status).toBe('locked')
    expect(locked.draft?.lockedAt).toBe(new Date(now + 1).toISOString())
    expect(locked.draft?.expiresAt).toBe(now + 1 + lockedDraftTtlMs)

    const submitted = markDraftSubmitted(
      locked,
      'https://jobs.example/confirmation',
      now + 2,
    )
    expect(submitted.newlySubmitted).toBe(true)
    expect(submitted.state.draft?.status).toBe('submitted')
    expect(submitted.state.draft?.notified).toBe(true)

    const saved = saveDraft(submitted.state, 'https://jobs.example/roles/1')
    expect(saved.draft).toBeUndefined()
    expect(saved.suppressedJobUrl).toBe('https://jobs.example/roles/1')
  })

  it('replaces only on a strong different-posting signal while provisional', () => {
    const first = provisional()
    const other = capture('https://jobs.example/roles/2', { jobId: '2' })
    const weak = applyPageCapture(first, other, false, other.jobUrl, now + 1)
    expect(weak.draft?.jobUrl).toBe('https://jobs.example/roles/1')

    const strong = applyPageCapture(first, other, true, other.jobUrl, now + 2)
    expect(strong.draft?.jobUrl).toBe(other.jobUrl)
    expect(strong.draft?.fields.title).toBe('Engineer')
  })

  it('protects edited fields and locks on the first popup edit', () => {
    const first = provisional()
    const edited = editDraft(
      first,
      'salary',
      'INR 9 Lacs P.A.',
      'https://jobs.example/roles/1',
      'jobs.example',
      now + 1,
    )
    expect(edited.draft?.status).toBe('locked')
    expect(edited.draft?.fields.salary).toBe('INR 9 Lacs P.A.')
    expect(edited.draft?.userEdited.salary).toBe(true)

    const changedUrl = editDraft(
      first,
      'jobUrl',
      'https://other.example/jobs/2',
      'https://jobs.example/roles/1',
      'jobs.example',
      now + 2,
    )
    expect(changedUrl.draft?.jobUrl).toBe('https://other.example/jobs/2')
    expect(changedUrl.draft?.sourceHost).toBe('other.example')
    expect(changedUrl.draft?.id).toBeUndefined()
    expect(changedUrl.draft?.jobId).toBeUndefined()

    const next = applyPageCapture(
      edited,
      capture('https://jobs.example/roles/2', {
        jobId: '2',
        fields: { ...capture().fields, title: 'Different role', salary: 'INR 6 Lacs P.A.' },
      }),
      true,
      'https://company.example/confirmation',
      now + 2,
    )
    expect(next.draft?.fields).toEqual(edited.draft?.fields)
    expect(next.draft?.currentPageUrl).toBe('https://company.example/confirmation')
  })

  it('fills missing unedited fields from a later partial-page capture', () => {
    const partialCapture = capture('https://jobs.example/roles/1', {
      fields: {
        title: 'Engineer',
        company: '',
        location: '',
        workMode: '',
        salary: '',
        employmentType: '',
      },
    })
    const partial = applyPageCapture(
      {},
      partialCapture,
      false,
      partialCapture.jobUrl,
      now,
    )
    const completeCapture = capture('https://jobs.example/roles/1', {
      fields: { ...capture().fields, salary: 'USD 80,000' },
    })
    const filled = applyPageCapture(
      partial,
      completeCapture,
      false,
      completeCapture.jobUrl,
      now + 2,
    )

    expect(filled.draft?.fields.company).toBe('Northstar')
    expect(filled.draft?.fields.location).toBe('Toronto')
    expect(filled.draft?.fields.salary).toBe('USD 80,000')
  })

  it('updates only URL and updatedAt while locked or submitted', () => {
    const locked = lockDraft(provisional(), undefined, 'https://jobs.example/apply', now + 1)
    const next = applyPageCapture(
      locked,
      capture('https://other.example/new-job', { jobId: 'other' }),
      true,
      'https://other.example/step-2',
      now + 2,
    )
    expect(next.draft?.fields).toEqual(locked.draft?.fields)
    expect(next.draft?.jobUrl).toBe(locked.draft?.jobUrl)
    expect(next.draft?.currentPageUrl).toBe('https://other.example/step-2')
    expect(next.draft?.updatedAt).toBe(new Date(now + 2).toISOString())

    const submitted = markDraftSubmitted(locked, 'https://jobs.example/confirmation', now + 3).state
    const submittedUpdate = applyPageCapture(
      submitted,
      undefined,
      false,
      'https://other.example/final-step',
      now + 4,
    )
    expect(submittedUpdate.draft?.status).toBe('submitted')
    expect(submittedUpdate.draft?.fields).toEqual(submitted.draft?.fields)
  })

  it('updates a locked global draft only from a flow tab or its opener flow', () => {
    const flowDraft = applyPageCapture(
      {},
      capture(),
      true,
      'https://jobs.example/roles/1',
      now,
      11,
    )
    const locked = lockDraft(
      flowDraft,
      undefined,
      'https://jobs.example/apply',
      now + 1,
      11,
    )
    const unrelated = applyPageCapture(
      locked,
      undefined,
      false,
      'https://other.example/',
      now + 2,
      22,
    )
    expect(unrelated).toBe(locked)

    const openedTab = applyPageCapture(
      locked,
      undefined,
      false,
      'https://other.example/step',
      now + 3,
      22,
      11,
    )
    expect(openedTab.draft?.currentPageUrl).toBe('https://other.example/step')
    expect(openedTab.draft?.flowTabIds).toEqual([11, 22])
    expect(markDraftSubmitted(locked, 'https://other.example/success', now + 4, 22).newlySubmitted)
      .toBe(false)
    expect(markDraftSubmitted(locked, 'https://other.example/success', now + 4, 22, 11).newlySubmitted)
      .toBe(true)
  })

  it('ignores repeated submission events and refuses submission before locking', () => {
    const initial = provisional()
    expect(markDraftSubmitted(initial, 'https://jobs.example/confirmation', now + 1).newlySubmitted)
      .toBe(false)

    const locked = lockDraft(initial, undefined, 'https://jobs.example/apply', now + 2)
    const first = markDraftSubmitted(locked, 'https://jobs.example/confirmation', now + 3)
    const duplicate = markDraftSubmitted(first.state, 'https://jobs.example/confirmation', now + 4)
    expect(first.newlySubmitted).toBe(true)
    expect(duplicate.newlySubmitted).toBe(false)
    expect(duplicate.state.draft?.submittedAt).toBe(first.state.draft?.submittedAt)
  })

  it('refreshes to a new provisional or empty state and clears saved suppression', () => {
    const saved = saveDraft(provisional(), 'https://jobs.example/roles/1')
    const sameJob = applyPageCapture(saved, capture(), true, 'https://jobs.example/roles/1', now + 1)
    expect(sameJob.draft).toBeUndefined()

    const differentJob = applyPageCapture(
      sameJob,
      capture('https://jobs.example/roles/2', { jobId: '2' }),
      true,
      'https://jobs.example/roles/2',
      now + 2,
    )
    expect(differentJob.draft?.status).toBe('provisional')
    expect(differentJob.suppressedJobUrl).toBeUndefined()

    const refreshedEmpty = refreshDraft(differentJob, undefined, 'https://example.com', now + 3)
    expect(refreshedEmpty.draft).toBeUndefined()
    expect(refreshedEmpty.suppressedJobUrl).toBeUndefined()
    expect(refreshDraft({}, capture(), 'https://jobs.example/roles/1', now + 4).draft?.status)
      .toBe('provisional')
  })

  it('restores session edits without replacing newer or unrelated draft data', () => {
    const current = provisional()
    const cached = {
      ...current.draft!,
      status: 'locked' as const,
      fields: { ...current.draft!.fields, salary: 'INR 9 Lacs P.A.' },
      userEdited: { salary: true as const },
      lockedAt: new Date(now + 1).toISOString(),
    }
    const restored = restoreDraftFromCache(current, cached, now + 2)
    expect(restored.draft?.status).toBe('locked')
    expect(restored.draft?.fields.salary).toBe('INR 9 Lacs P.A.')
    expect(restored.draft?.userEdited.salary).toBe(true)

    const unrelated = restoreDraftFromCache(
      provisional(),
      {
        ...cached,
        jobUrl: 'https://jobs.example/roles/2',
        currentPageUrl: 'https://jobs.example/roles/2',
        jobId: '2',
      },
      now + 3,
    )
    expect(unrelated.draft?.jobUrl).toBe(current.draft?.jobUrl)
    expect(unrelated.draft?.fields.salary).toBe(current.draft?.fields.salary)
  })

  it('expires provisional drafts at 24 hours and locked/submitted drafts at seven days', () => {
    const draft = provisional().draft!
    expect(isDraftExpired(draft, now + provisionalDraftTtlMs)).toBe(true)

    const locked = lockDraft(provisional(), undefined, 'https://jobs.example/apply', now + 1).draft!
    expect(isDraftExpired(locked, now + 1 + lockedDraftTtlMs - 1)).toBe(false)
    expect(isDraftExpired(locked, now + 1 + lockedDraftTtlMs)).toBe(true)
    expect(expireDraft({ draft: locked }, now + 1 + lockedDraftTtlMs).draft).toBeUndefined()
  })
})
