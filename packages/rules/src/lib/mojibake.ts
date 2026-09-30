import { decodeWindows1252 } from '@arablyzer/collectors'

/**
 * Arabic that was decoded in the wrong encoding shows as Latin-1 letters: UTF-8 read as
 * Windows-1252 gives «Ù…Ù†ØªØ¬», Windows-1256 read as Windows-1252 gives «ÇáÚÑÈíÉ». A word counts only
 * when encoding it back gives Arabic letters and no Latin ones, so French or Spanish words stay out.
 */
export type MojibakeSource = 'utf-8' | 'windows-1256'

export interface GarbledRun {
  readonly source: MojibakeSource
  /** Offset of the run's first word in the text. */
  readonly start: number
  /** The garbled words, one space apart. */
  readonly found: string
  /** The same words, decoded as they were written. */
  readonly recovered: string
}

/** At most this many words in a run: enough to show the problem. */
export const MAX_RUN_WORDS = 8
/** A run of one word needs this many Arabic letters, so a stray «ÆØÅ» is not enough. */
const MIN_SINGLE_WORD_LETTERS = 4

/** Windows-1252 as WHATWG decodes it, each character back to its byte (a one-to-one table). */
const WINDOWS_1252 = new Map<string, number>()
for (let byte = 0; byte < 256; byte++) {
  WINDOWS_1252.set(decodeWindows1252(new Uint8Array([byte])), byte)
}
const UTF8 = new TextDecoder('utf-8', { fatal: true })
const WINDOWS_1256 = new TextDecoder('windows-1256')

/** Any UTF-16 code unit past ASCII (astral characters show as surrogates). */
const NON_ASCII = /[\u0080-\uffff]/
const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/u
const ARABIC_LETTERS = /(?=\p{L})\p{Script=Arabic}/gu
const LATIN_LETTER = /\p{Script=Latin}/u
/** Ø Ù Ú Û: how the first bytes of UTF-8 Arabic (U+0600–U+06FF) read in Windows-1252. */
const UTF8_LEAD = /[Ø-Û]/
/** Alef and lam: Arabic text of two words or more has one of them (ال), Danish «ÆØÅ æøå» has neither. */
const ALEF_OR_LAM = /[\u0627\u0644]/

interface Recovered {
  readonly source: MojibakeSource
  readonly text: string
  readonly letters: number
}

/** The first run of garbled Arabic words in a text, or null. Linear in the text's length. */
export function firstGarbledRun(text: string): GarbledRun | null {
  let run: {
    source: MojibakeSource
    start: number
    found: string[]
    recovered: string[]
    letters: number
  } | null = null
  for (const match of text.matchAll(/\S+/gu)) {
    const word = match[0]
    const [before, core, after] = splitPunctuation(word)
    const recovered = recover(core)
    if (recovered !== null && (run === null || run.source === recovered.source)) {
      run ??= { source: recovered.source, start: match.index, found: [], recovered: [], letters: 0 }
      run.found.push(word)
      run.recovered.push(`${before}${recovered.text}${after}`)
      run.letters += recovered.letters
      if (run.found.length < MAX_RUN_WORDS) continue
    }
    if (run !== null && plausible(run)) return finish(run)
    run = null
    if (recovered !== null) {
      run = {
        source: recovered.source,
        start: match.index,
        found: [word],
        recovered: [`${before}${recovered.text}${after}`],
        letters: recovered.letters,
      }
    }
  }
  return run !== null && plausible(run) ? finish(run) : null
}

function plausible(run: {
  source: MojibakeSource
  found: readonly string[]
  recovered: readonly string[]
  letters: number
}): boolean {
  if (run.source === 'windows-1256' && !run.recovered.some((word) => ALEF_OR_LAM.test(word))) {
    return false
  }
  return run.found.length > 1 || run.letters >= MIN_SINGLE_WORD_LETTERS
}

/** A word's leading and trailing ASCII punctuation, and what is between: «(Ù…Ù†ØªØ¬)،». */
function splitPunctuation(word: string): [before: string, core: string, after: string] {
  let start = 0
  while (start < word.length && isAsciiPunctuation(word.charCodeAt(start))) start++
  let end = word.length
  while (end > start && isAsciiPunctuation(word.charCodeAt(end - 1))) end--
  return [word.slice(0, start), word.slice(start, end), word.slice(end)]
}

function isAsciiPunctuation(code: number): boolean {
  return (
    (code >= 0x21 && code <= 0x2f) ||
    (code >= 0x3a && code <= 0x40) ||
    (code >= 0x5b && code <= 0x60) ||
    (code >= 0x7b && code <= 0x7e)
  )
}

function finish(run: {
  source: MojibakeSource
  start: number
  found: string[]
  recovered: string[]
}): GarbledRun {
  return {
    source: run.source,
    start: run.start,
    found: run.found.join(' '),
    recovered: run.recovered.join(' '),
  }
}

/** The word's Arabic, when it is Arabic decoded as Windows-1252; null otherwise. */
function recover(word: string): Recovered | null {
  if (word === '' || !NON_ASCII.test(word) || ARABIC_LETTER.test(word)) return null
  const bytes = bytesOf(word)
  if (bytes === null) return null
  if (UTF8_LEAD.test(word)) {
    try {
      const text = UTF8.decode(bytes)
      const letters = arabicLetters(text)
      if (letters >= 2) return { source: 'utf-8', text, letters }
    } catch {
      // Not UTF-8: try Windows-1256 below.
    }
  }
  const text = WINDOWS_1256.decode(bytes)
  const letters = arabicLetters(text)
  return letters >= 2 ? { source: 'windows-1256', text, letters } : null
}

/** Arabic letters in a decoded word; 0 when any Latin letter is left, as in a real Latin word. */
function arabicLetters(text: string): number {
  if (LATIN_LETTER.test(text)) return 0
  return text.match(ARABIC_LETTERS)?.length ?? 0
}

function bytesOf(word: string): Uint8Array | null {
  const bytes: number[] = []
  for (const char of word) {
    const byte = WINDOWS_1252.get(char)
    if (byte === undefined) return null
    bytes.push(byte)
  }
  return new Uint8Array(bytes)
}
