import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// «حالة الويب العربي» (M9): the crawl of the sample frame, kept so that it can stop and go on. A run
// is one edition's crawl; a result is one site of the frame and, once it is judged, the compact
// outcome of its homepage (packages/sotaw). No account links here: nobody's quota counts these, and
// the worker's role has no right on them.

export const sotawRuns = pgTable(
  'sotaw_runs',
  {
    id: text('id').primaryKey(),
    /** The Tranco list the frame was cut from, and a hash of the frame's file: a run goes on only with the same frame. */
    frameId: text('frame_id').notNull(),
    frameSha: text('frame_sha').notNull(),
    seed: text('seed').notNull(),
    state: text('state').notNull(),
    total: integer('total').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [check('sotaw_runs_state', sql`${table.state} IN ('running', 'finished', 'aborted')`)],
)

export const sotawResults = pgTable(
  'sotaw_results',
  {
    runId: text('run_id')
      .notNull()
      .references(() => sotawRuns.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    country: text('country').notNull(),
    rank: integer('rank').notNull(),
    /** The place in the crawl's order: the seeded shuffle, so a part of the crawl is a random part of the frame. */
    position: integer('position').notNull(),
    state: text('state').notNull(),
    /** Why a site was skipped or failed: a short code, never text of the site. */
    reason: text('reason'),
    attempts: integer('attempts').notNull().default(0),
    /** The scan this site's homepage is being judged by, until its outcome is kept. */
    scanId: text('scan_id'),
    outcome: jsonb('outcome'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.domain] }),
    check(
      'sotaw_results_state',
      sql`${table.state} IN ('pending', 'running', 'done', 'skipped', 'failed')`,
    ),
    index('sotaw_results_next').on(table.runId, table.state, table.position),
  ],
)
