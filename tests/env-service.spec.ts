/**
 * The env row's service for the loop board (src/env/env-service.ts, M4
 * design §6.1.2, review F17) and the board's seam over it
 * (src/loops/index.ts `checksSeam`): checkCommandOf reads one check line of
 * an approved tool node from the real graph engine's files, returns
 * undefined for every case the design lists, follows a command the human
 * changed, and the seam is absent without the env row (the board then
 * refuses a check entry as check-missing).
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply as envApply } from '../src/env/index.ts'
import { createEnvService, ENV_SERVICE, envService, fillCheckArgv, type CheckCommand, type CheckFormat, type EnvService } from '../src/env/env-service.ts'
import { openEngine } from '../src/graph/engine.ts'
import { GRAPH_SERVICE } from '../src/graph/service.ts'
import { checksSeam } from '../src/loops/index.ts'
import type { ServiceLookup } from '../src/shared/dsh-min.ts'
import { fakeRuntime } from './fake-rc3.ts'
import { captureWarnings } from './graph-helpers.ts'

interface Fixture {
  readonly workspace: string
  readonly graph: string
  readonly ctx: ServiceLookup
  readonly service: EnvService
}

/** Propose a node and, as the human, approve it when it lands as a proposal; `approve` false leaves an LLM's proposal waiting. Returns its id. */
async function seed(graph: string, node: Record<string, unknown>, approve = true): Promise<string> {
  const engine = openEngine(graph)
  const proposed = await engine.apply(approve ? 'human' : 'llm', { op: 'propose', reason: '建图', node })
  assert.ok(proposed.ok, JSON.stringify(proposed))
  assert.ok(approve || proposed.node?.status === 'proposed', 'an LLM\'s tool node waits for the human')
  if (approve && proposed.node?.status === 'proposed') {
    const approved = await engine.apply('human', { op: 'status', id: proposed.id, rev: proposed.rev, to: 'approved', reason: '批准' })
    assert.ok(approved.ok, JSON.stringify(approved))
  }
  return proposed.id
}

