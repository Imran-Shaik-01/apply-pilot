import type { CapturedJob } from './extract'
import type { DraftCapture } from '../shared/types'

export const createDraftCapture = (
  extraction: {
    data: Partial<CapturedJob>
    isJobPage: boolean
  },
): DraftCapture | undefined => {
  const { data } = extraction
  if (!extraction.isJobPage || (!data.title && !data.company) || !data.url) return undefined

  let sourceHost = ''
  try {
    sourceHost = new URL(data.url).hostname
  } catch {
    return undefined
  }

  return {
    id: data.id,
    jobId: data.jobId,
    fields: {
      title: data.title ?? '',
      company: data.company ?? '',
      location: data.location ?? '',
      workMode: data.workMode ?? '',
      salary: data.salary ?? '',
      employmentType: data.employmentType ?? '',
    },
    jobUrl: data.url,
    sourceHost,
  }
}
