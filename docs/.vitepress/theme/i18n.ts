import { useData } from 'vitepress'

export function useI18nRouting() {
  const { site } = useData()

  function detectLocaleFromPath(path: string) {
    if (path.startsWith('/en/')) {
      return 'en'
    }
    return 'root'
  }

  function ensureLocaleMap() {
    const localeMap: Record<string, string> = {}
    const zhPages = new Set(site.value.pages.filter(p => !p.startsWith('en/')).map(p => p.replace(/index\.md$/, '').replace(/\.md$/, '.html')))
    const enPages = new Set(site.value.pages.filter(p => p.startsWith('en/')).map(p => p.replace('en/', '').replace(/index\.md$/, '').replace(/\.md$/, '.html')))

    for (const page of zhPages) {
      if (enPages.has(page)) {
        localeMap[page] = `/en${page}`
        localeMap[`/en${page}`] = page
      }
    }
    return localeMap
  }

  return { detectLocaleFromPath, ensureLocaleMap }
}
