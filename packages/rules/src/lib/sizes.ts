/** Kilobytes (1,024 bytes) with one decimal, as messages show sizes. */
export function kilobytes(bytes: number): number {
  return Math.round(bytes / 102.4) / 10
}
