/**
 * What the env row hands the loop board (src/env/loop-entry.ts, M4 design
 * §6.8): the board-side validation takes the event `env.files-edited` whole,
 * the row hands it over when an agent arrives (no inject on the fake host)
 * and through inject when the host has it, and a refused hand-over is warned
 * once and kept on the row health. The shared hand-over
 * (src/loops/service.ts installContribution) keeps the graph row's words.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { apply as envApply } from '../src/env/index.ts'
import { envContribution, ENV_ROW_SOURCE, FILES_EDITED_EVENT } from '../src/env/loop-entry.ts'
import { validateContribution } from '../src/loops/registry.ts'
import { installContribution, LOOPS_DECLARATION, LOOPS_SERVICE, type ContributeResult, type ContributionSource, type LoopsService } from '../src/loops/service.ts'
import type { ServiceLookup } from '../src/shared/dsh-min.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { fakeRuntime } from './fake-rc3.ts'
import { captureWarnings } from './graph-helpers.ts'

interface Handed {
  readonly sources: ContributionSource[]
  readonly contributions: unknown[]
}

function fakeBoard(refused?: string): { readonly service: LoopsService, readonly handed: Handed } {
  const handed: Handed = { sources: [], contributions: [] }
  const service: LoopsService = {
    declaration: LOOPS_DECLARATION,
    contribute: (source, contribution) => {
      handed.sources.push(source)
      handed.contributions.push(contribution)
      const result: ContributeResult = refused === undefined ? { ok: true, dispose: () => {}, accepted: [], dropped: [] } : { ok: false, reason: refused }
      return result
    },
    emit: () => Promise.resolve({ ok: true as const, id: 'ev-x', duplicate: false }),
    listens: () => false,
    recordRun: () => {},
  }
  return { service, handed }
}

test('the board-side validation takes the env row\'s hand-over whole (the contract test of design §6.8)', () => {
  const check = validateContribution(ENV_ROW_SOURCE, envContribution(), { table: new Map(), owners: new Map(), now: new Date() })
  assert.ok(check.ok, JSON.stringify(check))
  assert.ok(check.ok && check.dropped.length === 0, JSON.stringify(check))
  assert.ok(check.ok && check.namespace === 'env')
  assert.deepEqual(ENV_ROW_SOURCE, { plugin: 'dsh-hourness', row: 'glm-hourness/env' })
  assert.equal(FILES_EDITED_EVENT.id, 'env.files-edited')
  assert.equal(FILES_EDITED_EVENT.personSelectable, true)
  assert.equal(FILES_EDITED_EVENT.listedOnly, undefined)
  assert.deepEqual(FILES_EDITED_EVENT.fields.map(field => [field.name, field.type, field.filter ?? null]), [['files', 'strings', 'paths'], ['root', 'string', null], ['truncated', 'boolean', 'is']])
})

test('the env row hands the event over when an agent arrives', async () => {
  const board = fakeBoard()
  const runtime = fakeRuntime({ natives: [] })
  runtime.ctx.provide(LOOPS_SERVICE, board.service)
  const { warnings } = await captureWarnings(async () => {
    const dispose = envApply(runtime.ctx)
    await runtime.create()
    dispose()
  })
  assert.deepEqual(board.handed.sources, [ENV_ROW_SOURCE])
  assert.deepEqual((board.handed.contributions[0] as { events: readonly { id: string }[] }).events.map(event => event.id), ['env.files-edited'])
  assert.deepEqual(warnings, [])
})

test('a refused hand-over is warned once and kept on the row health', async () => {
  const board = fakeBoard('这个来源交过了')
  const runtime = fakeRuntime({ natives: [] })
  runtime.ctx.provide(LOOPS_SERVICE, board.service)
  const { warnings } = await captureWarnings(async () => {
    envApply(runtime.ctx)
    await runtime.create()
    await runtime.create({ ...runtime.agent, id: 'agent-2' })
  })
  assert.equal(board.handed.sources.length, 2, 'every agent arrival hands it over again')
  assert.equal(warnings.filter(line => line.includes('env.files-edited 没被收下')).length, 1, warnings.join('\n'))
  const view = runtime.services.get(healthServiceName('env')) as RowHealthView
  assert.equal(view.activation().state, 'degraded')
  assert.match(view.activation().reason, /交给循环板的 env\.files-edited 没被收下：这个来源交过了/)
})

test('installContribution goes through inject when the host has it, and names a dropped piece', () => {
  const board: LoopsService = {
    ...fakeBoard().service,
    contribute: () => ({ ok: true, dispose: () => {}, accepted: [], dropped: [{ id: 'env.x', reason: '不认识' }] }),
  }
  const injects: string[][] = []
  const told: string[] = []
  const ctx = {
    get: () => undefined,
    inject: (names: readonly string[], callback: (sub: ServiceLookup) => (() => void) | void) => {
      injects.push([...names])
      callback({ get: name => name === LOOPS_SERVICE ? board : undefined })
      return undefined
    },
    on: () => () => {},
  }
  installContribution(ctx, ENV_ROW_SOURCE, envContribution, FILES_EDITED_EVENT.id, message => { told.push(message) })
  assert.deepEqual(injects, [[LOOPS_SERVICE]])
  assert.deepEqual(told, ['交给循环板的 env.x 没被收下：不认识'])
})
