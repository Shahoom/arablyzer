import { isMostlyArabic } from '../../lib/arabic'
import { isArabicScriptLanguage } from '../../lib/language-script'
import { defineRule } from '../../rule'

export const rule = defineRule({
  id: 'ar-html-lang',
  version: '1.0.0',
  category: 'intl',
  severity: 'serious',
  wcag: ['3.1.1'],
  needs: ['html', 'text'],
  messages: ['missing', 'not-arabic-script'],
  appliesTo: isMostlyArabic,
  detect: ({ page }) => {
    const root = page.html?.root
    const letters = page.text?.letters
    if (root === undefined || letters === undefined) return []
    const declared = root.lang?.trim() ?? ''
    if (declared !== '' && isArabicScriptLanguage(declared)) return []
    // Screen readers go by the lang attribute; the meta pragma is reported as context only.
    const contentLanguage =
      page.html?.metas.find((meta) => meta.httpEquiv === 'content-language')?.content ?? null
    return [
      {
        message: declared === '' ? 'missing' : 'not-arabic-script',
        values: {
          declaredLang: root.lang,
          arabicLetters: letters.arabic,
          latinLetters: letters.latin,
          totalLetters: letters.total,
          ...(contentLanguage === null ? {} : { contentLanguageMeta: contentLanguage }),
        },
        selector: root.selector,
        ...(root.snippet === null ? {} : { snippet: root.snippet }),
        ...(root.location === null ? {} : { location: root.location }),
      },
    ]
  },
})
