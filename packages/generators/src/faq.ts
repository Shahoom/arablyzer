import { escapeHtml } from './html'

// The FAQ markup generator (M10.2): questions and answers as text the page shows and as the
// FAQPage markup that says the same words, so the faq-schema-mismatch rule finds nothing to say.

export interface FaqItem {
  readonly question: string
  readonly answer: string
}

/** "س:" and "ج:" (and "سؤال" / "جواب" / "الجواب", "Q:" / "A:") at the start of a line, as people write them. */
const QUESTION_MARK = /^\s*(?:سؤال|س|question|q)\s*[:：.\-)]\s*/iu
const ANSWER_MARK = /^\s*(?:الجواب|جواب|الإجابة|إجابة|ج|answer|a)\s*[:：.\-)]\s*/iu

/**
 * Blocks separated by an empty line: the first line is the question, the rest the answer. A
 * block of one line has no answer and is left out.
 */
export function parseFaq(input: string): FaqItem[] {
  return input.split(/\r?\n\s*\r?\n/).flatMap((block) => {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '')
    const [first, ...rest] = lines
    if (first === undefined || rest.length === 0) return []
    const question = first.replace(QUESTION_MARK, '').trim()
    const answer = rest
      .map((line, index) => (index === 0 ? line.replace(ANSWER_MARK, '') : line))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    return question === '' || answer === '' ? [] : [{ question, answer }]
  })
}

export interface FaqMarkup {
  /** What the page shows. */
  readonly html: string
  /** The `<script type="application/ld+json">` block. */
  readonly jsonLd: string
}

export function faqMarkup(items: readonly FaqItem[]): FaqMarkup {
  const html = [
    '<section class="faq">',
    ...items.map(
      ({ question, answer }) =>
        `  <details>\n    <summary>${escapeHtml(question)}</summary>\n    <p>${escapeHtml(answer)}</p>\n  </details>`,
    ),
    '</section>',
  ].join('\n')
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  }
  // "<" as an escape: a "</script>" in a question cannot end the block.
  const json = JSON.stringify(data, null, 2).replaceAll('<', '\\u003c')
  return { html, jsonLd: `<script type="application/ld+json">\n${json}\n</script>` }
}
