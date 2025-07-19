<template>
  <RouterView />

  <div
    v-if="sessionStore.isLoading"
    class="absolute inset-0 z-10 flex items-center justify-center bg-green-400"
  >
    Loading
  </div>

  <teleport to="[toast-container]">
    <ui-kit:toast v-for="(toast, index) in toasts" :key="index" :toast="toast" />
  </teleport>

  <transition-group
    tag="div"
    class="pointer-events-none fixed inset-0 z-20"
    enter-from-class="scale-90 opacity-0"
    enter-to-class="scale-100 opacity-100"
    enter-active-class="transition-[all] ease-in-out duration-150"
    leave-from-class="scale-100 opacity-100"
    leave-to-class="scale-90 opacity-0"
    leave-active-class="transition-[all] ease-in-out duration-150"
  >
    <ui-kit:modal
      v-for="modal in modalStack"
      :key="modal.id"
      :backdrop="modal.backdrop"
      :close-on-backdrop-click="modal.closeOnBackdropClick"
      @closed="() => closeModal(modal.id)"
    >
      <component :is="modal.component" v-bind="modal.componentProps" />
    </ui-kit:modal>
  </transition-group>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useToastStore } from '@/stores/toast'
import { useSessionStore } from './stores/session'
import { useModal } from '@/composables/use-modal'

const sessionStore = useSessionStore()
const toastStore = useToastStore()
const { toasts } = storeToRefs(toastStore)

const { modalStack, closeModal } = useModal()
</script>
