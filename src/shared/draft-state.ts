import type { DraftCapture, DraftField, DraftFields, GlobalDraft, GlobalDraftState } from './types'

export const provisionalDraftTtlMs = 24 * 60 * 60 * 1000
export const lockedDraftTtlMs = 7 * 24 * 60 * 60 * 1000

const nowIso = (now: number) => new Date(now).toISOString()

export const canonicalJobUrlKey = (value: string) => {
  try {
    const url = new URL(value)
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|trk|trackingid|refid|ref|src|gclid|dclid|fbclid|msclkid|mc_cid|mc_eid|ref_src|ref_url)$/i.test(key)) {
        url.searchParams.delete(key)
      }
    }
    url.hash = ''
    return url.toString()
  } catch {
    return value.trim()
  }
}

const sourceHostFor = (jobUrl: string, fallback: string) => {
  try {
    return new URL(jobUrl).hostname
  } catch {
    return fallback
  }
}

const samePosting = (current: GlobalDraft, incoming: DraftCapture) =>
  Boolean(
    (current.jobId && incoming.jobId && current.jobId === incoming.jobId) ||
      canonicalJobUrlKey(current.jobUrl) === canonicalJobUrlKey(incoming.jobUrl),
  )

const sameDraft = (current: GlobalDraft, cached: GlobalDraft) => {
  if (current.jobId && cached.jobId && current.jobId !== cached.jobId) return false
  return Boolean(
    (current.jobId && cached.jobId && current.jobId === cached.jobId) ||
      canonicalJobUrlKey(current.jobUrl) === canonicalJobUrlKey(cached.jobUrl) ||
      canonicalJobUrlKey(current.currentPageUrl) === canonicalJobUrlKey(cached.currentPageUrl),
  )
}

const createDraft = (
  capture: DraftCapture,
  currentPageUrl: string,
  now: number,
  tabId?: number,
): GlobalDraft => ({
  status: 'provisional',
  fields: { ...capture.fields },
  userEdited: {},
  jobUrl: canonicalJobUrlKey(capture.jobUrl),
  currentPageUrl,
  sourceHost: sourceHostFor(capture.jobUrl, capture.sourceHost),
  id: capture.id,
  jobId: capture.jobId,
  createdAt: nowIso(now),
  updatedAt: nowIso(now),
  expiresAt: now + provisionalDraftTtlMs,
  flowTabIds: tabId === undefined ? undefined : [tabId],
})

export const isDraftExpired = (draft: GlobalDraft, now = Date.now()) =>
  !Number.isFinite(draft.expiresAt) || now >= draft.expiresAt

export const expireDraft = (state: GlobalDraftState, now = Date.now()): GlobalDraftState =>
  state.draft && isDraftExpired(state.draft, now)
    ? { ...state, draft: undefined }
    : state

const updateUneditedFields = (current: GlobalDraft, incoming: DraftCapture): DraftFields => {
  const fields = { ...current.fields }
  for (const field of [
    'title',
    'company',
    'location',
    'workMode',
    'salary',
    'employmentType',
  ] as const satisfies readonly DraftField[]) {
    if (!current.userEdited[field] && incoming.fields[field]) {
      fields[field] = incoming.fields[field]
    }
  }
  return fields
}

const updatePageUrl = (draft: GlobalDraft, currentPageUrl: string, now: number): GlobalDraft =>
  draft.currentPageUrl === currentPageUrl
    ? draft
    : { ...draft, currentPageUrl, updatedAt: nowIso(now) }

const belongsToFlow = (draft: GlobalDraft, tabId?: number, openerTabId?: number) =>
  !draft.flowTabIds?.length ||
  (tabId !== undefined && draft.flowTabIds.includes(tabId)) ||
  (openerTabId !== undefined && draft.flowTabIds.includes(openerTabId))

const withFlowTab = (draft: GlobalDraft, tabId?: number) => {
  if (tabId === undefined || draft.flowTabIds?.includes(tabId)) return draft
  return { ...draft, flowTabIds: [...(draft.flowTabIds ?? []), tabId] }
}

