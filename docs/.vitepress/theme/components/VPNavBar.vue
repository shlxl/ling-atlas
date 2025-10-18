<script lang="ts" setup>
import { useWindowScroll } from '@vueuse/core'
import { ref, watchPostEffect } from 'vue'
import { useData } from '../composables/data'
import { useSidebar } from '../composables/sidebar'
import VPNavBarAppearance from 'vitepress/dist/client/theme-default/components/VPNavBarAppearance.vue'
import VPNavBarExtra from './VPNavBarExtra.vue'
import VPNavBarHamburger from 'vitepress/dist/client/theme-default/components/VPNavBarHamburger.vue'
import VPNavBarMenu from 'vitepress/dist/client/theme-default/components/VPNavBarMenu.vue'
import VPNavBarSearch from 'vitepress/dist/client/theme-default/components/VPNavBarSearch.vue'
import VPNavBarSocialLinks from 'vitepress/dist/client/theme-default/components/VPNavBarSocialLinks.vue'
import VPNavBarTitle from 'vitepress/dist/client/theme-default/components/VPNavBarTitle.vue'

const props = defineProps<{
  isScreenOpen: boolean
}>()

defineEmits<{
  (e: 'toggle-screen'): void
}>()

const { y } = useWindowScroll()
const { hasSidebar } = useSidebar()
const { frontmatter } = useData()

const classes = ref<Record<string, boolean>>({})

watchPostEffect(() => {
  classes.value = {
    'has-sidebar': hasSidebar.value,
    home: frontmatter.value.layout === 'home',
    top: y.value === 0,
    'screen-open': props.isScreenOpen
  }
})
</script>

<template>
  <div class="VPNavBar" :class="classes">
    <div class="wrapper">
      <div class="container">
        <div class="title">
          <VPNavBarTitle>
            <template #nav-bar-title-before><slot name="nav-bar-title-before" /></template>
            <template #nav-bar-title-after><slot name="nav-bar-title-after" /></template>
          </VPNavBarTitle>
        </div>

        <div class="content">
          <div class="content-body">
            <slot name="nav-bar-content-before" />
            <VPNavBarSearch class="search" />
            <VPNavBarMenu class="menu" />
            <VPNavBarAppearance class="appearance" />
            <VPNavBarSocialLinks class="social-links" />
            <VPNavBarExtra class="extra" />
            <slot name="nav-bar-content-after" />
            <VPNavBarHamburger class="hamburger" :active="isScreenOpen" @click="$emit('toggle-screen')" />
          </div>
        </div>
      </div>
    </div>

    <div class="divider">
      <div class="divider-line" />
    </div>
  </div>
</template>

<style scoped>
.VPNavBar {
  position: relative;
  height: var(--vp-nav-height);
  pointer-events: none;
  white-space: nowrap;
  transition: background-color 0.25s;
}

.VPNavBar.screen-open {
  transition: none;
  background-color: var(--vp-nav-bg-color);
  border-bottom: 1px solid var(--vp-c-divider);
}

.VPNavBar:not(.home) {
  background-color: var(--vp-nav-bg-color);
}

@media (min-width: 960px) {
  .VPNavBar:not(.home) {
    background-color: transparent;
  }

  .VPNavBar:not(.has-sidebar):not(.home.top) {
    background-color: var(--vp-nav-bg-color);
  }
}

.wrapper {
  padding: 0 8px 0 24px;
}

@media (min-width: 768px) {
  .wrapper {
    padding: 0 32px;
  }
}

@media (min-width: 960px) {
  .VPNavBar.has-sidebar .wrapper {
    padding: 0;
  }
}

.container {
  display: flex;
  justify-content: space-between;
  margin: 0 auto;
  max-width: calc(var(--vp-layout-max-width) - 64px);
  height: var(--vp-nav-height);
  pointer-events: none;
}

.container > .title,
.container > .content {
  pointer-events: none;
}

.container :deep(*) {
  pointer-events: auto;
}

@media (min-width: 960px) {
  .VPNavBar.has-sidebar .container {
    max-width: 100%;
  }
}

.title {
  flex-shrink: 0;
  height: calc(var(--vp-nav-height) - 1px);
  transition: background-color 0.5s;
}

