import { defineSite, PREVIEW_SITE } from '@arablyzer/seo/site'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, envField } from 'astro/config'
import { fontsource } from './src/fonts'

// The domain is the owner's decision (BUILD-PLAN §20.1); until then pages are built for the
// reserved example domain, as the self-audit does. ARABLYZER_SITE sets the real one.
const site = defineSite(process.env.ARABLYZER_SITE ?? PREVIEW_SITE.origin)

// Where `astro dev` sends /api (M2.1b); the built site is served beside the API by Caddy (M2.1c).
const api = process.env.ARABLYZER_API_ORIGIN ?? 'http://127.0.0.1:8787'

export default defineConfig({
  site: site.origin,
  output: 'static',
  // Pages land where packages/seo's PATHS says: /, /en/, /tools/<slug>. The CSS is inlined: on a
  // phone, a stylesheet request delayed the first paint (M2.1 plan §3, measured).
  build: { format: 'preserve', inlineStylesheets: 'always' },
  trailingSlash: 'ignore',
  integrations: [
    react(),
    {
      // One page serves every report: /r/{id} and /en/r/{id} are /r/ and /en/r/, as the site's
      // server sends them in production (Caddy, M2.1c). This does the same for `astro dev`.
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
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      subsets: ['arabic', 'latin'],
      fallbacks: ['Segoe UI', 'Tahoma', 'sans-serif'],
    },
    {
      // Its Arabic letters are IBM Plex Sans Arabic's, for code that quotes Arabic (fonts.ts).
      provider: fontsource({ borrow: { arabic: 'IBM Plex Sans Arabic' } }),
      name: 'IBM Plex Mono',
      cssVariable: '--font-plex-mono',
      weights: [400, 500, 600],
      styles: ['normal'],
      subsets: ['latin', 'arabic'],
      fallbacks: ['ui-monospace', 'monospace'],
    },
  ],
})
