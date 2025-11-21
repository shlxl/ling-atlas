import styles from './page.module.css'

async function fetchSafe(path: string) {
  const base = process.env.API_BASE || 'http://127.0.0.1:8787/api'
  try {
    const res = await fetch(`${base}${path}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Fetch ${path} failed: ${res.status}`)
    return { data: await res.json(), error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function GraphBlock() {
  const docId = process.env.GRAPH_DOC || 'zh-graphrag-research'
  const doc = await fetchSafe(`/graph/doc?id=${docId}`)
  if (doc.error) {
    return (
      <div className={styles.card}>
        <h2>Graph Doc</h2>
        <p>error: {doc.error}</p>
      </div>
    )
  }
  const subgraph = doc.data?.merged?.subgraph
  const metaTitle = doc.data?.merged?.metadata?.doc?.title || docId
  const nodes = Array.isArray(subgraph?.nodes) ? subgraph.nodes.slice(0, 5) : []
  const edges = Array.isArray(subgraph?.edges) ? subgraph.edges.slice(0, 5) : []
  return (
    <div className={styles.card}>
      <h2>Graph Doc</h2>
      <p>{metaTitle}</p>
      <p>nodes: {subgraph?.nodes?.length || 0}</p>
      <p>edges: {subgraph?.edges?.length || 0}</p>
      <div>
        <strong>节点示例</strong>
        <ul>
          {nodes.map((n: any) => (
            <li key={n.id || n}>
              {(n.type && `${n.type}: `) || ''}{n.label || n.id || 'unknown'}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <strong>边示例</strong>
        <ul>
          {edges.map((e: any, idx: number) => (
            <li key={`${e.from}-${e.to}-${idx}`}>
              {e.from} → {e.to} {e.label ? `（${e.label}）` : ''}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
