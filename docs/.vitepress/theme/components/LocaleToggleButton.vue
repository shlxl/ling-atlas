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

const reasonDetails = computed<Partial<Record<ResolutionReason, string>>>(() => {
  const details = ((i18n as any)?.ui?.localeToggleDetail ?? {}) as Record<
    string,
    Partial<Record<ResolutionReason, string>>
  >
  const localized = details[currentLocale.value] || details[fallbackLocale] || {}
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
    detail: string
    ariaLabel: string
    title: string
    summaryLabel: string
  }> = []
  const destinationMap = destinations.value
  for (const locale of availableLocales.value) {
    const target = destinationMap[locale]
    const baseLabel = localeLabels.value[locale] ?? locale.toUpperCase()
    const reason = (target?.reason ?? 'home') as ResolutionReason
    const suffix = reasonSuffixes.value?.[reason] ?? ''
    const detail = reasonDetails.value?.[reason] ?? ''
    const summaryLabel = suffix ? `${baseLabel}${suffix}` : baseLabel
    const optionAriaLabel = detail ? `${baseLabel} · ${detail}` : summaryLabel
    const title = detail || (suffix ? suffix.trim() : '')
    const displayLabel = baseLabel
    list.push({
      code: locale,
      label: baseLabel,
      displayLabel,
      destination: target?.normalized ?? currentPath.value,
      hasMapping: target?.hasMapping ?? false,
      reason,
      suffix,
      detail,
      ariaLabel: optionAriaLabel,
      title,
      summaryLabel
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
        :data-summary="option.summaryLabel"
        :aria-label="option.ariaLabel"
        :title="option.title || undefined"
      >
        {{ option.displayLabel }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.la-locale-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 100%;
}

.la-locale-toggle__label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.la-locale-toggle__select {
  appearance: none;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background-color: var(--vp-c-bg-soft);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='currentColor' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m1 2 5 4 5-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.6rem center;
  background-size: 0.65rem auto;
  color: var(--vp-c-text-1);
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.2;
  padding: 0.35rem 1.7rem 0.35rem 0.75rem;
  min-height: 2.25rem;
  min-width: 0;
  max-width: min(100%, 13.5rem);
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.la-locale-toggle__select:focus-visible {
  outline: none;
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--vp-c-brand-1) 38%, transparent);
}

.la-locale-toggle__select option {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
}

.dark .la-locale-toggle__select {
  background-color: color-mix(in srgb, var(--vp-c-bg-soft) 75%, transparent);
}

@media (max-width: 640px) {
  .la-locale-toggle,
  .la-locale-toggle__select {
    width: 100%;
  }
}
</style>
