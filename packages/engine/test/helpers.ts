import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createPolicy, type EgressPolicy, type Resolver } from '@arablyzer/egress'
import { serveSite, type FixtureConfig, type FixtureSite } from '@arablyzer/fixtures'
import schema from '@arablyzer/report-schema/report.schema.json' with { type: 'json' }
import type { Report } from '@arablyzer/report-schema'
import type { DetectorFinding, Evidence, Rule, RuleCopy } from '@arablyzer/rules'
import type { PageFacts } from '@arablyzer/collectors'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'

export interface TempSite extends FixtureSite {
  readonly root: string
}

/** A fixture site written to a temporary directory: file paths → contents, plus fixture.json. */
export async function tempSite(
  files: Readonly<Record<string, string | Uint8Array>>,
  config?: FixtureConfig,
): Promise<TempSite> {
  const root = await mkdtemp(path.join(tmpdir(), 'arablyzer-engine-'))
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, content)
  }
  if (config !== undefined) await writeFile(path.join(root, 'fixture.json'), JSON.stringify(config))
  const site = await serveSite(root)
  return {
    ...site,
    root,
    close: async () => {
      await site.close()
      await rm(root, { recursive: true, force: true })
    },
  }
}

/** Opens exactly one local fixture server. */
export function policyFor(site: FixtureSite): EgressPolicy {
  return createPolicy({ allowTargets: [{ address: '127.0.0.1', port: site.port }] })
}

/**
 * Resolves the site's own host name (its site.json .example name) to 127.0.0.1, and no other
 * name at all: a scan of a fixture never asks real DNS.
 */
export function resolverFor(site: FixtureSite): Resolver {
  return (hostname) =>
    Promise.resolve(hostname === site.hostname ? [{ address: '127.0.0.1', family: 4 }] : [])
}

const ajv = new Ajv2020({ strict: true, allErrors: true })
addFormats(ajv)
const validate = ajv.compile(schema)

/** Validates with Ajv against the committed report.schema.json, independent of Zod. */
export function schemaErrors(report: Report): string {
  return validate(report) ? '' : ajv.errorsText(validate.errors)
}

function copy(title: string, messages: Record<string, string>): RuleCopy {
  return {
    title,
    messages,
    sections: { why: 'x', fix: 'x', detect: 'x', references: 'https://example.com/' },
    reviewed: true,
  }
}

export interface TestRuleOptions {
  readonly id?: string
  readonly needs?: Rule['needs']
  readonly renderEngines?: Rule['renderEngines']
  readonly severity?: Rule['severity']
  readonly manualCheck?: boolean
  readonly appliesTo?: (page: PageFacts, evidence?: Evidence) => boolean
  readonly detect: (evidence: Evidence) => Iterable<DetectorFinding<'found'>>
}

/** A rule with inline copy: message "found" says `Found {what}` / `وجدنا {what}`. */
export function testRule(options: TestRuleOptions): Rule<'found'> {
  const id = options.id ?? 'test-rule'
  return {
    id,
    version: '1.0.0',
    category: 'onpage',
    severity: options.severity ?? 'serious',
    wcag: ['3.1.1'],
    needs: options.needs ?? ['html'],
    messages: ['found'],
    ...(options.renderEngines === undefined ? {} : { renderEngines: options.renderEngines }),
    ...(options.manualCheck === undefined ? {} : { manualCheck: options.manualCheck }),
    appliesTo: options.appliesTo ?? (() => true),
    detect: options.detect,
    copy: {
      ar: copy(`قاعدة ${id}`, { found: 'وجدنا {what}' }),
      en: copy(`Rule ${id}`, { found: 'Found {what}' }),
    },
  }
}

/** A rule that needs rendering: one finding per Arabic text block, with its engine and box. */
export const renderRule = (options: Partial<TestRuleOptions> = {}): Rule<'found'> =>
  testRule({
    id: 'render-rule',
    needs: ['render'],
    detect: ({ rendered }) =>
      (rendered ?? []).flatMap((facts) =>
        facts.arabicText.map((block) => ({
          message: 'found' as const,
          values: { what: block.text },
          selector: block.selector,
          engines: [facts.engine],
          box: block.box,
          key: facts.engine,
        })),
      ),
    ...options,
  })

/** Findings for every <meta name="flag">: an easy way to make a test rule fail on purpose. */
export const flagRule = (options: Partial<TestRuleOptions> = {}): Rule<'found'> =>
  testRule({
    detect: ({ page }) =>
      (page.html?.metas ?? [])
        .filter((meta) => meta.name === 'flag')
        .map((meta) => ({
          message: 'found' as const,
          values: { what: meta.content ?? '' },
          selector: meta.selector,
          ...(meta.snippet === null ? {} : { snippet: meta.snippet }),
          ...(meta.location === null ? {} : { location: meta.location }),
          key: meta.content ?? '',
        })),
    ...options,
  })
