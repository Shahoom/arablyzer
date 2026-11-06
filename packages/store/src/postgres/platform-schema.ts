import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core'
import { scans } from './schema'

// What the Salla and Zid apps keep (M9, issue #41). A store's audits go with its install
// (cascade), and an audit goes with its scan, so the retention sweep that deletes a scan deletes
// its link: the panel then asks for a new audit. Tokens are stored sealed (AES-256-GCM, by the
// API); this schema never sees them in the clear.

export const platformInstalls = pgTable(
  'platform_installs',
  {
    id: text('id').primaryKey(),
    platform: text('platform').notNull(),
    storeKey: text('store_key').notNull(),
    storeName: text('store_name'),
    storeUrl: text('store_url'),
    sealedTokens: text('sealed_tokens'),
    tokensExpireAt: timestamp('tokens_expire_at', { withTimezone: true }),
    tokensAt: timestamp('tokens_at', { withTimezone: true }),
    refreshDueAt: timestamp('refresh_due_at', { withTimezone: true }),
    /** A scheduler holds the refresh until this time: a second one skips it. */
    refreshLeaseUntil: timestamp('refresh_lease_until', { withTimezone: true }),
    status: text('status').notNull().default('active'),
    embedTokenHash: text('embed_token_hash'),
    installedAt: timestamp('installed_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    auditDueAt: timestamp('audit_due_at', { withTimezone: true }),
    auditLeaseUntil: timestamp('audit_lease_until', { withTimezone: true }),
    lastAuditAt: timestamp('last_audit_at', { withTimezone: true }),
  },
  (table) => [
    unique('platform_installs_store').on(table.platform, table.storeKey),
    uniqueIndex('platform_installs_embed')
      .on(table.embedTokenHash)
      .where(sql`${table.embedTokenHash} IS NOT NULL`),
    check('platform_installs_platform', sql`${table.platform} IN ('salla', 'zid')`),
    check('platform_installs_status', sql`${table.status} IN ('active', 'reauth')`),
    index('platform_installs_audit_due')
      .on(table.auditDueAt)
      .where(sql`${table.auditDueAt} IS NOT NULL`),
    index('platform_installs_refresh_due')
      .on(table.refreshDueAt)
      .where(sql`${table.refreshDueAt} IS NOT NULL`),
  ],
)

export const platformAudits = pgTable(
  'platform_audits',
  {
    scanId: text('scan_id')
      .primaryKey()
      .references(() => scans.id, { onDelete: 'cascade' }),
    installId: text('install_id')
      .notNull()
      .references(() => platformInstalls.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('platform_audits_install').on(table.installId, table.createdAt)],
)
