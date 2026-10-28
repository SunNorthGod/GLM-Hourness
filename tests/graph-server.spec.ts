import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { request, type IncomingHttpHeaders } from 'node:http'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Script } from 'node:vm'
import { runCli } from '../src/graph/cli.ts'
import { openEngine } from '../src/graph/engine.ts'
import type { GraphIssue } from '../src/graph/format.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import { MAX_BODY, startServer, type GraphServer } from '../src/graph/server.ts'
import { loadGraph } from '../src/graph/store.ts'
import type { GraphAnswer } from './graph-helpers.ts'

/** The server's JSON answers: the shared shapes plus GET /api/graph and GET /api/schema. */
interface ServerAnswer extends GraphAnswer {
  readonly svg: string
  readonly nodes: readonly (GraphNode & { readonly rev: string })[]
  readonly issues: readonly GraphIssue[]
  readonly schema: {
    readonly transitions: Readonly<Record<string, readonly string[]>>
    readonly evidenceKinds: readonly string[]
    readonly labels: Readonly<Record<string, Readonly<Record<string, string>>>>
  }
}

interface Reply {
  readonly status: number
  readonly headers: IncomingHttpHeaders
  readonly text: string
  /** The parsed body; undefined when it is not JSON. */
  readonly json: ServerAnswer | undefined
}

/** Header values; undefined leaves a default header out. */
type Headers = Readonly<Record<string, string | undefined>>

interface Stream {
  /** Resolves once the server has pushed this revision (or already had). */
  until(revision: string): Promise<void>
  /** Resolves when the server ends the stream. */
  readonly ended: Promise<void>
  close(): void
}

interface Fixture {
  readonly dir: string
  readonly server: GraphServer
  readonly port: number
  call(method: string, path: string, options?: { readonly headers?: Headers, readonly body?: string }): Promise<Reply>
  /** POST /api/apply with the token and Origin of the server unless overridden. */
  write(mutation: unknown, headers?: Headers): Promise<Reply>
  events(): Promise<Stream>
  revision(): Promise<string>
  rev(id: string): Promise<string>
  node(id: string): Promise<GraphNode>
  llm(args: readonly string[]): Promise<GraphAnswer>
}

const WAIT_MS = 5000

function within<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), WAIT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * goal-1
 *   feature-1 approved
 *     task-1 approved
 *     question-1 approved (options A, B; recommend A)
 *   feature-2 proposed by the llm
 *   feature-3 proposed by the llm
 */
async function fixture(): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), 'graph-server-'))
  let tick = 0
  const now = () => new Date(Date.UTC(2026, 9, 28, 10, 0, tick++))
  const engine = openEngine(dir, { now })
  const seed = async (actor: 'human' | 'llm', node: Record<string, unknown>): Promise<void> => {
    const result = await engine.apply(actor, { op: 'propose', reason: '建图', node })
    assert.ok(result.ok, JSON.stringify(result))
  }
  await seed('human', { type: 'goal', title: '项目图引擎', acceptance: ['人能看，LLM 能读写'] })
  await seed('human', { type: 'feature', title: '查看器', parent: 'goal-1' })
  await seed('human', { type: 'task', title: '起服务', parent: 'feature-1', acceptance: ['冒烟通过'] })
  await seed('human', {
    type: 'question',
    title: '筛选是隐藏还是变淡',
    parent: 'feature-1',
    options: [{ key: 'A', label: '变淡', consequence: '布局不跳' }, { key: 'B', label: '隐藏', consequence: '图更小' }],
    recommend: 'A',
  })
  await seed('llm', { type: 'feature', title: 'DSH 标签页', parent: 'goal-1' })
  await seed('llm', { type: 'feature', title: '手机端', parent: 'goal-1' })
  const server = await startServer({ dir, now, report: message => assert.fail(`unexpected report: ${message}`) })
  const port = Number(new URL(server.origin).port)

  const call: Fixture['call'] = (method, path, options = {}) => new Promise((resolve, reject) => {
    const headers = Object.fromEntries(Object.entries(options.headers ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined))
    const outgoing = request({ host: '127.0.0.1', port, method, path, headers }, response => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json: ServerAnswer | undefined
        try {
          json = JSON.parse(text) as ServerAnswer
        }
        catch {
          json = undefined
        }
        resolve({ status: response.statusCode!, headers: response.headers, text, json })
      })
    })
    outgoing.on('error', reject)
    if (options.body !== undefined) outgoing.write(options.body)
    outgoing.end()
  })

  const events = (): Promise<Stream> => within(new Promise((resolve, reject) => {
    const seen = new Set<string>()
    const waiting = new Map<string, () => void>()
    const outgoing = request({ host: '127.0.0.1', port, path: '/api/events' }, response => {
      assert.equal(response.statusCode, 200)
      assert.match(String(response.headers['content-type']), /^text\/event-stream/)
      response.setEncoding('utf8')
      let buffer = ''
      let first = true
      const ended = new Promise<void>(done => response.on('end', done))
      response.on('data', (chunk: string) => {
        buffer += chunk
        for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const match = /^event: revision\ndata: (.*)$/.exec(block)
          assert.ok(match !== null, `unexpected event block ${JSON.stringify(block)}`)
          const revision = (JSON.parse(match[1]) as { revision: string }).revision
          seen.add(revision)
          waiting.get(revision)?.()
          if (first) {
            first = false
            resolve({
              until: revision => within(new Promise<void>(done => {
                if (seen.has(revision)) done()
                else waiting.set(revision, done)
              }), `a revision event for ${revision}`),
              ended,
              close: () => outgoing.destroy(),
            })
          }
        }
      })
    })
    outgoing.on('error', reject)
    outgoing.end()
  }), 'the first event')

  return {
    dir,
    server,
    port,
    call,
    write: (mutation, headers = {}) => call('POST', '/api/apply', {
      headers: { 'Content-Type': 'application/json', 'Origin': server.origin, 'X-Graph-Token': server.token, ...headers },
      body: JSON.stringify(mutation),
    }),
    events,
    revision: async () => (await loadGraph(dir)).revision,
    rev: async id => (await loadGraph(dir)).revisions.get(id)!,
    node: async id => (await loadGraph(dir)).nodes.get(id)!,
    llm: async args => {
      const result = await runCli(['--dir', dir, ...args], { dir, now, stdin: () => Promise.resolve('') })
      return JSON.parse(result.text) as GraphAnswer
    },
  }
}

