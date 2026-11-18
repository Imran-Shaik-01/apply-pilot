import {
  normalizeEmploymentType,
  normalizeText,
  normalizeWorkMode,
  isApplicationConfirmation,
  workModeFromLocation,
} from './normalizers'
import { siteHints } from './site-hints'

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

type JobRecord = {
  title: string
  company: string
  location: string
  workMode: string
  salary: string
  employmentType: string
  id: string
  url: string
}

type TitlePattern = {
  title: string
  company: string
}

const isoNow = () => new Date().toISOString()
const embeddedJsonLimit = 2 * 1024 * 1024
const genericTitles = /^(jobs?|careers?|career opportunities|open positions|job openings|home|apply|apply confirmation|application confirmation|application submitted|thank you)$/i
const genericPathSegments = /^(jobs?|careers?|apply|view|company|companies|positions?|openings?|requisitions?|roles?|postings?|search)$/i
const trackingParameter = /^(utm_.+|trk|trackingid|tracking_id|refid|ref_id|ref|src|source|gclid|dclid|fbclid|msclkid|mc_cid|mc_eid|ref_src|ref_url)$/i
const jobIdentityParameters = ['currentJobId', 'jk', 'gh_jid', 'jobId', 'reqId', 'requisitionId']
const excludedMarker =
  /recommend|similar|related|suggest|other[-_\s]?jobs|jobs-at|you[-_\s]?might[-_\s]?like/i
const recommendationHeading = /^(?:jobs you might like|recommended jobs|similar jobs|related jobs|other jobs)$/i
const companyPath = /\/(?:company|companies|cmp|employer|org)\//i
const jobPathPattern =
  /(?:^|\/)(?:jobs?|positions?|openings?|requisitions?)\/[^/]+|(?:^|\/)careers?\/[^/]+(?:\/[^/]+)+/i

const canonicalizeJobUrl = (value: string): string => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    for (const key of [...url.searchParams.keys()]) {
      if (trackingParameter.test(key)) url.searchParams.delete(key)
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

const normalizedKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const valueForKeys = (value: unknown, keys: string[]): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const wanted = new Set(keys.map(normalizedKey))
  const entry = Object.entries(record).find(([key]) => wanted.has(normalizedKey(key)))
  return entry?.[1]
}

const recordText = (value: unknown, keys: string[]): string => {
  const found = valueForKeys(value, keys)
  if (found && typeof found === 'object' && !Array.isArray(found)) {
    const namedValue = valueForKeys(found, ['name', 'value', 'text', 'label'])
    if (namedValue !== undefined) return normalizeText(namedValue)
  }
  return normalizeText(found)
}

const readJobRecord = (value: Record<string, unknown>): JobRecord => {
  const organization =
    valueForKeys(value, ['hiringOrganization', 'company', 'companyName', 'employer', 'organization'])
  const organizationName =
    organization && typeof organization === 'object'
      ? recordText(organization, ['name', 'companyName', 'legalName'])
      : normalizeText(organization)
  const identifier = valueForKeys(value, ['identifier', 'jobId', 'jobPostingId', 'requisitionId', 'id'])
  const jobId = identifier && typeof identifier === 'object'
    ? recordText(identifier, ['value', 'name', 'propertyID'])
    : normalizeText(identifier)
  const salary = valueForKeys(value, ['baseSalary', 'salary', 'compensation', 'pay'])

  return {
    title: recordText(value, ['title', 'jobTitle', 'positionTitle', 'name']),
    company: organizationName,
    location: recordText(value, ['jobLocation', 'location', 'address']),
    workMode: recordText(value, ['jobLocationType', 'workMode', 'workplaceType']),
    salary: normalizeText(salary),
    employmentType: recordText(value, ['employmentType', 'jobType', 'employment']),
    id: jobId,
    url: recordText(value, ['url']),
  }
}

