<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { emitSfx } from '@/sfx/bus'
import { useLessonsByCollectionQuery } from '@/api/lessons'
import { useLessonReader } from '@/composables/audio-reader/lesson-reader'
import { useReaderProgress } from '@/composables/audio-reader/reader-progress'
import { useReaderPrefs } from '@/composables/audio-reader/reader-prefs'
import { useCollectionEditModal } from '@/composables/audio-reader/collection-edit-modal'
import { useAnimatedHeight } from '@/composables/ui/animated-height'
import { useMatchMedia } from '@/composables/ui/media-query'
import { scrollClearOf } from '@/utils/animations/transcript-scroll'
import { fadeEnter, fadeLeave } from '@/utils/animations/fade'
import UiButton from '@/components/ui-kit/button.vue'
import UiIcon from '@/components/ui-kit/icon.vue'
import CrossfadeResize from '@/components/layout-kit/crossfade-resize.vue'
import MobileDock from '@/components/mobile-dock/mobile-dock.vue'
import { useMobileDock } from '@/components/mobile-dock/use-mobile-dock'
import AudioToolbar from '@/views/audio-reader/lesson/audio-toolbar.vue'
import ChapterList from '@/views/audio-reader/lesson/chapter-list.vue'
import ReaderSettings from '@/views/audio-reader/lesson/reader-settings.vue'
import ResumeFollowButton from '@/views/audio-reader/lesson/resume-follow-button.vue'
import TranslationZone from '@/views/audio-reader/lesson/translation-zone.vue'
import TranscriptView from '@/views/audio-reader/transcript/index.vue'
import TermCard from '@/views/audio-reader/term-popover/term-card.vue'

const { collectionId, lessonId } = defineProps<{ collectionId: string; lessonId: string }>()

const { t } = useI18n()
const router = useRouter()
const edit_modal = useCollectionEditModal()

const collection_id = computed(() => Number(collectionId))
const lesson_id = computed(() => Number(lessonId))

const {
  lesson,
  paragraphs,
  matches,
  audio_url,
  active_word,
  selection,
  selected_term_decks,
  popover_open,
  target_lang,
  openTerm,
  closeTerm,
  playFromHere,
  playClip,
  player
} = useLessonReader(lesson_id)

const { restored } = useReaderProgress(collection_id, lesson_id, player)

const { data: lessons_data } = useLessonsByCollectionQuery(collection_id)

const { display_mode, translation_source } = useReaderPrefs()

const { el: dock_el, claimHeight, releaseHeight } = useMobileDock()
const is_desktop = useMatchMedia('w>=xl')

// The reader-settings panel replaces the toolbar in the dock, like the term card
// does. Phone only — the desktop sidebar keeps its own controls.
const show_settings_in_dock = ref(false)

const footer_swap = useTemplateRef<{ $el: HTMLElement }>('footer_swap')
const footer_swap_el = computed(() => footer_swap.value?.$el ?? null)
const footer_term = useTemplateRef<HTMLElement>('footer_term')
const footer_settings = useTemplateRef<HTMLElement>('footer_settings')
const footer_toolbar = useTemplateRef<HTMLElement>('footer_toolbar')

const transcript = useTemplateRef<{
  following: boolean
  follow_direction: 'up' | 'down'
  resumeFollow: () => void
  active_translation: string | null
  centered_translation: string | null
}>('transcript')

// Gap to leave between the selected word and the footer's top edge after a reveal.
const FOOTER_CLEARANCE = 16

// True while the toolbar ⇄ term crossfade owns the footer height, so the
// content-driven height animation stands down and only tracks the baseline.
let swapping = false

// Deferred mirror of show_term_in_dock — flips true one rAF after the real flag
// so the tap frame has zero component-mounting work. Mounting term-card (buttons,
// composables, event listeners) synchronously on tap drops a frame on mobile.
const show_term_in_dock_deferred = ref(false)
let term_dock_raf: ReturnType<typeof requestAnimationFrame> | null = null

const chapters = computed(() => lessons_data.value ?? [])
const current_index = computed(() => chapters.value.findIndex((c) => c.id === lesson_id.value))
const chapter_of = computed(() => ({
  current: current_index.value + 1,
  total: chapters.value.length
}))

