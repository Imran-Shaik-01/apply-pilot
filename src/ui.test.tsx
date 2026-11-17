import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DashboardApp } from './dashboard/App'
import { PopupApp } from './popup/App'

describe('extension interfaces', () => {
  it('renders the popup application workflow', () => {
    const markup = renderToStaticMarkup(createElement(PopupApp))

    expect(markup).toContain('Apply Pilot')
    expect(markup).toContain('Save application')
    expect(markup).toContain('Automatic capture')
    expect(markup).toContain('aria-label="Refresh draft"')
    expect(markup).toContain('refresh-icon')
    expect(markup).not.toContain('Draft cleared')
    expect(markup).not.toContain('Not this job')
    expect(markup).not.toContain('Tracking:')
  })

  it('renders the dashboard navigation and loading state', () => {
    const markup = renderToStaticMarkup(createElement(DashboardApp))

    expect(markup).toContain('Application overview')
    expect(markup).toContain('Applications')
    expect(markup).toContain('Loading your applications')
  })
})
