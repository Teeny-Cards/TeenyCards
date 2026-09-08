<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useWindowVirtualizer } from '@tanstack/vue-virtual'
import type { SentenceWords } from '@/utils/transcript'
import { markTermInSentence } from '@/utils/transcript'
import type { CardMatch } from '@/utils/transcript-match'
import { useReaderHighlights, type WordRange } from '@/composables/audio-reader/reader-highlights'
import TranscriptSegment from './segment.vue'
import SelectionPreview from './selection-preview.vue'

type TranscriptViewProps = {
  paragraphs: SentenceWords[]
  chapters?: TranscriptChapter[]
  matches?: Map<number, CardMatch>
  active_word: number
  popover_open?: boolean
  // True in the reader's Fixed layout: per-sentence glosses are dropped from the
  // scroll (and their row-height estimate) since the pinned band shows them.
  hide_inline_translation?: boolean
}

type TranscriptRow = { paragraph: SentenceWords; chapter_title?: string }

const {
  paragraphs,
  chapters = [],
  matches = new Map(),
  active_word,
  popover_open = false,
  hide_inline_translation = false
} = defineProps<TranscriptViewProps>()

const emit = defineEmits<{
  (e: 'select', selection: TermSelection): void
  (e: 'dismiss'): void
}>()

// Leading / trailing punctuation edges — strip these from the first/last word of
// a match so the underline hugs the term's own characters and never bridges a
// comma or bracket to a neighbouring card.
const LEADING_EDGE = /^[\p{P}\s]+/u
const TRAILING_EDGE = /[\p{P}\s]+$/u

// Estimated row height before it's actually measured — deliberately generous
// since an undershoot causes more visible re-layout than an overshoot. Real
// height is corrected per-row via virtualizer.measureElement once mounted.
const BASE_ROW_HEIGHT = 170
const TRANSLATION_EXTRA = 40
const HEADING_EXTRA = 170
const OVERSCAN = 5

const scroll_margin = ref(0)

// Document-space Y of the viewport's vertical centre, refreshed on scroll/resize.
// Row `start` offsets are in the same space (the content sits at the page top),
// so the row straddling this value is the one at the middle of the screen.
const viewport_center = ref(0)

// One row per paragraph; a row also carries its chapter's heading title when
// it's the first paragraph of that chapter, so the heading's height is part of
// the virtualized item instead of a sibling flow element.
const rows = computed<TranscriptRow[]>(() => {
  const heading_at = new Map<number, string>()
  for (const chapter of chapters) {
    const first = paragraphs.find((p) => p.start >= chapter.start)
    if (first) heading_at.set(first.index, chapter.title)
  }
  return paragraphs.map((paragraph) => ({
    paragraph,
    chapter_title: heading_at.get(paragraph.index)
  }))
})

// word index -> row index, so the audio-driven active word (which may be
// unmounted after a seek) can be resolved to a row for scrollToIndex.
const word_row_index = computed(() => {
  const map = new Map<number, number>()
  rows.value.forEach((row, i) => {
    for (const word of row.paragraph.words) map.set(word.index, i)
  })
  return map
})

const virtualizer = useWindowVirtualizer(
  computed(() => ({
    count: rows.value.length,
    estimateSize: (i: number) => estimateRowSize(rows.value[i]),
    overscan: OVERSCAN,
    scrollMargin: scroll_margin.value,
    getItemKey: (i: number) => rows.value[i].paragraph.index
  }))
)

function rowIndexOfWord(word_index: number): number {
  return word_row_index.value.get(word_index) ?? 0
}

// The translation of the line the audio is on — what the pinned band shows when
// it follows playback. Null before the first word starts, so the band stays empty
// rather than showing the opening line.
const active_translation = computed(() => {
  if (active_word < 0) return null
  return rows.value[rowIndexOfWord(active_word)]?.paragraph.translation ?? null
})

