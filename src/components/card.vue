<template>
  <transition
    mode="out-in"
    enter-from-class="motion-safe:rotate-y-90 -translate-y-6"
    enter-to-class="motion-safe:rotate-y-0"
    enter-active-class="transition-[all] ease-in-out duration-150"
    leave-from-class="motion-safe:rotate-y-0"
    leave-to-class="motion-safe:rotate-y-90 -translate-y-6"
    leave-active-class="motion-safe:transition-[all] ease-in-out duration-150"
  >
    <div
      v-if="revealed"
      data-testid="card"
      class="flex shrink-0 items-center justify-center p-3"
      :class="[defaultClasses, sizeClasses[size], { 'bg-white': revealed }]"
    >
      <slot></slot>
    </div>
    <div
      v-else
      data-testid="card"
      class="relative shrink-0 bg-green-400 p-3"
      :class="[defaultClasses, sizeClasses[size]]"
    >
      <div v-if="image_url" class="absolute inset-0">
        <img :src="image_url" alt="Deck Image preview" class="h-full w-full object-cover" />
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
const { size = 'base' } = defineProps<{
  size?: 'large' | 'base' | 'small' | 'xs' | '2xs' | '3xs'
  revealed?: Boolean
  image_url?: string
}>()

const defaultClasses = 'aspect-card'

const sizeClasses: { [key: string]: string } = {
  '3xs': 'min-w-7 max-w-7 rounded-2 text-sm',
  '2xs': 'min-w-10.75 max-w-10.75 rounded-3 text-sm',
  xs: 'min-w-25.5 max-w-25.5 rounded-6 text-base',
  small: 'min-w-34.5 max-w-34.5 rounded-8 text-lg',
  base: 'min-w-48 max-w-48 rounded-10 text-2xl',
  large: 'min-w-65 max-w-65 rounded-12  text-3xl'
}
</script>
