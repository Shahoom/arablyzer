import type { Rule } from './rule'
import { rule as arDigitsMixed } from './rules/ar-digits-mixed/rule'
import { rule as arFontFallback } from './rules/ar-font-fallback/rule'
import { rule as arFontNoArabic } from './rules/ar-font-no-arabic/rule'
import { rule as arHtmlLang } from './rules/ar-html-lang/rule'
import { rule as arLatinPunctuation } from './rules/ar-latin-punctuation/rule'
import { rule as arLetterSpacing } from './rules/ar-letter-spacing/rule'
import { rule as arMojibake } from './rules/ar-mojibake/rule'
import { rule as arTatweel } from './rules/ar-tatweel/rule'
import { rule as canonicalConflict } from './rules/canonical-conflict/rule'
import { rule as formArabicNameRejected } from './rules/form-arabic-name-rejected/rule'
import { rule as h1Missing } from './rules/h1-missing/rule'
import { rule as hreflangInvalidCode } from './rules/hreflang-invalid-code/rule'
import { rule as jsonldSyntaxError } from './rules/jsonld-syntax-error/rule'
import { rule as metaDescriptionMissing } from './rules/meta-description-missing/rule'
import { rule as ogTagsMissing } from './rules/og-tags-missing/rule'
import { rule as pageNoindex } from './rules/page-noindex/rule'
import { rule as priceDecimals } from './rules/price-decimals/rule'
import { rule as productOfferInvalid } from './rules/product-offer-invalid/rule'
import { rule as robotsBlocksAiSearch } from './rules/robots-blocks-ai-search/rule'
import { rule as robotsBlocksGooglebot } from './rules/robots-blocks-googlebot/rule'
import { rule as rtlBidiIsolation } from './rules/rtl-bidi-isolation/rule'
import { rule as rtlHorizontalOverflow } from './rules/rtl-horizontal-overflow/rule'
import { rule as rtlHtmlDir } from './rules/rtl-html-dir/rule'
import { rule as titleMissing } from './rules/title-missing/rule'
import { rule as viewportMissing } from './rules/viewport-missing/rule'
import { rule as whatsappLinkFormat } from './rules/whatsapp-link-format/rule'

/** Bumped whenever a rule is added, removed or changes version. */
export const RULESET_VERSION = '0.3.0'

/** Every rule, sorted by id. */
export const RULES: readonly Rule[] = [
  arDigitsMixed,
  arFontFallback,
  arFontNoArabic,
  arHtmlLang,
  arLatinPunctuation,
  arLetterSpacing,
  arMojibake,
  arTatweel,
  canonicalConflict,
  formArabicNameRejected,
  h1Missing,
  hreflangInvalidCode,
  jsonldSyntaxError,
  metaDescriptionMissing,
  ogTagsMissing,
  pageNoindex,
  priceDecimals,
  productOfferInvalid,
  robotsBlocksAiSearch,
  robotsBlocksGooglebot,
  rtlBidiIsolation,
  rtlHorizontalOverflow,
  rtlHtmlDir,
  titleMissing,
  viewportMissing,
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
