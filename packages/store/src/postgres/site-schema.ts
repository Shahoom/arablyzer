import { check, index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './auth-schema'
import { scans } from './schema'

// What an account keeps (M4.2). The link from a scan to its owner is its own table, so `scans`
// still holds nothing about who asked (Phase 4 design §2.2). Both tables go with the account.

export const sites = pgTable(
  'sites',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The URL as the scan route checked it (`URL.href`), so a scan of it finds the site again. */
    url: text('url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [unique('sites_user_url').on(table.userId, table.url)],
)

export const accountScans = pgTable(
  'account_scans',
  {
    scanId: text('scan_id')
      .primaryKey()
      .references(() => scans.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Set null when the site is removed: the scan stays in the history. */
    siteId: text('site_id').references(() => sites.id, { onDelete: 'set null' }),
    source: text('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check('account_scans_source', sql`${table.source} IN ('manual', 'monitor', 'crawl')`),
    index('account_scans_user_created').on(table.userId, table.createdAt),
    index('account_scans_site').on(table.siteId, table.createdAt),
  ],
)
