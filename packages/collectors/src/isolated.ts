import { Worker } from 'node:worker_threads'
import {
  htmlJobOf,
  isTruncated,
  pageFacts,
  pageFactsWithoutHtml,
  pageHead,
  type CollectOptions,
  type HtmlJob,
  type HtmlRead,
  type PageFacts,
  type PageInput,
} from './page'

/**
 * The heap of the thread that reads a page, in MB (H1 of the pre-launch review). Under the
 * scanner's 1200 MB (compose.yaml), where its own process, its browsers and the facts this thread
 * hands back have room too. A page whose tree needs more is too complex: a page of 130,000 links
 * (12.7 MB, well under the collector's limits) needed more than 384 and less than 512 (Node 22.22).
 */
export const ISOLATED_HEAP_MB = 384

/** The longest a timer may be: a longer one fires after a millisecond. */
const MAX_TIMER_MS = 2 ** 31 - 1

export interface IsolatedOptions extends Omit<CollectOptions, 'deadline'> {
  /**
   * How long the whole read may take, the thread's start included. Past it the thread is ended,
   * whatever it is doing, and the page is too complex: where collectPage's deadline is read only
   * between elements, and a start tag of 300,000 attributes has none.
   */
  readonly timeoutMs: number
  /** The thread's old-generation heap, in MB. Default ISOLATED_HEAP_MB. */
  readonly maxHeapMb?: number
  /** Ends the thread, and rejects with the signal's reason. */
  readonly signal?: AbortSignal
}

/**
 * collectPage, with the HTML read in a thread of its own (H1 of the pre-launch review): one with a
 * heap limit, a clock that ends it wherever it is, and no share of this thread's event loop. A
 * page that outgrows either is too complex, as when it outgrows the limits collectPage sets on
 * its tree, and this process lives on. The facts are the same as collectPage's, as they are read
 * by the same code: the thread only says where.
 */
export async function collectPageIsolated(
  input: PageInput,
  options: IsolatedOptions,
): Promise<PageFacts> {
  const head = pageHead(input)
  if (!head.base.isHtml) return pageFactsWithoutHtml(head)
  const { timeoutMs, maxHeapMb, signal, ...limits } = options
  signal?.throwIfAborted()
  const read = await readInThread(htmlJobOf(input, head), limits, {
    // A timer longer than this fires at once.
    timeoutMs: Math.min(timeoutMs, MAX_TIMER_MS),
    maxHeapMb: maxHeapMb ?? ISOLATED_HEAP_MB,
    ...(signal === undefined ? {} : { signal }),
  })
  return pageFacts(head, isTruncated(input, limits), read)
}

interface ThreadLimits {
  readonly timeoutMs: number
  readonly maxHeapMb: number
  readonly signal?: AbortSignal
}

/** The HTML's facts; null when the thread ran out of heap or time, or the page is too complex. */
function readInThread(
  job: HtmlJob,
  options: Omit<CollectOptions, 'deadline'>,
  { timeoutMs, maxHeapMb, signal }: ThreadLimits,
): Promise<HtmlRead | null> {
  return new Promise((resolve, reject) => {
    const thread = new Worker(new URL('./isolated-thread.mjs', import.meta.url), {
      workerData: { job, options },
      resourceLimits: { maxOldGenerationSizeMb: maxHeapMb },
      // Not this process's flags (`--import tsx`, `--input-type`, a debugger's): the thread loads
      // its own sources, and none of them is meant for it.
      execArgv: [],
    })
    let over = false
    const end = (settle: () => void) => {
      if (over) return
      over = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      void thread.terminate()
      settle()
    }
    const timer = setTimeout(() => {
      end(() => {
        resolve(null)
      })
    }, timeoutMs)
    const abort = () => {
      end(() => {
        reject(signal?.reason as Error)
      })
    }
    signal?.addEventListener('abort', abort, { once: true })
    thread.once('message', (read: HtmlRead | null) => {
      end(() => {
        resolve(read)
      })
    })
    // Kept for the thread's life: an error that comes after the read has ended is nobody's.
    thread.on('error', (error: Error & { code?: string }) => {
      // Node's own word for a thread that hit its heap limit: the thread is gone, this one is not.
      end(() => {
        if (error.code === 'ERR_WORKER_OUT_OF_MEMORY') resolve(null)
        else reject(error)
      })
    })
    thread.once('exit', (code) => {
      end(() => {
        reject(new Error(`The thread reading the page ended with code ${String(code)}, unanswered`))
      })
    })
  })
}
