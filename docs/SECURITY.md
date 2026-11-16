# Security and Privacy

Apply Pilot is designed to keep application data local by default. The extension stores job records in IndexedDB using Dexie and settings in Chrome storage. No analytics or third-party network calls are required for core functionality.

## Data handling
- Application data stays on-device unless the user exports a file manually.
- All scraped page content is treated as untrusted input and validated with basic sanitization.
- HTTPS and HTTP URLs are only accepted when they are parsed safely.

## Permissions
- `activeTab` is used for in-page detection when a user is interacting with a job application page.
- `storage`, `alarms`, `notifications`, and `contextMenus` support local job tracking, follow-up reminders, and manual save actions.
- Host access is intentionally broad enough for job sites, but no external API calls are made.

## Threat model summary
- Spoofed job pages: mitigated by validation and duplicate detection.
- Malformed markup or hostile HTML: mitigated by sanitizing text and using safe URL parsing.
- Worker lifecycle issues: the service worker remains stateless and rehydrates settings when needed.
