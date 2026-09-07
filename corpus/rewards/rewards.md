---
id: rewards
domain: rewards
status: current
hazard: true
related: []
updated: 2026-09-07
---

# Rewards

The system that notices when you've done enough of something, and pays you for it.

A member does something countable — reviews a card, say. That count adds up
against a **metric** (a named countable thing, like `study.cards_reviewed`).
Cross a **milestone**'s threshold on that metric for the first time, and you
earn it: a record is stamped, and whatever the milestone promises gets paid out
— today that's paperclips, a currency tracked as its own ledger.

> [!HAZARD] [K:reward-tally-survives-reset] **Progress is a counter, not a
> history you can replay — wiping the history underneath it doesn't touch the
> count.**
> A member's tally only ever moves by having a delta added to it. Nothing ever
> recomputes it from the reviews (or whatever else) that supposedly justify it.
> So resetting a deck, or deleting the reviews that earned the progress, leaves
> the tally exactly where it was and every milestone already earned stays
> earned. That's the intended durability — a reward, once paid, is never
> silently clawed back — but it also means the tally and the history that
> "produced" it can drift apart forever, on purpose.

> [!HAZARD] [K:reward-payout-is-resolved-not-spec] **What a member was actually
> paid is stored separately from the milestone that promised it — editing the
> milestone later never touches what already-earned members got.**
> A milestone's reward is a spec ("pay some paperclips"); the moment it's
> earned, that spec is resolved into a concrete outcome (an exact amount) and
> that outcome — not the spec — is what lands in the ledger. Change the
> milestone's reward payload afterward, retune the amount, swap it for
> something else entirely, and every member who already crossed that threshold
> keeps what they were actually given. This is deliberate — it's what lets a
> future milestone resolve its payout randomly without the payout drifting
> every time someone rereads the record — but it means the milestone catalogue
> is never a reliable log of reward history.

## Counting, crossing, and paying happen as one step

A source reports progress (a member did X, count it Y). That single call:
tallies the count, checks whether the new tally crossed any milestone it
hadn't already earned, stamps the earned record, and pays out — all in one
atomic transaction. There's no in-between state where a member's tally has
moved past a threshold but the reward hasn't landed yet, and no way for two
concurrent reports on the same metric to pay the same milestone twice.

## The server is the only source of truth

Nothing about a reward is decided by, or trusted from, the client. Every write
— counting progress, crossing a milestone, paying it out — happens inside
server-side functions the client cannot call directly; a member can only read
their own rows. A member's paperclip balance is never a number sitting on
their own row (which they could edit) — it's the sum of an append-only ledger
of individual payouts, so a spoofed balance would require forging every entry
that sums to it.

## What this isn't

- **Not a full catalogue of reward kinds.** Paperclips are the only kind paid
  out today; the schema is built to add more (an unlockable reward table
  exists and is written by nothing yet).
- **Not the UI that reveals an earned milestone to the member.** This topic
  covers the server-side ledger of truth, not how or when a member finds out.
