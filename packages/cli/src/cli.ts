import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createPolicy,
  localInterfaceCidrs,
  publicInterfaceCidrs,
  type EgressPolicy,
  type InterfaceMap,
} from '@arablyzer/egress'
import { ENGINE_VERSION, scan } from '@arablyzer/engine'
import { SEVERITY_ORDER, type Engine, type Report, type Severity } from '@arablyzer/report-schema'
import { parseCliArgs, UsageError } from './args'
import { formatJson, formatReport } from './format'
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

  const { render } = options
  const screenshots: [Engine, Uint8Array][] = []
  if (render?.screenshotsDir != null) await mkdir(render.screenshotsDir, { recursive: true })
  const report = await scan(options.url, {
    policy: cliPolicy(options.allowPrivate),
    timeoutMs: options.timeoutMs,
    ...(options.ruleIds === undefined ? {} : { ruleIds: options.ruleIds }),
    ...(io.signal === undefined ? {} : { signal: io.signal }),
    ...(render === null
      ? {}
      : {
          render: {
            engines: render.engines,
            screenshots: render.screenshotsDir !== null,
            onScreenshot: (engine: Engine, png: Uint8Array) => screenshots.push([engine, png]),
            networkIsolated: render.networkIsolated,
          },
        }),
  })
  if (render?.screenshotsDir != null) {
    for (const [engine, png] of screenshots) {
      await writeFile(path.join(render.screenshotsDir, `${engine}.png`), png)
    }
  }
  io.stdout(options.json ? formatJson(report) : formatReport(report, options.lang, io.color))
  const missing = (report.scan.render ?? []).filter((run) => run.status === 'unavailable')
  if (missing.length > 0) {
    // Loaded with the browser code, which rendering already loaded.
    const { PLAYWRIGHT_VERSION } = await import('@arablyzer/browser')
    const hint = STRINGS[options.lang].installBrowsers(
      missing.map((run) => run.engine),
      PLAYWRIGHT_VERSION,
    )
    io.stderr(`arablyzer: ${hint}\n`)
  }
  return exitCode(report, options.failOn)
}

/**
 * Default mode denies this machine's own addresses, so a redirect cannot reach services on a
 * server with a public IP (M0.1 security review). --allow-private opens private ranges for local
 * builds but still denies the public ones (M0.2 security review).
 */
export function cliPolicy(allowPrivate: boolean, interfaces?: InterfaceMap): EgressPolicy {
  return allowPrivate
    ? createPolicy({ allowPrivate: true, denyCidrs: publicInterfaceCidrs(interfaces) })
    : createPolicy({ denyCidrs: localInterfaceCidrs(interfaces) })
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
