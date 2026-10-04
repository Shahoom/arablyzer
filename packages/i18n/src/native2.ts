import type { Copy } from './copy'

/**
 * The words of the second set of Arabic-native cards (docs/design/plans/arabic-native.md §7 to
 * §14): dialect, look-alike domains, PDF forensics, the AI-training filters, search spelling sets,
 * AI visibility and the per-country Chrome UX data. Arabic is the original and awaits the owner's
 * review.
 */
export type Variety = 'msa' | 'gulf' | 'egyptian' | 'levantine' | 'maghrebi'

export interface Native2Strings {
  readonly dialect: {
    readonly title: string
    readonly varieties: Readonly<Record<Variety, string>>
    readonly headline: (variety: string) => string
    readonly tooLittle: (words: number) => string
    readonly mix: string
    readonly markers: string
    readonly headings: (variety: string) => string
    readonly fits: (country: string) => string
    readonly clashes: (country: string) => string
    readonly note: string
  }
}

export const NATIVE2: Copy<Native2Strings> = {
  reviewed: false,
  ar: {
    dialect: {
      title: 'لهجة النص',
      varieties: {
        msa: 'الفصحى',
        gulf: 'الخليجية',
        egyptian: 'المصرية',
        levantine: 'الشامية',
        maghrebi: 'المغاربية',
      },
      headline: (variety) => `نص الصفحة أقرب إلى ${variety}`,
      tooLittle: (words) => `نص عربي قليل (${String(words)} كلمة) لا يكفي لنحكم على لهجته`,
      mix: 'الكلمات المميِّزة بحسب اللهجة',
      markers: 'كلمات رأيناها',
      headings: (variety) => `العناوين أقرب إلى ${variety}`,
      fits: (country) => `تناسب لهجة النص بلدها (${country})`,
      clashes: (country) => `لا تُحكى هذه اللهجة في ${country}`,
      note: 'عيّنة كلمات مميِّزة لا نموذج لغة؛ ومعلومة لا تُخصم من درجتك.',
    },
  },
  en: {
    dialect: {
      title: 'Dialect of the text',
      varieties: {
        msa: 'Modern Standard',
        gulf: 'Gulf',
        egyptian: 'Egyptian',
        levantine: 'Levantine',
        maghrebi: 'Maghrebi',
      },
      headline: (variety) => `The page's text leans ${variety}`,
      tooLittle: (words) => `Too little Arabic text (${String(words)} words) to judge its dialect`,
      mix: 'Telling words by dialect',
      markers: 'Words seen',
      headings: (variety) => `The headings lean ${variety}`,
      fits: (country) => `The dialect fits the page's country (${country})`,
      clashes: (country) => `This dialect is not the speech of ${country}`,
      note: 'A sample of telling words, not a language model; information, never deducted from your score.',
    },
  },
}
