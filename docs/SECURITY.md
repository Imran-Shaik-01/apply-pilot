# Security and Privacy

Apply Pilot is local-first. It has no account system, analytics, remote API, or server-side application database. Job records are stored in IndexedDB; preferences and the active draft are stored in Chrome local storage. A bounded, temporary popup cache uses Chrome session storage.

## Page data

The content script reads the current page locally to find job details and common application confirmation messages. Captured values are validated before they enter the draft or application record and are rendered as text in the extension UI. Apply Pilot does not submit application forms. A user must review and explicitly save a record.

Drafts are temporary: provisional drafts expire after 24 hours, while drafts locked for an application flow expire after seven days. Saving an application or disabling Capture clears the active draft; disabling Capture also clears the popup session cache.

## Permissions and exposure

The manifest grants `http://*/*` and `https://*/*` host access and injects the content script on those pages. This broad access lets Apply Pilot work across job boards and applicant-tracking systems that use different markup, but means the content script can inspect pages on any HTTP(S) site. Page analysis remains local. Chrome does not allow content scripts on certain protected pages.

- `storage` stores settings, the active draft, and the per-URL session cache.
- `alarms` enforces draft expiry and restores the expiry alarm when the worker starts.
- `scripting` supports a one-time content-script injection fallback.
- `activeTab` supports user-invoked capture.
- `contextMenus` adds the **Save this job** entry, which opens the popup.
- `notifications` is used only if Chrome cannot open the popup after a detected application submission.

The extension does not request access to application form data beyond what the page capture script reads from the DOM. Users can disable capture in the popup or dashboard.

## Defensive measures

- Draft operations are serialized in the service worker and validated with Zod.
- Page-origin and top-frame checks guard content-script messages.
- URLs are canonicalized to remove common tracking parameters before duplicate comparison.
- Application content is treated as untrusted and displayed as text.
- Lifecycle listeners are registered at service-worker module scope for Manifest V3 reliability.

## Not provided

There is no remote sync, manual export, automatic status inference, or follow-up reminder scheduler.
