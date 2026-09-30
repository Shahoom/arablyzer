export type Lang = 'ar' | 'en'

/**
 * Interface copy in both languages. Arabic is the original; `reviewed` turns true once the owner
 * has read it, as for rules (design decision 7), and the arabic-copy CI job waits for it.
 */
export interface Copy<T> {
  readonly reviewed: boolean
  readonly ar: T
  readonly en: T
}

/** Text with `code` in backticks, as the page renders it: plain parts and code parts in turn. */
export function codeParts(text: string): { readonly text: string; readonly code: boolean }[] {
  return text
    .split('`')
    .map((part, index) => ({ text: part, code: index % 2 === 1 }))
    .filter((part) => part.text !== '')
}
