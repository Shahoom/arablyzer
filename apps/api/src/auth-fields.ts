/** What an account has beyond Better Auth's own fields: the language, set by us alone (`input: false`). */
export const USER_FIELDS = {
  language: { type: 'string', required: false, input: false },
} as const
