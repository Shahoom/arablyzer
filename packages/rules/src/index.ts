import type { Rule } from './rule'

/** Bumped whenever a rule is added, removed or changes version. */
export const RULESET_VERSION = '0.1.0'

/** Every rule, sorted by id. */
export const RULES: readonly Rule[] = []

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
