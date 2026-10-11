import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'

/** What the Action does to the workflow run: logs, outputs, the job summary. A test swaps it. */
export interface Sink {
  info(line: string): void
  warning(line: string): void
  error(line: string): void
  output(name: string, value: string): void
  summary(markdown: string): void
  mask(secret: string): void
}

/** One line of log, safe to print: a line that starts `::` would be read as a workflow command. */
export function plain(text: string): string {
  const line = text.replace(/[\r\n]+/g, ' ')
  return line.startsWith('::') ? ` ${line}` : line
}

/** The data of a workflow command: one line, with `%` escaped as the runner reads it. */
const command = (text: string): string => plain(text).replace(/%/g, '%25')

type Env = Readonly<Record<string, string | undefined>>

/** The runner's own channels: stdout for commands and logs, and the files named in the environment. */
export function runnerSink(env: Env, write: (text: string) => void): Sink {
  const line = (text: string) => {
    write(`${text}\n`)
  }
  const appendTo = (name: string, text: string) => {
    const file = env[name]
    if (file !== undefined && file !== '') appendFileSync(file, text)
  }
  return {
    info: (text) => {
      line(plain(text))
    },
    warning: (text) => {
      line(`::warning::${command(text)}`)
    },
    error: (text) => {
      line(`::error::${command(text)}`)
    },
    output: (name, value) => {
      // A random delimiter, so a value can never end the block and start another output.
      const delimiter = `ghadelimiter_${randomUUID()}`
      appendTo('GITHUB_OUTPUT', `${name}<<${delimiter}\n${value}\n${delimiter}\n`)
    },
    summary: (markdown) => {
      appendTo('GITHUB_STEP_SUMMARY', `${markdown}\n`)
    },
    mask: (secret) => {
      line(`::add-mask::${secret}`)
    },
  }
}
