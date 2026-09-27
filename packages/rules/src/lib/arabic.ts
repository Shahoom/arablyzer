import type { PageFacts } from '@arablyzer/collectors'

/** More than half of the letters in the page's visible text are Arabic-script letters. */
export function isMostlyArabic(page: PageFacts): boolean {
  const letters = page.text?.letters
  return letters !== undefined && letters.arabic * 2 > letters.total
}

/** The page declares Arabic in <html lang>, or most of its visible letters are Arabic-script. */
export function isArabicPage(page: PageFacts): boolean {
  return /^ar(?:-|$)/i.test(page.html?.root.lang?.trim() ?? '') || isMostlyArabic(page)
}
