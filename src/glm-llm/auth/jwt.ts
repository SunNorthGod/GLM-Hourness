/**
 * JWT age inspection for the stored start-plan token (ported from
 * reference/zcode-api src/auth/jwt-age.ts). Informational only: the token
 * payload carries `iat` but no `exp`, and the billing gateway does not reject
 * by age — re-login is only needed when the gateway actually returns
 * 401/3012.
 */
export interface JwtInfo {
  /** Unix seconds when the token was issued. */
  readonly iat: number
  /** Token age in hours at inspection time. */
  readonly ageHours: number
  readonly userId?: string
}

/** Decode a zcode-plan JWT payload without verifying the signature. */
export function inspectJwt(jwt: string): JwtInfo | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const payload = JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8')) as { iat?: unknown, user_id?: unknown }
    if (typeof payload.iat !== 'number') return null
    return {
      iat: payload.iat,
      ageHours: Math.max(0, (Date.now() / 1000 - payload.iat) / 3600),
      ...(typeof payload.user_id === 'string' ? { userId: payload.user_id } : {}),
    }
  }
  catch {
    return null
  }
}
