import { attemptCapture } from './extract'

if (typeof chrome !== 'undefined' && chrome.runtime) {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  let suppressCaptureUntilNavigation = navigation?.type === 'reload'
  let lastSentCapture = ''
  let scanPending = false
  let captureObserver: MutationObserver | undefined
  let mutationTimer = 0
  let observedPageUrl = window.location.href
  let cachedCaptureEnabled: boolean | undefined
  let pendingCaptureSetting: Promise<boolean> | undefined

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !('settings' in changes)) return
    const settings = changes.settings.newValue as { enabled?: boolean } | undefined
    cachedCaptureEnabled = settings?.enabled === true
  })

  const getCaptureEnabled = () => {
    if (cachedCaptureEnabled !== undefined) return Promise.resolve(cachedCaptureEnabled)
    if (pendingCaptureSetting) return pendingCaptureSetting

    pendingCaptureSetting = chrome.storage.local.get(['settings'])
      .then((stored) => {
        const settings = stored.settings as { enabled?: boolean } | undefined
        cachedCaptureEnabled = settings?.enabled === true
        return cachedCaptureEnabled
      })
      .finally(() => {
        pendingCaptureSetting = undefined
      })
    return pendingCaptureSetting
  }

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
    void getCaptureEnabled().then(async (enabled) => {
      if (!enabled) return
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
      const response = await chrome.runtime.sendMessage({ type: 'AUTO_CAPTURE_PAGE', payload })
      if (response?.ok === false) {
        console.error('Apply Pilot could not capture this job page.', response.message)
        return
      }
      lastSentCapture = signature
    }).catch((error: unknown) => {
      console.error('Apply Pilot could not save the detected job-page draft.', error)
    }).finally(() => {
      scanPending = false
    })
  }

  const startAutoCapture = () => {
    if (!suppressCaptureUntilNavigation) autoCapture()
    captureObserver?.disconnect()
    captureObserver = new MutationObserver(() => {
      if (window.location.href !== observedPageUrl) {
        resumeAutoCaptureAfterNavigation()
        return
      }
      window.clearTimeout(mutationTimer)
      mutationTimer = window.setTimeout(autoCapture, 300)
    })
    captureObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  const resumeAutoCaptureAfterNavigation = () => {
    const currentPageUrl = window.location.href
    if (currentPageUrl === observedPageUrl && !suppressCaptureUntilNavigation) return
    observedPageUrl = currentPageUrl
    suppressCaptureUntilNavigation = false
    lastSentCapture = ''
    startAutoCapture()
  }
  startAutoCapture()
  window.addEventListener('popstate', resumeAutoCaptureAfterNavigation)
  window.addEventListener('hashchange', resumeAutoCaptureAfterNavigation)
  window.addEventListener('beforeunload', () => {
    window.clearTimeout(mutationTimer)
    captureObserver?.disconnect()
  }, { once: true })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GET_PAGE_CAPTURE') {
      if (suppressCaptureUntilNavigation) {
        sendResponse({ ok: true, data: null, refreshed: true })
        return
      }
      void getCaptureEnabled().then((enabled) => {
        if (!enabled) {
          sendResponse({ ok: true, data: null, disabled: true, isJobPage: false })
          return
        }
        const extraction = attemptCapture()
        sendResponse({
          ok: true,
          data: extraction.isJobPage ? extraction.data : null,
          isJobPage: extraction.isJobPage,
        })
      }).catch((error: unknown) => {
        console.error('Apply Pilot could not read the capture setting.', error)
        sendResponse({ ok: false, message: 'Could not read the capture setting.' })
      })
      return true
    }
  })
}
