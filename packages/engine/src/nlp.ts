import {
  askNlpTexts,
  NLP_MAX_TEXT_CHARS,
  NLP_MAX_TEXTS,
  NLP_MAX_TOTAL_CHARS,
  type NlpOptions,
  type NlpRun,
  type NlpWants,
  type PageFacts,
} from '@arablyzer/collectors'

/**
 * The Arabic NLP service (services/arabic-nlp, docs/design/plans/m7-deep-arabic.md): the page's
 * visible Arabic text goes to it after the page is rendered, and it answers with the spelling slips
 * it is sure of and the dialect model's reading. It runs beside the scanner on the internal `scan`
 * network, so it is not reached through the egress proxy; the address is the operator's
 * (ARABLYZER_NLP_URL), never a visitor's. A scan never fails because of it: a service that is
 * down, slow or full is a notice, and the rules that need it do not apply. The client is in
 * @arablyzer/collectors, which the worker's text check uses too.
 */
export {
  forgetNlpFailures,
  NLP_MIN_CONFIDENCE,
  NLP_REST_MS,
  NLP_TIMEOUT_MS,
  type NlpOptions,
  type NlpRun,
  type NlpWants,
} from '@arablyzer/collectors'

const ARABIC_LETTER = /[\u0621-\u064a\u0671-\u06d3]/g

/** The visible Arabic text of a page as the service gets it: one text for each text node. */
export function nlpTexts(page: PageFacts): { texts: string[]; capped: boolean } {
  const texts: string[] = []
  const seen = new Set<string>()
  let total = 0
  let capped = false
  for (const segment of page.text?.segments ?? []) {
    if (segment.code) continue
    let text = segment.text.replace(/\s+/g, ' ').trim()
    if ((text.match(ARABIC_LETTER)?.length ?? 0) < 3 || seen.has(text)) continue
    if (text.length > NLP_MAX_TEXT_CHARS) {
      text = text.slice(0, NLP_MAX_TEXT_CHARS)
      capped = true
    }
    if (texts.length >= NLP_MAX_TEXTS || total + text.length > NLP_MAX_TOTAL_CHARS) {
      capped = true
      break
    }
    seen.add(text)
    texts.push(text)
    total += text.length
  }
  return { texts, capped }
}

export async function askNlp(
  page: PageFacts,
  options: NlpOptions,
  wants: NlpWants,
  signal?: AbortSignal,
): Promise<NlpRun> {
  const { texts, capped } = nlpTexts(page)
  return askNlpTexts(texts, options, wants, capped, signal)
}
