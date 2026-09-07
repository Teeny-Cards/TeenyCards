# Hazards

The roll-call of every known **system hole** — somewhere the obvious assumption
is quietly wrong and it costs you. One line each, ordered roughly by blast
radius: data loss and silent corruption first, design ceilings and footguns last.

> **A roll-call, not a store.** Each trap's full text lives in its topic, at the
> slug named here — `grep -rn '\[K:<slug>\]' corpus/` lands on it. This file
> restates nothing, so it cannot drift. To add or change a trap, edit the topic —
> →[K:corpus-hazard-authoring].

You don't read this list to work. Each trap is echoed as a `→[K:<slug>]` pointer
in the directory it bites, so it reaches you when you're standing on it.

| Trap                                            | Topic                  | Echoed at                                                                                                                |
| ----------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| →[K:unconfirmed-review-loss]                    | [[study]]              | `src/views/study-session/composables/`                                                                                   |
| →[K:deleted-account-token-outlives-deletion]    | [[sessions]]           | `src/api/session.ts`, `src/stores/`                                                                                      |
| →[K:return-destination-open-redirect]           | [[return-destination]] | `src/composables/auth/`                                                                                                  |
| →[K:oauth-popup-loses-its-opener]               | [[sessions]]           | `src/api/session.ts`                                                                                                     |
| →[K:stall-reaper-strands-slow-jobs]             | [[audio-generation]]   | `supabase/functions/transcribe-lesson/`                                                                                  |
| →[K:card-rank-byte-collation]                   | [[cards]]              | `supabase/schemas/40_cards/`                                                                                             |
| →[K:ownership-stamp-empty-under-service-role]   | [[members]]            | `supabase/schemas/` (`set_member_id`)                                                                                    |
| →[K:permission-widening-ripples]                | [[permissions]]        | `supabase/schemas/` (the `can_` functions)                                                                               |
| →[K:media-lifetime-follows-notes]               | [[media]]              | `src/api/media/`                                                                                                         |
| →[K:client-owns-the-schedule]                   | [[scheduling]]         | `src/views/study-session/`                                                                                               |
| →[K:reward-tally-survives-reset]                | [[rewards]]            | `supabase/schemas/85_rewards/`                                                                                           |
| →[K:reward-payout-is-resolved-not-spec]         | [[rewards]]            | `supabase/schemas/85_rewards/`                                                                                           |
| →[K:silent-stale-cache]                         | [[data-flow]]          | `src/api/reviews/mutations/`                                                                                             |
| →[K:postgrest-max-rows-truncates-silently]      | [[data-flow]]          | `src/api/**`                                                                                                             |
| →[K:query-status-holds-through-repeat-failure]  | [[data-flow]]          | `src/components/feedback/feedback-board.vue`                                                                             |
| →[K:shared-cache-entry-options-last-mount-wins] | [[data-flow]]          | `src/api/decks/queries/count.ts`                                                                                         |
| →[K:pin-is-presence-not-difference]             | [[pacing]]             | `src/api/review-pacing/`                                                                                                 |
| →[K:closed-color-set-fails-bare]                | [[theming]]            | `src/utils/palette/`                                                                                                     |
| →[K:public-is-read-only]                        | [[decks]]              | `src/api/decks/`                                                                                                         |
| →[K:decks-barrel-cycle-drops-runtime-exports]   | [[decks]]              | `src/api/decks/mutations/upsert.ts`, `src/composables/deck/actions.ts`                                                   |
| →[K:posts-hidden-until-published]               | [[feedback]]           | `src/api/feedback/`                                                                                                      |
| →[K:text-editor-ghost-click-guard]              | [[cards]]              | `src/components/card/`                                                                                                   |
| →[K:deck-focus-microtask-ordering]              | [[deck-card-editor]]   | `src/views/deck/composables/list-controller.ts`                                                                          |
| →[K:deck-temp-card-handoff]                     | [[deck-card-editor]]   | `src/views/deck/composables/virtual-list.ts`                                                                             |
| →[K:deck-editor-focus-claim]                    | [[deck-card-editor]]   | `src/views/deck/composables/list-controller.ts`, `src/views/deck/card-editor/list-item-card.vue`                         |
| →[K:settled-transform-traps-overlays]           | [[layering]]           | `src/utils/animations/`                                                                                                  |
| →[K:ios-audio-interruption]                     | [[sound]]              | `src/sfx/`                                                                                                               |
| →[K:dock-height-single-owner]                   | [[mobile-dock]]        | `src/components/mobile-dock/`, `src/composables/ui/animated-height.ts`, `src/components/layout-kit/crossfade-resize.vue` |
| →[K:dock-edge-inset-follows-flush]              | [[mobile-dock]]        | `src/components/mobile-dock/mobile-dock-host.vue`                                                                        |
| →[K:fixed-roles-skip-the-station]               | [[surface-stations]]   | `src/styles/main.css`, `src/components/card/index.vue`                                                                   |
| →[K:station-roles-can-collide]                  | [[surface-stations]]   | `src/styles/stations.css`, `src/components/ui-kit/options-panel/index.vue`                                               |
| →[K:app-window-fills-full-width]                | [[layout-kit]]         | `src/components/layout-kit/app-window/`                                                                                  |
| →[K:docked-app-window-drops-body-scroll]        | [[layout-kit]]         | `src/components/layout-kit/app-window/`                                                                                  |
| →[K:dialog-card-overflow-bleed]                 | [[dialog-card]]        | `src/components/layout-kit/dialog-card/dialog-card-body.vue`                                                             |
| →[K:dialog-card-toolbar-slot-reactivity]        | [[dialog-card]]        | `src/components/layout-kit/dialog-card/index.vue`                                                                        |
| →[K:dialog-card-content-grid-padding]           | [[dialog-card]]        | `src/components/layout-kit/dialog-card/index.vue`                                                                        |
| →[K:scroll-region-hidden-host-measures-zero]    | [[scroll-region]]      | `src/components/layout-kit/scroll-region/use-scroll-metrics.ts`, `src/components/ui-kit/scroll-bar.vue`                  |
| →[K:mid-gesture-mutation-kills-momentum-scroll] | [[scroll-region]]      | `src/components/layout-kit/scroll-region/index.vue`, `src/components/layout-kit/app-window/index.vue`                    |
| →[K:page-boxes-are-height-pinned]               | [[scroll-region]]      | `src/components/layout-kit/scroll-region/use-scroll-metrics.ts`                                                          |
| →[K:scroll-lock-teleport-opt-in]                | [[scroll-lock]]        | `src/composables/ui/scroll-lock.ts`, `src/views/admin/color-page/shade-editor.vue`                                       |

A trap with no directory to echo it into is listed in `CLAUDE.md` instead, so it
is paid for in every session. There are none today.
