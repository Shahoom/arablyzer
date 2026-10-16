/** The variable that names the owner's panel's administrators (M4.8). */
export const ADMIN_EMAILS_VARIABLE = 'ARABLYZER_ADMIN_EMAILS'

/** One address: no spaces, one `@`, a dot in the domain, and no upper case (the match is exact). */
const ADDRESS = /^[^\s@,;<>"']+@[^\s@,;<>"'.]+(?:\.[^\s@,;<>"'.]+)+$/

/**
 * The administrators: comma-separated, lower case, each compared exactly with the Google-verified
 * address of the signed-in account. Unset or empty, there are none and no panel. There is no
 * other way to become one: no page, no route and no table grants it.
 */
export function adminEmailsFrom(env: Readonly<Record<string, string | undefined>>): string[] {
  const raw = env[ADMIN_EMAILS_VARIABLE]?.trim() ?? ''
  if (raw === '') return []
  const emails: string[] = []
  for (const part of raw.split(',')) {
    const email = part.trim()
    if (email === '') continue
    if (email !== email.toLowerCase()) {
      throw new Error(`${ADMIN_EMAILS_VARIABLE} takes lower-case addresses: ${email} is not`)
    }
    if (!ADDRESS.test(email)) {
      throw new Error(`${ADMIN_EMAILS_VARIABLE} takes addresses separated by commas`)
    }
    if (!emails.includes(email)) emails.push(email)
  }
  return emails
}

/** Whether the address is one of the administrators', and the account's own address is vouched for. */
export function isAdmin(
  admins: readonly string[],
  user: { readonly email: string; readonly emailVerified?: boolean },
): boolean {
  return user.emailVerified === true && admins.includes(user.email)
}
