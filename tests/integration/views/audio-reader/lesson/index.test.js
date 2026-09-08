import { describe, test, expect, vi, beforeEach, afterEach } from 'vite-plus/test'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref, nextTick } from 'vue'

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
// Plain-object refs suffice for state the script reads via .value (watch, onMounted).
// For values that Vue's template auto-unwraps (selection, popover_open)
// we need real Vue refs — created at module level after imports so the template
// reactive system sees them as refs and auto-unwraps them correctly.

// Drives `useMatchMedia('w>=xl')` — false = mobile (term in dock), true = desktop
// (term in sidebar). Defaults mobile; desktop tests flip it. Hoisted as a real Vue
// ref because `use-mobile-dock` resolves its media queries at module-import time,
// which runs before this file's top-level statements.
const { isDesktopRef } = await vi.hoisted(async () => {
  const { ref: vueRef } = await import('vue')
  return { isDesktopRef: vueRef(false) }
})

const {
  lessonRef,
  paragraphsRef,
  audioUrlRef,
  activeWordRef,
  targetLang,
  openTermMock,
  closeTermMock,
  playFromHereMock,
  playClipMock,
  playerRef,
  chaptersRef,
  progressMutate,
  useReaderProgressMock,
  editModalOpenMock,
  routerPushMock,
  emitSfxMock
} = vi.hoisted(() => ({
  lessonRef: { value: { id: 2, title: 'Hiragana Basics' } },
  paragraphsRef: { value: [] },
  audioUrlRef: { value: null },
  activeWordRef: { value: null },
  targetLang: 'English',
  openTermMock: vi.fn(),
  closeTermMock: vi.fn(),
  playFromHereMock: vi.fn(),
  playClipMock: vi.fn(),
  playerRef: {
    is_playing: { value: false },
    seek: vi.fn(),
    play: vi.fn()
  },
  chaptersRef: { value: [] },
  progressMutate: vi.fn(),
  useReaderProgressMock: vi.fn(() => ({ restored: { value: true } })),
  editModalOpenMock: vi.fn(),
  routerPushMock: vi.fn(),
  emitSfxMock: vi.fn()
}))

// Real Vue refs for template-reactive state. Created here (after imports) so
// `ref()` is available. The vi.mock factories below close over these variables.
const selectionRef = ref(null)
const popoverOpenRef = ref(false)
const displayModeRef = ref('inline')
const translationSourceRef = ref('playback')

vi.mock('@/composables/audio-reader/reader-prefs', () => ({
  useReaderPrefs: () => ({
    display_mode: displayModeRef,
    translation_source: translationSourceRef
  })
}))

vi.mock('@/composables/audio-reader/lesson-reader', () => ({
  useLessonReader: () => ({
    lesson: lessonRef,
    paragraphs: paragraphsRef,
    audio_url: audioUrlRef,
    active_word: activeWordRef,
    selection: selectionRef,
    popover_open: popoverOpenRef,
    target_lang: targetLang,
    openTerm: openTermMock,
    closeTerm: closeTermMock,
    playFromHere: playFromHereMock,
    playClip: playClipMock,
    player: playerRef
  })
}))

vi.mock('@/composables/audio-reader/reader-progress', () => ({
  useReaderProgress: useReaderProgressMock
}))

vi.mock('@/composables/ui/animated-height', () => ({
  useAnimatedHeight: vi.fn()
}))

vi.mock('@/composables/ui/media-query', () => ({
  useMatchMedia: () => isDesktopRef
}))

vi.mock('@/utils/animations/transcript-scroll', () => ({
  cancelScroll: vi.fn(),
  scrollClearOf: vi.fn(),
  scrollLineIntoView: vi.fn(),
  scrollWordIntoDeadzone: vi.fn()
}))