function serverTest(name: string, body: (fixture: Fixture) => Promise<void>): void {
  test(name, async () => {
    const graph = await fixture()
    try {
      await body(graph)
    }
    finally {
      await graph.server.close()
      await rm(graph.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })
}

function refused(reply: Reply, status: number, code: string, field?: string): void {
  assert.equal(reply.status, status, reply.text)
  assert.match(String(reply.headers['content-type']), /^application\/json/)
  const json = reply.json
  assert.ok(json !== undefined && json.ok === false, reply.text)
  assert.equal(json.error.code, code, reply.text)
  if (field !== undefined) assert.equal(json.error.field, field, reply.text)
  assert.equal(typeof json.error.message, 'string')
  assert.ok(json.error.hint.length > 0, 'every refusal names the way forward')
}

function accepted(reply: Reply): ServerAnswer {
  assert.equal(reply.status, 200, reply.text)
  const json = reply.json
  assert.ok(json !== undefined && json.ok === true, reply.text)
  return json
}

serverTest('the server binds 127.0.0.1 and serves one self-contained viewer page under a nonce CSP', async g => {
  assert.match(g.server.origin, /^http:\/\/127\.0\.0\.1:\d+$/)
  assert.equal(g.server.url, `${g.server.origin}/#token=${g.server.token}`, 'the token travels in the fragment, never in the request line')
  assert.ok(g.server.token.length >= 32)
  const page = await g.call('GET', '/')
  assert.equal(page.status, 200)
  assert.match(String(page.headers['content-type']), /^text\/html; charset=utf-8/)
  assert.equal(page.headers['cache-control'], 'no-store')
  const policy = String(page.headers['content-security-policy'])
  const nonce = /script-src 'nonce-([^']+)'/.exec(policy)?.[1]
  assert.ok(nonce !== undefined, policy)
  for (const directive of ["default-src 'none'", `style-src 'nonce-${nonce}'`, "connect-src 'self'", "frame-ancestors 'none'", "form-action 'none'"]) {
    assert.ok(policy.includes(directive), `${directive} in ${policy}`)
  }
  assert.ok(page.text.includes(`<script nonce="${nonce}">`) && page.text.includes(`<style nonce="${nonce}">`))
  assert.ok(!page.text.includes('__NONCE__'))
  assert.doesNotMatch(page.text, /https?:\/\//, 'no network reference')
  assert.doesNotMatch(page.text, /\s(src|href)="(?!data:)/, 'no external script, style or image')
  const script = /<script nonce="[^"]+">([\s\S]*)<\/script>/.exec(page.text)![1]
  assert.doesNotThrow(() => new Script(script, { filename: 'viewer.html' }), 'the viewer script compiles')
  const again = await g.call('GET', '/')
  assert.notEqual(/script-src 'nonce-([^']+)'/.exec(String(again.headers['content-security-policy']))?.[1], nonce, 'a fresh nonce per response')
})

