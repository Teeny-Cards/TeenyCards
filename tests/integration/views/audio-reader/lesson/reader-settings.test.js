import { describe, test, expect, beforeEach, vi } from 'vite-plus/test'
import { shallowMount } from '@vue/test-utils'
import { defineComponent, h, ref, useAttrs } from 'vue'

// Real refs, reset in beforeEach, so the composable state is isolated per test.
const { display_mode, translation_source, playback_rate } = vi.hoisted(() => {
  return { display_mode: {}, translation_source: {}, playback_rate: {} }
})

vi.mock('@/composables/audio-reader/reader-prefs', () => ({
  useReaderPrefs: () => ({
    display_mode: display_mode.ref,
    translation_source: translation_source.ref
  })
}))

// ── Stubs ──────────────────────────────────────────────────────────────────────

const UiButtonStub = defineComponent({
  name: 'UiButton',
  inheritAttrs: false,
  emits: ['press'],
  setup(_p, { slots, emit }) {
    const attrs = useAttrs()
    return () => h('button', { ...attrs, onClick: () => emit('press') }, slots.default?.())
  }
})

const UiOptionGroupStub = defineComponent({
  name: 'UiOptionGroup',
  inheritAttrs: false,
  props: { options: { type: Array, default: () => [] }, value: { type: String, default: '' } },
  emits: ['update:value'],
  setup(props, { emit }) {
    const attrs = useAttrs()
    return () =>
      h(
        'div',
        {
          'data-testid': attrs['data-testid'] ?? 'ui-option-group-stub',
          'data-value': props.value
        },
        props.options.map((option) =>
          h(
            'button',
            {
              key: option.value,
              'data-testid': `option-${option.value}`,
              'data-active': String(option.value === props.value),
              onClick: () => emit('update:value', option.value)
            },
            option.label
          )
        )
      )
  }
})

const UiSelectMenuStub = defineComponent({
  name: 'UiSelectMenu',
  inheritAttrs: false,
  props: { modelValue: { type: String, default: '' }, options: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const attrs = useAttrs()
    return () =>
      h(
        'div',
        {
          'data-testid': attrs['data-testid'] ?? 'ui-select-menu-stub',
          'data-value': props.modelValue
        },
        props.options.map((option) =>
          h(
            'button',
            {
              key: option.value,
              'data-testid': `speed-${option.value}`,
              onClick: () => emit('update:modelValue', option.value)
            },
            option.label
          )
        )
      )
  }
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

import ReaderSettings from '@/views/audio-reader/lesson/reader-settings.vue'

function makePlayer(overrides = {}) {
  return {
    playback_rate: ref(1),
    setPlaybackRate: vi.fn(),
    ...overrides
  }
}

function mountSettings(props = {}) {
  return shallowMount(ReaderSettings, {
    props: { player: makePlayer(), ...props },
    global: {
      stubs: {
        UiButton: UiButtonStub,
        UiOptionGroup: UiOptionGroupStub,
        UiSelectMenu: UiSelectMenuStub
      }
    }
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReaderSettings', () => {
  beforeEach(() => {
    display_mode.ref = ref('inline')
    translation_source.ref = ref('playback')
    playback_rate.ref = ref(1)
  })

  describe('layout option group', () => {
    test('reflects the current display_mode preference', () => {
      display_mode.ref.value = 'fixed'
      const wrapper = mountSettings()

      expect(
        wrapper
          .find('[data-testid="reader-settings__layout"] [data-value]')
          .attributes('data-value')
      ).toBe('fixed')
    })

    test('picking a layout option writes display_mode', async () => {
      const wrapper = mountSettings()

      await wrapper.find('[data-testid="option-fixed"]').trigger('click')

      expect(display_mode.ref.value).toBe('fixed')
    })
  })

  describe('translation-follows option group', () => {
    test('reflects the current translation_source preference', () => {
      translation_source.ref.value = 'scroll'
      const wrapper = mountSettings()

      expect(
        wrapper
          .find('[data-testid="reader-settings__translation-follows"] [data-value]')
          .attributes('data-value')
      ).toBe('scroll')
    })

    test('picking a translation-follows option writes translation_source', async () => {
      const wrapper = mountSettings()

      await wrapper.find('[data-testid="option-scroll"]').trigger('click')

      expect(translation_source.ref.value).toBe('scroll')
    })
  })

  describe('speed select', () => {
    test('reflects the player playback_rate as a string', () => {
      const player = makePlayer({ playback_rate: ref(1.5) })
      const wrapper = mountSettings({ player })

      expect(
        wrapper.find('[data-testid="reader-settings__speed"] [data-value]').attributes('data-value')
      ).toBe('1.5')
    })

    test('picking a speed option calls player.setPlaybackRate with a number', async () => {
      const player = makePlayer()
      const wrapper = mountSettings({ player })

      await wrapper.find('[data-testid="speed-2"]').trigger('click')

      expect(player.setPlaybackRate).toHaveBeenCalledWith(2)
      expect(typeof player.setPlaybackRate.mock.calls[0][0]).toBe('number')
    })
  })

  describe('close', () => {
    test('clicking the close button emits close', async () => {
      const wrapper = mountSettings()

      await wrapper.find('[data-testid="reader-settings__close"]').trigger('click')

      expect(wrapper.emitted('close')).toHaveLength(1)
    })
  })
})
