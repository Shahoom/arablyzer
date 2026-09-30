import { defineSite, PREVIEW_SITE } from '@arablyzer/seo/site'
import preact from '@astrojs/preact'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, envField } from 'astro/config'
import { fontsource } from './src/fonts'

// The domain is the owner's decision (BUILD-PLAN §20.1); until then pages are built for the
// reserved example domain, as the self-audit does. ARABLYZER_SITE sets the real one.
const site = defineSite(process.env.ARABLYZER_SITE ?? PREVIEW_SITE.origin)

// Where `astro dev` sends /api (M2.1b); the built site is served beside the API by Caddy (M2.1d).
const api = process.env.ARABLYZER_API_ORIGIN ?? 'http://127.0.0.1:8787'

/** Cloudflare Turnstile's script and frame, on the scan form (M2.1b). */
const TURNSTILE = 'https://challenges.cloudflare.com'

export default defineConfig({
  site: site.origin,
  output: 'static',
  // Pages land where packages/seo's PATHS says: /, /en/, /tools/<slug>. The CSS is inlined: on a
  // phone, a stylesheet request delayed the first paint (M2.1 plan §3, measured).
  build: { format: 'preserve', inlineStylesheets: 'always' },
  trailingSlash: 'ignore',
  // Preact, not React: the same components, and a tenth of the script a page loads before its
  // largest paint on a phone (M2.1 plan §3, measured).
  integrations: [
    preact(),
    {
      // One page serves every report: /r/{id} and /en/r/{id} are /r/ and /en/r/, as the site's
      // server sends them in production (infra/Caddyfile). This does the same for `astro dev`.
      name: 'arablyzer:report-route',
      hooks: {
        'astro:server:setup': ({ server }) => {
          server.middlewares.use((req, _res, next) => {
            const match = /^(\/en)?\/r\/[A-Za-z0-9_-]{22}\/?(?:\?.*)?$/.exec(req.url ?? '')
            if (match !== null) req.url = `${match[1] ?? ''}/r/`
            next()
          })
        },
      },
    },
  ],
  vite: {
    plugins: [tailwindcss()],
    server: { proxy: { '/api': api } },
  },
  devToolbar: { enabled: false },
  // Each page carries its Content-Security-Policy, with the hash of every script and style it
  // inlines (M2.1 plan §5b): scripts from the site and Turnstile alone, requests to the site
  // alone. Framing is refused by the site's server (infra/Caddyfile), in a Content-Security-Policy
  // header of its own and in X-Frame-Options, as a page's own policy cannot say it.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "connect-src 'self'",
        "img-src 'self'",
        `frame-src ${TURNSTILE}`,
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ],
      scriptDirective: { resources: ["'self'", TURNSTILE] },
      styleDirective: { resources: ["'self'"] },
    },
  },
  env: {
    schema: {
      // Turnstile's site key is public: it goes into the page. Unset, the form has no check,
      // which the API accepts only where its TURNSTILE_SECRET is unset too (development).
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
    },
  },
  fonts: [
    {
      provider: fontsource(),
      name: 'IBM Plex Sans Arabic',
      cssVariable: '--font-plex-arabic',
      // Two weights, regular and semibold: each is another file on the page's first paint.
      weights: [400, 600],
      styles: ['normal'],
      subsets: ['arabic', 'latin'],
      fallbacks: ['Segoe UI', 'Tahoma', 'sans-serif'],
    },
    {
      // Its Arabic letters are IBM Plex Sans Arabic's, for code that quotes Arabic (fonts.ts).
      provider: fontsource({ borrow: { arabic: 'IBM Plex Sans Arabic' } }),
      name: 'IBM Plex Mono',
      cssVariable: '--font-plex-mono',
      weights: [400, 600],
      styles: ['normal'],
      subsets: ['latin', 'arabic'],
      fallbacks: ['ui-monospace', 'monospace'],
    },
  ],
})
