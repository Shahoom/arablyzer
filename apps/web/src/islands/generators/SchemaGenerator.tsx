import { productJsonLd, type ProductInput, type ProductResult } from '@arablyzer/generators'
import { GENERATORS_UI } from '@arablyzer/i18n/generators'
import type { Lang } from '@arablyzer/seo/site'
import type { TargetedSubmitEvent } from 'preact'
import { useState } from 'preact/hooks'
import { FIELD, LABEL, SUBMIT, ToolBox } from '../ToolBox'
import { CopyBox } from './CopyBox'

/** The Gulf's currencies first, then others the stores of the region sell in. */
const CURRENCIES = ['OMR', 'SAR', 'AED', 'KWD', 'BHD', 'QAR', 'USD', 'EUR', 'EGP', 'JOD']

/** The product structured data generator (M2.3b): a Product the product rules accept. */
export default function SchemaGenerator({
  lang,
  tool,
  title,
  dot,
}: {
  lang: Lang
  tool: string
  title: string
  dot: string
}) {
  const t = GENERATORS_UI[lang].schema
  const common = GENERATORS_UI[lang].common
  const [result, setResult] = useState<ProductResult | null>(null)
  const onSubmit = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (name: string) => {
      const entry = data.get(name)
      return typeof entry === 'string' ? entry : ''
    }
    setResult(
      productJsonLd({
        name: value('name'),
        price: value('price'),
        currency: value('currency'),
        availability: value('availability') as ProductInput['availability'],
        url: value('url'),
        image: value('image'),
        sku: value('sku'),
        brand: value('brand'),
        description: value('description'),
      }),
    )
  }
  const optional = (id: string, label: string, type: 'url' | 'text', ltr: boolean) => (
    <div className="flex flex-col gap-2">
      <label htmlFor={`product-${id}`} className={LABEL}>
        {label} <span className="font-normal text-ink-3">({t.optional})</span>
      </label>
      <input
        id={`product-${id}`}
        name={id}
        type={type}
        dir={ltr ? 'ltr' : 'auto'}
        className={`${FIELD} ${ltr ? 'font-mono' : ''}`}
      />
    </div>
  )
  return (
    <div className="flex flex-col gap-5" data-tool={tool}>
      <ToolBox lang={lang} title={title} dot={dot}>
        <form onSubmit={onSubmit} data-tool-kind="generator" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="product-name" className={LABEL}>
              {t.name}
            </label>
            <input
              id="product-name"
              name="name"
              type="text"
              dir="auto"
              required
              className={FIELD}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="product-price" className={LABEL}>
                {t.price}
              </label>
              <input
                id="product-price"
                name="price"
                type="text"
                inputMode="decimal"
                dir="ltr"
                required
                placeholder="12.500"
                className={`${FIELD} font-mono`}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="product-currency" className={LABEL}>
                {t.currency}
              </label>
              <select
                id="product-currency"
                name="currency"
                dir="ltr"
                className={`${FIELD} font-mono`}
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="product-availability" className={LABEL}>
                {t.availability}
              </label>
              <select id="product-availability" name="availability" className={FIELD}>
                {(['InStock', 'OutOfStock', 'PreOrder'] as const).map((key) => (
                  <option key={key} value={key}>
                    {t.availabilities[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {optional('url', t.url, 'url', true)}
            {optional('image', t.image, 'url', true)}
            {optional('sku', t.sku, 'text', true)}
            {optional('brand', t.brand, 'text', false)}
          </div>
          {optional('description', t.description, 'text', false)}
          <button type="submit" className={SUBMIT}>
            {t.submit}
          </button>
        </form>
      </ToolBox>
      <p className="m-0 px-1 text-center text-sm text-ink-3">{common.local}</p>
      {result !== null && (
        <section
          aria-label={common.result}
          className={`flex flex-col gap-3 rounded-2xl p-3 sm:p-4 ${result.ok ? 'bg-linear-to-br from-pass-soft to-indigo-soft' : 'bg-serious-soft'}`}
        >
          {result.ok ? (
            <CopyBox lang={lang} label={t.html} text={result.html} />
          ) : (
            <p role="alert" className="m-0 px-1 text-sm text-serious">
              {t.problems[result.problem]}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
