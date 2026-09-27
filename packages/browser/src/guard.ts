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
