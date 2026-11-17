# Changelog

## 1.1.0
- Replaced the popup refresh text with an accessible icon button, confirmation state, and reduced-motion-aware animation.
- Added serialized per-URL session caching and live-page verification for faster draft refill while protecting edited and locked fields.
- Hardened service-worker startup, message validation, popup edit flushing, cache cleanup, and settings reads.
- Added regression tests for draft restoration and application edit data preservation.
- Rewrote installation, usage, troubleshooting, architecture, and security documentation.

## 1.0.0
- Initial Manifest V3 extension foundation for Apply Pilot
- Added job capture, dashboard, popup, storage layer, and design brief
- Implemented local-first storage with Dexie and Chrome settings persistence
- Created a simple product-quality shell for the extension architecture