const collectTypedRecords = (value: unknown, typeName: string): Record<string, unknown>[] => {
  if (Array.isArray(value)) return value.flatMap((item) => collectTypedRecords(item, typeName))
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const typeValue = record['@type']
  const types = (Array.isArray(typeValue) ? typeValue : [typeValue])
    .map((type) => normalizeText(type).split(/[/#]/).pop()?.toLowerCase())
  const matching = types.includes(typeName.toLowerCase()) ? [record] : []
  return matching.concat(
    Object.values(record).flatMap((nested) => collectTypedRecords(nested, typeName)),
  )
}

const collectJsonLdRecords = (): JobRecord[] => {
  const records: JobRecord[] = []
  for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
    const text = node.textContent ?? ''
    if (!text || text.length > embeddedJsonLimit) continue
    try {
      records.push(...collectTypedRecords(JSON.parse(text), 'JobPosting').map(readJobRecord))
    } catch {
      // Malformed page-provided JSON is ignored; other extraction layers remain available.
    }
  }
  return records
}

const isVisible = (node: Element) => {
  if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return false
  const style = node.getAttribute('style') ?? ''
  return !/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(style)
}

const hasExcludedMarker = (node: Element) =>
  ['class', 'id', 'data-testid', 'data-test', 'data-qa'].some((attribute) =>
    excludedMarker.test(node.getAttribute(attribute) ?? ''),
  )

const isExcluded = (node: Element) => {
  let current: Element | null = node
  while (current) {
    const tagName = current.tagName.toLowerCase()
    if (['aside', 'nav', 'footer'].includes(tagName)) return true
    if (!isVisible(current) || hasExcludedMarker(current)) return true
    if (tagName === 'header' && !current.querySelector('h1')) return true
    const sectionHeading = Array.from(current.children).find((child) =>
      ['H2', 'H3'].includes(child.tagName),
    )
    if (sectionHeading && recommendationHeading.test(normalizeText(sectionHeading.textContent))) {
      return true
    }
    current = current.parentElement
  }
  return false
}

const elementValue = (node: Element) =>
  normalizeText(
    node.getAttribute('content') ||
      node.getAttribute('value') ||
      node.getAttribute('datetime') ||
      node.getAttribute('data-company-name') ||
      node.getAttribute('data-company') ||
      node.getAttribute('data-employer') ||
      node.getAttribute('aria-label') ||
      node.getAttribute('title') ||
      node.getAttribute('alt') ||
      node.textContent,
  )

const readHint = (
  root: ParentNode,
  selectors: readonly string[],
  accept: (value: string) => boolean = () => true,
) => {
  for (const selector of selectors) {
    for (const node of root.querySelectorAll(selector)) {
      if (isExcluded(node)) continue
      const value = elementValue(node)
      if (value && accept(value)) return value
    }
  }
  return ''
}

const firstValid = (
  values: unknown[],
  validate: (value: unknown) => string,
) => {
  for (const value of values) {
    const result = validate(value)
    if (result) return result
  }
  return ''
}

const safeRead = <T>(field: string, read: () => T, fallback: T): T => {
  try {
    return read()
  } catch (error) {
    console.error(`Apply Pilot could not extract the ${field} field.`, error)
    return fallback
  }
}

const safeField = (field: string, read: () => string) => safeRead(field, read, '')

const firstVisibleHeading = () => {
  const roots = Array.from(document.querySelectorAll('main, [role="main"], article'))
  for (const root of roots) {
    const heading = Array.from(root.querySelectorAll('h1')).find((node) =>
      isVisible(node) && !isExcluded(node),
    )
    if (heading) return heading
  }
  return Array.from(document.querySelectorAll('h1')).find((node) =>
    isVisible(node) && !isExcluded(node),
  ) ?? null
}

const jobIdCache = new Map<string, string>()

const hasApplyControl = (root: Element) =>
  Array.from(root.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]'))
    .some((node) => !isExcluded(node) && /\bapply\b/i.test(elementValue(node)))

const hasLongDescription = (root: Element) =>
  Array.from(root.querySelectorAll('[itemprop="description"], article, section, div'))
    .some((node) => !isExcluded(node) && normalizeText(node.textContent).length >= 500)

const findCaptureScope = (heading: Element | null) => {
  const mainRoot =
    heading?.closest('main, [role="main"], article') ??
    document.querySelector('main, [role="main"], article')
  if (!heading) return mainRoot ?? document.body

  let current = heading.parentElement
  while (current && current !== document.body && current !== document.documentElement) {
    if (!isExcluded(current) && (hasApplyControl(current) || hasLongDescription(current))) {
      return current
    }
    if (current === mainRoot) break
    current = current.parentElement
  }
  return heading.closest(
    '[itemtype*="JobPosting" i], article, [data-testid*="job-detail" i], [class*="job-detail" i], [class*="jd-container" i], [class*="job-description" i]',
  ) ?? mainRoot ?? heading.parentElement ?? document.body
}

const firstMicrodataElement = (root: ParentNode, property: string) =>
  Array.from(root.querySelectorAll(`[itemprop~="${property}"], [property~="${property}"]`))
    .find((node) => !isExcluded(node)) ?? null

const microdataValue = (root: ParentNode, property: string) => {
  const node = firstMicrodataElement(root, property)
  return node ? elementValue(node) : ''
}

const microdataRecord = (): JobRecord | undefined => {
  const roots = safeRead('microdata', () =>
    Array.from(document.querySelectorAll(
      '[itemtype*="JobPosting" i], [typeof*="JobPosting" i]',
    ))
      .filter((node) => !isExcluded(node)),
    [] as Element[],
  )
  const root = roots[0]
  if (!root) return undefined

  const company = safeField('company', () => {
    const organization = firstMicrodataElement(root, 'hiringOrganization')
    return organization
      ? microdataValue(organization, 'name') || elementValue(organization)
      : microdataValue(root, 'company')
  })
  const location = safeField('location', () => {
    const address = firstMicrodataElement(root, 'jobLocation')
    return address
      ? [
          microdataValue(address, 'streetAddress'),
          microdataValue(address, 'addressLocality'),
          microdataValue(address, 'addressRegion'),
          microdataValue(address, 'postalCode'),
          microdataValue(address, 'addressCountry'),
        ].filter(Boolean).join(', ') || elementValue(address)
      : ''
  })
  const salary = safeField('salary', () => {
    const salaryRoot = firstMicrodataElement(root, 'baseSalary')
    return salaryRoot ? elementValue(salaryRoot) : ''
  })

  return {
    title: safeField('title', () => microdataValue(root, 'title')),
    company,
    location,
    workMode: safeField('work mode', () => microdataValue(root, 'jobLocationType')),
    salary,
    employmentType: safeField('employment type', () => microdataValue(root, 'employmentType')),
    id: safeField('job identifier', () => microdataValue(root, 'identifier')),
    url: safeField('posting URL', () => microdataValue(root, 'url')),
  }
}

const comparableText = (value: string) => normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, '')

const recordId = (record: JobRecord) => record.id || record.url

const recordScore = (record: JobRecord, heading: string, documentTitle: string, pageUrl: string) => {
  const title = comparableText(record.title)
  let score = 0
  if (title && title === comparableText(heading)) score += 4
  if (title && title === comparableText(documentTitle)) score += 3
  if (title && documentTitle && comparableText(documentTitle).startsWith(title)) score += 2
  const id = recordId(record)
  if (id && pageUrl.toLowerCase().includes(id.toLowerCase())) score += 5
  return score
}

const embeddedRecords = (heading: string, documentTitle: string, pageUrl: string) => {
  const candidates: JobRecord[] = []
  for (const node of document.querySelectorAll('script')) {
    const type = (node.getAttribute('type') ?? '').toLowerCase()
    const id = (node.getAttribute('id') ?? '').toLowerCase()
    if (
      !type.includes('json') &&
      !/__next_data__|initial[_-]?state|application[_-]?data/.test(id)
    ) continue
    const text = node.textContent ?? ''
    if (!text || text.length > embeddedJsonLimit) continue
    try {
      const objects: Record<string, unknown>[] = []
      const collect = (value: unknown) => {
        if (Array.isArray(value)) {
          value.forEach(collect)
        } else if (value && typeof value === 'object') {
          const record = value as Record<string, unknown>
          const candidate = readJobRecord(record)
          if (candidate.title && candidate.company) objects.push(record)
          Object.values(record).forEach(collect)
        }
      }
      collect(JSON.parse(text))
      candidates.push(...objects.map(readJobRecord))
    } catch {
      // Inline app data is optional and may contain unrelated script text.
    }
  }
  return candidates
    .map((record) => ({ record, score: recordScore(record, heading, documentTitle, pageUrl) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .map(({ record }) => record)[0]
}

const hostBrand = (hostname: string) => {
  const labels = hostname.toLowerCase().split('.').filter(Boolean)
  if (labels.length < 2) return labels[0] ?? ''
  const suffix = labels.slice(-2).join('.')
  const compoundSuffixes = new Set([
    'co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au', 'org.au', 'co.nz',
    'com.br', 'com.cn', 'com.sg', 'co.in', 'co.jp', 'com.mx',
  ])
  return labels[compoundSuffixes.has(suffix) ? labels.length - 3 : labels.length - 2] ?? labels[0]
}

const normalizedBrand = (value: string) => comparableText(value)

const parseTitlePattern = (value: string, hostname: string): TitlePattern => {
  let title = normalizeText(value)
  const suffixes = [hostBrand(hostname), ...siteHints.siteNameSuffixes].filter(Boolean)
  for (const suffix of suffixes) {
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    title = title.replace(new RegExp(`\\s*[|–—-]\\s*${escaped}\\s*$`, 'i'), '').trim()
  }
  if (!title || title.length > 150 || genericTitles.test(title)) return { title: '', company: '' }

  const atPattern = title.match(/^(.+?)\s+at\s+(.+)$/i)
  if (atPattern && atPattern[1].length <= 150 && atPattern[2].length <= 150) {
    const companyParts = atPattern[2].split(/\s*[•·]\s*/)
    const company = companyParts[0].trim()
    if (/[|–—]|\s-\s/.test(company)) {
      return { title: atPattern[1].trim(), company: '' }
    }
    return {
      title: atPattern[1].trim(),
      company,
    }
  }

  const separators = [...title.matchAll(/\s*(\||–|—|\s-\s)\s*/g)]
  if (separators.length > 1) {
    const firstSeparator = separators[0].index ?? title.length
    const role = title.slice(0, firstSeparator).trim()
    return role.length <= 150 && !genericTitles.test(role)
      ? { title: role, company: '' }
      : { title: '', company: '' }
  }
  if (separators.length !== 1) return { title, company: '' }
  const splitAt = separators[0].index ?? -1
  const separatorLength = separators[0][0].length
  const role = title.slice(0, splitAt).trim()
  const company = title.slice(splitAt + separatorLength).trim()
  if (
    !role ||
    !company ||
    role.length > 150 ||
    company.length > 150 ||
    genericTitles.test(role) ||
    genericTitles.test(company)
  ) return { title: '', company: '' }
  return { title: role, company }
}

const validTitle = (value: unknown) => {
  const text = normalizeText(value)
  return text.length <= 500 && !genericTitles.test(text) ? text : ''
}

const validCompany = (value: unknown) => {
  const text = normalizeText(value)
  return text.length <= 150 &&
    text.length >= 2 &&
    !/^\d+$/.test(text) &&
    !/^(?:remote|hybrid|on[\s-]?site|on premises|full[\s-]?time|part[\s-]?time)$/i.test(text) &&
    !genericTitles.test(text) &&
    !/[.!?].*[.!?]/.test(text)
    ? text
    : ''
}

const validLocation = (value: unknown) => {
  const text = normalizeText(value)
  return text.length <= 120 && !/(?:[.!?].*){2}/.test(text) ? text : ''
}

const validEmploymentType = (value: unknown) => {
  const text = normalizeEmploymentType(value)
  return /^(full[\s-]?time|part[\s-]?time|contract(?:or|ual)?|temporary|intern(?:ship)?|permanent|freelance|seasonal|casual|volunteer|fixed[\s-]?term|per[\s-]?diem)(?:\s*(?:,|\/|&|\+)\s*(full[\s-]?time|part[\s-]?time|contract(?:or|ual)?|temporary|intern(?:ship)?|permanent|freelance|seasonal|casual|volunteer|fixed[\s-]?term|per[\s-]?diem))*$/i.test(text)
    ? text
    : ''
}

const validWorkMode = (value: unknown) => {
  const raw = normalizeText(value)
  const text = normalizeWorkMode(value)
  const modes = [
    /remote|telecommute|work from home/i.test(raw),
    /hybrid/i.test(raw),
    /on[\s_-]?site|on[\s_-]?premises|in office|office based/i.test(raw),
  ].filter(Boolean).length
  if (modes !== 1) return ''
  if (/remote|telecommute|work from home/i.test(text)) return 'Remote'
  if (/hybrid/i.test(text)) return 'Hybrid'
  return 'On-site'
}

const validSalary = (value: unknown) => {
  const text = normalizeText(value)
  if (!/\d/.test(text)) return ''
  return /[$€£₹]|\b(?:USD|EUR|GBP|INR|CAD|AUD|SGD|Rs\.?|LPA|Lacs?|Lakhs?|K|per\s+(?:year|hour|month)|annually|hourly|yearly)\b|\b\d+(?:[.,]\d+)?\s*k\b/i.test(text)
    ? text
    : ''
}

const labeledValue = (
  root: ParentNode,
  labels: string[],
  accept: (value: string) => boolean = (value) => Boolean(value),
) => {
  const labelPattern = new RegExp(`^(?:${labels.join('|')})$`, 'i')
  const directPattern = new RegExp(`^(?:${labels.join('|')})\\s*[:\\-–]\\s*(.+)$`, 'i')

  for (const node of root.querySelectorAll('dt, th, [data-label], [class*="label" i]')) {
    if (isExcluded(node)) continue
    const label = normalizeText(node.getAttribute('data-label') || node.textContent)
    if (!labelPattern.test(label)) continue
    const value = node.nextElementSibling
    if (value && !isExcluded(value)) {
      const text = elementValue(value)
      if (text && accept(text)) return text
    }
  }

  for (const node of root.querySelectorAll('div, li, tr, [role="row"], [class*="row" i], [class*="detail" i]')) {
    if (
      isExcluded(node) ||
      node.tagName.toLowerCase() === 'p' ||
      normalizeText(node.textContent).length > 250
    ) continue
    const text = normalizeText(node.textContent)
    const match = text.match(directPattern)
    if (match?.[1]) {
      const value = normalizeText(match[1])
      if (accept(value)) return value
    }
  }
  return ''
}

const summaryValues = (root: ParentNode) =>
  siteHints.summary.flatMap((selector) =>
    Array.from(root.querySelectorAll(selector))
      .filter((node) => !isExcluded(node) && node.childElementCount === 0)
      .map((node) => normalizeText(node.textContent))
      .filter(Boolean),
  )

const semanticCompany = (root: ParentNode) => {
  const dataCompany = readHint(root, [
    '[data-company-name]',
    '[data-company]',
    '[data-employer]',
    '[data-testid*="company" i]',
    '[data-testid*="employer" i]',
    '[itemprop="hiringOrganization"] [itemprop="name"]',
    '[itemprop="hiringOrganization"]',
  ], (value) => Boolean(validCompany(value)))
  if (dataCompany) return dataCompany

  for (const link of root.querySelectorAll('a[href]')) {
    if (isExcluded(link)) continue
    const href = link.getAttribute('href') ?? ''
    const value = elementValue(link)
    if (validCompany(value) && companyPath.test(href)) return value
  }
  return ''
}

const genericSlugCompany = (pathname: string) => {
  const firstSegment = pathname.split('/').filter(Boolean)[0]
  if (!firstSegment || firstSegment.length < 2 || /^\d+$/.test(firstSegment) || genericPathSegments.test(firstSegment)) return ''
  try {
    return decodeURIComponent(firstSegment)
      .replace(/[-_]+/g, ' ')
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
  } catch {
    return ''
  }
}

const getPageJobId = (url: string, scope: Element) => {
  const cached = jobIdCache.get(url)
  if (cached !== undefined) return cached
  const scopedContent = scope.cloneNode(true) as Element
  for (const node of scopedContent.querySelectorAll(
    'aside, nav, footer, [hidden], [aria-hidden="true"], [class*="recommend" i], [class*="similar" i], [class*="related" i], [class*="suggest" i], [class*="other-jobs" i], [class*="might-like" i], [class*="jobs-at" i]',
  )) node.remove()
  const jobId = scopedContent.textContent?.match(/(REQ[-_ ]?[A-Z0-9]+|JOB[-_ ]?[A-Z0-9]+|[A-Z]{2,}-\d+)/)?.[0] ?? ''
  const result = jobId || url.match(/(?:jobs?|positions?|openings?)\/(\d+)(?:[-/]|$)/i)?.[1] || ''
  if (jobIdCache.size >= 20) {
    const oldestUrl = jobIdCache.keys().next().value
    if (oldestUrl !== undefined) jobIdCache.delete(oldestUrl)
  }
  jobIdCache.set(url, result)
  return result
}

const structuredUrlMatchesCurrentPage = (
  structuredUrl: string,
  jobId: string,
  pageUrl: URL,
) => {
  if (!structuredUrl) return ''
  try {
    const candidate = new URL(structuredUrl, pageUrl)
    if (candidate.origin !== pageUrl.origin) return ''
    const currentPath = pageUrl.pathname.replace(/\/+$/, '')
    const candidatePath = candidate.pathname.replace(/\/+$/, '')
    const currentIdentity = `${pageUrl.pathname}${pageUrl.search}`.toLowerCase()
    const candidateIdentity = `${candidate.pathname}${candidate.search}`.toLowerCase()
    const idMatches =
      jobId &&
      currentIdentity.includes(jobId.toLowerCase()) &&
      candidateIdentity.includes(jobId.toLowerCase())
    const matchingJobParameter = jobIdentityParameters.some((key) => {
      const currentValue = pageUrl.searchParams.get(key)
      return currentValue !== null && candidate.searchParams.get(key) === currentValue
    })
    return currentPath === candidatePath || idMatches || matchingJobParameter
      ? canonicalizeJobUrl(candidate.toString())
      : ''
  } catch {
    return ''
  }
}

export const attemptCapture = (): {
  data: Partial<CapturedJob>
  isJobPage: boolean
  strongSignal: boolean
} => {
  const pageUrl = new URL(window.location.href)
  const currentUrl = canonicalizeJobUrl(pageUrl.toString())
  const hostname = pageUrl.hostname.toLowerCase()
  const heading = firstVisibleHeading()
  const headingText = normalizeText(heading?.textContent)
  const titleElement = document.querySelector('title')
  const documentTitle = normalizeText(titleElement?.textContent)
  const meta = (name: string) => {
    const escaped = name.replace(/["\\]/g, '\\$&')
    const tag =
      document.querySelector(`meta[name="${escaped}"]`) ??
      document.querySelector(`meta[property="${escaped}"]`)
    return tag?.getAttribute('content') ?? ''
  }
  const openGraphTitle = normalizeText(meta('og:title'))
  const twitterTitle = normalizeText(meta('twitter:title'))
  const mainContent = (
    document.querySelector('main, [role="main"], article') ?? document.body
  ).cloneNode(true) as Element
  for (const node of mainContent.querySelectorAll(
    'aside, nav, footer, [hidden], [aria-hidden="true"], [class*="recommend" i], [class*="similar" i], [class*="related" i], [class*="suggest" i], [class*="other-jobs" i], [class*="might-like" i], [class*="jobs-at" i]',
  )) node.remove()
  const confirmationHeading =
    /^(apply|application)\s+(confirmation|submitted|success)|^thank you for applying/i.test(headingText) ||
    /^(apply|application)\s+(confirmation|submitted|success)|^thank you for applying/i.test(documentTitle) ||
    isApplicationConfirmation(normalizeText(mainContent.textContent))

  const scope = findCaptureScope(heading)
  const mainRoot = heading?.closest('main, [role="main"], article') ?? scope
  const structuredRecords = confirmationHeading ? [] : collectJsonLdRecords()
  const microdata = confirmationHeading ? undefined : microdataRecord()
  const embedded = confirmationHeading
    ? undefined
    : embeddedRecords(headingText, documentTitle, pageUrl.toString())
  const bestStructured = structuredRecords
    .map((record) => ({
      record,
      score: recordScore(record, headingText, documentTitle, pageUrl.toString()),
    }))
    .sort((left, right) => right.score - left.score)[0]?.record
  const titleHints = safeField('title', () =>
    readHint(mainRoot, siteHints.title, (value) => Boolean(validTitle(value))),
  )
  const hintedCompany = safeField('company', () =>
    readHint(scope, siteHints.company, (value) => Boolean(validCompany(value))),
  )
  const semanticTitle = safeField('title', () =>
    readHint(scope, [
      ...siteHints.titleContext,
      'h1',
      '[itemprop="title"]',
    ]),
  )
  const pageTitleCandidates = [openGraphTitle, twitterTitle, documentTitle]
    .filter(Boolean)
    .map((value) => parseTitlePattern(value, hostname))
  const pageTitleCandidate = pageTitleCandidates.find((candidate) => candidate.title) ??
    { title: '', company: '' }
  const genericPathMatch = jobPathPattern.test(pageUrl.pathname)
  const detectionTitle = firstValid([
    bestStructured?.title,
    microdata?.title,
    embedded?.title,
    titleHints,
    semanticTitle,
    headingText,
    pageTitleCandidate.title,
  ], validTitle)
  const semanticJobContext = Boolean(
    heading && hasApplyControl(scope) && hasLongDescription(scope),
  )
  const isJobPage = Boolean(
    !confirmationHeading &&
      (bestStructured || microdata || embedded || titleHints || (
        detectionTitle &&
        !genericTitles.test(detectionTitle) &&
        (genericPathMatch || semanticJobContext)
      )),
  )
  const strongSignal = Boolean(bestStructured || microdata || embedded || titleHints)
  const titlePattern = isJobPage
    ? pageTitleCandidates.find((candidate) => candidate.title) ?? { title: '', company: '' }
    : { title: '', company: '' }
  const titlePatternCompany = isJobPage
    ? pageTitleCandidates.find((candidate) => candidate.company)?.company ?? ''
    : ''

  const title = safeField('title', () => {
    if (!isJobPage) return ''
    return firstValid([
      bestStructured?.title,
      microdata?.title,
      embedded?.title,
      titleHints,
      semanticTitle,
      headingText,
      titlePattern.title,
      openGraphTitle,
      twitterTitle,
      documentTitle,
    ], validTitle)
  })

  const company = safeField('company', () => {
    if (!isJobPage) return ''
    const direct = firstValid([
      bestStructured?.company,
      microdata?.company,
      embedded?.company,
      hintedCompany,
      semanticCompany(scope),
      titlePatternCompany,
    ], validCompany)
    if (direct) return direct
    const siteName = validCompany(normalizeText(meta('og:site_name')))
    if (siteName && normalizedBrand(siteName) !== normalizedBrand(hostBrand(hostname))) {
      return siteName
    }
    return validCompany(genericSlugCompany(pageUrl.pathname))
  })

  const location = safeField('location', () => {
    if (!isJobPage) return ''
    return firstValid([
      bestStructured?.location,
      microdata?.location,
      embedded?.location,
      readHint(scope, siteHints.location, (value) => Boolean(validLocation(value))),
      labeledValue(scope, ['location', 'job location', 'work location'], (value) =>
        Boolean(validLocation(value)),
      ),
    ], validLocation)
  })

  const employmentType = safeField('employment type', () => {
    if (!isJobPage) return ''
    return firstValid([
      bestStructured?.employmentType,
      microdata?.employmentType,
      embedded?.employmentType,
      readHint(scope, siteHints.employmentType, (value) =>
        Boolean(validEmploymentType(value)),
      ),
      labeledValue(scope, ['job type', 'employment type', 'type'], (value) =>
        Boolean(validEmploymentType(value)),
      ),
      ...summaryValues(scope),
    ], validEmploymentType)
  })

  const salary = safeField('salary', () => {
    if (!isJobPage) return ''
    return firstValid([
      bestStructured?.salary,
      microdata?.salary,
      embedded?.salary,
      readHint(scope, siteHints.salary, (value) => Boolean(validSalary(value))),
      labeledValue(scope, ['salary', 'pay', 'compensation', 'ctc'], (value) =>
        Boolean(validSalary(value)),
      ),
    ], validSalary)
  })

  const workMode = safeField('work mode', () => {
    if (!isJobPage) return ''
    return firstValid([
      bestStructured?.workMode,
      microdata?.workMode,
      embedded?.workMode,
      readHint(scope, siteHints.workMode, (value) => Boolean(validWorkMode(value))),
      labeledValue(scope, ['work mode', 'workplace', 'workplace type', 'remote'], (value) =>
        Boolean(validWorkMode(value)),
      ),
      ...summaryValues(scope),
      workModeFromLocation(location),
    ], validWorkMode)
  })

  const jobId = safeField('job identifier', () =>
    bestStructured?.id ||
      microdata?.id ||
      embedded?.id ||
      (isJobPage ? getPageJobId(pageUrl.toString(), scope) : ''),
  )
  const structuredUrl = safeField('posting URL', () =>
    isJobPage
      ? structuredUrlMatchesCurrentPage(bestStructured?.url ?? '', jobId, pageUrl)
      : '',
  )
  const url = structuredUrl || currentUrl
  const now = isoNow()

  return {
    isJobPage,
    strongSignal,
    data: {
      id: getStableJobId(url, jobId || undefined),
      jobId: jobId || undefined,
      title,
      company,
      url,
      applicationUrl: url,
      status: 'Applied',
      source: pageUrl.hostname,
      platform: pageUrl.hostname,
      location: location || undefined,
      workMode: workMode || undefined,
      employmentType: employmentType || undefined,
      salary: salary || undefined,
      appliedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  }
}
