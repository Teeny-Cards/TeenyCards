<template>
  <Icon :icon="src" :class="iconSize[size]"></Icon>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const props = defineProps({
  src: {
    type: String,
    required: true
  },
  size: {
    type: String,
    validator: (value: string) => ['large', 'base', 'small', 'xs'].includes(value),
    default: 'base'
  }
})

const Icon = defineAsyncComponent(() => import(`../../assets/icons/${props.src}.svg`))

const iconSize: { [key: string]: string } = {
  large: 'w-8  h-8',
  base: 'w-5 h-5',
  small: 'w-4 h-4',
  xs: 'w-3 h-3'
}
</script>
