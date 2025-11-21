import styles from './page.module.css'
import { ApiStatusBlock } from './api-status'
import { NavBlock } from './nav'
import { SearchBlock } from './search'
import { GraphBlock } from './graph'

export default function Page() {
  return (
    <main className={styles.main}>
      <section>
        <h1>Ling Atlas API Demo</h1>
        <p>消费 `/api` nav/i18n/telemetry/manifest 的 Next.js 示例。</p>
      </section>
      <ApiStatusBlock />
      <section className={styles.grid}>
        <NavBlock />
        <SearchBlock />
        <GraphBlock />
      </section>
    </main>
  )
}
