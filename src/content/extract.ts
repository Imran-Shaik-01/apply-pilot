import {
  normalizeEmploymentType,
  normalizeText,
  normalizeWorkMode,
  workModeFromLocation,
} from './normalizers'

export type CapturedJob = {
  id: string
  jobId?: string
  title: string
  company: string
  url: string
  applicationUrl: string
  status: 'Applied'
  source: string
  platform: string
  appliedAt: string
  createdAt: string
  updatedAt: string
  location?: string
  workMode?: string
  salary?: string
  employmentType?: string
}

const isoNow = () => new Date().toISOString()

const canonicalizeJobUrl = (value: string): string => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|trk|trackingid|refid|ref|src|gclid|dclid|fbclid|msclkid|mc_cid|mc_eid|ref_src|ref_url)$/i.test(key)) {
        url.searchParams.delete(key)
      }
    }
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

const getStableJobId = (value: string, jobId?: string): string => {
  try {
    const url = new URL(value)
    const path = url.pathname.replace(/\/+$/, '') || '/'
    return `${url.hostname}-${jobId || path}`
  } catch {
    return ''
  }
}

const safeUrl = (value: string | undefined) => {
  if (!value) return ''
  try {
    return canonicalizeJobUrl(new URL(value, window.location.href).toString())
  } catch {
    return ''
  }
}

