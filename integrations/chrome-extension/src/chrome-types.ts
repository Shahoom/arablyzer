// The part of the `chrome.*` API this extension uses, and no more: the popup and the options page
// take it as an argument, so tests hand them a stand-in, and the real `chrome` is passed in at the
// two entry points alone.

export interface StorageArea {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | string[]): Promise<void>
}

export interface ChromeTab {
  readonly id?: number
  readonly url?: string
}

export interface ChromeApi {
  readonly storage: { readonly sync: StorageArea; readonly session: StorageArea }
  readonly tabs: {
    query(query: { active: boolean; currentWindow: boolean }): Promise<ChromeTab[]>
    create(properties: { url: string }): Promise<ChromeTab>
  }
  readonly action: {
    setBadgeText(details: { text: string; tabId?: number }): Promise<void>
    setBadgeBackgroundColor(details: { color: string; tabId?: number }): Promise<void>
  }
  readonly permissions: {
    contains(permissions: { origins: string[] }): Promise<boolean>
    request(permissions: { origins: string[] }): Promise<boolean>
  }
  readonly runtime: { openOptionsPage(): Promise<void> }
  readonly i18n: { getUILanguage(): string }
}

declare global {
  // Present on extension pages; the entry points read it once.
  const chrome: ChromeApi
}
