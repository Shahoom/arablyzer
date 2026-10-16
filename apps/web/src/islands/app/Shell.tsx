import { APP_UI, type AppNav } from '@arablyzer/i18n/app'
import { localePath, PATHS, type Lang } from '@arablyzer/seo/site'
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleUser,
  FileText,
  Globe,
  KeyRound,
  Languages,
  Layers,
  LayoutDashboard,
  LogOut,
  Moon,
  Palette as PaletteIcon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  ScanSearch,
  Search,
  Sun,
  X,
} from 'lucide-preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { AccountSummary } from '@arablyzer/api-contract/codes'
import { setLanguage, signOut, signOutEverywhere } from '../auth-api'
import { loginHref } from '../auth-model'
import { dayLabel, reportHref } from '../sites-model'
import {
  appHref,
  filterPalette,
  hostOf,
  NAV_GROUPS,
  paletteItems,
  siteHref,
  type AppPage,
  type PaletteGroup,
} from './app-model'
import { useSharedMaybe } from './data'
import { UsageMeter } from './ui'

const ICONS: Readonly<Record<AppNav, typeof Globe>> = {
  overview: LayoutDashboard,
  sites: Globe,
  scans: ScanSearch,
  monitoring: Activity,
  crawls: Layers,
  pdfs: FileText,
  keys: KeyRound,
  brand: PaletteIcon,
  account: CircleUser,
}

/** The menu's entry a page belongs to: a site's page is under «sites». */
const navOf = (page: AppPage): AppNav => (page === 'site' ? 'sites' : page)

function LogoMark({ size = 'size-8' }: { size?: string }) {
  return (
    <span aria-hidden="true" className={`logo-mark text-white ${size}`}>
      <svg viewBox="0 0 32 32" fill="none" className="block size-full">
        <path
          d="M24 10.5H8.5M24 16H12.5M24 21.5H16.5"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
        />
      </svg>
    </span>
  )
}

