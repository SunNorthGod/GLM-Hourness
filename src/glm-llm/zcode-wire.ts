/**
 * Verbatim wire literals of ZCode that the native channel sends or matches,
 * as 3.17.1 has them. Every string here is a verbatim claim:
 * scripts/check-verbatim.mjs (MIRROR_FILES) requires each one of 13
 * characters or more to occur in the ZCode reference. Offsets are characters
 * in the pristine 3.16.3 CLI bundle, whose literals 3.17.1 keeps unchanged
 * (docs/FACTS.md §1); a literal new in 3.17.1 names its 3.17.1 symbol. Keep
 * this file to plain string constants: the scanner does not parse regex
 * literals or division.
 */

/**
 * ProjectAccessTokenClient error codes (`sge` @1082916 and its cache `Urt`
 * @1080367; the desktop host carries the same client). The resolve path
 * rethrows every failure as one of these messages. 3.17.1 splits request
 * failures by kind (projectAccessTokenRequestFailureCode `KAr`): a network
 * failure, a timeout, or `project_token_http_<status>`; anything else stays
 * `project_token_request_failed`.
 */
export const PROJECT_TOKEN_CODES = {
  loginRequired: 'project_token_login_required',
  disabled: 'project_token_disabled',
  projectUnavailable: 'project_token_project_unavailable',
  invalidResponse: 'project_token_invalid_response',
  scopeInvalidated: 'project_token_scope_invalidated',
  requestFailed: 'project_token_request_failed',
  networkError: 'project_token_network_error',
  timeout: 'project_token_timeout',
} as const

/** Prefix of the 3.17.1 code for an HTTP status failure (`project_token_http_` + status). */
export const PROJECT_TOKEN_HTTP_CODE_PREFIX = 'project_token_http_'

/**
 * The bigmodel API origin in production: the project access token is minted
 * at it and the quota is read from it (`resolveBigModelApiOrigin`, the
 * production origin constant of the CLI bundle and of the desktop host).
 */
export const BIGMODEL_API_ORIGIN = 'https://bigmodel.cn'

/** The personal coding-plan API key name the client finds or creates. */
export const ZCODE_API_KEY_NAME = 'zcode-api-key'

/** Prefix of the persisted project-key location (`project-key-location:v1:` + encoded scope). */
export const PROJECT_KEY_LOCATION_PREFIX = 'project-key-location:v1:'

/** The bigmodel customer-info path the locator reads first. */
export const CUSTOMER_INFO_PATH = '/api/biz/customer/getCustomerInfo'

/** The agent/configs request header naming the PAT's API key (`FGs` @4196232). */
export const API_KEY_ID_HEADER = 'x-api-key-id'

/**
 * User-Agent segments of the AI SDK inside 3.16.3: provider-utils appends
 * `ai-sdk/provider-utils/4.0.27` and the runtime segment to every request
 * (`postToApi` `SZr`, `mZr` @3530239), the Anthropic provider appends
 * `ai-sdk/anthropic/3.0.81` to its own headers (`getHeaders` @3570073,
 * `gjs`), and `generateText` appends `ai/6.0.193` to the call headers
 * (@3949945, `Xno` @3991593). The versions are kept apart from the prefixes:
 * the bundle joins them in templates.
 */
export const PROVIDER_UTILS_UA_PREFIX = 'ai-sdk/provider-utils/'
export const PROVIDER_UTILS_VERSION = '4.0.27'
export const ANTHROPIC_SDK_UA_PREFIX = 'ai-sdk/anthropic/'
export const ANTHROPIC_SDK_VERSION = '3.0.81'
export const AI_UA_PREFIX = 'ai/'
export const AI_VERSION = '6.0.193'
/** The runtime segment of a Node process without `navigator.userAgent` (`getRuntimeEnvironmentUserAgent` `$ut` @3509781). */
export const RUNTIME_NODE_UA_PREFIX = 'runtime/node.js/'

/**
 * The official GLM model ids (`Cpr` @526343): 3.16.3 sends an account
 * provider's model in this casing (`normalizeOfficialGlmModelId` `GZt`
 * @526265 through `hne`).
 */
export const OFFICIAL_GLM_MODEL_IDS = [
  'GLM-5.3', 'GLM-5.3-Flash', 'GLM-5V-Turbo', 'GLM-5.2', 'GLM-5.1', 'GLM-5.1-Highspeed', 'GLM-5', 'GLM-5-Turbo',
  'GLM-4.7', 'GLM-4.7-FlashX', 'GLM-4.7-Flash', 'GLM-4.6', 'GLM-4.5-Air', 'GLM-4.5', 'GLM-4.6V', 'GLM-4.6V-Flash',
  'GLM-4.6V-FlashX', 'GLM-4.1V-Thinking-FlashX', 'GLM-4.1V-Thinking-Flash', 'GLM-4-FlashX-250414', 'GLM-4-Flash-250414', 'GLM-4V-Flash',
] as const

/** Attribution header names (`createModelRequestAttributionHeaders` `Vdt` @4065502, constants @4066600). */
export const SESSION_TYPE_HEADER = 'x-zcode-session-type'
export const TRACE_ID_HEADER = 'x-zcode-trace-id'
export const QUERY_SOURCE_HEADER = 'x-zcode-query-source'
/** New in 3.17.1 (`$yn`): the session's features, between the query source and x-session-id. */
export const SESSION_FEATURES_HEADER = 'x-zcode-session-features'

/**
 * The session features this channel can show (3.17.1 `pP`): local tool
 * search exposed on a step, and a successful LocalToolSearch call. The
 * others (`tool_search_native`, `workflow_auto`, `workflow_cmd`,
 * `browser_use`, `computer_use`) have no trigger here.
 */
export const SESSION_FEATURES = {
  toolSearchLocal: 'tool_search_local',
  toolSearchCalled: 'tool_search_called',
} as const

/**
 * Query sources: an agent step `main_turn` and a delegated child's step
 * `subagent` (`mDn` @13259914), compaction `compact` (@13389086), the
 * session title `session_title` (`v2n` @13069774).
 */
export const QUERY_SOURCES = {
  mainTurn: 'main_turn',
  subagent: 'subagent',
  compact: 'compact',
  sessionTitle: 'session_title',
} as const
