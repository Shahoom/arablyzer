import type { Report } from '@arablyzer/report-schema'
import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/** One row per scan: the page asked for and what became of it; nothing about who asked (§14). */
export const scans = pgTable(
  'scans',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    /** The tool the scan ran (M2.2); null for a whole scan. */
    tool: text('tool'),
    state: text('state', {
      enum: ['queued', 'running', 'complete', 'partial', 'failed'],
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** The overall score, for listing without reading reports: a whole scan's; null for a tool's. */
    score: integer('score'),
    report: jsonb('report').$type<Report>(),
    /**
     * The SHA-256 of the scan's deletion token (M5): the token is given once, at creation, and
     * never kept. Null for a scan made before there was one, which no token deletes.
     */
    deleteTokenHash: text('delete_token_hash'),
  },
  // Retention deletes by age (Phase 2 design §7.3).
  (table) => [index('scans_created_at').on(table.createdAt)],
)
