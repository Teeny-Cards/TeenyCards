<script setup lang="ts">
import Card from '@/components/card.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const { deck } = defineProps<{ deck: Deck }>()
defineEmits<{ (e: 'study-clicked'): void; (e: 'settings-clicked'): void }>()

const study_disabled = computed(() => {
  return deck.cards?.length === 0
})
</script>

<template>
  <div
    data-testid="overview-panel"
    class="sticky top-24 flex w-max flex-col items-center gap-6 sm:flex-row sm:items-end lg:flex-col
      lg:items-start"
  >
    <card size="large" class="relative overflow-hidden"></card>

    <div class="flex flex-col items-center gap-2 sm:items-start">
      <h1
        data-testid="overview-panel__title"
        class="text-grey-700 w-64 text-center text-5xl sm:text-left"
      >
        {{ deck.title }}
      </h1>

      <h2
        data-testid="overview-panel__description"
        class="text-grey-500 w-64 text-center sm:text-left"
      >
        {{ deck.description }}
      </h2>

      <div class="flex items-center gap-2 text-blue-500">
        <ui-kit:icon src="user" />
        <h2 class="text-lg font-semibold">
          {{ deck.member?.display_name }}
        </h2>
      </div>
    </div>

    <div class="flex items-center gap-2.5">
      <ui-kit:button
        data-testid="overview-panel__study-button"
        icon-left="play"
        fancy-hover
        :disabled="study_disabled"
        @click="$emit('study-clicked')"
      >
        {{ t('common.study') }}
      </ui-kit:button>

      <ui-kit:button
        data-testid="overview-panel__settings-button"
        icon-left="settings"
        variant="muted"
        icon-only
        @click="$emit('settings-clicked')"
      ></ui-kit:button>
    </div>
  </div>
</template>
