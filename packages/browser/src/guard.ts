/** The function our page scripts hand their results to Node through (see RESULT_GUARD). */
export const RESULT_GUARD_NAME = '__arablyzerResult'

/** The most a page script may hand to Node, in characters of JSON: its results are far smaller. */
export const MAX_RESULT_LENGTH = 2_000_000

/**
 * Runs in every document before its own scripts: it keeps JSON.stringify as it was then, and
 * offers our page scripts a function that serializes their result with it, and hands over a
 * short note instead when the text is longer than MAX_RESULT_LENGTH. Our scripts run in the page's
 * own world, where the page can replace any built-in (String.prototype.slice, window.axe…) and so
 * make a result as large as it likes; what crosses to Node is this function's text, so Node never
 * holds more than the limit (M1.2b review). The page cannot replace the function: it is a
 * non-writable, non-configurable property of window, which the page cannot replace either.
 */
export const RESULT_GUARD = `(() => {
  const stringify = JSON.stringify;
  Object.defineProperty(window, '${RESULT_GUARD_NAME}', {
    value: (result) => {
      let text;
      try {
        text = stringify(result);
      } catch {
        return { unreadable: true };
      }
      if (typeof text !== 'string') return { unreadable: true };
      return text.length > ${MAX_RESULT_LENGTH} ? { tooLong: text.length } : text;
    },
    writable: false,
    configurable: false,
    enumerable: false,
  });
})()`

/** The function that gives the decoded size of the page's resources (see DECODED_SIZES). */
export const DECODED_SIZES_NAME = '__arablyzerDecodedSizes'

/**
 * Runs in every document before its own scripts, as RESULT_GUARD does: it keeps Resource Timing's
 * getters as they were then, and offers a function that lists each resource the document loaded
 * with its decoded body size (0 for a cross-origin one without Timing-Allow-Origin). A body is
 * read only when that size is known beforehand, since the browser hands over bodies decoded: a
 * page cannot then make Arablyzer hold a body larger than it expects by changing those getters
 * (docs/design/plans/m1.2c-css-fonts.md §0). Room is made for as many entries as a page may make
 * requests.
 */
export const DECODED_SIZES = `(() => {
  const timeline = window.performance;
  const apply = Reflect.apply;
  const entries = Performance.prototype.getEntriesByType;
  const name = Object.getOwnPropertyDescriptor(PerformanceEntry.prototype, 'name').get;
  const decoded = Object.getOwnPropertyDescriptor(
    PerformanceResourceTiming.prototype,
    'decodedBodySize',
  ).get;
  try {
    apply(Performance.prototype.setResourceTimingBufferSize, timeline, [1000]);
  } catch {}
  Object.defineProperty(window, '${DECODED_SIZES_NAME}', {
    value: () => {
      const list = apply(entries, timeline, ['resource']);
      const sizes = [];
      for (let i = 0; i < list.length && i < 1000; i++) {
        sizes[i] = [apply(name, list[i], []), apply(decoded, list[i], [])];
      }
      return sizes;
    },
    writable: false,
    configurable: false,
    enumerable: false,
  });
})()`

/** A function and its JSON arguments as source for page.evaluate (see measureSource). */
export function inPage(fn: (...args: never[]) => unknown, ...args: readonly unknown[]): string {
  const list = args.map((arg) => JSON.stringify(arg)).join(', ')
  return `(() => { const __name = (target) => target; return (${fn.toString()})(${list}) })()`
}

/** Source that hands a page expression's value to Node through the guard; it may be a promise. */
export function throughGuard(expression: string): string {
  return `(async () => window.${RESULT_GUARD_NAME}(await (${expression})))()`
}

/**
 * A page script's result as the guard handed it over, parsed; throws when the page made it too
 * long or unreadable, so the caller treats it as a script that failed.
 */
export function fromPage(handed: unknown): unknown {
  if (typeof handed === 'string') return JSON.parse(handed)
  const note =
    typeof handed === 'object' && handed !== null ? (handed as Record<string, unknown>) : {}
  if (typeof note.tooLong === 'number') {
    throw new Error(
      `the page's script result was ${String(note.tooLong)} characters, over the limit of ${String(MAX_RESULT_LENGTH)}`,
    )
  }
  throw new Error("the page's script result could not be read")
}
