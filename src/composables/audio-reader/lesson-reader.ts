import { computed, ref, shallowRef, toValue, useTemplateRef, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { useI18n } from 'vue-i18n'
import { emitSfx } from '@/sfx/bus'
import { useNoticeStore } from '@/stores/notice-store'
import { useLessonQuery, useLessonAudioUrlQuery } from '@/api/lessons'
import { useMemberCardIndexQuery } from '@/api/cards'
import { useMemberDecksQuery } from '@/api/decks'
import { useAudioPlayer } from './audio-player'
import { useTranscriptSync } from './transcript-sync'
import { useReaderPrefs } from './reader-prefs'
import { groupWordsBySentence } from '@/utils/transcript'
import {
  buildCardTermMap,
  decksForTerm,
  matchCardsInWords,
  matchesByWord,
  type CardMatch
} from '@/utils/transcript-match'

// Translate into the app language. A per-member target language can replace this
// later; admin-only v1 is English.
const TARGET_LANG = 'English'

/** Whether `next` carries the same span/palette per word as `prev`, so a refetch that changed nothing can be skipped. */
function sameMatches(prev: Map<number, CardMatch>, next: Map<number, CardMatch>): boolean {
  if (prev.size !== next.size) return false

  for (const [k, v] of next) {
    const p = prev.get(k)
    if (!p || p.lo !== v.lo || p.hi !== v.hi || p.palette !== v.palette) return false
  }

  return true
}

/**
 * Orchestrate a lesson for reading: fetch it, shape its transcript into
 * paragraphs, stream the audio, sync the active word to playback, and hold the
 * term-translation popover state. The view binds the returned values to its
 * template and otherwise stays presentation-only.
 *
 * Binds the audio element by name — the host template must declare `ref="audio"`.
 *
 * @param id - the lesson id (route param), reactive.
 * @example
 * const reader = useLessonReader(() => Number(props.id))
 */
export function useLessonReader(id: MaybeRefOrGetter<number>) {
  const { t } = useI18n()
  const notice = useNoticeStore()

  const lesson_id = computed(() => toValue(id))
  const { data: lesson, error } = useLessonQuery(lesson_id)

  const words = computed(() => lesson.value?.transcript.words ?? [])
  // Each sentence renders as its own block (one interlinear gloss apiece), evenly
  // spaced — see the reader's transcript view.
  const paragraphs = computed(() => {
    const segments = lesson.value?.transcript.segments ?? []
    return groupWordsBySentence(segments, words.value, lesson.value?.transcript.text)
  })

  // The member-wide card index, mapped to normalized term → decks. Fetched once
  // and reused across lessons; absent until it loads, so matches start empty.
  const { data: card_index } = useMemberCardIndexQuery()
  const card_terms = computed(() => buildCardTermMap(card_index.value ?? []))

  // Decks are already in cache for this page (the add-card control reads them);
  // reuse them to colour each highlight by its owning deck's cover.
  const { data: decks } = useMemberDecksQuery()

  const flat_words = computed(() => paragraphs.value.flatMap((p) => p.words))

  // Word scan: only re-runs when card_index changes (not on every deck refetch).
  // matchCardsInWords is O(words × MAX_SPAN_WORDS) — expensive on large lessons.
  const raw_matches = computed(() => matchCardsInWords(flat_words.value, card_terms.value))

  // Theme application: re-runs when decks changes, but only over the ~N matched
  // words — O(matches × decks) instead of O(words × MAX_SPAN_WORDS). Pinia
  // Colada refetches decks each time add-card-control mounts (every tap), so
  // separating these two computeds keeps per-tap cost proportional to match count,
  // not total word count.
  const themed_matches = computed(() => raw_matches.value.map(themeMatch))

  // Stable shallowRef: only emits a new Map when the match content actually
  // changes. Guards against same-content refetch arrays producing a new Map
  // reference that would retrigger paintMatchedWords on the full transcript.
  const matches = shallowRef<Map<number, CardMatch>>(new Map())
  watch(
    () => matchesByWord(themed_matches.value),
    (next) => {
      if (sameMatches(matches.value, next)) return
      matches.value = next
    },
    { immediate: true }
  )

  const audio_path = computed(() => lesson.value?.audio_path)
  const { data: audio_url } = useLessonAudioUrlQuery(audio_path)

  const audio_el = useTemplateRef<HTMLAudioElement>('audio')
  const player = useAudioPlayer(audio_el)
  const { active_index: active_word } = useTranscriptSync(words, player.current_time)

  // Speed is a saved preference: seed the player from it, and write any later
  // change (panel or desktop control) back, so it carries across lessons.
  const { playback_rate: saved_playback_rate } = useReaderPrefs()
  player.setPlaybackRate(saved_playback_rate.value)
  watch(player.playback_rate, (rate) => (saved_playback_rate.value = rate))

  const selection = ref<TermSelection | null>(null)
  const popover_open = ref(false)

  // The decks already holding the open term — empty when it isn't a card yet.
  // Drives the term panel's add-button state regardless of how the term was
  // selected (tapping a highlight or hand-selecting a range that happens to match).
  const selected_term_decks = computed(() =>
    selection.value ? decksForTerm(card_terms.value, selection.value.term) : []
  )

  watch(error, (err) => {
    if (err) notice.error(t('lesson-reader.load-error'))
  })

  // Colour a match by the cover of the first of its decks in the member's list:
  // a single-deck term gets that deck, a multi-deck term a deterministic home.
  function themeMatch(match: CardMatch): CardMatch {
    const ids = new Set(match.deck_ids)
    const cover = decks.value?.find((deck) => ids.has(deck.id))?.cover_config
    return { ...match, palette: cover?.palette }
  }

  /**
   * Show the translation for a tapped/selected term. Pauses playback so the term
   * holds still while it's read. Stores the standing selection and opens — the
   * view decides where it surfaces (rect-anchored popover on desktop, in the
   * footer in place of the toolbar on mobile).
   */
  function openTerm(next: TermSelection) {
    emitSfx('dialog.open')
    player.pause()

    selection.value = next
    popover_open.value = true
  }

  function closeTerm() {
    popover_open.value = false
  }

  /** Seek to the desktop popover's term and resume — its standing selection. */
  function playFromHere() {
    if (selection.value) playFromWord(selection.value.word_index)
  }

  /** Play just the desktop popover's term — its standing selection. */
  function playClip() {
    if (selection.value) playWordRange(selection.value.word_index, selection.value.word_end_index)
  }

  // Seek to a word's start time, resume playback, and dismiss the open term
  // surface (popover on desktop, footer card on mobile).
  function playFromWord(word_index: number) {
    const start = words.value[word_index]?.start
    if (start === undefined) return

    player.seek(start)
    player.play()
    closeTerm()
  }

  // Play only the selected phrase — its first word's start to its last word's end
  // — then stop. Leaves the term surface open so its translation stays readable.
  function playWordRange(first_index: number, last_index: number) {
    const start = words.value[first_index]?.start
    const end = words.value[last_index]?.end
    if (start === undefined || end === undefined) return

    player.playClip(start, end)
  }

  return {
    lesson,
    words,
    paragraphs,
    matches,
    audio_url,
    active_word,
    selection,
    selected_term_decks,
    popover_open,
    target_lang: TARGET_LANG,
    openTerm,
    closeTerm,
    playFromHere,
    playClip,
    player
  }
}
