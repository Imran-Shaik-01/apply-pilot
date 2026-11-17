export const safeUrl = (value: string | undefined): string => {
  if (!value) return ''
  try {
    const candidate = new URL(value)
    return candidate.protocol === 'http:' || candidate.protocol === 'https:'
      ? candidate.toString()
      : ''
  } catch {
    return ''
  }
}

export const canonicalizeJobUrl = (value: string): string => {
  const parsed = safeUrl(value)
  if (!parsed) return ''

  const url = new URL(parsed)
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|trk|trackingid|refid|ref|src|gclid|dclid|fbclid|msclkid|mc_cid|mc_eid|ref_src|ref_url)$/i.test(key)) {
      url.searchParams.delete(key)
    }
  }
  url.hash = ''
  return url.toString()
}

export const getStableJobId = (value: string, jobId?: string): string => {
  const parsed = safeUrl(value)
  if (!parsed) return ''

  const url = new URL(parsed)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  return `${url.hostname}-${jobId || path}`
}

export const normalizeText = (value: string | undefined): string => {
  if (!value) return ''
  return value.replace(/\s+/g, ' ').trim()
}

export const isoNow = () => new Date().toISOString()

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))

export const getWeekStart = (date: Date, startDay = 1) => {
  const copy = new Date(date)
  const day = copy.getDay()
  const diff = (day - startDay + 7) % 7
  copy.setDate(copy.getDate() - diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export const getAppSummary = (jobs: Array<{ appliedAt: string }>, weekStartDay = 1) => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = getWeekStart(now, weekStartDay)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  return {
    total: jobs.length,
    today: jobs.filter((job) => new Date(job.appliedAt) >= today).length,
    week: jobs.filter((job) => new Date(job.appliedAt) >= weekStart).length,
    month: jobs.filter((job) => new Date(job.appliedAt) >= monthStart).length,
  }
}
