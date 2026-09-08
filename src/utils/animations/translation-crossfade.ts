import { gsap } from 'gsap'

const DURATION = 0.2

// Mirrors the `motion-safe` CSS variant: motion runs unless the OS asks for
// reduced motion or the body carries the kill class. A JS/GSAP transition can't
// hang off the Tailwind variant, so it reads the same two signals directly.
function motionSafe() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const killed = document.body.classList.contains('motion-safe')
  return !reduced && !killed
}

export function translationCrossfadeEnter(el: Element, done: () => void) {
  if (!motionSafe()) {
    gsap.set(el, { opacity: 1 })
    done()
    return
  }

  gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: DURATION, onComplete: done })
}

export function translationCrossfadeLeave(el: Element, done: () => void) {
  if (!motionSafe()) {
    done()
    return
  }

  gsap.to(el, { opacity: 0, duration: DURATION, onComplete: done })
}
