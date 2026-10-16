/**
 * The countries of the sample frame (docs/design/plans/m9-state-of-arabic-web.md §2): the Arab
 * country-code top-level domains, nothing else. A site belongs to the country of its domain's last
 * label, whatever its server's address or its visitors are.
 */
export interface Country {
  /** The domain's last label, which is also the country's two-letter code (`ps` is Palestine). */
  readonly code: string
  readonly ar: string
  readonly en: string
}

export const COUNTRIES: readonly Country[] = [
  { code: 'sa', ar: 'السعودية', en: 'Saudi Arabia' },
  { code: 'ae', ar: 'الإمارات', en: 'United Arab Emirates' },
  { code: 'eg', ar: 'مصر', en: 'Egypt' },
  { code: 'kw', ar: 'الكويت', en: 'Kuwait' },
  { code: 'qa', ar: 'قطر', en: 'Qatar' },
  { code: 'bh', ar: 'البحرين', en: 'Bahrain' },
  { code: 'om', ar: 'عُمان', en: 'Oman' },
  { code: 'jo', ar: 'الأردن', en: 'Jordan' },
  { code: 'ma', ar: 'المغرب', en: 'Morocco' },
  { code: 'dz', ar: 'الجزائر', en: 'Algeria' },
  { code: 'tn', ar: 'تونس', en: 'Tunisia' },
  { code: 'iq', ar: 'العراق', en: 'Iraq' },
  { code: 'lb', ar: 'لبنان', en: 'Lebanon' },
  { code: 'ly', ar: 'ليبيا', en: 'Libya' },
  { code: 'sy', ar: 'سوريا', en: 'Syria' },
  { code: 'ye', ar: 'اليمن', en: 'Yemen' },
  { code: 'sd', ar: 'السودان', en: 'Sudan' },
  { code: 'ps', ar: 'فلسطين', en: 'Palestine' },
  { code: 'mr', ar: 'موريتانيا', en: 'Mauritania' },
]

export const COUNTRY_CODES: readonly string[] = COUNTRIES.map((country) => country.code)
const BY_CODE: ReadonlyMap<string, Country> = new Map(COUNTRIES.map((c) => [c.code, c]))

export function countryByCode(code: string): Country | undefined {
  return BY_CODE.get(code)
}

/** The country of a domain name: its last label, when that is one of the frame's; else null. */
export function countryOfDomain(domain: string): string | null {
  const last = domain.slice(domain.lastIndexOf('.') + 1)
  return BY_CODE.has(last) ? last : null
}