// The translation of the line at the vertical centre of the viewport — what the
// pinned band shows when it follows scroll position.
const centered_translation = computed(() => {
  const center = viewport_center.value
  const item = virtualizer.value
    .getVirtualItems()
    .find((row) => center >= row.start && center < row.start + row.size)
  return item ? (rows.value[item.index]?.paragraph.translation ?? null) : null
})

const {
  content,
  hover_lines,
  setHoverEl,
  tap_active,
  selection_preview,
  following,
  follow_direction,
  resumeFollow,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onPointerCancel
} = useReaderHighlights(
  () => active_word,
  commitSelection,
  () => popover_open,
  () => emit('dismiss'),
  matchRangeAt,
  virtualizer,
  rowIndexOfWord
)

// The follow state + resume action surface to the lesson view, which renders the
// "jump to current line" control in the mobile dock above the transcript; the
// translations feed the Fixed layout's pinned band, one per "translation follows".
defineExpose({
  following,
  follow_direction,
  resumeFollow,
  active_translation,
  centered_translation
})

let resize_observer: ResizeObserver | undefined

onMounted(() => {
  measureScrollMargin()
  updateViewportCenter()
  resize_observer = new ResizeObserver(onLayoutChange)
  resize_observer.observe(document.body)
  window.addEventListener('scroll', updateViewportCenter, { passive: true })
})

onBeforeUnmount(() => {
  resize_observer?.disconnect()
  window.removeEventListener('scroll', updateViewportCenter)
})

function estimateRowSize(row: TranscriptRow): number {
  let size = BASE_ROW_HEIGHT
  if (row.paragraph.translation && !hide_inline_translation) size += TRANSLATION_EXTRA
  if (row.chapter_title) size += HEADING_EXTRA
  return size
}

// The transcript always scrolls the page itself, so its document offset is
// what maps page scroll onto row positions.
function measureScrollMargin() {
  if (!content.value) return
  scroll_margin.value = content.value.getBoundingClientRect().top + window.scrollY
}

function updateViewportCenter() {
  viewport_center.value = window.scrollY + window.innerHeight / 2
}

function onLayoutChange() {
  measureScrollMargin()
  updateViewportCenter()
}

// Paint card-match highlights onto word elements imperatively rather than via
// reactive inject. With large transcripts (1000+ words) the inject chain caused
// every word to re-render whenever `matches` got a new Map reference — e.g. each
// time Pinia Colada re-fetched decks after the term card mounted. Painting
// data-highlight + data-palette + the lead/core/trail underline split directly
// bypasses Vue's scheduler entirely for this update path.
function paintMatchedWords(m: Map<number, CardMatch>) {
  const container = content.value
  if (!container) return

  // Build a word-index → element index in one DOM pass so lookups are O(1).
  const els = new Map<number, HTMLElement>()
  container.querySelectorAll<HTMLElement>('[data-word-index]').forEach((el) => {
    els.set(Number(el.dataset.wordIndex), el)
  })

  // Clear previously highlighted words.
  container.querySelectorAll<HTMLElement>('[data-highlight]').forEach((el) => {
    el.removeAttribute('data-highlight')
    el.removeAttribute('data-palette')
    const base = el.querySelector<HTMLElement>('[data-word-base]')
    if (base) base.textContent = el.dataset.wordText ?? ''
  })

  // Rebuild the base span as lead, underlined core, trail.
  for (const [index, match] of m) {
    const el = els.get(index)
    if (!el) continue

    const display = el.dataset.wordText ?? ''
    const lead = index === match.lo ? (display.match(LEADING_EDGE)?.[0] ?? '') : ''
    const trail = index === match.hi ? (display.match(TRAILING_EDGE)?.[0] ?? '') : ''
    const core = display.slice(lead.length, display.length - trail.length)

    el.setAttribute('data-highlight', 'true')
    if (match.palette) el.setAttribute('data-palette', match.palette)

    const base = el.querySelector<HTMLElement>('[data-word-base]')
    if (!base) continue
    base.textContent = ''
    if (lead) base.appendChild(document.createTextNode(lead))
    const core_span = document.createElement('span')
    core_span.className =
      'underline decoration-(--color-accent) decoration-3 underline-offset-[0.18em]'
    core_span.textContent = core
    base.appendChild(core_span)
    if (trail) base.appendChild(document.createTextNode(trail))
  }
}

