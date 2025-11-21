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

export async function SearchBlock() {
  const data = await fetchSafe('/search?q=ling&limit=5')
  const results = Array.isArray(data.data?.results) ? data.data.results : []
  return (
    <div className={styles.card}>
      <h2>Search (ling)</h2>
      {data.error ? <p>error: {data.error}</p> : null}
      <ul>
        {results.map((item: any) => (
          <li key={item.url}>
            <a href={item.url}>{item.title || item.url}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}
