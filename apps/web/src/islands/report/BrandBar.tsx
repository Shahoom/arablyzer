import {
  reportBrandLogoPath,
  reportBrandPath,
  type ReportBrand,
} from '@arablyzer/api-contract/codes'
import { PDF_UI } from '@arablyzer/i18n/pdf'
import type { Lang } from '@arablyzer/seo/site'
import { PUBLIC_AUTH_GOOGLE_CLIENT_ID } from 'astro:env/client'
import { useEffect, useRef, useState } from 'preact/hooks'
import { isReportBrand } from '../pdf-model'

/**
 * The company's mark on a shared report (M4.7), above the report, for a report whose account has
 * white-label: its logo, its name on its colour, and the small «by Arablyzer» line the plan may
 * remove. A report no account keeps, or one whose plan has no white-label, shows nothing. The
 * colour (already past the contrast check, on the API) is set on the element through the style
 * object: the page's policy allows no inline style attribute.
 */
export function BrandBar({ id, lang }: { id: string; lang: Lang }) {
  const t = PDF_UI[lang].ui.brand
  const [brand, setBrand] = useState<ReportBrand | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const on = (PUBLIC_AUTH_GOOGLE_CLIENT_ID ?? '') !== ''

  useEffect(() => {
    if (!on) return
    let live = true
    fetch(reportBrandPath(id), { credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then((response) => (response.ok ? (response.json() as Promise<unknown>) : null))
      .then((body) => {
        if (live && isReportBrand(body)) setBrand(body)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [id, on])

  const color = brand?.color
  useEffect(() => {
    if (color !== undefined && color !== null) box.current?.style.setProperty('--brand', color)
  }, [color, brand])

  if (brand === null) return null
  return (
    <div
      ref={box}
      data-brand-bar=""
      className="mb-card flex flex-wrap items-center gap-3 rounded-card [--brand:#3730a3] bg-(--brand) p-4 text-white forced-colors:border"
    >
      {brand.hasLogo && (
        <img
          src={reportBrandLogoPath(id)}
          alt={t.logoAlt(brand.name)}
          className="h-10 max-w-[10rem] rounded-lg bg-white object-contain p-1"
        />
      )}
      <span className="text-body font-bold">{brand.name}</span>
      {brand.credit && <span className="ms-auto text-meta opacity-90">{t.credit}</span>}
    </div>
  )
}
