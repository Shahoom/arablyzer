import type { ToolDefinition } from './tool'
import { definition as accessibilityCheck } from './tools/accessibility-check/tool'
import { definition as aiAccess } from './tools/ai-access/tool'
import { definition as aiCrawlerCheck } from './tools/ai-crawler-check/tool'
import { definition as aiReadabilityCheck } from './tools/ai-readability-check/tool'
import { definition as aiTrainingFilter } from './tools/ai-training-filter/tool'
import { definition as aiVisibility } from './tools/ai-visibility/tool'
import { definition as anchorTextCheck } from './tools/anchor-text-check/tool'
import { definition as arabicCheckoutTest } from './tools/arabic-checkout-test/tool'
import { definition as arabicEncodingCheck } from './tools/arabic-encoding-check/tool'
import { definition as arabicFontCheck } from './tools/arabic-font-check/tool'
import { definition as arabicFontSlimmer } from './tools/arabic-font-slimmer/tool'
import { definition as arabicFormTest } from './tools/arabic-form-test/tool'
import { definition as arabicPunctuationCheck } from './tools/arabic-punctuation-check/tool'
import { definition as arabicShapingCheck } from './tools/arabic-shaping-check/tool'
import { definition as arabicSuggest } from './tools/arabic-suggest/tool'
import { definition as bidiIsolationCheck } from './tools/bidi-isolation-check/tool'
import { definition as brandNameCheck } from './tools/brand-name-check/tool'
import { definition as breadcrumbCheck } from './tools/breadcrumb-check/tool'
import { definition as brokenLinks } from './tools/broken-links/tool'
import { definition as canonicalCheck } from './tools/canonical-check/tool'
import { definition as carouselDirectionCheck } from './tools/carousel-direction-check/tool'
import { definition as commonMisspellings } from './tools/common-misspellings/tool'
import { definition as contactReachability } from './tools/contact-reachability/tool'
import { definition as coreWebVitals } from './tools/core-web-vitals/tool'
import { definition as countryFit } from './tools/country-fit/tool'
import { definition as cruxByCountry } from './tools/crux-by-country/tool'
import { definition as digitsConsistency } from './tools/digits-consistency/tool'
import { definition as emailSecurity } from './tools/email-security/tool'
import { definition as feedCheck } from './tools/feed-check/tool'
import { definition as feedFileCheck } from './tools/feed-file-check/tool'
import { definition as fontFallbackCheck } from './tools/font-fallback-check/tool'
import { definition as freshnessCheck } from './tools/freshness-check/tool'
import { definition as gscKeywords } from './tools/gsc-keywords/tool'
import { definition as headingStructure } from './tools/heading-structure/tool'
import { definition as hreflangCheck } from './tools/hreflang-check/tool'
import { definition as hreflangGenerator } from './tools/hreflang-generator/tool'
import { definition as imageAltCheck } from './tools/image-alt-check/tool'
import { definition as imageWeight } from './tools/image-weight/tool'
import { definition as indexabilityCheck } from './tools/indexability-check/tool'
import { definition as jsRenderingCheck } from './tools/js-rendering-check/tool'
import { definition as languageCheck } from './tools/language-check/tool'
import { definition as letterSpacingCheck } from './tools/letter-spacing-check/tool'
import { definition as localBusinessCheck } from './tools/local-business-check/tool'
import { definition as logicalCssCheck } from './tools/logical-css-check/tool'
import { definition as lookalikeDomains } from './tools/lookalike-domains/tool'
import { definition as mirroredIconsCheck } from './tools/mirrored-icons-check/tool'
import { definition as mixedContent } from './tools/mixed-content/tool'
import { definition as ogImageCheck } from './tools/og-image-check/tool'
import { definition as paginationCheck } from './tools/pagination-check/tool'
import { definition as paymentMethodsDetector } from './tools/payment-methods-detector/tool'
import { definition as pdfForensics } from './tools/pdf-forensics/tool'
import { definition as phoneFormatCheck } from './tools/phone-format-check/tool'
import { definition as platformCheck } from './tools/platform-check/tool'
import { definition as policyPagesCheck } from './tools/policy-pages-check/tool'
import { definition as priceFormatCheck } from './tools/price-format-check/tool'
import { definition as productPageCheck } from './tools/product-page-check/tool'
import { definition as productSchemaCheck } from './tools/product-schema-check/tool'
import { definition as redirectChainCheck } from './tools/redirect-chain-check/tool'
import { definition as robotsCheck } from './tools/robots-check/tool'
import { definition as robotsTester } from './tools/robots-tester/tool'
import { definition as rtlCheck } from './tools/rtl-check/tool'
import { definition as rtlOverflowCheck } from './tools/rtl-overflow-check/tool'
import { definition as schemaGenerator } from './tools/schema-generator/tool'
import { definition as searchSpellingTest } from './tools/search-spelling-test/tool'
import { definition as securityHeaders } from './tools/security-headers/tool'
import { definition as serpSampler } from './tools/serp-sampler/tool'
import { definition as sitemapCheck } from './tools/sitemap-check/tool'
import { definition as socialPreview } from './tools/social-preview/tool'
import { definition as soft404Check } from './tools/soft-404-check/tool'
import { definition as storeHreflangCheck } from './tools/store-hreflang-check/tool'
import { definition as structuredDataCheck } from './tools/structured-data-check/tool'
import { definition as tatweelCheck } from './tools/tatweel-check/tool'
import { definition as titleMetaCheck } from './tools/title-meta-check/tool'
import { definition as tlsCheck } from './tools/tls-check/tool'
import { definition as urlParametersCheck } from './tools/url-parameters-check/tool'
import { definition as viewportCheck } from './tools/viewport-check/tool'
import { definition as whatsappLinkCheck } from './tools/whatsapp-link-check/tool'
import { definition as whatsappLinkGenerator } from './tools/whatsapp-link-generator/tool'
import { definition as whatsappMessageCheck } from './tools/whatsapp-message-check/tool'

