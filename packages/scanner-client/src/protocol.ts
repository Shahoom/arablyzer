import { ScanEvent, type ScanEvent as ScanEventShape } from '@arablyzer/api-contract'
import { MAX_URL_LENGTH } from '@arablyzer/api-contract/codes'
import { Engine, Report, type Report as ReportShape } from '@arablyzer/report-schema'
import { z } from 'zod'

// How the worker and the scanner talk (M2.1 plan §5b): the worker asks for one page; the scanner
// answers with the scan's events as they happen, then its report, as NDJSON. Every line is
// checked against these schemas where it arrives.

/** The path the worker asks for a scan on. */
export const SCAN_PATH = '/scan'

/** What the worker sends: the page, and nothing about who asked for it. */
export const ScanRequest = z.strictObject({ url: z.string().min(1).max(MAX_URL_LENGTH) })
export type ScanRequest = z.infer<typeof ScanRequest>

/** Why a scan could not run, as the scanner tells it: an English line for the logs. */
export const MAX_ERROR_LENGTH = 500

/** The engine's steps, once each in a scan (packages/engine, scan.ts). */
const ONCE = ['started', 'page', 'robots', 'crux', 'lab-start', 'lab', 'rules'] as const
/** The render's steps, once for each engine. */
const PER_ENGINE = ['render-start', 'render'] as const
/**
 * The events the scanner sends: a scan's own steps. The queue's, and a scan's end, are the
 * API's and the worker's to tell.
 */
export const SCANNER_EVENT_TYPES = [...ONCE, ...PER_ENGINE] as const
export type ScannerEvent = Extract<
  ScanEventShape,
  { readonly type: (typeof SCANNER_EVENT_TYPES)[number] }
>
/** The most a scan sends: each step once, the render's for every engine. */
export const MAX_SCANNER_EVENTS = ONCE.length + PER_ENGINE.length * Engine.options.length

const scannerEvent = ScanEvent.refine(
  (event) => (SCANNER_EVENT_TYPES as readonly string[]).includes(event.type),
  'The API or the worker tells this event, never the scanner',
)

/** One line of the answer, as the scanner writes it. */
export type ScannerLineOut =
  | { readonly type: 'event'; readonly event: ScannerEvent }
  | { readonly type: 'report'; readonly report: ReportShape }
  | { readonly type: 'error'; readonly message: string }

/** One line of the answer, as the worker checks it. */
export const ScannerLine = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('event'), event: scannerEvent }),
  z.strictObject({ type: z.literal('report'), report: Report }),
  z.strictObject({ type: z.literal('error'), message: z.string().max(MAX_ERROR_LENGTH) }),
])
export type ScannerLine = z.infer<typeof ScannerLine>
