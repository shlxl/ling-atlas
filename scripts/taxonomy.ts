export const categoryMap = {
  '工程笔记': 'engineering',
  '架构设计': 'architecture',
  'Web前端': 'frontend',
  '后端': 'backend',
  '数据工程': 'data-engineering',
  '数据库': 'databases',
  '信息检索': 'search',
  'RAG实战': 'rag',
  'AI研究': 'ai-research',
  '大模型': 'llm',
  '机器学习': 'ml',
  '深度学习': 'dl',
  '运维与自动化': 'devops',
  '网络与安全': 'netsec',
  '云与边缘': 'cloud-edge',
  '管理与协作': 'management',
  '职业攻略': 'career',
  '读书笔记': 'reading-notes',
  '生活随笔': 'life',
  '公共治理观察': 'public-governance',
  '行政信息化': 'gov-tech'
} as const

export type CategoryZh = keyof typeof categoryMap
export function resolveCategoryEn(zh: CategoryZh) {
  const en = (categoryMap as any)[zh]
  if (!en) throw new Error(`未知分类: ${zh}`)
  return en
}
