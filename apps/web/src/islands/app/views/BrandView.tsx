import { APP_UI } from '@arablyzer/i18n/app'
import BrandPanel from '../../account/BrandPanel'
import type { ViewProps } from '../AppFrame'
import { PageHeader } from '../ui'

/** The page of the account's brand, which is its panel: the page's heading is the panel's. */
export default function BrandView({ lang }: ViewProps) {
  const t = APP_UI[lang].pages.brand
  return (
    <>
      <PageHeader title={t.title} lead={t.lead} />
      <div data-app-panel className="max-w-[860px]">
        <BrandPanel lang={lang} />
      </div>
    </>
  )
}
