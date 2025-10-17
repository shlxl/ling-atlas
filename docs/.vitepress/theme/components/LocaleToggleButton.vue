<script setup lang="ts">
import { computed } from 'vue'
import { useLocaleToggle } from '../composables/localeMap'
import { usePreferredLocale } from '../composables/preferredLocale.mjs'
import { getFallbackLocale, type LocaleCode } from '../locales.mjs'
import type { ResolveTargetPathResult } from '../composables/locale-map-core.mjs'
import i18n from '../../i18n.json'

const { currentLocale, currentPath, availableLocales, destinations, goToLocale } = useLocaleToggle()
const { rememberLocale } = usePreferredLocale()

const fallbackLocale = getFallbackLocale()

type ResolutionReason = ResolveTargetPathResult['reason']

const localeLabels = computed<Record<LocaleCode, string>>(() => {
  const entries: Partial<Record<LocaleCode, string>> = {}
  const rawLocales = (i18n as any)?.locales ?? {}
  for (const locale of availableLocales.value) {
    const label = rawLocales?.[locale]
    entries[locale] = typeof label === 'string' && label ? label : locale.toUpperCase()
  }
  return entries as Record<LocaleCode, string>
})

const reasonSuffixes = computed<Partial<Record<ResolutionReason, string>>>(() => {
  const hints = ((i18n as any)?.ui?.localeToggleHint ?? {}) as Record<
    string,
    Partial<Record<ResolutionReason, string>>
  >
  const localized = hints[currentLocale.value] || hints[fallbackLocale] || {}
  return localized
})

function resolveUiString(key: 'label' | 'aria'): string {
  const resources = ((i18n as any)?.ui?.localeToggleLabel ?? {}) as Record<string, Record<string, string> | string>
  const raw = resources[key]
  if (typeof raw === 'string') return raw
  if (!raw || typeof raw !== 'object') return ''
  return (
    raw[currentLocale.value] ??
    raw[fallbackLocale] ??
    Object.values(raw)[0] ??
    ''
  )
}

const controlLabel = computed(() => resolveUiString('label') || 'Language')
const ariaLabel = computed(() => resolveUiString('aria') || controlLabel.value)

const selectOptions = computed(() => {
  const list: Array<{
    code: LocaleCode
    label: string
    displayLabel: string
    destination: string
    hasMapping: boolean
    reason: ResolutionReason
    suffix: string
  }> = []
  const destinationMap = destinations.value
  for (const locale of availableLocales.value) {
    const target = destinationMap[locale]
    const baseLabel = localeLabels.value[locale] ?? locale.toUpperCase()
    const reason = (target?.reason ?? 'home') as ResolutionReason
    const suffix = reasonSuffixes.value?.[reason] ?? ''
    const displayLabel = suffix ? `${baseLabel}${suffix}` : baseLabel
    list.push({
      code: locale,
      label: baseLabel,
      displayLabel,
      destination: target?.normalized ?? currentPath.value,
      hasMapping: target?.hasMapping ?? false,
      reason,
      suffix
    })
  }
  return list
})

function handleLocaleChange(event: Event) {
  const target = event.target as HTMLSelectElement | null
  const value = target?.value as LocaleCode | undefined
  if (!value) return
  rememberLocale(value)
  if (value === currentLocale.value) return
  void goToLocale(value)
}
</script>

<template>
  <div class="la-locale-toggle">
    <label class="la-locale-toggle__label" for="la-locale-select">{{ controlLabel }}</label>
    <select
      id="la-locale-select"
      class="la-locale-toggle__select"
      :aria-label="ariaLabel"
      :value="currentLocale"
      @change="handleLocaleChange"
    >
      <option
        v-for="option in selectOptions"
        :key="option.code"
        :value="option.code"
        :data-destination="option.destination"
        :data-has-mapping="option.hasMapping"
        :data-resolution="option.reason"
      >
        {{ option.displayLabel }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.la-locale-toggle {
  width: 100%;
}

@media (min-width: 641px) {
  .la-locale-toggle {
    width: auto;
  }
}
</style>
