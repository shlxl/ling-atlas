<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import SearchBox from './components/SearchBox.vue'
</script>

<template>
  <DefaultTheme.Layout>
    <template #nav-bar-content-after>
      <SearchBox />
    </template>
  </DefaultTheme.Layout>
</template>
