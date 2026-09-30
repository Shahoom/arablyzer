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
  /** 11 to 99, 0, 100… */
  readonly many: string
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
          : forms.many
  return form.replaceAll('{n}', String(count))
}

export function englishCount(count: number, one: string, other: string): string {
  return `${count} ${ENGLISH.select(count) === 'one' ? one : other}`
}

/** Rules as the subject of a sentence: «فشلت 3 قواعد»، «نجحت قاعدتان». */
export const RULES_NOMINATIVE: ArabicForms = {
  one: 'قاعدة واحدة',
  two: 'قاعدتان',
  few: '{n} قواعد',
  many: '{n} قاعدة',
}

/** Minutes after a preposition: «بعد دقيقتين»، «بعد 5 دقائق». */
export const MINUTES_GENITIVE: ArabicForms = {
  one: 'دقيقة',
  two: 'دقيقتين',
  few: '{n} دقائق',
  many: '{n} دقيقة',
}
