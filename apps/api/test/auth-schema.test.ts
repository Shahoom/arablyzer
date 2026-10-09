import { authSchema } from '@arablyzer/store'
import { getAuthTables } from 'better-auth/db'
import { oneTap } from 'better-auth/plugins'
import { getTableColumns, getTableName } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { USER_FIELDS } from '../src/auth-fields'

// The tables are written by hand (packages/store/src/postgres/auth-schema.ts); the library's own
// idea of them is the reference. A library update that adds or changes a field fails here.
const tables = getAuthTables({
  user: { additionalFields: USER_FIELDS },
  plugins: [oneTap()],
})

const TABLE_OF: Record<string, keyof typeof authSchema> = {
  user: 'users',
  session: 'sessions',
  account: 'accounts',
  verification: 'verifications',
}

describe('the accounts tables', () => {
  it('are the four tables the library keeps, and no other', () => {
    expect(Object.keys(tables).sort()).toEqual(Object.keys(TABLE_OF).sort())
  })

  for (const [model, definition] of Object.entries(tables)) {
    it(`${model}: every field the library names is a column, and no other column exists`, () => {
      const table = authSchema[TABLE_OF[model] as keyof typeof authSchema]
      const columns = getTableColumns(table)
      expect(getTableName(table)).toBe(
        definition.modelName === model ? `${model}s` : definition.modelName,
      )
      const fields = ['id', ...Object.keys(definition.fields)]
      expect(Object.keys(columns).sort()).toEqual(fields.sort())
      for (const [name, attribute] of Object.entries(definition.fields)) {
        const column = columns[name]
        expect(column, name).toBeDefined()
        expect(column?.notNull, `${model}.${name} notNull`).toBe(attribute.required !== false)
        const expected = {
          string: 'PgText',
          number: 'PgInteger',
          boolean: 'PgBoolean',
          date: 'PgTimestamp',
        }[attribute.type as string]
        expect(column?.columnType, `${model}.${name} type`).toBe(expected)
        if (attribute.unique === true)
          expect(column?.isUnique, `${model}.${name} unique`).toBe(true)
      }
    })
  }
})
