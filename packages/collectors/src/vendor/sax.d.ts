// The part of sax (isaacs/sax-js) the sitemap reader uses: a strict parser that leaves namespaces
// to the caller, with positions. sax ships no types; tsconfig.base.json lists this file in every
// package's program, since other packages compile the collectors' source.

declare module 'sax' {
  /** An element's start tag, its names as written: `xmlns` is off, so no prefix is resolved. */
  export interface Tag {
    readonly name: string
    /** Attribute name → value, each name once: sax leaves out a name it has already read. */
    readonly attributes: Readonly<Record<string, string>>
    readonly isSelfClosing: boolean
  }

  export interface SaxOptions {
    /** Leave false: sax's namespace mode slows quadratically with the attributes it reads. */
    readonly xmlns?: boolean
    readonly position?: boolean
    /** Only XML's five entities (amp, lt, gt, quot, apos), not HTML's. */
    readonly strictEntities?: boolean
  }

  export interface SAXParser {
    /** Where the parser is, from 0. */
    readonly line: number
    readonly column: number
    /** A start tag has begun: its name, before any attribute. */
    onopentagstart: (tag: { readonly name: string }) => void
    /** An attribute has been read, and again for none it read before on the tag. */
    onattribute: (attribute: { readonly name: string; readonly value: string }) => void
    onopentag: (tag: Tag) => void
    onclosetag: (name: string) => void
    onerror: (error: Error) => void
    write(chunk: string): SAXParser
    close(): SAXParser
  }

  const sax: { parser(strict: boolean, options?: SaxOptions): SAXParser }
  export default sax
}
