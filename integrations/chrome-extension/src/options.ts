import { INTEGRATIONS_UI } from '@arablyzer/i18n/integrations'
import { createApiClient } from '@arablyzer/integrations-core'
import { removeKey, save, test, type Form, type Outcome } from './options-flow'
import { loadSettings, pickLang, type LangSetting } from './settings'

// The options page: the key, the service address and the language. The flows are in
// options-flow.ts (tested with a stand-in for Chrome); this file reads the form and shows the
// outcome. The one request path: the key test, to the service named in the form.

const typed = <T extends HTMLElement>(id: string, type: new () => T): T => {
  const node = document.getElementById(id)
  if (!(node instanceof type)) throw new Error(`options.html has no ${type.name} #${id}`)
  return node
}
const byId = (id: string): HTMLElement => typed(id, HTMLElement)
const form = typed('form', HTMLFormElement)
const keyField = typed('key', HTMLInputElement)
const hostField = typed('host', HTMLInputElement)
const langField = typed('lang', HTMLSelectElement)
const status = typed('status', HTMLParagraphElement)

const deps = {
  chrome,
  makeClient: (settings: { apiKey: string; host: string }) =>
    createApiClient({
      baseUrl: settings.host,
      apiKey: settings.apiKey,
      fetcher: (input, init) => fetch(input, init),
    }),
}

const stored = await loadSettings(chrome.storage.sync)
keyField.value = stored.apiKey
hostField.value = stored.host
langField.value = stored.lang

const current = (): Form => ({
  apiKey: keyField.value,
  host: hostField.value,
  lang: langField.value as LangSetting,
})
const ui = () =>
  INTEGRATIONS_UI[pickLang(current().lang, chrome.i18n.getUILanguage())].extension.options

function paint(): void {
  const lang = pickLang(current().lang, chrome.i18n.getUILanguage())
  const t = INTEGRATIONS_UI[lang].extension.options
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  document.title = t.title
  const text = (id: string, value: string) => {
    byId(id).textContent = value
  }
  text('title', t.title)
  text('lead', t.lead)
  text('key-label', t.keyLabel)
  text('key-help', t.keyHelp)
  text('host-label', t.hostLabel)
  text('host-help', t.hostHelp)
  text('lang-label', t.langLabel)
  text('lang-auto', t.langAuto)
  text('save', t.save)
  text('test', t.test)
  text('remove', t.remove)
  text('privacy', t.privacy)
}

function show(outcome: Outcome): void {
  const t = ui()
  status.className = outcome.ok ? 'status ok' : 'status bad'
  status.textContent = outcome.ok
    ? t[outcome.done === 'saved' ? 'saved' : outcome.done]
    : t.problems[outcome.problem]
}

paint()
langField.addEventListener('change', paint)
form.addEventListener('submit', (event) => {
  event.preventDefault()
  void save(deps, current()).then(show)
})
byId('test').addEventListener('click', () => {
  status.className = 'status'
  status.textContent = ui().testing
  void test(deps, current()).then(show)
})
byId('remove').addEventListener('click', () => {
  void removeKey(deps, current()).then((outcome) => {
    keyField.value = ''
    show(outcome)
  })
})
