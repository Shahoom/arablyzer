import { REPORT } from '@arablyzer/i18n/report'
import type { Finding } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { diagramOf, valueOf } from '../report-model'
import { Revealed } from './Bidi'
import { ENGINE_LABEL, EngineDot } from './ui'

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
      {(selector !== undefined || (engines !== undefined && engines.length > 0)) && (
        <dl className="m-0 flex flex-col gap-3 text-small">
          {selector !== undefined && (
            <div className="grid items-start gap-1 sm:grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] sm:gap-x-4">
              <dt className="text-meta text-ink-2 sm:pt-1">{t.selector}</dt>
              <dd className="m-0 min-w-0">
                {/* A box of its own, so a selector that wraps keeps its lines to the left in Arabic. */}
                <code
                  dir="ltr"
                  className="inline-block max-w-full rounded-xs bg-surface-2 px-2 py-0.5 text-start font-mono text-meta break-all text-ink"
                >
                  <Revealed text={selector} />
                </code>
                {location !== undefined && (
                  <span dir="ltr" className="ms-2 font-mono text-meta text-ink-2">
                    :{location.line}
                  </span>
                )}
              </dd>
            </div>
          )}
          {engines !== undefined && engines.length > 0 && (
            <div className="grid items-start gap-1 sm:grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] sm:gap-x-4">
              <dt className="text-meta text-ink-2 sm:pt-1">{t.seenIn}</dt>
              <dd className="m-0 flex flex-wrap gap-2">
                {engines.map((engine) => (
                  <span key={engine} dir="ltr" lang="en" className="engine-chip">
                    <EngineDot engine={engine} />
                    {ENGINE_LABEL[engine]}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
      {snippet !== undefined && (
        <pre
          dir="ltr"
          // Focusable, so a keyboard can scroll a line wider than the card.
          tabIndex={0}
          className="panel-dark m-0 overflow-x-auto rounded-lg px-4 py-3 font-mono text-meta leading-[1.7] text-panel-soft"
        >
          <code>
            <Revealed text={snippet} muted="text-panel-dim" />
          </code>
        </pre>
      )}
    </div>
  )
}

/**
 * The element past the phone's edge, to scale: the screen is a rounded outline, 150 units wide
 * for the viewport, and the element's box is drawn where it sits against it, dashed, with the
 * distance it reaches beyond. The lines inside the screen only suggest a page; they are not data.
 */
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
  const { screen, start, end, from, to } = diagramOf(x, width, viewport)
  const round = (value: number) => Math.round(value * 10) / 10
  return (
    <div className="w-fit max-w-full rounded-xl bg-serious-soft/40 p-3">
      <svg
        width={to - from}
        height="148"
        viewBox={`${from} 0 ${to - from} 148`}
        fill="none"
        role="img"
        aria-label={label}
        direction="ltr"
        className="block h-auto max-w-full"
      >
        <rect
          x={screen.x}
          y="8"
          width={screen.width}
          height="124"
          rx="14"
          className="fill-white stroke-ink-3"
          stroke-width="1.5"
        />
        <path
          d={`M${screen.x + 14} 66H${screen.x + 96}M${screen.x + 14} 80H${screen.x + 64}`}
          className="stroke-surface-2"
          stroke-width="6"
          stroke-linecap="round"
        />
        <rect
          x={round(start)}
          y="26"
          width={round(end - start)}
          height="22"
          rx="3"
          className="fill-serious-soft stroke-serious"
          stroke-width="1.5"
          stroke-dasharray="4 3"
        />
        <path
          d={`M${round(start)} 96H${screen.x}M${round(start)} 90v12M${screen.x} 90v12`}
          className="stroke-serious"
          stroke-width="1.2"
        />
        <text
          x={round((start + screen.x) / 2)}
          y="120"
          text-anchor="middle"
          font-size="13"
          className="fill-serious font-mono"
        >
          {overflow}px
        </text>
        <text
          x={screen.x + screen.width / 2}
          y="112"
          text-anchor="middle"
          font-size="12"
          className="fill-ink-3 font-mono"
        >
          {viewport}px
        </text>
      </svg>
    </div>
  )
}