vi.mock('@/api/lessons', () => ({
  useLessonsByCollectionQuery: () => ({ data: chaptersRef }),
  useSetCollectionProgressMutation: () => ({ mutate: progressMutate }),
  useLessonCollectionsQuery: () => ({ data: { value: [] } }),
  useLessonCollectionQuery: () => ({ data: { value: null } }),
  useLessonQuery: () => ({ data: { value: null }, error: { value: null } }),
  useLessonAudioUrlQuery: () => ({ data: { value: null } }),
  useStartLessonMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteLessonMutation: () => ({ mutateAsync: vi.fn() }),
  useRetryLessonMutation: () => ({ mutateAsync: vi.fn() }),
  useCreateLessonCollectionMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteLessonCollectionMutation: () => ({ mutateAsync: vi.fn() }),
  useTranslateTermMutation: () => ({ mutateAsync: vi.fn() }),
  resolveCollectionEntryLesson: vi.fn(),
  EdgeFunctionError: class EdgeFunctionError extends Error {}
}))

vi.mock('@/composables/audio-reader/collection-edit-modal', () => ({
  useCollectionEditModal: () => ({ open: editModalOpenMock })
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPushMock })
}))

vi.mock('@/sfx/bus', () => ({
  emitSfx: emitSfxMock,
  emitHoverSfx: vi.fn()
}))

// ── Stubs ──────────────────────────────────────────────────────────────────────

// ── Stubs ──────────────────────────────────────────────────────────────────────

const UiButtonStub = defineComponent({
  name: 'UiButton',
  inheritAttrs: false,
  props: ['iconLeft', 'iconOnly', 'size', 'sfx'],
  emits: ['press'],
  setup(_p, { slots, attrs, emit }) {
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
        [slots.default?.()]
      )
  }
})

// Controllable follow state so tests can simulate the transcript exposing
// following/follow_direction/resumeFollow (the lesson view reads these via ref="transcript").
const transcriptFollowing = ref(true)
const transcriptFollowDirection = ref('down')
const transcriptResumeMock = vi.fn()
const transcriptActiveTranslation = ref(null)
const transcriptCenteredTranslation = ref(null)

const TranscriptViewStub = defineComponent({
  name: 'TranscriptView',
  props: ['paragraphs', 'active_word', 'popover_open', 'hide_inline_translation'],
  emits: ['select', 'dismiss'],
  setup(_props, { emit, expose }) {
    expose({
      following: transcriptFollowing,
      follow_direction: transcriptFollowDirection,
      resumeFollow: transcriptResumeMock,
      active_translation: transcriptActiveTranslation,
      centered_translation: transcriptCenteredTranslation
    })
    return () =>
      h('div', { 'data-testid': 'transcript-view-stub' }, [
        h('button', {
          'data-testid': 'transcript-stub__dismiss',
          onClick: () => emit('dismiss')
        })
      ])
  }
})

const TermCardStub = defineComponent({
  name: 'TermCard',
  props: ['term', 'sentence', 'target_lang', 'show_back'],
  emits: ['back', 'close', 'play-from-here', 'play-word'],
  setup(_props, { emit }) {
    return () =>
      h('div', { 'data-testid': 'term-card-stub' }, [
        h('button', { 'data-testid': 'term-card-stub__back', onClick: () => emit('back') }),
        h('button', { 'data-testid': 'term-card-stub__close', onClick: () => emit('close') }),
        h('button', {
          'data-testid': 'term-card-stub__play-from-here',
          onClick: () => emit('play-from-here')
        }),
        h('button', {
          'data-testid': 'term-card-stub__play-word',
          onClick: () => emit('play-word')
        })
      ])
  }
})

// Renders the dock's content inline so its panes are assertable — the real
// component teleports into the host, which isn't mounted in this view test.
// Also render the `above` slot inline so the resume-follow button is assertable.
const MobileDockStub = defineComponent({
  name: 'MobileDock',
  setup(_props, { slots }) {
    return () =>
      h('div', { 'data-testid': 'mobile-dock-stub' }, [slots.above?.(), slots.default?.()])
  }
})

// Passthrough — render the active pane directly (no crossfade transition) so the
// dock-placement assertions see exactly one pane at a time.
const CrossfadeResizeStub = defineComponent({
  name: 'CrossfadeResize',
  emits: ['swap-start', 'swap-end'],
  setup(_props, { slots }) {
    return () => h('div', { 'data-testid': 'crossfade-resize-stub' }, slots.default?.())
  }
})

// ── Component import (after mocks) ────────────────────────────────────────────