// The current lesson's auto-detected internal chapters (one long file split into
// sections). When present they drive seek-based navigation; the collection-lesson
// nav stays the fallback for multi-lesson books with no internal split.
const lesson_chapters = computed(() => lesson.value?.transcript?.chapters ?? [])
const has_lesson_chapters = computed(() => lesson_chapters.value.length > 1)

const show_term = computed(() => popover_open.value && !!selection.value)

// The term card lives in the mobile dock below xl and in the desktop sidebar at
// xl+. Gate by viewport so only one term-card mounts — two would double-fetch.
const show_term_in_dock = computed(() => show_term.value && !is_desktop.value)
const show_term_in_sidebar = computed(() => show_term.value && is_desktop.value)

// The transcript drops follow whenever the member scrolls by hand, so this turns
// true on both breakpoints — the dock control shows below xl, the floating one at
// xl+.
const show_follow_button = computed(() => transcript.value?.following === false)
const follow_direction = computed(() => transcript.value?.follow_direction ?? 'down')

// The Fixed layout applies on phone only; desktop keeps its inline glosses and
// ignores the display settings entirely.
const use_fixed_layout = computed(() => !is_desktop.value && display_mode.value === 'fixed')

// What the pinned band shows: the playing line's translation, or the line at the
// viewport centre, per the member's "translation follows" choice. Only in Fixed.
const pinned_translation = computed(() => {
  if (!use_fixed_layout.value) return null
  return translation_source.value === 'scroll'
    ? (transcript.value?.centered_translation ?? null)
    : (transcript.value?.active_translation ?? null)
})

// Veil the reader until the transcript is loaded and the chapter has been
// positioned at its resume offset, so the resume seek lands behind the veil and
// the reveal shows the reader already at the right spot.
const ready = computed(() => !!lesson.value && restored.value)

function goToChapter(id: number) {
  router.push({ name: 'lesson', params: { collectionId: collection_id.value, lessonId: id } })
}

// Jump to an internal chapter by seeking the current audio and playing from there
// — the click is a user gesture, so iOS honours the seek + play.
function seekToChapter(start: number) {
  player.seek(start)
  player.play()
}

function onEdit() {
  edit_modal.open(collection_id.value)
}

// Rejoin the playing line and re-arm follow — the transcript owns both, so just
// forward the tap.
function resumeFollow() {
  transcript.value?.resumeFollow()
}

// Seeking to the term's start should rejoin the live scroll too, in case the
// member had scrolled away before playing from here.
function onPlayFromHere() {
  transcript.value?.resumeFollow()
  playFromHere()
}

// Tapping outside the term dismisses it with the same cue as its close button.
function dismissTerm() {
  emitSfx('dialog.close')
  closeTerm()
}

// The word was scrolled clear of the dock when the term opened, but the dock
// grows once the definition loads and can re-cover it — lift it back above the
// settled dock.
function reclearSelection() {
  const sel = selection.value
  if (!show_term_in_dock.value || !sel || !dock_el.value) return

  const word = document.querySelector<HTMLElement>(`[data-word-index="${sel.word_index}"]`)
  if (!word) return

  scrollClearOf(word, dock_el.value.getBoundingClientRect().top - FOOTER_CLEARANCE, false)
}

// The crossfade owns the footer height while a pane swap is in flight, so the
// content-driven height animation stands down between swap-start and swap-end. →[K:dock-height-single-owner]
function onSwapStart() {
  swapping = true
  claimHeight()
}

function onSwapEnd() {
  swapping = false
  releaseHeight()
}

// The dock's display-settings trigger and the panel's Done control funnel through
// these, so the cue plays once here rather than on each button.
function openReaderSettings() {
  emitSfx('ui.press')
  show_settings_in_dock.value = true
}

function closeReaderSettings() {
  emitSfx('ui.press')
  show_settings_in_dock.value = false
}

// Track whichever pane is mounted: the term card swelling as its definition loads,
// and the toolbar growing/shrinking between its mini and expanded modes. The
// crossfade between the two panes owns the height while `swapping`.
useAnimatedHeight(footer_swap_el, footer_term, () => !swapping, reclearSelection)
useAnimatedHeight(footer_swap_el, footer_settings, () => !swapping)
useAnimatedHeight(footer_swap_el, footer_toolbar, () => !swapping)

