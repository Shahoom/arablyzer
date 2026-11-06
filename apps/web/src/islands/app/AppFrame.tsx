import type { AccountSummary } from '@arablyzer/api-contract/codes'
import { APP_UI } from '@arablyzer/i18n/app'
import type { Lang } from '@arablyzer/seo/site'
import { PUBLIC_AUTH_GOOGLE_CLIENT_ID } from 'astro:env/client'
import type { ComponentType } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { readAccount, setLanguage } from '../auth-api'
import { loginHref } from '../auth-model'
import { hostOf, siteIdOf, type AppPage } from './app-model'
import { SharedProvider, useSharedMaybe } from './data'
import { BottomBar, Palette, Sidebar, Topbar } from './Shell'
import { Notice, Skeleton } from './ui'

export interface ViewProps {
  lang: Lang
}

/** Each page's view is its own chunk: a page loads the shell and the one view it shows. */
const VIEWS: Readonly<Record<AppPage, () => Promise<{ default: ComponentType<ViewProps> }>>> = {
  overview: () => import('./views/OverviewView'),
  sites: () => import('./views/SitesView'),
  site: () => import('./views/SiteView'),
  scans: () => import('./views/ScansView'),
  monitoring: () => import('./views/MonitoringView'),
  crawls: () => import('./views/CrawlsView'),
  pdfs: () => import('./views/PdfsView'),
  keys: () => import('./views/KeysView'),
  brand: () => import('./views/BrandView'),
  account: () => import('./views/AccountView'),
}

type Gate =
  | { readonly kind: 'loading' }
  | { readonly kind: 'off' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'out' }
  | { readonly kind: 'in'; readonly account: AccountSummary }

interface Props {
  lang: Lang
  page: AppPage
}

/**
 * The signed-in dashboard (M4.9): asks who is signed in (a visitor who is not goes to the sign-in
 * page), then draws the shell around one page's view. The shell is drawn at once, from the build, so
 * the menu does not appear after the data; the data comes in as it is read.
 */
export default function AppFrame({ lang, page }: Props) {
  const clientId = PUBLIC_AUTH_GOOGLE_CLIENT_ID ?? ''
  const [gate, setGate] = useState<Gate>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    if (clientId === '') {
      setGate({ kind: 'off' })
      return
    }
    void readAccount().then((read) => {
      if (!live) return
      if (!read.ok) {
        setGate({ kind: read.problem === 'not-found' ? 'off' : 'failed' })
        return
      }
      if (read.value === null) {
        setGate({ kind: 'out' })
        window.location.replace(loginHref(lang))
        return
      }
      setGate({ kind: 'in', account: read.value })
    })
    return () => {
      live = false
    }
  }, [clientId, lang, attempt])

  // The account's language is set from the page's, once, as the account page did.
  const account = gate.kind === 'in' ? gate.account : null
  useEffect(() => {
    if (account?.language !== null) return
    void setLanguage(lang).then((set) => {
      if (set.ok) setGate({ kind: 'in', account: set.value })
    })
  }, [account, lang])

  if (gate.kind === 'in') {
    return (
      <SharedProvider lang={lang} account={gate.account}>
        <Chrome
          lang={lang}
          page={page}
          account={gate.account}
          onAccount={(next) => {
            setGate({ kind: 'in', account: next })
          }}
        >
          <PageView lang={lang} page={page} />
        </Chrome>
      </SharedProvider>
    )
  }
  const t = APP_UI[lang].shell
  return (
    <Chrome lang={lang} page={page} account={null} onAccount={() => undefined}>
      {gate.kind === 'loading' && (
        <div aria-busy="true">
          <p role="status" className="m-0 mb-6 text-small text-ink-2">
            {t.loading}
          </p>
          <Skeleton rows={4} />
        </div>
      )}
      {gate.kind === 'out' && (
        <p role="status" className="m-0 text-body text-ink-2">
          {t.toLogin}
        </p>
      )}
      {gate.kind === 'off' && <p className="m-0 max-w-[60ch] text-body text-ink-2">{t.off}</p>}
      {gate.kind === 'failed' && (
        <Notice
          text={t.failed}
          retry={() => {
            setGate({ kind: 'loading' })
            setAttempt((n) => n + 1)
          }}
          action={t.retry}
        />
      )}
    </Chrome>
  )
}

interface ChromeProps {
  lang: Lang
  page: AppPage
  account: AccountSummary | null
  onAccount: (next: AccountSummary) => void
  children: preact.ComponentChildren
}

/** The sidebar, the top bar, the phone's bar, the search, and the room for the page. */
function Chrome({ lang, page, account, onAccount, children }: ChromeProps) {
  const shared = useSharedMaybe()
  const [collapsed, setCollapsed] = useState(false)
  const [searching, setSearching] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [siteId, setSiteId] = useState<string | null>(null)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('arablyzer-app-collapsed') === '1')
    } catch {
      // The menu starts open.
    }
    if (page === 'site') setSiteId(siteIdOf(window.location.search))
  }, [page])

  // Ctrl or ⌘ K, and «/» outside a field, open the search.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearching(true)
      } else if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const siteName =
    siteId === null
      ? null
      : (() => {
          const found = shared?.sites.find((site) => site.id === siteId)
          return found === undefined ? null : hostOf(found.url)
        })()

  return (
    <div className="app" data-collapsed={collapsed ? 'true' : 'false'}>
      <Sidebar
        lang={lang}
        page={page}
        collapsed={collapsed}
        onCollapse={() => {
          const next = !collapsed
          setCollapsed(next)
          try {
            localStorage.setItem('arablyzer-app-collapsed', next ? '1' : '0')
          } catch {
            // It lasts for this page.
          }
        }}
      />
      <div className="app-main">
        <Topbar
          lang={lang}
          page={page}
          siteId={siteId}
          siteName={siteName}
          account={account}
          onAccount={onAccount}
          onSearch={() => {
            setSearching(true)
          }}
        />
        <main id="main" className="app-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <BottomBar
        lang={lang}
        page={page}
        open={sheet}
        onOpen={() => {
          setSheet(true)
        }}
        onClose={() => {
          setSheet(false)
        }}
      />
      <Palette
        lang={lang}
        open={searching}
        onClose={() => {
          setSearching(false)
        }}
      />
    </div>
  )
}

/** One page's view, fetched as a chunk of its own the first time the page is shown. */
function PageView({ lang, page }: ViewProps & { page: AppPage }) {
  const [View, setView] = useState<ComponentType<ViewProps> | null>(null)
  useEffect(() => {
    let live = true
    void VIEWS[page]().then((loaded) => {
      if (live) setView(() => loaded.default)
    })
    return () => {
      live = false
    }
  }, [page])
  return View === null ? <Skeleton rows={4} /> : <View lang={lang} />
}
