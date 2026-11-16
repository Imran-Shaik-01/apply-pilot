type CapturedJob = {
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

const normalizeText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).replace(/\s+/g, ' ').trim()
  }

  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean).join(', ')
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const range = [normalizeText(record.minValue), normalizeText(record.maxValue)]
      .filter(Boolean)
      .join('–')
    const content =
      range ||
      normalizeText(record.value) ||
      [
        record.name,
        record['@value'],
        record.addressLocality,
        record.addressRegion,
        record.addressCountry,
        record.streetAddress,
        record.address,
      ]
        .map(normalizeText)
        .filter(Boolean)
        .join(', ')
    const currency = normalizeText(record.currency)
    const unit = normalizeText(record.unitText)
    return [currency, content, unit].filter(Boolean).join(' ')
  }

  return ''
}

const normalizeWorkMode = (value: unknown) => {
  const text = normalizeText(value)
  const code = text.toUpperCase().split(/[/#]/).pop() ?? ''
  if (/(REMOTE|TELECOMMUTE|WORK_FROM_HOME)/.test(code)) return 'Remote'
  if (/HYBRID/.test(code)) return 'Hybrid'
  if (/(ON[-_]?SITE|ON-PREMISES)/.test(code)) return 'On-site'
  return text
}

const normalizeEmploymentType = (value: unknown) => {
  const text = normalizeText(value)
  const labels: Record<string, string> = {
    FULL_TIME: 'Full-time',
    PART_TIME: 'Part-time',
    CONTRACTOR: 'Contract',
    TEMPORARY: 'Temporary',
    INTERN: 'Internship',
    VOLUNTEER: 'Volunteer',
    PER_DIEM: 'Per diem',
  }
  const normalizeCode = (part: string) => {
    const code = part.toUpperCase().replace(/[\s-]+/g, '_')
    return labels[code] ?? part
  }
  return text.split(/,\s*/).map(normalizeCode).join(', ')
}

const isoNow = () => new Date().toISOString()

const safeUrl = (value: string | undefined) => {
  if (!value) return ''
  try {
    const url = new URL(value, window.location.href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
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

const attemptCapture = (): { data: Partial<CapturedJob>; isJobPage: boolean } => {
  const jsonNodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  let structured: Record<string, unknown> | null = null

  for (const node of jsonNodes) {
    const text = node.textContent ?? ''
    if (!text) continue
    try {
      const posting = findJobPosting(JSON.parse(text))
      if (posting) {
        structured = posting
        break
      }
    } catch {
      // Ignore malformed page-provided JSON-LD.
    }
  }

  const meta = (name: string) => {
    const tag = document.querySelector(`meta[name="${name}"]`) ?? document.querySelector(`meta[property="${name}"]`)
    return tag?.getAttribute('content') ?? ''
  }

  const getText = (...selectors: string[]) => {
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (node.closest('[hidden], [aria-hidden="true"]')) continue
        const value = normalizeText(
          node.textContent ||
            node.getAttribute('data-company-name') ||
            node.getAttribute('aria-label') ||
            node.getAttribute('title') ||
            node.getAttribute('alt') ||
            node.getAttribute('content'),
        )
        if (value && value.length <= 300) return value
      }
    }
    return ''
  }

  const structuredTitle = normalizeText(structured?.title) || normalizeText(structured?.headline)
  const strongTitle = getText(
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
    '[data-automation-id="jobPostingHeader"]',
    'h1[itemprop="title"]',
    '[itemprop="title"]',
  )
  const specificTitle =
    strongTitle ||
    getText('.job-title', '.job__title', '.job-title-heading', '.position-title', '.job-details-title')
  const pageHeading = getText('h1')

  const hiringOrganization = structured?.hiringOrganization
  const structuredCompany = normalizeText(
    hiringOrganization && typeof hiringOrganization === 'object'
      ? (hiringOrganization as Record<string, unknown>).name
      : hiringOrganization,
  )
  const company =
    structuredCompany ||
    getText(
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
    /(^|\.)linkedin\.com$|(^|\.)indeed\.com$|(^|\.)glassdoor\.com$|(^|\.)ziprecruiter\.com$|(^|\.)monster\.com$|(^|\.)greenhouse\.io$|(^|\.)lever\.co$|(^|\.)ashbyhq\.com$|(^|\.)smartrecruiters\.com$|(^|\.)workable\.com$|(^|\.)myworkdayjobs\.com$/.test(
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
  const genericHeading = /^(jobs?|careers?|career opportunities|open positions|job openings)$/i.test(pageHeading)
  const jobPath =
    /(?:^|\/)(?:jobs?|positions?|openings?|requisitions?)\/[^/]+/i.test(window.location.pathname) ||
    /\/careers?\/[^/]+\/(?:jobs?|positions?)\/[^/]+/i.test(window.location.pathname)
  const isJobPage = Boolean(
    structured ||
      strongTitle ||
      (jobPath && (specificTitle || pageHeading) && resolvedCompany && !genericHeading),
  )
  const title =
    structuredTitle ||
    specificTitle ||
    (isJobPage && !genericHeading
      ? pageHeading || meta('og:title') || meta('twitter:title')
      : '')

  const locationText =
    normalizeText(structured?.jobLocation) ||
    getText(
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
    document.querySelectorAll('[data-testid="structured-job-summary"] div'),
  )
    .filter((node) => node.childElementCount === 0)
    .map((node) => normalizeText(node.textContent))
    .filter(Boolean)
  const employmentType = normalizeEmploymentType(
    structured?.employmentType ||
      getText(
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
    getText('[data-testid="salary"]', '[data-qa="salary"]', '.salary-range', '.salary', '[itemprop="baseSalary"]')
  const workMode = normalizeWorkMode(
    structured?.jobLocationType ||
      getText(
        '[data-testid="work-mode"]',
        '[data-automation-id="workLocation"]',
        '[data-qa="work-mode"]',
        '.work-mode',
        '.remote-hybrid',
        '.posting-categories .workplaceTypes',
      ) ||
      summaryValues.find((value) => /\b(remote|hybrid|on[- ]?site|on premises)\b/i.test(value)),
  )

  const identifier = structured?.identifier
  const identifierValue =
    identifier && typeof identifier === 'object'
      ? normalizeText((identifier as Record<string, unknown>).value)
      : normalizeText(identifier)
  const jobId =
    identifierValue ||
    document.body.innerText.match(/(REQ[-_ ]?[A-Z0-9]+|JOB[-_ ]?[A-Z0-9]+|[A-Z]{2,}-\d+)/)?.[0] ||
    ''
  const url = safeUrl(window.location.href)
  const source = window.location.hostname
  const now = isoNow()

  return {
    isJobPage,
    data: {
      id: `${source}-${jobId || window.location.hash || Date.now()}`,
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

if (typeof chrome !== 'undefined' && chrome.runtime) {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  let suppressCaptureUntilNavigation = navigation?.type === 'reload'
  let lastSentCapture = ''
  let scanPending = false
  let captureObserver: MutationObserver | undefined
  let mutationTimer = 0

  if (suppressCaptureUntilNavigation) {
    void chrome.runtime.sendMessage({
      type: 'CLEAR_RELOADED_AUTO_CAPTURE',
      payload: { pageUrl: window.location.href },
    }).catch((error: unknown) => {
      console.error('Apply Pilot could not clear the reloaded page draft.', error)
    })
  }

  const autoCapture = () => {
    if (suppressCaptureUntilNavigation) return
    if (scanPending) return
    scanPending = true
    chrome.storage.local.get(['settings'], (stored) => {
      scanPending = false
      const settings = stored.settings as { enabled?: boolean } | undefined
      if (settings?.enabled !== true) return

      const extraction = attemptCapture()
      const capture = extraction.data
      if (!extraction.isJobPage || !capture.title || !capture.company || !capture.url) return

      const payload = {
        title: capture.title,
        company: capture.company,
        location: capture.location ?? '',
        workMode: capture.workMode ?? '',
        salary: capture.salary ?? '',
        employmentType: capture.employmentType ?? '',
        pageUrl: capture.url,
      }
      const signature = JSON.stringify(payload)
      if (signature === lastSentCapture) return
      lastSentCapture = signature
      void chrome.runtime.sendMessage({ type: 'AUTO_CAPTURE_PAGE', payload }).then((response) => {
        if (response?.ok === false) console.error('Apply Pilot could not capture this job page.', response.message)
      }).catch((error: unknown) => {
        console.error('Apply Pilot could not save the detected job-page draft.', error)
      })
    })
  }

  const startAutoCapture = () => {
    if (suppressCaptureUntilNavigation) return
    autoCapture()
    captureObserver?.disconnect()
    captureObserver = new MutationObserver(() => {
      window.clearTimeout(mutationTimer)
      mutationTimer = window.setTimeout(autoCapture, 700)
    })
    captureObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    window.setTimeout(() => captureObserver?.disconnect(), 15000)
  }

  window.setTimeout(startAutoCapture, 500)
  const resumeAutoCaptureAfterNavigation = () => {
    suppressCaptureUntilNavigation = false
    lastSentCapture = ''
    startAutoCapture()
  }
  window.addEventListener('popstate', resumeAutoCaptureAfterNavigation)
  window.addEventListener('hashchange', resumeAutoCaptureAfterNavigation)

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GET_PAGE_CAPTURE') {
      if (suppressCaptureUntilNavigation) {
        sendResponse({ ok: true, data: null, refreshed: true })
        return
      }
      chrome.storage.local.get(['settings'], (stored) => {
        const settings = stored.settings as { enabled?: boolean } | undefined
        if (settings?.enabled !== true) {
          sendResponse({ ok: true, data: null, disabled: true })
          return
        }
        const extraction = attemptCapture()
        sendResponse({ ok: true, data: extraction.isJobPage ? extraction.data : null })
      })
      return true
    }
  })
}
