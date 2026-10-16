import { APP_UI } from '@arablyzer/i18n/app'
import KeysPanel from '../../account/KeysPanel'
import type { ViewProps } from '../AppFrame'
import { PageHeader } from '../ui'

/** The page of the account's keys, which is its panel: the page's heading is the panel's. */
export default function KeysView({ lang }: ViewProps) {
  const t = APP_UI[lang].pages.keys
  return (
    <>
      <PageHeader title={t.title} lead={t.lead} />
      <div data-app-panel className="max-w-[860px]">
        <KeysPanel lang={lang} />
      </div>
    </>
  )
}
