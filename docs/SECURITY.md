# Security and Privacy

Apply Pilot is designed to keep application data local by default. The extension stores job records in IndexedDB using Dexie and settings in Chrome storage. No analytics or third-party network calls are required for core functionality.

## Data handling
- Application data and settings stay on-device. There is no export feature or remote service.
- Captured text and URLs are validated before they are stored.
- Job links are canonicalized by removing common tracking parameters.

## Permissions
- `activeTab` and `scripting` support a user-initiated page scan when needed.
- `storage` stores settings and temporary capture drafts; `alarms` expires temporary drafts.
- `contextMenus` provides a manual save action.
- Content scripts and host access are limited to supported job-board and ATS domains listed in the extension manifest.
- Notifications and follow-up reminders are not implemented.

## Threat model summary
- Duplicate saves from the same canonical job URL reuse a stable record identifier.
- Page markup is treated as untrusted; only validated fields are stored and rendered as text.
- The service worker registers lifecycle listeners at top level and reads settings from local browser storage.
