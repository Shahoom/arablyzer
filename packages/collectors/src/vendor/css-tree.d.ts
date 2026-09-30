// css-tree's parser and walker alone, without its lexer: the lexer loads its syntax data from JSON
// files at run time (createRequire), which the CLI's single-file bundle cannot carry.
// @types/css-tree covers only the package's main entry; tsconfig.base.json lists this file in
// every package's program, since other packages compile the collectors' source.

declare module 'css-tree/parser' {
  import type { CssNode, ParseOptions } from 'css-tree'

  const parse: (text: string, options?: ParseOptions) => CssNode
  export default parse
}

declare module 'css-tree/walker' {
  import type { CssNode, EnterOrLeaveFn, WalkOptions } from 'css-tree'

  const walk: {
    (ast: CssNode, options: EnterOrLeaveFn | WalkOptions): void
    readonly break: symbol
    readonly skip: symbol
  }
  export default walk
}
