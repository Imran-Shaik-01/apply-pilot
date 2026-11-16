import { describe, expect, it } from 'vitest'
import { safeUrl } from './utils'

describe('safeUrl', () => {
  it('accepts absolute HTTP and HTTPS URLs', () => {
    expect(safeUrl('https://jobs.example/roles/1')).toBe('https://jobs.example/roles/1')
    expect(safeUrl('http://jobs.example/roles/1')).toBe('http://jobs.example/roles/1')
  })

  it('rejects unsupported and relative URLs', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl('/roles/1')).toBe('')
    expect(safeUrl('not a URL')).toBe('')
  })
})
