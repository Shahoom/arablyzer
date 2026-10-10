import { sql } from 'drizzle-orm'
import {
  check,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { users } from './auth-schema'
import { crawls } from './crawl-schema'
import { scans } from './schema'

// PDF export and white-label (M4.7). Like the account's other tables these go with the account
// (cascade). A PDF goes with the report it is of: its row has the scan or crawl as a foreign key,
// so whatever deletes the report (retention, the person, the account) deletes the file.

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
})

/** The company name, colour and logo an account puts on its PDFs and shared reports. */
export const accountBrand = pgTable(
  'account_brand',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default(''),
    color: text('color'),
    logo: bytea('logo'),
    logoType: text('logo_type'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check('account_brand_logo', sql`(${table.logo} IS NULL) = (${table.logoType} IS NULL)`),
    check(
      'account_brand_logo_type',
      sql`${table.logoType} IS NULL OR ${table.logoType} IN ('image/png', 'image/jpeg', 'image/webp')`,
    ),
  ],
)

export const pdfJobs = pgTable(
  'pdf_jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    /** The scan this is of (the later one, for a comparison of scans); with the report, the PDF goes. */
    scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),
    crawlId: text('crawl_id').references(() => crawls.id, { onDelete: 'cascade' }),
    /** For a comparison, the earlier report. */
    baseId: text('base_id'),
    language: text('language').notNull(),
    state: text('state').notNull(),
    error: text('error'),
    pdf: bytea('pdf'),
    bytes: integer('bytes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
  },
  (table) => [
    check(
      'pdf_jobs_kind',
      sql`${table.kind} IN ('scan', 'crawl', 'compare-scans', 'compare-crawls')`,
    ),
    check(
      'pdf_jobs_state',
      sql`${table.state} IN ('queued', 'running', 'done', 'failed', 'expired')`,
    ),
    check('pdf_jobs_language', sql`${table.language} IN ('ar', 'en')`),
    check('pdf_jobs_subject', sql`(${table.scanId} IS NULL) <> (${table.crawlId} IS NULL)`),
    // One PDF at a time for an account: the database holds the line, not the route.
    uniqueIndex('pdf_jobs_one_active')
      .on(table.userId)
      .where(sql`${table.state} IN ('queued', 'running')`),
    index('pdf_jobs_claim').on(table.state, table.leaseUntil),
    index('pdf_jobs_user').on(table.userId, table.createdAt),
  ],
)

/** How many PDFs an account has asked for in a calendar month: a ledger the plan's cap is counted on. */
export const pdfUsage = pgTable(
  'pdf_usage',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `2026-10` (UTC). */
    month: text('month').notNull(),
    count: integer('count').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.month] })],
)
