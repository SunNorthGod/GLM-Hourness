/**
 * The operate row’s L2 (M7 design 0.6 §3.10, §3.11.1, P3): the
 * `hourness_report` tool — its kind schema, the main-agent-only caller
 * check, the report text built from the status hub’s agent entries through
 * the collector (the same-source rule, status hub design 0.3 §12 M7 row) and
 * the project’s own records, the `operate.report` metric of each call — and
 * the two time entries handed to the loop board, valid against the board’s
 * entry check, with the row health saying when the board is absent or
 * refused the hand-over.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { apply as operateApply, hournessReportTool } from '../src/operate/index.ts'
import { OPERATE_ENTRIES } from '../src/operate/entries.ts'
import { LOOPS_SERVICE } from '../src/loops/service.ts'
import { validateEntry } from '../src/loops/model.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'
import { usagePanel, usageStatusItems } from '../src/report/panel.ts'
import type { StatusItem } from '../src/shared/status.ts'
import type { LoopsService } from '../src/loops/service.ts'
import type { ServiceLookup, ToolExecutionContext } from '../src/shared/dsh-min.ts'
import { creditPricing } from '../src/glm-llm/credits.ts'
import { provideRowStatus, statusServiceName } from '../src/shared/status-host.ts'


const NOW = Date.parse('2026-11-14T08:30:00+08:00')
const SOURCE = 'C:/u/glm-hourness/audit/usage.jsonl'

const journal = [
  { at: '2026-11-14T07:00:00+08:00', provider: 'glm-zcode', model: 'glm-5.3', usage: { inputTokens: 500, cacheReadTokens: 1500, outputTokens: 250, totalTokens: 2250 } },
].map(record => JSON.stringify(record)).join('\n')

/** A status entry the tests hand a row’s view. */
function entry(id: string, text: string, owner?: string): StatusItem {
  return { id, owner: owner ?? id.slice(0, id.indexOf('/')), audience: 'agent', asOf: new Date(NOW).toISOString(), source: 'test/fixture', text }
}

/** A lookup whose hourness row serves the real usage entry, plus a metrics service that records. */
function hostWith(items: readonly StatusItem[]): { readonly lookup: ServiceLookup, readonly emitted: { event: unknown, where: unknown }[] } {
  const emitted: { event: unknown, where: unknown }[] = []
  const store = new Map<string, unknown>()
  store.set(statusServiceName('hourness'), { row: 'hourness', items: () => items })
  store.set('glmHournessMetrics', { emit: (event: unknown, where: unknown) => { emitted.push({ event, where }) } })
  const lookup: ServiceLookup = { get: name => store.get(name) }
  return { lookup, emitted }
}

/** The tool over a host, with no graph service and no project records (the unreadable-graph path). */
function tool(lookup: ServiceLookup, isMain: (agent: { readonly id: string }) => boolean = () => true): { readonly tool: ReturnType<typeof hournessReportTool>, readonly exec: ToolExecutionContext } {
  return {
    tool: hournessReportTool({ lookup, isMain, graphDirOf: () => undefined, now: () => NOW }),
    exec: { agent: { id: 'main-1', session: { id: 's1', header: { cwd: 'C:/work/app' } } } } as unknown as ToolExecutionContext,
  }
}

test('hourness_report: the kind schema has morning and weekly, and the patrol kind is not there yet (m7-7 seam)', () => {
  const { tool: report } = tool(hostWith([]).lookup)
  assert.equal(report.name, 'hourness_report')
  const parameters = report.parameters as { properties: { kind: { enum: readonly string[] } }, required: readonly string[] }
  assert.deepEqual(parameters.properties.kind.enum, ['morning', 'weekly'])
  assert.deepEqual(parameters.required, ['kind'])
})

test('the caller must be the main agent, and the kind is required', async () => {
  const host = hostWith([])
  const notMain = tool(host.lookup, () => false)
  await assert.rejects(() => Promise.resolve(notMain.tool.execute({ kind: 'morning' }, notMain.exec)), /forbidden/)
  const { tool: report, exec } = tool(host.lookup)
  await assert.rejects(() => Promise.resolve(report.execute({}, exec)), /kind/)
  await assert.rejects(() => Promise.resolve(report.execute({ kind: 'patrol' }, exec)), /kind/)
})

test('the morning report carries the hub entries word for word — the usage list read through the collector, not recomputed', async () => {
  const [usage] = usageStatusItems(usagePanel(journal, creditPricing), SOURCE, NOW)
  const host = hostWith([usage, entry('rules/peak', '- 高峰：不是高峰'), entry('glm/quota', '额度：还有六成')])
  const { tool: report, exec } = tool(host.lookup)
  const result = await report.execute({ kind: 'morning' }, exec) as { text: string }
  assert.ok(result.text.includes('# 晨报 2026-11-14'))
  assert.ok(result.text.includes('## 现在\n- 高峰：不是高峰\n额度：还有六成'))
  assert.ok(result.text.includes(usage.text ?? ''))
  assert.ok(result.text.includes('## 一、目标\n- 项目图读不到：'))
})

test('the weekly report relays metrics/load verbatim and ends on the metrics-board line', async () => {
  const load = entry('metrics/load', '最近 7 天：每周被问几次 3；每次要读多少字 220；回话等多久 40 分')
  const host = hostWith([load])
  const { tool: report, exec } = tool(host.lookup)
  const result = await report.execute({ kind: 'weekly' }, exec) as { text: string }
  assert.ok(result.text.includes('# 周报 2026-11-14'))
  assert.ok(result.text.includes('最近 7 天：每周被问几次 3；每次要读多少字 220；回话等多久 40 分'))
  assert.ok(result.text.endsWith('其余的数字在面板的指标板上：比率与对照只给人看，不进对话。'))
})

