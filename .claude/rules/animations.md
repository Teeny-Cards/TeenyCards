---
lastUpdated: 2026-09-08T00:00:00Z
paths:
  - 'src/**/*.{ts,vue}'
---

# Animations

**Owns how an animation is sequenced, transitioned, and where its code lives.** Reaches you editing
any `.ts`/`.vue` file that animates something.

## Sequencing

Prefer animation-completion hooks over wall-clock waits. Emit from the hook's `onComplete` so timing stays in sync if the animation changes.

```ts
await new Promise((resolve) => {
  gsap.to(el, { duration: 0.4, opacity: 0, onComplete: resolve })
})
```

If a duration is referenced in more than one place, extract it as a named constant rather than repeating the magic number.

## Transform cleanup

A GSAP tween writes into the element's whole inline `transform` style, not just the property you
named, and leaves that inline value in place after the tween completes — it permanently outranks any
resting transform the element gets from its own classes (`rotate-6 scale-75`), even though those
classes are still applied. Add `clearProps: 'transform'` to any tween that animates a
transform-family property (`x`, `y`, `rotation`, `scale`, …) on an element that also carries a
class-driven transform, so the resting state returns to CSS once the tween ends.

## File structure

All animation functions should be in `src/utils/animations/` and named after the element or effect they animate (`modal.ts`, `phone.ts`, `blur.ts`).

## Transitions

Wire Vue `<Transition>` with `:css="false"` and JS hooks (`@enter`, `@leave`) that delegate to the helpers above. **Never write `*-enter-active` / `*-leave-to` class rules in a `<style>` block**, even though Vue supports it — mixing CSS-class transitions with GSAP gives inconsistent feel and hides the timing.

Prefer a **simultaneous** swap (entering and leaving panes overlapping) over `out-in`, which reads as a sequential two-step. When a transition needs reworking, adapt the existing util rather than deleting it.

Size a simultaneous swap's container to the entering pane's own content, not a fixed/`min-height`
wrapper — stack the two panes on the same `grid-area` inside a `display: grid` container instead of
absolutely positioning either one; a `min-height` wrapper with an absolutely-positioned pane inside
it clips content taller than the guessed minimum.

## Sequencing dependent work

When something must happen _after_ a transition, make the state-transition function `async` and resolve it from the real GSAP completion, then `await` it. Keep the synchronous effect synchronous — only the returned promise is deferred, so non-awaiting callers are unaffected.

Don't suppress native browser behaviour to dodge a mid-animation glitch (e.g. `focus({ preventScroll: true })` to avoid a scroll jump). Sequence the work after the animation settles so it reads final positions instead.
