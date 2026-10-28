/**
 * Verbatim wire literals of ZCode 3.16.3 that the native channel sends or
 * matches. Every string here is a verbatim claim: scripts/check-verbatim.mjs
 * (MIRROR_FILES) requires each one of 13 characters or more to occur in the
 * 3.16.3 bundle. Offsets are characters in the pristine 3.16.3 CLI bundle
 * (docs/FACTS.md §1). Keep this file to plain string constants: the scanner
 * does not parse regex literals or division.
 */

/**
 * ProjectAccessTokenClient error codes (`sge` @1083993 and its cache `Urt`
 * @1080367; the desktop host carries the same client). The resolve path
 * rethrows every failure as one of these messages.
 */
export const PROJECT_TOKEN_CODES = {
  loginRequired: 'project_token_login_required',
  disabled: 'project_token_disabled',
  projectUnavailable: 'project_token_project_unavailable',
  invalidResponse: 'project_token_invalid_response',
  scopeInvalidated: 'project_token_scope_invalidated',
  requestFailed: 'project_token_request_failed',
} as const

/** The personal coding-plan API key name the client finds or creates. */
export const ZCODE_API_KEY_NAME = 'zcode-api-key'

/** Prefix of the persisted project-key location (`project-key-location:v1:` + encoded scope). */
export const PROJECT_KEY_LOCATION_PREFIX = 'project-key-location:v1:'

/** The bigmodel customer-info path the locator reads first. */
export const CUSTOMER_INFO_PATH = '/api/biz/customer/getCustomerInfo'

/** The agent/configs request header naming the PAT's API key (`FGs` @4196232). */
export const API_KEY_ID_HEADER = 'x-api-key-id'
