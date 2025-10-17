import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  usePreferredLocale,
  PREFERRED_LOCALE_STORAGE_KEY,
  resetPreferredLocaleForTesting
} from '../../docs/.vitepress/theme/composables/preferredLocale.mjs'

const originalWindow = global.window
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(global, 'navigator')
const originalNavigator = global.navigator
let navigatorDefinedByTest = false

function createEnvironment({ storedLocale = null, languages = [], language } = {}) {
  const store = new Map()
  if (storedLocale) {
    store.set(PREFERRED_LOCALE_STORAGE_KEY, storedLocale)
  }

  const localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    }
  }

  const pathname = '/'

  global.window = {
    localStorage,
    location: { pathname }
  }

  const detectedLanguage = language ?? (languages.length ? languages[0] : '')
  Object.defineProperty(global, 'navigator', {
    value: {
      languages,
      language: detectedLanguage
    },
    configurable: true,
    writable: true
  })
  navigatorDefinedByTest = true

  return { store }
}

beforeEach(() => {
  resetPreferredLocaleForTesting()
})

afterEach(() => {
  if (originalWindow === undefined) {
    delete global.window
  } else {
    global.window = originalWindow
  }

  if (navigatorDefinedByTest) {
    if (originalNavigatorDescriptor) {
      Object.defineProperty(global, 'navigator', originalNavigatorDescriptor)
    } else if (originalNavigator === undefined) {
      delete global.navigator
    } else {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true
      })
    }
    navigatorDefinedByTest = false
  }

  resetPreferredLocaleForTesting()
})

test('usePreferredLocale hydrates from stored locale', () => {
  const { store } = createEnvironment({ storedLocale: 'en', languages: ['zh-CN'], language: 'zh-CN' })
  const { preferredLocale } = usePreferredLocale()
  assert.equal(preferredLocale.value, 'en')
  assert.equal(store.get(PREFERRED_LOCALE_STORAGE_KEY), 'en')
})

test('rememberLocale persists supported locale to storage', () => {
  const { store } = createEnvironment({ languages: ['en-US'], language: 'en-US' })
  const { preferredLocale, rememberLocale } = usePreferredLocale()
  rememberLocale('en')
  assert.equal(preferredLocale.value, 'en')
  assert.equal(store.get(PREFERRED_LOCALE_STORAGE_KEY), 'en')
})

test('rememberLocale ignores unsupported locales', () => {
  const { store } = createEnvironment({ languages: ['zh-CN'], language: 'zh-CN' })
  const { preferredLocale, rememberLocale } = usePreferredLocale()
  rememberLocale('jp')
  assert.equal(preferredLocale.value, 'zh')
  assert.equal(store.has(PREFERRED_LOCALE_STORAGE_KEY), false)
})

test('refreshPreferredLocale uses navigator hints when storage empty', () => {
  createEnvironment({ languages: ['en-US', 'zh-CN'], language: 'zh-CN' })
  const { preferredLocale, refreshPreferredLocale } = usePreferredLocale()
  refreshPreferredLocale()
  assert.equal(preferredLocale.value, 'en')
})
