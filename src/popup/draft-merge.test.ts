import { describe, expect, it } from 'vitest'
import { mergeVerifiedDraft } from './draft-merge'
import type { DraftField, GlobalDraft } from '../shared/types'

const draft = (overrides: Partial<GlobalDraft> = {}): GlobalDraft => ({
  status: 'provisional',
  fields: {
    title: 'Engineer',
    company: 'Northstar',
    location: 'Toronto',
    workMode: 'Hybrid',
    salary: 'INR 7 Lacs P.A.',
    employmentType: 'Full-time',
  },
  userEdited: {},
  jobUrl: 'https://jobs.example/roles/1',
  currentPageUrl: 'https://jobs.example/roles/1',
  sourceHost: 'jobs.example',
  createdAt: '2026-11-17T00:00:00.000Z',
  updatedAt: '2026-11-17T00:00:00.000Z',
  expiresAt: Date.now() + 60_000,
  ...overrides,
})

describe('popup draft verification', () => {
  it('keeps edited and pending fields while refreshing unedited values', () => {
    const local = draft({
      status: 'locked',
      fields: { ...draft().fields, salary: 'INR 9 Lacs P.A.' },
      userEdited: { salary: true },
    })
    const remote = draft({
      fields: { ...draft().fields, title: 'Senior Engineer', salary: 'INR 6 Lacs P.A.' },
    })

    expect(mergeVerifiedDraft(local, remote, new Map()).fields).toEqual({
      ...remote.fields,
      salary: 'INR 9 Lacs P.A.',
    })
    expect(mergeVerifiedDraft(local, remote, new Map()).status).toBe('locked')
  })

  it('keeps a field with an unsent popup edit', () => {
    const local = draft()
    const remote = draft({ fields: { ...draft().fields, title: 'Updated by the page' } })
    const merged = mergeVerifiedDraft(
      local,
      remote,
      new Map<DraftField, string>([['title', 'Typing']]),
    )

    expect(merged.fields.title).toBe('Typing')
  })

  it('does not replace a newer persisted user edit with an older cache value', () => {
    const local = draft({
      fields: { ...draft().fields, salary: 'INR 8 Lacs P.A.' },
      userEdited: { salary: true },
    })
    const remote = draft({
      fields: { ...draft().fields, salary: 'INR 9 Lacs P.A.' },
      userEdited: { salary: true },
      updatedAt: '2026-11-17T00:00:01.000Z',
    })

    expect(mergeVerifiedDraft(local, remote, new Map()).fields.salary)
      .toBe('INR 9 Lacs P.A.')
  })
})
