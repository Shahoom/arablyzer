import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'no-title' | 'no-language'

/**
 * A PDF the page links with no document title, or no document language (docs/design/plans/
 * arabic-native.md §10): readers show the file name instead of a title, and screen readers do not
 * know the text is Arabic. One finding for each PDF and each missing item. Asked only in a tool's
 * scan (needs `pdfs`). Minor.
 */
export const rule = defineRule({
  id: 'pdf-metadata',
  version: '1.0.0',
  category: 'ar-content',
  severity: 'minor',
  needs: ['pdfs'],
  messages: ['no-title', 'no-language'],
  appliesTo: (_page, evidence) =>
    (evidence?.outside?.pdfs?.files ?? []).some((file) => file.outcome === 'read'),
  detect: ({ outside }): DetectorFinding<Message>[] =>
    (outside?.pdfs?.files ?? []).flatMap((file) =>
      file.issues.flatMap((issue): DetectorFinding<Message>[] =>
        issue.kind === 'no-title' || issue.kind === 'no-language'
          ? [
              {
                message: issue.kind,
                values: { url: file.url },
                url: file.url,
                snippet: file.url,
                key: `${file.url}#${issue.kind}`,
              },
            ]
          : [],
      ),
    ),
})
