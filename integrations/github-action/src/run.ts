import { INTEGRATIONS_UI, type StartProblem } from '@arablyzer/i18n/integrations'
import {
  absolute,
  ApiError,
  countAtOrAbove,
  createApiClient,
  SEVERITIES,
  waitForScan,
  type Fetcher,
  type Scan,
  type Severity,
} from '@arablyzer/integrations-core'
import type { Report } from '@arablyzer/report-schema'
import { runnerSink, type Sink } from './github'
import { InputError, readInputs, type Inputs } from './inputs'
import { toSarif } from './sarif'
import { renderSummary, type PageOutcome } from './summary'
import { VERSION } from './version'

export interface RunDeps {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly fetcher: Fetcher
  readonly sleep: (ms: number) => Promise<void>
  readonly now: () => number
  /** Writes a file, making its folder. */
  readonly writeFile: (path: string, text: string) => Promise<void>
  readonly sink?: Sink
  readonly write?: (text: string) => void
}

/** The outputs action.yml declares, in its order (a test keeps the two equal). */
export const OUTPUT_NAMES = [
  'score',
  'scores',
  'findings',
  'report_urls',
  'sarif_dir',
  'result',
] as const

/** `pass`: scanned, nothing at the gate. `fail`: findings at the gate. `error`: a page could not be scanned. */
export type Result = 'pass' | 'fail' | 'error' | 'started'

const slugOf = (url: string): string => {
  const parsed = new URL(url)
  return `${parsed.host}${parsed.pathname}`.replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '')
}

const PROBLEMS: readonly string[] = [
  'unauthorized',
  'plan_limit',
  'rate_limited',
  'blocked_target',
  'invalid_url',
  'invalid_request',
  'accounts_off',
  'network',
  'unavailable',
  'timeout',
  'scan_failed',
  'bad_response',
]

function problemKey(error: unknown): StartProblem {
  const code = error instanceof ApiError ? error.code : 'unavailable'
  return (PROBLEMS.includes(code) ? code : 'unavailable') as StartProblem
}

/** Runs the Action: scans each page, writes the summary and the SARIF files, sets the outputs. Returns the exit code. */
export async function runAction(deps: RunDeps): Promise<number> {
  const sink =
    deps.sink ?? runnerSink(deps.env, deps.write ?? ((text) => process.stdout.write(text)))

  let inputs: Inputs
  try {
    inputs = readInputs(deps.env)
  } catch (error) {
    if (error instanceof InputError) {
      sink.error(error.message)
      return 1
    }
    throw error
  }
  sink.mask(inputs.apiKey)
  const t = INTEGRATIONS_UI[inputs.lang].action

  const client = createApiClient({
    baseUrl: inputs.origin,
    apiKey: inputs.apiKey,
    fetcher: deps.fetcher,
    headers: { 'user-agent': `arablyzer-action/${VERSION}` },
  })

  const scanOne = async (url: string, index: number): Promise<PageOutcome> => {
    try {
      const started = await client.startScan(url)
      const reportUrl = absolute(inputs.origin, started.links.page)
      sink.info(
        `${url}: scan ${started.id}${started.reused ? ' (reused, scanned in the last ten minutes)' : ''}`,
      )
      if (!inputs.wait) return { kind: 'started', url, reportUrl }
      const scan: Scan = await waitForScan({
        client,
        scanId: started.id,
        first: started,
        timeoutMs: inputs.timeoutMs,
        sleep: deps.sleep,
        now: deps.now,
      })
      if (scan.state === 'failed') throw new ApiError('scan_failed', 'The scan failed.', 0)
      const report: Report = await client.getReport(scan.id)
      const gateCount = countAtOrAbove(report.summary.bySeverity, inputs.failOn)
      const file = `${inputs.sarifDir}/${String(index + 1).padStart(2, '0')}-${slugOf(url)}.sarif`
      await deps.writeFile(
        file,
        `${JSON.stringify(toSarif(report, { origin: inputs.origin, lang: inputs.lang, reportUrl }), null, 2)}\n`,
      )
      sink.info(`${url}: score ${String(report.score.overall ?? 'none')}, report ${reportUrl}`)
      return { kind: 'report', result: { url, reportUrl, report, gateCount } }
    } catch (error) {
      const key = problemKey(error)
      sink.error(`${url}: ${t.problems[key]}`)
      return {
        kind: 'problem',
        problem: {
          url,
          problem: t.problems[key],
          ...(error instanceof ApiError && error.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: error.retryAfterSeconds }
            : {}),
        },
      }
    }
  }

  const outcomes = await Promise.all(inputs.urls.map(scanOne))

  sink.summary(
    renderSummary(outcomes, {
      origin: inputs.origin,
      lang: inputs.lang,
      maxIssues: inputs.maxIssues,
      failOn: inputs.failOn,
    }),
  )

  const reports = outcomes.flatMap((o) => (o.kind === 'report' ? [o] : []))
  const scores = Object.fromEntries(
    reports.map((o) => [o.result.url, o.result.report.score.overall] as const),
  )
  const numeric = Object.values(scores).filter((s): s is number => s !== null)
  const totals = Object.fromEntries(
    SEVERITIES.map((s: Severity) => [
      s,
      reports.reduce((sum, o) => sum + o.result.report.summary.bySeverity[s], 0),
    ]),
  )
  const failedGate = reports.some((o) => o.result.gateCount > 0)
  const hadProblem = outcomes.some((o) => o.kind === 'problem')
  const result: Result = hadProblem
    ? 'error'
    : failedGate
      ? 'fail'
      : inputs.wait
        ? 'pass'
        : 'started'

  sink.output('score', numeric.length === 0 ? '' : String(Math.min(...numeric)))
  sink.output('scores', JSON.stringify(scores))
  sink.output('findings', JSON.stringify(totals))
  sink.output(
    'report_urls',
    JSON.stringify(
      outcomes.flatMap((o) =>
        o.kind === 'report' ? [o.result.reportUrl] : o.kind === 'started' ? [o.reportUrl] : [],
      ),
    ),
  )
  sink.output('sarif_dir', reports.length === 0 ? '' : inputs.sarifDir)
  sink.output('result', result)

  if (inputs.failOn !== 'none') {
    const word = t.severity[inputs.failOn].toLowerCase()
    for (const o of reports) {
      if (o.result.gateCount > 0)
        sink.error(`${o.result.url}: ${t.gate.failed(o.result.gateCount, word)}`)
    }
  }
  return result === 'pass' || result === 'started' ? 0 : 1
}
