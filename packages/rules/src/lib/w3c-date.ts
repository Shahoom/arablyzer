/** W3C Datetime as the sitemaps protocol takes it: a date, or a date with a time and a zone. */
const DATE =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/

/** Whether a text is a W3C datetime, on a day the calendar has (2026-02-30 is shaped like one and is not). */
export function isW3cDate(value: string): boolean {
  if (!DATE.test(value)) return false
  const [year = 0, month = 0, day = 0] = value.slice(0, 10).split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}
