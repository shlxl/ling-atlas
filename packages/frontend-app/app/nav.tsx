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

export async function NavBlock() {
  const nav = await fetchSafe('/nav/zh')
  if (nav.error) {
    return (
      <div className={styles.card}>
        <h2>Nav categories</h2>
        <p>error: {nav.error}</p>
      </div>
    )
  }
  return (
    <div className={styles.card}>
      <h2>Nav categories</h2>
      <ul>
        {Object.entries(nav.data?.categories || {}).map(([key, value]) => (
          <li key={key}>{key} → {value}</li>
        ))}
      </ul>
    </div>
  )
}
