import type { FieldElement, PageFacts } from '@arablyzer/collectors'
import { isArabicPage } from '../../lib/arabic'
import {
  fieldTexts,
  hasPattern,
  identifierWords,
  shownPattern,
  type PatternField,
} from '../../lib/form-fields'
import { pageTester } from '../../lib/html-pattern'
import { defineRule } from '../../rule'

/**
 * Arabic names, each with a Latin name of the same shape: the same length and number of words.
 * They cover alef with hamza or madda, hamza on waw and ya, ta marbuta, alef maqsura and spaces.
 * The first one a field rejects is the one its finding shows.
 */
const NAMES: readonly (readonly [arabic: string, latin: string])[] = [
  ['محمد العبري', 'Omar Alabri'],
  ['عبد الله', 'Ali Omar'],
  ['فاطمة', 'Fatma'],
  ['محمد', 'Omar'],
  ['أحمد', 'Omar'],
  ['إياد', 'Omar'],
  ['آمنة', 'Omar'],
  ['يحيى', 'Omar'],
  ['فائز', 'Omar'],
  ['مؤمن', 'Omar'],
  ['عائشة', 'Fatma'],
]
const VALUES = [...new Set(NAMES.flat())]

const NAME_AUTOCOMPLETE = new Set([
  'name',
  'given-name',
  'additional-name',
  'family-name',
  'nickname',
])
const OTHER_AUTOCOMPLETE = new Set([
  'username',
  'organization',
  'cc-name',
  'cc-given-name',
  'cc-additional-name',
  'cc-family-name',
])
const NAME_WORDS = new Set([
  'name',
  'fname',
  'lname',
  'mname',
  'firstname',
  'lastname',
  'middlename',
  'fullname',
  'surname',
  'forename',
  'givenname',
  'familyname',
  'nickname',
])
/** Names that are not a person's own, and names asked for in Latin letters. */
const OTHER_WORDS = new Set([
  'user',
  'username',
  'login',
  'company',
  'business',
  'organization',
  'organisation',
  'org',
  'file',
  'filename',
  'domain',
  'host',
  'server',
  'card',
  'cardholder',
  'holder',
  'cc',
  'product',
  'item',
  'shop',
  'store',
  'site',
  'app',
  'account',
  'display',
  'bank',
  'beneficiary',
  'iban',
  'en',
  'eng',
  'english',
  'latin',
  'passport',
])
/** «الاسم»، «اسم العائلة»، «اسمك», "Full name". */
const NAME_TEXT = /(?<!\p{L})(?:ال)?اسم(?:ك|كم|ه|ي)?(?!\p{L})|\bname\b/iu
const OTHER_TEXT =
  /المستخدم|الدخول|الشركة|المؤسسة|المنشأة|المنتج|البطاقة|حامل|النطاق|المتجر|الموقع|الملف|البنك|المستفيد|الحساب|[إا]نجليزي|اللاتيني|جواز|username|\b(?:user|login|company|business|organi[sz]ation|file|domain|card|holder|product|item|shop|store|site|account|display|bank|beneficiary|english|latin|passport)\b/iu

export const rule = defineRule({
  id: 'form-arabic-name-rejected',
  version: '1.0.0',
  category: 'forms',
  severity: 'serious',
  needs: ['html', 'text'],
  messages: ['rejected'],
  appliesTo: (page) => isArabicPage(page) && nameFields(page).length > 0,
  detect: ({ page }) => {
    if (!isArabicPage(page)) return []
    const test = pageTester()
    return nameFields(page).flatMap((field) => {
      const results = test(field.pattern, VALUES)
      if (typeof results === 'string') return []
      const accepts = (name: string) => results[VALUES.indexOf(name)] === true
      for (const [arabic, latin] of NAMES) {
        if (accepts(arabic)) continue
        const peers = [
          latin,
          ...NAMES.map(([other]) => other).filter((other) => sameShape(other, arabic)),
        ]
        const accepted = peers.find(accepts)
        if (accepted === undefined) continue
        return [
          {
            message: 'rejected' as const,
            values: { name: arabic, accepted, pattern: shownPattern(field.pattern) },
            selector: field.selector,
            ...(field.snippet === null ? {} : { snippet: field.snippet }),
            ...(field.location === null ? {} : { location: field.location }),
          },
        ]
      }
      return []
    })
  },
})

/** Text inputs for a person's name that have a pattern. */
function nameFields(page: PageFacts): PatternField[] {
  return (page.html?.fields ?? []).filter(
    (field): field is PatternField =>
      hasPattern(field) && field.type === 'text' && isNameField(field) && !isOtherName(field),
  )
}

function isNameField(field: FieldElement): boolean {
  return (
    field.autocomplete.some((token) => NAME_AUTOCOMPLETE.has(token)) ||
    identifierWords(field).some((word) => NAME_WORDS.has(word)) ||
    fieldTexts(field).some((text) => NAME_TEXT.test(text))
  )
}

function isOtherName(field: FieldElement): boolean {
  return (
    field.autocomplete.some((token) => OTHER_AUTOCOMPLETE.has(token)) ||
    identifierWords(field).some((word) => OTHER_WORDS.has(word)) ||
    fieldTexts(field).some((text) => OTHER_TEXT.test(text))
  )
}

/** A limit on length or on spaces rejects names of one shape whatever their letters. */
function sameShape(a: string, b: string): boolean {
  return a.length === b.length && a.split(' ').length === b.split(' ').length
}
