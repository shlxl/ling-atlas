export interface NavManifest {
  locale: string
  categories: Record<string, string>
  series: Record<string, string>
  tags: Record<string, string>
  archive: Record<string, string>
}

export interface NavTranslations {
  latest: string
  categories: string
  series: string
  tags: string
  about: string
  metrics: string
  qa: string
  guides: string
  deploy: string
  migration: string
  chat?: string
}

export interface NavBuilderOptions {
  locale: string
  translations: NavTranslations
  routeRoot: string
  collator?: Intl.Collator
}

export function slug(input: string | null | undefined): string
export function navFromMeta(
  meta: any,
  manifest: NavManifest | null | undefined,
  options: NavBuilderOptions
): any[]
export function legacyNavFromMeta(meta: any, options: NavBuilderOptions): any[]
