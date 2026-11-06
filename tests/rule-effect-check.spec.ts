/**
 * The check of a rule proposal when its days are up (src/memory/effect.ts
 * effectChecks and effectCheckLines, M5 design §3.6.1, docs/ORCHESTRATION.md
 * §12; node m5-rule-expected-effect): a proposal the person agreed to is
 * counted in the window before the agreement and the window up to the day it
 * fell due, on a graph the real engine wrote; met is not listed in the
 * morning report, missed and unchecked are, with the counts or the reason;
 * an older rule whose count went back is named; a check not yet due, or due
 * more than seven days ago, is not listed.
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine } from '../src/graph/engine.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import { loadGraph } from '../src/graph/store.ts'
import { effectBlock, effectCheckLines, effectChecks, type JournalEvent, type JournalRead, type RuleEffect } from '../src/memory/effect.ts'
import { morningReport, reportFromFiles } from '../src/workflow/morning-report.ts'
import { exampleRecord } from './proposal-examples.ts'

const DAY = 86_400_000
const BASE = Date.UTC(2026, 9, 1)
const iso = (ms: number): string => new Date(ms).toISOString()

/** A graph written by the real engine, each write at the moment it is given. */
async function world() {
  const dir = await mkdtemp(join(tmpdir(), 'rule-effect-check-'))
  let clock = BASE
  const engine = openEngine(dir, { now: () => new Date(clock) })
  const run = async (at: number, actor: 'human' | 'llm', mutation: Record<string, unknown>): Promise<string> => {
    clock = at
    const rev = typeof mutation.id === 'string' ? (await loadGraph(dir)).revisions.get(mutation.id) : undefined
    const result = await engine.apply(actor, rev === undefined ? mutation : { ...mutation, rev })
    assert.ok(result.ok, JSON.stringify(result))
    return result.id
  }
  await run(BASE, 'human', { op: 'propose', reason: '立项', node: { type: 'goal', title: '记账小工具', stage: 'design', acceptance: ['能记账'] } })
  await run(BASE, 'human', { op: 'propose', reason: '拆分', node: { type: 'feature', title: '记一笔', parent: 'goal-1' } })
  return {
    dir,
    /** The person changes the acceptance of a task the agent wrote: one edit:task.acceptance. */
    async acceptanceEdit(at: number): Promise<void> {
      const id = await run(at - 60_000, 'llm', { op: 'propose', reason: 'plan', node: { type: 'task', title: '一项任务', parent: 'feature-1', acceptance: ['初稿'] } })
      await run(at, 'human', { op: 'edit', id, reason: '改', set: { acceptance: ['人的版本'] } })
    },
    /** The person rejects a feature the agent proposed: one reject:feature. */
    async featureReject(at: number): Promise<void> {
      const id = await run(at - 60_000, 'llm', { op: 'propose', reason: 'plan', node: { type: 'feature', title: '又一块', parent: 'goal-1' } })
      await run(at, 'human', { op: 'reject', id, reason: '不要' })
    },
    /** A rule proposal the agent put and the person agreed to at `at`. */
    async agreed(at: number, title: string, effect: RuleEffect): Promise<string> {
      const id = await run(at - 60_000, 'llm', { op: 'propose', reason: '交给人', node: { type: 'question', parent: 'goal-1', ...exampleRecord('recommend'), title, body: effectBlock(effect) } })
      await run(at, 'human', { op: 'decide', id, conclusion: '照这条规则', reason: '同意' })
      return id
    },
    graph: (): Promise<LoadedGraph> => loadGraph(dir),
    close: () => rm(dir, { recursive: true, force: true }),
  }
}

const ACCEPTANCE: RuleEffect = { change: 'add', effect: '人改任务怎样算做完的次数变少', metric: 'corrections:edit:task.acceptance', direction: 'down', days: 14 }
const AGREED = BASE + 20 * DAY
const DUE = AGREED + 14 * DAY
const NO_JOURNAL: JournalRead = { unreadable: '这次调用没有给出项目' }
/** A graph with nothing waiting and nothing decided, and a period with no records: only the checks section can appear. */
const NOTHING_ASKED = { decided: { agent: 0, inChat: 0, person: 0 }, agentOwn: 0, waiting: { count: 0 } }
const quiet = { usage: [], violations: [], decisions: [], asks: NOTHING_ASKED, period: 'p' }

