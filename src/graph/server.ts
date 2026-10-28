/**
 * Local server of the interactive viewer (docs/ORCHESTRATION.md §2.10,
 * §2.11): serves the one-file viewer, the rendered picture and the engine
 * reads as JSON, takes the human's mutations, and sends a server-sent event
 * whenever the graph revision changes, whoever changed the node files (this
 * server, the command line, an editor, git). Every write goes through the
 * engine with actor human; the server adds no rules of its own.
 *
 * It listens on 127.0.0.1 only. Every request must name this server in Host
 * (against DNS rebinding) and may carry no foreign Origin; a write must also
 * carry this server's Origin and the per-start token in X-Graph-Token, which
 * a page on another site can neither read nor send.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { watch } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { TRANSITIONS, openEngine } from './engine.ts'
import {
  ACTOR_LABELS,
  EDGE_LABELS,
  EVIDENCE_LABELS,
  KIND_LABELS,
  OP_LABELS,
  SLOPE_LABELS,
  STAGE_LABELS,
  STATUS_LABELS,
  TIER_LABELS,
  TYPE_LABELS,
  VERIFICATION_LABELS,
} from './labels.ts'
import type { LayoutOptions } from './layout.ts'
import { failure, type ErrorCode, type Failure } from './mutation.ts'
import { listOpenItems } from './projection.ts'
import { renderGraph } from './render.ts'
import {
  DISPATCH_FIELDS,
  EDITABLE_FIELDS,
  EVIDENCE_KINDS,
  ID_PATTERN,
  NODE_TYPES,
  SLOPES,
  STAGES,
  STATUSES,
  TASK_KINDS,
  TIERS,
  VERIFICATIONS,
} from './schema.ts'
import { loadGraph } from './store.ts'

/** Request header that carries the per-start token on writes. */
const TOKEN_HEADER = 'x-graph-token'

/** Largest accepted request body; a mutation is a few kilobytes. */
export const MAX_BODY = 256 * 1024

/** File events closer together than this are handled as one change. */
const SETTLE_MS = 100

const VIEWER_FILE = new URL('./viewer.html', import.meta.url)

/** Placeholder in viewer.html replaced by the per-response CSP nonce. */
const NONCE_SLOT = '__NONCE__'

export interface ServerOptions {
  /** Graph directory; it must exist (an empty one is an empty graph). */
  readonly dir: string
  /** TCP port on 127.0.0.1; 0 or absent picks a free one. */
  readonly port?: number
  /** Clock for history timestamps; tests pin it. */
  readonly now?: () => Date
  /** Problems no request can be answered with, such as a failed file watch; default console.error. */
  readonly report?: (message: string) => void
}

export interface GraphServer {
  /** http://127.0.0.1:<port> */
  readonly origin: string
  readonly token: string
  /** Viewer address with the token in the # fragment, which never reaches the request line. */
  readonly url: string
  close(): Promise<void>
}

/** HTTP status of each engine refusal. */
const HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  invalid: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  stale_revision: 409,
  graph_invalid: 409,
  evidence_required: 422,
  bad_transition: 422,
}

/** What the viewer needs to build its filters and forms; the rules themselves stay in the engine. */
const SCHEMA = {
  types: NODE_TYPES,
  statuses: STATUSES,
  verifications: VERIFICATIONS,
  stages: STAGES,
  slopes: SLOPES,
  kinds: TASK_KINDS,
  tiers: TIERS,
  /** Evidence a request may attach; decision evidence is written by decide. */
  evidenceKinds: EVIDENCE_KINDS.filter(kind => kind !== 'decision'),
  editable: EDITABLE_FIELDS,
  dispatch: DISPATCH_FIELDS,
  transitions: TRANSITIONS,
  labels: {
    types: TYPE_LABELS,
    statuses: STATUS_LABELS,
    verifications: VERIFICATION_LABELS,
    stages: STAGE_LABELS,
    slopes: SLOPE_LABELS,
    kinds: KIND_LABELS,
    tiers: TIER_LABELS,
    edges: EDGE_LABELS,
    evidence: EVIDENCE_LABELS,
    actors: ACTOR_LABELS,
    ops: OP_LABELS,
  },
}

const GRAPH_HINT = 'GET /api/graph takes collapse (repeatable), root and focus, each a node id; root and focus exclude each other'
const PROJECTION_HINT = 'GET /api/projection takes one id'
const WRITE_HINT = 'write from the viewer page: open the address graph:serve printed at start, the token is in its # fragment'

const COMMON_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
}

function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "connect-src 'self'",
    'img-src data:',
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

function sendJson(response: ServerResponse, status: number, body: unknown, headers: Readonly<Record<string, string>> = {}): void {
  const text = JSON.stringify(body)
  response.writeHead(status, { ...COMMON_HEADERS, ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) })
  response.end(text)
}

