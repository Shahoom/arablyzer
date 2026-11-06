import { POSTAL_CODES } from '@arablyzer/rules/locale-format'

// The local business generator (M10.2): a LocalBusiness block for a Gulf business, with its two
// names, an address with an ISO country and a postal code of its country's shape, a telephone with
// its country code, hours in Schema.org's English day names and 24-hour times, and coordinates as
// numbers. What it writes passes the local-business-invalid and address-schema-gulf rules.

export const BUSINESS_TYPES = [
  'LocalBusiness',
  'Store',
  'Restaurant',
  'CafeOrCoffeeShop',
  'Bakery',
  'Pharmacy',
  'Dentist',
  'BeautySalon',
  'AutoRepair',
] as const
export type BusinessType = (typeof BUSINESS_TYPES)[number]

export const COUNTRIES = {
  SA: '966',
  AE: '971',
  OM: '968',
  KW: '965',
  BH: '973',
  QA: '974',
} as const
export type Country = keyof typeof COUNTRIES

export interface LocalBusinessInput {
  readonly type: string
  readonly nameAr: string
  readonly nameEn: string
  readonly country: string
  readonly city: string
  readonly street: string
  readonly postalCode: string
  readonly telephone: string
  readonly url: string
  readonly image: string
  /** Lines such as `السبت-الخميس 09:00-21:00` or `Fri 16:00-22:00`. */
  readonly hours: string
  readonly latitude: string
  readonly longitude: string
}

export type LocalBusinessProblem =
  | 'name-blank'
  | 'telephone-bad'
  | 'postal-shape'
  | 'hours-line'
  | 'geo-bad'
  | 'url-bad'
  | 'image-bad'

export interface LocalBusinessResult {
  readonly jsonLd: string
  readonly problems: readonly { readonly problem: LocalBusinessProblem; readonly input: string }[]
}

const western = (text: string) =>
  text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/٫/g, '.')
    .replace(/٬/g, '')

/** Saturday first, as the week starts in most of the Gulf; a range walks forward round the week. */
const WEEK = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const
type Day = (typeof WEEK)[number]

const DAY_NAMES: readonly (readonly [Day, readonly string[]])[] = [
  ['Saturday', ['السبت', 'sat', 'saturday']],
  ['Sunday', ['الأحد', 'الاحد', 'sun', 'sunday']],
  ['Monday', ['الإثنين', 'الاثنين', 'mon', 'monday']],
  ['Tuesday', ['الثلاثاء', 'tue', 'tues', 'tuesday']],
  ['Wednesday', ['الأربعاء', 'الاربعاء', 'wed', 'wednesday']],
  ['Thursday', ['الخميس', 'thu', 'thur', 'thurs', 'thursday']],
  ['Friday', ['الجمعة', 'fri', 'friday']],
]

function dayOf(token: string): Day | null {
  const name = token.trim().toLowerCase()
  return DAY_NAMES.find(([, names]) => names.includes(name))?.[0] ?? null
}

function daysOf(text: string): Day[] | null {
  const days: Day[] = []
  for (const part of text.split(/\s*[,،]\s*|\s+و(?=\S)\s*/u)) {
    if (part.trim() === '') continue
    const ends = part.split(/\s*[-–—]\s*|\s+(?:إلى|الى|to)\s+/iu)
    if (ends.length > 2) return null
    const from = dayOf(ends[0] ?? '')
    const to = dayOf(ends[1] ?? ends[0] ?? '')
    if (from === null || to === null) return null
    let at = WEEK.indexOf(from)
    for (let guard = 0; guard < 7; guard++) {
      const day = WEEK[at % 7]
      if (day !== undefined && !days.includes(day)) days.push(day)
      if (WEEK[at % 7] === to) break
      at++
    }
  }
  return days.length === 0 ? null : days
}

const TIME = /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/

const pad = (n: string) => n.padStart(2, '0')

function hoursOf(line: string): { dayOfWeek: Day[]; opens: string; closes: string } | null {
  const text = western(line).trim()
  const time = TIME.exec(text)
  if (time === null) return null
  const [, oh = '', om = '', ch = '', cm = ''] = time
  const closes24 = ch === '24' && cm === '00'
  if (Number(oh) > 23 || (Number(ch) > 23 && !closes24) || Number(om) > 59 || Number(cm) > 59)
    return null
  const dayOfWeek = daysOf(text.slice(0, time.index).trim())
  if (dayOfWeek === null) return null
  return { dayOfWeek, opens: `${pad(oh)}:${om}`, closes: `${pad(ch)}:${cm}` }
}

