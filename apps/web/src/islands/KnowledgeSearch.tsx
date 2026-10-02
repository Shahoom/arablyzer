import { KNOWLEDGE_UI, type KnowledgeType } from '@arablyzer/i18n/knowledge'
import type { Severity } from '@arablyzer/report-schema'
import type { Lang } from '@arablyzer/seo/site'
import { STRINGS } from '@arablyzer/seo/strings'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LifeBuoy,
  ListChecks,
  Search,
  SearchX,
  Wrench,
  X,
} from 'lucide-preact'
import type { TargetedInputEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  countByType,
  groupsOf,
  indexItems,
  KNOWLEDGE_TYPES,
  search,
  TYPE_TILE,
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

const TYPE_ICON = {
  tool: Wrench,
  rule: ListChecks,
  fix: LifeBuoy,
  term: BookOpen,
} as const

/** A severity's pill, as global.css names it (SeverityPill.astro's twin). */
const SEVERITY_PILL: Readonly<Record<Severity, string>> = {
  critical: 'sev sev-critical',
  serious: 'sev sev-serious',
  moderate: 'sev sev-moderate',
  minor: 'sev sev-minor',
  info: 'sev sev-info',
}

/**
 * The hub's search (M2.6 R5): one box over the tools, the rules, the fix guides and the glossary,
 * the chips that narrow it to one kind with their counts, and the results grouped by kind. Every
 * page is in the HTML before this runs, as a link in the groups below, and the search only
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

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <div className="flex flex-col gap-3 rounded-3xl border border-line bg-white/85 p-3 shadow-lg backdrop-blur-xl md:sticky md:top-[116px] md:z-20 md:gap-4 md:p-4 lg:top-[76px]">
        <div role="search">
          <label htmlFor="knowledge-search" className="sr-only">
            {t.search.label}
          </label>
          <div className="flex h-14 items-center gap-3 rounded-2xl border border-field bg-white ps-4 pe-2 focus-within:border-indigo focus-within:ring-4 focus-within:ring-indigo/15 md:h-16 md:ps-5">
            <Search size={22} strokeWidth={2} aria-hidden="true" className="shrink-0 text-ink-3" />
            <input
              ref={field}
              id="knowledge-search"
              type="search"
              dir="auto"
              autoComplete="off"
              autoCapitalize="none"
              spellcheck={false}
              placeholder={t.search.placeholder}
              onInput={(event: TargetedInputEvent<HTMLInputElement>) => {
                setTyped(event.currentTarget.value)
              }}
              className="h-full min-w-0 grow border-0 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-3 md:text-xl [&::-webkit-search-cancel-button]:hidden"
            />
            {typed !== '' && (
              <button
                type="button"
                onClick={clear}
                aria-label={t.search.clear}
                className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X size={20} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <div role="group" aria-label={t.typesLabel} className="flex flex-wrap gap-2">
          {(['all', ...KNOWLEDGE_TYPES] as const).map((choice: TypeFilter) => (
            <button
              key={choice}
              type="button"
              aria-pressed={filter === choice}
              onClick={() => {
                setFilter(choice)
              }}
              className="chip h-10 px-3.5 font-normal! whitespace-nowrap md:h-[42px] md:px-4"
            >
              <span>
                <Bidi text={t.types[choice]} lang={lang} />
              </span>
              <span dir="ltr" className="tabular-nums">
                {counts[choice]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* What a screen reader hears of the results: how many, and not the list again. */}
      <p role="status" className="sr-only">
        {asking ? t.status(counts[filter]) : ''}
      </p>

      {groups.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line-2 bg-white/70 p-6 md:p-8">
          <span className="grid size-11 place-items-center rounded-2xl bg-surface-2 text-ink-2">
            <SearchX size={22} strokeWidth={2} aria-hidden="true" />
          </span>
          <p className="m-0 text-lg font-semibold text-ink">
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
          <p className="m-0 text-base text-ink-2">{t.none.hint}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-10 md:gap-12">
          {groups.map((group, position) => {
            const Icon = TYPE_ICON[group.type]
            return (
              <section
                key={group.type}
                aria-labelledby={`knowledge-${group.type}`}
                className={
                  position === 0
                    ? 'flex flex-col gap-4'
                    : 'flex flex-col gap-4 [contain-intrinsic-size:auto_3200px] [content-visibility:auto]'
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <h2
                    id={`knowledge-${group.type}`}
                    className="m-0 flex items-center gap-3 text-[22px] leading-snug font-semibold md:text-[26px]"
                  >
                    <span
                      aria-hidden="true"
                      className={`grid size-10 shrink-0 place-items-center rounded-xl ${TYPE_TILE[group.type]}`}
                    >
                      <Icon size={20} strokeWidth={2} />
                    </span>
                    <span>
                      <Bidi text={t.types[group.type]} lang={lang} />
                    </span>
                    <span
                      dir="ltr"
                      className="rounded-full bg-surface-2 px-2.5 py-0.5 text-sm font-normal text-ink-2 tabular-nums"
                    >
                      {group.items.length}
                    </span>
                  </h2>
                  <a
                    href={directories[group.type]}
                    className="inline-flex h-9 items-center gap-1.5 text-sm font-semibold text-brand-ink underline-offset-4 hover:text-ink hover:underline"
                  >
                    {t.viewAll[group.type]}
                    <Next size={16} strokeWidth={2} aria-hidden="true" />
                  </a>
                </div>
                <ul className="m-0 grid list-none gap-px overflow-hidden rounded-xl border border-line bg-line p-0 shadow lg:grid-cols-2 lg:[&>li:last-child:nth-child(odd)]:col-span-2">
                  {group.items.map((item) => (
                    <li key={item.href} className="bg-surface">
                      <a
                        href={item.href}
                        className="group flex flex-col gap-2.5 px-4 py-3.5 text-ink hover:bg-bg hover:text-ink focus-visible:-outline-offset-2 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-4"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="text-base leading-[1.6] font-semibold [overflow-wrap:anywhere] group-hover:text-brand-ink">
                            <Bidi text={item.title} lang={lang} />
                          </span>
                          <span className="line-clamp-2 text-sm leading-[1.7] text-ink-2 [overflow-wrap:anywhere]">
                            <Rich text={item.text} lang={lang} />
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5 sm:max-w-[250px] sm:shrink-0 sm:justify-end">
                          {item.severity !== undefined && (
                            <span className={SEVERITY_PILL[item.severity]}>
                              {severity[item.severity]}
                            </span>
                          )}
                          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-xs text-ink-2">
                            {item.tone !== -1 && (
                              <span
                                aria-hidden="true"
                                className={`size-2 shrink-0 rounded-full ${tones[item.tone] ?? ''}`}
                              />
                            )}
                            <Bidi text={item.tag} lang={lang} />
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className="chev-end hidden text-ink-3 group-hover:text-brand-ink sm:block"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
