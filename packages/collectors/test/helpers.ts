/** Encodes text in a single-byte legacy encoding (e.g. windows-1256), for fixtures and tests. */
export function encodeSingleByte(text: string, encoding: string): Uint8Array {
  const decoder = new TextDecoder(encoding)
  const table = new Map<string, number>()
  for (let byte = 0; byte < 256; byte++) {
    const char = decoder.decode(new Uint8Array([byte]))
    if (char !== '�' && !table.has(char)) table.set(char, byte)
  }
  const bytes: number[] = []
  for (const char of text) {
    const byte = table.get(char)
    if (byte === undefined) throw new Error(`${encoding} cannot encode ${JSON.stringify(char)}`)
    bytes.push(byte)
  }
  return new Uint8Array(bytes)
}

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

/**
 * The CPU time this thread has used so far, in milliseconds. A bound on the clock measures the
 * machine's load as much as the code: CI runs every package's suites at once on two CPUs, and a
 * read of 50,000 sitemap URLs that takes about 70 ms alone took over a second there. CPU time
 * does not run while the thread waits for a CPU, so a bound on it says what the code costs.
 */
export function cpuMs(): number {
  // Node before 22.19 has no per-thread time; a test file has a process of its own, so the
  // process's is the same.
  const { user, system } =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage()
  return (user + system) / 1000
}

/** What `work` returns, and the CPU time it took, in milliseconds (see cpuMs). */
export function cpuTimed<T>(work: () => T): { result: T; ms: number } {
  const started = cpuMs()
  const result = work()
  return { result, ms: cpuMs() - started }
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
