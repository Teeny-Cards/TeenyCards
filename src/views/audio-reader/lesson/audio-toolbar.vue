<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui-kit/button.vue'
import UiIcon from '@/components/ui-kit/icon.vue'
import UiDropdownButton, {
  type DropdownOption
} from '@/components/ui-kit/dropdown-button/index.vue'
import Scrubber from '@/views/audio-reader/lesson/scrubber.vue'
import { useLocalRef } from '@/composables/storage/local-ref'
import { useStagedTap } from '@/composables/ui/staged-tap'
import { emitSfx } from '@/sfx/bus'
import type { AudioPlayer } from '@/composables/audio-reader/audio-player'

type ToolbarChapter = { id: number; title: string }

type AudioToolbarProps = {
  player: AudioPlayer
  chapters: ToolbarChapter[]
  // The current lesson's internal chapters. When the lesson is split into two or
  // more, the chapter selector lists THESE (seeking within the one audio file)
  // instead of the collection's lessons (which route to a new page).
  lessonChapters?: TranscriptChapter[]
  currentLessonId: number
  // False in the phone dock, where speed moves into the reader-settings panel and
  // this slot instead opens that panel; true on the desktop sidebar, which keeps
  // its own inline speed control.
  showSpeed?: boolean
}

const SKIP_SECONDS = 10
// Striped texture that slides across a transport button while its tap-pop plays.
// `currentColor` makes the stripes track each button's own icon color.
const TAP_BGX = 'bgx-diagonal-stripes animation-safe:bgx-slide bgx-color-[currentColor]'
const SPEED_OPTIONS: DropdownOption[] = [
  { label: '0.5x', value: 0.5 },
  { label: '0.75x', value: 0.75 },
  { label: '1x', value: 1 },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2 }
]

const {
  player,
  chapters,
  lessonChapters = [],
  currentLessonId,
  showSpeed = true
} = defineProps<AudioToolbarProps>()

const emit = defineEmits<{
  (e: 'select-chapter', id: number): void
  (e: 'seek', start: number): void
  (e: 'open-settings'): void
}>()

const { t } = useI18n()

const mode = useLocalRef<'expanded' | 'mini'>('audio-reader.toolbar-mode', 'expanded')

const { playing: back_playing, tap: tapBack } = useStagedTap({ animate: 'pop', yoyo: true })
const { playing: play_playing, tap: tapPlay } = useStagedTap({ animate: 'pop', yoyo: true })
const { playing: forward_playing, tap: tapForward } = useStagedTap({ animate: 'pop', yoyo: true })

const is_playing = computed(() => player.is_playing.value)

// Internal chapters take over the selector when the lesson has a real split.
const use_lesson_chapters = computed(() => lessonChapters.length > 1)

// The active internal chapter is the last one whose start has been reached.
const active_lesson_chapter = computed(() => {
  let index = 0
  lessonChapters.forEach((chapter, i) => {
    if (chapter.start <= player.current_time.value + 0.001) index = i
  })
  return index
})

// Numbered so a chapter's position in the lesson is legible at a glance,
// independent of its (often non-Latin) title.
const chapter_options = computed<DropdownOption[]>(() =>
  use_lesson_chapters.value
    ? lessonChapters.map((chapter, i) => ({
        label: `${i + 1}. ${chapter.title}`,
        value: chapter.start,
        selected: i === active_lesson_chapter.value
      }))
    : chapters.map((chapter, i) => ({
        label: `${i + 1}. ${chapter.title}`,
        value: chapter.id,
        selected: chapter.id === currentLessonId
      }))
)
const current_chapter_label = computed(() =>
  use_lesson_chapters.value
    ? (lessonChapters[active_lesson_chapter.value]?.title ?? '')
    : (chapters.find((chapter) => chapter.id === currentLessonId)?.title ?? '')
)
const current_speed_label = computed(() => `${player.playback_rate.value}x`)

function toggle() {
  if (player.is_playing.value) player.pause()
  else player.play()
}

function skipBack() {
  player.skip(-SKIP_SECONDS)
}

function skipForward() {
  player.skip(SKIP_SECONDS)
}

// The transport buttons are custom markup, so they wire the tap-pop + select
// chime themselves (button.vue does this internally for kit buttons). staged-tap
// owns the action: it fires immediately on fine pointers and at the pop's peak
// on coarse — exactly one activation per pointer type.
function onPlayTap(e: MouseEvent) {
  emitSfx(player.is_playing.value ? 'dialog.open' : 'ui.press')
  tapPlay(toggle)(e)
}

function onBackTap(e: MouseEvent) {
  emitSfx('ui.press')
  tapBack(skipBack)(e)
}

function onForwardTap(e: MouseEvent) {
  emitSfx('ui.press')
  tapForward(skipForward)(e)
}

function onChapter(option: DropdownOption) {
  // Chapters carry a start time to seek; collection lessons carry an id to route to.
  if (use_lesson_chapters.value) emit('seek', Number(option.value))
  else emit('select-chapter', Number(option.value))
}

function onSpeed(option: DropdownOption) {
  player.setPlaybackRate(Number(option.value))
}

function setMode(next: 'expanded' | 'mini') {
  mode.value = next
}
</script>

