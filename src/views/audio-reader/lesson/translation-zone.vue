<script setup lang="ts">
import {
  translationCrossfadeEnter,
  translationCrossfadeLeave
} from '@/utils/animations/translation-crossfade'

type TranslationZoneProps = {
  // The line's translation to show, or null to show nothing (a line with no
  // translation shows an empty band, never the previous line's text).
  translation?: string | null
}

const { translation = null } = defineProps<TranslationZoneProps>()
</script>

<template>
  <div
    data-testid="translation-zone"
    class="relative flex min-h-12 w-full items-center justify-center px-4 pb-3 text-center"
  >
    <transition :css="false" @enter="translationCrossfadeEnter" @leave="translationCrossfadeLeave">
      <p
        v-if="translation"
        :key="translation"
        data-testid="translation-zone__text"
        class="absolute inset-x-4 top-0 text-lg text-ink-muted leading-[1.5]"
      >
        {{ translation }}
      </p>
    </transition>
  </div>
</template>
