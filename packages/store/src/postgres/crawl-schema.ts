import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { users } from './auth-schema'
import { scans } from './schema'
import { sites } from './site-schema'

// Deep crawl (M4.5). Like the other account tables these go with the account (cascade), and a
// crawl lives as long as the plan keeps history. The worker's role has no right on them.

export const crawls = pgTable(
  'crawls',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** A removed site takes its crawls with it; the scans of their pages stay in the history. */
    siteId: text('site_id').references(() => sites.id, { onDelete: 'cascade' }),
    startUrl: text('start_url').notNull(),
    origin: text('origin').notNull(),
    state: text('state').notNull(),
    error: text('error'),
    pageCap: integer('page_cap').notNull(),
    delayMs: integer('delay_ms').notNull(),
    pagesFound: integer('pages_found').notNull().default(0),
    pagesChecked: integer('pages_checked').notNull().default(0),
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    renderStartedAt: timestamp('render_started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    templates: jsonb('templates')
      .notNull()
      .default(sql`'[]'::jsonb`),
    titles: jsonb('titles')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    check(
      'crawls_state',
      sql`${table.state} IN ('queued', 'running', 'rendering', 'done', 'failed', 'cancelled')`,
    ),
    // One crawl at a time for an account: the database holds the line, not the route.
    uniqueIndex('crawls_one_active')
      .on(table.userId)
      .where(sql`${table.state} IN ('queued', 'running', 'rendering')`),
    index('crawls_claim').on(table.state, table.leaseUntil),
    index('crawls_site').on(table.siteId, table.createdAt),
  ],
)

export const crawlPages = pgTable(
  'crawl_pages',
  {
    crawlId: text('crawl_id')
      .notNull()
      .references(() => crawls.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    /** In the order found. */
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    depth: integer('depth').notNull(),
    bucket: text('bucket').notNull(),
    state: text('state').notNull(),
    status: integer('status'),
    template: text('template'),
    title: text('title'),
    skeleton: text('skeleton'),
    issues: jsonb('issues')
      .notNull()
      .default(sql`'[]'::jsonb`),
    renderIssues: jsonb('render_issues')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** The scan of the page in the browsers; set null when the history sweep deletes it. */
    scanId: text('scan_id').references(() => scans.id, { onDelete: 'set null' }),
    error: text('error'),
  },
  (table) => [
    primaryKey({ columns: [table.crawlId, table.url] }),
    check('crawl_pages_state', sql`${table.state} IN ('found', 'checked', 'blocked', 'failed')`),
    index('crawl_pages_next').on(table.crawlId, table.state, table.bucket, table.depth, table.seq),
    index('crawl_pages_template').on(table.crawlId, table.template, table.seq),
  ],
)
