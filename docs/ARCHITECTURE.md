# Architecture

## Runtime

Apply Pilot is a Manifest V3 Chrome extension. The background service worker coordinates extension messages, validated draft state, application persistence, expiry, and notifications. Lifecycle and message listeners are registered at module scope so Chrome can wake the worker for those events.

The standalone content script runs on HTTP and HTTPS pages. It reads page markup locally, prioritizes structured job data, and reports captures and application-flow events to the worker. Automatic capture updates a draft; it does not save an application.

The popup is the review-and-save surface. It first reads the persisted global draft or a per-URL cache in `chrome.storage.session`, then verifies the draft against the active page. User-edited fields and locked/submitted drafts take precedence over later page captures. Popup edits are debounced and flushed on blur and page hide.

## Persistence

- **Applications:** Dexie/IndexedDB, with schema migrations and status history. Popup and dashboard writes are routed through the service worker; the dashboard uses Dexie `liveQuery` for cross-context updates.
- **Settings and active draft:** `chrome.storage.local`. Draft reads and writes are serialized in the service worker to prevent lost updates. Provisional drafts expire after 24 hours; locked or submitted drafts expire after seven days.
- **Popup refill cache:** `chrome.storage.session`, indexed by canonical page URL and bounded to 20 recent entries. It expires with its draft and is cleared on Save or when Capture is disabled. A cache entry can restore unsent user edits, but cannot overwrite a newer or unrelated draft.

The popup and dashboard validate messages and stored records with Zod. Pure draft transitions live in `src/shared/draft-state.ts` and are tested independently.

## Project layout

- `src/background` — MV3 worker, message handling, draft serialization, expiry, and submission notification fallback
- `src/content` — standalone DOM extraction, apply-flow locking, and confirmation detection
- `src/popup` — fast refill, draft review/edit, refresh, and explicit Save action
- `src/dashboard` — live application list, insights, preferences, and edit dialog
- `src/shared` — types, schemas, storage clients, draft state, and shared utilities
- `public` — source manifest and extension assets
- `dist` — generated production extension

## Build and verification

`npm run build` runs the TypeScript project build, bundles popup/dashboard/background/content scripts, and verifies that the generated extension manifests reference available files and that the content script remains standalone.
