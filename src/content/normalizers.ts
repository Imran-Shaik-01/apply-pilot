export const normalizeText = (value: unknown): string => {
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

export const normalizeWorkMode = (value: unknown) => {
  const text = normalizeText(value)
  const code = text.toUpperCase().split(/[/#]/).pop() ?? ''
  if (/(REMOTE|TELECOMMUTE|WORK_FROM_HOME)/.test(code)) return 'Remote'
  if (/HYBRID/.test(code)) return 'Hybrid'
  if (/(ON[-_]?SITE|ON-PREMISES)/.test(code)) return 'On-site'
  return text
}

export const normalizeEmploymentType = (value: unknown) => {
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
