#!/usr/bin/env -S node --import tsx
import { pathToFileURL } from 'node:url'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { API_KEY_PATTERN } from '@arablyzer/api-contract'
import { createApiClient, type Fetcher } from './client'
import { createMcpServer } from './server'

export const KEY_VARIABLE = 'ARABLYZER_API_KEY'
export const URL_VARIABLE = 'ARABLYZER_API_URL'

/** The key and the address from the environment, or why there is none: stdout is the protocol's, so the reason goes to stderr. */
export function settingsFrom(
  env: Readonly<Record<string, string | undefined>>,
): { readonly apiKey: string; readonly baseUrl: string } | { readonly problem: string } {
  const apiKey = env[KEY_VARIABLE]?.trim() ?? ''
  const baseUrl = env[URL_VARIABLE]?.trim() ?? ''
  if (!API_KEY_PATTERN.test(apiKey)) {
    return {
      problem: `${KEY_VARIABLE} must be an API key from the account page (arb_ and 43 characters).`,
    }
  }
  try {
    const url = new URL(baseUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('scheme')
  } catch {
    return {
      problem: `${URL_VARIABLE} must be the address of your Arablyzer, such as https://arablyzer.example.`,
    }
  }
  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, '') }
}

/** Serves MCP on stdin and stdout, calling the API with the key. */
export async function serveStdio(
  env: Readonly<Record<string, string | undefined>>,
  fetcher: Fetcher,
): Promise<number> {
  const settings = settingsFrom(env)
  if ('problem' in settings) {
    process.stderr.write(`arablyzer-mcp: ${settings.problem}\n`)
    return 2
  }
  const server = createMcpServer({
    client: createApiClient({ ...settings, fetcher }),
  })
  await server.connect(new StdioServerTransport())
  return 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // The one request path: to Arablyzer's own API, with the person's key (not scan traffic, which
  // leaves the scanner through the egress proxy).
  const code = await serveStdio(process.env, (input, init) => fetch(input, init))
  if (code !== 0) process.exit(code)
}