import LessonView from '@/views/audio-reader/lesson/index.vue'
import AudioToolbar from '@/views/audio-reader/lesson/audio-toolbar.vue'
import { useAnimatedHeight } from '@/composables/ui/animated-height'
import { useMobileDock } from '@/components/mobile-dock/use-mobile-dock'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CHAPTERS = [
  { id: 1, title: 'Chapter One' },
  { id: 2, title: 'Chapter Two' },
  { id: 3, title: 'Chapter Three' }
]

const COLLECTION_ID = '5'
const LESSON_ID = '2'

function mountView(props = {}) {
  return shallowMount(LessonView, {
    props: { collectionId: COLLECTION_ID, lessonId: LESSON_ID, ...props },
    global: {
      stubs: {
        Teleport: true,
        TranscriptView: TranscriptViewStub,
        TermCard: TermCardStub,
        MobileDock: MobileDockStub,
        CrossfadeResize: CrossfadeResizeStub,
        UiButton: UiButtonStub
      }
    }
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  lessonRef.value = { id: 2, title: 'Hiragana Basics' }
  chaptersRef.value = []
  selectionRef.value = null
  popoverOpenRef.value = false
  isDesktopRef.value = false
  progressMutate.mockClear()
  editModalOpenMock.mockClear()
  routerPushMock.mockClear()
  useReaderProgressMock.mockClear()
  openTermMock.mockClear()
  closeTermMock.mockClear()
  playFromHereMock.mockClear()
  playClipMock.mockClear()
  emitSfxMock.mockClear()
  transcriptFollowing.value = true
  transcriptFollowDirection.value = 'down'
  transcriptResumeMock.mockClear()
  transcriptActiveTranslation.value = null
  transcriptCenteredTranslation.value = null
  displayModeRef.value = 'inline'
  translationSourceRef.value = 'playback'
  playerRef.seek.mockClear()
  playerRef.play.mockClear()
  useMobileDock().height_claims.value = 0
  // Fire rAF callbacks synchronously so show_term_in_dock_deferred flips
  // in the same tick as nextTick() — avoids the one-frame lag in tests.
  vi.stubGlobal('requestAnimationFrame', (cb) => cb())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LessonView', () => {
  describe('progress tracking', () => {
    test('hands the collection id, lesson id, and player to useReaderProgress', async () => {
      mountView()
      await flushPromises()

      expect(useReaderProgressMock).toHaveBeenCalledOnce()
      const [collectionArg, lessonArg, playerArg] = useReaderProgressMock.mock.calls[0]
      expect(collectionArg.value).toBe(5)
      expect(lessonArg.value).toBe(2)
      expect(playerArg).toBe(playerRef)
    })
  })

  describe('chapter navigation via toolbar', () => {
    test('the audio toolbar select-chapter event navigates to that chapter', async () => {
      chaptersRef.value = CHAPTERS
      const wrapper = mountView({ lessonId: '2' })

      wrapper.findComponent(AudioToolbar).vm.$emit('select-chapter', 1)
      await flushPromises()

      expect(routerPushMock).toHaveBeenCalledWith({
        name: 'lesson',
        params: { collectionId: 5, lessonId: 1 }
      })
    })

    test('the audio toolbar seek event seeks the player and plays', async () => {
      chaptersRef.value = CHAPTERS
      const wrapper = mountView({ lessonId: '2' })

      wrapper.findComponent(AudioToolbar).vm.$emit('seek', 42)
      await flushPromises()

      expect(playerRef.seek).toHaveBeenCalledWith(42)
      expect(playerRef.play).toHaveBeenCalledOnce()
    })
  })

  describe('chapter list', () => {
    test('current chapter button has data-active="true"', () => {
      chaptersRef.value = CHAPTERS
      const wrapper = mountView({ lessonId: '2' })

      const buttons = wrapper.findAll('[data-testid="lesson-view__chapter"]')
      const active = buttons.filter((b) => b.attributes('data-active') === 'true')

      expect(active).toHaveLength(1)
      // chapter id 2 is at index 1
      expect(buttons[1].attributes('data-active')).toBe('true')
    })

    test('clicking a chapter button calls push with lesson name and params', async () => {
      chaptersRef.value = CHAPTERS
      const wrapper = mountView({ lessonId: '2' })

      const buttons = wrapper.findAll('[data-testid="lesson-view__chapter"]')
      await buttons[0].trigger('click')

      expect(routerPushMock).toHaveBeenCalledWith({
        name: 'lesson',
        params: { collectionId: 5, lessonId: 1 }
      })
    })
  })

  describe('chapter-of display', () => {
    test('renders chapter-of text when chapters are present', () => {
      chaptersRef.value = CHAPTERS
      const wrapper = mountView({ lessonId: '2' })

      expect(wrapper.find('[data-testid="lesson-view__chapter-of"]').exists()).toBe(true)
    })

    test('does not render chapter-of when there are no chapters', () => {
      chaptersRef.value = []
      const wrapper = mountView()

      expect(wrapper.find('[data-testid="lesson-view__chapter-of"]').exists()).toBe(false)
    })
  })

  describe('mobile title', () => {
    test('renders a centered lesson-title heading above the transcript', () => {
      const wrapper = mountView()
      expect(wrapper.find('[data-testid="lesson-view__title-text"]').exists()).toBe(true)
    })
  })

  describe('edit button', () => {
    test('clicking lesson-view__edit opens the collection edit modal', async () => {
      const wrapper = mountView()
      await wrapper.find('[data-testid="lesson-view__edit"]').trigger('click')

      expect(editModalOpenMock).toHaveBeenCalledOnce()
      expect(editModalOpenMock).toHaveBeenCalledWith(5)
    })
  })

  describe('term card placement — dock vs sidebar', () => {
    test('dock shows toolbar by default (no selection, popover closed)', () => {
      const wrapper = mountView()

      expect(wrapper.find('[data-testid="lesson-view__dock-toolbar"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="lesson-view__dock-term"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="lesson-view__sidebar-term"]').exists()).toBe(false)
    })

    // Below xl the committed term card lives in the dock; the sidebar
    // stays on its chapter list.
    test('dock shows term-card on mobile when popover open and selection set', async () => {
      isDesktopRef.value = false
      const wrapper = mountView()
      // Set state after mount so the watch fires and the deferred rAF executes.
      selectionRef.value = { term: 'hello', sentence: 'say hello', word_index: 3, rect: {} }
      popoverOpenRef.value = true
      await nextTick()

      expect(wrapper.find('[data-testid="lesson-view__dock-term"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="lesson-view__dock-toolbar"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="lesson-view__sidebar-term"]').exists()).toBe(false)
    })

    // At xl+ the term card moves to the sidebar (replacing the chapter
    // list) and the dock falls back to its toolbar — only one term-card mounts.
    test('sidebar shows term-card on desktop when popover open and selection set', async () => {
      isDesktopRef.value = true
      popoverOpenRef.value = true
      selectionRef.value = { term: 'hello', sentence: 'say hello', word_index: 3, rect: {} }

      const wrapper = mountView()
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="lesson-view__sidebar-term"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="lesson-view__chapters"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="lesson-view__dock-term"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="lesson-view__dock-toolbar"]').exists()).toBe(true)
      expect(wrapper.findAllComponents({ name: 'TermCard' })).toHaveLength(1)
    })

    test('dock shows toolbar when popover is closed even with selection', async () => {
      popoverOpenRef.value = false
      selectionRef.value = { term: 'hello', sentence: 'say hello', word_index: 3, rect: {} }

      const wrapper = mountView()
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="lesson-view__dock-toolbar"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="lesson-view__dock-term"]').exists()).toBe(false)
    })

    test('dock shows toolbar when popover open but no selection', async () => {
      popoverOpenRef.value = true
      selectionRef.value = null

      const wrapper = mountView()
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="lesson-view__dock-toolbar"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="lesson-view__dock-term"]').exists()).toBe(false)
    })

    test('term-card receives the selection term and sentence', async () => {
      const wrapper = mountView()
      selectionRef.value = {
        term: 'konnichiwa',
        sentence: 'konnichiwa world',
        word_index: 0,
        rect: {}
      }
      popoverOpenRef.value = true
      await nextTick()

      const termCard = wrapper.findComponent({ name: 'TermCard' })
      expect(termCard.exists()).toBe(true)
      expect(termCard.props('term')).toBe('konnichiwa')
      expect(termCard.props('sentence')).toBe('konnichiwa world')
    })

    test('term-card back event calls closeTerm', async () => {
      const wrapper = mountView()
      selectionRef.value = { term: 'hi', sentence: 'say hi', word_index: 1, rect: {} }
      popoverOpenRef.value = true
      await nextTick()

      await wrapper.find('[data-testid="term-card-stub__back"]').trigger('click')
      expect(closeTermMock).toHaveBeenCalledOnce()
    })

    test('term-card close event calls closeTerm', async () => {
      const wrapper = mountView()
      selectionRef.value = { term: 'hi', sentence: 'say hi', word_index: 1, rect: {} }
      popoverOpenRef.value = true
      await nextTick()

      await wrapper.find('[data-testid="term-card-stub__close"]').trigger('click')
      expect(closeTermMock).toHaveBeenCalledOnce()
    })

    test('term-card play-from-here event calls playFromHere', async () => {
      const wrapper = mountView()
      selectionRef.value = { term: 'hi', sentence: 'say hi', word_index: 1, rect: {} }
      popoverOpenRef.value = true
      await nextTick()

      await wrapper.find('[data-testid="term-card-stub__play-from-here"]').trigger('click')
      expect(playFromHereMock).toHaveBeenCalledOnce()
    })

    test('term-card play-from-here event also resumes transcript follow', async () => {
      const wrapper = mountView()
      selectionRef.value = { term: 'hi', sentence: 'say hi', word_index: 1, rect: {} }
      popoverOpenRef.value = true
      await nextTick()

      await wrapper.find('[data-testid="term-card-stub__play-from-here"]').trigger('click')

      expect(transcriptResumeMock).toHaveBeenCalledOnce()
      expect(playFromHereMock).toHaveBeenCalledOnce()
    })

    test('term-card play-word event calls playClip', async () => {
      const wrapper = mountView()
      selectionRef.value = { term: 'hi', sentence: 'say hi', word_index: 1, rect: {} }
      popoverOpenRef.value = true
      await nextTick()

      await wrapper.find('[data-testid="term-card-stub__play-word"]').trigger('click')
      expect(playClipMock).toHaveBeenCalledOnce()
    })
  })

  describe('dismissTerm — transcript dismiss event', () => {
    test('transcript dismiss event calls closeTerm', async () => {
      popoverOpenRef.value = true
      selectionRef.value = { term: 'hi', sentence: 'say hi', word_index: 1, rect: {} }

      const wrapper = mountView()
      await wrapper.vm.$nextTick()

      await wrapper.find('[data-testid="transcript-stub__dismiss"]').trigger('click')

      expect(closeTermMock).toHaveBeenCalledOnce()
    })

    test('transcript dismiss event emits dialog.close', async () => {
      popoverOpenRef.value = true
      selectionRef.value = { term: 'hi', sentence: 'say hi', word_index: 1, rect: {} }

      const wrapper = mountView()
      await wrapper.vm.$nextTick()

      await wrapper.find('[data-testid="transcript-stub__dismiss"]').trigger('click')

      expect(emitSfxMock).toHaveBeenCalledWith('dialog.close')
    })

    test('closeTerm alone does NOT emit ui.pop_up_close', async () => {
      const wrapper = mountView()
      selectionRef.value = { term: 'hi', sentence: 'say hi', word_index: 1, rect: {} }
      popoverOpenRef.value = true
      await nextTick()

      // Trigger close via term-card's close event (not dismiss)
      await wrapper.find('[data-testid="term-card-stub__close"]').trigger('click')

      // closeTermMock was called but sfx was NOT emitted (sfx only in dismissTerm)
      expect(closeTermMock).toHaveBeenCalledOnce()
      expect(emitSfxMock).not.toHaveBeenCalledWith('dialog.close')
    })
  })

  describe('dock layout', () => {
    test('useAnimatedHeight is wired during setup', () => {
      vi.clearAllMocks()
      mountView()

      // Wired once each for the dock term, settings, and toolbar panes
      expect(useAnimatedHeight).toHaveBeenCalledTimes(3)
    })
  })

  describe('follow-button visibility', () => {
    // show_follow_button = transcript.value?.following === false
    // When transcript.following flips false, the resume button appears.
    test('resume-follow button is hidden when transcript.following is true', async () => {
      transcriptFollowing.value = true
      const wrapper = mountView()
      await nextTick()

      expect(wrapper.find('[data-testid="lesson-view__resume-follow"]').exists()).toBe(false)
    })

    test('resume-follow button renders in dock when transcript.following is false', async () => {
      transcriptFollowing.value = false
      const wrapper = mountView()
      await nextTick()

      expect(wrapper.find('[data-testid="lesson-view__resume-follow"]').exists()).toBe(true)
    })

    test('resume-follow desktop button renders when transcript.following is false', async () => {
      transcriptFollowing.value = false
      const wrapper = mountView()
      await nextTick()

      expect(wrapper.find('[data-testid="lesson-view__resume-follow-desktop"]').exists()).toBe(true)
    })

    test('resume-follow button is hidden again when transcript.following returns to true', async () => {
      transcriptFollowing.value = false
      const wrapper = mountView()
      await nextTick()
      expect(wrapper.find('[data-testid="lesson-view__resume-follow"]').exists()).toBe(true)

      transcriptFollowing.value = true
      await nextTick()

      expect(wrapper.find('[data-testid="lesson-view__resume-follow"]').exists()).toBe(false)
    })

    test('swap-start/swap-end from the dock crossfade toggle the "not swapping" flag read by useAnimatedHeight', async () => {
      vi.clearAllMocks()
      const wrapper = mountView()
      await nextTick()

      // useAnimatedHeight(footer_swap_el, footer_term, () => !swapping, reclearSelection)
      const not_swapping = useAnimatedHeight.mock.calls[0][2]
      expect(not_swapping()).toBe(true)

      const crossfade = wrapper.findComponent({ name: 'CrossfadeResize' })
      await crossfade.vm.$emit('swap-start')
      expect(not_swapping()).toBe(false)

      await crossfade.vm.$emit('swap-end')
      expect(not_swapping()).toBe(true)
    })

    test('swap-start/swap-end claim and release the mobile dock height alongside the local swapping flag', async () => {
      const wrapper = mountView()
      await nextTick()
      const { height_claims } = useMobileDock()
      expect(height_claims.value).toBe(0)

      const crossfade = wrapper.findComponent({ name: 'CrossfadeResize' })
      await crossfade.vm.$emit('swap-start')
      expect(height_claims.value).toBe(1)

      await crossfade.vm.$emit('swap-end')
      expect(height_claims.value).toBe(0)
    })

    test('follow_direction prop matches transcript follow_direction', async () => {
      transcriptFollowing.value = false
      transcriptFollowDirection.value = 'up'
      const wrapper = mountView()
      await nextTick()

      // ResumeFollowButton stub is shallowed — find it by name and check its prop.
      const btn = wrapper.findComponent({ name: 'ResumeFollowButton' })
      expect(btn.exists()).toBe(true)
      expect(btn.props('direction')).toBe('up')
    })

    test('clicking resume-follow button calls transcript.resumeFollow', async () => {
      transcriptFollowing.value = false
      const wrapper = mountView()
      await nextTick()

      // shallowMount auto-stubs ResumeFollowButton — emit the Vue event via vm.$emit
      // so the parent's @resume="resumeFollow" handler fires.
      const btn = wrapper.findComponent({ name: 'ResumeFollowButton' })
      expect(btn.exists()).toBe(true)
      await btn.vm.$emit('resume')
      await nextTick()

      expect(transcriptResumeMock).toHaveBeenCalledTimes(1)
    })
  })

  // ── viewport height reserves room for the mobile dock ─────────
  //
  // The dock now sits below this view rather than over it, so the lesson's
  // own min-height must subtract the dock's published height or the dock
  // pushes the lesson past one screen.

  describe('viewport height reserves room for the mobile dock', () => {
    test('min-height subtracts --mobile-dock-height from the nav-adjusted viewport', () => {
      const wrapper = mountView()

      expect(wrapper.find('[data-testid="lesson-view"]').classes()).toContain(
        'min-h-[calc(100dvh-var(--nav-height)-var(--mobile-dock-height,0px))]'
      )
    })
  })

  describe('dock three-way swap precedence — term > settings > toolbar', () => {
    // The desktop sidebar also renders its own <audio-toolbar> unconditionally
    // (CSS-hidden below xl), so findComponent(AudioToolbar) can resolve to
    // either instance — the dock one lives inside lesson-view__dock-toolbar.
    function findDockToolbar(wrapper) {
      return wrapper.findAllComponents(AudioToolbar).find((c) => c.props('showSpeed') === false)
    }

    test('shows the toolbar when neither a term nor settings is active', () => {
      const wrapper = mountView()

      expect(wrapper.find('[data-testid="lesson-view__dock-toolbar"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="lesson-view__dock-settings"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="lesson-view__dock-term"]').exists()).toBe(false)
    })

    test('opening reader-settings via the toolbar trigger shows the settings pane', async () => {
      const wrapper = mountView()

      findDockToolbar(wrapper).vm.$emit('open-settings')
      await nextTick()

      expect(wrapper.find('[data-testid="lesson-view__dock-settings"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="lesson-view__dock-toolbar"]').exists()).toBe(false)
    })

    test('reader-settings close event returns the dock to the toolbar', async () => {
      const wrapper = mountView()
      findDockToolbar(wrapper).vm.$emit('open-settings')
      await nextTick()
      expect(wrapper.find('[data-testid="lesson-view__dock-settings"]').exists()).toBe(true)

      wrapper.findComponent({ name: 'ReaderSettings' }).vm.$emit('close')
      await nextTick()

      expect(wrapper.find('[data-testid="lesson-view__dock-settings"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="lesson-view__dock-toolbar"]').exists()).toBe(true)
    })

    test('a term selection takes precedence over an open settings pane', async () => {
      const wrapper = mountView()
      findDockToolbar(wrapper).vm.$emit('open-settings')
      await nextTick()
      expect(wrapper.find('[data-testid="lesson-view__dock-settings"]').exists()).toBe(true)

      selectionRef.value = { term: 'hi', sentence: 'say hi', word_index: 1, rect: {} }
      popoverOpenRef.value = true
      await nextTick()

      expect(wrapper.find('[data-testid="lesson-view__dock-term"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="lesson-view__dock-settings"]').exists()).toBe(false)
    })
  })

  describe('use_fixed_layout desktop gating', () => {
    test('phone + fixed display_mode hides the inline translation and shows the pinned band', () => {
      isDesktopRef.value = false
      displayModeRef.value = 'fixed'
      const wrapper = mountView()

      expect(
        wrapper.findComponent({ name: 'TranscriptView' }).props('hide_inline_translation')
      ).toBe(true)
      expect(wrapper.findComponent({ name: 'TranslationZone' }).exists()).toBe(true)
    })

    test('desktop ignores a fixed display_mode — inline translation stays, no pinned band', () => {
      isDesktopRef.value = true
      displayModeRef.value = 'fixed'
      const wrapper = mountView()

      expect(
        wrapper.findComponent({ name: 'TranscriptView' }).props('hide_inline_translation')
      ).toBe(false)
      expect(wrapper.findComponent({ name: 'TranslationZone' }).exists()).toBe(false)
    })

    test('phone + inline display_mode keeps the inline translation and no pinned band', () => {
      isDesktopRef.value = false
      displayModeRef.value = 'inline'
      const wrapper = mountView()

      expect(
        wrapper.findComponent({ name: 'TranscriptView' }).props('hide_inline_translation')
      ).toBe(false)
      expect(wrapper.findComponent({ name: 'TranslationZone' }).exists()).toBe(false)
    })
  })

  describe('pinned translation source', () => {
    test('follows playback (active_translation) by default', async () => {
      isDesktopRef.value = false
      displayModeRef.value = 'fixed'
      translationSourceRef.value = 'playback'
      transcriptActiveTranslation.value = 'From playback'
      transcriptCenteredTranslation.value = 'From scroll'
      const wrapper = mountView()
      await nextTick()

      expect(wrapper.findComponent({ name: 'TranslationZone' }).props('translation')).toBe(
        'From playback'
      )
    })

    test('follows scroll position (centered_translation) when preferred', async () => {
      isDesktopRef.value = false
      displayModeRef.value = 'fixed'
      translationSourceRef.value = 'scroll'
      transcriptActiveTranslation.value = 'From playback'
      transcriptCenteredTranslation.value = 'From scroll'
      const wrapper = mountView()
      await nextTick()

      expect(wrapper.findComponent({ name: 'TranslationZone' }).props('translation')).toBe(
        'From scroll'
      )
    })
  })
})
