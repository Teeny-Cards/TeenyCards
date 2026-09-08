import { useLocalRef } from '@/composables/storage/local-ref'

/** How the reader lays out per-sentence translations. */
export type ReaderDisplayMode = 'inline' | 'fixed'

/** Which line the fixed translation band tracks. */
export type ReaderTranslationSource = 'playback' | 'scroll'

// Module-level so every reader instance and the settings panel share one source
// of truth, persisted across lessons and app sessions. Colocated with the other
// audio-reader composables rather than under the view, deliberately, to sit with
// its feature siblings.
const display_mode = useLocalRef<ReaderDisplayMode>('audio-reader.displayMode', 'inline')
const translation_source = useLocalRef<ReaderTranslationSource>(
  'audio-reader.translationSource',
  'playback'
)
const playback_rate = useLocalRef<number>('audio-reader.playbackRate', 1)

export function useReaderPrefs() {
  return { display_mode, translation_source, playback_rate }
}