function refuse(response: ServerResponse, refusal: Failure, status: number = HTTP_STATUS[refusal.error.code], headers: Readonly<Record<string, string>> = {}): void {
  sendJson(response, status, refusal, headers)
}

function sameToken(given: string | string[] | undefined, token: string): boolean {
  if (typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The body as text, or undefined when it is larger than MAX_BODY (the rest is drained, not kept). */
async function readBody(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).length
    if (size <= MAX_BODY) chunks.push(chunk as Buffer)
  }
  return size > MAX_BODY ? undefined : Buffer.concat(chunks).toString('utf8')
}

/** Only the named parameters, each a node id; returns the bad parameter as a failure. */
function idParams(params: URLSearchParams, allowed: readonly string[], hint: string): Failure | undefined {
  for (const [key, value] of params) {
    if (!allowed.includes(key)) return failure('invalid', `unknown query parameter "${key}"`, hint, key)
    if (!ID_PATTERN.test(value)) return failure('invalid', `${key} must be a node id`, hint, key)
  }
  return undefined
}

function single(params: URLSearchParams, key: string, hint: string): string | undefined | Failure {
  const values = params.getAll(key)
  if (values.length > 1) return failure('invalid', `${key} is given ${values.length} times`, hint, key)
  return values[0]
}

function viewOptions(params: URLSearchParams): LayoutOptions | Failure {
  const bad = idParams(params, ['collapse', 'root', 'focus'], GRAPH_HINT)
  if (bad !== undefined) return bad
  const root = single(params, 'root', GRAPH_HINT)
  if (typeof root === 'object') return root
  const focus = single(params, 'focus', GRAPH_HINT)
  if (typeof focus === 'object') return focus
  const collapsed = params.getAll('collapse')
  return {
    ...(root === undefined ? {} : { root }),
    ...(focus === undefined ? {} : { focus }),
    ...(collapsed.length === 0 ? {} : { collapsed }),
  }
}

