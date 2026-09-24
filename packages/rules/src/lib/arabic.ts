import type { PageFacts } from '@arablyzer/collectors'

/** More than half of the letters in the page's visible text are Arabic-script letters. */
export function isMostlyArabic(page: PageFacts): boolean {
  const letters = page.text?.letters
  return letters !== undefined && letters.arabic * 2 > letters.total
}
