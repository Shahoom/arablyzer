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

/**
 * An Arabic letter (with its harakat), tatweel, and another Arabic letter: a join stretched with
 * tatweel. Tatweel (U+0640) itself belongs to the Common script, so it never counts as a letter.
 * In Quranic (Uthmani) spelling tatweel carries a superscript alef, a hamza or a small waw or ya
 * («ٱلرَّحْمَـٰنِ»): there it is a seat for the mark, not stretching.
 */
export const STRETCHED_WORD =
  /(?=\p{L})\p{Script=Arabic}[\u064b-\u065f\u0670]*\u0640+(?![\u0654\u0655\u0670\u06e5\u06e6])[\u064b-\u0653\u0656-\u065f]*(?=\p{L})\p{Script=Arabic}/u
