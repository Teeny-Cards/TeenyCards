<script setup lang="ts">
import HistoryTrack from './history-track.vue'
import StudyCard from './study-card.vue'
import RatingButtons from './rating-buttons.vue'
import { useStudySession } from '@/composables/use-study-session'
import { type RecordLogItem } from 'ts-fsrs'
import { computed, onMounted, ref } from 'vue'
import { updateReviewByCardId } from '@/services/card-service'

const { deck } = defineProps<{ deck: Deck; close: (response?: boolean) => void }>()

const {
  cards_in_deck,
  current_card_state,
  current_card,
  view_state,
  studied_card_ids,
  failed_card_ids,
  active_card_review_options,
  setupStudySession,
  startSession,
  advanceToNextCard,
  setPreviewCard
} = useStudySession()

const setupOnce = ref(false)

const isPreviewingOrRevealed = computed(() => {
  return view_state.value === 'previewing' || current_card_state.value === 'revealed'
})

onMounted(() => {
  setup()
})

async function onCardReviewed(item: RecordLogItem) {
  if (!current_card.value?.id || view_state.value !== 'studying') return

  await updateReviewByCardId(current_card.value.id, item.card)
  advanceToNextCard(item.log.rating)
}

function onCardRevealed() {
  current_card_state.value = 'revealed'
}

function setup() {
  if (!setupOnce.value) {
    setupStudySession(deck.cards, { study_all_cards: true })
    startSession()
    setupOnce.value = true
  }
}
</script>

<template>
  <div
    data-testid="study-modal"
    class="bg-brown-300 rounded-8 shadow-modal flex h-170 w-268 flex-col items-center overflow-hidden pb-6"
  >
    <div
      data-testid="study-modal__header"
      class="pointy-bottom relative flex w-full justify-center bg-purple-500 bg-(image:--diagonal-stripes)
        bg-(length:--bg-sm) px-13 py-11.5"
    >
      <div data-testid="study-modal__actions" class="absolute top-0 left-0 p-4">
        <ui-kit:button
          icon-left="close"
          variant="muted"
          inverted
          icon-only
          @click="close()"
        ></ui-kit:button>
      </div>
      <h1 class="text-5xl text-white">Studying {{ deck?.title }}</h1>
    </div>

    <div
      data-testid="study-modal__body"
      class="grid h-full w-full grid-cols-[1fr_auto_1fr] content-center"
    >
      <div data-testid="study-modal__powerup"></div>
      <study-card
        :card="current_card"
        :revealed="current_card_state === 'revealed'"
        :previewing="view_state === 'previewing'"
      />

      <rating-buttons
        :options="active_card_review_options"
        :show-options="isPreviewingOrRevealed"
        :disabled="view_state !== 'studying'"
        @reviewed="onCardReviewed"
        @revealed="onCardRevealed"
      />
    </div>

    <history-track
      :cards="cards_in_deck"
      :studied-card-ids="studied_card_ids"
      :failed-card-ids="failed_card_ids"
      :current-card="current_card"
      @card-clicked="setPreviewCard"
    />
  </div>
</template>