test('a check that met its expected effect is not listed; one that missed is, with the counts of both windows and the words that nothing changes by itself', async () => {
  const w = await world()
  try {
    for (const day of [8, 10, 12]) await w.acceptanceEdit(BASE + day * DAY)
    await w.acceptanceEdit(AGREED + 3 * DAY)
    await w.agreed(AGREED, '任务的怎样算做完先问人', ACCEPTANCE)
    const met = effectChecks((await w.graph()).nodes.values(), NO_JOURNAL, DUE + DAY)
    assert.deepEqual(met.map(check => [check.outcome, check.before, check.after]), [['met', 3, 1]])
    assert.deepEqual(effectCheckLines(met, 480), [])
    assert.ok(!morningReport({ ...quiet, effects: met }).includes('## 规则提议的核对'))
    for (const day of [5, 9]) await w.acceptanceEdit(AGREED + day * DAY)
    const missed = effectChecks((await w.graph()).nodes.values(), NO_JOURNAL, DUE + DAY)
    assert.deepEqual(missed.map(check => [check.outcome, check.before, check.after]), [['missed', 3, 3]], 'an equal count is a miss')
    const report = morningReport({ ...quiet, effects: missed, offsetMinutes: 480 })
    const section = report.slice(report.indexOf('## 规则提议的核对')).split('\n\n')[0].split('\n')
    assert.deepEqual(section, [
      '## 规则提议的核对',
      '- 任务的怎样算做完先问人（question-1，2026-10-21 同意，2026-11-04 到期）：没做到。预期 corrections:edit:task.acceptance 变少，同意前 14 天 3 次，同意后 3 次',
      '- 这里只列出来，规则不会自己变；要撤或要改，跟主 Agent 说',
    ])
    assert.ok(report.indexOf('## 规则提议的核对') < report.indexOf('## 等你定的事'), 'it comes with the exceptions, before what waits for the person')
  }
  finally {
    await w.close()
  }
})

test('a check is listed only in the seven days after it fell due; a proposal not agreed to is not checked', async () => {
  const w = await world()
  try {
    await w.agreed(AGREED, '任务的怎样算做完先问人', ACCEPTANCE)
    const nodes = (await w.graph()).nodes
    const at = (now: number): string[] => effectChecks(nodes.values(), NO_JOURNAL, now).map(check => check.outcome)
    assert.deepEqual(at(DUE - 1), [], 'not due yet')
    assert.deepEqual(at(DUE), ['missed'], 'due today: none before, none after is a miss')
    assert.deepEqual(at(DUE + 7 * DAY - 1), ['missed'])
    assert.deepEqual(at(DUE + 7 * DAY), [], 'more than seven days ago')
    // A rule proposal still waiting for the person is not checked.
    const open = await mkdtemp(join(tmpdir(), 'rule-effect-open-'))
    try {
      const engine = openEngine(open, { now: () => new Date(AGREED) })
      assert.ok((await engine.apply('human', { op: 'propose', reason: '立项', node: { type: 'goal', title: '记账', stage: 'design', acceptance: ['能记账'] } })).ok)
      assert.ok((await engine.apply('llm', { op: 'propose', reason: '交给人', node: { type: 'question', parent: 'goal-1', ...exampleRecord('recommend'), body: effectBlock(ACCEPTANCE) } })).ok)
      assert.deepEqual(effectChecks((await loadGraph(open)).nodes.values(), NO_JOURNAL, DUE + DAY), [])
    }
    finally {
      await rm(open, { recursive: true, force: true })
    }
  }
  finally {
    await w.close()
  }
})

