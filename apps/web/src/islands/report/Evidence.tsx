import { REPORT } from '@arablyzer/i18n/report'
import type { Finding } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { valueOf } from '../report-model'
import { Revealed } from './Bidi'
import { ENGINE_LABEL } from './ui'

/**
 * A finding's evidence: where it is, the engines that saw it, and its code; the tool pages show it
 * too. The page's own text in it cannot turn round what is drawn around it (Revealed).
 */
export function Evidence({ finding, lang }: { finding: Finding; lang: Lang }) {
  const t = REPORT[lang].findings
  const { selector, snippet, engines, location, box } = finding.evidence
  const overflow = valueOf(finding, 'overflow')
  const viewport = valueOf(finding, 'viewportWidth')
  return (
    <div className="flex flex-col gap-4">
      {box !== undefined && overflow !== null && viewport !== null && (
        <OverflowDiagram
          x={box.x}
          width={box.width}
          overflow={overflow}
          viewport={viewport}
          label={t.overflow(overflow, viewport)}
        />
      )}
      <dl className="m-0 grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[15px]">
        {selector !== undefined && (
          <>
            <dt className="text-ink-3">{t.selector}</dt>
            <dd className="m-0 min-w-0">
              {/* A box of its own, so a selector that wraps keeps its lines to the left in Arabic. */}
              <code
                dir="ltr"
                className="inline-block max-w-full bg-paper px-2 py-0.5 text-start font-mono text-sm break-all"
              >
                <Revealed text={selector} />
              </code>
              {location !== undefined && (
                <span dir="ltr" className="ms-2 font-mono text-xs text-ink-3">
                  :{location.line}
                </span>
              )}
            </dd>
          </>
        )}
        {engines !== undefined && engines.length > 0 && (
          <>
            <dt className="text-ink-3">{t.seenIn}</dt>
            <dd className="m-0 flex flex-wrap gap-1.5">
              {engines.map((engine) => (
                <span
                  key={engine}
                  dir="ltr"
                  className="bg-signal-soft px-2 py-0.5 font-mono text-xs text-signal"
                >
                  {ENGINE_LABEL[engine]}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
      {snippet !== undefined && (
        <pre
          dir="ltr"
          // Focusable, so a keyboard can scroll a line wider than the card.
          tabIndex={0}
          className="m-0 overflow-x-auto bg-panel px-4 py-3 font-mono text-[13px] text-panel-soft"
        >
          <code>
            <Revealed text={snippet} muted="text-panel-dim" />
          </code>
        </pre>
      )}
    </div>
  )
}

/** The element past the phone's edge, to scale, as on the home page. */
function OverflowDiagram({
  x,
  width,
  overflow,
  viewport,
  label,
}: {
  x: number
  width: number
  overflow: number
  viewport: number
  label: string
}) {
  const scale = 150 / viewport
  const screen = { x: 300, width: 150 }
  const start = Math.max(4, screen.x + x * scale)
  const end = Math.max(start + 4, Math.min(screen.x + (x + width) * scale, 516))
  const round = (value: number) => Math.round(value * 10) / 10
  return (
    <div className="max-w-[520px] border border-rule-soft bg-paper p-3">
      <svg
        width="100%"
        viewBox="0 0 520 148"
        fill="none"
        role="img"
        aria-label={label}
        direction="ltr"
      >
        <rect
          x={screen.x}
          y="8"
          width={screen.width}
          height="124"
          className="stroke-ink"
          strokeWidth="1.5"
        />
        <rect
          x={round(start)}
          y="26"
          width={round(end - start)}
          height="30"
          className="fill-signal-soft stroke-signal"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <path
          d={`M${round(start)} 96H${screen.x}M${round(start)} 90v12M${screen.x} 90v12`}
          className="stroke-measure"
          strokeWidth="1.2"
        />
        <text
          x={round((start + screen.x) / 2)}
          y="120"
          textAnchor="middle"
          fontSize="13"
          className="fill-measure font-mono"
        >
          {overflow}px
        </text>
        <text
          x={screen.x + screen.width / 2}
          y="80"
          textAnchor="middle"
          fontSize="12"
          className="fill-ink-3 font-mono"
        >
          {viewport}px
        </text>
      </svg>
    </div>
  )
}
