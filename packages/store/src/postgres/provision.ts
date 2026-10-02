import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Pool } from 'pg'
import { MIGRATION_LOCK, MIGRATIONS } from './store'

/**
 * The roles the database has (M6 of the pre-launch security review). The API and the worker
 * connect as `arablyzer_app`, which can read, write and delete the scans and nothing else: no
 * DDL, no other schema, no extension, and it is no superuser, which a database's bootstrap user
 * (POSTGRES_USER) is, and which reaches the container's shell through COPY ... PROGRAM. The
 * tables belong to `arablyzer_migrate`, which cannot log in: the one process that changes the
 * schema, `migrate.ts`, connects as the bootstrap user, becomes it for the migrations, and is
 * finished when they are; neither the API nor the worker ever holds its password.
 */
export const APP_ROLE = 'arablyzer_app'
export const MIGRATE_ROLE = 'arablyzer_migrate'

/**
 * What the application may do to the tables. `DELETE` is for what the scans' owners are owed:
 * retention deletes by age (Phase 2 design §7.3), and a visitor deletes their own report (issue
 * #30, M5). `TRUNCATE`, which would empty the table in one statement, and everything that changes
 * the schema, are never given.
 */
const APP_PRIVILEGES = 'SELECT, INSERT, UPDATE, DELETE'

/** Role names are written into SQL: lower case, digits and underscores, so they need no quoting. */
const NAME = /^[a-z_][a-z0-9_]{0,62}$/

export interface ProvisionOptions {
  /** The application role's password, set on every run, so that rotating it is a deploy. */
  readonly appPassword: string
  readonly appRole?: string
  readonly migrateRole?: string
}

/**
 * Brings the database up to this version, and its roles to what is above, as the bootstrap user
 * (a superuser, or a role that can create roles and become the migration role), one process at a
 * time. Every step can be run again: a database an older version made, with its tables owned by
 * the bootstrap user, is adopted, and a role that drifted (a superuser, a right too many) is put
 * back.
 */
export async function migrateDatabase(pool: Pool, options: ProvisionOptions): Promise<void> {
  const app = options.appRole ?? APP_ROLE
  const owner = options.migrateRole ?? MIGRATE_ROLE
  for (const role of [app, owner]) {
    if (!NAME.test(role))
      throw new Error(`A role name is lower case letters, digits and _: ${role}`)
  }
  if (app === owner) throw new Error('The application and the migration are two roles')
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK])
    try {
      await client.query(rolesSql(app, owner))
      // Its password is a literal: DDL takes no parameter. It is never in a message here.
      await client.query(`ALTER ROLE ${app} PASSWORD ${client.escapeLiteral(options.appPassword)}`)
      await client.query(adoptSql(owner))
      await client.query(`SET ROLE ${owner}`)
      try {
        await migrate(drizzle(client), { migrationsFolder: MIGRATIONS })
      } finally {
        await client.query('RESET ROLE')
      }
      await client.query(grantsSql(app, owner))
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK])
    }
  } finally {
    client.release()
  }
}

/** The two roles, as they should be; and who may connect, and where they may create anything. */
function rolesSql(app: string, owner: string): string {
  return `
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${owner}') THEN
    CREATE ROLE ${owner} NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${app}') THEN
    CREATE ROLE ${app} LOGIN;
  END IF;
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC, ${app}', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO ${app}', current_database());
  EXECUTE format('GRANT CONNECT, CREATE ON DATABASE %I TO ${owner}', current_database());
END
$$;
ALTER ROLE ${owner} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT;
ALTER ROLE ${app} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT;
-- The application is nobody's member: it could become the role that owns the tables.
REVOKE ${owner} FROM ${app};
GRANT ${owner} TO CURRENT_USER;
REVOKE ALL ON SCHEMA public FROM PUBLIC, ${app};
GRANT USAGE ON SCHEMA public TO ${app};
GRANT USAGE, CREATE ON SCHEMA public TO ${owner};
`
}

/**
 * The tables and the migrations' own schema that an older version made under the bootstrap user
 * now belong to the migration role: it must own what it migrates. A sequence follows the table
 * whose column owns it.
 */
function adoptSql(owner: string): string {
  return `
DO $$
DECLARE found record;
BEGIN
  FOR found IN
    SELECT n.nspname AS schema, c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'drizzle')
      AND c.relkind IN ('r', 'p')
      AND c.relowner <> '${owner}'::regrole
  LOOP
    EXECUTE format('ALTER TABLE %I.%I OWNER TO ${owner}', found.schema, found.name);
  END LOOP;
  IF EXISTS (SELECT FROM pg_namespace WHERE nspname = 'drizzle') THEN
    ALTER SCHEMA drizzle OWNER TO ${owner};
  END IF;
END
$$;
`
}

/**
 * What the application may do: its rights on the tables there are, exactly (a right that crept
 * in is taken back), and on those a later migration makes. It has none in the migrations' schema.
 */
function grantsSql(app: string, owner: string): string {
  return `
REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM ${app};
REVOKE ALL ON ALL SEQUENCES IN SCHEMA drizzle FROM ${app};
REVOKE ALL ON SCHEMA drizzle FROM PUBLIC, ${app};
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${app};
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${app};
GRANT ${APP_PRIVILEGES} ON ALL TABLES IN SCHEMA public TO ${app};
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public
  GRANT ${APP_PRIVILEGES} ON TABLES TO ${app};
ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ${app};
`
}
