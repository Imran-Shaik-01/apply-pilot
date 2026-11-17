# QA Report

## Automated checks
- `npm test` runs the unit tests for shared validation, URL handling, and job-detail normalization.
- `npm run lint` checks the TypeScript source.
- `npm run build` type-checks, builds the extension, and verifies its manifests and entry points.

## Manual browser checks
- Load the production build as an unpacked Chrome extension.
- Verify capture, duplicate-save handling, context-menu access, dashboard live updates, and status history on supported job-board domains.

Browser-dependent extension workflows are not covered by the unit test suite.
