/// <reference lib="dom" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { A11yFacts, A11yRuleId } from '@arablyzer/collectors'
import { z } from 'zod'

/**
 * The axe-core rules Arablyzer reports, each through a rule of its own with fixtures and Arabic
 * copy (Phase 1 design §3); axe's other rules do not run. axe-core is pinned: the seed below rests
 * on its internals, and the fixtures fail if an update changes them.
 */
export const AXE_RULES: readonly A11yRuleId[] = [
  'image-alt',
  'color-contrast',
  'link-name',
  'button-name',
  'valid-lang',
  'label',
]

export interface AxeLimits {
  /** Elements kept per rule and result type; the rest are counted. */
  readonly maxNodes: number
  readonly snippetLength: number
  /** Text nodes looked at for the fonts of Arabic text. */
  readonly maxTextNodes: number
}

export const AXE_LIMITS: AxeLimits = { maxNodes: 20, snippetLength: 200, maxTextNodes: 20_000 }

let source: string | undefined
let version: string | undefined

/** axe-core's browser build, read once per process: from this package, or next to the CLI. */
export function axeSource(): string {
  source ??= readFileSync(fileURLToPath(import.meta.resolve('axe-core/axe.min.js')), 'utf8')
  return source
}

export function axeVersion(): string {
  if (version === undefined) {
    const manifest: unknown = JSON.parse(
      readFileSync(fileURLToPath(import.meta.resolve('axe-core/package.json')), 'utf8'),
    )
    version =
      typeof manifest === 'object' && manifest !== null && 'version' in manifest
        ? String(manifest.version)
        : 'unknown'
  }
  return version
}

interface AxeNode {
  readonly target: readonly unknown[]
  readonly html: string
  readonly any: readonly { readonly data?: unknown }[]
  readonly all: readonly { readonly data?: unknown }[]
  readonly none: readonly { readonly data?: unknown }[]
}

interface AxeResult {
  readonly id: string
  readonly nodes: readonly AxeNode[]
}

interface Axe {
  readonly _cache: { set(key: string, value: unknown): void }
  run(
    context: Document,
    options: Record<string, unknown>,
  ): Promise<{ violations: AxeResult[]; incomplete: AxeResult[]; inapplicable: AxeResult[] }>
}

/**
 * Runs in the page, after axe's source: it must stay self-contained, as the measuring script does,
 * and it runs in the page's own world, so a page can falsify its own results and only its own.
 *
 * axe-core's color-contrast leaves out text it takes for icon-font ligatures, and it takes Arabic
 * for them: isIconLigature draws a text's first character alone at the left edge and compares it
 * with the whole text, where an Arabic sentence starts at the right, joined; after three such text
 * nodes in one font family it leaves out every text in that font, English too (measured
 * 2026-09-27, docs/design/plans/m1.2b-axe-forms.md §0). So the fonts of text nodes with Arabic
 * letters are seeded in axe's font cache as seen and never a ligature. Icon fonts, whose
 * ligatures are Latin names, keep axe's check.
 */
export async function runAxeInPage(
  rules: readonly string[],
  limits: AxeLimits,
): Promise<{ rules: unknown[] }> {
  const axe = (window as unknown as { axe: Axe }).axe
  const arabic = /\p{Script=Arabic}/u
  const families: Record<string, { occurrences: number; numLigatures: number }> = {}
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (
    let seen = 0, node = walker.nextNode();
    node !== null && seen < limits.maxTextNodes;
    seen++
  ) {
    const parent = node.parentElement
    if (parent !== null && arabic.test(node.nodeValue ?? '')) {
      const family = getComputedStyle(parent).getPropertyValue('font-family')
      families[family] = { occurrences: 3, numLigatures: 0 }
    }
    node = walker.nextNode()
  }
  axe._cache.set('fonts', families)

  const result = await axe.run(document, {
    runOnly: { type: 'rule', values: rules },
    resultTypes: ['violations', 'incomplete'],
    iframes: false,
    elementRef: false,
    selectors: true,
    ancestry: false,
    xpath: false,
    performanceTimer: false,
  })

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null
  const text = (value: unknown): string => (typeof value === 'string' ? value : '')
  const compact = (node: AxeNode) => {
    const checks = [...node.any, ...node.all, ...node.none]
    const record = checks.map((check) => check.data).find(isRecord) ?? {}
    const contrast =
      typeof record.contrastRatio === 'number' && record.contrastRatio > 0
        ? {
            foreground: text(record.fgColor).slice(0, 30),
            background: text(record.bgColor).slice(0, 30),
            ratio: Math.round(record.contrastRatio * 100) / 100,
            // axe writes the ratio it expected as "4.5:1".
            expected: Number(text(record.expectedContrastRatio).replace(':1', '')) || 0,
          }
        : null
    return {
      selector: node.target.map(String).join(' ').slice(-300),
      snippet: node.html.replace(/\s+/g, ' ').slice(0, limits.snippetLength),
      reason: typeof record.messageKey === 'string' ? record.messageKey.slice(0, 50) : null,
      contrast,
    }
  }
  const nodesOf = (list: readonly AxeResult[], id: string) =>
    list.find((item) => item.id === id)?.nodes ?? []
  return {
    rules: rules.map((id) => {
      const violations = nodesOf(result.violations, id)
      const incomplete = nodesOf(result.incomplete, id)
      return {
        id,
        applicable: !result.inapplicable.some((item) => item.id === id),
        violations: violations.slice(0, limits.maxNodes).map(compact),
        violationCount: violations.length,
        incomplete: incomplete.slice(0, limits.maxNodes).map(compact),
        incompleteCount: incomplete.length,
      }
    }),
  }
}

/** The runner as source text for page.evaluate, with axe already on the page (see measureSource). */
export function axeRunnerSource(
  rules: readonly string[] = AXE_RULES,
  limits: AxeLimits = AXE_LIMITS,
): string {
  return `(() => { const __name = (target) => target; return (${runAxeInPage.toString()})(${JSON.stringify(rules)}, ${JSON.stringify(limits)}) })()`
}

const A11yNode = z.strictObject({
  selector: z.string().max(300),
  snippet: z.string().max(AXE_LIMITS.snippetLength),
  reason: z.string().max(50).nullable(),
  contrast: z
    .strictObject({
      foreground: z.string().max(30),
      background: z.string().max(30),
      ratio: z.number().min(0).max(21),
      expected: z.number().min(0).max(21),
    })
    .nullable(),
})

const A11yResult = z.strictObject({
  rules: z
    .array(
      z.strictObject({
        id: z.enum([
          'image-alt',
          'color-contrast',
          'link-name',
          'button-name',
          'valid-lang',
          'label',
        ]),
        applicable: z.boolean(),
        violations: z.array(A11yNode).max(AXE_LIMITS.maxNodes),
        violationCount: z.number().int().min(0),
        incomplete: z.array(A11yNode).max(AXE_LIMITS.maxNodes),
        incompleteCount: z.number().int().min(0),
      }),
    )
    .max(AXE_RULES.length),
})

/** The runner's result as facts; throws when it is not what the runner returns. */
export function toA11yFacts(result: unknown): A11yFacts {
  return { axeVersion: axeVersion(), rules: A11yResult.parse(result).rules }
}
