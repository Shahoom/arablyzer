import type { Rule } from './rule'
import { rule as arHtmlLang } from './rules/ar-html-lang/rule'
import { rule as arLatinPunctuation } from './rules/ar-latin-punctuation/rule'
import { rule as arLetterSpacing } from './rules/ar-letter-spacing/rule'
import { rule as canonicalConflict } from './rules/canonical-conflict/rule'
import { rule as hreflangInvalidCode } from './rules/hreflang-invalid-code/rule'
import { rule as jsonldSyntaxError } from './rules/jsonld-syntax-error/rule'
import { rule as pageNoindex } from './rules/page-noindex/rule'
import { rule as robotsBlocksAiSearch } from './rules/robots-blocks-ai-search/rule'
import { rule as robotsBlocksGooglebot } from './rules/robots-blocks-googlebot/rule'
import { rule as rtlHtmlDir } from './rules/rtl-html-dir/rule'
import { rule as whatsappLinkFormat } from './rules/whatsapp-link-format/rule'

/** Bumped whenever a rule is added, removed or changes version. */
export const RULESET_VERSION = '0.2.0'

/** Every rule, sorted by id. */
export const RULES: readonly Rule[] = [
  arHtmlLang,
  arLatinPunctuation,
  arLetterSpacing,
  canonicalConflict,
  hreflangInvalidCode,
  jsonldSyntaxError,
  pageNoindex,
  robotsBlocksAiSearch,
  robotsBlocksGooglebot,
  rtlHtmlDir,
  whatsappLinkFormat,
]

export function ruleById(id: string): Rule | undefined {
  return RULES.find((rule) => rule.id === id)
}

export {
  loadRuleCopy,
  parseRuleCopy,
  placeholders,
  renderMessage,
  SECTION_HEADINGS,
  type Lang,
  type RuleCopy,
  type RuleCopySections,
} from './copy'
export { AI_CRAWLERS, type AiCrawler, type AiCrawlerPurpose } from './lib/ai-crawlers'
export {
  crawlerAccess,
  matchRobots,
  patternMatches,
  robotsPath,
  type CrawlerAccess,
  type RobotsMatch,
} from './lib/robots'
export {
  defineRule,
  type CollectorId,
  type DetectorFinding,
  type Evidence,
  type Rule,
  type RuleDefinition,
} from './rule'
