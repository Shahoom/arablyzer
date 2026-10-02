// The thread collectPageIsolated (isolated.ts) starts to read one page's HTML. It answers with
// the facts, or with null when the page is too complex to read. This package's sources are
// TypeScript, which tsx loads for a process's own thread (`--import tsx`, or the tsx command) and
// not for a thread the process starts: so it is registered here, for this one.
import { parentPort, workerData } from 'node:worker_threads'
import { register } from 'tsx/esm/api'

register()
const { readHtml } = await import('./page.ts')
const { job, options } = workerData
parentPort.postMessage(readHtml(job, options))
