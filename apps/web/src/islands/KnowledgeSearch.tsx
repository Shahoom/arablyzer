import { KNOWLEDGE_UI, type KnowledgeType } from '@arablyzer/i18n/knowledge'
import type { Severity } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { STRINGS } from '@arablyzer/seo/strings'
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-preact'
import type { TargetedInputEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { HEAD } from '../lib/heads'
import {
  countByType,
  dotOf,
  groupsOf,
  indexItems,
  KNOWLEDGE_TYPES,
  search,
  splitGroup,
  typeFilterOf,
  type KnowledgeItem,
  type TypeFilter,
} from '../lib/knowledge-search'
import { Bidi } from './knowledge/Bidi'
import { Rich } from './knowledge/Rich'

interface Props {
  lang: Lang
  /** Every page the hub lists, from lib/knowledge.ts: the same list the page rests on. */
  items: readonly KnowledgeItem[]
  /** The classes of the tags' dots; an item's `tone` is an index into them. */
  tones: readonly string[]
  /** Each kind's page, where its group's heading leads. */
  directories: Readonly<Record<KnowledgeType, string>>
}

/** A severity's pill, as global.css names it (SeverityPill.astro's twin). */
const SEVERITY_PILL: Readonly<Record<Severity, string>> = {
  critical: 'sev sev-critical',
  serious: 'sev sev-serious',
  moderate: 'sev sev-moderate',
  minor: 'sev sev-minor',
  info: 'sev sev-info',
}

const CHOICES: readonly TypeFilter[] = ['all', ...KNOWLEDGE_TYPES]

/**
 * The hub's search (M2.6 R5, rebuilt in R7): one field over the tools, the rules, the fix guides
 * and the glossary, the type filter, and the results grouped by kind. It draws the page's two
 * columns itself (`page-columns`): the field and the results in the main column, and the filter
 * in the aside, a vertical list with its counts that stays under the header from lg. Below lg the
 * filter is a row of chips above the results, where a phone needs it: after 158 rows it was out of
 * reach. A group shows its first rows and a «show all» that opens the rest in place (a native
 * disclosure, so it works without script), unless a single kind is chosen, which shows all of it.
 *
 * Every page is in the HTML before this runs, as a link in the groups, and the search only
 * narrows them. Words typed before the script has loaded are kept; `?q=` and `?type=` in the
 * address fill the search, and what is typed goes back into it, so a search can be shared.
 */
export default function KnowledgeSearch({ lang, items, tones, directories }: Props) {
  const t = KNOWLEDGE_UI[lang]
  const severity = STRINGS[lang].report.severity
  const index = useMemo(() => indexItems(items, (name) => severity[name]), [items, severity])
  const [typed, setTyped] = useState('')
  const [filter, setFilter] = useState<TypeFilter>('all')
  const field = useRef<HTMLInputElement>(null)
  const woke = useRef(false)

  // The page is visited with a search in its address, or the visitor typed before this ran; the
  // field is not controlled, so nothing typed is overwritten.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const input = field.current
    const start = input !== null && input.value !== '' ? input.value : (params.get('q') ?? '')
    if (input !== null && input.value !== start) input.value = start
    setTyped(start)
    setFilter(typeFilterOf(params.get('type')))
  }, [])

  // What is typed goes into the address, for the next visit and for a link to share.
  useEffect(() => {
    if (!woke.current) {
      woke.current = true
      return
    }
    const url = new URL(window.location.href)
    if (typed.trim() === '') url.searchParams.delete('q')
    else url.searchParams.set('q', typed.trim())
    if (filter === 'all') url.searchParams.delete('type')
    else url.searchParams.set('type', filter)
    window.history.replaceState(null, '', url)
  }, [typed, filter])

  const matches = useMemo(() => search(index, typed), [index, typed])
  const counts = useMemo(() => countByType(matches), [matches])
  const groups = useMemo(() => groupsOf(matches, filter), [matches, filter])
  const asking = typed.trim() !== '' || filter !== 'all'
  const Next = lang === 'ar' ? ChevronLeft : ChevronRight

  function clear() {
    if (field.current !== null) {
      field.current.value = ''
      field.current.focus()
    }
    setTyped('')
  }

  /** A choice of the filter: a chip in the row below lg, a row of the list from lg. */
  const choose = (choice: TypeFilter) => () => {
    setFilter(choice)
  }
  const label = (choice: TypeFilter) => <Bidi text={t.types[choice]} lang={lang} />

  return (
    <div className={`wrap page-columns ${HEAD.bodyTop}`}>
      {/* The search, the chips and what a screen reader hears: the top of the main column. */}
      <div className="page-main flex flex-col gap-5">
        <div role="search">
          <label htmlFor="knowledge-search" className="sr-only">
            {t.search.label}
          </label>
          <div className="search-field">
            <Search size={20} strokeWidth={2} aria-hidden="true" className="shrink-0 text-ink-3" />
            <input
              ref={field}
              id="knowledge-search"
              type="search"
              autoComplete="off"
              autoCapitalize="none"
              spellcheck={false}
              placeholder={t.search.placeholder}
              onInput={(event: TargetedInputEvent<HTMLInputElement>) => {
                setTyped(event.currentTarget.value)
              }}
              className="h-full min-w-0 grow border-0 bg-transparent text-body text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
            />
            {typed !== '' && (
              <button
                type="button"
                onClick={clear}
                aria-label={t.search.clear}
                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Below lg: the filter is a row of chips here, above the results. From lg it is the list in the aside. */}
        <div role="group" aria-label={t.typesLabel} className="scroll-row lg:hidden">
          {CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={filter === choice}
              onClick={choose(choice)}
              className="chip whitespace-nowrap"
            >
              <span>{label(choice)}</span>
              <span dir="ltr" className="tabular-nums">
                {counts[choice]}
              </span>
            </button>
          ))}
        </div>

        {/* What a screen reader hears of the results: how many, and not the list again. */}
        <p role="status" className="sr-only">
          {asking ? t.status(counts[filter]) : ''}
        </p>
      </div>

      {/*
        The filter comes in the HTML before the results, so that the Tab key and a screen reader
        meet it after the search and not after the hundred links of the results; from lg the grid
        puts it beside both, at the end of the line, spanning the two rows of the main column.
      */}
      <aside
        aria-labelledby="knowledge-filter-title"
        className="page-aside-sticky hidden min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block"
      >
        <div className="kb-box flex flex-col gap-0.5 p-3">
          <h2
            id="knowledge-filter-title"
            className="m-0 px-3 pt-1 pb-1.5 text-meta font-semibold text-ink-2"
          >
            {t.typesLabel}
          </h2>
          <div
            role="group"
            aria-labelledby="knowledge-filter-title"
            className="flex flex-col gap-0.5"
          >
            {CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={filter === choice}
                onClick={choose(choice)}
                className="kb-filter"
              >
                <span>{label(choice)}</span>
                <span dir="ltr" className="tabular-nums">
                  {counts[choice]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* The results: the main column's second row from lg, under the search. */}
      <div className="-mt-5 min-w-0 lg:col-start-1 lg:row-start-2 lg:mt-6">
        {groups.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-card border border-dashed border-line-2 bg-white/70 p-card">
            <p className="heading-3 m-0">
              {t.none.title.split('{query}').map((part, position) =>
                position === 0 ? (
                  part
                ) : (
                  <>
                    <bdi dir="auto">{typed.trim()}</bdi>
                    {part}
                  </>
                ),
              )}
            </p>
            <p className="m-0 text-small text-ink-2">{t.none.hint}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-8 lg:gap-10">
            {groups.map((group) => {
              // One kind chosen is the visitor asking for all of it; every kind is a glance at each.
              const { shown, rest } =
                filter === 'all' ? splitGroup(group.items) : { shown: group.items, rest: [] }
              const row = (item: KnowledgeItem) => (
                <li key={item.href}>
                  <a href={item.href} className="kb-row group">
                    <span aria-hidden="true" className={`kb-dot ${dotOf(item.tone, tones)}`} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-start justify-between gap-3">
                        <span
                          data-part="title"
                          className="min-w-0 text-body font-semibold [overflow-wrap:anywhere] group-hover:text-brand-ink"
                        >
                          <Bidi text={item.title} lang={lang} />
                        </span>
                        {item.severity !== undefined && (
                          <span className={`${SEVERITY_PILL[item.severity]} mt-0.5 shrink-0`}>
                            {severity[item.severity]}
                          </span>
                        )}
                      </span>
                      <span
                        data-part="summary"
                        className="line-clamp-2 text-small text-ink-2 [overflow-wrap:anywhere] max-md:line-clamp-1"
                      >
                        <Rich text={item.text} lang={lang} />
                      </span>
                    </span>
                    <span className="hidden w-36 shrink-0 self-center text-end text-meta text-ink-2 md:block">
                      <Bidi text={item.tag} lang={lang} />
                    </span>
                    <span
                      aria-hidden="true"
                      className="chev-end hidden shrink-0 self-center text-ink-3 group-hover:text-brand-ink sm:block"
                    />
                  </a>
                </li>
              )
              return (
                <section
                  key={group.type}
                  aria-labelledby={`knowledge-${group.type}`}
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-x-4">
                    <h2
                      id={`knowledge-${group.type}`}
                      className="heading-2 m-0 flex items-baseline gap-2.5"
                    >
                      <span>{label(group.type)}</span>
                      <span dir="ltr" className="text-small font-normal text-ink-2 tabular-nums">
                        {group.items.length}
                      </span>
                    </h2>
                    <a
                      href={directories[group.type]}
                      className="-my-2 inline-flex min-h-11 shrink-0 items-center gap-1 text-small font-semibold text-brand-ink underline-offset-4 hover:text-ink hover:underline"
                    >
                      {t.viewAll[group.type]}
                      <Next size={16} strokeWidth={2} aria-hidden="true" />
                    </a>
                  </div>
                  <div className="kb-list">
                    <ul className="m-0 list-none p-0">{shown.map(row)}</ul>
                    {rest.length > 0 && (
                      <details className="group/more border-t border-line">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-small font-semibold text-brand-ink hover:bg-bg focus-visible:-outline-offset-2 md:px-5 [&::-webkit-details-marker]:hidden">
                          <span>
                            <span className="group-open/more:hidden">{t.showAll}</span>
                            <span className="hidden group-open/more:inline">{t.showFewer}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span dir="ltr" className="font-normal text-ink-2 tabular-nums">
                              {group.items.length}
                            </span>
                            <ChevronDown
                              size={18}
                              strokeWidth={2}
                              aria-hidden="true"
                              className="transition-transform group-open/more:rotate-180"
                            />
                          </span>
                        </summary>
                        <ul className="m-0 list-none border-t border-line p-0">{rest.map(row)}</ul>
                      </details>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
