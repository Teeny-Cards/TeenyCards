<script setup lang="ts">
import OverviewPanel from '@/components/deck-view/overview-panel.vue'
import { onMounted, ref, inject } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { fetchDeckById } from '@/services/deck-service'
import StudyModal from '@/components/study-modal/index.vue'
import CardList from '@/components/deck-view/card-list/index.vue'
import { useI18n } from 'vue-i18n'
import { useEditableCards } from '@/composables/use-editable-cards'
import { updateCards, deleteCardsById } from '@/services/card-service'
import { useModal } from '@/composables/use-modal'
import confirmationAlert from '@/components/confirmation-alert.vue'

const { t } = useI18n()

const { id: deck_id } = defineProps<{
  id: string
}>()

const { openModal } = useModal()

const deck = ref<Deck>()
const studyModalOpen = ref(false)
const editing = ref(false)
let cardEdits: ReturnType<typeof useEditableCards> | undefined

const tabs = [
  {
    label: t('deck-view.tabs.list-view'),
    icon: 'list'
  },
  {
    label: t('deck-view.tabs.card-view')
  }
]

onMounted(async () => {
  try {
    const id = Number(deck_id)
    deck.value = await fetchDeckById(id)

    cardEdits = useEditableCards(deck.value.cards ?? [], deck.value.id)
  } catch (e: any) {
    // TODO
  }
})

onBeforeRouteLeave(async (to, from) => {
  if (editing.value) {
    const modal = openModal({
      component: confirmationAlert,
      backdrop: true,
      props: {
        title: t('alert.leave-page'),
        message: t('alert.leave-page.message'),
        confirmLabel: t('alert.leave-page.stay'),
        cancelLabel: t('common.leave')
      }
    })

    const result = await modal.result

    if (result) {
      return false
    }
  }
})

async function saveEdits() {
  const changed = cardEdits?.getChangedCards()
  if (!changed) return

  if (changed.length > 0) {
    try {
      await updateCards(changed)
      await refetchCards()
      editing.value = false
    } catch (e: any) {
      // TODO
    }
  }
}

async function refetchCards() {
  try {
    deck.value = await fetchDeckById(Number(deck_id))
    cardEdits = useEditableCards(deck.value.cards ?? [], deck.value.id)
  } catch (e: any) {
    // TODO
  }
}

function discardEdits() {
  cardEdits?.resetChanges()
  editing.value = false
}

function selectCard(id: number) {
  // cardEdits?.selectCard(id)
}

async function deleteCards(ids: number[]) {
  if (!ids.length) return

  const modal = openModal({
    component: confirmationAlert,
    props: {
      title: t('alert.delete-card'),
      message: t('alert.delete-card.message'),
      confirmLabel: t('common.delete')
    }
  })

  const result = await modal.result

  if (result) {
    await deleteCardsById(ids)
    await refetchCards()
  }
}

function onAddCard() {
  editing.value = true
  cardEdits?.addCard()
}
</script>

<template>
  <section data-testid="deck-view" class="flex h-full items-start gap-15 pt-12">
    <overview-panel v-if="deck" :deck="deck" @study-clicked="studyModalOpen = true" />

    <div class="relative flex h-full w-full flex-col">
      <ui-kit:tabs :tabs="tabs" class="pb-4">
        <template #actions>
          <ui-kit:button v-if="!editing" icon-left="edit" @click="editing = true">
            {{ t('common.edit') }}
          </ui-kit:button>

          <div v-else class="flex gap-1.5">
            <ui-kit:button icon-left="close" variant="danger" @click="discardEdits">
              {{ t('common.cancel') }}
            </ui-kit:button>

            <ui-kit:button icon-left="check" @click="saveEdits()" :disabled="!cardEdits?.isDirty">
              {{ t('common.save') }}
            </ui-kit:button>
          </div>
        </template>
      </ui-kit:tabs>

      <ui-kit:divider />

      <card-list
        v-if="deck"
        :cards="cardEdits?.editedCards ?? []"
        :editing="editing"
        @updated="cardEdits?.updateCard"
        @add-card="onAddCard"
        @cards-deleted="deleteCards"
      />
    </div>
  </section>

  <!-- <study-modal v-if="deck" :open="studyModalOpen" :deck="deck" @closed="studyModalOpen = false" /> -->
</template>
