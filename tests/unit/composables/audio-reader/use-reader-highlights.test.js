import { describe, test, expect, afterEach, beforeEach, vi } from 'vite-plus/test'
import { createApp, ref, nextTick } from 'vue'

const {
  mockMoveReaderCursor,
  mockHideReaderCursor,
  mockEmitSfx,
  mockScrollWordIntoDeadzone,
  mockCancelScroll,
  mockScrollLineIntoView
} = vi.hoisted(() => ({
  mockMoveReaderCursor: vi.fn(),
  mockHideReaderCursor: vi.fn(),
  mockEmitSfx: vi.fn(),
  mockScrollWordIntoDeadzone: vi.fn(),
  mockCancelScroll: vi.fn(),
  mockScrollLineIntoView: vi.fn()
}))

vi.mock('@/utils/animations/reader-cursor', () => ({
  moveReaderCursor: mockMoveReaderCursor,
  hideReaderCursor: mockHideReaderCursor
}))
vi.mock('@/sfx/bus', () => ({ emitSfx: mockEmitSfx, emitHoverSfx: vi.fn() }))
vi.mock('@/utils/animations/transcript-scroll', () => ({
  cancelScroll: mockCancelScroll,
  scrollLineIntoView: mockScrollLineIntoView,
  scrollWordIntoDeadzone: mockScrollWordIntoDeadzone
}))
// usePlayOnTap mock must not use `ref` in the factory — vi.mock hoists before imports.
vi.mock('@/composables/use-play-on-tap', () => ({
  usePlayOnTap: () => {
    const { ref: vueRef } = require('vue')
    return { playing: vueRef(false), interceptClick: vi.fn() }
  }
}))

// ResizeObserver is not in jsdom — stub it globally so onMounted can construct one.
class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver)

// jsdom does not ship PointerEvent — provide a minimal plain-object implementation.
// We avoid extending Event because clientX/clientY/currentTarget are all read-only
// on the native class; plain objects sidestep that.
function makeFakePointerEvent(type, init = {}) {
  return {
    type,
    bubbles: true,
    cancelable: true,
    pointerType: init.pointerType ?? '',
    pointerId: init.pointerId ?? 1,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    currentTarget: { setPointerCapture: () => {} },
    preventDefault: () => {},
    stopImmediatePropagation: () => {}
  }
}
// Expose as a constructor so `new PointerEvent(...)` works in tests.
function FakePointerEvent(type, init) {
  return makeFakePointerEvent(type, init)
}
vi.stubGlobal('PointerEvent', FakePointerEvent)

import { useReaderHighlights } from '@/composables/audio-reader/reader-highlights'

let app = null
let originalElementFromPoint = null

afterEach(() => {
  app?.unmount()
  app = null
  // Restore document.elementFromPoint if we replaced it
  if (originalElementFromPoint !== null) {
    document.elementFromPoint = originalElementFromPoint
    originalElementFromPoint = null
  }
  vi.clearAllMocks()
})

/**
 * Temporarily replace document.elementFromPoint (jsdom does not define it,
 * so vi.spyOn fails). Returns a setter to change the return value per-test.
 */
function stubElementFromPoint(returnFn) {
  if (!('elementFromPoint' in document)) {
    originalElementFromPoint = null
    document.elementFromPoint = returnFn
  } else {
    originalElementFromPoint = document.elementFromPoint
    document.elementFromPoint = returnFn
  }
}

/**
 * Mount the composable in a host component that renders `ref="content"` and
 * `ref="hover"` DOM nodes. `useTemplateRef` resolves these names from the
 * component instance, so words appended to contentEl are reachable via the
 * internal `content.value?.querySelector(...)` calls inside the composable.
 */
function withHighlights({ active_word = ref(-1), popover_open = ref(false), matchRangeAt } = {}) {
  const { h: vueH, defineComponent } = require('vue')
  let result

  const container = document.createElement('div')
  document.body.appendChild(container)

  const onSelect = vi.fn()
  const onDismiss = vi.fn()

  // A minimal stand-in for the transcript's window virtualizer — real tests add
  // their words directly to contentEl, so ensureWordMounted's fast (already
  // mounted) path always wins and scrollToIndex is never actually exercised.
  const virtualizer = { value: { scrollToIndex: vi.fn() } }
  const rowIndexOfWord = (index) => index

  const HostComponent = defineComponent({
    setup() {
      // matchRangeAt left undefined → the composable's own `() => null` default
      // applies, so callers that don't care about card matches are unaffected.
      result = useReaderHighlights(
        () => active_word.value,
        onSelect,
        () => popover_open.value,
        onDismiss,
        matchRangeAt,
        virtualizer,
        rowIndexOfWord
      )
      return () =>
        vueH('div', {}, [
          vueH('div', { ref: 'content', 'data-testid': 'content' }),
          vueH('div', { ref: 'hover', 'data-testid': 'hover' })
        ])
    }
  })

  app = createApp(HostComponent)
  app.mount(container)

  // The refs are populated after mount — grab the real DOM elements
  const contentEl = container.querySelector('[data-testid="content"]')
  const hoverEl = container.querySelector('[data-testid="hover"]')

  return { result, onSelect, onDismiss, contentEl, hoverEl, container }
}

/**
 * Add a fake word element to a container.
 */
function addWord(container, index, text = `word${index}`) {
  const el = document.createElement('span')
  el.setAttribute('data-word-index', String(index))
  el.setAttribute('data-word-text', text)
  const base = document.createElement('span')
  base.setAttribute('data-word-base', '')
  el.appendChild(base)
  container.appendChild(el)
  return el
}

