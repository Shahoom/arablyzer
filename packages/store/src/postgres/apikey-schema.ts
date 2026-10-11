import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { users } from './auth-schema'

// API keys (M5.1). Like the account's other tables this goes with the account (cascade). The
// secret is never stored: `hash` is the SHA-256 of 256 random bits, which needs no salt.

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    hash: text('hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('api_keys_hash').on(table.hash),
    index('api_keys_user').on(table.userId, table.createdAt),
  ],
)