export async function startServer(options: ServerOptions): Promise<GraphServer> {
  const { dir } = options
  const report = options.report ?? ((message: string) => console.error(message))
  const info = await stat(dir).catch(() => undefined)
  if (info === undefined || !info.isDirectory()) throw new Error(`graph directory ${dir} does not exist; create it or pass another --dir`)
  const viewer = await readFile(VIEWER_FILE, 'utf8')
  const engine = openEngine(dir, options.now === undefined ? {} : { now: options.now })
  const token = randomBytes(24).toString('base64url')
  const clients = new Set<ServerResponse>()

  let revision = ''
  let checking = Promise.resolve()
  /** Re-read the graph revision and tell every viewer when it moved; checks run one after another. */
  const check = (): Promise<void> => {
    checking = checking.then(async () => {
      try {
        const next = (await loadGraph(dir)).revision
        if (next === revision) return
        revision = next
        for (const client of clients) client.write(revisionEvent(next))
      }
      catch (error) {
        report(`graph:serve: cannot read the graph after a change: ${(error as Error).message}`)
      }
    })
    return checking
  }

  let timer: NodeJS.Timeout | undefined
  // The whole graph directory, so a nodes/ directory created later is watched as well.
  const watcher = watch(dir, { recursive: true }, () => {
    clearTimeout(timer)
    timer = setTimeout(() => void check(), SETTLE_MS)
  })
  watcher.on('error', error => report(`graph:serve: live updates stopped, watching ${dir} failed: ${error.message}; reload the page after changes`))

  const server = createServer()
  try {
    // Read after the watch starts, so no change falls between the two.
    revision = (await loadGraph(dir)).revision
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(options.port ?? 0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
  }
  catch (error) {
    clearTimeout(timer)
    watcher.close()
    throw error
  }
  const { port } = server.address() as AddressInfo
  const origin = `http://127.0.0.1:${port}`
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
  const origins = new Set([...hosts].map(host => `http://${host}`))

  function serveViewer(response: ServerResponse): void {
    const nonce = randomBytes(16).toString('base64')
    const html = viewer.replaceAll(NONCE_SLOT, nonce)
    response.writeHead(200, {
      ...COMMON_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
      'Content-Security-Policy': contentSecurityPolicy(nonce),
    })
    response.end(html)
  }

  async function serveGraph(response: ServerResponse, params: URLSearchParams): Promise<void> {
    const view = viewOptions(params)
    if ('ok' in view) return refuse(response, view)
    const graph = await engine.load()
    const rendered = renderGraph(graph, view)
    if (!rendered.ok) return refuse(response, rendered)
    sendJson(response, 200, {
      ok: true,
      revision: graph.revision,
      svg: rendered.svg,
      nodes: [...graph.nodes.values()].map(node => ({ ...node, rev: graph.revisions.get(node.id)! })),
      issues: graph.issues,
      items: listOpenItems(graph),
    })
  }

  async function serveProjection(response: ServerResponse, params: URLSearchParams): Promise<void> {
    const bad = idParams(params, ['id'], PROJECTION_HINT)
    if (bad !== undefined) return refuse(response, bad)
    const id = single(params, 'id', PROJECTION_HINT)
    if (typeof id === 'object') return refuse(response, id)
    if (id === undefined) return refuse(response, failure('invalid', 'id is required', PROJECTION_HINT, 'id'))
    const result = await engine.projection(id)
    if (!result.ok) return refuse(response, result)
    sendJson(response, 200, result)
  }

  function serveEvents(request: IncomingMessage, response: ServerResponse): void {
    response.writeHead(200, { ...COMMON_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8', 'Connection': 'keep-alive' })
    response.write(revisionEvent(revision))
    clients.add(response)
    request.on('close', () => clients.delete(response))
  }

  async function serveApply(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.origin === undefined) return refuse(response, failure('forbidden', 'a write must carry the Origin of this server', WRITE_HINT))
    if (!sameToken(request.headers[TOKEN_HEADER], token)) return refuse(response, failure('forbidden', `missing or wrong ${TOKEN_HEADER}`, WRITE_HINT))
    if (!/^application\/json\s*(;|$)/i.test(request.headers['content-type'] ?? '')) {
      return refuse(response, failure('invalid', 'the body must be sent as application/json', 'send the mutation as a JSON object with Content-Type: application/json'), 415)
    }
    const tooLarge = failure('invalid', `the body is larger than ${MAX_BODY} bytes`, 'a mutation is a small JSON object; long text belongs in docs/')
    if (Number(request.headers['content-length'] ?? 0) > MAX_BODY) return refuse(response, tooLarge, 413, { Connection: 'close' })
    const body = await readBody(request)
    if (body === undefined) return refuse(response, tooLarge, 413)
    let mutation: unknown
    try {
      mutation = JSON.parse(body)
    }
    catch (error) {
      return refuse(response, failure('invalid', `the body is not valid JSON: ${(error as Error).message}`, 'send one mutation as a JSON object, see docs/ORCHESTRATION.md §2.9'))
    }
    const result = await engine.apply('human', mutation)
    if (!result.ok) return refuse(response, result)
    // Viewers hear about the write before its own response arrives.
    await check()
    sendJson(response, 200, result)
  }

  const ROUTES: Readonly<Record<string, string>> = {
    '/': 'GET',
    '/api/schema': 'GET',
    '/api/graph': 'GET',
    '/api/projection': 'GET',
    '/api/events': 'GET',
    '/api/apply': 'POST',
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const host = request.headers.host
    if (host === undefined || !hosts.has(host)) {
      return refuse(response, failure('forbidden', `Host "${host ?? ''}" is not this server`, `open ${origin}/ as printed by graph:serve`))
    }
    const from = request.headers.origin
    if (from !== undefined && !origins.has(from)) {
      return refuse(response, failure('forbidden', `Origin "${from}" is not this server`, 'only the viewer page this server serves may call it'))
    }
    const target = new URL(request.url ?? '/', origin)
    const method = ROUTES[target.pathname]
    if (method === undefined) return refuse(response, failure('not_found', `no route ${target.pathname}`, `routes: ${Object.keys(ROUTES).join(', ')}`))
    if (request.method !== method) return refuse(response, failure('invalid', `${target.pathname} takes ${method}, not ${request.method ?? ''}`, `send ${method} ${target.pathname}`), 405, { Allow: method })
    if (method === 'GET' && target.pathname !== '/api/graph' && target.pathname !== '/api/projection' && target.search !== '') {
      return refuse(response, failure('invalid', `${target.pathname} takes no query`, `send GET ${target.pathname}`))
    }
    switch (target.pathname) {
      case '/': return serveViewer(response)
      case '/api/schema': return sendJson(response, 200, { ok: true, schema: SCHEMA })
      case '/api/graph': return serveGraph(response, target.searchParams)
      case '/api/projection': return serveProjection(response, target.searchParams)
      case '/api/events': return serveEvents(request, response)
      default: return serveApply(request, response)
    }
  }

  server.on('request', (request: IncomingMessage, response: ServerResponse) => {
    handle(request, response).catch((error: unknown) => {
      report(`graph:serve: ${request.method ?? ''} ${request.url ?? ''} failed: ${(error as Error).stack ?? String(error)}`)
      if (response.headersSent) {
        response.end()
        return
      }
      sendJson(response, 500, { ok: false, error: { code: 'internal', message: (error as Error).message, hint: 'see the graph:serve output; read the graph again before retrying' } })
    })
  })

  return {
    origin,
    token,
    url: `${origin}/#token=${token}`,
    close: async () => {
      clearTimeout(timer)
      watcher.close()
      for (const client of clients) client.end()
      clients.clear()
      const closed = new Promise<void>(resolve => server.close(() => resolve()))
      server.closeAllConnections()
      await closed
      await checking
    },
  }
}

function revisionEvent(revision: string): string {
  return `event: revision\ndata: ${JSON.stringify({ revision })}\n\n`
}