/** A button that opens a panel under it, and closes it on Escape, on a click elsewhere, and on leaving it. */
function usePop() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (target: EventTarget | null) =>
      root.current !== null && !root.current.contains(target as Node)
    const onDown = (event: MouseEvent) => {
      if (outside(event.target)) setOpen(false)
    }
    const onFocus = (event: FocusEvent) => {
      if (outside(event.target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      root.current?.querySelector('button')?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, root }
}

// ---------------------------------------------------------------------------------------------

export function NavLinks({ lang, page }: { lang: Lang; page: AppPage }) {
  const t = APP_UI[lang]
  const shared = useSharedMaybe()
  const current = navOf(page)
  return (
    <>
      {NAV_GROUPS.map((group) => (
        <div key={group.key} className="app-nav-group">
          <p className="app-nav-title">{t.nav.groups[group.key]}</p>
          {group.items.map((item) => {
            const Icon = ICONS[item]
            const count =
              item === 'sites' && shared?.status === 'ready' ? shared.sites.length : null
            return (
              <a
                key={item}
                href={appHref(lang, item)}
                className="app-item"
                {...(item === current ? { 'aria-current': 'page' as const } : {})}
              >
                <span className="app-ico">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="app-label">{t.nav.items[item]}</span>
                {count !== null && <span className="app-count">{count}</span>}
              </a>
            )
          })}
        </div>
      ))}
    </>
  )
}

export function Sidebar({
  lang,
  page,
  collapsed,
  onCollapse,
}: {
  lang: Lang
  page: AppPage
  collapsed: boolean
  onCollapse: () => void
}) {
  const t = APP_UI[lang].shell
  const shared = useSharedMaybe()
  const Fold =
    lang === 'ar'
      ? collapsed
        ? PanelRightOpen
        : PanelRightClose
      : collapsed
        ? PanelLeftOpen
        : PanelLeftClose
  return (
    <aside className="app-side" aria-label={t.sidebar}>
      <div className="app-side-in">
        <a href={appHref(lang, 'overview')} className="app-brand" aria-label={t.appName}>
          <LogoMark />
          <span className="app-brand-word" lang="en">
            Arablyzer
          </span>
        </a>
        <nav className="flex flex-col gap-5" aria-label={t.sidebar}>
          <NavLinks lang={lang} page={page} />
        </nav>
        <div className="app-side-card app-side-extra mt-auto">
          {shared !== null && shared.status === 'ready' ? (
            <div className="flex flex-col gap-3">
              <UsageMeter
                id="side-meter"
                label={t.plan.title}
                used={shared.sites.length}
                limit={shared.limits.sites}
                text={APP_UI[lang].common.of(shared.sites.length, shared.limits.sites)}
                full={APP_UI[lang].overview.meterFull}
              />
              <a
                className="text-small font-semibold text-brand-ink underline underline-offset-4 hover:text-ink"
                href={`${localePath(lang, PATHS.home)}#plans`}
              >
                {t.plan.compare}
              </a>
            </div>
          ) : (
            <div className="app-skel h-16" aria-hidden="true" />
          )}
        </div>
        <button
          type="button"
          className="app-item hidden w-full cursor-pointer border-0 bg-transparent text-start lg:flex"
          aria-pressed={collapsed}
          onClick={onCollapse}
        >
          <span className="app-ico">
            <Fold size={16} aria-hidden="true" />
          </span>
          <span className="app-label">{collapsed ? t.expand : t.collapse}</span>
        </button>
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------------------------

function SiteSwitcher({ lang, siteId }: { lang: Lang; siteId: string | null }) {
  const t = APP_UI[lang].shell.switcher
  const shared = useSharedMaybe()
  const { open, setOpen, root } = usePop()
  const sites = shared?.sites ?? []
  const current = sites.find((site) => site.id === siteId) ?? null
  return (
    <div className="app-pop hidden md:block" ref={root}>
      <button
        type="button"
        className="app-ib w-auto min-w-[44px] gap-2 px-3"
        aria-expanded={open}
        aria-controls="site-switcher"
        aria-label={t.label}
        onClick={() => {
          setOpen(!open)
        }}
      >
        <span className="flex items-center gap-2 text-small font-semibold">
          <Globe size={16} aria-hidden="true" className="text-ink-3" />
          <bdi dir="ltr" className="max-w-[160px] truncate">
            {current === null ? t.all : hostOf(current.url)}
          </bdi>
          <ChevronsUpDown size={14} aria-hidden="true" className="text-ink-3" />
        </span>
      </button>
      {open && (
        <div id="site-switcher" className="app-pop-panel max-h-[70dvh] overflow-y-auto" data-start>
          <a
            className="app-pop-item"
            href={appHref(lang, 'sites')}
            {...(current === null ? { 'aria-current': 'true' as const } : {})}
          >
            <Globe size={16} aria-hidden="true" className="text-ink-3" />
            {t.all}
          </a>
          {sites.length === 0 && shared?.status === 'ready' && (
            <p className="m-0 px-3 py-2 text-small text-ink-3">{t.none}</p>
          )}
          {sites.map((site) => (
            <a
              key={site.id}
              className="app-pop-item"
              href={siteHref(lang, site.id)}
              {...(site.id === siteId ? { 'aria-current': 'true' as const } : {})}
            >
              <bdi dir="ltr" className="truncate">
                {hostOf(site.url)}
              </bdi>
            </a>
          ))}
          <a
            className="app-pop-item border-t border-line text-brand-ink"
            href={appHref(lang, 'sites')}
          >
            <Plus size={16} aria-hidden="true" />
            {t.add}
          </a>
        </div>
      )}
    </div>
  )
}

function ThemeToggle({ lang }: { lang: Lang }) {
  const t = APP_UI[lang].shell.theme
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light')
    // With no choice of the person's own, the page follows the system as it changes.
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const follow = () => {
      let stored: string | null = null
      try {
        stored = localStorage.getItem('arablyzer-theme')
      } catch {
        // No storage: the system decides.
      }
      if (stored === 'light' || stored === 'dark') return
      const next = query.matches ? 'dark' : 'light'
      document.documentElement.setAttribute('data-theme', next)
      setTheme(next)
    }
    query.addEventListener('change', follow)
    return () => {
      query.removeEventListener('change', follow)
    }
  }, [])
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      className="app-ib"
      aria-label={dark ? t.toLight : t.toDark}
      onClick={() => {
        const next = dark ? 'light' : 'dark'
        document.documentElement.setAttribute('data-theme', next)
        try {
          localStorage.setItem('arablyzer-theme', next)
        } catch {
          // The choice lasts for this page.
        }
        setTheme(next)
      }}
    >
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  )
}

