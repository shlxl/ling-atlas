import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/dist/client/theme-default/without-fonts'
import Layout from './Layout.vue'
import './vars.css'
import './custom.css'

const theme: Theme = {
  ...DefaultTheme,
  Layout,
  enhanceApp(ctx) {
    DefaultTheme.enhanceApp?.(ctx)
  }
}

export default theme
