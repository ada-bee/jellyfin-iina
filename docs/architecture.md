# Source architecture

Production bundles start at `src/entries`. Entries contain no behavior; they select a runtime composition for IINA, the sidebar webview, or the overlay webview.

- `jellyfin`: protocol DTOs, endpoints, authentication, URLs, and the transport-independent client.
- `playback`: playback state, negotiation, reporting ports, autoplay ordering, segments, and track selection.
- `sidebar`: typed routes/store, request operations, view models, DOM views, and browser-side orchestration.
- `overlay`: the environment-neutral overlay controller plus its DOM composition.
- `adapters`: browser and IINA implementations of HTTP, storage, player, preferences, and timers.
- `preview`: development-only sidebar fixtures and preview composition.
- `shared`: environment-neutral constants only.

Domain modules depend inward on `jellyfin` and `shared`; concrete browser and IINA effects stay in adapters or feature runtimes. `bun run verify:boundaries` rejects reversed imports, direct environment access from neutral modules, unresolved local imports, and source cycles.