function UserMenu({
  lang,
  page,
  account,
  onAccount,
}: {
  lang: Lang
  page: AppPage
  account: AccountSummary | null
  onAccount: (next: AccountSummary) => void
}) {
  const t = APP_UI[lang].shell.user
  const { open, setOpen, root } = usePop()
  const other: Lang = lang === 'ar' ? 'en' : 'ar'
  const [href, setHref] = useState(appHref(other, page))
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    // A site's page carries its id, which the other language's page needs too.
    const keep = page === 'site' ? new URLSearchParams(window.location.search).get('id') : null
    setHref(appHref(other, page, keep === null ? undefined : { id: keep }))
  }, [other, page])
  const label =
    account === null ? '' : account.name.trim() === '' ? account.email : account.name.trim()
  const initial = (label === '' ? '·' : label).charAt(0).toUpperCase()

  async function leave(everywhere: boolean) {
    if (busy) return
    setBusy(true)
    const left = await (everywhere ? signOutEverywhere() : signOut())
    if (left.ok) window.location.assign(loginHref(lang))
    else setBusy(false)
  }

  return (
    <div className="app-pop" ref={root}>
      <button
        type="button"
        className="app-avatar"
        aria-expanded={open}
        aria-controls="user-menu"
        aria-label={t.menu}
        lang="en"
        onClick={() => {
          setOpen(!open)
        }}
      >
        {initial}
      </button>
      {open && (
        <div id="user-menu" className="app-pop-panel">
          {account !== null && (
            <div className="flex flex-col gap-0.5 border-b border-line px-3 pt-2 pb-3">
              <bdi className="text-small font-semibold text-ink">
                {account.name === '' ? '—' : account.name}
              </bdi>
              <span dir="ltr" className="text-meta break-all text-ink-3">
                {account.email}
              </span>
            </div>
          )}
          <a
            className="app-pop-item"
            href={href}
            lang={other}
            hrefLang={other}
            onClick={(event) => {
              event.preventDefault()
              void setLanguage(other).then((set) => {
                if (set.ok) onAccount(set.value)
                window.location.assign(href)
              })
            }}
          >
            <Languages size={16} aria-hidden="true" className="text-ink-3" />
            <span>
              {t.language}: {other === 'ar' ? 'العربية' : 'English'}
            </span>
          </a>
          <button
            type="button"
            className="app-pop-item"
            disabled={busy}
            onClick={() => void leave(false)}
          >
            <LogOut size={16} aria-hidden="true" className="text-ink-3 rtl:-scale-x-100" />
            {t.signOut}
          </button>
          <button
            type="button"
            className="app-pop-item"
            disabled={busy}
            onClick={() => void leave(true)}
          >
            <LogOut size={16} aria-hidden="true" className="text-ink-3 rtl:-scale-x-100" />
            {t.signOutEverywhere}
          </button>
        </div>
      )}
    </div>
  )
}

