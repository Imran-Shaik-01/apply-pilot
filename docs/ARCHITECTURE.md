# Architecture

## Overview
Apply Pilot uses a Manifest V3 extension structure with a stateless background service worker, content script capture logic, popup for quick actions, and a dashboard for overview and history.

## Directories
- `src/background` — service worker lifecycle and message handling
- `src/content` — job page detection and capture prompts
- `src/dashboard` — dashboard UI for saved applications
- `src/popup` — popup UI for quick add and summary
- `src/shared` — types, Zod validation, storage utilities, and page parsing helpers

## Storage plan
- Jobs: IndexedDB via Dexie
- Settings: Chrome storage with a local fallback for browser preview

## Why this stack
- React + Vite provides a fast UI workflow for the dashboard and popup.
- Dexie keeps the storage layer simple and browser-native.
- Zod helps validate page data and settings without over-engineering the project.
