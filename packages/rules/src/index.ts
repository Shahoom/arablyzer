import type { Rule } from './rule'
import { rule as a11yButtonName } from './rules/a11y-button-name/rule'
import { rule as a11yColorContrast } from './rules/a11y-color-contrast/rule'
import { rule as a11yColorContrastReview } from './rules/a11y-color-contrast-review/rule'
import { rule as a11yImageAlt } from './rules/a11y-image-alt/rule'
import { rule as a11yLinkName } from './rules/a11y-link-name/rule'
import { rule as a11yValidLang } from './rules/a11y-valid-lang/rule'
import { rule as aiTrainingFilters } from './rules/ai-training-filters/rule'
import { rule as arAiReadability } from './rules/ar-ai-readability/rule'
import { rule as arDigitsMixed } from './rules/ar-digits-mixed/rule'
import { rule as arFontFallback } from './rules/ar-font-fallback/rule'
import { rule as arFontMissingLetters } from './rules/ar-font-missing-letters/rule'
import { rule as arFontNoArabic } from './rules/ar-font-no-arabic/rule'
import { rule as arFontSubsetSavings } from './rules/ar-font-subset-savings/rule'
import { rule as arHtmlLang } from './rules/ar-html-lang/rule'
import { rule as arLatinPunctuation } from './rules/ar-latin-punctuation/rule'
import { rule as arLetterSpacing } from './rules/ar-letter-spacing/rule'
import { rule as arMojibake } from './rules/ar-mojibake/rule'
import { rule as arTatweel } from './rules/ar-tatweel/rule'
import { rule as botChallenge } from './rules/bot-challenge/rule'
import { rule as brandNameConsistency } from './rules/brand-name-consistency/rule'
import { rule as canonicalConflict } from './rules/canonical-conflict/rule'
import { rule as countryFit } from './rules/country-fit/rule'
import { rule as cspMissing } from './rules/csp-missing/rule'
import { rule as cwvClsPoor } from './rules/cwv-cls-poor/rule'
import { rule as cwvInpPoor } from './rules/cwv-inp-poor/rule'
import { rule as cwvLcpPoor } from './rules/cwv-lcp-poor/rule'
import { rule as dialectRegister } from './rules/dialect-register/rule'
import { rule as dmarcMissing } from './rules/dmarc-missing/rule'
import { rule as formArabicDigitsRejected } from './rules/form-arabic-digits-rejected/rule'
import { rule as formArabicNameRejected } from './rules/form-arabic-name-rejected/rule'
import { rule as formLabelMissing } from './rules/form-label-missing/rule'
import { rule as formPhoneDirection } from './rules/form-phone-direction/rule'
import { rule as frameProtectionMissing } from './rules/frame-protection-missing/rule'
import { rule as h1Missing } from './rules/h1-missing/rule'
import { rule as hreflangInvalidCode } from './rules/hreflang-invalid-code/rule'
import { rule as hstsMissing } from './rules/hsts-missing/rule'
import { rule as httpsMissing } from './rules/https-missing/rule'
import { rule as imageFormatLegacy } from './rules/image-format-legacy/rule'
import { rule as jsOnlyContent } from './rules/js-only-content/rule'
import { rule as jsonldSyntaxError } from './rules/jsonld-syntax-error/rule'
import { rule as knowledgeGraphEntity } from './rules/knowledge-graph-entity/rule'
import { rule as linkBroken } from './rules/link-broken/rule'
import { rule as metaDescriptionMissing } from './rules/meta-description-missing/rule'
import { rule as mixedContent } from './rules/mixed-content/rule'
import { rule as ogTagsMissing } from './rules/og-tags-missing/rule'
import { rule as pageNoindex } from './rules/page-noindex/rule'
import { rule as paymentMethods } from './rules/payment-methods/rule'
import { rule as priceDecimals } from './rules/price-decimals/rule'
import { rule as productOfferInvalid } from './rules/product-offer-invalid/rule'
import { rule as platformDetected } from './rules/platform-detected/rule'
import { rule as redirectChain } from './rules/redirect-chain/rule'
import { rule as redirectTemporary } from './rules/redirect-temporary/rule'
import { rule as referrerPolicyMissing } from './rules/referrer-policy-missing/rule'
import { rule as robotsBlocksAiSearch } from './rules/robots-blocks-ai-search/rule'
import { rule as robotsBlocksGooglebot } from './rules/robots-blocks-googlebot/rule'
import { rule as rtlBidiIsolation } from './rules/rtl-bidi-isolation/rule'
import { rule as rtlHorizontalOverflow } from './rules/rtl-horizontal-overflow/rule'
import { rule as rtlHtmlDir } from './rules/rtl-html-dir/rule'
import { rule as rtlIconRole } from './rules/rtl-icon-role/rule'
import { rule as rtlMirroredIcons } from './rules/rtl-mirrored-icons/rule'
import { rule as rtlPhysicalCss } from './rules/rtl-physical-css/rule'
import { rule as safeBrowsingFlagged } from './rules/safe-browsing-flagged/rule'
import { rule as sarSignFont } from './rules/sar-sign-font/rule'
import { rule as searchSpellingVariants } from './rules/search-spelling-variants/rule'
import { rule as sitemapInvalid } from './rules/sitemap-invalid/rule'
import { rule as sitemapMissing } from './rules/sitemap-missing/rule'
import { rule as spfMissing } from './rules/spf-missing/rule'
import { rule as textCompressionMissing } from './rules/text-compression-missing/rule'
import { rule as titleMissing } from './rules/title-missing/rule'
import { rule as tlsExpiring } from './rules/tls-expiring/rule'
import { rule as viewportMissing } from './rules/viewport-missing/rule'
import { rule as whatsappLinkFormat } from './rules/whatsapp-link-format/rule'
import { rule as xContentTypeOptionsMissing } from './rules/x-content-type-options-missing/rule'

