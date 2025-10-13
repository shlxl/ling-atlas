<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vitepress'
import DefaultTheme from 'vitepress/dist/client/theme-default/without-fonts'
import SearchBox from './components/SearchBox.vue'
import { initTelemetry, setupTelemetryRouterHook } from './telemetry'

const router = useRouter()

onMounted(() => {
  void initTelemetry()
  setupTelemetryRouterHook(router)
})
</script>

<template>
  <DefaultTheme.Layout>
    <template #nav-bar-content-after>
      <SearchBox />
    </template>
  </DefaultTheme.Layout>
</template>
