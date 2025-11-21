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

export async function ApiStatusBlock() {
  const [nav, i18n, telemetry, manifest] = await Promise.all([
    fetchSafe('/nav/zh'),
    fetchSafe('/i18n'),
    fetchSafe('/telemetry'),
    fetchSafe('/manifest')
  ])

  return (
    <section className={styles.grid}>
      <div className={styles.card}>
        <h2>Nav (zh)</h2>
        {nav.error
          ? <p>error: {nav.error}</p>
          : (
            <>
              <p>categories: {Object.keys(nav.data?.categories || {}).length}</p>
              <p>tags: {Object.keys(nav.data?.tags || {}).length}</p>
            </>
          )}
      </div>
      <div className={styles.card}>
        <h2>i18n</h2>
        {i18n.error
          ? <p>error: {i18n.error}</p>
          : <p>nav keys: {Object.keys((i18n.data?.nav || {})).length}</p>}
      </div>
      <div className={styles.card}>
        <h2>Telemetry</h2>
        {telemetry.error
          ? <p>error: {telemetry.error}</p>
          : <p>{telemetry.data?.build ? 'ready' : 'missing'}</p>}
      </div>
      <div className={styles.card}>
        <h2>Manifest</h2>
        {manifest.error
          ? <p>error: {manifest.error}</p>
          : <p>items: {manifest.data?.items?.length || 0}</p>}
      </div>
    </section>
  )
}
