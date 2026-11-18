import { draftCaptureSchema } from '../shared/schema'
import { canonicalizeJobUrl } from '../shared/utils'
import type { DraftCapture, GlobalDraft } from '../shared/types'

export const isHttpUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

export const getPopupJobUrl = (
  draft: Pick<GlobalDraft, 'jobUrl' | 'userEdited'> | undefined,
  pageUrl: string,
) => draft?.userEdited.jobUrl
  ? draft.jobUrl
  : draft?.jobUrl || canonicalizeJobUrl(pageUrl)

export const getActivePage = async (
  tabId: number | undefined,
  tabUrl: string,
): Promise<{ url: string; capture?: DraftCapture }> => {
  if (
    typeof chrome === 'undefined' ||
    !chrome.tabs ||
    tabId === undefined ||
    !isHttpUrl(tabUrl)
  ) return { url: tabUrl }

  let injectionAttempted = false
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CAPTURE' })
      if (response?.disabled) return { url: response.currentPageUrl ?? tabUrl }
      if (response?.ok && response.capture) {
        const parsed = draftCaptureSchema.safeParse(response.capture)
        if (parsed.success) {
          return {
            url: response.currentPageUrl ?? tabUrl,
            capture: parsed.data,
          }
        }
      }
    } catch {
      if (!injectionAttempted && chrome.scripting) {
        injectionAttempted = true
        let injectionSucceeded = false
        const contentScripts = chrome.runtime.getManifest().content_scripts ?? []
        const scriptPaths = contentScripts.flatMap((script) => script.js ?? [])
        const injectionPaths = scriptPaths.some((file) => file.endsWith('content.js'))
          ? scriptPaths.filter((file) => file.endsWith('content.js'))
          : ['dist/content.js', 'content.js']
        for (const file of injectionPaths) {
          try {
            await chrome.scripting.executeScript({ target: { tabId }, files: [file] })
            injectionSucceeded = true
            break
          } catch {
            continue
          }
        }
        if (!injectionSucceeded) return { url: tabUrl }
      } else {
        return { url: tabUrl }
      }
    }

    if (attempt < 5) await wait(400)
  }
  return { url: tabUrl }
}
