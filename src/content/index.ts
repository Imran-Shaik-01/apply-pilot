import { attemptCapture } from './extract'
import { isSubmissionMessage } from './normalizers'

if (typeof chrome !== 'undefined' && chrome.runtime) {
  const globalDraftStorageKey = 'apply-pilot-global-draft'
  const applyControlPattern =
    /^(easy\s+)?apply( now| for this job| on (the )?company (site|website)| with .+)?$/i
  const submissionCandidates = [
    '[role="alert"]',
    '[role="status"]',
    'h1',
    'h2',
    'h3',
    '[class*="success" i]',
    '[id*="success" i]',
    '[class*="confirm" i]',
    '[id*="confirm" i]',
    '[class*="thank" i]',
    '[id*="thank" i]',
    '[class*="submitted" i]',
    '[id*="submitted" i]',
    '[class*="applied" i]',
    '[id*="applied" i]',
  ].join(',')

  let captureEnabled: boolean | undefined
  let draftStatus: 'none' | 'provisional' | 'locked' | 'submitted' = 'none'
  let captureObserver: MutationObserver | undefined
  let mutationTimer = 0
  let observedPageUrl = window.location.href
  let pageScanPending = false
  let submissionReportPending = false
  let lastSentPageState = ''
  let settingRead: Promise<boolean> | undefined

  const getCaptureEnabled = () => {
    if (captureEnabled !== undefined) return Promise.resolve(captureEnabled)
    if (settingRead) return settingRead
    settingRead = chrome.storage.local.get(['settings'])
      .then((stored) => {
        const settings = stored.settings as { enabled?: boolean } | undefined
        captureEnabled = settings?.enabled === true
        return captureEnabled
      })
      .finally(() => {
        settingRead = undefined
      })
    return settingRead
  }

  const getCapture = () => {
    const extraction = attemptCapture()
    const data = extraction.data
    if (!extraction.isJobPage || !data.title || !data.company || !data.url) {
      return { extraction, capture: undefined }
    }
    let sourceHost = ''
    try {
      sourceHost = new URL(data.url).hostname
    } catch {
      return { extraction, capture: undefined }
    }
    return {
      extraction,
      capture: {
        id: data.id,
        jobId: data.jobId,
        fields: {
          title: data.title,
          company: data.company,
          location: data.location ?? '',
          workMode: data.workMode ?? '',
          salary: data.salary ?? '',
          employmentType: data.employmentType ?? '',
        },
        jobUrl: data.url,
        sourceHost,
      },
    }
  }

  const reportPageState = async () => {
    if (pageScanPending || !await getCaptureEnabled()) return
    pageScanPending = true
    try {
      const { extraction, capture } = draftStatus === 'locked' || draftStatus === 'submitted'
        ? { extraction: { strongSignal: false }, capture: undefined }
        : getCapture()
      const payload = {
        currentPageUrl: window.location.href,
        capture,
        strongSignal: extraction.strongSignal,
      }
      const signature = JSON.stringify(payload)
      if (signature === lastSentPageState) return
      const response = await chrome.runtime.sendMessage({ type: 'PAGE_STATE', payload })
      if (response?.ok === false) {
        console.error('Apply Pilot could not update the global draft.', response.message)
        return
      }
      lastSentPageState = signature
      if (response?.status) draftStatus = response.status
    } catch (error) {
      console.error('Apply Pilot could not inspect the current page.', error)
    } finally {
      pageScanPending = false
    }
  }

  const findSubmissionText = () => {
    const confirmationPath = /(?:confirmation|thank-you|submitted|success)/i.test(
      window.location.pathname,
    )
    const candidates = [
      ...Array.from(document.querySelectorAll(submissionCandidates)),
      document.title,
    ]
    for (const candidate of candidates) {
      const text = typeof candidate === 'string'
        ? candidate.replace(/\s+/g, ' ').trim()
        : (candidate.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (
        text.length > 0 &&
        text.length < 250 &&
        (isSubmissionMessage(text) || (confirmationPath && /^done[.!]?$/i.test(text)))
      ) return text
    }
    return ''
  }

  const reportSubmissionIfDetected = async () => {
    if (draftStatus !== 'locked' || submissionReportPending || !await getCaptureEnabled()) return
    const text = findSubmissionText()
    if (!text) return
    submissionReportPending = true
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'APPLICATION_SUBMITTED',
        payload: { currentPageUrl: window.location.href, text },
      })
      if (response?.newlySubmitted) draftStatus = 'submitted'
      else if (response?.ok === false) {
        console.error('Apply Pilot could not record the submission state.', response.message)
        submissionReportPending = false
      }
    } catch (error) {
      submissionReportPending = false
      console.error('Apply Pilot could not report the submission state.', error)
    }
  }

  const scanPage = async () => {
    if (!await getCaptureEnabled()) return
    await reportPageState()
    await reportSubmissionIfDetected()
  }

  const resumeAutoCaptureAfterNavigation = () => {
    const currentPageUrl = window.location.href
    if (currentPageUrl === observedPageUrl) return
    observedPageUrl = currentPageUrl
    lastSentPageState = ''
    void scanPage()
  }

  const startAutoCapture = () => {
    void chrome.runtime.sendMessage({ type: 'GET_DRAFT_STATUS' }).then((response) => {
      if (response?.ok) draftStatus = response.status ?? 'none'
    }).catch((error: unknown) => {
      console.error('Apply Pilot could not read the global draft status.', error)
    })
    void scanPage()
    captureObserver?.disconnect()
    captureObserver = new MutationObserver(() => {
      if (window.location.href !== observedPageUrl) {
        resumeAutoCaptureAfterNavigation()
        return
      }
      window.clearTimeout(mutationTimer)
      mutationTimer = window.setTimeout(() => void scanPage(), 300)
    })
    captureObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  document.addEventListener('click', (event) => {
    if (captureEnabled !== true) return
    const target = event.target instanceof Element
      ? event.target
      : event.target instanceof Node
        ? event.target.parentElement
        : null
    const control = target?.closest('a, button, [role="button"], input[type="submit"], input[type="button"]')
    if (!control) return
    const labels = [
      control.textContent,
      control.getAttribute('aria-label'),
      control instanceof HTMLInputElement ? control.value : '',
    ].map((label) => (label ?? '').replace(/\s+/g, ' ').trim())
    if (!labels.some((label) =>
      applyControlPattern.test(label) || /^submit application$/i.test(label),
    )) return

    const { extraction, capture } = getCapture()
    void chrome.runtime.sendMessage({
      type: 'LOCK_DRAFT',
      payload: { currentPageUrl: window.location.href, capture: extraction.isJobPage ? capture : undefined },
    }).then((response) => {
      if (response?.ok) draftStatus = response.status ?? 'locked'
    }).catch((error: unknown) => {
      console.error('Apply Pilot could not lock the global draft.', error)
    })
  }, { capture: true, passive: true })

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return
    if ('settings' in changes) {
      const settings = changes.settings.newValue as { enabled?: boolean } | undefined
      captureEnabled = settings?.enabled === true
      if (captureEnabled) {
        lastSentPageState = ''
        void scanPage()
      }
    }
    if (globalDraftStorageKey in changes) {
      const state = changes[globalDraftStorageKey].newValue as {
        draft?: { status?: 'provisional' | 'locked' | 'submitted' }
      } | undefined
      draftStatus = state?.draft?.status ?? 'none'
      submissionReportPending = false
    }
  })

  window.addEventListener('popstate', resumeAutoCaptureAfterNavigation)
  window.addEventListener('hashchange', resumeAutoCaptureAfterNavigation)
  window.addEventListener('beforeunload', () => {
    window.clearTimeout(mutationTimer)
    captureObserver?.disconnect()
  }, { once: true })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GET_PAGE_CAPTURE') {
      void getCaptureEnabled().then(async (enabled) => {
        if (!enabled) {
          sendResponse({ ok: true, data: null, disabled: true, isJobPage: false })
          return
        }
        const { extraction, capture } = getCapture()
        await chrome.runtime.sendMessage({
          type: 'PAGE_STATE',
          payload: {
            currentPageUrl: window.location.href,
            capture,
            strongSignal: extraction.strongSignal,
          },
        })
        sendResponse({
          ok: true,
          data: extraction.isJobPage ? extraction.data : null,
          capture,
          currentPageUrl: window.location.href,
          isJobPage: extraction.isJobPage,
        })
      }).catch((error: unknown) => {
        console.error('Apply Pilot could not inspect the current page.', error)
        sendResponse({ ok: false, message: 'Could not inspect the current page.' })
      })
      return true
    }

    if (message?.type === 'SHOW_SUBMISSION_TOAST') {
      showSubmissionToast()
    }
  })

  function showSubmissionToast() {
    const hostId = 'apply-pilot-submission-toast'
    document.getElementById(hostId)?.remove()
    const host = document.createElement('div')
    host.id = hostId
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent =
      ':host{all:initial;position:fixed;z-index:2147483647;right:20px;bottom:20px;font:14px/1.4 Arial,sans-serif}.toast{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:8px;background:#172b4d;color:#fff;box-shadow:0 4px 16px #0004}.dismiss{border:0;background:transparent;color:#fff;font-size:18px;cursor:pointer}'
    const toast = document.createElement('div')
    toast.className = 'toast'
    const text = document.createElement('span')
    text.textContent = 'Apply Pilot: click the extension icon to review and save.'
    const dismiss = document.createElement('button')
    dismiss.className = 'dismiss'
    dismiss.type = 'button'
    dismiss.setAttribute('aria-label', 'Dismiss')
    dismiss.textContent = '×'
    toast.append(text, dismiss)
    shadow.append(style, toast)
    document.documentElement.append(host)
    const timeout = window.setTimeout(() => host.remove(), 8000)
    dismiss.addEventListener('click', () => {
      window.clearTimeout(timeout)
      host.remove()
    })
  }

  startAutoCapture()
}
