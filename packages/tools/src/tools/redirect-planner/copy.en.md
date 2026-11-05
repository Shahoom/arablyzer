---
summary: Check a list of redirects before a migration: chains, loops, clashes, one hop each.
---

# Redirect planner

Paste your redirects, the old address then the new on each line, and see them as a crawler will meet them: chains turned into one hop, loops and clashes named, and every line it could not use explained. Arabic paths are read as they are. It requests nothing.

## What it checks

- Chains: /a to /b to /c becomes /a to /c and /b to /c, so a visitor and a crawler make one hop.
- Loops that never end, and the same address redirected to two places.
- An address redirected to itself, a repeated line, and a line that is not a pair.
- Characters that a server’s config cannot take (a space, a quote, a bracket, a semicolon) and sources with a query or a star.
- The list after it is flattened, ready for the redirect generator.

## Example

### Wrong

```http
HTTP/1.1 302 Found
Location: https://www.example.com/old

HTTP/1.1 301 Moved Permanently
Location: https://www.example.com/new

HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

### Right

```http
HTTP/1.1 301 Moved Permanently
Location: https://www.example.com/new

HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

## How to fix

Plan the list, then write the config with the redirect generator, then test with the redirect checker on live addresses:

```text
/old-page /new-page
/collections/old /collections/new
```

- Redirect each old address straight to its final home: one hop, and the permanent status (301) when the move is permanent.
- Send an address to the page that answers the same need, not to the home page: Google treats a mass redirect to the home page as a soft 404.
- Keep the redirects for as long as the old addresses are linked or ranked, a year at the least.
- Update your internal links and sitemap to the new addresses; do not leave them to the redirects.

## FAQ

### Why flatten chains?

Each hop costs a request and some patience: crawlers follow a limited number of hops, and a visitor waits for every one. One hop is faster and safer.

### Where does it say how to write the redirects for my server?

In the redirect generator, which takes the same list and writes Apache, nginx, `_redirects` and Vercel config.

### Does what I type reach Arablyzer?

No. The planner runs in your browser, and nothing you type leaves it.

## Methodology

The planner runs in your browser. It reads each line as an old address and a new one separated by a space, a comma, a tab or an arrow, normalises the paths (decoded, no trailing slash), follows each source to its end, and names a path met twice on the way as a loop. The examples are judged by the redirect checks Arablyzer runs on a live address (`redirect-chain`, `redirect-temporary`).