test('every call emits operate.report for the project of the session', async () => {
  const host = hostWith([])
  const { tool: report, exec } = tool(host.lookup)
  await report.execute({ kind: 'morning' }, exec)
  const first = host.emitted[0]?.event as { k: string, by: string, body: { kind: string, lines: number, units: number } }
  assert.equal(first.k, 'operate.report')
  assert.equal(first.by, 'operate')
  assert.equal(first.body.kind, 'morning')
  assert.ok(first.body.lines > 0 && first.body.units > 0)
  await report.execute({ kind: 'weekly' }, exec)
  const second = host.emitted[1]?.event as { body: { kind: string } }
  assert.equal(second.body.kind, 'weekly')
})

test('the two time entries pass the board’s entry check and the plain-words rule, and their tells name the tool', () => {
  for (const entryDefinition of OPERATE_ENTRIES) {
    assert.deepEqual(validateEntry(entryDefinition, 'plugin', { table: new Map(), now: new Date(NOW) }), [])
    assert.deepEqual(plainWordsIn(`${entryDefinition.title} ${entryDefinition.why ?? ''}`), [])
  }
  const morning = OPERATE_ENTRIES[0]
  const weekly = OPERATE_ENTRIES[1]
  assert.equal(morning.when.kind, 'daily')
  assert.deepEqual(weekly.when.kind === 'weekly' ? weekly.when.weekdays : [], [1])
  assert.ok(morning.action.kind === 'tell-main' && morning.action.text.includes('hourness_report with kind "morning"'))
  assert.ok(morning.action.kind === 'tell-main' && morning.action.wake)
  assert.ok(weekly.action.kind === 'tell-main' && weekly.action.text.includes('hourness_report with kind "weekly"'))
})

/** A fake loops service: records the hand-over, accepts or refuses as the test says. */
function fakeBoard(accept = true): { readonly service: LoopsService, readonly handed: { source: unknown, entries: readonly unknown[] }[] } {
  const handed: { source: unknown, entries: readonly unknown[] }[] = []
  const service = {
    contribute: (source: unknown, contribution: { entries: readonly unknown[] }) => {
      handed.push({ source, entries: contribution.entries })
      return accept
        ? { ok: true as const, accepted: contribution.entries.map(entry => (entry as { id: string }).id), dropped: [] as const, dispose: () => {} }
        : { ok: false as const, reason: '名字空间不对' }
    },
    emit: () => ({ ok: true as const }),
    listens: () => [],
    recordRun: () => {},
  }
  return { service: service as unknown as LoopsService, handed }
}

/** A minimal host: services on a store, an inject that runs when everything is already there, the tools service capturing registrations. */
function hostCtx(board: LoopsService | undefined): { readonly ctx: Parameters<typeof operateApply>[0], readonly registered: unknown[], readonly store: Map<string, unknown> } {
  const store = new Map<string, unknown>()
  const registered: unknown[] = []
  store.set('tools', { register: (definition: unknown) => { registered.push(definition); return () => {} } })
  if (board !== undefined) store.set(LOOPS_SERVICE, board)
  const ctx = {
    get: (name: string) => store.get(name),
    provide: (name: string, value: unknown) => { store.set(name, value); return () => { store.delete(name) } },
    inject: (names: readonly string[], callback: (sub: unknown) => (() => void) | void) => {
      if (names.every(name => store.get(name) !== undefined)) {
        const sub: Record<string, unknown> = { get: (name: string) => store.get(name) }
        for (const name of names) sub[name] = store.get(name)
        callback(sub)
      }
      return undefined
    },
  }
  return { ctx: ctx as unknown as Parameters<typeof operateApply>[0], registered, store }
}

test('apply hands the two entries to the loop board and registers the tool', () => {
  const board = fakeBoard()
  const { ctx, registered, store } = hostCtx(board.service)
  const dispose = operateApply(ctx)
  assert.deepEqual(registered.map(definition => (definition as { name: string }).name), ['hourness_report'])
  assert.equal(board.handed.length, 1)
  assert.deepEqual(board.handed[0]?.entries.map(entry => (entry as { id: string }).id), ['operate.morning', 'operate.weekly'])
  const health = store.get('glmHournessHealth/operate') as { activation(): { state: string } }
  assert.equal(health.activation().state, 'active')
  dispose()
})

test('a board that refuses the hand-over, or is absent, degrades the row health with the reason', () => {
  const refused = fakeBoard(false)
  const { ctx, store } = hostCtx(refused.service)
  operateApply(ctx)
  const health = store.get('glmHournessHealth/operate') as { activation(): { state: string, reason: string } }
  assert.ok(health.activation().reason.includes('循环板没收下报告行的时间条目'), health.activation().reason)
  const bare = hostCtx(undefined)
  operateApply(bare.ctx)
  const bareHealth = bare.store.get('glmHournessHealth/operate') as { activation(): { state: string, reason: string } }
  assert.ok(bareHealth.activation().reason.includes('循环板不在'), bareHealth.activation().reason)
})

test('provideRowStatus keeps the row off the hub: the operate row submits no status entries of its own', () => {
  // The reports are readers of the hub, not writers; the collector’s STATUS_ROWS already lists the row (health.ts).
  const store = new Map<string, unknown>()
  provideRowStatus({ provide: (name, value) => { store.set(name, value); return () => { store.delete(name) } } }, 'operate', () => [])
  assert.ok(store.has(statusServiceName('operate')))
})
