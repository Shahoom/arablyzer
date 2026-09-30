import type { RuleReads } from '@arablyzer/i18n'
import {
  loadRuleExample,
  type Rule,
  type RuleCopy,
  RULES,
  SECTION_HEADINGS,
  SERVER_RESPONSE_RULES,
} from '@arablyzer/rules'
import { SEVERITY_WEIGHTS } from '@arablyzer/scoring'
import { renderMarkdown } from '@arablyzer/seo/markdown'
import { TOOLS } from '@arablyzer/tools'
import { highlight } from '../src/lib/code'
import { fixHtml } from '../src/lib/fix-html'
import type { LibraryData, RuleCopyData, RuleData, RuleHeadings } from '../src/lib/rule-data'

// The rules as their library pages need them (M2.4), for src/generated/library.json:
// generate.ts writes it.

/** How many rules of its category a rule's page lists beside it. */
const NEAR = 3

/** A meta description's length, past which search results cut it. */
const DESCRIPTION = 160

/**
 * What the rule reads, most telling first: a browser, Chrome's data, robots.txt, the server's
 * response (its headers, redirects or connection), or the HTML.
 */
export function ruleReads(rule: Rule): RuleReads {
  if (rule.needs.includes('render')) return 'render'
  if (rule.needs.includes('crux')) return 'crux'
  if (rule.needs.includes('robots')) return 'robots'
  if (SERVER_RESPONSE_RULES.has(rule.id)) return 'http'
  return 'html'
}

/**
 * The first point of a Markdown section as plain text, cut at a word within a meta
 * description's length: a rule's page is described by the first reason it matters.
 */
export function firstPoint(markdown: string): string {
  const first = markdown.trim().split(/\n\s*\n|\n(?=\s*(?:[-*]|\d+\.)\s)/)[0] ?? ''
  const text = first
    .replace(/^\s*(?:[-*]|\d+\.)\s+/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= DESCRIPTION) return text
  const cut = text.slice(0, DESCRIPTION - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s،,:;.]+$/, '')}…`
}

function copyData(copy: RuleCopy): RuleCopyData {
  const html = (markdown: string) => fixHtml(renderMarkdown(markdown))
  return {
    title: copy.title,
    description: firstPoint(copy.sections.why),
    why: html(copy.sections.why),
    fix: html(copy.sections.fix),
    detect: html(copy.sections.detect),
    references: html(copy.sections.references),
  }
}

function headingsOf(lang: 'ar' | 'en'): RuleHeadings {
  const { why, fix, detect, references } = SECTION_HEADINGS[lang]
  return { why, fix, detect, references }
}

export function libraryData(): LibraryData {
  const { critical, serious, moderate, minor } = SEVERITY_WEIGHTS
  return {
    weights: { critical, serious, moderate, minor },
    headings: {
      ar: headingsOf('ar'),
      en: headingsOf('en'),
    },
    rules: RULES.map((rule): RuleData => {
      const example = loadRuleExample(rule.id)
      return {
        id: rule.id,
        version: rule.version,
        category: rule.category,
        severity: rule.severity,
        manual: rule.manualCheck === true,
        wcag: [...(rule.wcag ?? [])],
        reads: ruleReads(rule),
        weight: rule.manualCheck === true ? 0 : SEVERITY_WEIGHTS[rule.severity],
        example:
          example === null
            ? null
            : {
                lang: example.lang,
                wrong: highlight(example.wrong, example.lang, 'wrong'),
                right: highlight(example.right, example.lang, 'right'),
              },
        tools: TOOLS.filter((tool) => tool.rules.includes(rule.id)).map((tool) => tool.slug),
        near: RULES.filter((other) => other.category === rule.category && other !== rule)
          .slice(0, NEAR)
          .map((other) => other.id),
        copy: { ar: copyData(rule.copy.ar), en: copyData(rule.copy.en) },
      }
    }),
  }
}
