import { accountsModeFrom, limitsFrom, planCatalogFrom } from '@arablyzer/plans'
import { remotePdf } from '@arablyzer/scanner-client'
import {
  POSTGRES_PROTOCOLS,
  PostgresCrawlData,
  PostgresPdfData,
  PostgresScanStore,
  productionUrl,
  quietly,
  requireSecret,
} from '@arablyzer/store'
import pg from 'pg'
import { startLoop } from '../monitor/loop'
import { createPdfRunner } from './runner'

// The PDF job as Compose runs it (M4.7): its own process on the API's image and the application
// role, like the monitor and the crawler, because it reads accounts' reports, which the worker's
// role cannot. It draws nothing itself: the scanner's browser does, on a network that has no way
// out but the egress proxy, and this process only sends it the document and keeps the file. With
// accounts off it does nothing, and stays up doing it, so Compose does not restart it for ever.
const env: Readonly<Record<string, string | undefined>> = { ...process.env, NODE_ENV: 'production' }
const log = (text: string) => {
  console.error(text)
}
/** How soon the job looks again for a PDF that waits. */
const LOOK_MS = 3_000

if (accountsModeFrom(env) !== 'on') {
  console.log('Accounts are off (ARABLYZER_ACCOUNTS): no PDFs to make.')
  setInterval(() => undefined, 2 ** 30)
} else {
  const plans = planCatalogFrom(env, limitsFrom(env))
  const scannerUrl = env.ARABLYZER_SCANNER_URL?.trim() ?? ''
  if (scannerUrl === '') throw new Error('ARABLYZER_SCANNER_URL must be set')
  const pool = new pg.Pool({
    connectionString: productionUrl('DATABASE_URL', env.DATABASE_URL, POSTGRES_PROTOCOLS),
    max: 4,
    connectionTimeoutMillis: 5_000,
  })
  pool.on('error', quietly('PostgreSQL', log))
  const runner = createPdfRunner({
    pdfs: new PostgresPdfData(pool),
    crawls: new PostgresCrawlData(pool),
    store: new PostgresScanStore(pool),
    plans,
    scanner: remotePdf(
      scannerUrl,
      requireSecret('ARABLYZER_SCANNER_TOKEN', env.ARABLYZER_SCANNER_TOKEN),
    ),
    now: () => new Date(),
    log,
  })
  const loop = startLoop(runner, { log, intervalMs: LOOK_MS, name: 'PDF' })
  console.log('PDF job ready')
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void loop.stop().finally(() => {
        void pool.end()
      })
    })
  }
}
