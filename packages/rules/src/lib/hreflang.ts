import { ISO_15924_SCRIPTS, ISO_3166_1_REGIONS, ISO_639_1_LANGUAGES } from './iso-codes'

export type HreflangProblem =
  | 'underscore'
  | 'unknown-language'
  | 'unknown-script'
  | 'unknown-region'
  | 'uk-region'
  | 'malformed'

export interface HreflangCheck {
  readonly problem: HreflangProblem
  /** The subtag at fault, when one is. */
  readonly subtag: string | null
  /** A corrected code, when the fix is mechanical. */
  readonly suggestion: string | null
}

const malformed: HreflangCheck = { problem: 'malformed', subtag: null, suggestion: null }

/**
 * Google's supported forms: `x-default`, or an ISO 639-1 language, then an optional ISO 15924
 * script, then an optional ISO 3166-1 alpha-2 region; case-insensitive. Other codes, such as
 * es-419, are named as unsupported.
 */
export function checkHreflang(value: string): HreflangCheck | null {
  const code = value.trim()
  if (code.toLowerCase() === 'x-default') return null
  if (code.includes('_')) {
    const hyphenated = code.replaceAll('_', '-')
    return {
      problem: 'underscore',
      subtag: null,
      suggestion: checkHreflang(hyphenated) === null ? hyphenated : null,
    }
  }
  const parts = code.split('-')
  if (parts.some((part) => !/^[A-Za-z0-9]+$/.test(part))) return malformed
  const [language = '', ...rest] = parts
  if (!/^[A-Za-z]{2,3}$/.test(language)) return malformed
  let next = 0
  const script = /^[A-Za-z]{4}$/.test(rest[next] ?? '') ? rest[next++] : undefined
  const region = /^(?:[A-Za-z]{2,3}|\d{3})$/.test(rest[next] ?? '') ? rest[next++] : undefined
  if (next !== rest.length) return malformed

  if (!ISO_639_1_LANGUAGES.has(language.toLowerCase())) {
    return { problem: 'unknown-language', subtag: language, suggestion: null }
  }
  if (script !== undefined && !ISO_15924_SCRIPTS.has(script.toLowerCase())) {
    return { problem: 'unknown-script', subtag: script, suggestion: null }
  }
  if (region?.toUpperCase() === 'UK') {
    // The United Kingdom's ISO 3166-1 code is GB; UK is only reserved.
    const suggestion = [language, script, 'GB'].filter((part) => part !== undefined).join('-')
    return { problem: 'uk-region', subtag: region, suggestion }
  }
  if (region !== undefined && !ISO_3166_1_REGIONS.has(region.toLowerCase())) {
    return { problem: 'unknown-region', subtag: region, suggestion: null }
  }
  return null
}
