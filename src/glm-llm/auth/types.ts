/**
 * Credential types for the native ZCode client channel (ported from
 * reference/zcode-api src/auth/types.ts, ZCode-verified shapes).
 */

/** Which upstream provider this credential is for. */
export type ProviderId = 'bigmodel'

/** A resolved credential ready for upstream LLM requests. */
export interface Credential {
  /** The API key portion (Bigmodel API key, `{apiKey}.{secret}` when a secret exists). */
  readonly apiKey: string
  /** Which provider this credential is for. */
  readonly provider: ProviderId
  /** Upstream account identifier (OAuth only). */
  readonly userId?: string
  /** ZCode plan JWT for start-plan; present when the login captured it. */
  readonly jwt?: string
  /** Raw provider OAuth access token; required by the 3.15.1 project-access-token signing plane. */
  readonly oauthAccessToken?: string
}

/** The credential string sent upstream (`{apiKey}.{secret}` when a secret exists). */
export function credentialString(cred: Credential): string {
  return cred.apiKey
}
