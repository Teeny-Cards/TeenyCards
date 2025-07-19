<template>
  <nav class="font-primary sticky top-0 z-10 flex h-17 w-full justify-center bg-blue-500">
    <div class="flex w-full max-w-375 items-center justify-between px-4 sm:px-16">
      <RouterLink to="/dashboard" class="text-6xl text-white">TeenyCards</RouterLink>
      <div class="flex items-end gap-6">
        <div class="mt-6 flex gap-2.25">
          <div
            v-for="i in 5"
            :key="i"
            class="rounded-8 border-brown-100 h-17 w-17 border-6 bg-pink-400 ring-8 ring-blue-500"
          ></div>
        </div>
        <div class="flex gap-4">
          <ui-kit:button
            icon-left="store"
            icon-size="base"
            icon-only
            inverted
            class="p-1.5 ring-8 ring-blue-500"
            :class="{ 'ring-pink': isActive('shop') }"
            @click="routeToShop"
          ></ui-kit:button>
          <ui-kit:button
            icon-left="apps"
            icon-only
            icon-size="base"
            inverted
            class="relative p-1.5 ring-8 ring-blue-500"
          >
            <AppMenu />
          </ui-kit:button>
        </div>
      </div>
    </div>
  </nav>

  <!-- <ui-kit:modal :open="member_card_open" backdrop @closed="member_card_open = false">
    <MemberCard />
  </ui-kit:modal> -->
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import MemberCard from './member-card.vue'
import AppMenu from './app-menu.vue'
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'

defineProps({
  display_name: String
})

const router = useRouter()
const route = useRoute()
const member_card_open = ref(false)

function isActive(routeName: string) {
  return route.name === routeName
}

function routeToShop() {
  router.push({ name: 'shop' })
}
</script>
