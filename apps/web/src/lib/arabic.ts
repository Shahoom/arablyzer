/** Zero-width joiner: keeps a letter in its joined shape beside a gap. */
const ZWJ = '\u200d'
/** Narrow no-break space: as wide as a thin space, and no line breaks at it. */
const GAP = '\u202f'

/**
 * Letters that join only to the letter before them (Unicode's joining type R): after one of
 * these, the next letter starts a new shape anyway. Hamza (ء) joins neither way.
 */
const JOINS_BEFORE_ONLY = new Set(['آ', 'أ', 'ؤ', 'إ', 'ا', 'ة', 'د', 'ذ', 'ر', 'ز', 'و', 'ٱ'])
const JOINS_NEITHER = new Set(['ء'])

const GRAPHEMES = new Intl.Segmenter('ar', { granularity: 'grapheme' })

/** A grapheme's letter, without the marks written on it. */
function letterOf(grapheme: string): string {
  return grapheme.replace(/\p{M}+/gu, '')
}

function isArabicLetter(grapheme: string): boolean {
  const letter = letterOf(grapheme)
  return /\p{Script=Arabic}/u.test(letter) && /\p{L}/u.test(letter)
}

/**
 * Arabic text as a browser draws it with letter-spacing it should not apply, as pieces: the
 * letters, each keeping its joined shape, and `null` where a gap opens between letters that should
 * touch. A page puts its own element at each `null`, so the gap can open and close (the home
 * page's WebKit row); `drawnWithLetterSpacing` fills each with a fixed gap. The joiners keep each
 * shape, so a letter beside a gap is drawn joined, as when the browser spaces it out.
 */
export function lettersApart(text: string): (string | null)[] {
  // Letters with their marks, so a vowel sign stays on its letter.
  const graphemes = Array.from(GRAPHEMES.segment(text), (part) => part.segment)
  const pieces: (string | null)[] = []
  // What the letter after a gap that joins must start with.
  let before = ''
  graphemes.forEach((grapheme, index) => {
    const next = graphemes[index + 1]
    const apart = next !== undefined && grapheme !== ' ' && next !== ' '
    const joins =
      apart &&
      isArabicLetter(grapheme) &&
      isArabicLetter(next) &&
      !JOINS_BEFORE_ONLY.has(letterOf(grapheme)) &&
      !JOINS_NEITHER.has(letterOf(grapheme)) &&
      !JOINS_NEITHER.has(letterOf(next))
    pieces.push(`${before}${grapheme}${joins ? ZWJ : ''}`)
    before = joins ? ZWJ : ''
    if (apart) pieces.push(null)
  })
  return pieces
}

/**
 * Arabic text as a browser draws it with letter-spacing it should not apply: every letter keeps
 * its joined shape, and a gap opens between letters that should touch. The joiners keep each
 * shape and the no-break gaps open between letters, so a word stays on one line; lines still
 * break between words.
 */
export function drawnWithLetterSpacing(text: string): string {
  return lettersApart(text)
    .map((piece) => piece ?? GAP)
    .join('')
}
