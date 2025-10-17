import { detectLocaleFromPath } from './composables/localeMap'

export function useI18nRouting() {
  return {
    detectLocaleFromPath
  }
}
