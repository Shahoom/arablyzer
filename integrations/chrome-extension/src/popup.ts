import { INTEGRATIONS_UI } from '@arablyzer/i18n/integrations'
import { createApiClient } from '@arablyzer/integrations-core'
import { el, fill, type Child } from './dom'
import { startPopup, type Popup, type PopupContext, type PopupState } from './controller'

// The popup. The scan itself is in controller.ts, tested with a stand-in for Chrome; this file
// only draws a state. The one request path: to the Arablyzer service named in the settings, with
// the person's key (the extension's host permission is for that address alone).

const root = document.getElementById('root')
const settingsButton = document.getElementById('settings')
if (root === null || settingsButton === null) throw new Error('popup.html is missing its parts')

let popup: Popup | null = null

function pageCard(url: string, label: string): HTMLElement {
  return el(
    'section',
    { class: 'card page' },
    el('p', { class: 'label' }, label),
    el('p', { class: 'url', dir: 'ltr', title: url }, url),
  )
}

function button(
  label: string,
  onClick: () => void,
  kind: 'primary' | 'quiet' = 'primary',
): HTMLButtonElement {
  const node = el('button', { type: 'button', class: `btn ${kind}` }, label)
  node.addEventListener('click', onClick)
  return node
}

function body(state: PopupState, context: PopupContext): Child[] {
  const t = INTEGRATIONS_UI[context.lang].extension.popup
  switch (state.kind) {
    case 'loading':
      return []
    case 'unsupported':
      return [el('p', { class: 'note' }, t.unsupported)]
    case 'no-key':
      return [
        pageCard(state.url, t.page),
        el(
          'section',
          { class: 'card' },
          el('h2', { class: 'heading' }, t.noKeyTitle),
          el('p', { class: 'note' }, t.noKeyLead),
          button(t.openSite, () => void popup?.openSite()),
          button(t.addKey, () => void popup?.openSettings(), 'quiet'),
        ),
      ]
    case 'ready':
      return [pageCard(state.url, t.page), button(t.scan, () => void popup?.scan())]
    case 'scanning':
      return [
        pageCard(state.url, t.page),
        el(
          'p',
          { class: 'progress', role: 'status' },
          el('span', { class: 'spinner', 'aria-hidden': 'true' }),
          t.states[state.phase],
        ),
      ]
    case 'error': {
      const message = state.problem === 'noPermission' ? t.noPermission : t.problems[state.problem]
      return [
        pageCard(state.url, t.page),
        el(
          'p',
          { class: 'error', role: 'alert' },
          message,
          state.retryAfterSeconds === undefined
            ? null
            : ` ${t.retryAfter(state.retryAfterSeconds)}`,
        ),
        button(t.scanAgain, () => void popup?.scan()),
        state.problem === 'unauthorized' || state.problem === 'noPermission'
          ? button(t.settings, () => void popup?.openSettings(), 'quiet')
          : null,
      ]
    }
    case 'done': {
      const { result } = state
      const band = result.band
      return [
        pageCard(state.url, t.page),
        el(
          'section',
          { class: 'card score' },
          el('p', { class: 'label' }, t.score),
          result.score === null
            ? el('p', { class: 'note' }, t.noScore)
            : el(
                'div',
                { class: 'score-row' },
                el('p', { class: `big ${band ?? ''}` }, String(result.score)),
                el(
                  'div',
                  { class: 'score-side' },
                  el(
                    'p',
                    { class: 'band' },
                    `${t.scoreOf(result.score)} · ${band === null ? '' : t.bands[band]}`,
                  ),
                  el('meter', {
                    min: '0',
                    max: '100',
                    low: '50',
                    high: '90',
                    optimum: '100',
                    value: String(result.score),
                    'aria-label': t.score,
                  }),
                ),
              ),
          result.partial ? el('p', { class: 'note small' }, t.partial) : null,
          el(
            'ul',
            { class: 'counts' },
            ...result.counts.map((item) =>
              el(
                'li',
                { class: `count ${item.severity}${item.count === 0 ? ' zero' : ''}` },
                el('span', { class: 'n' }, String(item.count)),
                el('span', { class: 'k' }, t.severity[item.severity]),
              ),
            ),
          ),
        ),
        el(
          'section',
          { class: 'card' },
          el('h2', { class: 'heading' }, t.topIssues),
          result.issues.length === 0
            ? el('p', { class: 'note' }, t.noIssues)
            : el(
                'ul',
                { class: 'issues' },
                ...result.issues.map((issue) =>
                  el(
                    'li',
                    { class: 'issue' },
                    el('span', { class: `pill ${issue.severity}` }, t.severity[issue.severity]),
                    el(
                      'a',
                      {
                        class: 'rule',
                        href: issue.href,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        dir: 'ltr',
                        title: t.ruleLink(issue.ruleId),
                      },
                      issue.ruleId,
                    ),
                    el('span', { class: 'occ' }, t.occurrences(issue.occurrences)),
                    el('p', { class: 'msg' }, issue.message),
                  ),
                ),
              ),
          result.more > 0 ? el('p', { class: 'note small' }, t.moreIssues(result.more)) : null,
        ),
        el(
          'a',
          {
            class: 'btn primary',
            href: state.reportUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          t.openReport,
        ),
        button(t.scanAgain, () => void popup?.scan(), 'quiet'),
      ]
    }
  }
}

function render(state: PopupState, context: PopupContext | null): void {
  if (context !== null) {
    document.documentElement.lang = context.lang
    document.documentElement.dir = context.lang === 'ar' ? 'rtl' : 'ltr'
    settingsButton?.setAttribute(
      'aria-label',
      INTEGRATIONS_UI[context.lang].extension.popup.settings,
    )
    settingsButton?.setAttribute('title', INTEGRATIONS_UI[context.lang].extension.popup.settings)
  }
  if (root === null) return
  root.setAttribute('aria-busy', String(state.kind === 'loading'))
  fill(root, ...(context === null ? [] : body(state, context)))
}

settingsButton.addEventListener('click', () => void popup?.openSettings())

popup = await startPopup(
  {
    chrome,
    makeClient: (settings) =>
      createApiClient({
        baseUrl: settings.host,
        apiKey: settings.apiKey,
        fetcher: (input, init) => fetch(input, init),
      }),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  },
  render,
)
