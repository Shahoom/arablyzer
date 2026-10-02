import type { Lang } from '@arablyzer/seo/site'
import { isolateLatin } from '../../lib/bidi'

/** Text in the page's language; in Arabic, its Latin words and code are isolated, as on every page. */
export function Bidi({ text, lang }: { text: string; lang: Lang }) {
  if (lang !== 'ar') return <>{text}</>
  return (
    <>
      {isolateLatin(text).map((part, index) =>
        part.isolate ? (
          <bdi key={index} dir="ltr">
            {part.text}
          </bdi>
        ) : (
          part.text
        ),
      )}
    </>
  )
}
