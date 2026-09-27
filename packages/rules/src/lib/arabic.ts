import type { PageFacts } from '@arablyzer/collectors'
import { isArabicLanguage, isArabicScriptLanguage } from './language-script'

/** More than half of the letters in the page's visible text are Arabic-script letters. */
export function isMostlyArabic(page: PageFacts): boolean {
  const letters = page.text?.letters
  return letters !== undefined && letters.arabic * 2 > letters.total
}

/**
 * Most visible letters are Arabic-script, and the page does not declare another language written in
 * that script, such as Persian or Urdu, whose digits and letters differ from Arabic's.
 */
export function isArabicText(page: PageFacts): boolean {
  const lang = page.html?.root.lang?.trim() ?? ''
  return isMostlyArabic(page) && (isArabicLanguage(lang) || !isArabicScriptLanguage(lang))
}

/** The page declares Arabic in <html lang>, or its text is Arabic (a page's lang can be wrong). */
export function isArabicPage(page: PageFacts): boolean {
  return isArabicLanguage(page.html?.root.lang ?? '') || isArabicText(page)
}
