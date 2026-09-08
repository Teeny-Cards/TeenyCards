import { describe, test, expect, beforeEach, afterEach, vi } from 'vite-plus/test'

const { mockFromTo, mockTo, mockSet } = vi.hoisted(() => ({
  mockFromTo: vi.fn(),
  mockTo: vi.fn(),
  mockSet: vi.fn()
}))

vi.mock('gsap', () => ({ gsap: { fromTo: mockFromTo, to: mockTo, set: mockSet } }))

import {
  translationCrossfadeEnter,
  translationCrossfadeLeave
} from '@/utils/animations/translation-crossfade'

const el = document.createElement('div')
const done = vi.fn()

/** Answers the reduced-motion query the way a member's system setting would. */
function stubReducedMotion(reduced) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reduced }))
  )
}

describe('translation-crossfade animations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stubReducedMotion(false)
    document.body.classList.remove('motion-safe')
  })

  afterEach(() => {
    document.body.classList.remove('motion-safe')
  })

  describe('translationCrossfadeEnter', () => {
    test('tweens opacity from 0 to 1', () => {
      translationCrossfadeEnter(el, done)

      expect(mockFromTo).toHaveBeenCalledWith(
        el,
        { opacity: 0 },
        expect.objectContaining({ opacity: 1 })
      )
    })

    test('calls done via onComplete', () => {
      translationCrossfadeEnter(el, done)

      const opts = mockFromTo.mock.calls[0][2]
      expect(opts.onComplete).toBe(done)
    })

    test('reduced motion sets opacity to 1 on the spot, with no tween', () => {
      stubReducedMotion(true)

      translationCrossfadeEnter(el, done)

      expect(mockSet).toHaveBeenCalledWith(el, { opacity: 1 })
      expect(done).toHaveBeenCalledOnce()
      expect(mockFromTo).not.toHaveBeenCalled()
    })

    test('the motion-safe kill class on body also skips the tween', () => {
      document.body.classList.add('motion-safe')

      translationCrossfadeEnter(el, done)

      expect(mockSet).toHaveBeenCalledWith(el, { opacity: 1 })
      expect(done).toHaveBeenCalledOnce()
      expect(mockFromTo).not.toHaveBeenCalled()
    })
  })

  describe('translationCrossfadeLeave', () => {
    test('tweens opacity to 0', () => {
      translationCrossfadeLeave(el, done)

      expect(mockTo).toHaveBeenCalledWith(el, expect.objectContaining({ opacity: 0 }))
    })

    test('calls done via onComplete', () => {
      translationCrossfadeLeave(el, done)

      const opts = mockTo.mock.calls[0][1]
      expect(opts.onComplete).toBe(done)
    })

    test('reduced motion finishes on the spot, with no tween', () => {
      stubReducedMotion(true)

      translationCrossfadeLeave(el, done)

      expect(done).toHaveBeenCalledOnce()
      expect(mockTo).not.toHaveBeenCalled()
    })

    test('the motion-safe kill class on body also skips the tween', () => {
      document.body.classList.add('motion-safe')

      translationCrossfadeLeave(el, done)

      expect(done).toHaveBeenCalledOnce()
      expect(mockTo).not.toHaveBeenCalled()
    })
  })
})
