import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { boolean, check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { Pool } from 'pg'

// The four tables Better Auth keeps (M4.1), written by hand from its schema and checked against
// `getAuthTables` by apps/api/test/auth-schema.test.ts, so a library update that adds a field
// fails a test rather than a sign-in. Names are snake_case and plural, as `scans` is.
// What is kept (BUILD-PLAN §14): an address, a name, the language chosen, and when. No IP address,
// User-Agent, OAuth token or picture: the library's columns for them stay empty (apps/api/src/auth.ts).

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull(),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    /** The language of the account's pages and mail: set from the page on first sign-in. */
    language: text('language'),
  },
  (table) => [
    check('users_language', sql`${table.language} IS NULL OR ${table.language} IN ('ar', 'en')`),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('sessions_user_id').on(table.userId),
    index('sessions_expires_at').on(table.expiresAt),
  ],
)

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('accounts_user_id').on(table.userId)],
)

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('verifications_identifier').on(table.identifier)],
)

export const authSchema = { users, sessions, accounts, verifications }

/** The accounts tables on a pool, for Better Auth's Drizzle adapter. */
export function authDatabase(pool: Pool): NodePgDatabase<typeof authSchema> {
  return drizzle(pool, { schema: authSchema })
}
