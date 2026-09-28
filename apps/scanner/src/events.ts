import type { ScanEvent } from '@arablyzer/api-contract'
import type { ScanProgress } from '@arablyzer/engine'

/** The engine's step as the page reads it. */
export function eventOf(progress: ScanProgress): ScanEvent {
  switch (progress.step) {
    case 'start':
      return { type: 'started', engines: [...progress.engines] }
    case 'page':
      return {
        type: 'page',
        status: progress.status,
        contentType: progress.contentType,
        error: progress.error,
      }
    case 'robots':
      return { type: 'robots', outcome: progress.outcome, status: progress.status }
    case 'crux':
      return { type: 'crux', outcome: progress.outcome }
    case 'render-start':
      return { type: 'render-start', engine: progress.engine }
    case 'render':
      return {
        type: 'render',
        engine: progress.run.engine,
        version: progress.run.version,
        status: progress.run.status,
        requests: progress.run.requests,
      }
    case 'lab-start':
      return { type: 'lab-start' }
    case 'lab':
      return { type: 'lab', status: progress.status }
    case 'rules':
      return { type: 'rules', rules: progress.rules }
  }
}
