import Layout from './Layout.vue'
import VPBadge from 'vitepress/dist/client/theme-default/components/VPBadge.vue'
import './vars.css'
import 'vitepress/dist/client/theme-default/styles/base.css'
import 'vitepress/dist/client/theme-default/styles/utils.css'
import 'vitepress/dist/client/theme-default/styles/components/vp-code.css'
import './custom.css'

export default {
  Layout,
  enhanceApp({ app }) {
    app.component('Badge', VPBadge)
  }
}