test('denials are counted from the metrics journal, by the rule with or without its row; a journal that cannot reach the window before is unchecked, with the reason', async () => {
  const w = await world()
  try {
    const effect: RuleEffect = { change: 'lift', effect: 'shell 里写文件的次数不变多', metric: 'denials:guard:file-tools-only', direction: 'down', days: 14, lift: 'guard:file-tools-only', cover: 'guard:workspace-containment' }
    await w.agreed(AGREED, '撤下 shell 写文件的规则', effect)
    const nodes = (await w.graph()).nodes
    const event = (at: number, k: string, body: Record<string, unknown>): JournalEvent => ({ k, at: iso(at), body })
    const journal: JournalRead = {
      events: [
        event(BASE, 'host.started', {}),
        event(AGREED - 5 * DAY, 'rule', { rule: 'file-tools-only', effect: 'deny' }),
        event(AGREED - 4 * DAY, 'rule', { rule: 'file-tools-only', effect: 'late' }),
        event(AGREED - 3 * DAY, 'rules.judged', { rule: 'guard:file-tools-only', how: 'block' }),
        event(AGREED - 2 * DAY, 'rules.judged', { rule: 'guard:file-tools-only', how: 'deferral' }),
        event(AGREED - 1 * DAY, 'rule', { rule: 'workspace-containment', effect: 'deny' }),
        event(AGREED + 2 * DAY, 'rule', { rule: 'file-tools-only', effect: 'deny' }),
        event(DUE + DAY, 'rule', { rule: 'file-tools-only', effect: 'deny' }),
      ],
    }
    assert.deepEqual(effectChecks(nodes.values(), journal, DUE + DAY).map(check => [check.outcome, check.before, check.after]), [['met', 3, 1]])
    const late = effectChecks(nodes.values(), { events: journal.events.slice(5) }, DUE + DAY)
    assert.deepEqual(late.map(check => [check.outcome, check.reason]), [['unchecked', '指标流水从 2026-10-20 才有，够不着同意之前的那段']])
    assert.equal(effectChecks(nodes.values(), { events: [] }, DUE + DAY)[0]?.reason, '指标流水还没有记录')
    const lines = effectCheckLines(effectChecks(nodes.values(), NO_JOURNAL, DUE + DAY), 480)
    assert.equal(lines[2], '- 撤下 shell 写文件的规则（question-1，2026-10-21 同意，2026-11-04 到期）：核对不了，指标流水读不到：这次调用没有给出项目')
  }
  finally {
    await w.close()
  }
})

test('an older rule whose count went back in the windows of a newer one is named under it, even when the newer one met its own effect', async () => {
  const w = await world()
  try {
    // The older rule: agreed long before, its own check fell due long ago.
    await w.agreed(BASE + DAY, '任务的怎样算做完先问人', { ...ACCEPTANCE, days: 7 })
    for (const day of [10, 12]) await w.featureReject(BASE + day * DAY)
    for (const day of [2, 4]) await w.acceptanceEdit(AGREED + day * DAY)
    const newer: RuleEffect = { change: 'add', effect: '人否掉新功能块的次数变少', metric: 'corrections:reject:feature', direction: 'down', days: 14 }
    await w.agreed(AGREED, '新功能块先问人', newer)
    const checks = effectChecks((await w.graph()).nodes.values(), NO_JOURNAL, DUE + DAY)
    assert.deepEqual(checks.map(check => [check.question, check.outcome, check.before, check.after]), [['question-2', 'met', 2, 0]])
    assert.deepEqual(checks[0]?.backslides, [{ question: 'question-1', title: '任务的怎样算做完先问人', metric: 'corrections:edit:task.acceptance', before: 0, after: 2 }])
    assert.deepEqual(effectCheckLines(checks, 480).slice(1), [
      '## 规则提议的核对',
      '- 新功能块先问人（question-2，2026-10-21 同意，2026-11-04 到期）：做到了。corrections:reject:feature 同意前 2 次，同意后 0 次',
      '  - 旧规则 任务的怎样算做完先问人（question-1）往回走了：corrections:edit:task.acceptance 这两段里 0 次 → 2 次',
      '- 这里只列出来，规则不会自己变；要撤或要改，跟主 Agent 说',
    ])
  }
  finally {
    await w.close()
  }
})

test('the report entry reads the checks from the session\'s graph, and a graph that cannot be read gives none', async () => {
  const w = await world()
  try {
    await w.agreed(AGREED, '任务的怎样算做完先问人', ACCEPTANCE)
    const fs = { readFile: () => Promise.reject(new Error('no file')) }
    const options = { now: DUE + DAY, offsetMinutes: 480, metrics: { reason: '没有项目' } }
    const report = await reportFromFiles(fs, {}, 'p', w.graph, undefined, options)
    assert.ok(report.includes('## 规则提议的核对\n- 任务的怎样算做完先问人（question-1，2026-10-21 同意，2026-11-04 到期）：没做到。'), report)
    const none = await reportFromFiles(fs, {}, 'p', () => Promise.reject(new Error('读不到')), undefined, options)
    assert.ok(!none.includes('## 规则提议的核对'))
  }
  finally {
    await w.close()
  }
})
