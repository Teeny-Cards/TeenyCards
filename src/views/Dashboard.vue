<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchMemberDecks } from '@/services/deck-service'
import { useToastStore } from '@/stores/toast'
import Deck from '@/components/deck.vue'
import { useRouter } from 'vue-router'
import { createDeck as upstreamCreateDeck } from '@/services/deck-service'
import CreateDeckModal from '@/components/modals/create-deck.vue'
import { useModal } from '@/composables/use-modal'

const toastStore = useToastStore()
const router = useRouter()

const { openModal } = useModal()

const loading = ref(true)
const decks = ref<Deck[]>([])
const create_deck_modal = ref()

onMounted(async () => {
  await refetchDecks()
  loading.value = false
})

const due_decks = computed(() => {
  return decks.value.filter((deck) => deck.due_cards?.length ?? 0 > 0)
})

async function refetchDecks() {
  try {
    decks.value = await fetchMemberDecks()
  } catch (e: any) {
    toastStore.error(e.message)
  }
}

function onDeckClicked(deck: Deck) {
  router.push({ name: 'deck', params: { id: deck.id } })
}

function onCreateDeckClicked() {
  create_deck_modal.value = openModal({
    component: CreateDeckModal,
    backdrop: true,
    props: {
      onCreated: createDeck
    }
  })
}

async function createDeck(deck: Deck) {
  await upstreamCreateDeck(deck)
  await refetchDecks()
  create_deck_modal.value.close()
}
</script>

<template>
  <div class="flex h-full flex-col gap-16">
    <div class="flex flex-col gap-4">
      <h1 class="text-grey-700 text-3xl">{{ $t('dashboard.due') }}</h1>
      <div class="flex gap-4">
        <Deck
          v-for="(deck, index) in due_decks"
          :key="index"
          :deck="deck"
          @clicked="() => onDeckClicked(deck)"
        />
      </div>
    </div>

    <div class="flex flex-col gap-4">
      <h1 class="text-grey-700 text-3xl">All Decks</h1>
      <div class="flex gap-4">
        <Deck
          v-for="(deck, index) in decks"
          :key="index"
          :deck="deck"
          @clicked="() => onDeckClicked(deck)"
        />
      </div>
      <ui-kit:button icon-left="add" @click="onCreateDeckClicked">Create Deck</ui-kit:button>
    </div>
  </div>
</template>
