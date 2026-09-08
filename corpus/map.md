# Corpus Map

Root index of every topic. One line each: `[[id]] — hook`. ⚠️ marks a topic that
documents a [system hole](./hazards.md).
See [corpus-authoring](../.claude/rules/corpus-authoring.md) for how the corpus works.

## authz

- [[permissions]] — named `can_` checks; the server is the real boundary; widening one ripples everywhere ⚠️
- [[return-destination]] — where sign-in sends you back to, taken from an unauthenticated param ⚠️

## cards

- [[cards]] — front/back units; app-minted sort key; duplicates flagged not blocked ⚠️
- [[card-export]] — a deck leaves as a directive-carrying CSV file, front then back, no notes or media
- [[card-limit-gate]] — a free plan's per-deck card cap; the frontend checks first, the database is the real boundary

## decks

- [[decks]] — one owner, one public/private switch; public means read-only, not shared study ⚠️
- [[deck-card-editor]] — a new card is a local placeholder that saves itself in the background; focus target must be claimed the same tick it's staged ⚠️

## feedback

- [[feedback]] — a curated public wall; posts stay hidden until a moderator publishes them ⚠️

## media

- [[media]] — files vs. the notes that keep them alive; lazy hourly cleanup ⚠️
- [[audio-generation]] — a durable step-chain turns a lesson recording into a transcript ⚠️

## members

- [[members]] — the account behind everything; ownership stamped from whoever's asking ⚠️
- [[pending-deletion-notice]] — a suspended account still enters the app shell; a persistent panel offers recover or sign out

## pacing

- [[pacing]] — per-deck dials; follow a preset or pin a dial; a pin is presence, not difference ⚠️

## rewards

- [[rewards]] — a progress tally survives any reset of the history under it; a paid-out reward is resolved once and never re-reads the milestone that promised it ⚠️

## scheduling

- [[scheduling]] — FSRS decides when each card returns; the math runs on the client, not the server ⚠️

## study

- [[study]] — the session run over a merged pile; reviews save as you go ⚠️

## theming

- [[theming]] — colors are roles, not shades; three switches reslot the whole screen ⚠️
- [[surface-stations]] — four named surfaces, each hand-authored, none derived from another; a few roles opt out of every station entirely, and two roles can collide into the same color ⚠️

## sessions

- [[sessions]] — a token the browser holds for an hour; the server can end a session without the browser noticing ⚠️

## sfx

- [[sound]] — one shared audio channel; iOS breaks it on lock and only a completed tap reopens it ⚠️

## architecture

- [[data-flow]] — server data is a named cache; a write owns marking its own data stale ⚠️
- [[layering]] — a finished animation still traps the popovers inside it ⚠️
- [[dialog-card]] — `layout-kit/dialog-card` owns its scrolling body, toolbar row, and content-grid padding, so call sites stop hand-rolling them ⚠️
- [[draft-pattern]] — `useDraft` is the shared shape behind every editor that stages changes before deciding whether to save them
- [[responsive]] — how the app asks "is this a small screen?"; the short vocabulary every screen shares

## ui

- [[mobile-dock]] — the floating bar owns its own height tween; a second one nested inside fights it ⚠️
- [[layout-kit]] — `app-window`'s root is full-width; every caller sets its own cap on non-mobile screens ⚠️
- [[keyboard-detection]] — no browser event says the keyboard opened; `useKeyboardOpen` infers it from the visual viewport shrinking
- [[media-query]] — `useMatchMedia` turns a short token string like `w>=md` into a live CSS media query
- [[pin-scroll-while-typing]] — `usePinScrollWhileTyping` stops the page jumping while typing inside a window-scrolled virtualized list
- [[reorder-drag]] — the pointer-driven drag-to-reorder engine; applies a computed offset as a translate, never moves or clones DOM
- [[safe-area-chrome-detection]] — `installSafeAreaPadding` decides live whether browser chrome already covers the safe-area strip
- [[scroll-lock]] — `useScrollLock` keeps the background from scrolling without the usual overflow/position toggle ⚠️
- [[scroll-region]] — `layout-kit/scroll-region` owns the scrolling box and its handle; a host hidden with `display: none` measures 0 until it's revealed ⚠️
- [[window-refocus-guard]] — `useWindowRefocusGuard` tells a real blur apart from focus round-tripping through an OS app-switch