export const applyPageCapture = (
  initialState: GlobalDraftState,
  capture: DraftCapture | undefined,
  strongSignal: boolean,
  currentPageUrl: string,
  now = Date.now(),
  tabId?: number,
  openerTabId?: number,
): GlobalDraftState => {
  const state = expireDraft(initialState, now)
  let draft = state.draft

  if (draft?.status === 'locked' || draft?.status === 'submitted') {
    if (!belongsToFlow(draft, tabId, openerTabId)) return state
    const nextDraft = updatePageUrl(withFlowTab(draft, tabId), currentPageUrl, now)
    if (nextDraft === draft) return state
    return {
      ...state,
      draft: nextDraft,
    }
  }

  if (!capture) {
    return draft
      ? { ...state, draft: updatePageUrl(draft, currentPageUrl, now) }
      : state
  }

  const captureUrl = canonicalJobUrlKey(capture.jobUrl)
  if (state.suppressedJobUrl === captureUrl) return state

  if (!draft) {
    return {
      draft: createDraft(capture, currentPageUrl, now, tabId),
      suppressedJobUrl: state.suppressedJobUrl && state.suppressedJobUrl !== captureUrl
        ? undefined
        : state.suppressedJobUrl,
    }
  }

  if (samePosting(draft, capture)) {
    const fields = updateUneditedFields(draft, capture)
    const nextDraft = {
      ...draft,
      flowTabIds: withFlowTab(draft, tabId).flowTabIds,
      fields,
      jobUrl: draft.userEdited.jobUrl ? draft.jobUrl : captureUrl,
      sourceHost: draft.userEdited.jobUrl ? draft.sourceHost : sourceHostFor(captureUrl, capture.sourceHost),
      currentPageUrl,
      updatedAt: nowIso(now),
    }
    return { ...state, draft: nextDraft }
  }

  if (!strongSignal) {
    return { ...state, draft: updatePageUrl(draft, currentPageUrl, now) }
  }

  return {
    draft: createDraft(capture, currentPageUrl, now, tabId),
    suppressedJobUrl: state.suppressedJobUrl && state.suppressedJobUrl !== captureUrl
      ? undefined
      : state.suppressedJobUrl,
  }
}

const lock = (draft: GlobalDraft, currentPageUrl: string, now: number): GlobalDraft => ({
  ...draft,
  status: 'locked',
  currentPageUrl,
  lockedAt: draft.lockedAt ?? nowIso(now),
  updatedAt: nowIso(now),
  expiresAt: draft.lockedAt ? draft.expiresAt : now + lockedDraftTtlMs,
})

export const lockDraft = (
  initialState: GlobalDraftState,
  capture: DraftCapture | undefined,
  currentPageUrl: string,
  now = Date.now(),
  tabId?: number,
  openerTabId?: number,
): GlobalDraftState => {
  const state = expireDraft(initialState, now)
  const draft = state.draft

  if (draft?.status === 'submitted') {
    if (!belongsToFlow(draft, tabId, openerTabId)) return state
    return { ...state, draft: updatePageUrl(withFlowTab(draft, tabId), currentPageUrl, now) }
  }
  if (draft?.status === 'locked') {
    if (!belongsToFlow(draft, tabId, openerTabId)) return state
    return { ...state, draft: updatePageUrl(withFlowTab(draft, tabId), currentPageUrl, now) }
  }

  const nextDraft = capture
    ? createDraft(capture, currentPageUrl, now, tabId)
    : draft
  return nextDraft
    ? { ...state, draft: lock(withFlowTab(nextDraft, tabId), currentPageUrl, now) }
    : state
}

export const editDraft = (
  initialState: GlobalDraftState,
  field: DraftField,
  value: string,
  currentPageUrl: string,
  sourceHost: string,
  now = Date.now(),
  tabId?: number,
): GlobalDraftState => {
  const state = expireDraft(initialState, now)
  const draft = state.draft ?? {
    status: 'provisional' as const,
    fields: {
      title: '',
      company: '',
      location: '',
      workMode: '',
      salary: '',
      employmentType: '',
    },
    userEdited: {},
    jobUrl: '',
    currentPageUrl,
    sourceHost,
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
    expiresAt: now + provisionalDraftTtlMs,
    flowTabIds: tabId === undefined ? undefined : [tabId],
  }
  const next: GlobalDraft = {
    ...draft,
    flowTabIds: withFlowTab(draft, tabId).flowTabIds,
    status: draft.status === 'submitted' ? 'submitted' : 'locked',
    fields: { ...draft.fields },
    userEdited: { ...draft.userEdited, [field]: true },
    currentPageUrl,
    updatedAt: nowIso(now),
    lockedAt: draft.lockedAt ?? nowIso(now),
    expiresAt: draft.lockedAt ? draft.expiresAt : now + lockedDraftTtlMs,
  }
  if (field === 'jobUrl') {
    next.jobUrl = value
    next.sourceHost = sourceHostFor(value, sourceHost)
    next.id = undefined
    next.jobId = undefined
  } else {
    next.fields[field] = value
  }
  return { ...state, draft: next }
}

