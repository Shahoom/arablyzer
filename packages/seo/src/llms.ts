// llms.txt (llmstxt.org): a plain-text map of the site for the language models that read it. It
// says what the site is and where its pages are, once, in English, with each link's page name in
// the language of the page. It describes; it promises nothing about how the site is used.

export interface LlmsLink {
  readonly title: string
  readonly url: string
  readonly note?: string
}

export interface LlmsSection {
  readonly title: string
  readonly links: readonly LlmsLink[]
}

export interface Llms {
  readonly name: string
  /** One sentence: what the site is. */
  readonly summary: string
  /** Paragraphs of plain facts under the summary. */
  readonly details: readonly string[]
  readonly sections: readonly LlmsSection[]
}

/** A link's text must not end the Markdown link it is in. */
function label(text: string): string {
  return text
    .replace(/[[\]\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function llmsTxt(llms: Llms): string {
  if (llms.summary.includes('\n')) throw new TypeError('The summary of llms.txt is one line')
  const lines = [`# ${label(llms.name)}`, '', `> ${llms.summary}`, '']
  for (const paragraph of llms.details) lines.push(paragraph, '')
  for (const section of llms.sections) {
    if (section.links.length === 0) continue
    lines.push(`## ${label(section.title)}`, '')
    for (const link of section.links) {
      if (!link.url.startsWith('https://') || /[\s()]/.test(link.url)) {
        throw new TypeError(
          `llms.txt links are https: URLs without spaces or brackets: ${link.url}`,
        )
      }
      lines.push(
        `- [${label(link.title)}](${link.url})${link.note === undefined ? '' : `: ${link.note}`}`,
      )
    }
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}
