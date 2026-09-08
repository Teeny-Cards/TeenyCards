import { describe, test, expect, beforeEach, vi } from 'vite-plus/test'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const { mockEnter, mockLeave, useAnimatedHeightMock } = vi.hoisted(() => ({
  mockEnter: vi.fn((_el, done) => done()),
  mockLeave: vi.fn((_el, done) => done()),
  useAnimatedHeightMock: vi.fn()
}))

vi.mock('@/utils/animations/translation-crossfade', () => ({
  translationCrossfadeEnter: mockEnter,
  translationCrossfadeLeave: mockLeave
}))

vi.mock('@/composables/ui/animated-height', () => ({
  useAnimatedHeight: useAnimatedHeightMock
}))

import TranslationZone from '@/views/audio-reader/lesson/translation-zone.vue'

describe('TranslationZone', () => {
  beforeEach(() => {
    mockEnter.mockClear()
    mockLeave.mockClear()
    useAnimatedHeightMock.mockClear()
  })

  describe('empty on null', () => {
    test('renders no text when translation is null', () => {
      const wrapper = mount(TranslationZone, { props: { translation: null } })
      expect(wrapper.find('[data-testid="translation-zone__text"]').exists()).toBe(false)
    })

    test('renders no text when translation is omitted', () => {
      const wrapper = mount(TranslationZone)
      expect(wrapper.find('[data-testid="translation-zone__text"]').exists()).toBe(false)
    })

    test('renders the translation text when set', () => {
      const wrapper = mount(TranslationZone, { props: { translation: 'Bonjour.' } })
      expect(wrapper.find('[data-testid="translation-zone__text"]').text()).toBe('Bonjour.')
    })

    test('clearing a translation back to null removes the text', async () => {
      const wrapper = mount(TranslationZone, { props: { translation: 'Bonjour.' } })
      await wrapper.setProps({ translation: null })
      expect(wrapper.find('[data-testid="translation-zone__text"]').exists()).toBe(false)
    })
  })

  describe('crossfade keying', () => {
    // Vue Test Utils stubs <transition> by default, which would skip the real
    // enter/leave hooks entirely — disable that stub so the keyed swap is
    // actually exercised.
    function mountUnstubbed(props = {}) {
      return mount(TranslationZone, {
        props,
        global: { stubs: { transition: false } }
      })
    }

    test('a changed translation is keyed so the transition treats it as a new node', async () => {
      const wrapper = mountUnstubbed({ translation: 'Bonjour.' })
      mockEnter.mockClear()

      await wrapper.setProps({ translation: 'Salut.' })
      await flushPromises()
      await nextTick()

      // A distinct :key retires the old node and mounts a new one — both the
      // leave (old text) and enter (new text) transitions fire.
      expect(mockLeave).toHaveBeenCalled()
      expect(mockEnter).toHaveBeenCalled()
      expect(wrapper.find('[data-testid="translation-zone__text"]').text()).toBe('Salut.')
    })

    test('an unchanged translation does not retrigger the enter transition', async () => {
      const wrapper = mountUnstubbed({ translation: 'Bonjour.' })
      mockEnter.mockClear()

      await wrapper.setProps({ translation: 'Bonjour.' })

      expect(mockEnter).not.toHaveBeenCalled()
    })
  })

  describe('height tween wiring', () => {
    test('ties the band height to the wrapper and body elements, animated', () => {
      const wrapper = mount(TranslationZone, { props: { translation: 'Bonjour.' } })

      expect(useAnimatedHeightMock).toHaveBeenCalledTimes(1)
      const [wrapperRef, contentRef, , , animate] = useAnimatedHeightMock.mock.calls[0]

      expect(wrapperRef.value).toBe(wrapper.find('[data-testid="translation-zone"]').element)
      expect(contentRef.value).toBe(wrapper.find('[data-testid="translation-zone__body"]').element)
      expect(animate).toBe(true)
    })
  })
})
