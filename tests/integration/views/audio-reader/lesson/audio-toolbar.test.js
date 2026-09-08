import { describe, test, expect, vi, beforeEach, afterEach } from 'vite-plus/test'
import { shallowMount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockEmitSfx } = vi.hoisted(() => ({ mockEmitSfx: vi.fn() }))

vi.mock('@/sfx/bus', () => ({
  emitSfx: mockEmitSfx,
  emitHoverSfx: vi.fn()
}))

vi.mock('gsap', () => ({
  gsap: {
    fromTo: vi.fn((_el, _from, to) => to?.onComplete?.()),
    to: vi.fn((_el, opts) => opts?.onComplete?.())
  }
}))

// Mock usePlayOnTap — the tap-animation intercept is a cross-cutting concern
// not under test here. The mock just returns a no-op `interceptClick` so the
// component mounts without GSAP / media-query dependencies.
vi.mock('@/composables/use-play-on-tap', () => ({
  usePlayOnTap: vi.fn(() => ({
    playing: { value: false },
    interceptClick: vi.fn()
  }))
}))

// Mock useLocalRef so toolbar-mode is in-memory (not real localStorage) per test.
// localRefStore.next holds the value to seed the ref with on the next mount.
// Each test resets this to 'expanded' in beforeEach; tests that want 'mini' set it
// before mounting.
const localRefStore = vi.hoisted(() => ({ ref: null, next: 'expanded' }))

vi.mock('@/composables/storage/local-ref', async () => {
  const { ref: vRef } = await import('vue')
  return {
    useLocalRef: vi.fn(() => {
      if (!localRefStore.ref) localRefStore.ref = vRef(localRefStore.next)
      return localRefStore.ref
    })
  }
})

vi.mock('@floating-ui/vue', () => ({
  useFloating: vi.fn(() => ({
    placement: { value: 'bottom-start' },
    middlewareData: { value: {} },
    floatingStyles: { value: {} }
  })),
  shift: vi.fn(() => ({})),
  flip: vi.fn(() => ({})),
  autoUpdate: vi.fn(),
  arrow: vi.fn(() => ({})),
  offset: vi.fn(() => ({})),
  hide: vi.fn(() => ({})),
  size: vi.fn(() => ({}))
}))

// ── Stubs ──────────────────────────────────────────────────────────────────────

const UiButtonStub = defineComponent({
  name: 'UiButton',
  inheritAttrs: false,
  props: ['size', 'variant', 'inverted', 'fullWidth', 'iconLeft', 'iconOnly', 'sfx', 'playOnTap'],
  emits: ['press'],
  setup(props, { slots, attrs, emit }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          onClick: (e) => {
            attrs.onClick?.(e)
            emit('press')
          }
        },
        [slots.default?.(), slots.trailing?.()]
      )
  }
})

const UiIconStub = defineComponent({
  name: 'UiIcon',
  props: ['src'],
  setup(props) {
    return () => h('span', { 'data-testid': 'ui-icon', 'data-src': props.src })
  }
})

const UiDropdownButtonStub = defineComponent({
  name: 'UiDropdownButton',
  inheritAttrs: false,
  props: ['options', 'position', 'openOnTrigger', 'iconLeft'],
  emits: ['select'],
  setup(props, { slots, attrs, emit }) {
    return () =>
      h('div', { ...attrs, 'data-testid': attrs['data-testid'] ?? 'ui-dropdown-button' }, [
        slots.default?.(),
        h(
          'div',
          { 'data-testid': 'dropdown-button__options' },
          (props.options ?? []).map((opt) =>
            h(
              'button',
              {
                key: opt.value,
                'data-testid': 'dropdown-button__option',
                'data-value': opt.value,
                onClick: () => emit('select', opt)
              },
              opt.label
            )
          )
        )
      ])
  }
})

const ScrubberStub = defineComponent({
  name: 'Scrubber',
  props: ['player', 'layout'],
  setup(props) {
    return () => h('div', { 'data-testid': 'scrubber-stub', 'data-layout': props.layout })
  }
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    current_time: ref(0),
    duration: ref(120),
    is_playing: ref(false),
    playback_rate: ref(1),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    skip: vi.fn(),
    setPlaybackRate: vi.fn(),
    playClip: vi.fn(),
    ...overrides
  }
}

