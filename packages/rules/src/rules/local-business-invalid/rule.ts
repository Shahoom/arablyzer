import {
  entries,
  isArray,
  isEmpty,
  isObject,
  objects,
  placeProblems,
  shown,
  type JsonObject,
  type Located,
  type Problem,
} from '../../lib/jsonld-objects'
import { topObjects } from '../../lib/product-offers'
import { defineRule, type DetectorFinding } from '../../rule'

const MESSAGES = [
  'no-name',
  'no-address',
  'telephone-arabic-digits',
  'telephone-no-country',
  'hours-invalid',
  'geo-invalid',
] as const
type Message = (typeof MESSAGES)[number]

/** LocalBusiness and the types of it that shops, cafés and clinics use (Schema.org 30.1). */
const BUSINESS_TYPES: ReadonlySet<string> = new Set([
  'LocalBusiness',
  'Store',
  'GroceryStore',
  'ClothingStore',
  'ElectronicsStore',
  'FurnitureStore',
  'HomeGoodsStore',
  'JewelryStore',
  'ShoeStore',
  'BookStore',
  'PetStore',
  'DepartmentStore',
  'ConvenienceStore',
  'Florist',
  'Restaurant',
  'CafeOrCoffeeShop',
  'Bakery',
  'FastFoodRestaurant',
  'BarOrPub',
  'HealthAndBeautyBusiness',
  'BeautySalon',
  'HairSalon',
  'NailSalon',
  'DaySpa',
  'Dentist',
  'MedicalBusiness',
  'MedicalClinic',
  'Pharmacy',
  'AutoRepair',
  'AutomotiveBusiness',
  'FinancialService',
  'RealEstateAgent',
  'TravelAgency',
  'LodgingBusiness',
  'Hotel',
])

const EASTERN_ARABIC = /[٠-٩۰-۹٫٬]/
const ARABIC_SCRIPT = /[؀-ۿ]/
const DAYS =
  /^(?:https?:\/\/schema\.org\/)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|PublicHolidays)$/
/** A time as Schema.org writes it (ISO 8601): 09:00, 9:00:00, or 24:00 for midnight. */
const TIME = /^(?:(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?|24:00(?::00)?)$/
const COORDINATE = /^-?\d+(?:\.\d+)?$/

/**
 * M6.1: what Google needs of a business's markup (a name and an address) and the details a Gulf
 * site gets wrong in it: a telephone in Eastern Arabic digits or without its country code, opening
 * hours written with Arabic day names («السبت») or Arabic digits where Schema.org wants its
 * English day names and 24-hour times, and coordinates with Eastern Arabic digits or a comma.
 * Only the businesses a page describes of itself (the top of a block or its @graph) are judged.
 */
export const rule = defineRule({
  id: 'local-business-invalid',
  version: '1.0.0',
  category: 'schema',
  severity: 'moderate',
  needs: ['html'],
  messages: MESSAGES,
  appliesTo: (page) => topObjects(page, BUSINESS_TYPES).length > 0,
  detect: ({ page }) =>
    placeProblems(topObjects(page, BUSINESS_TYPES).flatMap(problemsOf)).map(
      (finding): DetectorFinding<Message> => finding,
    ),
})

function problemsOf(business: Located<JsonObject>): Problem<Message>[] {
  const problems: Problem<Message>[] = []
  const given = (object: typeof business, property: string) =>
    entries(object, property).filter((entry) => !isEmpty(entry.value))

  if (given(business, 'name').length === 0) {
    problems.push({ message: 'no-name', at: business, values: {} })
  }
  const addresses = given(business, 'address')
  const hasAddress = addresses.some((entry) => {
    const address = entry.value
    if (!isObject(address)) return typeof address === 'string'
    return ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode'].some(
      (key) => !isEmpty(address[key] ?? null),
    )
  })
  if (!hasAddress) problems.push({ message: 'no-address', at: business, values: {} })

  for (const entry of given(business, 'telephone')) {
    const value = typeof entry.value === 'string' ? entry.value.trim() : ''
    if (EASTERN_ARABIC.test(value)) {
      problems.push({
        message: 'telephone-arabic-digits',
        at: entry,
        values: { telephone: shown(value) },
      })
    } else if (value !== '' && !/^(?:\+|00)/.test(value)) {
      problems.push({
        message: 'telephone-no-country',
        at: entry,
        values: { telephone: shown(value) },
      })
    }
  }

  for (const specification of objects(entries(business, 'openingHoursSpecification'))) {
    for (const entry of given(specification, 'dayOfWeek')) {
      const days = isArray(entry.value) ? entry.value : [entry.value]
      for (const day of days) {
        if (typeof day !== 'string' || !DAYS.test(day.trim())) {
          problems.push({
            message: 'hours-invalid',
            at: entry,
            values: { property: 'dayOfWeek', value: shown(day ?? null) },
          })
        }
      }
    }
    for (const property of ['opens', 'closes']) {
      for (const entry of given(specification, property)) {
        if (typeof entry.value !== 'string' || !TIME.test(entry.value.trim())) {
          problems.push({
            message: 'hours-invalid',
            at: entry,
            values: { property, value: shown(entry.value) },
          })
        }
      }
    }
  }
  for (const entry of given(business, 'openingHours')) {
    const lines = isArray(entry.value) ? entry.value : [entry.value]
    for (const line of lines) {
      if (typeof line !== 'string' || ARABIC_SCRIPT.test(line)) {
        problems.push({
          message: 'hours-invalid',
          at: entry,
          values: { property: 'openingHours', value: shown(line ?? null) },
        })
      }
    }
  }

  for (const geo of objects(entries(business, 'geo'))) {
    for (const property of ['latitude', 'longitude']) {
      for (const entry of given(geo, property)) {
        const ok =
          typeof entry.value === 'number' ||
          (typeof entry.value === 'string' && COORDINATE.test(entry.value.trim()))
        if (!ok)
          problems.push({
            message: 'geo-invalid',
            at: entry,
            values: { property, value: shown(entry.value) },
          })
      }
    }
  }
  return problems
}
