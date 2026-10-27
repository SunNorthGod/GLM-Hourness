/**
 * Bigmodel coding-plan credential resolution (ported from reference/zcode-api
 * src/auth/resolver.ts, bigmodel branch): the OAuth access token resolves the
 * default organization/project, then finds or creates the `zcode-api-key` API
 * key — the same name the ZCode client uses, so a real client login and this
 * channel share one key — and appends the secret when the copy endpoint
 * serves one. The raw OAuth token is kept for the 3.15.1 signing plane.
 */
import type { Credential } from './types.ts'
import type { FetchFn } from './oauth.ts'

/** API key name the ZCode client creates (bundle constant). */
const ZCODE_API_KEY_NAME = 'zcode-api-key'
const DEFAULT_ORG_MARKER = '默认机构'
const DEFAULT_PROJECT_MARKER = '默认项目'
const BIGMODEL_HOST = 'https://bigmodel.cn'

async function requestBizApi(fetchImpl: FetchFn, url: string, authorization: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const resp = await fetchImpl(url, { ...init, headers: { authorization, 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  if (!resp.ok) throw new Error(`Biz API ${url} failed: ${resp.status}`)
  const body = JSON.parse(await resp.text()) as { code?: unknown, status?: unknown, msg?: string, data?: unknown }
  const code = body.code ?? body.status
  if (code !== undefined && code !== 0 && code !== 200 && code !== '0' && code !== '200') {
    throw new Error(body.msg ?? `Biz API error ${String(code)}`)
  }
  return (body.data ?? body) as Record<string, unknown>
}

async function resolveCustomerInfo(fetchImpl: FetchFn, authorization: string): Promise<{ orgId: string, projectId: string }> {
  const data = await requestBizApi(fetchImpl, `${BIGMODEL_HOST}/api/biz/customer/getCustomerInfo`, authorization, { method: 'GET' })
  const orgs = data.organizations ?? data.orgs
  if (!Array.isArray(orgs) || orgs.length === 0) throw new Error('No organizations found')
  const org = orgs.find((entry: { organizationName?: string, name?: string }) => (entry.organizationName ?? entry.name ?? '').includes(DEFAULT_ORG_MARKER)) ?? orgs[0] as { organizationId?: string, id?: string, orgId?: string, projects?: unknown[] }
  const orgId = org.organizationId ?? org.id ?? org.orgId
  if (typeof orgId !== 'string') throw new Error('Customer info returned no organization id')
  const projects = org.projects
  if (!Array.isArray(projects) || projects.length === 0) throw new Error('No projects found in default organization')
  const project = projects.find((entry: { projectName?: string, name?: string }) => (entry.projectName ?? entry.name ?? '').includes(DEFAULT_PROJECT_MARKER)) ?? projects[0] as { projectId?: string, id?: string }
  const projectId = project.projectId ?? project.id
  if (typeof projectId !== 'string') throw new Error('Customer info returned no project id')
  return { orgId, projectId }
}

async function findOrCreateApiKey(fetchImpl: FetchFn, authorization: string, orgId: string, projectId: string): Promise<{ apiKey: string }> {
  const listUrl = `${BIGMODEL_HOST}/api/biz/v1/organization/${orgId}/projects/${projectId}/api_keys`
  let existing: unknown = []
  try {
    existing = await requestBizApi(fetchImpl, listUrl, authorization, { method: 'GET' })
  }
  catch { /* ignore — will create */ }
  if (Array.isArray(existing)) {
    const found = existing.find((entry: { name?: string, apiKey?: string }) => entry.name === ZCODE_API_KEY_NAME && typeof entry.apiKey === 'string' && entry.apiKey.length > 0)
    if (found !== undefined) return { apiKey: (found as { apiKey: string }).apiKey }
  }
  const created = await requestBizApi(fetchImpl, listUrl, authorization, { method: 'POST', body: JSON.stringify({ name: ZCODE_API_KEY_NAME }) }) as { apiKey?: unknown }
  if (typeof created.apiKey !== 'string' || created.apiKey.length === 0) {
    throw new Error('API key creation returned unexpected shape: apiKey missing or empty')
  }
  return { apiKey: created.apiKey }
}

async function getSecretKey(fetchImpl: FetchFn, authorization: string, orgId: string, projectId: string, apiKey: string): Promise<string> {
  const url = `${BIGMODEL_HOST}/api/biz/v1/organization/${orgId}/projects/${projectId}/api_keys/copy/${encodeURIComponent(apiKey)}`
  const data = await requestBizApi(fetchImpl, url, authorization, { method: 'GET' }) as { secretKey?: unknown, secret_key?: unknown }
  return typeof data.secretKey === 'string' ? data.secretKey : typeof data.secret_key === 'string' ? data.secret_key : ''
}

/** Shape guard: a bogus upstream response fails the login, never stores a broken credential. */
function requireNonEmpty(value: string, label: string): string {
  if (value.length === 0) throw new Error(`${label} is missing or empty`)
  return value
}

/** Resolve the OAuth access token into an upstream coding-plan credential. */
export async function resolveCodingPlanCredential(fetchImpl: FetchFn, accessToken: string, userId?: string): Promise<Credential> {
  const token = requireNonEmpty(accessToken.trim(), 'OAuth access token')
  const authorization = token
  const { orgId, projectId } = await resolveCustomerInfo(fetchImpl, authorization)
  const { apiKey } = await findOrCreateApiKey(fetchImpl, authorization, orgId, projectId)
  let fullKey = apiKey
  try {
    const secret = await getSecretKey(fetchImpl, authorization, orgId, projectId, apiKey)
    if (secret.length > 0) fullKey = `${apiKey}.${secret}`
  }
  catch { /* use apiKey only */ }
  return {
    apiKey: fullKey,
    provider: 'bigmodel',
    ...(userId === undefined ? {} : { userId }),
    oauthAccessToken: token,
  }
}
