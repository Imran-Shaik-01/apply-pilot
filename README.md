<p align="center">
  <img src="public/icons/app-icon.png" alt="Apply Pilot icon" width="88" />
</p>

<h1 align="center">Apply Pilot</h1>

<p align="center">
  <strong>A calmer, more organized way to manage your job search.</strong>
</p>

<p align="center">
  <a href="https://github.com/Imran-Shaik-01/apply-pilot/actions/workflows/ci.yml">
    <img src="https://github.com/Imran-Shaik-01/apply-pilot/actions/workflows/ci.yml/badge.svg?branch=main" alt="Build and test status" />
  </a>
  <img src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Manifest V3" />
  <img src="https://img.shields.io/badge/TypeScript-powered-3178C6?logo=typescript&logoColor=white" alt="Powered by TypeScript" />
</p>

Apply Pilot is a Chrome extension for capturing useful details from supported job listings and keeping your applications organized. Spend less time copying information between pages and more time focusing on the roles you want.

## What you can do

| Capability | How it helps |
| --- | --- |
| **Capture job details** | Detect available role, company, location, work mode, salary, and employment information from a job page. |
| **Review before saving** | Check and edit the details in the popup before adding an application to your records. |
| **Manage your application pipeline** | View saved roles in the dashboard, search and filter them, and update each application’s status. |
| **See your progress** | Review daily, weekly, and monthly totals, along with response and interview insights. |
| **Control page capture** | Enable or disable job-page capture in your preferences. |

Application statuses are updated manually; Apply Pilot does not infer when an application has been ghosted.

## Getting started

### Install from the repository ZIP

The repository includes a ready-to-load extension build, so you don’t need to install development tools to try it.

1. Download the repository as a ZIP and extract it.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
3. Select **Load unpacked** and choose the extracted repository’s top-level folder.

### Use Apply Pilot

1. Open a supported job listing.
2. Select the Apply Pilot icon to review the details detected on the page.
3. Edit anything that needs correction, then save the application.
4. Open the dashboard to search, filter, and update your saved applications.

## Privacy by design

Application records and preferences are stored locally in your browser. Apply Pilot does not require an account, and job-page details are not sent to an Apply Pilot server.

To detect job information, the content script runs only on the supported job-board and ATS domains listed in the extension manifest. Page analysis takes place in the browser. You can turn capture off in the extension’s preferences.

## Built with

- **Chrome Extensions Manifest V3** — extension platform and browser APIs
- **TypeScript and React** — typed application logic and user interface
- **Vite** — development and production builds
- **Dexie with IndexedDB** — local storage for application records
- **Zod** — validation for settings and application data

## Development

Requires a Node.js version supported by the project’s `engines` setting.

```bash
npm ci
npm run dev
```

Open `/dashboard.html` or `/popup.html` on the Vite development server.

Useful project checks:

```bash
npm test       # Run unit tests
npm run lint   # Check source code
npm run build  # Type-check, build, and verify the extension package
```

The production build is written to `dist/`. The build check verifies that the repository and built manifests point to files that exist and that content scripts are loadable by Chrome.

## Planned for a future release

These are roadmap ideas and are **not available in the current version**:

- **Application submission assistance** — streamline submitting applications on supported job sites, with review and confirmation before submission.
- **Personal-details autofill** — save a user profile and use it to fill common fields in supported application forms.
- **Follow-up reminders** — schedule reminders for applications that need a follow-up.

---

<p align="center">
  Built to make every application easier to keep track of.
</p>
