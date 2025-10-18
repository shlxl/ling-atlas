<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import VPFlyout from 'vitepress/dist/client/theme-default/components/VPFlyout.vue'
import VPSwitchAppearance from 'vitepress/dist/client/theme-default/components/VPSwitchAppearance.vue'
import VPSocialLinks from 'vitepress/dist/client/theme-default/components/VPSocialLinks.vue'
import LocaleToggleButton from './LocaleToggleButton.vue'

const { site, theme } = useData()

const showAppearanceToggle = computed(() => {
  const appearance = site.value.appearance
  if (!appearance) return false
  if (appearance === 'force-dark' || appearance === 'force-auto') return false
  return true
})

const hasSocialLinks = computed(() => Boolean(theme.value.socialLinks))

const hasExtraContent = computed(() => true)
</script>

<template>
  <VPFlyout
    v-if="hasExtraContent"
    class="VPNavBarExtra"
    label="extra navigation"
  >
    <div class="group locale">
      <LocaleToggleButton />
    </div>

    <div
      v-if="showAppearanceToggle"
      class="group"
    >
      <div class="item appearance">
        <p class="label">
          {{ theme.darkModeSwitchLabel || 'Appearance' }}
        </p>
        <div class="appearance-action">
          <VPSwitchAppearance />
        </div>
      </div>
    </div>

    <div v-if="hasSocialLinks" class="group">
      <div class="item social-links">
        <VPSocialLinks class="social-links-list" :links="theme.socialLinks" />
      </div>
    </div>
  </VPFlyout>
</template>

<style scoped>
.VPNavBarExtra {
  display: none;
  margin-right: -12px;
}

@media (min-width: 768px) {
  .VPNavBarExtra {
    display: block;
  }
}

@media (min-width: 1280px) {
  .VPNavBarExtra {
    display: none;
  }
}

.group.locale {
  padding: 0 12px;
  display: flex;
  align-items: center;
}

.item.appearance,
.item.social-links {
  display: flex;
  align-items: center;
  padding: 0 12px;
}

.item.appearance {
  min-width: 176px;
}

.appearance-action {
  margin-right: -2px;
}

.social-links-list {
  margin: -4px -8px;
}
</style>
