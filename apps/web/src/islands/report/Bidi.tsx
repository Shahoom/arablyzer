import type { Lang } from '@arablyzer/seo/site'
import { Fragment } from 'preact'
import { isolateLatin, revealControls } from '../../lib/bidi'

/** Text in the page's language; in Arabic, its Latin words and code isolated, as on the site. */
export function Bidi({ text, lang }: { text: string; lang: Lang }) {
  if (lang !== 'ar') return <Revealed text={text} />
  return (
    <>
      {isolateLatin(text).map((part, index) =>
        part.isolate ? (
          <bdi key={index} dir="ltr">
            <Revealed text={part.text} />
          </bdi>
        ) : (
          <Revealed key={index} text={part.text} />
        ),
      )}
    </>
  )
}

/**
 * Text that may quote a page (a finding's message, code or selector), each direction control in
 * it named in a muted colour instead of obeyed (lib/bidi.ts): the page cannot turn our text round.
 */
export function Revealed({ text, muted = 'text-ink-3' }: { text: string; muted?: string }) {
  return (
    <>
      {revealControls(text).map((part, index) =>
        part.control ? (
          <span key={index} dir="ltr" className={`font-mono ${muted}`}>
            {part.text}
          </span>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}
