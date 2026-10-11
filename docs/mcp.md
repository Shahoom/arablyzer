# Arablyzer MCP server

An AI assistant can scan a page, read its report and read the rule library through the
[Model Context Protocol](https://modelcontextprotocol.io). The server is a thin layer over the public API
(`/api/v1`, described by `/api/v1/openapi.json`): it calls the API with your key and never reaches the engine, so
every quota, limit and egress rule of the API applies to it. Scans come out of your account's own scan quota.

You need an account and an API key: sign in, open `/account`, and make a key in "API keys". The secret begins
`arb_` and is shown once.

## Tools

| Tool         | What it does                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `scan_page`  | Scans a page (all rules, in the engines the service runs), waits for it, answers with the score, counts, worst issues. |
| `get_report` | The same summary for a scan started earlier (`scan_id`); waits a little if it is still running.                       |
| `run_tool`   | Runs one tool (its rules alone) on a page. `list_tools` names them.                                                    |
| `list_tools` | The tools, filtered by a word; by default those `run_tool` can run.                                                    |

`scan_page` and `run_tool` take `wait_seconds` (default 45, at most 120): a scan that has not finished by then is
answered with its `scanId` and state, and `get_report` picks it up. `max_issues` bounds the list of problems
(default 15, worst first). The same page scanned again within ten minutes returns the earlier scan and uses no quota.
Failures come back as tool errors with the API's code (`rate_limited`, `plan_limit`, `blocked_target`, …).

## Resources

The rule library: `arablyzer://rules` (an index), and `arablyzer://rules/en/<rule-id>` and
`arablyzer://rules/ar/<rule-id>` for a rule's explanation (why it matters, how to fix it, how it is detected) in
English or Arabic. A finding in a summary names its `ruleId`.

## Remote (streamable HTTP)

`POST https://<your-arablyzer-host>/mcp` with `Authorization: Bearer arb_…`. The endpoint is stateless: no session, JSON
answers, `GET` and `DELETE` answer 405. Without a valid key it answers 401, and with accounts off 503 `accounts_off`.

```json
{
  "mcpServers": {
    "arablyzer": {
      "type": "http",
      "url": "https://<your-arablyzer-host>/mcp",
      "headers": { "Authorization": "Bearer arb_…" }
    }
  }
}
```

## Local (stdio)

From a checkout of the repository (`pnpm install` once). The key and the address come from the environment; stdout is
the protocol's, so problems are written to stderr.

```json
{
  "mcpServers": {
    "arablyzer": {
      "command": "node",
      "args": ["--import", "tsx", "/path/to/arablyzer/packages/mcp/src/stdio.ts"],
      "env": {
        "ARABLYZER_API_URL": "https://<your-arablyzer-host>",
        "ARABLYZER_API_KEY": "arb_…"
      }
    }
  }
}
```

| Variable            | Meaning                                                     |
| ------------------- | ----------------------------------------------------------- |
| `ARABLYZER_API_URL` | The address of the Arablyzer to call (http or https).       |
| `ARABLYZER_API_KEY` | An API key from the account page.                           |

## Notes

- `@modelcontextprotocol/sdk` is pinned (1.32.0) in `packages/mcp/package.json`.
- `packages/mcp` is private: publishing it to npm is the owner's decision.
- Keys are for servers and tools, never for code that runs in a browser. Revoke a key on `/account` at any time.
