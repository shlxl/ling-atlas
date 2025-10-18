import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/dist/client/theme-default/without-fonts'
import Layout from './Layout.vue'
import VPNavBarExtra from './components/VPNavBarExtra.vue'
import VPNavBarTranslations from './components/VPNavBarTranslations.vue'
import VPNavScreenTranslations from './components/VPNavScreenTranslations.vue'
import './vars.css'
import './custom.css'

const theme: Theme = {
  ...DefaultTheme,
  Layout,
  enhanceApp(ctx) {
    DefaultTheme.enhanceApp?.(ctx)
    ctx.app.component('VPNavBarExtra', VPNavBarExtra)
    ctx.app.component('VPNavBarTranslations', VPNavBarTranslations)
    ctx.app.component('VPNavScreenTranslations', VPNavScreenTranslations)
  }
}

export default theme
