import { defineSite, PREVIEW_SITE } from '@arablyzer/seo/site'
import preact from '@astrojs/preact'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
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
  // Preact, not React: the same components, and a tenth of the script a page loads before its
  // largest paint on a phone (M2.1 plan §3, measured).
  integrations: [preact()],
  vite: {
    plugins: [tailwindcss()],
    server: { proxy: { '/api': api } },
  },
  devToolbar: { enabled: false },
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
      provider: fontsource(),
      name: 'IBM Plex Mono',
      cssVariable: '--font-plex-mono',
      weights: [400, 600],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-monospace', 'monospace'],
    },
  ],
})
