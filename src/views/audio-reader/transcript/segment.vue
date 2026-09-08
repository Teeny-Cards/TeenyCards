<script setup lang="ts">
import type { SentenceWords } from '@/utils/transcript'

const {
  group,
  index,
  hideInlineTranslation = false
} = defineProps<{
  group: SentenceWords
  index: number
  // True in the reader's Fixed layout, where the translation is lifted out of the
  // scroll into the pinned band, so the inline gloss is dropped here.
  hideInlineTranslation?: boolean
}>()
</script>

<template>
  <div data-testid="transcript-segment" :data-index="index">
    <span data-testid="transcript-segment__source"
      ><ruby
        v-for="word in group.words"
        :key="word.index"
        data-testid="transcript-word"
        :data-word-index="word.index"
        :data-word-text="word.display"
        class="group/word cursor-pointer transition-colors duration-700 ease-out data-[playing=true]:duration-100 data-[active=true]:duration-100 data-[active=true]:text-(--color-on-accent) not-data-[active=true]:data-[playing=true]:text-(--color-accent-text)"
        ><span
          data-word-base
          class="inline-block origin-center leading-none transition-transform duration-700 ease-out group-data-[playing=true]/word:scale-115 group-data-[playing=true]/word:duration-100"
          >{{ word.display }}</span
        ><rt
          v-if="word.reading"
          data-testid="transcript-word__reading"
          class="-translate-y-1 select-none text-base text-ink-muted"
          >{{ word.reading }}</rt
        ></ruby
      ></span
    >
    <span
      v-if="group.translation && !hideInlineTranslation"
      data-testid="transcript-segment__translation"
      class="block text-lg text-ink-muted leading-[1.5]"
      >{{ group.translation }}</span
    >
  </div>
</template>
