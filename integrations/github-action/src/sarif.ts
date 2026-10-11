import { rulePageUrl, type Severity, type SiteLang } from '@arablyzer/integrations-core'
import type { Report } from '@arablyzer/report-schema'

// A report as SARIF 2.1.0, for `github/codeql-action/upload-sarif` (code scanning). One run per
// scanned page, so each page has its own `automationDetails` category and its alerts are tracked
// apart. The rules are the ones that found something; a finding's place is the page's address,
// with the CSS selector as its logical location (a web page has no file and line).
//
// Severity to level: critical and serious are errors, moderate a warning, minor and info a note.

export const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json'

export type SarifLevel = 'error' | 'warning' | 'note'
export const LEVELS: Readonly<Record<Severity, SarifLevel>> = {
  critical: 'error',
  serious: 'error',
  moderate: 'warning',
  minor: 'note',
  info: 'note',
}

export interface SarifOptions {
  /** The site's origin: the rules' pages are on it. */
  readonly origin: string
  readonly lang: SiteLang
  /** The report page of the scan, for a person. */
  readonly reportUrl: string
}

interface SarifRule {
  id: string
  shortDescription: { text: string }
  helpUri: string
  help: { text: string; markdown: string }
  defaultConfiguration: { level: SarifLevel }
  properties: { tags: string[]; precision: 'high' }
}

interface SarifResult {
  ruleId: string
  ruleIndex: number
  level: SarifLevel
  message: { text: string }
  locations: {
    physicalLocation: {
      artifactLocation: { uri: string }
      region?: { startLine: number; startColumn?: number; snippet?: { text: string } }
    }
    logicalLocations?: { name: string; kind: 'element' }[]
  }[]
  partialFingerprints: { 'arablyzer/v1': string }
  properties: { severity: Severity; engines?: string[] }
}

export interface SarifLog {
  $schema: string
  version: '2.1.0'
  runs: [
    {
      tool: {
        driver: {
          name: 'Arablyzer'
          semanticVersion: string
          informationUri: string
          rules: SarifRule[]
        }
      }
      automationDetails: { id: string }
      results: SarifResult[]
      properties: { score: number | null; scanUrl: string; reportUrl: string }
    },
  ]
}

/** An address as a URI SARIF accepts: absolute against the scanned page, or the page itself. */
function uriOf(candidate: string | undefined, pageUrl: string): string {
  if (candidate === undefined) return pageUrl
  try {
    return new URL(candidate, pageUrl).href
  } catch {
    return pageUrl
  }
}

/** The run's category: `arablyzer/<host><path>/`, which GitHub reads as category and run id. */
export function categoryOf(pageUrl: string): string {
  let host = 'page'
  let path = ''
  try {
    const url = new URL(pageUrl)
    host = url.host
    path = url.pathname.replace(/\/+$/, '')
  } catch {
    // The category only has to be stable; an address that does not parse has been refused before.
  }
  return `arablyzer/${host}${path.replace(/[^A-Za-z0-9._~/-]/g, '-')}/`
}

export function toSarif(report: Report, options: SarifOptions): SarifLog {
  const pageUrl = report.target.finalUrl ?? report.target.url
  const known = new Map(report.rules.map((rule) => [rule.id, rule]))
  const rules: SarifRule[] = []
  const indexOf = new Map<string, number>()

  const ruleFor = (ruleId: string, severity: Severity, fallback: string): number => {
    const found = indexOf.get(ruleId)
    if (found !== undefined) return found
    const rule = known.get(ruleId)
    const title = rule?.title[options.lang] ?? fallback
    const helpUri = rulePageUrl(options.origin, options.lang, ruleId)
    const wcag = (rule?.wcag ?? []).map((criterion) => `wcag-${criterion}`)
    rules.push({
      id: ruleId,
      shortDescription: { text: title },
      helpUri,
      help: { text: `${title}\n${helpUri}`, markdown: `[${title}](${helpUri})` },
      defaultConfiguration: { level: LEVELS[rule?.severity ?? severity] },
      properties: {
        tags: ['arablyzer', ...(rule === undefined ? [] : [rule.category]), ...wcag],
        precision: 'high',
      },
    })
    indexOf.set(ruleId, rules.length - 1)
    return rules.length - 1
  }

  const results: SarifResult[] = report.findings.map((finding) => {
    const { evidence } = finding
    const message = finding.message[options.lang]
    const physicalLocation: SarifResult['locations'][number]['physicalLocation'] = {
      artifactLocation: { uri: uriOf(evidence.url, pageUrl) },
      ...(evidence.location === undefined
        ? {}
        : {
            region: {
              startLine: evidence.location.line,
              ...(evidence.location.column === undefined
                ? {}
                : { startColumn: evidence.location.column }),
              ...(evidence.snippet === undefined ? {} : { snippet: { text: evidence.snippet } }),
            },
          }),
    }
    return {
      ruleId: finding.ruleId,
      ruleIndex: ruleFor(finding.ruleId, finding.severity, message),
      level: LEVELS[finding.severity],
      message: { text: message },
      locations: [
        {
          physicalLocation,
          ...(evidence.selector === undefined
            ? {}
            : { logicalLocations: [{ name: evidence.selector, kind: 'element' as const }] }),
        },
      ],
      partialFingerprints: { 'arablyzer/v1': finding.fingerprint },
      properties: {
        severity: finding.severity,
        ...(evidence.engines === undefined ? {} : { engines: [...evidence.engines] }),
      },
    }
  })

  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Arablyzer',
            semanticVersion: report.generator.version,
            informationUri: options.origin,
            rules,
          },
        },
        automationDetails: { id: categoryOf(report.target.url) },
        results,
        properties: {
          score: report.score.overall,
          scanUrl: report.target.url,
          reportUrl: options.reportUrl,
        },
      },
    ],
  }
}
