# Apply Pilot

Apply Pilot is a Chrome extension that helps job seekers keep track of the roles they find and the applications they submit. It can recognize job details on supported job pages and use them to prefill a quick application form, so there is less information to enter by hand.

## What it does

- Detects job details such as role, company, location, work mode, salary, and employment type when available on a job page.
- Lets you review and save a job application from the extension popup.
- Keeps saved applications together in a dashboard, where you can review roles and update their status.
- Shows your application count for the current day.
- Lets you enable or disable job-page capture.

## How it works

When you open the popup on a supported job page, Apply Pilot reads available job details from that page and fills in the form. You can review or edit the information before saving. Saved applications can then be managed from the dashboard.

## Technology

Apply Pilot is built with **TypeScript** and **React**. **Vite** builds the extension, which uses the **Chrome Extensions Manifest V3** platform, including a background service worker and page content scripts. **Dexie** provides IndexedDB storage for saved applications, and **Zod** validates application and settings data.

Application data and settings are stored locally in the browser. Apply Pilot does not require an account or a remote service to track applications.
