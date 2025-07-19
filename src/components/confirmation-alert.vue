<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

defineProps<{
  cancelLabel?: string
  confirmLabel?: string
  message?: string
  title?: string
  close: (result?: boolean) => void
}>()

defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const { t } = useI18n()

const buttonClasses = 'group relative'
const buttonHoverClasses = `
  rounded-2 absolute -inset-0.5 flex items-center
  justify-center border-3 border-blue-500 bg-white opacity-0 transition-[all]
  duration-100 ease-in-out group-hover:opacity-100 group-focus:opacity-100 focus:outline-none text-blue-500
  `
</script>

<template>
  <div data-testid="confirmation-alert" class="rounded-2 shadow-modal flex flex-col bg-white">
    <div class="flex flex-col gap-2 p-10">
      <h1 class="text-brown-700 text-4xl">{{ title ?? t('alert.generic-title') }}</h1>
      <p class="text-brown-500">{{ message ?? t('alert.generic-message') }}</p>
    </div>

    <div
      class="border-brown-300 divide-brown-300 *:text-brown-700 flex w-full divide-x border-t *:w-full
        *:cursor-pointer *:p-4 *:text-lg"
    >
      <button
        data-testid="confirmation-alert__cancel"
        :class="buttonClasses"
        @click="() => close(false)"
      >
        {{ cancelLabel ?? t('common.cancel') }}
        <div :class="buttonHoverClasses">
          {{ cancelLabel ?? t('common.cancel') }}
        </div>
      </button>
      <button
        data-testid="confirmation-alert__confirm"
        :class="buttonClasses"
        @click="() => close(true)"
      >
        {{ confirmLabel ?? t('common.continue') }}
        <div :class="buttonHoverClasses">
          {{ confirmLabel ?? t('common.continue') }}
        </div>
      </button>
    </div>
  </div>
</template>
