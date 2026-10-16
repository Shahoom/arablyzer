import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './auth-schema'

// What the owner's panel keeps (M4.8). Neither table is readable by the worker's role: no default
// privilege is ever given it (provision.ts).

/**
 * What the owner has decided about one account: suspended since, the numbers that override its
 * plan, and its last sign-in. It goes with the account (cascade). A row exists only once there is
 * something to say.
 */
export const adminUserState = pgTable('admin_user_state', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
  overrides: jsonb('overrides'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

/**
 * Every action the owner took in the panel. Not tied to `users` by a key: it outlives an erased
 * account, whose address and id are then rewritten (the address becomes null, the id a hash).
 * `network` is the admin's IPv6 /48 or IPv4 /24, never the address. Kept a year.
 */
export const adminAudit = pgTable(
  'admin_audit',
  {
    id: text('id').primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    actorId: text('actor_id').notNull(),
    actorEmail: text('actor_email'),
    action: text('action').notNull(),
    targetId: text('target_id'),
    targetEmail: text('target_email'),
    detail: jsonb('detail').notNull(),
    network: text('network'),
  },
  (table) => [
    index('admin_audit_at').on(table.at),
    index('admin_audit_target').on(table.targetId, table.at),
    index('admin_audit_actor').on(table.actorId),
  ],
)
