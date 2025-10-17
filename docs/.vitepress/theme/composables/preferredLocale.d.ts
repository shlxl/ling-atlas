import type { Ref } from 'vue'
import type { LocaleCode } from '../locales'

declare const PREFERRED_LOCALE_STORAGE_KEY: 'ling-atlas:preferred-locale'

export { PREFERRED_LOCALE_STORAGE_KEY }

export interface PreferredLocaleComposable {
  preferredLocale: Ref<LocaleCode>
  rememberLocale(locale: LocaleCode): void
  refreshPreferredLocale(): void
}

export function usePreferredLocale(): PreferredLocaleComposable
export function resetPreferredLocaleForTesting(): void

export type { LocaleCode }
