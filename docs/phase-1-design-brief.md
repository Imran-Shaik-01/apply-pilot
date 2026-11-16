# Apply Pilot — Phase 1: Requirements and Design Brief

## 1. Requirements and assumptions

### Product goal
Apply Pilot is a Manifest V3 Chrome extension designed to track job applications without forcing the user to maintain a spreadsheet. It captures the application details while the user is in the flow, then gives them a clean dashboard to review, update and act on saved roles.

### Assumptions
- The core user is a serious job seeker applying to multiple roles across multiple sites.
- Users do not want a heavy onboarding flow; they want fast capture and clear tracking.
- Availability of structured job metadata varies by site, so extraction will be adapter-first with a reliable fallback strategy.
- The extension should stay local-first by default with minimal permissions and no third-party analytics.
- The product must work with job boards, career pages, and ATS systems without requiring the user to manually paste data.

### Risks and constraints
- Some job sites do not expose a stable job id or structured page metadata.
- Confirmation messages and redirect flows are not always consistent across ATS providers.
- Duplicate detection must balance strictness with user flexibility when company and role names vary.
- Browser extensions have strict lifecycle limits, so the service worker and content scripts cannot rely on long-lived in-memory state.
- The extension must remain resilient in slow, dynamic or iframe-heavy environments.

## 2. Design brief

### Audience
- Active job seekers
- Career changers applying to several opportunities at once
- Builders and professionals tracking multiple in-flight applications

### Product principles
- Clarity over cleverness
- Frictionless capture over perfect extraction
- Privacy by default
- Clear status visibility over feature density
- Resilience and graceful degradation over brittle assumptions

### Tone
Calm, precise, trustworthy and focused. The product should feel like a careful professional tool rather than a productivity gimmick.

### Design system

#### Colour tokens (light theme)
- Canvas: #F5F3EE
- Panel: #FFFFFF
- Ink: #1A1A1A
- Muted: #5F5F5F
- Border: #D9D0C5
- Accent: #1B6B6B
- Accent soft: #DCEFEF
- Success: #156C3A
- Warning: #B66E1F

#### Dark theme tokens
- Canvas: #171B1C
- Panel: #1E2527
- Ink: #F2EFE9
- Muted: #C5C0B5
- Border: #2C3537
- Accent: #85D7D3
- Accent soft: #1E3A3B
- Success: #7FDBA2
- Warning: #E4B66A

#### Type scale
- Display: 48/56, 700
- Heading: 32/40, 600
- Section: 18/28, 600
- Body: 16/24, 400
- Meta: 12/18, 600

Recommended local type pairing:
- Display and headings: Iowan Old Style / Georgia
- UI text: Segoe UI / SF Pro / system sans
- Monospace: SFMono / ui-monospace for IDs and data values

#### Spacing system
- 4px, 8px, 12px, 16px, 24px, 32px
- Based on a 4px rhythm with 8px increments for dense UI and 24px+ for page-level separation

#### Radius
- Small: 8px
- Medium: 14px
- Large: 22px
- Full pill: 999px

#### Elevation
- Soft shadow: 0 10px 28px rgba(20, 26, 29, 0.05)
- Inset edges and subtle borders are preferred over heavy shadows

#### Motion
- Standard duration: 120–180ms
- Easing: ease-out for fades and slides
- Respects `prefers-reduced-motion`
- Purposeful micro-interactions only; no decorative motion

#### Iconography rules
- Minimal geometric line icons
- One consistent visual weight
- Prefer simple check, briefcase, clock, and path-like marks; avoid emoji and flashy symbols
- Use monochrome or accent-tinted icons with strong legibility at 16px

## 3. Product direction by phase

### Phase 1 outcome
Define the target product, user expectations, privacy model, and a visual system that sets the tone for the extension and dashboard.

### Phase 2 outcome
Build capture engine primitives: extraction adapters, duplicate detection, and save/edit confirmation flow.

### Phase 3 outcome
Add dashboard analytics, saved-job CRUD, filtering and status management.

### Phase 4 outcome
Hardening: accessibility, reliability, performance, privacy, and browser-store readiness.

## 4. Key design intent
The product should look like a considered, mature internal tool rather than a consumer app. It should feel trustworthy enough for important career decisions and calm enough to stay open for long periods without fatigue.

## 5. Implementation note
This repository now contains the Phase 1 foundation: a Vite + React + TypeScript app shell with the product principles and design system visualised in a polished, readable interface. The next phase will move into the actual extension architecture and capture engine implementation.
