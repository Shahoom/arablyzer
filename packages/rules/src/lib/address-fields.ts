import type { FieldElement } from '@arablyzer/collectors'
import { fieldTexts, identifierWords } from './form-fields'

// Which fields of a form take an address or a person's contact details, for the checkout rules
// (M6.1). A field is told by what its `autocomplete`, its name and id, and its label say, in
// Arabic and in English.

export type ContactPurpose =
  'name' | 'email' | 'tel' | 'street-address' | 'address-level2' | 'postal-code'

/** The autocomplete tokens that name an address part. */
export const ADDRESS_AUTOCOMPLETE: ReadonlySet<string> = new Set([
  'street-address',
  'address-line1',
  'address-line2',
  'address-line3',
  'address-level1',
  'address-level2',
  'address-level3',
  'address-level4',
])

const ADDRESS_WORDS = new Set([
  'address',
  'street',
  'city',
  'town',
  'district',
  'neighborhood',
  'neighbourhood',
  'area',
  'region',
  'province',
  'state',
  'governorate',
  'locality',
  'wilayat',
  'building',
])
const NOT_ADDRESS_WORDS = new Set([
  'email',
  'mail',
  'ip',
  'url',
  'web',
  'website',
  'wallet',
  'billing_email',
  'country',
  'phone',
  'tel',
  'mobile',
  'search',
  'code',
  'zip',
  'postal',
  'postcode',
])
/** «العنوان»، «الشارع»، «المدينة»، «الحي»، «المنطقة»، «المحافظة»، «الولاية»، "address", "street", "city". */
const ADDRESS_TEXT =
  /(?<!\p{L})(?:ال)?(?:عنوان|شارع|مدينة|حي|منطقة|محافظة|ولاية|قرية)(?!\p{L})|\b(?:address|street|city|town|district|neighbou?rhood|area|governorate|province)\b/iu
const NOT_ADDRESS_TEXT =
  /البريد|الإلكتروني|الرمز|هاتف|جوال|جوّال|\b(?:e-?mail|ip|url|website|phone|mobile|postal|zip)\b/iu

/** The words of a field's name and id with a trailing number off: address1 gives address. */
function words(field: FieldElement): string[] {
  return identifierWords(field).map((word) => word.replace(/\d+$/, ''))
}

/** A text field that takes a place: a street, a city, a district, an address line. */
export function isAddressField(field: FieldElement): boolean {
  if (field.tag !== 'input' && field.tag !== 'textarea') return false
  if (!['text', 'search', 'textarea'].includes(field.type)) return false
  const named = words(field)
  if (named.some((word) => NOT_ADDRESS_WORDS.has(word))) return false
  if (fieldTexts(field).some((text) => NOT_ADDRESS_TEXT.test(text))) return false
  return (
    field.autocomplete.some((token) => ADDRESS_AUTOCOMPLETE.has(token)) ||
    named.some((word) => ADDRESS_WORDS.has(word)) ||
    fieldTexts(field).some((text) => ADDRESS_TEXT.test(text))
  )
}

const NAME_WORDS = new Set([
  'name',
  'fullname',
  'firstname',
  'lastname',
  'fname',
  'lname',
  'surname',
])
const NAME_TEXT =
  /(?<!\p{L})(?:ال)?اسم(?:ك|كم)?(?!\p{L})|\b(?:full name|first name|last name|your name)\b/iu
const PHONE_WORDS = new Set(['phone', 'tel', 'telephone', 'mobile', 'whatsapp', 'cell'])
const PHONE_TEXT = /هاتف|جوال|جوّال|\b(?:phone|mobile|telephone)\b/iu
const EMAIL_TEXT = /البريد|\b(?:e-?mail)\b/iu
const POSTAL_WORDS = new Set(['zip', 'postal', 'postcode', 'zipcode'])
const POSTAL_TEXT = /الرمز البريدي|\b(?:postal code|zip code|post code|zip)\b/iu
const CITY_WORDS = new Set(['city', 'town'])
const CITY_TEXT = /(?<!\p{L})(?:ال)?مدينة(?!\p{L})|\b(?:city|town)\b/iu
/** A name that is not a person's: a company, a user, a card holder. */
const OTHER_NAME_WORDS = new Set([
  'user',
  'username',
  'login',
  'company',
  'business',
  'card',
  'cardholder',
  'product',
  'file',
  'domain',
  'store',
  'shop',
  'coupon',
  'promo',
  'passport',
])
const OTHER_NAME_TEXT =
  /المستخدم|الشركة|المؤسسة|المنتج|البطاقة|الكوبون|جواز|\b(?:user|username|company|business|card|product|coupon|promo|passport)\b/iu

/**
 * The contact detail a field asks for, when it is clearly one: a name, an email, a phone, a
 * street, a city or a postal code. WCAG 1.3.5 (Identify Input Purpose) names the autocomplete
 * token each one has.
 */
export function purposeOf(field: FieldElement): ContactPurpose | null {
  if (field.tag === 'select') return null
  const named = words(field)
  const texts = fieldTexts(field)
  if (field.type === 'email') return 'email'
  if (field.type === 'tel') return 'tel'
  if (!['text', 'search', 'textarea', 'email', 'tel'].includes(field.type)) return null
  if (named.some((word) => PHONE_WORDS.has(word)) || texts.some((text) => PHONE_TEXT.test(text))) {
    return 'tel'
  }
  if (
    named.includes('email') ||
    named.includes('mail') ||
    texts.some((text) => EMAIL_TEXT.test(text))
  ) {
    return 'email'
  }
  if (
    named.some((word) => POSTAL_WORDS.has(word)) ||
    texts.some((text) => POSTAL_TEXT.test(text))
  ) {
    return 'postal-code'
  }
  if (isAddressField(field)) {
    return named.some((word) => CITY_WORDS.has(word)) || texts.some((text) => CITY_TEXT.test(text))
      ? 'address-level2'
      : 'street-address'
  }
  const isName =
    named.some((word) => NAME_WORDS.has(word)) || texts.some((text) => NAME_TEXT.test(text))
  const other =
    named.some((word) => OTHER_NAME_WORDS.has(word)) ||
    texts.some((text) => OTHER_NAME_TEXT.test(text))
  return isName && !other ? 'name' : null
}