export const markDraftSubmitted = (
  initialState: GlobalDraftState,
  currentPageUrl: string,
  now = Date.now(),
  tabId?: number,
  openerTabId?: number,
): { state: GlobalDraftState; newlySubmitted: boolean } => {
  const state = expireDraft(initialState, now)
  if (
    state.draft?.status !== 'locked' ||
    !belongsToFlow(state.draft, tabId, openerTabId)
  ) {
    return { state, newlySubmitted: false }
  }
  return {
    state: {
      ...state,
      draft: {
        ...withFlowTab(state.draft, tabId),
        status: 'submitted',
        currentPageUrl,
        updatedAt: nowIso(now),
        submittedAt: nowIso(now),
        notified: true,
        expiresAt: now + lockedDraftTtlMs,
      },
    },
    newlySubmitted: true,
  }
}

export const refreshDraft = (
  _state: GlobalDraftState,
  capture: DraftCapture | undefined,
  currentPageUrl: string,
  now = Date.now(),
  tabId?: number,
): GlobalDraftState => ({
  draft: capture ? createDraft(capture, currentPageUrl, now, tabId) : undefined,
  suppressedJobUrl: undefined,
})

export const restoreDraftFromCache = (
  initialState: GlobalDraftState,
  cached: GlobalDraft,
  now = Date.now(),
): GlobalDraftState => {
  const state = expireDraft(initialState, now)
  if (isDraftExpired(cached, now)) return state
  const current = state.draft
  if (!current) {
    if (state.suppressedJobUrl === canonicalJobUrlKey(cached.jobUrl)) return state
    return { ...state, draft: cached }
  }
  if (!sameDraft(current, cached)) return state

  const fields = { ...current.fields }
  const userEdited = { ...current.userEdited }
  for (const field of [
    'title',
    'company',
    'location',
    'workMode',
    'salary',
    'employmentType',
  ] as const satisfies readonly DraftField[]) {
    if (cached.userEdited[field] && !current.userEdited[field]) {
      fields[field] = cached.fields[field]
      userEdited[field] = true
    }
  }

  const restoreJobUrl = Boolean(cached.userEdited.jobUrl && !current.userEdited.jobUrl)
  const status = current.status === 'submitted' || cached.status === 'submitted'
    ? 'submitted'
    : current.status === 'locked' || cached.status === 'locked'
      ? 'locked'
      : 'provisional'
  const flowTabIds = [...new Set([...(current.flowTabIds ?? []), ...(cached.flowTabIds ?? [])])]
  const changed =
    status !== current.status ||
    restoreJobUrl ||
    JSON.stringify(fields) !== JSON.stringify(current.fields) ||
    JSON.stringify(userEdited) !== JSON.stringify(current.userEdited) ||
    JSON.stringify(flowTabIds) !== JSON.stringify(current.flowTabIds ?? [])
  if (!changed) return state
  const draft: GlobalDraft = {
    ...current,
    status,
    fields,
    userEdited: {
      ...userEdited,
      ...(restoreJobUrl ? { jobUrl: true as const } : {}),
    },
    jobUrl: restoreJobUrl ? cached.jobUrl : current.jobUrl,
    sourceHost: restoreJobUrl ? cached.sourceHost : current.sourceHost,
    id: restoreJobUrl ? undefined : current.id,
    jobId: restoreJobUrl ? undefined : current.jobId,
    lockedAt: status === 'provisional' ? undefined : current.lockedAt ?? cached.lockedAt,
    submittedAt: status === 'submitted' ? current.submittedAt ?? cached.submittedAt : undefined,
    expiresAt: status === current.status ? current.expiresAt : cached.expiresAt,
    notified: current.notified ?? cached.notified,
    flowTabIds,
    updatedAt: new Date(now).toISOString(),
  }
  return { ...state, draft }
}

export const saveDraft = (
  _state: GlobalDraftState,
  jobUrl: string,
): GlobalDraftState => ({
  draft: undefined,
  suppressedJobUrl: canonicalJobUrlKey(jobUrl),
})
