import { pinyin } from 'pinyin-pro'

export function slugify(input: string, fallback = 'post') {
  const hasCJK = /[\u3400-\u9FFF]/.test(input)
  const base = hasCJK ? pinyin(input, { toneType: 'none', type: 'array' }).join(' ') : input
  return base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase() || fallback
}