@media (min-width: 960px) {
  .VPNavBar.has-sidebar .title {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    padding: 0 32px;
    width: var(--vp-sidebar-width);
    height: var(--vp-nav-height);
    background-color: transparent;
  }
}

@media (min-width: 1440px) {
  .VPNavBar.has-sidebar .title {
    padding-left: max(32px, calc((100% - (var(--vp-layout-max-width) - 64px)) / 2));
    width: calc((100% - (var(--vp-layout-max-width) - 64px)) / 2 + var(--vp-sidebar-width) - 32px);
  }
}

.content {
  flex-grow: 1;
}

@media (min-width: 960px) {
  .VPNavBar.has-sidebar .content {
    position: relative;
    z-index: 1;
    padding-right: 32px;
    padding-left: var(--vp-sidebar-width);
  }
}

@media (min-width: 1440px) {
  .VPNavBar.has-sidebar .content {
    padding-right: calc((100vw - var(--vp-layout-max-width)) / 2 + 32px);
    padding-left: calc((100vw - var(--vp-layout-max-width)) / 2 + var(--vp-sidebar-width));
  }
}

.content-body {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: var(--vp-nav-height);
  transition: background-color 0.5s;
}

@media (min-width: 960px) {
  .VPNavBar:not(.home.top) .content-body {
    position: relative;
    background-color: var(--vp-nav-bg-color);
  }

  .VPNavBar:not(.home.top) .content-body::before,
  .VPNavBar:not(.home.top) .content-body::after {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 16px;
    background: linear-gradient(to right, transparent, var(--vp-nav-bg-color));
    content: '';
  }

  .VPNavBar:not(.home.top) .content-body::before {
    left: -16px;
  }

  .VPNavBar:not(.home.top) .content-body::after {
    right: -16px;
    transform: rotate(180deg);
  }
}

.content-body > * {
  display: flex;
  align-items: center;
}

.content-body > :deep(*) {
  margin: 0 12px;
}

.content-body > :deep(a) {
  white-space: nowrap;
}

.content-body > :deep(.appearance) {
  display: none;
}

@media (min-width: 960px) {
  .content-body > :deep(.appearance) {
    display: flex;
  }
}

.content-body > :deep(.social-links) {
  display: none;
}

@media (min-width: 960px) {
  .content-body > :deep(.social-links) {
    display: flex;
  }
}

.content-body > :deep(.menu) {
  display: none;
}

@media (min-width: 768px) {
  .content-body > :deep(.menu) {
    display: flex;
  }
}

.content-body > :deep(.hamburger) {
  display: flex;
}

@media (min-width: 768px) {
  .content-body > :deep(.hamburger) {
    display: none;
  }
}

.content-body > :deep(.extra) {
  display: none;
}

@media (min-width: 1280px) {
  .content-body > :deep(.extra) {
    display: flex;
  }
}

.content-body > :deep(.search) {
  display: none;
}

@media (min-width: 768px) {
  .content-body > :deep(.search) {
    display: flex;
  }
}

@media (min-width: 960px) {
  .content-body > :deep(.search) {
    position: absolute;
    right: 0;
    margin: 0;
  }
}

.content-body :deep(.VPSocialLinks) {
  padding-left: 12px;
}

@media (min-width: 960px) {
  .content-body :deep(.VPSocialLinks) {
    padding-left: 0;
  }
}

.content-body > :deep(.appearance)+:deep(.social-links) {
  margin-left: 4px;
}

.content-body > :deep(.social-links)+:deep(.extra) {
  margin-left: 0;
}

@media (min-width: 960px) {
  .content-body > :deep(.menu)+:deep(.appearance) {
    margin-left: 12px;
  }
}

@media (min-width: 1280px) {
  .content-body > :deep(.search) {
    position: static;
    margin: 0 12px;
  }
}

.divider {
  position: relative;
  height: 1px;
}

@media (min-width: 960px) {
  .divider {
    display: none;
  }
}

.divider-line {
  width: 100%;
  height: 1px;
  background-color: var(--vp-c-divider);
  transition: transform 0.25s;
  transform-origin: left;
}

.VPNavBar.top .divider-line {
  transform: scaleX(0);
}
</style>
