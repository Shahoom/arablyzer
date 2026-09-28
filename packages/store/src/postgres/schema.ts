import type { Report } from '@arablyzer/report-schema'
import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/** One row per scan: the page asked for and what became of it; nothing about who asked (§14). */
export const scans = pgTable(
  'scans',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    state: text('state', {
      enum: ['queued', 'running', 'complete', 'partial', 'failed'],
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** The overall score, for listing without reading reports. */
    score: integer('score'),
    report: jsonb('report').$type<Report>(),
  },
  // Retention deletes by age (Phase 2 design §7.3).
  (table) => [index('scans_created_at').on(table.createdAt)],
)