const DEFAULT_CHAPTERS = [
  { id: 1, title: 'Intro' },
  { id: 2, title: 'Part Two' },
  { id: 3, title: 'Conclusion' }
]

// ── Mount helper ────────────────────────────────────────────────────────────────

import AudioToolbar from '@/views/audio-reader/lesson/audio-toolbar.vue'

function mountToolbar(props = {}) {
  return shallowMount(AudioToolbar, {
    props: {
      player: makePlayer(),
      chapters: DEFAULT_CHAPTERS,
      currentLessonId: 1,
      ...props
    },
    global: {
      stubs: {
        UiButton: UiButtonStub,
        UiIcon: UiIconStub,
        UiDropdownButton: UiDropdownButtonStub,
        Scrubber: ScrubberStub
      }
    }
  })
}

describe('AudioToolbar', () => {
  beforeEach(() => {
    mockEmitSfx.mockClear()
    localStorage.clear()
    // Reset the localRef between tests so each mount starts fresh.
    localRefStore.ref = null
    localRefStore.next = 'expanded'
  })

  afterEach(() => {
    localStorage.clear()
  })

  // ── Mode persistence (useLocalRef) ─────────────────────────────────────────

  test('defaults to expanded mode and renders audio-toolbar__expanded', () => {
    const wrapper = mountToolbar()

    expect(wrapper.find('[data-testid="audio-toolbar__expanded"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audio-toolbar__mini"]').exists()).toBe(false)
  })

  test('clicking audio-toolbar__collapse switches to mini mode', async () => {
    const wrapper = mountToolbar()

    await wrapper.find('[data-testid="audio-toolbar__collapse"]').trigger('click')

    expect(wrapper.find('[data-testid="audio-toolbar__mini"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audio-toolbar__expanded"]').exists()).toBe(false)
  })

  test('mode change is written to the localRef (simulates localStorage write)', async () => {
    const wrapper = mountToolbar()

    await wrapper.find('[data-testid="audio-toolbar__collapse"]').trigger('click')

    expect(localRefStore.ref.value).toBe('mini')
  })

  test('a fresh mount with stored mini mode renders mini', () => {
    // Simulate a previous session having stored 'mini' — set next before mount
    localRefStore.next = 'mini'

    const wrapper = mountToolbar()

    expect(wrapper.find('[data-testid="audio-toolbar__mini"]').exists()).toBe(true)
  })

  test('clicking audio-toolbar__expand switches back to expanded mode', async () => {
    localRefStore.next = 'mini'
    const wrapper = mountToolbar()

    await wrapper.find('[data-testid="audio-toolbar__expand"]').trigger('click')

    expect(wrapper.find('[data-testid="audio-toolbar__expanded"]').exists()).toBe(true)
  })

  // ── Mini mode controls ───────────────────────────────────────

  test('mini mode renders all five controls via data-testid', () => {
    localRefStore.next = 'mini'
    const wrapper = mountToolbar()

    expect(wrapper.find('[data-testid="audio-toolbar__expand"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audio-toolbar__skip-back"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audio-toolbar__toggle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audio-toolbar__skip-forward"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audio-toolbar__speed-select"]').exists()).toBe(true)
  })

  test('mini mode audio-toolbar__toggle calls player.play() when paused', async () => {
    localRefStore.next = 'mini'
    const player = makePlayer({ is_playing: ref(false) })
    const wrapper = mountToolbar({ player })

    await wrapper.find('[data-testid="audio-toolbar__toggle"]').trigger('click')

    expect(player.play).toHaveBeenCalledOnce()
  })

  test('mini mode audio-toolbar__toggle calls player.pause() when playing', async () => {
    localRefStore.next = 'mini'
    const player = makePlayer({ is_playing: ref(true) })
    const wrapper = mountToolbar({ player })

    await wrapper.find('[data-testid="audio-toolbar__toggle"]').trigger('click')

    expect(player.pause).toHaveBeenCalledOnce()
  })

  test('mini mode audio-toolbar__skip-back calls player.skip(-10)', async () => {
    localRefStore.next = 'mini'
    const player = makePlayer()
    const wrapper = mountToolbar({ player })

    await wrapper.find('[data-testid="audio-toolbar__skip-back"]').trigger('click')

    expect(player.skip).toHaveBeenCalledWith(-10)
  })

  test('mini mode audio-toolbar__skip-forward calls player.skip(10)', async () => {
    localRefStore.next = 'mini'
    const player = makePlayer()
    const wrapper = mountToolbar({ player })

    await wrapper.find('[data-testid="audio-toolbar__skip-forward"]').trigger('click')

    expect(player.skip).toHaveBeenCalledWith(10)
  })

  test('mini mode audio-toolbar__speed-select calls player.setPlaybackRate', async () => {
    localRefStore.next = 'mini'
    const player = makePlayer()
    const wrapper = mountToolbar({ player })

    const speedDropdown = wrapper.find('[data-testid="audio-toolbar__speed-select"]')
    const options = speedDropdown.findAll('[data-testid="dropdown-button__option"]')
    // Options: 0.5x, 0.75x, 1x, 1.5x, 2x — click 2x (index 4)
    await options[4].trigger('click')

    expect(player.setPlaybackRate).toHaveBeenCalledWith(2)
  })

  // ── Transport actions ──────────────────────────────────────────────────────

  test('audio-toolbar__toggle calls player.play() when paused', async () => {
    const player = makePlayer({ is_playing: ref(false) })
    const wrapper = mountToolbar({ player })

    await wrapper.find('[data-testid="audio-toolbar__toggle"]').trigger('click')

    expect(player.play).toHaveBeenCalledOnce()
    expect(player.pause).not.toHaveBeenCalled()
  })

  test('audio-toolbar__toggle calls player.pause() when playing', async () => {
    const player = makePlayer({ is_playing: ref(true) })
    const wrapper = mountToolbar({ player })

    await wrapper.find('[data-testid="audio-toolbar__toggle"]').trigger('click')

    expect(player.pause).toHaveBeenCalledOnce()
    expect(player.play).not.toHaveBeenCalled()
  })

  test('audio-toolbar__skip-back calls player.skip(-10)', async () => {
    const player = makePlayer()
    const wrapper = mountToolbar({ player })

    await wrapper.find('[data-testid="audio-toolbar__skip-back"]').trigger('click')

    expect(player.skip).toHaveBeenCalledWith(-10)
  })

  test('audio-toolbar__skip-forward calls player.skip(10)', async () => {
    const player = makePlayer()
    const wrapper = mountToolbar({ player })

    await wrapper.find('[data-testid="audio-toolbar__skip-forward"]').trigger('click')

    expect(player.skip).toHaveBeenCalledWith(10)
  })

  // ── Sfx wiring ─────────────────────────────────────────────────────────────

  test('skip-back click.capture emits ui.press sfx', async () => {
    const wrapper = mountToolbar()

    // click.capture fires on the element's capture phase — trigger('click') fires
    // the click event which is caught by the @click.capture="onBackTap" handler
    await wrapper.find('[data-testid="audio-toolbar__skip-back"]').trigger('click')

    expect(mockEmitSfx).toHaveBeenCalledWith('ui.press')
  })

  test('skip-forward click.capture emits ui.press sfx', async () => {
    const wrapper = mountToolbar()

    await wrapper.find('[data-testid="audio-toolbar__skip-forward"]').trigger('click')

    expect(mockEmitSfx).toHaveBeenCalledWith('ui.press')
  })

  test('play/pause toggle click.capture emits ui.press when paused', async () => {
    const player = makePlayer({ is_playing: ref(false) })
    const wrapper = mountToolbar({ player })

    await wrapper.find('[data-testid="audio-toolbar__toggle"]').trigger('click')

    expect(mockEmitSfx).toHaveBeenCalledWith('ui.press')
  })

  test('play/pause toggle click.capture emits dialog.open when playing', async () => {
    const player = makePlayer({ is_playing: ref(true) })
    const wrapper = mountToolbar({ player })

    await wrapper.find('[data-testid="audio-toolbar__toggle"]').trigger('click')

    expect(mockEmitSfx).toHaveBeenCalledWith('dialog.open')
  })

  // ── Dropdown wiring: chapters ──────────────────────────────────────────────

  test('collection-level chapter options are numbered with a 1-based prefix', () => {
    const wrapper = mountToolbar({
      chapters: [
        { id: 10, title: 'Intro' },
        { id: 20, title: 'Part Two' }
      ]
    })

    const chapterDropdown = wrapper.find('[data-testid="audio-toolbar__chapter-select"]')
    const options = chapterDropdown.findAll('[data-testid="dropdown-button__option"]')

    expect(options[0].text()).toBe('1. Intro')
    expect(options[1].text()).toBe('2. Part Two')
  })

  test('internal lesson-chapter options are numbered with a 1-based prefix', () => {
    const wrapper = mountToolbar({
      lessonChapters: [
        { start: 0, title: 'Warm-up' },
        { start: 30, title: 'Vocabulary' }
      ]
    })

    const chapterDropdown = wrapper.find('[data-testid="audio-toolbar__chapter-select"]')
    const options = chapterDropdown.findAll('[data-testid="dropdown-button__option"]')

    expect(options[0].text()).toBe('1. Warm-up')
    expect(options[1].text()).toBe('2. Vocabulary')
  })

  test('current chapter label is the bare chapter title (no number prefix)', () => {
    const wrapper = mountToolbar({
      chapters: [
        { id: 10, title: 'Intro' },
        { id: 20, title: 'Part Two' }
      ],
      currentLessonId: 10
    })

    // Scoped to the label span (not the whole dropdown, which also renders the
    // numbered options list) — the current-chapter label itself stays bare.
    const label = wrapper.find('[data-testid="audio-toolbar__chapter-label"]')
    expect(label.text()).toBe('Intro')
    expect(label.text()).not.toMatch(/\d+\.\s/)
  })

  test('selecting a chapter option emits select-chapter with Number(value)', async () => {
    const wrapper = mountToolbar({
      chapters: [
        { id: 10, title: 'Intro' },
        { id: 20, title: 'Part Two' }
      ],
      currentLessonId: 10
    })

    const chapterDropdown = wrapper.find('[data-testid="audio-toolbar__chapter-select"]')
    const options = chapterDropdown.findAll('[data-testid="dropdown-button__option"]')
    await options[1].trigger('click')

    expect(wrapper.emitted('select-chapter')).toHaveLength(1)
    expect(wrapper.emitted('select-chapter')[0][0]).toBe(20)
    expect(typeof wrapper.emitted('select-chapter')[0][0]).toBe('number')
  })

  // ── Dropdown wiring: speed ─────────────────────────────────────────────────

  test('selecting a speed option calls player.setPlaybackRate(Number(value))', async () => {
    const player = makePlayer()
    const wrapper = mountToolbar({ player })

    const speedDropdown = wrapper.find('[data-testid="audio-toolbar__speed-select"]')
    const options = speedDropdown.findAll('[data-testid="dropdown-button__option"]')
    // Options are: 0.5x, 0.75x, 1x, 1.5x, 2x — click 1.5x (index 3)
    await options[3].trigger('click')

    expect(player.setPlaybackRate).toHaveBeenCalledWith(1.5)
    expect(typeof player.setPlaybackRate.mock.calls[0][0]).toBe('number')
  })

  // ── showSpeed: speed dropdown vs. display-settings trigger ─────────────────

  test('expanded mode shows the speed dropdown by default (showSpeed unset)', () => {
    const wrapper = mountToolbar()

    expect(wrapper.find('[data-testid="audio-toolbar__speed-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="audio-toolbar__display-settings"]').exists()).toBe(false)
  })

  test('expanded mode swaps the speed dropdown for the display-settings trigger when showSpeed is false', () => {
    const wrapper = mountToolbar({ showSpeed: false })

    expect(wrapper.find('[data-testid="audio-toolbar__speed-select"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="audio-toolbar__display-settings"]').exists()).toBe(true)
  })

  test('mini mode swaps the speed dropdown for the display-settings trigger when showSpeed is false', () => {
    localRefStore.next = 'mini'
    const wrapper = mountToolbar({ showSpeed: false })

    expect(wrapper.find('[data-testid="audio-toolbar__speed-select"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="audio-toolbar__display-settings"]').exists()).toBe(true)
  })

  test('clicking the display-settings trigger emits open-settings', async () => {
    const wrapper = mountToolbar({ showSpeed: false })

    await wrapper.find('[data-testid="audio-toolbar__display-settings"]').trigger('click')

    expect(wrapper.emitted('open-settings')).toHaveLength(1)
  })

  test('clicking the mini display-settings trigger emits open-settings', async () => {
    localRefStore.next = 'mini'
    const wrapper = mountToolbar({ showSpeed: false })

    await wrapper.find('[data-testid="audio-toolbar__display-settings"]').trigger('click')

    expect(wrapper.emitted('open-settings')).toHaveLength(1)
  })
})
