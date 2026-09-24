/**
 * Languages normally written in Arabic script, by primary language subtag. Sources:
 * - IANA Language Subtag Registry (File-Date 2025-08-25): `Suppress-Script: Arab` (ar, fa, ps, ur)
 *   and the members of those macrolanguages (the Arabic varieties; pes, prs; pbt, pbu, pst).
 * - Unicode CLDR likely subtags that default to Arab (ckb, sd, ug, ks, pnb, skr, azb, bal, sdh,
 *   lrc, mzn, glk, bqi, luz), and ku, whose Sorani form is written in Arabic script.
 * Rare codes are accepted rather than flagged: a wrong verdict on a real Arabic-script language
 * would be worse than missing an unusual mistake.
 */
const ARABIC_SCRIPT_LANGUAGES = new Set([
  // Suppress-Script: Arab
  'ar',
  'fa',
  'ps',
  'ur',
  // Macrolanguage ar
  'aao',
  'abh',
  'abv',
  'acm',
  'acq',
  'acw',
  'acx',
  'acy',
  'adf',
  'aeb',
  'aec',
  'afb',
  'ajp',
  'apc',
  'apd',
  'arb',
  'arq',
  'ars',
  'ary',
  'arz',
  'auz',
  'avl',
  'ayh',
  'ayl',
  'ayn',
  'ayp',
  'bbz',
  'pga',
  'shu',
  'ssh',
  // Macrolanguages fa and ps
  'pes',
  'prs',
  'pbt',
  'pbu',
  'pst',
  // CLDR: Arab by default
  'ckb',
  'sd',
  'ug',
  'ks',
  'pnb',
  'skr',
  'azb',
  'bal',
  'sdh',
  'lrc',
  'mzn',
  'glk',
  'bqi',
  'luz',
  'ku',
])

/** Language + region pairs whose CLDR likely script is Arab although the language's is not. */
const ARABIC_SCRIPT_REGIONS = new Set(['pa-pk', 'uz-af', 'az-ir'])

/**
 * Whether a language tag (BCP 47, leniently: `_` is read as `-`) names text written in Arabic
 * script. An explicit script subtag decides: `ms-Arab` is Arabic script, `ar-Latn` is not.
 */
export function isArabicScriptLanguage(tag: string): boolean {
  const subtags = tag.trim().toLowerCase().split(/[-_]/)
  const [language = '', ...rest] = subtags
  const script = rest.find((subtag) => /^[a-z]{4}$/.test(subtag))
  if (script !== undefined) return script === 'arab'
  const region = rest.find((subtag) => /^[a-z]{2}$/.test(subtag))
  if (region !== undefined && ARABIC_SCRIPT_REGIONS.has(`${language}-${region}`)) return true
  return ARABIC_SCRIPT_LANGUAGES.has(language)
}