export { RULESET_VERSION } from './version'
export {
  BLOCK_TEXT_LENGTH as RENDERED_TEXT_LENGTH,
  MIN_DRAWN_WORDS,
  SCRIPTED_SHARE,
} from './rules/js-only-content/rule'
export { SERVER_RESPONSE_RULES } from './server-rules'

/** Every rule, sorted by id. */
export const RULES: readonly Rule[] = [
  a11yButtonName,
  a11yColorContrast,
  a11yColorContrastReview,
  a11yImageAlt,
  a11yLinkName,
  a11yValidLang,
  aiTrainingFilters,
  arAiReadability,
  arDigitsMixed,
  arFontFallback,
  arFontMissingLetters,
  arFontNoArabic,
  arFontSubsetSavings,
  arHtmlLang,
  arLatinPunctuation,
  arLetterSpacing,
  arMojibake,
  arTatweel,
  botChallenge,
  brandNameConsistency,
  canonicalConflict,
  countryFit,
  cspMissing,
  cwvClsPoor,
  cwvInpPoor,
  cwvLcpPoor,
  dialectRegister,
  dmarcMissing,
  formArabicDigitsRejected,
  formArabicNameRejected,
  formLabelMissing,
  formPhoneDirection,
  frameProtectionMissing,
  h1Missing,
  hreflangInvalidCode,
  hstsMissing,
  httpsMissing,
  imageFormatLegacy,
  jsOnlyContent,
  jsonldSyntaxError,
  knowledgeGraphEntity,
  linkBroken,
  metaDescriptionMissing,
  mixedContent,
  ogTagsMissing,
  pageNoindex,
  paymentMethods,
  platformDetected,
  priceDecimals,
  productOfferInvalid,
  redirectChain,
  redirectTemporary,
  referrerPolicyMissing,
  robotsBlocksAiSearch,
  robotsBlocksGooglebot,
  rtlBidiIsolation,
  rtlHorizontalOverflow,
  rtlHtmlDir,
  rtlIconRole,
  rtlMirroredIcons,
  rtlPhysicalCss,
  safeBrowsingFlagged,
  sarSignFont,
  searchSpellingVariants,
  sitemapInvalid,
  sitemapMissing,
  spfMissing,
  textCompressionMissing,
  titleMissing,
  tlsExpiring,
  viewportMissing,
  whatsappLinkFormat,
  xContentTypeOptionsMissing,
]

export function ruleById(id: string): Rule | undefined {
  return RULES.find((rule) => rule.id === id)
}

/**
 * Whether every one of these rules is information (severity info): they list what a page shows
 * and judge nothing. A tool of such rules reports what it finds, as notes and never as problems,
 * and says "none found" where a tool that judges says the page passes (M2.3c review). A tool's
 * example test and its page both ask, so the answer is one function.
 */
export function reportsOnly(ruleIds: readonly string[]): boolean {
  return ruleIds.length > 0 && ruleIds.every((id) => ruleById(id)?.severity === 'info')
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
export {
  EXAMPLE_LANGS,
  loadRuleExample,
  parseRuleExample,
  type ExampleLang,
  type RuleExample,
} from './example'
export { AI_CRAWLERS, type AiCrawler, type AiCrawlerPurpose } from './lib/ai-crawlers'
export { brandName, type Brand } from './lib/brand'
export { xrayFamilies } from './lib/missing-letters'
export { FINEWEB2, readTraining, trainingText, type FilterCheck } from './lib/ai-training'
export { dialectOfPage, fitsCountry, readDialect, type Dialect, type Variety } from './lib/dialect'
export { isMostlyArabic } from './lib/arabic'
export { inferCountry, readPage } from './lib/country'
export { COUNTRIES, fitOf, NAMES as COUNTRY_NAMES, type Country, type Fit } from './lib/country'
export { isLocalHost } from './lib/hosts'
export { confidenceLevel, detectPlatforms, type Detected, type PlatformKind } from './lib/platforms'
export { PLATFORM_FIXES, platformFix } from './platform-fixes'
export {
  CHALLENGE_SIGNALS,
  challengeOf,
  type Challenge,
  type ChallengeSignal,
} from './lib/challenges'
export { isPublicUrl } from './lib/hosts'
export {
  crawlerAccess,
  matchRobots,
  patternMatches,
  robotsMatcher,
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
