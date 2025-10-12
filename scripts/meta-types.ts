export type PostMeta = {
  title: string
  date: string
  updated?: string
  status?: 'draft' | 'review' | 'published'
  category_zh: string
  series?: string
  series_slug?: string
  tags_zh?: string[]
  slug?: string
  path: string
  excerpt?: string
}

export type SiteMeta = {
  byCategory: Record<string, PostMeta[]>
  bySeries: Record<string, PostMeta[]>
  byTag: Record<string, PostMeta[]>
  byYear: Record<string, PostMeta[]>
  all: PostMeta[]
}
