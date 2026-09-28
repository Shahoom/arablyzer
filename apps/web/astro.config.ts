import { defineSite, PREVIEW_SITE } from '@arablyzer/seo/site'
import react from '@astrojs/react'
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
  // Pages land where packages/seo's PATHS says: /, /en/, /tools/<slug>.
  build: { format: 'preserve' },
  trailingSlash: 'ignore',
  integrations: [react()],
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
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      subsets: ['arabic', 'latin'],
      fallbacks: ['Segoe UI', 'Tahoma', 'sans-serif'],
    },
    {
      provider: fontsource(),
      name: 'IBM Plex Mono',
      cssVariable: '--font-plex-mono',
      weights: [400, 500, 600],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-monospace', 'monospace'],
    },
  ],
})
