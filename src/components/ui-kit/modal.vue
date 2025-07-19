<script setup lang="ts">
import { onUnmounted, useTemplateRef, nextTick } from 'vue'
import { disableBodyScroll, enableBodyScroll } from 'body-scroll-lock'
import { onMounted } from 'vue'

const emit = defineEmits<{
  (event: 'closed'): void
  (event: 'opened'): void
}>()

const { closeOnBackdropClick = true } = defineProps({
  backdrop: Boolean,
  closeOnBackdropClick: Boolean
})

const modal = useTemplateRef<HTMLDivElement>('ui-kit-modal')

onMounted(async () => {
  await nextTick()
  if (!modal.value) return
  disableBodyScroll(modal.value, { reserveScrollBarGap: true })
  emit('opened')
})

onUnmounted(() => {
  if (!modal.value) return
  enableBodyScroll(modal.value)
})

function close(e: Event) {
  const target = e.target as HTMLElement

  if (closeOnBackdropClick && target.dataset.testid === 'ui-kit-modal') {
    emit('closed')
  }
}
</script>

<template>
  <div
    data-testid="ui-kit-modal"
    ref="ui-kit-modal"
    class="pointer-events-auto fixed -inset-15 flex items-center justify-center px-4 py-7"
    :class="{ 'backdrop-blur-4 bg-black/25': backdrop }"
    @click="close"
  >
    <slot></slot>
  </div>
</template>
