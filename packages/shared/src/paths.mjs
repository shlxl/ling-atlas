import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT_DIR = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const DOCS_DIR = path.join(ROOT_DIR, 'docs')
const DATA_DIR = path.join(ROOT_DIR, 'data')
const DIST_DIR = path.join(ROOT_DIR, 'packages', 'backend', 'dist')
const DIST_DATA_DIR = path.join(DIST_DIR, 'data')
const GENERATED_DIR = path.join(DOCS_DIR, '_generated')
const PUBLIC_DIR = path.join(DOCS_DIR, 'public')
const DIST_NAV_DIR = path.join(DIST_DATA_DIR, 'nav')
const DIST_I18N_DIR = path.join(DIST_DATA_DIR, 'i18n')
const DIST_TELEMETRY_DIR = path.join(DIST_DATA_DIR, 'telemetry')
const DIST_SEARCH_DIR = path.join(DIST_DATA_DIR, 'search')
const DIST_GRAPHRAG_DIR = path.join(DIST_DATA_DIR, 'graphrag')

export {
  ROOT_DIR,
  DOCS_DIR,
  DATA_DIR,
  GENERATED_DIR,
  PUBLIC_DIR,
  DIST_DIR,
  DIST_DATA_DIR,
  DIST_NAV_DIR,
  DIST_I18N_DIR,
  DIST_TELEMETRY_DIR,
  DIST_SEARCH_DIR,
  DIST_GRAPHRAG_DIR
}