describe('useReaderHighlights', () => {
  describe('return shape', () => {
    test('returns expected handler keys', () => {
      const { result } = withHighlights()

      expect(result).toMatchObject({
        interaction_range: expect.any(Object),
        onPointerDown: expect.any(Function),
        onPointerMove: expect.any(Function),
        onPointerUp: expect.any(Function),
        onPointerLeave: expect.any(Function),
        onPointerCancel: expect.any(Function)
      })
    })
  })

  describe('interaction_range', () => {
    test('is null when no pointer activity has occurred', () => {
      const { result } = withHighlights()

      expect(result.interaction_range.value).toBeNull()
    })
  })

  describe('mouse drag — fine-pointer ratchet', () => {
    test('onPointerMove emits gesture.tick when a new word is entered during active drag', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl3 = addWord(contentEl, 3)
      const wordEl5 = addWord(contentEl, 5)

      stubElementFromPoint(() => wordEl3)
      // Begin drag to set anchor_index
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 50, clientY: 50 })
      )
      mockEmitSfx.mockClear()

      // Move to word 5 — different index → ratchet tick
      document.elementFromPoint = () => wordEl5
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 50 })
      )

      expect(mockEmitSfx).toHaveBeenCalledWith('gesture.tick')
    })

    test('onPointerMove does NOT emit ui.tap_05 when pointer stays on the same word', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl3 = addWord(contentEl, 3)

      stubElementFromPoint(() => wordEl3)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 50, clientY: 50 })
      )
      mockEmitSfx.mockClear()

      // Move within word 3 — same index → no tick
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 55, clientY: 50 })
      )

      expect(mockEmitSfx).not.toHaveBeenCalled()
    })

    test('onPointerMove does NOT emit ui.tap_05 when wordIndexAt returns null (gap)', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl3 = addWord(contentEl, 3)

      stubElementFromPoint(() => wordEl3)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 50, clientY: 50 })
      )
      mockEmitSfx.mockClear()

      // Move into a gap (no word element) — null index → no tick
      document.elementFromPoint = () => contentEl
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 200, clientY: 50 })
      )

      expect(mockEmitSfx).not.toHaveBeenCalled()
    })

    test('touch path (extendTouchSelection) emits gesture.tick when a word changes but the fine-pointer code path does NOT handle it', async () => {
      // This is the existing touch ratchet via extendTouchSelection — separate from
      // the fine-pointer path. Verifies the two paths are distinct: touch goes
      // through trackTap→extendTouchSelection, not through the fine-pointer branch.
      const { result, contentEl } = withHighlights()
      const wordEl1 = addWord(contentEl, 1)
      const wordEl2 = addWord(contentEl, 2)

      vi.useFakeTimers()

      stubElementFromPoint(() => wordEl1)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 })
      )
      // Arm the long-press range select
      vi.advanceTimersByTime(410)
      await nextTick()
      mockEmitSfx.mockClear()

      // Drag to word 2 via TOUCH pointermove — goes through extendTouchSelection
      document.elementFromPoint = () => wordEl2
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'touch', clientX: 30, clientY: 10 })
      )

      expect(mockEmitSfx).toHaveBeenCalledWith('gesture.tick')

      vi.useRealTimers()
    })
  })

  describe('mouse drag', () => {
    test('pointerdown on a word sets interaction_range to that word', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 3)

      stubElementFromPoint(() => wordEl)

      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 50, clientY: 50 })
      )
      await nextTick()

      expect(result.interaction_range.value).toEqual({ lo: 3, hi: 3 })
    })

    test('pointermove extends the range while dragging', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl3 = addWord(contentEl, 3)
      const wordEl5 = addWord(contentEl, 5)

      stubElementFromPoint(() => wordEl3)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 50, clientY: 50 })
      )

      // Move to word 5
      document.elementFromPoint = () => wordEl5
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 50 })
      )
      await nextTick()

      expect(result.interaction_range.value).toEqual({ lo: 3, hi: 5 })
    })

    test('pointerup calls onSelect with the committed range', async () => {
      const { result, contentEl, onSelect } = withHighlights()
      const wordEl2 = addWord(contentEl, 2, '選択')

      const base2 = wordEl2.querySelector('[data-word-base]')
      base2.getBoundingClientRect = () => new DOMRect(10, 10, 30, 20)
      contentEl.getBoundingClientRect = () => new DOMRect(0, 0, 300, 200)

      stubElementFromPoint(() => wordEl2)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 20, clientY: 20 })
      )
      result.onPointerUp(
        new PointerEvent('pointerup', { pointerType: 'mouse', clientX: 20, clientY: 20 })
      )
      await nextTick()

      expect(onSelect).toHaveBeenCalledTimes(1)
      expect(onSelect.mock.calls[0][0]).toMatchObject({ index: 2, end_index: 2 })
    })

    test('pointerup on a multi-word drag commits ordered range', async () => {
      const { result, contentEl, onSelect } = withHighlights()
      const wordEl2 = addWord(contentEl, 2, '選択')
      const wordEl4 = addWord(contentEl, 4, '範囲')

      const base2 = wordEl2.querySelector('[data-word-base]')
      const base4 = wordEl4.querySelector('[data-word-base]')
      base2.getBoundingClientRect = () => new DOMRect(10, 10, 30, 20)
      base4.getBoundingClientRect = () => new DOMRect(50, 10, 30, 20)
      contentEl.getBoundingClientRect = () => new DOMRect(0, 0, 300, 200)

      stubElementFromPoint(() => wordEl2)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 20, clientY: 20 })
      )

      document.elementFromPoint = () => wordEl4
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 60, clientY: 20 })
      )
      result.onPointerUp(
        new PointerEvent('pointerup', { pointerType: 'mouse', clientX: 60, clientY: 20 })
      )
      await nextTick()

      expect(onSelect.mock.calls[0][0]).toMatchObject({ index: 2, end_index: 4 })
    })
  })

  describe('pointer leave', () => {
    test('onPointerLeave clears focus when not dragging', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 1)

      stubElementFromPoint(() => wordEl)
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 })
      )
      await nextTick()
      expect(result.interaction_range.value).toEqual({ lo: 1, hi: 1 })

      result.onPointerLeave(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
      await nextTick()

      expect(result.interaction_range.value).toBeNull()
    })

    test('onPointerLeave does NOT clear focus mid-drag', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 1)

      stubElementFromPoint(() => wordEl)
      // Begin drag
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 })
      )
      await nextTick()

      result.onPointerLeave(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
      await nextTick()

      // Anchor is set, so interaction range is still active
      expect(result.interaction_range.value).not.toBeNull()
    })
  })

  describe('pointer cancel', () => {
    test('onPointerCancel clears interaction_range', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 2)

      stubElementFromPoint(() => wordEl)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 10 })
      )
      await nextTick()
      expect(result.interaction_range.value).not.toBeNull()

      result.onPointerCancel(new PointerEvent('pointercancel', { pointerType: 'mouse' }))
      await nextTick()

      expect(result.interaction_range.value).toBeNull()
    })
  })

  describe('touch tap', () => {
    test('touch pointerdown does NOT immediately set interaction_range', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 1)

      stubElementFromPoint(() => wordEl)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 })
      )
      await nextTick()

      // Touch defers selection to pointerup
      expect(result.interaction_range.value).toBeNull()
    })

    test('stationary touch releases commit a single-word selection', async () => {
      const { result, contentEl, onSelect } = withHighlights()
      const wordEl = addWord(contentEl, 4, '日本語')

      const base = wordEl.querySelector('[data-word-base]')
      base.getBoundingClientRect = () => new DOMRect(20, 20, 40, 20)
      contentEl.getBoundingClientRect = () => new DOMRect(0, 0, 300, 500)

      stubElementFromPoint(() => wordEl)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 40, clientY: 30 })
      )
      // Minimal drift (< 10px TAP_SLOP)
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'touch', clientX: 41, clientY: 30 })
      )
      result.onPointerUp(
        new PointerEvent('pointerup', { pointerType: 'touch', clientX: 41, clientY: 30 })
      )
      await nextTick()

      expect(onSelect).toHaveBeenCalledTimes(1)
      expect(onSelect.mock.calls[0][0]).toMatchObject({ index: 4, end_index: 4 })
    })

    test('touch drift past TAP_SLOP is treated as scroll — does not call onSelect', async () => {
      const { result, contentEl, onSelect } = withHighlights()
      const wordEl = addWord(contentEl, 1)

      stubElementFromPoint(() => wordEl)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 })
      )
      // Drift well past the 10px slop
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'touch', clientX: 10, clientY: 50 })
      )
      result.onPointerUp(
        new PointerEvent('pointerup', { pointerType: 'touch', clientX: 10, clientY: 50 })
      )
      await nextTick()

      expect(onSelect).not.toHaveBeenCalled()
    })

    test('touch tap on empty space calls onDismiss', async () => {
      const { result, contentEl, onDismiss } = withHighlights()

      // No word element — closest('[data-word-index]') returns null
      stubElementFromPoint(() => contentEl)

      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 200, clientY: 200 })
      )
      result.onPointerUp(
        new PointerEvent('pointerup', { pointerType: 'touch', clientX: 200, clientY: 200 })
      )
      await nextTick()

      expect(onDismiss).toHaveBeenCalledTimes(1)
    })
  })

  describe('long-press range-select', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test('long-press arms range-select — interaction_range appears after 400ms', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 2)

      stubElementFromPoint(() => wordEl)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 20, clientY: 20 })
      )
      await nextTick()
      // Not armed yet
      expect(result.interaction_range.value).toBeNull()

      // Advance past LONG_PRESS_MS (400ms)
      vi.advanceTimersByTime(410)
      await nextTick()

      // Range-select is now armed on word 2
      expect(result.interaction_range.value).toEqual({ lo: 2, hi: 2 })
    })

    test('long-press emits gesture.tick when armed', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 3)

      stubElementFromPoint(() => wordEl)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 30, clientY: 30 })
      )

      vi.advanceTimersByTime(410)
      await nextTick()

      expect(mockEmitSfx).toHaveBeenCalledWith('gesture.tick')
    })

    test('drifting past slop before long-press cancels the arm', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 1)

      stubElementFromPoint(() => wordEl)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 })
      )
      // Drift past slop before 400ms
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'touch', clientX: 10, clientY: 50 })
      )

      vi.advanceTimersByTime(410)
      await nextTick()

      // Timer was cancelled on drift — no selection armed
      expect(result.interaction_range.value).toBeNull()
    })

    test('extending a long-press drag to a second word emits gesture.tick', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl1 = addWord(contentEl, 1)
      const wordEl2 = addWord(contentEl, 2)

      stubElementFromPoint(() => wordEl1)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 })
      )
      vi.advanceTimersByTime(410)
      await nextTick()
      mockEmitSfx.mockClear()

      // Drag to word 2 — each new word ticks tap_05
      document.elementFromPoint = () => wordEl2
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'touch', clientX: 30, clientY: 10 })
      )
      await nextTick()

      expect(result.interaction_range.value).toEqual({ lo: 1, hi: 2 })
      expect(mockEmitSfx).toHaveBeenCalledWith('gesture.tick')
    })
  })

  describe('selection_preview', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test('is null before any pointer activity', () => {
      const { result } = withHighlights()

      expect(result.selection_preview.value).toBeNull()
    })

    test('is non-null the instant a touch long-press arms with NO drag', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 1, '語')
      const base = wordEl.querySelector('[data-word-base]')
      base.getBoundingClientRect = () => new DOMRect(10, 50, 40, 20)

      stubElementFromPoint(() => wordEl)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 30, clientY: 55 })
      )
      await nextTick()

      // Not armed yet — preview is null before the long-press fires
      expect(result.selection_preview.value).toBeNull()

      // Advance past LONG_PRESS_MS (400ms) without any pointermove
      vi.advanceTimersByTime(500)
      await nextTick()

      // IMMEDIATELY non-null — no drag required [regression guard]
      expect(result.selection_preview.value).not.toBeNull()
    })

    test('selection_preview shape has text, x, top, bottom', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 2, '日本語')
      const base = wordEl.querySelector('[data-word-base]')
      base.getBoundingClientRect = () => new DOMRect(10, 80, 60, 24)

      stubElementFromPoint(() => wordEl)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 40, clientY: 90 })
      )

      vi.advanceTimersByTime(500)
      await nextTick()

      const preview = result.selection_preview.value
      expect(preview).not.toBeNull()
      // text from the word
      expect(typeof preview.text).toBe('string')
      // x comes from the finger's clientX at the time of arming (tap.x)
      expect(preview.x).toBe(40)
      // top/bottom come from the focus word's base-element rect
      expect(preview.top).toBe(80)
      expect(preview.bottom).toBe(80 + 24)
    })

    test('selection_preview stays null for mouse pointerdown + drag', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl1 = addWord(contentEl, 0, 'Hello')
      const wordEl2 = addWord(contentEl, 1, 'World')
      const base1 = wordEl1.querySelector('[data-word-base]')
      const base2 = wordEl2.querySelector('[data-word-base]')
      base1.getBoundingClientRect = () => new DOMRect(0, 50, 40, 20)
      base2.getBoundingClientRect = () => new DOMRect(50, 50, 40, 20)
      contentEl.getBoundingClientRect = () => new DOMRect(0, 0, 300, 200)

      stubElementFromPoint(() => wordEl1)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 10, clientY: 55 })
      )
      await nextTick()

      document.elementFromPoint = () => wordEl2
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 60, clientY: 55 })
      )
      await nextTick()

      // Mouse drag must never produce a selection_preview
      expect(result.selection_preview.value).toBeNull()
    })

    test('selection_preview resets to null after commitTouch (pointerup)', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 3, '選')
      const base = wordEl.querySelector('[data-word-base]')
      base.getBoundingClientRect = () => new DOMRect(10, 50, 30, 20)
      contentEl.getBoundingClientRect = () => new DOMRect(0, 0, 300, 200)

      stubElementFromPoint(() => wordEl)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 25, clientY: 55 })
      )
      vi.advanceTimersByTime(500)
      await nextTick()

      expect(result.selection_preview.value).not.toBeNull()

      result.onPointerUp(
        new PointerEvent('pointerup', { pointerType: 'touch', clientX: 25, clientY: 55 })
      )
      await nextTick()

      expect(result.selection_preview.value).toBeNull()
    })

    test('selection_preview resets to null after onPointerCancel', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 4, '語')
      const base = wordEl.querySelector('[data-word-base]')
      base.getBoundingClientRect = () => new DOMRect(10, 50, 30, 20)

      stubElementFromPoint(() => wordEl)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 25, clientY: 55 })
      )
      vi.advanceTimersByTime(500)
      await nextTick()

      expect(result.selection_preview.value).not.toBeNull()

      result.onPointerCancel(new PointerEvent('pointercancel', { pointerType: 'touch' }))
      await nextTick()

      expect(result.selection_preview.value).toBeNull()
    })
  })

  describe('popover_open watcher', () => {
    test('committed range is cleared when popover_open goes false', async () => {
      // Start with popover open (true) so closing it (false) triggers the watcher.
      const popover_open = ref(true)
      const { result, contentEl, onSelect } = withHighlights({ popover_open })
      const wordEl = addWord(contentEl, 1, '語')

      const base = wordEl.querySelector('[data-word-base]')
      base.getBoundingClientRect = () => new DOMRect(10, 10, 30, 20)
      contentEl.getBoundingClientRect = () => new DOMRect(0, 0, 300, 400)

      stubElementFromPoint(() => wordEl)

      // Commit via mouse click
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 20, clientY: 20 })
      )
      result.onPointerUp(
        new PointerEvent('pointerup', { pointerType: 'mouse', clientX: 20, clientY: 20 })
      )
      await nextTick()
      expect(onSelect).toHaveBeenCalledTimes(1)

      // Mouse leaves, then popover closes — committed should clear.
      result.onPointerLeave(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
      await nextTick()
      popover_open.value = false
      await nextTick()

      // Both committed and hover focus are gone → interaction_range is null
      expect(result.interaction_range.value).toBeNull()
    })
  })

  describe('hover does not override committed selection', () => {
    test('pointermove during open popover does not change interaction_range', async () => {
      const popover_open = ref(false)
      const { result, contentEl } = withHighlights({ popover_open })
      const wordEl0 = addWord(contentEl, 0, '一')
      const wordEl1 = addWord(contentEl, 1, '二')

      const base0 = wordEl0.querySelector('[data-word-base]')
      base0.getBoundingClientRect = () => new DOMRect(10, 10, 20, 20)
      contentEl.getBoundingClientRect = () => new DOMRect(0, 0, 300, 400)

      stubElementFromPoint(() => wordEl0)

      // Commit word 0 via mouse click
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 15, clientY: 15 })
      )
      result.onPointerUp(
        new PointerEvent('pointerup', { pointerType: 'mouse', clientX: 15, clientY: 15 })
      )
      await nextTick()

      // Open popover so hover is locked out
      popover_open.value = true
      await nextTick()

      // Hover over word 1 — should not change the selection
      document.elementFromPoint = () => wordEl1
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 50, clientY: 15 })
      )
      await nextTick()

      // interaction_range still reflects committed word 0
      expect(result.interaction_range.value).toEqual({ lo: 0, hi: 0 })
    })
  })

  // A tap/click on a word the matcher covers selects the whole matched phrase;
  // a deliberate drag or long-press range-select still commits exactly what was
  // swept, so a long-press on a highlight selects freely as if it weren't there.
  describe('match-aware selection', () => {
    // Lay out words `2,3,4` as a horizontal row of base rects so commitRange can
    // measure a multi-word range.
    function addPhrase(contentEl) {
      const els = [2, 3, 4].map((i, n) => {
        const el = addWord(contentEl, i, `字${i}`)
        el.querySelector('[data-word-base]').getBoundingClientRect = () =>
          new DOMRect(10 + n * 30, 10, 20, 20)
        return el
      })
      contentEl.getBoundingClientRect = () => new DOMRect(0, 0, 300, 200)
      return els
    }

    test('a click on a matched word selects the whole matched phrase', async () => {
      const matchRangeAt = (i) => (i === 3 ? { lo: 2, hi: 4 } : null)
      const { result, contentEl, onSelect } = withHighlights({ matchRangeAt })
      const [, w3] = addPhrase(contentEl)

      stubElementFromPoint(() => w3)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 45, clientY: 15 })
      )
      result.onPointerUp(
        new PointerEvent('pointerup', { pointerType: 'mouse', clientX: 45, clientY: 15 })
      )
      await nextTick()

      expect(onSelect).toHaveBeenCalledTimes(1)
      expect(onSelect.mock.calls[0][0]).toMatchObject({ index: 2, end_index: 4 })
    })

    test('a touch tap on a matched word selects the whole matched phrase', async () => {
      const matchRangeAt = (i) => (i === 3 ? { lo: 2, hi: 4 } : null)
      const { result, contentEl, onSelect } = withHighlights({ matchRangeAt })
      const [, w3] = addPhrase(contentEl)

      stubElementFromPoint(() => w3)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 45, clientY: 15 })
      )
      result.onPointerUp(
        new PointerEvent('pointerup', { pointerType: 'touch', clientX: 45, clientY: 15 })
      )
      await nextTick()

      expect(onSelect).toHaveBeenCalledTimes(1)
      expect(onSelect.mock.calls[0][0]).toMatchObject({ index: 2, end_index: 4 })
    })

    test('a drag commits exactly the swept range, ignoring any match', async () => {
      // matchRangeAt would expand a *click* to the whole phrase — a real drag must
      // ignore it and commit only what was swept.
      const matchRangeAt = () => ({ lo: 2, hi: 4 })
      const { result, contentEl, onSelect } = withHighlights({ matchRangeAt })
      const [w2, w3] = addPhrase(contentEl)

      stubElementFromPoint(() => w2)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 15, clientY: 15 })
      )
      document.elementFromPoint = () => w3
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 45, clientY: 15 })
      )
      result.onPointerUp(
        new PointerEvent('pointerup', { pointerType: 'mouse', clientX: 45, clientY: 15 })
      )
      await nextTick()

      // Swept 2→3, not the match's 2→4
      expect(onSelect.mock.calls[0][0]).toMatchObject({ index: 2, end_index: 3 })
    })

    describe('long-press over a highlight', () => {
      beforeEach(() => vi.useFakeTimers())
      afterEach(() => vi.useRealTimers())

      test('arms free selection and ignores the match (selects just the held word)', async () => {
        // The match would expand a tap to a whole phrase; a long-press must select
        // freely instead — here just the single word it armed on.
        const matchRangeAt = () => ({ lo: 0, hi: 9 })
        const { result, contentEl, onSelect } = withHighlights({ matchRangeAt })
        const w1 = addWord(contentEl, 1, '語')
        w1.querySelector('[data-word-base]').getBoundingClientRect = () =>
          new DOMRect(10, 10, 20, 20)
        contentEl.getBoundingClientRect = () => new DOMRect(0, 0, 300, 200)

        stubElementFromPoint(() => w1)
        result.onPointerDown(
          new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 15, clientY: 15 })
        )
        vi.advanceTimersByTime(410)
        await nextTick()

        result.onPointerUp(
          new PointerEvent('pointerup', { pointerType: 'touch', clientX: 15, clientY: 15 })
        )
        await nextTick()

        // Committed the held word alone, NOT the match's {0,9}
        expect(onSelect.mock.calls[0][0]).toMatchObject({ index: 1, end_index: 1 })
      })
    })
  })

  describe('return shape includes hover_lines and setHoverEl', () => {
    test('hover_lines is a ref starting empty', () => {
      const { result } = withHighlights()

      expect(result.hover_lines).toBeDefined()
      expect(result.hover_lines.value).toEqual([])
    })

    test('setHoverEl is a function', () => {
      const { result } = withHighlights()

      expect(typeof result.setHoverEl).toBe('function')
    })
  })

  describe('followActiveWord — debounce + cleanup', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    // Two rapid active_word changes should produce only one
    // scrollWordIntoDeadzone call, not two.
    test('is debounced 100ms — two rapid changes fire only one scroll call', async () => {
      const active_word = ref(0)
      const { result, contentEl } = withHighlights({ active_word })
      const w0 = addWord(contentEl, 0)
      const w1 = addWord(contentEl, 1)
      w0.getBoundingClientRect = () => new DOMRect(0, 200, 40, 20)
      w1.getBoundingClientRect = () => new DOMRect(0, 220, 40, 20)

      // Two rapid changes within the 100ms debounce window.
      active_word.value = 0
      await nextTick()
      active_word.value = 1
      await nextTick()

      // Nothing should have fired yet — still inside the debounce window.
      expect(mockScrollWordIntoDeadzone).not.toHaveBeenCalled()

      // Advance past debounce. The fired callback awaits ensureWordMounted (a
      // microtask) before scrolling, so let that settle before asserting.
      vi.advanceTimersByTime(110)
      await nextTick()

      expect(mockScrollWordIntoDeadzone).toHaveBeenCalledTimes(1)
    })

    // clearTimeout called in onBeforeUnmount — no dangling timer.
    test('timer is cleared on unmount — no dangling setTimeout', async () => {
      const active_word = ref(0)
      const { result: _result, contentEl, container } = withHighlights({ active_word })
      addWord(contentEl, 0)

      // Trigger a debounce timer.
      active_word.value = 0
      await nextTick()

      // Unmount before the 100ms expires.
      app.unmount()
      app = null

      const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

      // The timer should have been cleared — advancing time fires nothing.
      vi.advanceTimersByTime(200)
      expect(mockScrollWordIntoDeadzone).not.toHaveBeenCalled()

      clearSpy.mockRestore()

      // Manually clean up the container appended by withHighlights.
      container.remove()
    })
  })

  describe('rangeLines', () => {
    // rangeLines is tested indirectly through hover_lines, which is populated by
    // positionInteraction when focus_index/anchor_index/committed changes.
    // We drive state via pointer events and inspect hover_lines after nextTick.

    // single-line range → one CursorBox
    test('single-line range produces exactly one entry in hover_lines', async () => {
      const { result, contentEl } = withHighlights()
      contentEl.getBoundingClientRect = () => new DOMRect(0, 0, 300, 600)

      // Two words on the same visual line (same Y bucket).
      const w0 = addWord(contentEl, 0, '一')
      const w1 = addWord(contentEl, 1, '二')
      const b0 = w0.querySelector('[data-word-base]')
      const b1 = w1.querySelector('[data-word-base]')
      b0.getBoundingClientRect = () => new DOMRect(10, 50, 30, 20)
      b1.getBoundingClientRect = () => new DOMRect(50, 50, 30, 20) // same top → same bucket

      stubElementFromPoint(() => w0)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 15, clientY: 55 })
      )
      document.elementFromPoint = () => w1
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 55, clientY: 55 })
      )
      await nextTick()

      expect(result.hover_lines.value).toHaveLength(1)
    })

    // multi-line range → one box per line
    test('multi-line range produces one hover_lines entry per visual line', async () => {
      const { result, contentEl } = withHighlights()
      contentEl.getBoundingClientRect = () => new DOMRect(0, 0, 300, 600)

      // Word 0 on line 1 (top=50), word 1 on line 2 (top=80) — different Y buckets.
      const w0 = addWord(contentEl, 0, '一')
      const w1 = addWord(contentEl, 1, '二')
      const b0 = w0.querySelector('[data-word-base]')
      const b1 = w1.querySelector('[data-word-base]')
      b0.getBoundingClientRect = () => new DOMRect(10, 50, 30, 20)
      b1.getBoundingClientRect = () => new DOMRect(10, 80, 30, 20) // different top → different bucket

      stubElementFromPoint(() => w0)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 15, clientY: 55 })
      )
      document.elementFromPoint = () => w1
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 15, clientY: 85 })
      )
      await nextTick()

      expect(result.hover_lines.value).toHaveLength(2)

      // Each box should span only its own line's left/right bounds.
      const PAD_X = 3
      const PAD_Y = 2
      const base = { left: 0, top: 0 }

      // Line 1 box
      const box0 = result.hover_lines.value[0]
      expect(box0.left).toBe(b0.getBoundingClientRect().left - base.left - PAD_X)
      expect(box0.top).toBe(b0.getBoundingClientRect().top - base.top - PAD_Y)

      // Line 2 box
      const box1 = result.hover_lines.value[1]
      expect(box1.left).toBe(b1.getBoundingClientRect().left - base.left - PAD_X)
      expect(box1.top).toBe(b1.getBoundingClientRect().top - base.top - PAD_Y)
    })

    // null content ref → returns []
    test('hover_lines stays empty when content is not mounted', async () => {
      // A host that does NOT render ref="content" — content.value will be null.
      const { h: vueH, defineComponent, createApp: vueCreateApp } = require('vue')
      let result_inner

      const container = document.createElement('div')
      document.body.appendChild(container)

      const onSelect = vi.fn()
      const onDismiss = vi.fn()

      const NoContentHost = defineComponent({
        setup() {
          result_inner = useReaderHighlights(
            () => -1,
            onSelect,
            () => false,
            onDismiss,
            undefined,
            { value: { scrollToIndex: vi.fn() } },
            (index) => index
          )
          // Render WITHOUT ref="content" — so content.value stays null.
          return () => vueH('div', {})
        }
      })

      const inner_app = vueCreateApp(NoContentHost)
      inner_app.mount(container)

      // Force the interaction watcher by setting focus_index — but there's no
      // content ref, so rangeLines returns [] immediately.
      // We can't set internal refs directly; instead verify hover_lines stays empty.
      expect(result_inner.hover_lines.value).toEqual([])

      inner_app.unmount()
      container.remove()
    })
  })

  describe('interactionLines — hides excess pills before shrinking hover_lines', () => {
    // Going from a 2-line selection to a 1-line selection should call
    // hideReaderCursor on the second pill element before Vue removes it — i.e.,
    // before hover_lines shrinks. We verify hideReaderCursor is called with an
    // element that was registered at index ≥ new line count.
    test('calls hideReaderCursor on excess pill elements before shrinking hover_lines', async () => {
      const { result, contentEl } = withHighlights()
      contentEl.getBoundingClientRect = () => new DOMRect(0, 0, 300, 600)

      // Seed two words on different lines so hover_lines gets 2 entries.
      const w0 = addWord(contentEl, 0, '一')
      const w1 = addWord(contentEl, 1, '二')
      const b0 = w0.querySelector('[data-word-base]')
      const b1 = w1.querySelector('[data-word-base]')
      b0.getBoundingClientRect = () => new DOMRect(10, 50, 30, 20)
      b1.getBoundingClientRect = () => new DOMRect(10, 80, 30, 20)

      // Begin drag across both words so hover_lines = [{line1}, {line2}].
      stubElementFromPoint(() => w0)
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: 15, clientY: 55 })
      )
      document.elementFromPoint = () => w1
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 15, clientY: 85 })
      )
      await nextTick()
      expect(result.hover_lines.value).toHaveLength(2)

      // Register fake pill elements via setHoverEl — simulating what the template
      // `:ref` callback does when it mounts the rendered pill divs.
      const pill0 = document.createElement('div')
      const pill1 = document.createElement('div')
      result.setHoverEl(pill0, 0)
      result.setHoverEl(pill1, 1)

      mockHideReaderCursor.mockClear()

      // Now move focus back to word 0 only — single line → hover_lines shrinks to 1.
      document.elementFromPoint = () => w0
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 15, clientY: 55 })
      )
      await nextTick()

      // hideReaderCursor must have been called for pill1 (index 1 ≥ new length 1).
      expect(mockHideReaderCursor).toHaveBeenCalledWith(pill1)
    })
  })

  // ── Follow toggle ────────────────────────────────────────────────

  describe('follow toggle — following flag', () => {
    test('following starts true', () => {
      const { result } = withHighlights()
      expect(result.following.value).toBe(true)
    })

    describe('with fake timers', () => {
      beforeEach(() => vi.useFakeTimers())
      afterEach(() => vi.useRealTimers())

      test('followActiveWord is a no-op while following is false', async () => {
        const active_word = ref(0)
        const { result, contentEl } = withHighlights({ active_word })
        addWord(contentEl, 0)

        // Disable follow so the composable gate fires.
        result.following.value = false

        active_word.value = 0
        await nextTick()
        vi.advanceTimersByTime(200)

        expect(mockScrollWordIntoDeadzone).not.toHaveBeenCalled()
      })

      // A debounced scroll queued *before* following goes false must NOT execute once
      // the flag flips — the gate is checked at execution time inside the setTimeout.
      test('a queued follow scroll is aborted when following flips false before timeout fires', async () => {
        const active_word = ref(0)
        const { result, contentEl } = withHighlights({ active_word })
        addWord(contentEl, 0)

        // Trigger the debounce — following is still true here.
        active_word.value = 0
        await nextTick()

        // Flip following off *before* the 100ms debounce fires.
        result.following.value = false

        vi.advanceTimersByTime(200)

        // The gate inside the setTimeout must have stopped the scroll.
        expect(mockScrollWordIntoDeadzone).not.toHaveBeenCalled()
      })
    })
  })

  describe('follow toggle — disableFollow trigger paths', () => {
    test('touch drift past TAP_SLOP calls disableFollow — sets following false and cancels scroll', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 1)
      stubElementFromPoint(() => wordEl)

      expect(result.following.value).toBe(true)

      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 })
      )
      // Drift well past the 10px slop.
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'touch', clientX: 10, clientY: 50 })
      )
      await nextTick()

      expect(result.following.value).toBe(false)
      expect(mockCancelScroll).toHaveBeenCalledTimes(1)
    })

    test('onPointerCancel (without range-select armed) calls disableFollow — sets following false', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 2)
      stubElementFromPoint(() => wordEl)

      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 })
      )
      result.onPointerCancel(new PointerEvent('pointercancel', { pointerType: 'touch' }))
      await nextTick()

      expect(result.following.value).toBe(false)
    })

    describe('with fake timers', () => {
      beforeEach(() => vi.useFakeTimers())
      afterEach(() => vi.useRealTimers())

      test('onPointerCancel during an armed range-select does NOT disable follow', async () => {
        const { result, contentEl } = withHighlights()
        const wordEl = addWord(contentEl, 2)
        stubElementFromPoint(() => wordEl)

        result.onPointerDown(
          new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 })
        )
        // Arm range-select (touch_selecting = true).
        vi.advanceTimersByTime(410)
        await nextTick()

        // Cancel while range-select is armed — must NOT disable follow.
        result.onPointerCancel(new PointerEvent('pointercancel', { pointerType: 'touch' }))
        await nextTick()

        expect(result.following.value).toBe(true)
      })
    })

    test('wheel event disables follow', async () => {
      const { result } = withHighlights()
      expect(result.following.value).toBe(true)

      window.dispatchEvent(new Event('wheel'))
      await nextTick()

      expect(result.following.value).toBe(false)
      expect(mockCancelScroll).toHaveBeenCalledTimes(1)
    })

    test('disableFollow is idempotent — second call while already false is a no-op', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 1)
      stubElementFromPoint(() => wordEl)

      // First disable via touch drift.
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 })
      )
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'touch', clientX: 10, clientY: 50 })
      )
      await nextTick()
      expect(result.following.value).toBe(false)
      const cancelCallCount = mockCancelScroll.mock.calls.length

      // Second disable — cancelScroll must NOT be called again.
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 })
      )
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'touch', clientX: 10, clientY: 50 })
      )
      await nextTick()

      expect(mockCancelScroll.mock.calls.length).toBe(cancelCallCount)
    })
  })

  describe('resumeFollow', () => {
    test('resumeFollow sets following back to true', async () => {
      const { result, contentEl } = withHighlights()
      const wordEl = addWord(contentEl, 1)
      stubElementFromPoint(() => wordEl)

      // Disable first via touch drift.
      result.onPointerDown(
        new PointerEvent('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 })
      )
      result.onPointerMove(
        new PointerEvent('pointermove', { pointerType: 'touch', clientX: 10, clientY: 50 })
      )
      await nextTick()
      expect(result.following.value).toBe(false)

      result.resumeFollow()

      expect(result.following.value).toBe(true)
    })

    test('resumeFollow calls scrollLineIntoView with animate=true', async () => {
      const active_word = ref(0)
      const { result, contentEl } = withHighlights({ active_word })
      addWord(contentEl, 0)

      // Disable follow first.
      result.following.value = false
      mockScrollLineIntoView.mockClear()

      await result.resumeFollow()

      expect(mockScrollLineIntoView).toHaveBeenCalledTimes(1)
      const [, animate] = mockScrollLineIntoView.mock.calls[0]
      expect(animate).toBe(true)
    })
  })

  describe('disableFollow — no auto re-arm', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    test('following stays off well past the old idle window, with no manual resume tap', async () => {
      const { result } = withHighlights()
      expect(result.following.value).toBe(true)

      window.dispatchEvent(new Event('wheel'))
      await nextTick()
      expect(result.following.value).toBe(false)

      vi.advanceTimersByTime(60_000)
      await nextTick()

      expect(result.following.value).toBe(false)
    })

    test('only a resumeFollow call turns following back on', async () => {
      const { result } = withHighlights()

      window.dispatchEvent(new Event('wheel'))
      await nextTick()
      vi.advanceTimersByTime(60_000)
      await nextTick()
      expect(result.following.value).toBe(false)

      result.resumeFollow()

      expect(result.following.value).toBe(true)
    })
  })

  describe('follow_direction', () => {
    test('follow_direction is "up" when the active word centre is above the viewport centre', async () => {
      const active_word = ref(0)
      const { result, contentEl } = withHighlights({ active_word })
      const word = addWord(contentEl, 0)
      // Word top=10, bottom=20 → centre=15; viewport centre defaults to
      // window.innerHeight/2 in jsdom (typically 768/2=384). 15 < 384 → 'up'.
      word.getBoundingClientRect = () => new DOMRect(0, 10, 40, 10)

      // Disable follow so follow_direction is updated.
      result.following.value = false

      // Simulate a window scroll event to trigger trackFollowDirection.
      window.dispatchEvent(new Event('scroll'))
      await nextTick()

      expect(result.follow_direction.value).toBe('up')
    })

    test('follow_direction is "down" when the active word centre is below the viewport centre', async () => {
      const active_word = ref(0)
      const { result, contentEl } = withHighlights({ active_word })
      const word = addWord(contentEl, 0)
      // Viewport centre in jsdom ≈ 384. Word top=800, bottom=820 → centre=810 > 384 → 'down'.
      word.getBoundingClientRect = () => new DOMRect(0, 800, 40, 20)

      result.following.value = false

      window.dispatchEvent(new Event('scroll'))
      await nextTick()

      expect(result.follow_direction.value).toBe('down')
    })

    test('scroll event does NOT update follow_direction while following is true', async () => {
      const active_word = ref(0)
      const { result, contentEl } = withHighlights({ active_word })
      const word = addWord(contentEl, 0)
      word.getBoundingClientRect = () => new DOMRect(0, 10, 40, 10)

      // following is true by default — scroll must not change direction.
      const initial = result.follow_direction.value

      window.dispatchEvent(new Event('scroll'))
      await nextTick()

      expect(result.follow_direction.value).toBe(initial)
    })

    test('follow_direction is recomputed when the active word advances while follow is off', async () => {
      const active_word = ref(0)
      const { result, contentEl } = withHighlights({ active_word })
      const w0 = addWord(contentEl, 0)
      const w1 = addWord(contentEl, 1)

      // w0 above centre → 'up'.
      w0.getBoundingClientRect = () => new DOMRect(0, 10, 40, 10)
      // w1 below centre → 'down'.
      w1.getBoundingClientRect = () => new DOMRect(0, 800, 40, 20)

      result.following.value = false
      window.dispatchEvent(new Event('scroll'))
      await nextTick()
      expect(result.follow_direction.value).toBe('up')

      // Advance active_word — watcher fires trackFollowDirection.
      active_word.value = 1
      await nextTick()

      expect(result.follow_direction.value).toBe('down')
    })
  })
})