export function Topbar({
  lang,
  page,
  siteId,
  siteName,
  account,
  onAccount,
  onSearch,
}: {
  lang: Lang
  page: AppPage
  siteId: string | null
  siteName: string | null
  account: AccountSummary | null
  onAccount: (next: AccountSummary) => void
  onSearch: () => void
}) {
  const t = APP_UI[lang]
  const Next = lang === 'ar' ? ChevronLeft : ChevronRight
  const current = navOf(page)
  const group = NAV_GROUPS.find((entry) => entry.items.includes(current))
  const title = page === 'site' ? (siteName ?? t.pages.site.title) : t.nav.items[current]
  return (
    <header className="app-top">
      <a href={appHref(lang, 'overview')} className="md:hidden" aria-label={t.shell.appName}>
        <LogoMark />
      </a>
      <span className="min-w-0 truncate text-body font-semibold md:hidden">
        <bdi>{title}</bdi>
      </span>
      <nav className="app-crumbs" aria-label={t.shell.crumbs}>
        {page === 'site' ? (
          <>
            <a href={appHref(lang, 'sites')}>{t.nav.items.sites}</a>
            <Next size={14} aria-hidden="true" />
            <span aria-current="page">
              <bdi dir="ltr">{title}</bdi>
            </span>
          </>
        ) : (
          <>
            <span>{group === undefined ? '' : t.nav.groups[group.key]}</span>
            <Next size={14} aria-hidden="true" />
            <span aria-current="page">{title}</span>
          </>
        )}
      </nav>
      <button
        type="button"
        className="app-find"
        aria-label={t.shell.search.open}
        aria-keyshortcuts="Control+K Meta+K"
        onClick={onSearch}
      >
        <Search size={18} aria-hidden="true" />
        <span className="truncate">{t.shell.search.placeholder}</span>
        <kbd dir="ltr">Ctrl K</kbd>
      </button>
      <button
        type="button"
        className="app-ib ms-auto md:hidden"
        aria-label={t.shell.search.open}
        onClick={onSearch}
      >
        <Search size={18} aria-hidden="true" />
      </button>
      <SiteSwitcher lang={lang} siteId={siteId} />
      <ThemeToggle lang={lang} />
      <UserMenu lang={lang} page={page} account={account} onAccount={onAccount} />
    </header>
  )
}

// ---------------------------------------------------------------------------------------------

/** A `<dialog>` that is open while `open` is, closes itself on Escape and on a click on its backdrop. */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return {
    ref,
    onClose,
    onClick: (event: MouseEvent) => {
      if (event.target === event.currentTarget) onClose()
    },
  }
}

const GROUP_ORDER: readonly PaletteGroup[] = ['pages', 'sites', 'scans']

