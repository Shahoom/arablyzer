// The thread pdfs.ts starts to read one PDF with pdf.js. It answers with the text and metadata
// (pdf-read.ts). This package's sources are TypeScript, which tsx loads for a process's own
// thread and not for a thread the process starts: so it is registered here, for this one.
import { parentPort, workerData } from 'node:worker_threads'
import { register } from 'tsx/esm/api'

register()
const { readPdf } = await import('./pdf-read.ts')
parentPort.postMessage(await readPdf(workerData.data))
