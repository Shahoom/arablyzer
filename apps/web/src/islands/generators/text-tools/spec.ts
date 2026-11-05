import type { Lang } from '@arablyzer/seo/site'

/** One field of a text tool's form. */
export interface TextField {
  readonly name: string
  readonly kind: 'text' | 'textarea' | 'select'
  readonly label: string
  readonly hint?: string
  readonly placeholder?: string
  readonly rows?: number
  /** A field that holds an address, code or number is left to right; free text follows what is typed. */
  readonly dir?: 'ltr' | 'auto'
  readonly options?: readonly { readonly value: string; readonly label: string }[]
  readonly required?: boolean
}

export type Tone = 'ok' | 'warn' | 'bad' | 'info'

/** What a text tool answers with: code the visitor copies, a list of notes, or a line. */
export type Block =
  | { readonly kind: 'code'; readonly label: string; readonly text: string }
  | {
      readonly kind: 'notes'
      readonly label?: string
      readonly items: readonly { readonly tone: Tone; readonly text: string }[]
    }
  | { readonly kind: 'text'; readonly label?: string; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string }

export type TextToolResult = { readonly error: string } | { readonly blocks: readonly Block[] }

/**
 * A generator or a paste tool that runs in the page (M10.1): a form, and a pure function from what
 * was typed to what is shown. The logic is in packages/generators; this says what the form asks
 * and how the answer reads in each language.
 */
export interface TextToolSpec {
  /** The form's `data-tool-kind`. */
  readonly kind: 'generator' | 'paste'
  readonly fields: (lang: Lang) => readonly TextField[]
  readonly submit: (lang: Lang) => string
  readonly run: (values: Readonly<Record<string, string>>, lang: Lang) => TextToolResult
}
