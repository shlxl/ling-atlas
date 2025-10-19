const LINK_PLACEHOLDER_RE = /^\{links\.([a-zA-Z0-9._-]+)\}$/

export function validateNavIntegrity(navConfig = {}) {
  const errors = []
  const warnings = []

  if (!navConfig || typeof navConfig !== 'object') {
    return {
      errors: ['导航配置必须是对象，请检查 schema/nav.json'],
      warnings
    }
  }

  const aggregateEntries = Object.entries(navConfig.aggregates || {})
  const aggregateKeys = new Set(aggregateEntries.map(([key]) => key))
  const manifestOwners = new Map()

  for (const [aggKey, definition] of aggregateEntries) {
    if (!definition || typeof definition !== 'object') continue
    const manifestKey = definition.manifestKey
    if (!manifestKey) {
      errors.push(`aggregates.${aggKey}.manifestKey 缺失，请在 schema/nav.json 中补全`)
      continue
    }
    if (manifestOwners.has(manifestKey) && manifestOwners.get(manifestKey) !== aggKey) {
      errors.push(
        `aggregates.${aggKey}.manifestKey 与 aggregates.${manifestOwners.get(
          manifestKey
        )}.manifestKey 重复，建议保持唯一以便 Pagegen 写入 nav manifest`
      )
    } else {
      manifestOwners.set(manifestKey, aggKey)
    }
  }

  const linkEntries = Object.entries(navConfig.links || {})
  const linkKeys = new Set(linkEntries.map(([key]) => key))

  const seenSectionKeys = new Set()
  const sections = Array.isArray(navConfig.sections) ? navConfig.sections : []

  sections.forEach((section, index) => {
    const ctx = `sections[${index}]`
    if (!section || typeof section !== 'object') {
      errors.push(`${ctx} 不是对象，请检查 schema/nav.json`)
      return
    }

    if (section.key) {
      if (seenSectionKeys.has(section.key)) {
        warnings.push(`${ctx}.key "${section.key}" 重复，建议确保唯一以避免导航渲染异常`)
      } else {
        seenSectionKeys.add(section.key)
      }
    }

    const kind = section.kind || 'link'
    if (kind === 'aggregate') {
      const ref = section.aggregateKey
      if (!ref) {
        errors.push(`${ctx}.aggregateKey 缺失，无法找到对应的聚合入口`)
      } else if (!aggregateKeys.has(ref)) {
        errors.push(`${ctx}.aggregateKey "${ref}" 未在 aggregates 中定义，请在 schema/nav.json 补充`)
      }
    } else if (kind === 'link') {
      verifyLinkReference(section.link, `${ctx}.link`)
    } else if (kind === 'group') {
      if (!Array.isArray(section.items) || section.items.length === 0) {
        warnings.push(`${ctx}.items 为空，导航分组将不会展示任何链接`)
      } else {
        const itemKeys = new Set()
        section.items.forEach((item, itemIndex) => {
          const itemCtx = `${ctx}.items[${itemIndex}]`
          if (!item || typeof item !== 'object') {
            errors.push(`${itemCtx} 不是对象，请检查 schema/nav.json`)
            return
          }
          if (item.key) {
            if (itemKeys.has(item.key)) {
              warnings.push(`${itemCtx}.key "${item.key}" 重复，请保证分组内唯一`)
            } else {
              itemKeys.add(item.key)
            }
          }
          verifyLinkReference(item.link, `${itemCtx}.link`)
        })
      }
    }
  })

  return { errors, warnings }

  function verifyLinkReference(linkValue, ctx) {
    if (!linkValue) return
    const match = LINK_PLACEHOLDER_RE.exec(linkValue)
    if (!match) return
    const referenced = match[1]
    if (!linkKeys.has(referenced)) {
      errors.push(`${ctx} 引用了不存在的 links.${referenced}，请在 schema/nav.json 的 links 中补充`)
    }
  }
}

export function assertNavIntegrity(navConfig) {
  const { errors } = validateNavIntegrity(navConfig)
  if (errors.length) {
    const message = ['导航配置引用检查失败：', ...errors.map(detail => ` - ${detail}`)].join('\n')
    const error = new Error(message)
    error.details = errors
    throw error
  }
}