async function withGraph(body: (fixture: Fixture) => Promise<void>): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), 'env-service-'))
  try {
    const graph = join(workspace, 'docs', 'graph')
    await mkdir(graph, { recursive: true })
    await seed(graph, { type: 'goal', title: '目标' })
    await seed(graph, { id: 'env', type: 'feature', title: '环境', parent: 'goal-1' })
    await seed(graph, { id: 'tool-1', type: 'tool', title: 'Lint', parent: 'env', acceptance: ['`check lint lines $ node lint.mjs {files}`'] })
    await seed(graph, {
      id: 'tool-2',
      type: 'tool',
      title: 'ESLint',
      parent: 'env',
      acceptance: [
        '`check eslint eslint-json 3s $ node node_modules/eslint/bin/eslint.js --format json {files}` when *.ts',
        '`check full lines $ node full.mjs`',
        '`check bad lines 4 s $ node bad.mjs`',
      ],
    })
    await seed(graph, { id: 'tool-3', type: 'tool', title: '等批准', parent: 'env', acceptance: ['`check wait lines $ node wait.mjs`'] }, false)
    const services = new Map<string, unknown>([[GRAPH_SERVICE, { dirFor: () => graph, isGraphTool: () => false }]])
    const ctx: ServiceLookup = { get: name => services.get(name) }
    await body({ workspace, graph, ctx, service: createEnvService(ctx) })
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

test('checkCommandOf reads the one line of a node, and the named line of a node with several', async () => {
  await withGraph(async ({ workspace, service }) => {
    const only: CheckCommand | undefined = await service.checkCommandOf(workspace, 'tool-1')
    assert.deepEqual(only, { tool: 'tool-1', check: 'lint', title: 'Lint：lint', argv: ['node', 'lint.mjs', '{files}'], format: 'lines', own: false })
    assert.deepEqual(await service.checkCommandOf(workspace, 'tool-1', 'lint'), only)
    const eslint = await service.checkCommandOf(workspace, 'tool-2', 'eslint')
    assert.equal(eslint?.own, true, 'a line with when is run by M4 too')
    assert.equal(eslint?.estimateSeconds, 3)
    const format: CheckFormat | undefined = eslint?.format
    assert.equal(format, 'eslint-json')
    assert.equal((await service.checkCommandOf(workspace, 'tool-2', 'full'))?.own, false)
  })
})

test('checkCommandOf is undefined: several lines unnamed, unreadable line, unknown name, node not approved, node missing, no graph', async () => {
  await withGraph(async ({ workspace, service }) => {
    assert.equal(await service.checkCommandOf(workspace, 'tool-2'), undefined)
    assert.equal(await service.checkCommandOf(workspace, 'tool-2', 'bad'), undefined)
    assert.equal(await service.checkCommandOf(workspace, 'tool-2', 'nope'), undefined)
    assert.equal(await service.checkCommandOf(workspace, 'tool-3'), undefined)
    assert.equal(await service.checkCommandOf(workspace, 'tool-9'), undefined)
    assert.equal(await createEnvService({ get: () => undefined }).checkCommandOf(workspace, 'tool-1'), undefined)
    const broken = createEnvService({ get: () => ({ dirFor: () => { throw new Error('boom') }, isGraphTool: () => false }) })
    assert.equal(await broken.checkCommandOf(workspace, 'tool-1'), undefined, 'never throws')
  })
})

test('a command the human changes in the engine reads back changed', async () => {
  await withGraph(async ({ workspace, graph, service }) => {
    const engine = openEngine(graph)
    const node = await engine.load()
    const rev = node.revisions.get('tool-1')
    assert.ok(rev !== undefined)
    const edited = await engine.apply('human', { op: 'edit', id: 'tool-1', rev, reason: '换命令', set: { acceptance: ['`check lint lines $ node lint2.mjs {files}`'] } })
    assert.ok(edited.ok, JSON.stringify(edited))
    assert.deepEqual((await service.checkCommandOf(workspace, 'tool-1'))?.argv, ['node', 'lint2.mjs', '{files}'])
  })
})

test('envService: absent, a wrong shape (told once), the real one', async () => {
  assert.equal(envService({ get: () => undefined }), undefined)
  const told: string[] = []
  assert.equal(envService({ get: () => ({ checkCommandOf: 'no' }) }, message => { told.push(message) }), undefined)
  assert.equal(told.length, 1)
  assert.match(told[0] ?? '', /check-missing/)
  await withGraph(async ({ workspace, ctx }) => {
    const real = createEnvService(ctx)
    const read = envService({ get: name => name === ENV_SERVICE ? real : undefined })
    assert.equal(read, real)
    assert.equal((await read?.checkCommandOf(workspace, 'tool-1'))?.check, 'lint')
  })
})

test('the board\'s seam: absent without the env row, the node\'s command with it', async () => {
  assert.equal(checksSeam({ get: () => undefined }), undefined, 'the board refuses a check entry as check-missing')
  await withGraph(async ({ workspace, ctx }) => {
    const real = createEnvService(ctx)
    const seam = checksSeam({ get: name => name === ENV_SERVICE ? real : undefined })
    assert.ok(seam !== undefined)
    const command = await seam.commandOf(workspace, 'tool-1')
    assert.deepEqual(command?.argv, ['node', 'lint.mjs', '{files}'])
    assert.equal(command?.own, false)
    assert.deepEqual(seam.fill(command?.argv ?? [], ['-a.txt']), fillCheckArgv(command?.argv ?? [], ['-a.txt']))
    assert.deepEqual(seam.fill(command?.argv ?? [], ['-a.txt']).argv, ['node', 'lint.mjs', './-a.txt'])
    assert.deepEqual(seam.present(command?.format, { stdout: 'a.txt:1:1: todo found', stderr: '', exitCode: 1 }), { findings: 1, lines: ['a.txt:1:1 todo found'] })
    assert.equal(seam.present('xml', { stdout: 'a.txt:1:1: todo found', stderr: '', exitCode: 1 }), undefined, 'a format the row does not know reads as unreadable')
    const throwing = checksSeam({ get: name => name === ENV_SERVICE ? { checkCommandOf: () => Promise.reject(new Error('boom')) } : undefined })
    assert.equal(await throwing?.commandOf(workspace, 'tool-1'), undefined, 'never throws')
  })
})

test('the env row provides the service and withdraws it on unload; a host without provide is told', async () => {
  const runtime = fakeRuntime({ natives: [] })
  const dispose = envApply(runtime.ctx)
  assert.equal(typeof (runtime.services.get(ENV_SERVICE) as EnvService | undefined)?.checkCommandOf, 'function')
  dispose()
  assert.equal(runtime.services.get(ENV_SERVICE), undefined)
  const { warnings } = await captureWarnings(() => {
    envApply({ get: () => undefined, on: () => () => {} })()
  })
  assert.ok(warnings.some(line => line.includes('check-missing')), warnings.join('\n'))
})
