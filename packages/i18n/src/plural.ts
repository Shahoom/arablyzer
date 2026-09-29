const ARABIC = new Intl.PluralRules('ar')
const ENGLISH = new Intl.PluralRules('en')

/**
 * The forms Arabic gives a counted noun. `{n}` stands for the number; zero and hundreds take the
 * form of 11 to 99 ("0 قاعدة", "100 قاعدة"), as in writing.
 */
export interface ArabicForms {
  readonly one: string
  readonly two: string
  /** 3 to 10, and 103 to 110… */
  readonly few: string
  /** 11 to 99, and 0 and 100… unless `other` is given. */
  readonly many: string
  /** 100, 101, 102…, where the noun is not in the accusative: «100 طلب». */
  readonly other?: string
}

export function arabicCount(count: number, forms: ArabicForms): string {
  const category = ARABIC.select(count)
  const form =
    category === 'one'
      ? forms.one
      : category === 'two'
        ? forms.two
        : category === 'few'
          ? forms.few
          : category === 'other' && forms.other !== undefined
            ? forms.other
            : forms.many
  return form.replaceAll('{n}', String(count))
}

/** The English form a count gives a noun, without the number: "Rule:", "Rules:". */
export function englishForm(count: number, one: string, other: string): string {
  return ENGLISH.select(count) === 'one' ? one : other
}

export function englishCount(count: number, one: string, other: string): string {
  return `${count} ${englishForm(count, one, other)}`
}

/** Rules as the subject of a sentence: «فشلت 3 قواعد»، «نجحت قاعدتان». */
export const RULES_NOMINATIVE: ArabicForms = {
  one: 'قاعدة واحدة',
  two: 'قاعدتان',
  few: '{n} قواعد',
  many: '{n} قاعدة',
}

/** Requests, as a count on its own: «طلب واحد»، «3 طلبات»، «12 طلباً»، «100 طلب». */
export const REQUESTS: ArabicForms = {
  one: 'طلب واحد',
  two: 'طلبان',
  few: '{n} طلبات',
  many: '{n} طلباً',
  other: '{n} طلب',
}

/** Minutes after a preposition: «بعد دقيقتين»، «بعد 5 دقائق». */
export const MINUTES_GENITIVE: ArabicForms = {
  one: 'دقيقة',
  two: 'دقيقتين',
  few: '{n} دقائق',
  many: '{n} دقيقة',
}
