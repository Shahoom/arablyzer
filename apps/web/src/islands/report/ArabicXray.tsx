import { NATIVE } from '@arablyzer/i18n/native'
import type { Report, XrayFact } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { Revealed } from './Bidi'

const ENGINE_NAMES = { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' } as const

type Engine = XrayFact['engines'][number]

/**
 * A circle round a word: a white ring under a coloured one, so it shows on any page. The strokes
 * keep their width on the screen (3 px, 6 px under it) whatever the picture is scaled to, so a
 * desktop's shot, drawn small, is circled as clearly as a phone's.
 */
function Circles({ engine }: { engine: Engine }) {
  return (
    <svg
      viewBox={`0 0 ${String(engine.viewport.width)} ${String(engine.viewport.height)}`}
      className="absolute inset-0 size-full text-serious"
      aria-hidden="true"
    >
      {engine.words.map((word) => {
        const cx = word.box.x + word.box.width / 2
        const cy = word.box.y + word.box.height / 2
        const rx = word.box.width / 2 + 9
        const ry = word.box.height / 2 + 8
        return (
          <g key={`${String(word.box.x)}-${String(word.box.y)}`} fill="none">
            <ellipse
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              stroke="#fff"
              strokeWidth="6"
              vectorEffect="non-scaling-stroke"
            />
            <ellipse
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              stroke="currentColor"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </svg>
  )
}

/**
 * The Arabic X-ray: the first screen as each engine drew it, with the broken Arabic words circled
 * (boxes drawn here over the stored picture), and the Arabic integrity, the share of Arabic words
 * drawn correctly across the engines. Draws nothing when the report holds no X-ray.
 */
export function ArabicXray({
  report,
  lang,
  standalone = false,
}: {
  report: Report
  lang: Lang
  /** On the report page, a card of its own; inside a tool's result, a section of it. */
  standalone?: boolean
}) {
  const fact = report.facts.xray
  if (fact === undefined) return null
  const t = NATIVE[lang].xray
  const anyBroken = fact.engines.some((engine) => engine.broken > 0)
  return (
    <section
      aria-labelledby="xray-title"
      className={`flex flex-col gap-3 p-card ${standalone ? 'card rounded-card' : 'border-b border-line'}`}
    >
      <h3 id="xray-title" className="heading-3 m-0">
        {t.title}
      </h3>
      {fact.percent !== null && (
        <p className="m-0 text-body font-semibold">{t.integrity(fact.percent)}</p>
      )}
      <p className="m-0 text-small text-ink-2">{anyBroken ? t.intro : t.clean}</p>
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3">
        {fact.engines.map((engine) => {
          const name = ENGINE_NAMES[engine.engine]
          const hidden = engine.broken - engine.words.length
          return (
            <li key={engine.engine} className="flex flex-col gap-2">
              <h4 className="m-0 text-body font-semibold">{name}</h4>
              <p className="m-0 text-small text-ink-2">
                {t.engineLine(engine.broken, engine.total)}
              </p>
              {engine.image !== null && (
                <div className="relative overflow-hidden rounded-card border border-line">
                  <img
                    src={engine.image}
                    width={engine.viewport.width}
                    height={engine.viewport.height}
                    alt={t.imageAlt(name)}
                    className="block h-auto w-full"
                  />
                  <Circles engine={engine} />
                </div>
              )}
              {engine.words.length > 0 && (
                <div className="flex flex-col gap-1">
                  {engine.image === null && <p className="m-0 text-meta text-ink-3">{t.noImage}</p>}
                  <p className="m-0 text-meta text-ink-3">{t.words}</p>
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    {engine.words.map((word) => (
                      <li
                        key={`${String(word.box.x)}-${String(word.box.y)}`}
                        className="chip"
                        title={t.kinds[word.kind]}
                      >
                        <span dir="rtl" lang="ar">
                          <Revealed text={word.text} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {hidden > 0 && <p className="m-0 text-meta text-ink-3">{t.elsewhere(hidden)}</p>}
              {engine.truncated && <p className="m-0 text-meta text-ink-3">{t.truncated}</p>}
            </li>
          )
        })}
      </ul>
      <p className="m-0 text-meta text-ink-3">{t.note}</p>
    </section>
  )
}