/**
 * Every tool without its page's copy, sorted by slug: what the API checks a tool's slug against,
 * and what the scanner reads a tool's rules from, neither of which reads the copy files.
 */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  accessibilityCheck,
  aiAccess,
  aiCrawlerCheck,
  aiReadabilityCheck,
  aiTrainingFilter,
  aiVisibility,
  anchorTextCheck,
  arabicCheckoutTest,
  arabicEncodingCheck,
  arabicFontCheck,
  arabicFontSlimmer,
  arabicFormTest,
  arabicPunctuationCheck,
  arabicShapingCheck,
  arabicSuggest,
  bidiIsolationCheck,
  brandNameCheck,
  breadcrumbCheck,
  brokenLinks,
  canonicalCheck,
  carouselDirectionCheck,
  commonMisspellings,
  contactReachability,
  coreWebVitals,
  countryFit,
  cruxByCountry,
  digitsConsistency,
  emailSecurity,
  feedCheck,
  feedFileCheck,
  fontFallbackCheck,
  freshnessCheck,
  gscKeywords,
  headingStructure,
  hreflangCheck,
  hreflangGenerator,
  imageAltCheck,
  imageWeight,
  indexabilityCheck,
  jsRenderingCheck,
  languageCheck,
  letterSpacingCheck,
  localBusinessCheck,
  logicalCssCheck,
  lookalikeDomains,
  mirroredIconsCheck,
  mixedContent,
  ogImageCheck,
  paginationCheck,
  paymentMethodsDetector,
  pdfForensics,
  phoneFormatCheck,
  platformCheck,
  policyPagesCheck,
  priceFormatCheck,
  productPageCheck,
  productSchemaCheck,
  redirectChainCheck,
  robotsCheck,
  robotsTester,
  rtlCheck,
  rtlOverflowCheck,
  schemaGenerator,
  searchSpellingTest,
  securityHeaders,
  serpSampler,
  sitemapCheck,
  socialPreview,
  soft404Check,
  storeHreflangCheck,
  structuredDataCheck,
  tatweelCheck,
  titleMetaCheck,
  tlsCheck,
  urlParametersCheck,
  viewportCheck,
  whatsappLinkCheck,
  whatsappLinkGenerator,
  whatsappMessageCheck,
]

export function toolDefinition(slug: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((tool) => tool.slug === slug)
}