serverTest('every request must name this server in Host, and a foreign Origin is refused even on reads', async g => {
  const before = await g.revision()
  refused(await g.call('GET', '/', { headers: { Host: 'evil.example' } }), 403, 'forbidden')
  refused(await g.call('GET', '/api/graph', { headers: { Host: `evil.example:${g.port}` } }), 403, 'forbidden')
  refused(await g.call('GET', '/api/events', { headers: { Host: `127.0.0.1:${g.port + 1}` } }), 403, 'forbidden')
  refused(await g.call('GET', '/api/graph', { headers: { Origin: 'http://evil.example' } }), 403, 'forbidden')
  refused(await g.write({ op: 'comment', id: 'task-1', text: '重绑定' }, { Host: 'evil.example' }), 403, 'forbidden')
  accepted(await g.call('GET', '/api/graph', { headers: { Host: `localhost:${g.port}` } }))
  accepted(await g.call('GET', '/api/graph', { headers: { Origin: g.server.origin } }))
  assert.equal(await g.revision(), before, 'nothing was written')
})

serverTest('a write needs the per-start token and the Origin of this server; refused writes change nothing', async g => {
  const before = await g.revision()
  const comment = { op: 'comment', id: 'task-1', text: '跨站' }
  refused(await g.write(comment, { 'X-Graph-Token': undefined }), 403, 'forbidden')
  refused(await g.write(comment, { 'X-Graph-Token': 'x'.repeat(g.server.token.length) }), 403, 'forbidden')
  refused(await g.write(comment, { 'X-Graph-Token': `${g.server.token}x` }), 403, 'forbidden')
  refused(await g.write(comment, { Origin: undefined }), 403, 'forbidden')
  refused(await g.write(comment, { Origin: 'http://evil.example' }), 403, 'forbidden')
  refused(await g.write(comment, { Origin: 'null' }), 403, 'forbidden')
  assert.equal(await g.revision(), before, 'nothing was written')
  const written = accepted(await g.write(comment, { Origin: `http://localhost:${g.port}` }))
  assert.deepEqual(written.changed, ['task-1'])
})

serverTest('request bodies, routes and queries are checked before the engine runs', async g => {
  const before = await g.revision()
  refused(await g.call('POST', '/api/apply', {
    headers: { 'Content-Type': 'text/plain', 'Origin': g.server.origin, 'X-Graph-Token': g.server.token },
    body: JSON.stringify({ op: 'comment', id: 'task-1', text: '表单' }),
  }), 415, 'invalid')
  refused(await g.write({ op: 'comment', id: 'task-1', text: '长'.repeat(MAX_BODY) }), 413, 'invalid')
  refused(await g.call('POST', '/api/apply', {
    headers: { 'Content-Type': 'application/json', 'Origin': g.server.origin, 'X-Graph-Token': g.server.token },
    body: '{"op": "comment",',
  }), 400, 'invalid')
  refused(await g.write(['comment']), 400, 'invalid')
  refused(await g.write({ op: 'comment', id: 'task-1', text: '冒充', actor: 'llm' }), 400, 'invalid', 'actor')
  refused(await g.write({ op: 'delete', id: 'task-1' }), 400, 'invalid', 'op')
  const wrongMethod = await g.call('GET', '/api/apply')
  refused(wrongMethod, 405, 'invalid')
  assert.equal(wrongMethod.headers.allow, 'POST')
  refused(await g.call('POST', '/api/graph', { headers: { Origin: g.server.origin } }), 405, 'invalid')
  refused(await g.call('GET', '/api/nodes'), 404, 'not_found')
  refused(await g.call('GET', '/?x=1'), 400, 'invalid')
  refused(await g.call('GET', '/api/graph?bogus=1'), 400, 'invalid', 'bogus')
  refused(await g.call('GET', '/api/graph?focus=Task!'), 400, 'invalid', 'focus')
  refused(await g.call('GET', '/api/graph?focus=task-1&focus=goal-1'), 400, 'invalid', 'focus')
  refused(await g.call('GET', '/api/graph?root=goal-1&focus=task-1'), 400, 'invalid', 'focus')
  refused(await g.call('GET', '/api/graph?focus=task-9'), 404, 'not_found', 'focus')
  refused(await g.call('GET', '/api/projection'), 400, 'invalid', 'id')
  refused(await g.call('GET', '/api/projection?id=task-9'), 404, 'not_found', 'id')
  assert.equal(await g.revision(), before, 'nothing was written')
})

