/**
 * The shortest secret the services start with. `openssl rand -hex 16` already makes one; the
 * `openssl rand -hex 32` that infra/.env.example asks for is twice as long. Hex, because a
 * secret that goes into a connection URL must not hold a character a URL reads (`/`, `+`, `@`).
 */
export const MIN_SECRET_LENGTH = 32

/**
 * A secret from the environment, trimmed: set, and at least `minimum` characters. The error names
 * the variable and never the value, which a log must not keep.
 */
export function requireSecret(
  name: string,
  value: string | undefined,
  minimum: number = MIN_SECRET_LENGTH,
): string {
  const secret = value?.trim() ?? ''
  if (secret === '') throw new Error(`${name} must be set`)
  if (secret.length < minimum) {
    throw new Error(
      `${name} must be ${minimum} characters or more (openssl rand -hex 32 makes one)`,
    )
  }
  return secret
}
