/**
 * What the env row hands the loop board (src/env/loop-entry.ts, M4 design
 * §6.8, review F11, N21): the board-side validation takes the event
 * `env.files-edited` and the entry `env.checks-after-edit` whole, the entry's
 * five own rules are the sentences built from the constants,
 * the row hands it over when an agent arrives (no inject on the fake host)
 * and through inject when the host has it, and a refused hand-over is warned
 * once and kept on the row health. The shared hand-over
 * (src/loops/service.ts installContribution) keeps the graph row's words.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { apply as envApply } from '../src/env/index.ts'
import { checksOwnRules, CHECKS_ENTRY_ID, envContribution, ENV_ROW_SOURCE, FILES_EDITED_EVENT } from '../src/env/loop-entry.ts'
import { CHECK_FAILURE_LIMIT, CHECK_SLOTS, MISSING_CHECK_NOTICES } from '../src/env/runner.ts'
import { CHECK_QUEUE_WAIT_MS, CHECK_STEP_DEADLINE_MS, CHECK_TIMEOUT_CAP_MS, CHECK_TIMEOUT_FACTOR, CHECK_TIMEOUT_FLOOR_MS } from '../src/env/timeout.ts'
import { codePointCount } from '../src/graph/proposal.ts'
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
  assert.ok(check.ok && check.dropped.length === 0 && check.entries.some(entry => entry.definition.id === CHECKS_ENTRY_ID && entry.waitingOn.length === 0 && entry.plainWords.length === 0), JSON.stringify(check))
})

test('the checker\'s entry: its words, and five own rules built from the constants, each within the board\'s line limit (N21)', () => {
  const [entry] = envContribution().entries
  assert.deepEqual([entry?.id, entry?.title, entry?.why, entry?.when, entry?.action], [
    'env.checks-after-edit', '改完文件就跑检查', '改完文件马上知道有没有新问题', { kind: 'event', events: ['env.files-edited'] },
    { kind: 'self', does: '跑这个项目里批过的检查，结果在那个 agent 的下一步交给它', by: 'glm-hourness/env' },
  ])
  const s = (ms: number): number => ms / 1000
  assert.deepEqual(entry?.ownRules, [
    `一步最多等这一步所有检查超时里最长的那个，不超过 ${s(CHECK_STEP_DEADLINE_MS)} 秒，跑得慢的在之后的步里送到`,
    `每项检查的超时由系统按最近几次的实际耗时定：最慢一次的 ${CHECK_TIMEOUT_FACTOR} 倍，不低于 ${s(CHECK_TIMEOUT_FLOOR_MS)} 秒、不超过 ${s(CHECK_TIMEOUT_CAP_MS)} 秒；超时算没跑完，下一次改动照常再跑`,
    `跑不起来或输出读不懂连续 ${CHECK_FAILURE_LIMIT} 次后，这个会话不再跑那一项`,
    `改了没有检查覆盖的语言的文件时，每个会话每种语言提醒 ${MISSING_CHECK_NOTICES} 次`,
    `同时最多跑 ${CHECK_SLOTS} 项检查；排队超过 ${s(CHECK_QUEUE_WAIT_MS)} 秒的这一次不跑，下一次改动再查`,
  ])
  assert.equal(checksOwnRules()[4], '同时最多跑 2 项检查；排队超过 60 秒的这一次不跑，下一次改动再查')
  assert.equal(codePointCount(checksOwnRules()[4] ?? ''), 35)
  assert.ok(checksOwnRules().every(line => codePointCount(line) <= 80))
  const contribution = envContribution(project => [`lines of ${project}`])
  assert.deepEqual(contribution.details?.('env.checks-after-edit', 'C:/p'), ['lines of C:/p'])
  assert.deepEqual(contribution.details?.('env.other', 'C:/p'), [])
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
  assert.equal(warnings.filter(line => line.includes('env.checks-after-edit 没被收下')).length, 1, warnings.join('\n'))
  const view = runtime.services.get(healthServiceName('env')) as RowHealthView
  assert.equal(view.activation().state, 'degraded')
  assert.match(view.activation().reason, /交给循环板的 env\.checks-after-edit 没被收下：这个来源交过了/)
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
