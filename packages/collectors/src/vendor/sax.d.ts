// The part of sax (isaacs/sax-js) the sitemap reader uses: a strict parser with namespaces and
// positions. sax ships no types; tsconfig.base.json lists this file in every package's program,
// since other packages compile the collectors' source.

declare module 'sax' {
  export interface QualifiedAttribute {
    readonly name: string
    readonly value: string
    readonly prefix: string
    readonly local: string
    readonly uri: string
  }

  /** An element's start tag, its name resolved against the namespaces in scope. */
  export interface QualifiedTag {
    readonly name: string
    readonly prefix: string
    readonly local: string
    /** The namespace; '' for none. */
    readonly uri: string
    readonly attributes: Readonly<Record<string, QualifiedAttribute>>
    readonly isSelfClosing: boolean
  }

  export interface SaxOptions {
    readonly xmlns?: boolean
    readonly position?: boolean
    /** Only XML's five entities (amp, lt, gt, quot, apos), not HTML's. */
    readonly strictEntities?: boolean
  }

  export interface SAXParser {
    /** Where the parser is, from 0. */
    readonly line: number
    readonly column: number
    onopentag: (tag: QualifiedTag) => void
    onclosetag: (name: string) => void
    onerror: (error: Error) => void
    write(chunk: string): SAXParser
    close(): SAXParser
  }

  const sax: { parser(strict: boolean, options?: SaxOptions): SAXParser }
  export default sax
}