function absolute(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return /^https?:$/.test(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export function localBusiness(input: LocalBusinessInput): LocalBusinessResult {
  const problems: { problem: LocalBusinessProblem; input: string }[] = []
  const nameAr = input.nameAr.trim()
  const nameEn = input.nameEn.trim()
  if (nameAr === '' && nameEn === '') problems.push({ problem: 'name-blank', input: '' })
  const country = (input.country in COUNTRIES ? input.country : 'SA') as Country

  const digits = western(input.telephone).replace(/[^\d+]/g, '')
  let telephone: string | null = null
  if (digits !== '') {
    const plain = digits.replace(/^\+/, '').replace(/^00/, '')
    const calling = COUNTRIES[country]
    const full =
      digits.startsWith('+') || digits.startsWith('00')
        ? plain
        : `${calling}${plain.replace(/^0+/, '')}`
    if (/^\d{8,15}$/.test(full)) telephone = `+${full}`
    else problems.push({ problem: 'telephone-bad', input: input.telephone.trim() })
  }

  let postalCode: string | null = null
  const postal = western(input.postalCode).trim()
  if (postal !== '') {
    const shape = POSTAL_CODES[country]
    if (shape === undefined || shape.pattern.test(postal)) postalCode = postal
    else problems.push({ problem: 'postal-shape', input: postal })
  }

  const specification: { dayOfWeek: Day[]; opens: string; closes: string }[] = []
  for (const raw of input.hours.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    const parsed = hoursOf(line)
    if (parsed === null) problems.push({ problem: 'hours-line', input: line })
    else specification.push(parsed)
  }

  let geo: { latitude: number; longitude: number } | null = null
  const latitude = western(input.latitude).trim().replace(',', '.')
  const longitude = western(input.longitude).trim().replace(',', '.')
  if (latitude !== '' || longitude !== '') {
    const lat = Number(latitude)
    const lng = Number(longitude)
    if (
      latitude !== '' &&
      longitude !== '' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      geo = { latitude: lat, longitude: lng }
    } else
      problems.push({
        problem: 'geo-bad',
        input: `${input.latitude.trim()}, ${input.longitude.trim()}`,
      })
  }

  const url = input.url.trim() === '' ? null : absolute(input.url)
  if (input.url.trim() !== '' && url === null)
    problems.push({ problem: 'url-bad', input: input.url.trim() })
  const image = input.image.trim() === '' ? null : absolute(input.image)
  if (input.image.trim() !== '' && image === null)
    problems.push({ problem: 'image-bad', input: input.image.trim() })

  const type = (BUSINESS_TYPES as readonly string[]).includes(input.type)
    ? input.type
    : 'LocalBusiness'
  const address = {
    '@type': 'PostalAddress',
    ...(input.street.trim() === '' ? {} : { streetAddress: input.street.trim() }),
    ...(input.city.trim() === '' ? {} : { addressLocality: input.city.trim() }),
    ...(postalCode === null ? {} : { postalCode }),
    addressCountry: country,
  }
  const data = {
    '@context': 'https://schema.org',
    '@type': type,
    name: nameAr === '' ? nameEn : nameAr,
    ...(nameAr !== '' && nameEn !== '' ? { alternateName: nameEn } : {}),
    ...(url === null ? {} : { url }),
    ...(image === null ? {} : { image }),
    address,
    ...(telephone === null ? {} : { telephone }),
    ...(geo === null ? {} : { geo: { '@type': 'GeoCoordinates', ...geo } }),
    ...(specification.length === 0
      ? {}
      : {
          openingHoursSpecification: specification.map((entry) => ({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: entry.dayOfWeek,
            opens: entry.opens,
            closes: entry.closes,
          })),
        }),
  }
  const json = JSON.stringify(data, null, 2).replaceAll('<', '\\u003c')
  return { jsonLd: `<script type="application/ld+json">\n${json}\n</script>`, problems }
}
