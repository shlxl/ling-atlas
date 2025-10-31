export async function extractEntities(_doc, { adapter } = {}) {
  if (adapter?.extract) {
    return adapter.extract(_doc);
  }

  return {
    entities: [],
    relationships: [],
    mentions: [],
    diagnostics: [{ level: 'info', message: '使用占位实体提取器，返回空集合' }],
  };
}
