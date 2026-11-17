import { canonicalizeJobUrl } from '../shared/utils'
import type { DraftField, GlobalDraft } from '../shared/types'

export const mergeVerifiedDraft = (
  local: GlobalDraft | undefined,
  remote: GlobalDraft,
  pendingEdits: Map<DraftField, string>,
) => {
  const differentJobIds = Boolean(local?.jobId && remote.jobId && local.jobId !== remote.jobId)
  if (
    !local ||
    differentJobIds ||
    (
      canonicalizeJobUrl(local.jobUrl) !== canonicalizeJobUrl(remote.jobUrl) &&
      canonicalizeJobUrl(local.currentPageUrl) !== canonicalizeJobUrl(remote.currentPageUrl)
    )
  ) {
    return remote
  }

  const fields = { ...remote.fields }
  const userEdited = { ...remote.userEdited }
  const localIsNewer = Date.parse(local.updatedAt) > Date.parse(remote.updatedAt)
  const hasUnpersistedLocalEdit = Object.entries(local.userEdited).some(
    ([field, edited]) => edited && !remote.userEdited[field as DraftField],
  )
  for (const field of [
    'title',
    'company',
    'location',
    'workMode',
    'salary',
    'employmentType',
  ] as const) {
    if (
      pendingEdits.has(field) ||
      (local.userEdited[field] && (!remote.userEdited[field] || localIsNewer))
    ) {
      fields[field] = pendingEdits.get(field) ?? local.fields[field]
    }
    if (local.userEdited[field] || remote.userEdited[field]) userEdited[field] = true
  }

  const jobUrlEdited = pendingEdits.has('jobUrl') || (
    local.userEdited.jobUrl &&
    (!remote.userEdited.jobUrl || localIsNewer)
  )
  return {
    ...remote,
    status: localIsNewer || hasUnpersistedLocalEdit ? local.status : remote.status,
    fields,
    userEdited: {
      ...userEdited,
      ...(local.userEdited.jobUrl ? { jobUrl: true as const } : {}),
    },
    jobUrl: jobUrlEdited
      ? pendingEdits.get('jobUrl') ?? local.jobUrl
      : remote.jobUrl,
    sourceHost: jobUrlEdited ? local.sourceHost : remote.sourceHost,
  }
}
