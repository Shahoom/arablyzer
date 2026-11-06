// The thread collectPageIsolated (isolated.ts) starts to read one page's HTML. It answers with
// the facts, or with null when the page is too complex to read. This package's sources are
// TypeScript, which tsx loads for a process's own thread (`--import tsx`, or the tsx command) and
// not for a thread the process starts: so it is registered here, for this one.
import { getHeapStatistics } from 'node:v8'
import { parentPort, resourceLimits, workerData } from 'node:worker_threads'
import { register } from 'tsx/esm/api'

register()
const { readHtml } = await import('./page.ts')
const { job, options } = workerData

// Node ends a thread that reaches its heap limit with an error, and gives it 16 MB more to wind
// down in. A thread that fills the heap quickly, on a busy machine where the collection is slow,
// takes those 16 MB too, and V8 aborts the whole process (SIGABRT: seen on Node 24 in CI, in the
// test of a page of 130,000 links). So the read gives up before: at this share of the old
// generation's limit, which is not getHeapStatistics().heap_size_limit (320 MB for a limit of 128).
const HEAP_SHARE = 0.85
const limit = (resourceLimits.maxOldGenerationSizeMb ?? Infinity) * 1024 * 1024
const memoryOver = () => getHeapStatistics().used_heap_size > limit * HEAP_SHARE
parentPort.postMessage(readHtml(job, { ...options, memoryOver }))