// A tap/click on a word inside a card match selects the whole matched phrase;
// null for an unmatched word, so the caller falls back to single-word select.
function matchRangeAt(index: number): WordRange | null {
  const match = matches.get(index)
  return match ? { lo: match.lo, hi: match.hi } : null
}

function paragraphIndexOf(node: Element): number | null {
  const segment = node.closest('[data-testid="transcript-segment"]')
  const index = segment?.getAttribute('data-index')
  return index === null || index === undefined ? null : Number(index)
}

// A committed word-range carries its own term + rect + first/last word indices;
// the surrounding text (translator context) is the whole paragraph the anchor
// word sits in.
function commitSelection({
  term,
  rect,
  anchor,
  index: word_index,
  end_index: word_end_index
}: {
  term: string
  rect: DOMRect
  anchor: Element
  index: number
  end_index: number
}) {
  const index = paragraphIndexOf(anchor)
  const paragraph = index !== null ? paragraphs.find((p) => p.index === index) : undefined
  const raw_sentence = paragraph?.sentence || term
  const words = paragraph?.words ?? []
  const sentence = markTermInSentence(raw_sentence, words, word_index, term)
  emit('select', { term, sentence, rect, word_index, word_end_index })
}

watch(() => matches, paintMatchedWords, { immediate: true, flush: 'post' })

// Newly-mounted rows (scrolled into view) need their matches painted too — the
// watch above only fires when the `matches` map itself changes.
watch(
  () => virtualizer.value.getVirtualItems(),
  () => paintMatchedWords(matches),
  {
    flush: 'post'
  }
)
</script>

<template>
  <div data-testid="transcript-view" class="px-2 py-1">
    <div
      ref="content"
      data-testid="transcript-view__content"
      class="relative isolate select-none text-4xl leading-[2.5] text-ink"
      :style="{ height: `${virtualizer.getTotalSize()}px` }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerLeave"
      @pointercancel="onPointerCancel"
    >
      <div
        v-for="(_, i) in hover_lines"
        :key="i"
        :ref="(el) => setHoverEl(el as HTMLElement | null, i)"
        data-testid="transcript-view__hover"
        aria-hidden="true"
        :data-playing="tap_active"
        class="group/pill pointer-events-none absolute left-0 top-0 -z-10 rounded-2 bg-(--color-accent) opacity-0"
      >
        <div
          data-testid="transcript-view__hover-texture"
          class="absolute inset-0 hidden rounded-2 bgx-diagonal-stripes animation-safe:bgx-slide bgx-color-[currentColor] group-data-[playing=true]/pill:block"
        />
      </div>

      <div
        v-for="vrow in virtualizer.getVirtualItems()"
        :key="vrow.key as number"
        :data-index="vrow.index"
        :ref="(el) => virtualizer.measureElement(el as Element)"
        data-testid="transcript-view__row"
        class="absolute top-0 left-0 w-full pb-7"
        :style="{ transform: `translateY(${vrow.start - scroll_margin}px)` }"
      >
        <div
          v-if="rows[vrow.index].chapter_title"
          data-testid="transcript-view__chapter-heading"
          class="flex flex-col items-center gap-3"
          :class="vrow.index === 0 ? 'mt-0' : 'mt-32'"
        >
          <h2 class="text-xl font-medium text-ink-muted">
            {{ rows[vrow.index].chapter_title }}
          </h2>
          <hr class="w-16 border-ink" />
        </div>

        <transcript-segment
          :group="rows[vrow.index].paragraph"
          :index="rows[vrow.index].paragraph.index"
          :hide-inline-translation="hide_inline_translation"
        />
      </div>
    </div>

    <selection-preview :preview="selection_preview" />
  </div>
</template>
