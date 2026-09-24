import { createPolicy, localInterfaceCidrs } from '@arablyzer/egress'
import { ENGINE_VERSION, scan } from '@arablyzer/engine'
import { SEVERITY_ORDER, type Report, type Severity } from '@arablyzer/report-schema'
import { parseCliArgs, UsageError } from './args'
import { formatReport } from './format'
import { langFromEnv, STRINGS } from './i18n'

export interface Io {
  readonly stdout: (text: string) => void
  readonly stderr: (text: string) => void
  readonly env: Readonly<Record<string, string | undefined>>
  /** ANSI colours for the text report. */
  readonly color: boolean
  readonly signal?: AbortSignal
}

/** Runs the command and returns the exit code (docs/design/phase-0.md §3). */
export async function run(argv: readonly string[], io: Io): Promise<number> {
  let options: ReturnType<typeof parseCliArgs>
  try {
    options = parseCliArgs(argv, io.env)
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    io.stderr(`arablyzer: ${error.message}\n${STRINGS[langFromEnv(io.env)].usageHint}\n`)
    return 2
  }
  if (options.help) {
    io.stdout(STRINGS[options.lang].help)
    return 0
  }
  if (options.version) {
    io.stdout(`arablyzer ${ENGINE_VERSION}\n`)
    return 0
  }

  // Default mode also denies this machine's own addresses, so a redirect cannot reach services
  // on a server with a public IP (M0.1 security review). --allow-private is for local builds.
  const policy = options.allowPrivate
    ? createPolicy({ allowPrivate: true })
    : createPolicy({ denyCidrs: localInterfaceCidrs() })
  const report = await scan(options.url, {
    policy,
    timeoutMs: options.timeoutMs,
    ...(options.ruleIds === undefined ? {} : { ruleIds: options.ruleIds }),
    ...(io.signal === undefined ? {} : { signal: io.signal }),
  })
  io.stdout(
    options.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatReport(report, options.lang, io.color),
  )
  return exitCode(report, options.failOn)
}

/** 0 complete; 1 a rule failed at --fail-on or above; 2 the scan did not complete. */
export function exitCode(report: Report, failOn: Severity | undefined): number {
  if (report.scan.status === 'failed') return 2
  if (failOn !== undefined) {
    const threshold = SEVERITY_ORDER.indexOf(failOn)
    const failing = report.rules.some(
      (rule) => rule.status === 'fail' && SEVERITY_ORDER.indexOf(rule.severity) <= threshold,
    )
    if (failing) return 1
  }
  return report.scan.status === 'partial' ? 2 : 0
}