watch(show_term_in_dock, (v) => {
  if (v) {
    if (term_dock_raf !== null) return
    term_dock_raf = requestAnimationFrame(() => {
      term_dock_raf = null
      show_term_in_dock_deferred.value = true
    })
  } else {
    if (term_dock_raf !== null) {
      cancelAnimationFrame(term_dock_raf)
      term_dock_raf = null
    }
    show_term_in_dock_deferred.value = false
  }
})

onBeforeUnmount(() => {
  if (term_dock_raf !== null) cancelAnimationFrame(term_dock_raf)
})
</script>

<template>
  <section
    data-testid="lesson-view"
    class="flex min-h-[calc(100dvh-var(--nav-height)-var(--mobile-dock-height,0px))] flex-col gap-6 xl:flex-row px-(--page-px) pt-(--page-pt)"
  >
    <transition :css="false" @leave="fadeLeave">
      <div
        v-if="!ready"
        data-testid="lesson-view__loader"
        class="fixed inset-x-0 top-(--nav-height) bottom-[var(--mobile-dock-height,0px)] z-20 flex items-center justify-center bg-surface sm:!bottom-0"
      >
        <ui-icon src="loading-dots" class="h-16 w-16 text-ink" />
      </div>
    </transition>

    <aside
      data-testid="lesson-view__sidebar"
      class="hidden shrink-0 flex-col gap-4 xl:flex xl:sticky xl:top-(--nav-height) xl:h-[calc(100dvh-var(--nav-height))] xl:w-80 xl:self-start"
    >
      <header data-testid="lesson-view__header" class="flex items-center justify-between gap-4">
        <div data-testid="lesson-view__heading" class="flex flex-col gap-1">
          <h1 class="text-3xl text-ink">{{ lesson?.title }}</h1>

          <span
            v-if="chapter_of.total > 0"
            data-testid="lesson-view__chapter-of"
            class="text-base text-ink-muted"
          >
            {{ t('lesson-view.chapter-of', chapter_of) }}
          </span>
        </div>

        <ui-button
          neutral
          data-testid="lesson-view__edit"
          icon-left="settings"
          icon-only
          size="lg"
          @press="onEdit"
        >
          {{ t('lesson-view.edit-button') }}
        </ui-button>
      </header>

      <transition :css="false" mode="out-in" @enter="fadeEnter" @leave="fadeLeave">
        <div
          v-if="show_term_in_sidebar && selection"
          key="term"
          data-testid="lesson-view__sidebar-term"
          class="flex-1 overflow-y-auto"
        >
          <term-card
            :term="selection.term"
            :sentence="selection.sentence"
            :target_lang="target_lang"
            :existing_decks="selected_term_decks"
            show_back
            @back="closeTerm"
            @close="closeTerm"
            @play-from-here="onPlayFromHere"
            @play-word="playClip"
          />
        </div>

        <chapter-list
          v-else-if="has_lesson_chapters"
          key="lesson-chapters"
          data-testid="lesson-view__lesson-chapters"
          class="flex-1"
          :chapters="lesson_chapters"
          :current-time="player.current_time"
          @seek="seekToChapter"
        />

        <nav
          v-else
          key="chapters"
          data-testid="lesson-view__chapters"
          class="flex flex-1 gap-2 overflow-x-auto pb-2 xl:flex-col xl:overflow-x-visible xl:overflow-y-auto xl:pb-0"
        >
          <button
            v-for="chapter in chapters"
            :key="chapter.id"
            data-testid="lesson-view__chapter"
            :data-active="chapter.id === lesson_id"
            type="button"
            class="shrink-0 cursor-pointer rounded-7 bg-raised px-4 py-2 text-left text-base text-ink data-[active=true]:bg-(--color-accent) data-[active=true]:text-(--color-on-accent) xl:shrink"
            @click="goToChapter(chapter.id)"
          >
            <span class="line-clamp-1">{{ chapter.title }}</span>
          </button>
        </nav>
      </transition>

      <audio-toolbar
        data-testid="lesson-view__sidebar-toolbar"
        :player="player"
        :chapters="chapters"
        :lesson-chapters="lesson_chapters"
        :current-lesson-id="lesson_id"
        @select-chapter="goToChapter"
        @seek="seekToChapter"
      />
    </aside>

    <div data-testid="lesson-view__reader" class="relative flex flex-1 flex-col xl:min-w-0">
      <header
        data-testid="lesson-view__title"
        class="flex flex-col items-center px-4 pb-6 text-center xl:hidden"
      >
        <h1 data-testid="lesson-view__title-text" class="text-3xl text-ink">
          {{ lesson?.title }}
        </h1>
      </header>

      <div
        data-testid="lesson-view__transcript"
        class="px-0 pt-6 pb-2 contain-[layout_style] sm:px-6"
      >
        <transcript-view
          ref="transcript"
          :paragraphs="paragraphs"
          :chapters="lesson_chapters"
          :matches="matches"
          :active_word="active_word"
          :popover_open="popover_open"
          :hide_inline_translation="use_fixed_layout"
          @select="openTerm"
          @dismiss="dismissTerm"
        />
      </div>

      <mobile-dock breakpoint="xl">
        <template #above>
          <div data-testid="lesson-view__above" class="flex w-full flex-col items-end gap-3">
            <transition :css="false" @enter="fadeEnter" @leave="fadeLeave">
              <resume-follow-button
                v-if="show_follow_button"
                data-testid="lesson-view__resume-follow"
                :direction="follow_direction"
                class="pointer-events-auto"
                @resume="resumeFollow"
              />
            </transition>

            <div
              v-if="use_fixed_layout"
              data-testid="lesson-view__translation-band"
              class="w-full overflow-hidden rounded-6 bg-surface shadow-sm ring-1 ring-line"
            >
              <translation-zone :translation="pinned_translation" />
            </div>
          </div>
        </template>

        <crossfade-resize
          ref="footer_swap"
          data-testid="lesson-view__dock-swap"
          @swap-start="onSwapStart"
          @swap-end="onSwapEnd"
        >
          <div
            v-if="show_term_in_dock_deferred && selection"
            key="term"
            ref="footer_term"
            data-testid="lesson-view__dock-term"
            class="px-(--dock-px) pt-(--dock-pt) pb-(--dock-pb)"
          >
            <term-card
              :term="selection.term"
              :sentence="selection.sentence"
              :target_lang="target_lang"
              :existing_decks="selected_term_decks"
              show_back
              @back="closeTerm"
              @close="closeTerm"
              @play-from-here="onPlayFromHere"
              @play-word="playClip"
            />
          </div>

          <div
            v-else-if="show_settings_in_dock"
            key="settings"
            ref="footer_settings"
            data-testid="lesson-view__dock-settings"
            class="px-(--dock-px) pt-(--dock-pt) pb-(--dock-pb)"
          >
            <reader-settings :player="player" @close="closeReaderSettings" />
          </div>

          <div
            v-else
            key="toolbar"
            ref="footer_toolbar"
            data-testid="lesson-view__dock-toolbar"
            class="px-(--dock-px) pt-(--dock-pt) pb-(--dock-pb)"
          >
            <audio-toolbar
              :player="player"
              :chapters="chapters"
              :lesson-chapters="lesson_chapters"
              :current-lesson-id="lesson_id"
              :show-speed="false"
              @select-chapter="goToChapter"
              @seek="seekToChapter"
              @open-settings="openReaderSettings"
            />
          </div>
        </crossfade-resize>
      </mobile-dock>

      <audio
        ref="audio"
        data-testid="lesson-view__audio"
        :src="audio_url ?? undefined"
        class="hidden"
      />

      <transition :css="false" @enter="fadeEnter" @leave="fadeLeave">
        <resume-follow-button
          v-if="show_follow_button"
          data-testid="lesson-view__resume-follow-desktop"
          :direction="follow_direction"
          class="fixed right-16 bottom-6 z-30 hidden xl:block"
          @resume="resumeFollow"
        />
      </transition>
    </div>
  </section>
</template>
