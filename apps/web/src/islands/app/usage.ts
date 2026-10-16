import type { SiteHistory } from '@arablyzer/api-contract/codes'
import { useEffect, useState } from 'preact/hooks'
import { getSiteHistory } from '../compare-api'
import { listKeys } from '../keys-api'
import { listPdfs } from '../pdf-api'
import { alertsOf, monitoredToRead, type AlertItem } from './app-model'
import { useShared } from './data'

export interface Usage {
  /** This month's PDFs and what the plan allows; null when the answer did not come. */
  readonly pdfs: { readonly used: number; readonly limit: number } | null
  /** The live keys and what the plan allows; `enabled` false when the plan has no API. */
  readonly keys: { readonly used: number; readonly limit: number; readonly enabled: boolean } | null
}

/** What the plan lets and what the account has used of what the shared data does not say. */
export function useUsage(): Usage | null {
  const [usage, setUsage] = useState<Usage | null>(null)
  useEffect(() => {
    let live = true
    void Promise.all([listPdfs(), listKeys()]).then(([pdfs, keys]) => {
      if (!live) return
      setUsage({
        pdfs: pdfs.ok
          ? { used: pdfs.value.allowance.used, limit: pdfs.value.allowance.perMonth }
          : null,
        keys: keys.ok
          ? { used: keys.value.keys.length, limit: keys.value.limit, enabled: keys.value.enabled }
          : null,
      })
    })
    return () => {
      live = false
    }
  }, [])
  return usage
}

/**
 * The alerts of the sites that are monitored, from their histories (the monitor's own markers, worked
 * out with the person's current settings): null while they are read.
 */
export function useAlerts(most = 6): { alerts: AlertItem[]; histories: SiteHistory[] } | null {
  const shared = useShared()
  const [found, setFound] = useState<{ alerts: AlertItem[]; histories: SiteHistory[] } | null>(null)
  const ready = shared.status === 'ready'
  const key = shared.rows
    .filter((row) => row.monitor !== 'off')
    .map((row) => row.site.id)
    .join(',')
  useEffect(() => {
    if (!ready) return
    let live = true
    const sites = monitoredToRead(shared.rows, most)
    void Promise.all(sites.map((site) => getSiteHistory(site.id))).then((reads) => {
      if (!live) return
      const histories = reads.flatMap((read) => (read.ok ? [read.value] : []))
      setFound({ alerts: alertsOf(histories), histories })
    })
    return () => {
      live = false
    }
    // The sites that are watched decide what is read, not every change to a row.
  }, [ready, key, most])
  return found
}