<template>
  <div data-testid="audio-toolbar" class="flex w-full min-w-0 flex-col">
    <div
      v-if="mode === 'expanded'"
      data-testid="audio-toolbar__expanded"
      class="flex flex-col gap-5"
    >
      <scrubber :player="player" layout="stacked" />

      <div data-testid="audio-toolbar__controls" class="flex items-center justify-center gap-6">
        <button
          data-testid="audio-toolbar__skip-back"
          type="button"
          :aria-label="t('lesson-view.audio.skip-back-button')"
          class="flex size-13 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-raised text-ink transition active:scale-95"
          :class="{ [TAP_BGX]: back_playing }"
          @click="onBackTap"
        >
          <ui-icon src="skip-backward-10" class="size-6" />
        </button>

        <button
          data-testid="audio-toolbar__toggle"
          type="button"
          data-palette="brand"
          :aria-label="
            is_playing ? t('lesson-view.audio.pause-button') : t('lesson-view.audio.play-button')
          "
          class="flex size-18 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-(--color-accent) text-(--color-on-accent) transition active:scale-95"
          :class="{ [TAP_BGX]: play_playing }"
          @click="onPlayTap"
        >
          <ui-icon :src="is_playing ? 'pause' : 'play'" class="size-8" />
        </button>

        <button
          data-testid="audio-toolbar__skip-forward"
          type="button"
          :aria-label="t('lesson-view.audio.skip-forward-button')"
          class="flex size-13 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-raised text-ink transition active:scale-95"
          :class="{ [TAP_BGX]: forward_playing }"
          @click="onForwardTap"
        >
          <ui-icon src="skip-forward-10" class="size-6" />
        </button>
      </div>

      <div data-testid="audio-toolbar__options" class="grid grid-cols-[68px_1fr_68px] items-center">
        <div data-testid="audio-toolbar__options-start" class="flex justify-start">
          <ui-button
            neutral
            data-testid="audio-toolbar__collapse"
            icon-left="minimize"
            variant="ghost"
            icon-only
            play-on-tap
            :sfx="{ press: 'ui.press' }"
            @press="setMode('mini')"
          />
        </div>

        <div data-testid="audio-toolbar__options-center" class="flex justify-center">
          <ui-dropdown-button
            data-testid="audio-toolbar__chapter-select"
            icon-left="browser-content"
            variant="ghost"
            open-on-trigger
            hide-trigger
            shadow
            position="top"
            :options="chapter_options"
            @select="onChapter"
          >
            <span
              data-testid="audio-toolbar__chapter-label"
              class="block max-w-[8rem] truncate sm:max-w-[14rem]"
              >{{ current_chapter_label }}</span
            >
          </ui-dropdown-button>
        </div>

        <div data-testid="audio-toolbar__options-end" class="flex justify-end">
          <ui-dropdown-button
            v-if="showSpeed"
            data-testid="audio-toolbar__speed-select"
            icon-left="stopwatch"
            variant="ghost"
            open-on-trigger
            hide-trigger
            shadow
            position="top-end"
            :options="SPEED_OPTIONS"
            @select="onSpeed"
          >
            {{ current_speed_label }}
          </ui-dropdown-button>

          <ui-button
            v-else
            neutral
            data-testid="audio-toolbar__display-settings"
            icon-left="page-setting"
            variant="ghost"
            icon-only
            @press="emit('open-settings')"
          >
            {{ t('audio-reader.reader-settings.trigger') }}
          </ui-button>
        </div>
      </div>
    </div>

    <div
      v-else
      data-testid="audio-toolbar__mini"
      class="grid grid-cols-5 items-center justify-items-center gap-2"
    >
      <ui-button
        neutral
        data-testid="audio-toolbar__expand"
        icon-left="maximize"
        variant="ghost"
        icon-only
        play-on-tap
        :sfx="{ press: 'ui.press' }"
        @press="setMode('expanded')"
      />

      <button
        data-testid="audio-toolbar__skip-back"
        type="button"
        :aria-label="t('lesson-view.audio.skip-back-button')"
        class="flex size-13 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-raised text-ink transition active:scale-95"
        :class="{ [TAP_BGX]: back_playing }"
        @click="onBackTap"
      >
        <ui-icon src="skip-backward-10" class="size-6" />
      </button>

      <button
        data-testid="audio-toolbar__toggle"
        type="button"
        data-palette="brand"
        :aria-label="
          is_playing ? t('lesson-view.audio.pause-button') : t('lesson-view.audio.play-button')
        "
        class="flex size-18 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-(--color-accent) text-(--color-on-accent) transition active:scale-95"
        :class="{ [TAP_BGX]: play_playing }"
        @click="onPlayTap"
      >
        <ui-icon :src="is_playing ? 'pause' : 'play'" class="size-8" />
      </button>

      <button
        data-testid="audio-toolbar__skip-forward"
        type="button"
        :aria-label="t('lesson-view.audio.skip-forward-button')"
        class="flex size-13 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-raised text-ink transition active:scale-95"
        :class="{ [TAP_BGX]: forward_playing }"
        @click="onForwardTap"
      >
        <ui-icon src="skip-forward-10" class="size-6" />
      </button>

      <ui-dropdown-button
        v-if="showSpeed"
        data-testid="audio-toolbar__speed-select"
        icon-left="stopwatch"
        variant="ghost"
        open-on-trigger
        hide-trigger
        shadow
        position="top-end"
        :options="SPEED_OPTIONS"
        @select="onSpeed"
      >
        {{ current_speed_label }}
      </ui-dropdown-button>

      <ui-button
        v-else
        neutral
        data-testid="audio-toolbar__display-settings"
        icon-left="page-setting"
        variant="ghost"
        icon-only
        @press="emit('open-settings')"
      >
        {{ t('audio-reader.reader-settings.trigger') }}
      </ui-button>
    </div>
  </div>
</template>