serverTest('reads: the picture, every node with its revision, the issues, the open items, the schema and a projection', async g => {
  const loaded = await loadGraph(g.dir)
  const graph = accepted(await g.call('GET', '/api/graph'))
  assert.equal(graph.revision, loaded.revision)
  assert.ok(String(graph.svg).startsWith('<svg'))
  assert.ok(graph.svg.includes(`data-revision="${loaded.revision}"`))
  assert.deepEqual(graph.nodes.map((node: { id: string }) => node.id), [...loaded.nodes.keys()])
  for (const node of graph.nodes) assert.equal(node.rev, loaded.revisions.get(node.id))
  assert.equal(graph.nodes.find(node => node.id === 'task-1')?.history.length, 1, 'nodes carry their full history')
  assert.deepEqual(graph.issues, [])
  assert.deepEqual(graph.items.proposals.map((entry: { id: string }) => entry.id), ['feature-2', 'feature-3'])
  assert.deepEqual(graph.items.questions.map(entry => [entry.id, entry.raisedBy?.id]), [['question-1', 'feature-1']])
  const collapsed = accepted(await g.call('GET', '/api/graph?collapse=feature-1&collapse=nope'))
  assert.match(collapsed.svg, /<g data-id="feature-1"[^>]*data-hidden="2"/)
  assert.match(collapsed.svg, /<g data-badge="true">/)
  assert.ok(!collapsed.svg.includes('data-id="task-1"'))
  const focused = accepted(await g.call('GET', '/api/graph?focus=task-1'))
  assert.match(focused.svg, /<g data-id="task-1"[^>]*data-focus="true"/)
  assert.ok(!focused.svg.includes('data-id="feature-2"'))
  const { schema } = accepted(await g.call('GET', '/api/schema'))
  assert.deepEqual(schema.transitions.approved, ['doing', 'done', 'dropped'])
  assert.deepEqual(schema.evidenceKinds, ['commit', 'test', 'check'])
  assert.equal(schema.labels.types.question, '待决')
  assert.equal(schema.labels.ops.decide, '拍板')
  const { projection } = accepted(await g.call('GET', '/api/projection?id=task-1'))
  assert.deepEqual(projection.ancestors.map((entry: { id: string }) => entry.id), ['feature-1', 'goal-1'])
  assert.equal(projection.node.rev, loaded.revisions.get('task-1'))
})

