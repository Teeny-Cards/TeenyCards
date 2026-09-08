<script setup lang="ts">
import { useTaroPhoneStore } from '@/stores/taro-phone'

const emit = defineEmits<{
  (e: 'open'): void
}>()

const store = useTaroPhoneStore()
</script>

<template>
  <div
    v-sfx="{ hover: 'ui.hover' }"
    @click="emit('open')"
    data-testid="phone"
    data-station="window"
    class="absolute top-0 right-0 w-16.25 h-22 bg-surface rounded-4.5 shadow-xs rotate-6 hover:rotate-2 hover:scale-81 transition-transform duration-150 cursor-pointer p-2 pb-1 mt-1 flex flex-col gap-1 items-center scale-75 pointer-events-auto"
  >
    <div
      v-if="store.notification_count > 0"
      data-testid="notification-badge"
      data-palette="danger"
      class="absolute top-0 left-0 w-4 h-4 bg-(--color-accent) outline-4 outline-surface rounded-full"
    ></div>

    <div data-testid="phone__screen" class="w-full h-full bg-ink-muted rounded-2.5"></div>
    <div
      data-testid="phone__home-button"
      class="w-2.75 h-2.75 rounded-full outline-1 outline-ink-muted shrink-0"
    ></div>
  </div>
</template>
