<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import UiButton from '@/components/ui-kit/button.vue'
import { useMatchMedia } from '@/composables/ui/media-query'
import { computed } from 'vue'

const router = useRouter()
const { t } = useI18n()

const is_mobile = useMatchMedia('w<sm')

const visible = computed(() => router.currentRoute.value.name !== 'dashboard')

/**
 * A fresh page load (direct URL, refresh) has no router-tracked entry to go
 * back to — `router.options.history.state.back` is null in that case — so
 * `router.go(-1)` would just re-land on this same route instead of actually
 * navigating back.
 */
function onBack() {
  if (router.options.history.state.back) router.go(-1)
  else router.push({ name: 'dashboard' })
}
</script>

<template>
  <ui-button
    v-if="visible"
    icon-left="arrow-left"
    :size="is_mobile ? 'base' : 'sm'"
    :icon-only="!is_mobile"
    class="[--btn-bg-color:var(--color-on-accent)]! [--btn-text-color:var(--color-accent)]!"
    :sfx="{ tap_pre: 'ui.press', press: 'nav.page-back' }"
    @press="onBack"
  >
    {{ t('nav-bar.back-button') }}
  </ui-button>
</template>