serverTest('the human acts as human: comment, approve, reject, decide with a note, status with evidence, edit goal and dispatch fields', async g => {
  const comment = accepted(await g.write({ op: 'comment', id: 'task-1', text: '先跑冒烟' }))
  assert.equal(comment.node.history.at(-1)?.actor, 'human')
  const approved = accepted(await g.write({ op: 'approve', id: 'feature-2', rev: await g.rev('feature-2'), reason: '先做 Browser 标签页' }))
  assert.equal(approved.node.status, 'approved')
  const rejected = accepted(await g.write({ op: 'reject', id: 'feature-3', rev: await g.rev('feature-3'), reason: '不做手机端' }))
  assert.equal(rejected.node.status, 'dropped')
  const decided = accepted(await g.write({ op: 'decide', id: 'question-1', rev: await g.rev('question-1'), option: 'B', reason: '节点多时要小图' }))
  assert.deepEqual([decided.node.status, decided.node.decision], ['done', 'B'])
  const done = accepted(await g.write({
    op: 'status',
    id: 'task-1',
    rev: await g.rev('task-1'),
    to: 'done',
    reason: '冒烟通过',
    evidence: [{ kind: 'commit', ref: 'abc1234' }],
  }))
  assert.deepEqual(done.node.evidence, [{ kind: 'commit', ref: 'abc1234' }])
  const goal = accepted(await g.write({
    op: 'edit',
    id: 'goal-1',
    rev: await g.rev('goal-1'),
    reason: '把交互写进验收',
    set: { title: '可交互的项目图引擎', acceptance: ['人能看能改', 'LLM 能读写'], nonGoals: ['不接 DSH 运行时'] },
  }))
  assert.deepEqual(goal.node.acceptance, ['人能看能改', 'LLM 能读写'])
  const task = accepted(await g.write({
    op: 'edit',
    id: 'task-1',
    rev: await g.rev('task-1'),
    reason: '派发',
    set: { kind: 'implement', tier: 'standard', worktree: true, writeScope: ['src/graph/server.ts'] },
  }))
  assert.deepEqual([task.node.kind, task.node.tier, task.node.worktree, task.node.writeScope], ['implement', 'standard', true, ['src/graph/server.ts']])
  for (const id of ['task-1', 'feature-2', 'feature-3', 'question-1', 'goal-1']) {
    const entries = (await g.node(id)).history.slice(1)
    assert.ok(entries.length > 0 && entries.every(entry => entry.actor === 'human'), `${id}: every write is recorded as human`)
  }
  const edit = (await g.node('goal-1')).history.at(-1)!
  assert.deepEqual(edit.changes?.acceptance, { from: ['人能看，LLM 能读写'], to: ['人能看能改', 'LLM 能读写'] })

  // The llm sees the decision in the projections it reads after the human decided.
  const parent = await g.llm(['show', 'feature-1'])
  assert.equal(parent.projection.children.find(entry => entry.id === 'question-1')?.decision, 'B')
  const question = await g.llm(['show', 'question-1'])
  assert.equal(question.projection.node.decision, 'B')
  assert.deepEqual([question.projection.recentHistory.at(-1)?.actor, question.projection.recentHistory.at(-1)?.reason], ['human', '节点多时要小图'])
  const open = await g.llm(['open'])
  assert.deepEqual(open.items.questions, [], 'the decided card left the queue')
})

serverTest('engine refusals come back as structured errors with a matching HTTP status', async g => {
  const before = await g.revision()
  const rev = await g.rev('task-1')
  refused(await g.write({ op: 'status', id: 'task-1', rev, to: 'done', reason: '做完了' }), 422, 'evidence_required', 'evidence')
  refused(await g.write({ op: 'status', id: 'task-1', rev: '000000000000', to: 'doing', reason: '开工' }), 409, 'stale_revision', 'rev')
  refused(await g.write({ op: 'decide', id: 'question-1', rev: await g.rev('question-1'), option: 'C', reason: '第三条路' }), 400, 'invalid', 'option')
  refused(await g.write({ op: 'approve', id: 'task-1', rev, reason: '再批一次' }), 422, 'bad_transition')
  refused(await g.write({ op: 'comment', id: 'task-9', text: '没有这个节点' }), 404, 'not_found', 'id')
  refused(await g.write({ op: 'edit', id: 'task-1', rev, reason: '清空', set: { title: null } }), 400, 'invalid', 'set.title')
  assert.equal(await g.revision(), before, 'nothing was written')
})

serverTest('a command line write, a hand edit of a node file and the server\'s own write each reach the viewer as a revision event', async g => {
  const stream = await g.events()
  await stream.until(await g.revision())

  const cli = await g.llm(['comment', JSON.stringify({ id: 'task-1', text: 'LLM 的批注' })])
  assert.equal(cli.ok, true, JSON.stringify(cli))
  await stream.until(cli.revision)
  const graph = accepted(await g.call('GET', '/api/graph'))
  assert.equal(graph.revision, cli.revision)
  assert.deepEqual(graph.nodes.find(node => node.id === 'task-1')?.history.at(-1), { at: cli.node.history.at(-1)?.at, actor: 'llm', op: 'comment', text: 'LLM 的批注' })

  const file = join(g.dir, 'nodes', 'feature-2.json')
  await writeFile(file, JSON.stringify(JSON.parse(await readFile(file, 'utf8'))))
  const handEdited = await g.revision()
  assert.notEqual(handEdited, cli.revision)
  await stream.until(handEdited)

  const own = accepted(await g.write({ op: 'comment', id: 'task-1', text: '人的批注' }))
  await stream.until(own.revision)
  stream.close()
})

serverTest('close ends the event streams and stops listening', async g => {
  const stream = await g.events()
  await g.server.close()
  await within(stream.ended, 'the end of the event stream')
  // A fresh connection, so no pooled keep-alive socket is reused.
  await assert.rejects(new Promise((resolve, reject) => {
    const socket = connect(g.port, '127.0.0.1', () => {
      socket.destroy()
      resolve(undefined)
    })
    socket.on('error', reject)
  }), { code: 'ECONNREFUSED' })
})
