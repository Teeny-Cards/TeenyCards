<script lang="ts" setup>
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'created', deck: Deck): void
}>()

const title = ref('')
const description = ref('')

function onCreateDeck() {
  emit('created', { title: title.value, description: description.value })
  title.value = ''
  description.value = ''
}
</script>

<template>
  <div
    class="bg-brown-300 rounded-11 shadow-modal flex w-full flex-col items-center justify-center
      overflow-hidden pb-6 lg:max-w-max"
  >
    <div
      data-testid="edit-card-modal__title"
      class="wave-bottom flex w-full justify-center bg-purple-500 pt-12 pb-16 text-white"
    >
      <h1 class="font-primary text-5xl font-semibold">Create Deck</h1>
    </div>
    <div data-testid="edit-card-modal__body" class="flex w-full flex-col items-center gap-2 px-16">
      <ui-kit:input type="text" placeholder="Title" v-model="title" />
      <ui-kit:input type="text" placeholder="Description" v-model="description" />
      <ui-kit:button icon-left="add" @click="onCreateDeck">Create</ui-kit:button>
    </div>
  </div>
</template>
