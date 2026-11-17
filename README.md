# Apply Pilot

Apply Pilot is a local-first Chrome extension for capturing job details and tracking applications. Review the captured information in the popup and save only when you choose to; automatic capture never writes an application to the dashboard.

## Features

- Captures available role, company, location, work mode, salary, and employment type from job pages.
- Keeps an application draft as you move through an application flow and detects common confirmation messages.
- Lets you review and edit details before saving.
- Tracks application status and status history in a dashboard with search, filters, and summary metrics.
- Updates an open dashboard when applications change.
- Stores application records and settings locally in the browser.

Job details vary by site. Missing or uncertain fields are left blank for you to review.

## Install

The repository includes a production build in `dist/`.

1. Download and extract the repository, or clone it.
2. Open `chrome://extensions` in Chrome 127 or later.
3. Enable **Developer mode**, choose **Load unpacked**, and select the repository root (the folder containing `manifest.json`).

To build the extension yourself, use Node.js 20.19+ or 22.12+:

```bash
npm ci
npm run build
```

Then load the repository root in Chrome. The build writes the extension files to `dist/`.

## Use

1. Open a job page and select the Apply Pilot toolbar icon.
2. Review and edit the detected details. Your edits are kept with the draft.
3. Complete the application flow on the job site. Apply Pilot may show a confirmation prompt when it detects a submission message.
4. Verify the posting and application links, then select **Save application**. No application is written to the dashboard before this step.
5. Open **Dashboard** to find applications, update statuses, or edit details.

Use the refresh icon to recheck the active page. If the draft has been edited or locked for an application flow, select it twice to confirm discarding the current draft. Refresh does not show a success or cleared message.

The **Capture** switch disables page capture and clears the active draft. Statuses, including Ghosted, are updated manually. Follow-up reminders and manual export are not available.

## Privacy and permissions

Apply Pilot does not require an account and does not send application data to an Apply Pilot server. Job records are stored in IndexedDB; settings and the active draft are stored in Chrome local storage. A small per-URL popup cache uses Chrome session storage and is cleared when it expires, the draft is saved, or capture is disabled.

The manifest grants access to all HTTP and HTTPS pages so the content script can detect supported job-page markup across job boards and applicant-tracking systems. The content script analyzes page content locally; it does not submit forms or save an application. Chrome restricts extensions from running on certain browser, store, and other protected pages.

The extension requests:

- `storage` for settings, drafts, and the temporary popup cache.
- `alarms` to expire old drafts.
- `scripting` and broad HTTP(S) host access for page capture and a one-time script injection fallback.
- `activeTab` for the user-invoked scan.
- `contextMenus` for the **Save this job** menu item.
- `notifications` as a fallback when Chrome cannot open the popup after a detected application submission.

See [docs/SECURITY.md](./docs/SECURITY.md) for the data-handling and permission details.

## Troubleshooting

- **Popup is empty:** confirm that Capture is enabled, reload the job page, then open the popup again. Some sites expose limited or dynamically loaded job details.
- **A field is wrong:** edit it in the popup before saving. Apply Pilot does not infer a value when extraction is uncertain.
- **The popup does not appear after applying:** Chrome may block programmatic popup opening. Check for the page prompt, extension badge, or notification, then open Apply Pilot manually.
- **A stale draft appears:** use the refresh icon; edited or locked drafts require a second click to confirm discard. Turning Capture off clears the active draft and session cache.
- **Capture does not run:** Chrome blocks extensions on some protected pages. Check the URL and confirm that the extension is enabled in `chrome://extensions`.
- **A saved application is missing or not updating:** reopen the dashboard. Application data stays in the browser profile where it was saved.

## Project structure

```text
src/
  background/  MV3 service worker, message validation, serialized draft operations
  content/     standalone page capture and application-flow detection
  dashboard/   application list, insights, settings, and edit dialog
  popup/       review, edit, refresh, and save workflow
  shared/      types, schemas, state logic, and local persistence
docs/          architecture, security, and release notes
public/        manifest source and static extension assets
dist/          generated, loadable extension build
```

## Development checks

```bash
npm test
npm run lint
npm run build
```

`npm run build` type-checks and bundles the extension, then verifies that its manifests and standalone content script are loadable by Chrome.