export function Palette({
  lang,
  open,
  onClose,
}: {
  lang: Lang
  open: boolean
  onClose: () => void
}) {
  const t = APP_UI[lang]
  const shared = useSharedMaybe()
  const dialog = useDialog(open, onClose)
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const items = useMemo(
    () =>
      paletteItems({
        lang,
        pages: NAV_GROUPS.flatMap((group) => group.items).map((page) => ({
          page,
          label: t.nav.items[page],
        })),
        sites: shared?.sites ?? [],
        scans: shared?.scans ?? [],
        siteHint: t.shell.search.sites,
        scanHint: (scan) =>
          `${scan.score === null ? t.common.noScore : `${t.common.score} ${String(scan.score)}`} · ${dayLabel(scan.createdAt, lang)}`,
        reportHref: (scan) => reportHref(lang, scan.id),
      }),
    [lang, shared?.sites, shared?.scans, t],
  )
  const results = useMemo(() => filterPalette(items, query), [items, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      input.current?.focus()
    }
  }, [open])

  const labels: Readonly<Record<PaletteGroup, string>> = {
    pages: t.shell.search.pages,
    sites: t.shell.search.sites,
    scans: t.shell.search.scans,
  }

  return (
    <dialog
      ref={dialog.ref}
      className="app-dialog app-palette"
      aria-label={t.shell.search.title}
      onClose={dialog.onClose}
      onClick={dialog.onClick}
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={18} aria-hidden="true" className="shrink-0 text-ink-3" />
        <input
          ref={input}
          type="text"
          dir="auto"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-autocomplete="list"
          aria-label={t.shell.search.title}
          {...(results[active] === undefined
            ? {}
            : { 'aria-activedescendant': `pal-${results[active].id}` })}
          placeholder={t.shell.search.placeholder}
          value={query}
          className="h-14 min-w-0 flex-1 border-0 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
          onInput={(event) => {
            setQuery(event.currentTarget.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((n) => Math.min(results.length - 1, n + 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((n) => Math.max(0, n - 1))
            } else if (event.key === 'Enter') {
              const chosen = results[active]
              if (chosen !== undefined) window.location.assign(chosen.href)
            }
          }}
        />
        <button
          type="button"
          className="app-ib border-0 bg-transparent"
          aria-label={t.shell.search.close}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div
        className="max-h-[min(420px,60dvh)] overflow-y-auto p-2"
        id="palette-results"
        role="listbox"
        aria-label={t.shell.search.title}
      >
        {results.length === 0 && (
          <p className="m-0 px-3 py-6 text-center text-small text-ink-2" role="status">
            {query.trim() === '' ? t.shell.search.hint : t.shell.search.none(query.trim())}
          </p>
        )}
        {GROUP_ORDER.map((group) => {
          const own = results.filter((item) => item.group === group)
          if (own.length === 0) return null
          return (
            <div key={group} role="presentation">
              <p className="m-0 px-3 pt-2 pb-1 text-meta text-ink-3" role="presentation">
                {labels[group]}
              </p>
              {own.map((item) => (
                <a
                  key={item.id}
                  id={`pal-${item.id}`}
                  role="option"
                  aria-selected={results[active]?.id === item.id}
                  href={item.href}
                  className="app-pop-item"
                  {...(results[active]?.id === item.id ? { 'aria-current': 'true' as const } : {})}
                  onMouseMove={() => {
                    const index = results.findIndex((entry) => entry.id === item.id)
                    if (index !== active) setActive(index)
                  }}
                >
                  <span dir={item.ltr ? 'ltr' : undefined} className="min-w-0 flex-1 truncate">
                    {item.label}
                  </span>
                  {item.hint !== '' && (
                    <span className="shrink-0 text-meta text-ink-3">{item.hint}</span>
                  )}
                </a>
              ))}
            </div>
          )
        })}
      </div>
    </dialog>
  )
}

/** The phone's bottom bar, and the sheet that «more» opens with the whole menu. */
export function BottomBar({
  lang,
  page,
  open,
  onOpen,
  onClose,
}: {
  lang: Lang
  page: AppPage
  open: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const t = APP_UI[lang]
  const current = navOf(page)
  const dialog = useDialog(open, onClose)
  const tabs = ['overview', 'sites', 'scans'] as const
  return (
    <>
      <nav className="app-bottom" aria-label={t.shell.bottomBar}>
        {tabs.map((item) => {
          const Icon = ICONS[item]
          return (
            <a
              key={item}
              href={appHref(lang, item)}
              className="app-tab"
              {...(item === current ? { 'aria-current': 'page' as const } : {})}
            >
              <Icon size={20} aria-hidden="true" />
              {t.nav.items[item]}
            </a>
          )
        })}
        <button type="button" className="app-tab" aria-haspopup="dialog" onClick={onOpen}>
          <ChevronDown size={20} aria-hidden="true" className="rotate-180" />
          {t.shell.more}
        </button>
      </nav>
      <dialog
        ref={dialog.ref}
        className="app-dialog app-sheet"
        aria-label={t.shell.more}
        onClose={dialog.onClose}
        onClick={dialog.onClick}
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <span className="mx-auto h-1 w-10 rounded-full bg-line-2" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 pt-2">
          <span className="text-body font-semibold">{t.shell.more}</span>
          <button type="button" className="app-ib" aria-label={t.shell.closeMenu} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <nav className="flex flex-col gap-4 p-4" aria-label={t.shell.more}>
          <NavLinks lang={lang} page={page} />
        </nav>
      </dialog>
    </>
  )
}
