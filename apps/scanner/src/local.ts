import { scan, type ScanOptions } from '@arablyzer/engine'
import type { Scanner } from '@arablyzer/scanner-client'
import { eventOf } from './events'

/** The engine in this process, with its options: the scanner's own, and `pnpm dev`'s. */
export function localScanner(options: ScanOptions): Scanner {
  return (url, onEvent, signal) =>
    scan(url, {
      ...options,
      ...(signal === undefined ? {} : { signal }),
      onProgress: (progress) => {
        onEvent(eventOf(progress))
      },
    })
}
