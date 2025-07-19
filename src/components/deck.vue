<script setup lang="ts">
import Card from '@/components/card.vue'
import { getImageUrl } from '@/services/file-service'
import { onMounted, ref, computed } from 'vue'
import deckPreview from './deck-preview.vue'
import StudyModal from './study-modal/index.vue'

const { deck } = defineProps<{ deck: Deck }>()
defineEmits<{ (e: 'clicked'): void }>()

const image_url = ref('')
const study_modal_open = ref(false)

onMounted(() => {
  if (!deck.image_path) {
    return
  }

  image_url.value = getImageUrl('deck-images', deck.image_path)
})

function onStudyClicked() {
  study_modal_open.value = true
}

const numCardsDue = computed(() => {
  return deck.due_cards?.length ?? 0
})
</script>

<template>
  <div data-testid="deck" class="relative flex w-max flex-col gap-2.5">
    <Card
      size="small"
      class="border-brown-300 relative cursor-pointer overflow-hidden border-8 bg-purple-400
        bg-(image:--diagonal-stripes)"
      @click="$emit('clicked')"
      :image_url="image_url"
    >
      <deck-preview :deck="deck" :image-url="image_url" @study="onStudyClicked" />
    </Card>

    <div
      v-if="numCardsDue"
      class="ring-brown-100 absolute -top-2 -right-2 flex h-7.5 w-7.5 items-center justify-center rounded-full
        bg-red-500 ring-4"
    >
      <h2 class="text-base text-white">{{ numCardsDue }}</h2>
    </div>

    <div>
      <h2 class="text-md text-brown-700">{{ deck.title }}</h2>
    </div>
  </div>

  <!-- <StudyModal :open="study_modal_open" @closed="study_modal_open = false" :deck="deck" /> -->
</template>
