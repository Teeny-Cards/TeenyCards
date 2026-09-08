import { describe, test, expect, beforeEach, afterEach, vi } from 'vite-plus/test'
import { nextTick } from 'vue'

// Module-level state is seeded from localStorage at import time, so each test
// gets a fresh module instance rather than sharing the one singleton.
beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

afterEach(() => {
  localStorage.clear()
})

describe('useReaderPrefs', () => {
  test('defaults display_mode to inline, translation_source to playback, playback_rate to 1', async () => {
    const { useReaderPrefs } = await import('@/composables/audio-reader/reader-prefs')
    const { display_mode, translation_source, playback_rate } = useReaderPrefs()

    expect(display_mode.value).toBe('inline')
    expect(translation_source.value).toBe('playback')
    expect(playback_rate.value).toBe(1)
  })

  test('rehydrates each key from its own localStorage slot', async () => {
    localStorage.setItem('audio-reader.displayMode', JSON.stringify('fixed'))
    localStorage.setItem('audio-reader.translationSource', JSON.stringify('scroll'))
    localStorage.setItem('audio-reader.playbackRate', JSON.stringify(1.5))

    const { useReaderPrefs } = await import('@/composables/audio-reader/reader-prefs')
    const { display_mode, translation_source, playback_rate } = useReaderPrefs()

    expect(display_mode.value).toBe('fixed')
    expect(translation_source.value).toBe('scroll')
    expect(playback_rate.value).toBe(1.5)
  })

  test('every call returns the same singleton refs', async () => {
    const { useReaderPrefs } = await import('@/composables/audio-reader/reader-prefs')
    const first = useReaderPrefs()
    const second = useReaderPrefs()

    first.display_mode.value = 'fixed'

    expect(second.display_mode.value).toBe('fixed')
    expect(first.display_mode).toBe(second.display_mode)
  })

  test('writing display_mode persists it under its own key without touching the others', async () => {
    const { useReaderPrefs } = await import('@/composables/audio-reader/reader-prefs')
    const { display_mode } = useReaderPrefs()

    display_mode.value = 'fixed'
    await nextTick()

    expect(localStorage.getItem('audio-reader.displayMode')).toBe(JSON.stringify('fixed'))
    expect(localStorage.getItem('audio-reader.translationSource')).toBe(null)
    expect(localStorage.getItem('audio-reader.playbackRate')).toBe(null)
  })

  test('writing translation_source persists it under its own key', async () => {
    const { useReaderPrefs } = await import('@/composables/audio-reader/reader-prefs')
    const { translation_source } = useReaderPrefs()

    translation_source.value = 'scroll'
    await nextTick()

    expect(localStorage.getItem('audio-reader.translationSource')).toBe(JSON.stringify('scroll'))
  })

  test('writing playback_rate persists it under its own key', async () => {
    const { useReaderPrefs } = await import('@/composables/audio-reader/reader-prefs')
    const { playback_rate } = useReaderPrefs()

    playback_rate.value = 2
    await nextTick()

    expect(localStorage.getItem('audio-reader.playbackRate')).toBe(JSON.stringify(2))
  })
})