const findJobPosting = (value: unknown): Record<string, unknown> | null => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const posting = findJobPosting(item)
      if (posting) return posting
    }
    return null
  }
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const types = (Array.isArray(record['@type']) ? record['@type'] : [record['@type']])
    .map((type) => normalizeText(type).split(/[/#]/).pop())
  if (types.includes('JobPosting')) return record
  return findJobPosting(record['@graph']) ?? findJobPosting(record.mainEntity)
}

const jobIdCache = new Map<string, string>()

const getPageJobId = (url: string, scope: Element) => {
  const cached = jobIdCache.get(url)
  if (cached !== undefined) return cached

  const scopedContent = scope.cloneNode(true) as Element
  for (const node of scopedContent.querySelectorAll(
    'aside, [hidden], [aria-hidden="true"], [class*="recommend" i], [class*="similar" i], [class*="suggest" i], [data-testid*="recommend" i], [data-testid*="similar" i]',
  )) node.remove()
  const jobId = scopedContent.textContent?.match(/(REQ[-_ ]?[A-Z0-9]+|JOB[-_ ]?[A-Z0-9]+|[A-Z]{2,}-\d+)/)?.[0] ?? ''
  if (jobIdCache.size >= 20) {
    const oldestUrl = jobIdCache.keys().next().value
    if (oldestUrl !== undefined) jobIdCache.delete(oldestUrl)
  }
  jobIdCache.set(url, jobId)
  return jobId
}

export const attemptCapture = (): {
  data: Partial<CapturedJob>
  isJobPage: boolean
  strongSignal: boolean
} => {
  const initialMainRegion = document.querySelector('main, [role="main"], article')
  const initialHeading = normalizeText(initialMainRegion?.querySelector('h1, h2')?.textContent)
  const confirmationHeading =
    /^(apply|application)\s+(confirmation|submitted|success)|^thank you for applying/i.test(initialHeading)
  const jsonNodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  let structured: Record<string, unknown> | null = null

  for (const node of confirmationHeading ? [] : jsonNodes) {
    const text = node.textContent ?? ''
    if (!text) continue
    try {
      const posting = findJobPosting(JSON.parse(text))
      if (posting) {
        structured = posting
        break
      }
    } catch {
      continue
    }
  }

  const meta = (name: string) => {
    const tag = document.querySelector(`meta[name="${name}"]`) ?? document.querySelector(`meta[property="${name}"]`)
    return tag?.getAttribute('content') ?? ''
  }

  const isExcluded = (node: Element) =>
    Boolean(node.closest(
      '[hidden], [aria-hidden="true"], aside, [class*="recommend"], [class*="similar"], [data-testid*="recommend"], [data-testid*="similar"]',
    ))

  const getText = (root: ParentNode, ...selectors: string[]) => {
    for (const selector of selectors) {
      for (const node of root.querySelectorAll(selector)) {
        if (isExcluded(node)) continue
        const value = normalizeText(
          node.textContent ||
            node.getAttribute('data-company-name') ||
            node.getAttribute('aria-label') ||
            node.getAttribute('title') ||
            node.getAttribute('alt') ||
            node.getAttribute('content'),
        )
        if (value && value.length <= 500) return value
      }
    }
    return ''
  }

  const getTextNode = (root: ParentNode, ...selectors: string[]) => {
    for (const selector of selectors) {
      for (const node of root.querySelectorAll(selector)) {
        if (isExcluded(node)) continue
        const text = normalizeText(
          node.textContent ||
            node.getAttribute('aria-label') ||
            node.getAttribute('title') ||
            node.getAttribute('content'),
        )
        if (text && text.length <= 500) return node
      }
    }
    return null
  }

  const structuredTitle = normalizeText(structured?.title) || normalizeText(structured?.headline)
  const titleSearchRoot = document.querySelector('main, [role="main"], article') ?? document
  const strongTitleNode = getTextNode(titleSearchRoot,
    '[data-testid="job-title"]',
    '[data-test="job-title"]',
    '[data-automation-id="jobPostingHeader"]',
    '[data-automation-id="jobTitle"]',
    '[data-qa="job-title"]',
    '.jobs-details__header h1',
    '.top-card-layout__title',
    '.topcard__title',
    '[data-testid="jobsearch-JobInfoHeader-title"]',
    '[data-testid="vj-job-title"]',
    '.jobsearch-JobInfoHeader-title',
    '.app-title',
    '.opening-title',
    '.posting-headline h1',
    '.posting-headline h2',
    '.posting-headline h3',
    'h1[itemprop="title"]',
    '[itemprop="title"]',
  )
  const strongTitle = normalizeText(strongTitleNode?.textContent)
  const structuredRegion = document.querySelector(
    '[itemtype*="JobPosting"], [data-testid*="job-detail"], [class*="job-detail"], [class*="jd-container"]',
  )
  const mainRegion = document.querySelector('main, [role="main"], article')
  const titleMainRegion = strongTitleNode?.closest('main, [role="main"], article')
  const titleContainer = strongTitleNode?.closest(
    'article, [itemtype*="JobPosting"], [data-testid*="job-detail"], [class*="job-detail"], [class*="jobDetail"], [class*="jd-container"], [class*="job-description"]',
  )
  const captureScope =
    titleContainer ??
    titleMainRegion ??
    structuredRegion ??
    mainRegion ??
    strongTitleNode?.parentElement ??
    document.body
  const scopedText = (...selectors: string[]) => getText(captureScope, ...selectors)
  const specificTitle =
    strongTitle ||
    scopedText('.job-title', '.job__title', '.job-title-heading', '.position-title', '.job-details-title')
  const pageHeading = scopedText('h1')

  const hiringOrganization = structured?.hiringOrganization
  const structuredCompany = normalizeText(
    hiringOrganization && typeof hiringOrganization === 'object'
      ? (hiringOrganization as Record<string, unknown>).name
      : hiringOrganization,
  )
  const company =
    structuredCompany ||
    scopedText(
      '[data-testid="company-name"]',
      '[data-test="company-name"]',
      '[data-automation-id="jobPostingCompany"]',
      '[data-automation-id="company"]',
      '[data-qa="company-name"]',
      '.company-name',
      '.jobs-company',
      '.job-details-company',
      '.topcard__org-name-link',
      '.top-card-layout__second-subline a',
      '[data-testid="inlineHeader-companyName"]',
      'a[href*="/cmp/"]',
      '.jobsearch-InlineCompanyRating a',
      '.job-company-name',
      '.main-header-logo img',
      '[data-company-name]',
      '[itemprop="hiringOrganization"] [itemprop="name"]',
    )

  const hostname = window.location.hostname.toLowerCase()
  const isJobBoardHost =
    /(^|\.)linkedin\.com$|(^|\.)indeed\.com$|(^|\.)glassdoor\.com$|(^|\.)ziprecruiter\.com$|(^|\.)monster\.com$|(^|\.)greenhouse\.io$|(^|\.)lever\.co$|(^|\.)ashbyhq\.com$|(^|\.)smartrecruiters\.com$|(^|\.)workable\.com$|(^|\.)myworkdayjobs\.com$|(^|\.)naukri\.com$|(^|\.)foundit\.(in|com)$|(^|\.)wellfound\.com$|(^|\.)internshala\.com$/.test(
      hostname,
    )
  const isAtsHost =
    /(^|\.)greenhouse\.io$|(^|\.)lever\.co$|(^|\.)ashbyhq\.com$|(^|\.)smartrecruiters\.com$|(^|\.)workable\.com$/.test(
      hostname,
    )
  const siteCompany = isJobBoardHost ? '' : normalizeText(meta('og:site_name'))
  const atsSlug = (() => {
    if (!isAtsHost) return ''
    const slug = window.location.pathname.split('/').filter(Boolean)[0]
    if (!slug || /^(jobs?|careers?|apply|view|company)$/i.test(slug)) return ''
    try {
      return decodeURIComponent(slug)
        .replace(/[-_]+/g, ' ')
        .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    } catch {
      return ''
    }
  })()
  const resolvedCompany = company || siteCompany || atsSlug
  const genericHeading =
    /^(jobs?|careers?|career opportunities|open positions|job openings|apply confirmation|application confirmation|application submitted|thank you)$/i.test(pageHeading)
  const jobPath =
    /(?:^|\/)(?:jobs?|positions?|openings?|requisitions?)\/[^/]+/i.test(window.location.pathname) ||
    /\/careers?\/[^/]+\/(?:jobs?|positions?)\/[^/]+/i.test(window.location.pathname)
  const isJobPage = Boolean(
    !confirmationHeading && (
    structured ||
      strongTitle ||
      (jobPath && (specificTitle || pageHeading) && resolvedCompany && !genericHeading)
    ),
  )
  const strongSignal = Boolean(structured || strongTitle)
  const title =
    structuredTitle ||
    specificTitle ||
    (isJobPage && !genericHeading
      ? pageHeading || meta('og:title') || meta('twitter:title')
      : '')

  const locationText =
    normalizeText(structured?.jobLocation) ||
    scopedText(
      '[data-testid="job-location"]',
      '[data-automation-id="locations"]',
      '[data-qa="job-location"]',
      '[data-testid="company-info-metadata"] > div > div:nth-child(2)',
      '.job-location',
      '.jobs-details__location',
      '.topcard__flavor--bullet',
      '.jobsearch-JobInfoHeader-subtitle div:nth-child(2)',
      '.posting-categories .location',
      '.location',
      '[itemprop="jobLocation"]',
    ) ||
    ''
  const summaryValues = Array.from(
    captureScope.querySelectorAll('[data-testid="structured-job-summary"] div'),
  )
    .filter((node) => !isExcluded(node))
    .filter((node) => node.childElementCount === 0)
    .map((node) => normalizeText(node.textContent))
    .filter(Boolean)
  const employmentType = normalizeEmploymentType(
    structured?.employmentType ||
      scopedText(
        '[data-testid="employment-type"]',
        '[data-automation-id="jobType"]',
        '[data-qa="employment-type"]',
        '.employment-type',
        '.job-type',
        '.posting-categories .commitment',
        '[data-testid="job-type"]',
      ) ||
      summaryValues.find((value) =>
        /^(full[- ]time|part[- ]time|contract(?:or)?|temporary|internship|permanent|seasonal|freelance|casual)$/i.test(
          value,
        ),
      ),
  )
  const salary =
    normalizeText(structured?.baseSalary) ||
    scopedText('[data-testid="salary"]', '[data-qa="salary"]', '.salary-range', '.salary', '[itemprop="baseSalary"]')
  const workModeValue =
    structured?.jobLocationType ||
      scopedText(
        '[data-testid="work-mode"]',
        '[data-automation-id="workLocation"]',
        '[data-qa="work-mode"]',
        '.work-mode',
        '.remote-hybrid',
        '.posting-categories .workplaceTypes',
      ) ||
      summaryValues.find((value) => /\b(remote|hybrid|on[- ]?site|on premises)\b/i.test(value))
  const workMode =
    normalizeWorkMode(workModeValue) ||
    workModeFromLocation(locationText)

  const identifier = structured?.identifier
  const identifierValue =
    identifier && typeof identifier === 'object'
      ? normalizeText((identifier as Record<string, unknown>).value)
      : normalizeText(identifier)
  const jobId = identifierValue || (isJobPage ? getPageJobId(window.location.href, captureScope) : '')
  const pageUrl = new URL(window.location.href)
  let url = safeUrl(window.location.href)
  const structuredUrl = normalizeText(structured?.url)
  if (structuredUrl) {
    try {
      const candidate = new URL(structuredUrl, pageUrl)
      const currentPath = pageUrl.pathname.replace(/\/+$/, '')
      const candidatePath = candidate.pathname.replace(/\/+$/, '')
      const currentIdentity = `${pageUrl.pathname}${pageUrl.search}`.toLowerCase()
      const candidateIdentity = `${candidate.pathname}${candidate.search}`.toLowerCase()
      const structuredIdInBoth = identifierValue &&
        currentIdentity.includes(identifierValue.toLowerCase()) &&
        candidateIdentity.includes(identifierValue.toLowerCase())
      const matchingJobParameter = [
        'currentJobId',
        'jk',
        'gh_jid',
        'jobId',
        'reqId',
        'requisitionId',
      ].some((key) => {
        const currentValue = pageUrl.searchParams.get(key)
        return currentValue !== null && candidate.searchParams.get(key) === currentValue
      })
      const idInCandidate = structuredIdInBoth || matchingJobParameter
      if (
        candidate.origin === pageUrl.origin &&
        (currentPath === candidatePath || idInCandidate)
      ) {
        url = canonicalizeJobUrl(candidate.toString())
      }
    } catch {
      url = safeUrl(window.location.href)
    }
  }
  const source = window.location.hostname
  const now = isoNow()

  return {
    isJobPage,
    strongSignal,
    data: {
      id: getStableJobId(url, jobId || undefined),
      jobId: jobId || undefined,
      title,
      company: resolvedCompany,
      url,
      applicationUrl: url,
      status: 'Applied',
      source,
      platform: source,
      location: locationText || undefined,
      workMode: workMode || undefined,
      employmentType: employmentType || undefined,
      salary: salary || undefined,
      appliedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  }
}
