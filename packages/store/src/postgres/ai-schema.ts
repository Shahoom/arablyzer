import { sql } from 'drizzle-orm'
import { bigint, check, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './auth-schema'

// What the fix assistant keeps (BUILD-PLAN §12). A request to the model is a row from the moment its
// place is taken (cost_micro null, the worst it can cost in reserved_micro) until it settles; the
// account's limit and the spend caps are sums over these rows. The account is set null, not deleted,
// when it is erased: what was spent stays counted, whose it was does not.

export const aiRequests = pgTable(
  'ai_requests',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    ruleId: text('rule_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    reservedMicro: bigint('reserved_micro', { mode: 'number' }).notNull(),
    costMicro: bigint('cost_micro', { mode: 'number' }),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    cacheWriteTokens: integer('cache_write_tokens'),
  },
  (table) => [
    check('ai_requests_reserved', sql`${table.reservedMicro} >= 0`),
    index('ai_requests_created').on(table.createdAt),
    index('ai_requests_user').on(table.userId, table.createdAt),
  ],
)

/** An answer the assistant can give again: keyed by a hash of the rule, its evidence, the language and the prompt. */
export const aiFixCache = pgTable('ai_fix_cache', {
  key: text('key').primaryKey(),
  fix: text('fix').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
