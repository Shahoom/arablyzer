import { codeParts } from '@arablyzer/i18n/copy'
import type { Lang } from '@arablyzer/seo/site'
import { Bidi } from './Bidi'

/**
 * A line of the site's own text with `code` in backticks: the code left to right and set apart,
 * the rest as Bidi sets it. A rule's quote of what it judges is code, which the site's rules for
 * Arabic text (tatweel, digits) leave alone, as they must a page that is about them.
 */
export function Rich({ text, lang }: { text: string; lang: Lang }) {
  return (
    <>
      {codeParts(text).map((part, index) =>
        part.code ? (
          <code
            key={index}
            dir="ltr"
            className="rounded-xs bg-surface-2 px-2 py-px font-mono text-[0.875em] [overflow-wrap:anywhere]"
          >
            {part.text}
          </code>
        ) : (
          <Bidi key={index} text={part.text} lang={lang} />
        ),
      )}
    </>
  )
}
