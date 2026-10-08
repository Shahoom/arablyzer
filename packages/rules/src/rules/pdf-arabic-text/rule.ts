import type { PdfIssueKind } from '@arablyzer/collectors'
import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'reversed' | 'presentation-forms' | 'no-unicode-map' | 'image-only'

const KINDS: readonly PdfIssueKind[] = [
  'reversed',
  'presentation-forms',
  'no-unicode-map',
  'image-only',
]

/**
 * The Arabic of a PDF the page links, as a machine reads it (docs/design/plans/arabic-native.md
 * §10): the tool fetches up to 3 PDFs (15 MB each, through the egress rules, where robots.txt lets
 * the bot) and pdf.js reads their text. A finding for each PDF and each of four problems: the
 * words come out letter-reversed (visual order), the letters are presentation forms instead of base
 * letters, the font has no Unicode map (the text is private-use or Latin-1 garbage), or the pages
 * have no text layer (scans). Asked only in a tool's scan (needs `pdfs`). Moderate.
 */
export const rule = defineRule({
  id: 'pdf-arabic-text',
  version: '1.0.0',
  category: 'ar-content',
  severity: 'moderate',
  needs: ['pdfs'],
  messages: ['reversed', 'presentation-forms', 'no-unicode-map', 'image-only'],
  appliesTo: (_page, evidence) =>
    (evidence?.outside?.pdfs?.files ?? []).some((file) => file.outcome === 'read'),
  detect: ({ outside }): DetectorFinding<Message>[] =>
    (outside?.pdfs?.files ?? []).flatMap((file) =>
      file.issues
        .filter((issue) => KINDS.includes(issue.kind))
        .map((issue): DetectorFinding<Message> => ({
          message: issue.kind as Message,
          values: {
            url: file.url,
            percent: Math.round(issue.measure * 100),
            example: issue.example,
            pages: file.pagesRead,
          },
          url: file.url,
          snippet: issue.example,
          key: `${file.url}#${issue.kind}`,
        })),
    ),
})
