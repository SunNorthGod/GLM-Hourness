/**
 * Credential types for the native ZCode client channel (ported from
 * reference/zcode-api src/auth/types.ts, ZCode-verified shapes).
 */

/** Which upstream provider this credential is for. */
export type ProviderId = 'bigmodel'

/**
 * A stored login, record version 2 (docs/DESIGN.md §4.1). Like the 3.16.3
 * desktop it keeps the login tokens only; the project access token is
 * minted from `oauthAccessToken` per request and never stored. No API key
 * and no API key secret are kept: 3.16.3 account mode uses neither.
 */
export interface Credential {
  readonly version: 2
  /** Which provider this credential is for. */
  readonly provider: ProviderId
  /** Raw provider OAuth access token: the project access token is minted from it (auth/project-token.ts). */
  readonly oauthAccessToken?: string
  /** Upstream account identifier, the project token's account identity. */
  readonly userId?: string
  /** ZCode plan JWT: start-plan's request credential and `X-ZCode-Authorization`. */
  readonly jwt?: string
  /** The located project API key, stored as 3.16.3 stores it: its `project-key-location:v1:` key and JSON value. */
  readonly location?: { readonly key: string, readonly value: string }
}
