/**
 * Smoke check of the viewer server across processes (docs/ORCHESTRATION.md
 * §2.10, §2.11); part of npm test.
 *
 *   npm run graph:smoke
 *
 * Seeds a temporary graph, starts scripts/graph/serve.ts on a free port as a
 * process of its own, fetches the viewer page and the graph JSON, writes one
 * human comment through the HTTP API and one llm comment through
 * scripts/graph/cli.ts (a third process), checks that the server pushed a
 * revision event for each write and that both comments are in the graph
 * JSON, then stops the server and removes the temporary graph.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openEngine } from '../../src/graph/engine.ts'

const WAIT_MS = 10_000
const here = dirname(fileURLToPath(import.meta.url))
const flags = ['--experimental-strip-types', '--no-warnings']

function fail(message: string): never {
  throw new Error(message)
}

function within<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${WAIT_MS} ms waiting for ${what}`)), WAIT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** The viewer address the server prints on start. */
function addressOf(server: ChildProcess, output: string[]): Promise<{ origin: string, token: string }> {
  return within(new Promise((resolve, reject) => {
    let text = ''
    server.stdout!.setEncoding('utf8')
    server.stdout!.on('data', (chunk: string) => {
      text += chunk
      const match = /graph:serve: (http:\/\/127\.0\.0\.1:\d+)\/#token=([A-Za-z0-9_-]+)/.exec(text)
      if (match !== null) resolve({ origin: match[1]!, token: match[2]! })
    })
    server.stderr!.setEncoding('utf8')
    server.stderr!.on('data', (chunk: string) => output.push(chunk))
    server.once('exit', code => reject(new Error(`graph:serve exited with ${code} before printing its address: ${output.join('')}`)))
  }), 'the graph:serve address')
}

interface Events {
  /** Resolves once the server has pushed this revision. */
  waitFor(revision: string): Promise<void>
  close(): void
}

async function openEvents(origin: string): Promise<Events> {
  const abort = new AbortController()
  const response = await fetch(`${origin}/api/events`, { signal: abort.signal })
  if (response.status !== 200 || response.body === null) fail(`GET /api/events answered ${response.status}`)
  const seen = new Set<string>()
  const waiting = new Map<string, () => void>()
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  void (async () => {
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }))
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
        const block = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const data = /^data: (.*)$/m.exec(block)
        if (!/^event: revision$/m.test(block) || data === null) continue
        const revision = (JSON.parse(data[1]!) as { revision: string }).revision
        seen.add(revision)
        waiting.get(revision)?.()
      }
    }
  })()
  return {
    waitFor: revision => within(new Promise<void>(resolve => {
      if (seen.has(revision)) resolve()
      else waiting.set(revision, resolve)
    }), `a revision event for ${revision}`),
    close: () => abort.abort(),
  }
}

async function json(response: Response, what: string): Promise<Record<string, any>> {
  const body = await response.json() as Record<string, any>
  if (response.status !== 200 || body.ok !== true) fail(`${what} answered ${response.status}: ${JSON.stringify(body)}`)
  return body
}

function runCli(args: readonly string[]): Promise<Record<string, any>> {
  return within(new Promise((resolve, reject) => {
    execFile(process.execPath, [...flags, join(here, 'cli.ts'), ...args], { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error !== null) reject(new Error(`graph cli ${args.join(' ')} failed: ${error.message} ${stdout} ${stderr}`))
      else resolve(JSON.parse(stdout) as Record<string, any>)
    })
  }), 'the graph command line')
}

async function smoke(dir: string, output: string[]): Promise<string> {
  const engine = openEngine(dir)
  for (const node of [
    { type: 'goal', title: '冒烟目标', acceptance: ['查看器与命令行改同一张图'] },
    { type: 'feature', title: '查看器', parent: 'goal-1' },
    { type: 'task', title: '起服务', parent: 'feature-1' },
  ]) {
    const result = await engine.apply('human', { op: 'propose', reason: '冒烟', node })
    if (!result.ok) fail(`seeding failed: ${JSON.stringify(result.error)}`)
  }
  const server = spawn(process.execPath, [...flags, join(here, 'serve.ts'), '--dir', dir, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    const { origin, token } = await addressOf(server, output)

    const page = await fetch(`${origin}/`)
    const html = await page.text()
    const policy = page.headers.get('content-security-policy') ?? ''
    if (page.status !== 200 || !(page.headers.get('content-type') ?? '').startsWith('text/html')) fail(`GET / answered ${page.status} ${page.headers.get('content-type')}`)
    const nonce = /script-src 'nonce-([^']+)'/.exec(policy)?.[1]
    if (nonce === undefined || !html.includes(`<script nonce="${nonce}">`) || html.includes('__NONCE__')) fail('the viewer page and its CSP nonce do not match')

    const before = await json(await fetch(`${origin}/api/graph`), 'GET /api/graph')
    if (before.nodes.length !== 3 || !String(before.svg).startsWith('<svg')) fail(`GET /api/graph returned ${before.nodes.length} nodes`)
    const events = await openEvents(origin)
    try {
      const human = await json(await fetch(`${origin}/api/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': origin, 'X-Graph-Token': token },
        body: JSON.stringify({ op: 'comment', id: 'task-1', text: '人在查看器里写的批注' }),
      }), 'POST /api/apply')
      await events.waitFor(human.revision)

      const request = join(dir, 'comment.json')
      await writeFile(request, JSON.stringify({ id: 'task-1', text: 'LLM 经命令行写的批注' }))
      const llm = await runCli(['--dir', dir, 'comment', '--file', request])
      if (llm.ok !== true) fail(`the command line refused the comment: ${JSON.stringify(llm)}`)
      await events.waitFor(llm.revision)

      const after = await json(await fetch(`${origin}/api/graph`), 'GET /api/graph')
      const history = (after.nodes as { id: string, history: { actor: string, op: string, text?: string }[] }[]).find(node => node.id === 'task-1')!.history
      const has = (actor: string, text: string): boolean => history.some(entry => entry.op === 'comment' && entry.actor === actor && entry.text === text)
      if (!has('human', '人在查看器里写的批注') || !has('llm', 'LLM 经命令行写的批注')) fail(`the graph JSON lacks a comment: ${JSON.stringify(history)}`)
      if (after.revision !== llm.revision) fail(`the graph is at ${after.revision}, the command line wrote ${llm.revision}`)
      return `server ${origin}, revisions ${before.revision} -> ${human.revision} (human) -> ${llm.revision} (llm)`
    }
    finally {
      events.close()
    }
  }
  finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = new Promise(resolve => server.once('exit', resolve))
      server.kill()
      await exited
    }
  }
}

const dir = await mkdtemp(join(tmpdir(), 'graph-smoke-'))
const output: string[] = []
try {
  console.log(`graph:smoke: ok (${await smoke(dir, output)})`)
}
catch (error) {
  console.error(`graph:smoke: FAILED: ${(error as Error).message}${output.length > 0 ? `\nserver stderr:\n${output.join('')}` : ''}`)
  process.exitCode = 1
}
finally {
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
