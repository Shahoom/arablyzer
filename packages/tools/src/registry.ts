import type { ToolDefinition } from './tool'
import { definition as accessibilityCheck } from './tools/accessibility-check/tool'
import { definition as aiAccess } from './tools/ai-access/tool'
import { definition as aiCrawlerCheck } from './tools/ai-crawler-check/tool'
import { definition as aiTrainingFilter } from './tools/ai-training-filter/tool'
import { definition as arabicFontCheck } from './tools/arabic-font-check/tool'
import { definition as arabicFontSlimmer } from './tools/arabic-font-slimmer/tool'
import { definition as arabicFormTest } from './tools/arabic-form-test/tool'
import { definition as arabicPunctuationCheck } from './tools/arabic-punctuation-check/tool'
import { definition as arabicShapingCheck } from './tools/arabic-shaping-check/tool'
import { definition as bidiIsolationCheck } from './tools/bidi-isolation-check/tool'
import { definition as brokenLinks } from './tools/broken-links/tool'
import { definition as canonicalCheck } from './tools/canonical-check/tool'
import { definition as coreWebVitals } from './tools/core-web-vitals/tool'
import { definition as countryFit } from './tools/country-fit/tool'
import { definition as digitsConsistency } from './tools/digits-consistency/tool'
import { definition as emailSecurity } from './tools/email-security/tool'
import { definition as fontFallbackCheck } from './tools/font-fallback-check/tool'
import { definition as headingStructure } from './tools/heading-structure/tool'
import { definition as hreflangCheck } from './tools/hreflang-check/tool'
import { definition as hreflangGenerator } from './tools/hreflang-generator/tool'
import { definition as imageWeight } from './tools/image-weight/tool'
import { definition as indexabilityCheck } from './tools/indexability-check/tool'
import { definition as jsRenderingCheck } from './tools/js-rendering-check/tool'
import { definition as languageCheck } from './tools/language-check/tool'
import { definition as letterSpacingCheck } from './tools/letter-spacing-check/tool'
import { definition as logicalCssCheck } from './tools/logical-css-check/tool'
import { definition as mirroredIconsCheck } from './tools/mirrored-icons-check/tool'
import { definition as mixedContent } from './tools/mixed-content/tool'
import { definition as paymentMethodsDetector } from './tools/payment-methods-detector/tool'
import { definition as phoneFormatCheck } from './tools/phone-format-check/tool'
import { definition as platformCheck } from './tools/platform-check/tool'
import { definition as priceFormatCheck } from './tools/price-format-check/tool'
import { definition as productPageCheck } from './tools/product-page-check/tool'
import { definition as redirectChainCheck } from './tools/redirect-chain-check/tool'
import { definition as robotsCheck } from './tools/robots-check/tool'
import { definition as robotsTester } from './tools/robots-tester/tool'
import { definition as rtlCheck } from './tools/rtl-check/tool'
import { definition as rtlOverflowCheck } from './tools/rtl-overflow-check/tool'
import { definition as schemaGenerator } from './tools/schema-generator/tool'
import { definition as searchSpellingTest } from './tools/search-spelling-test/tool'
import { definition as securityHeaders } from './tools/security-headers/tool'
import { definition as sitemapCheck } from './tools/sitemap-check/tool'
import { definition as socialPreview } from './tools/social-preview/tool'
import { definition as structuredDataCheck } from './tools/structured-data-check/tool'
import { definition as tatweelCheck } from './tools/tatweel-check/tool'
import { definition as titleMetaCheck } from './tools/title-meta-check/tool'
import { definition as tlsCheck } from './tools/tls-check/tool'
import { definition as whatsappLinkCheck } from './tools/whatsapp-link-check/tool'
import { definition as whatsappLinkGenerator } from './tools/whatsapp-link-generator/tool'

/**
 * Every tool without its page's copy, sorted by slug: what the API checks a tool's slug against,
 * and what the scanner reads a tool's rules from, neither of which reads the copy files.
 */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  accessibilityCheck,
  aiAccess,
  aiCrawlerCheck,
  aiTrainingFilter,
  arabicFontCheck,
  arabicFontSlimmer,
  arabicFormTest,
  arabicPunctuationCheck,
  arabicShapingCheck,
  bidiIsolationCheck,
  brokenLinks,
  canonicalCheck,
  coreWebVitals,
  countryFit,
  digitsConsistency,
  emailSecurity,
  fontFallbackCheck,
  headingStructure,
  hreflangCheck,
  hreflangGenerator,
  imageWeight,
  indexabilityCheck,
  jsRenderingCheck,
  languageCheck,
  letterSpacingCheck,
  logicalCssCheck,
  mirroredIconsCheck,
  mixedContent,
  paymentMethodsDetector,
  phoneFormatCheck,
  platformCheck,
  priceFormatCheck,
  productPageCheck,
  redirectChainCheck,
  robotsCheck,
  robotsTester,
  rtlCheck,
  rtlOverflowCheck,
  schemaGenerator,
  searchSpellingTest,
  securityHeaders,
  sitemapCheck,
  socialPreview,
  structuredDataCheck,
  tatweelCheck,
  titleMetaCheck,
  tlsCheck,
  whatsappLinkCheck,
  whatsappLinkGenerator,
]

export function toolDefinition(slug: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((tool) => tool.slug === slug)
}
