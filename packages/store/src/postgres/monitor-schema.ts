import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import { users } from './auth-schema'
import { scans } from './schema'
import { sites } from './site-schema'

// What monitoring keeps (M4.3). All of it goes with the account (cascade), and a run goes with its
// scan, so the history sweep that deletes a scan deletes its run: runs live as long as the plan's
// history days (Phase 4 design §2.2).

export const monitors = pgTable(
  'monitors',
  {
    siteId: text('site_id')
      .primaryKey()
      .references(() => sites.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    everyDays: integer('every_days').notNull(),
    paused: boolean('paused').notNull().default(false),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
    failures: integer('failures').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check('monitors_every_days', sql`${table.everyDays} >= 1`),
    index('monitors_due').on(table.paused, table.nextRunAt),
    index('monitors_user').on(table.userId),
  ],
)

export const monitorRuns = pgTable(
  'monitor_runs',
  {
    scanId: text('scan_id')
      .primaryKey()
      .references(() => scans.id, { onDelete: 'cascade' }),
    siteId: text('site_id')
      .notNull()
      .references(() => monitors.siteId, { onDelete: 'cascade' }),
    /** The slot the run is for; one run per slot, so a restart or a second scheduler cannot double it. */
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    /** When the alerts of the run were decided (delivered, not wanted, or given up). */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    retryAfter: timestamp('retry_after', { withTimezone: true }),
    /** The channels (`webhook`, `email`, …) this run's alert has already reached: a retry skips them. */
    delivered: text('delivered')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (table) => [
    unique('monitor_runs_slot').on(table.siteId, table.scheduledFor),
    index('monitor_runs_pending').on(table.notifiedAt, table.scheduledFor),
  ],
)

export const alertSettings = pgTable('alert_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  webhookUrl: text('webhook_url'),
  /** Signs the webhook's requests; kept, since an HMAC needs the key itself. Shown once. */
  webhookSecret: text('webhook_secret'),
  webhookKind: text('webhook_kind'),
  webhookFailures: integer('webhook_failures').notNull().default(0),
  webhookDisabledAt: timestamp('webhook_disabled_at', { withTimezone: true }),
  dropThreshold: integer('drop_threshold').notNull(),
  onCritical: boolean('on_critical').notNull(),
  onDown: boolean('on_down').notNull(),
  weeklySummary: boolean('weekly_summary').notNull(),
  email: boolean('email').notNull(),
  lastSummaryAt: timestamp('last_summary_at', { withTimezone: true }),
})

/**
 * A person's WhatsApp number (M5.6): saved unverified with a one-time code (a hash of it), and
 * usable only once the code they were sent has been given back. One per account; it goes with it.
 */
export const whatsappNumbers = pgTable('whatsapp_numbers', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** E.164, with the plus. */
  phone: text('phone').notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  codeHash: text('code_hash'),
  codeExpiresAt: timestamp('code_expires_at', { withTimezone: true }),
  codeAttempts: integer('code_attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

/** The saved sites whose alerts also go to WhatsApp: a row is the person's opt-in for that site. */
export const whatsappSites = pgTable(
  'whatsapp_sites',
  {
    siteId: text('site_id')
      .primaryKey()
      .references(() => sites.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('whatsapp_sites_user').on(table.userId)],
)
