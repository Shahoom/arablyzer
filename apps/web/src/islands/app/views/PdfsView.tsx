import { APP_UI } from '@arablyzer/i18n/app'
import PdfPanel from '../../account/PdfPanel'
import type { ViewProps } from '../AppFrame'
import { PageHeader } from '../ui'

/** The page of the account's pdfs, which is its panel: the page's heading is the panel's. */
export default function PdfsView({ lang }: ViewProps) {
  const t = APP_UI[lang].pages.pdfs
  return (
    <>
      <PageHeader title={t.title} lead={t.lead} />
      <div data-app-panel className="max-w-[860px]">
        <PdfPanel lang={lang} />
      </div>
    </>
  )
}
