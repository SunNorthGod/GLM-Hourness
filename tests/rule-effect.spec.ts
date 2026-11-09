/**
 * The expected effect of a rule proposal (src/memory/effect.ts, M5 design
 * §3.6.1, docs/ORCHESTRATION.md §8.5; node m5-rule-expected-effect): the
 * `rule` argument of propose_to_human is checked field by field, kept as the
 * opening lines of the question's body and shown to the human after the
 * question; a lift names its cover or carries an ablation result the human
 * must see before agreeing; a rule proposal is revised with its effect; a
 * `学自：` comment on a question lands only when the question carries one.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadGraph } from '../src/graph/store.ts'
import { renderAsk } from '../src/graph/proposal.ts'
import { effectBlock, effectOf, effectShown, ruleEffectOf, type RuleEffect } from '../src/memory/effect.ts'
import { noteLandings } from '../src/memory/learning.ts'
import { PROPOSE_TO_HUMAN, RECORD_HUMAN_ANSWER } from '../src/shared/tool-names.ts'
import { mainAgentWithGoal } from './design-tools-helpers.ts'
import type { DesignHost, FakeAgent } from './design-host.ts'
import { exampleArgs } from './proposal-examples.ts'

/** The refusal of a call that must fail: its code, field, message and hint. */
function errorOf(outcome: Awaited<ReturnType<DesignHost['callTool']>>): { code: string, field?: string, message: string, hint: string } {
  if (outcome.kind !== 'error') assert.fail(`expected a refusal: ${JSON.stringify(outcome)}`)
  return outcome.error
}

/** The result of a call that must succeed. */
function valueOf(outcome: Awaited<ReturnType<DesignHost['callTool']>>): Record<string, unknown> {
  if (outcome.kind !== 'ok') assert.fail(`expected a result: ${JSON.stringify(outcome)}`)
  return outcome.value
}

/** The human answers in between, so the next question is the first of a new reply. */
const nextReply = async (host: DesignHost, agent: FakeAgent): Promise<void> => {
  host.reply(agent, '下一件')
  await host.say(agent, '嗯')
}

const ADD = { change: 'add', effect: '人改任务怎样算做完的次数变少', metric: 'corrections:edit:task.acceptance', direction: 'down', days: 14 } as const
const LIFT_COVER = { change: 'lift', effect: '工作区圈禁拦下的次数不变多', metric: 'denials:guard:workspace-containment', direction: 'down', days: 21, lift: 'guard:file-tools-only', cover: 'guard:workspace-containment' } as const
const ABLATION = '单层消融：关掉 guard:file-tools-only 跑了 12 个练习题，11 个照常做完，1 个在 shell 里写了文件。'
const LIFT_ABLATION = { change: 'lift', effect: 'shell 里写文件的次数不变多', metric: 'denials:guard:file-tools-only', direction: 'down', days: 28, lift: 'guard:file-tools-only', ablation: ABLATION } as const

// ---------------------------------------------------------------- the argument, pure

test('a rule proposal without its expected effect, or with a field wrong, is refused with the field and how to fix it', () => {
  const refused = (raw: unknown, field: string, hint?: RegExp): void => {
    const result = ruleEffectOf(raw)
    assert.ok('hint' in result, JSON.stringify(raw))
    if (!('hint' in result)) return
    assert.equal(result.field, field, JSON.stringify(raw))
    assert.ok(result.hint.length > 0)
    if (hint !== undefined) assert.match(result.hint, hint)
  }
  refused('add', 'rule')
  refused({ ...ADD, extra: 1 }, 'rule.extra')
  const { change: _c, ...noChange } = ADD
  refused(noChange, 'rule.change', /change add or lift/)
  const { effect: _e, ...noEffect } = ADD
  refused(noEffect, 'rule.effect', /which count moves which way/)
  refused({ ...ADD, effect: '一行\n两行' }, 'rule.effect')
  refused({ ...ADD, effect: '字'.repeat(61) }, 'rule.effect')
  refused({ ...ADD, effect: '合入前的门禁拦下的次数变少' }, 'rule.effect', /say 合入前的检查 instead of 门禁/)
  refused({ ...ADD, effect: '拦下变少 · 改动变少' }, 'rule.effect')
  const { metric: _m, ...noMetric } = ADD
  refused(noMetric, 'rule.metric')
  for (const metric of ['corrections:depth:down', 'corrections:nonsense', 'denials:guard:no-such-rule', 'tokens:all']) refused({ ...ADD, metric }, 'rule.metric', /corrections:<group key>/)
  const { direction: _d, ...noDirection } = ADD
  refused(noDirection, 'rule.direction')
  const { days: _n, ...noDays } = ADD
  refused(noDays, 'rule.days', /days 7 to 56/)
  for (const days of [6, 57, 7.5, '14']) refused({ ...ADD, days }, 'rule.days')
  refused({ ...ADD, lift: 'guard:file-tools-only' }, 'rule.lift')
  refused({ ...ADD, cover: 'guard:file-tools-only' }, 'rule.cover')
  refused({ ...ADD, ablation: ABLATION }, 'rule.ablation')
  assert.deepEqual(ruleEffectOf(ADD), ADD)
  assert.deepEqual(ruleEffectOf({ ...ADD, effect: `  ${ADD.effect} ` }), ADD, 'the effect is kept trimmed')
})

test('taking a rule off names the rule that covers the same calls, or carries an ablation result when none does', () => {
  const refused = (raw: Record<string, unknown>, field: string): string => {
    const result = ruleEffectOf(raw)
    assert.ok('hint' in result, JSON.stringify(raw))
    assert.equal('hint' in result ? result.field : '', field, JSON.stringify(raw))
    return 'hint' in result ? result.hint : ''
  }
  const { cover: _c, ...bare } = LIFT_COVER
  assert.match(refused(bare, 'rule.cover'), /name in cover the rule that covers the same kind of calls; when no rule does, switch off only this rule.*put the result in ablation/)
  refused({ ...LIFT_COVER, lift: undefined }, 'rule.lift')
  refused({ ...LIFT_COVER, lift: 'guard:no-such-rule' }, 'rule.lift')
  refused({ ...LIFT_COVER, cover: 'guard:no-such-rule' }, 'rule.cover')
  refused({ ...LIFT_COVER, cover: LIFT_COVER.lift }, 'rule.cover')
  refused({ ...LIFT_COVER, ablation: ABLATION }, 'rule.ablation')
  refused({ ...LIFT_ABLATION, ablation: '' }, 'rule.ablation')
  refused({ ...LIFT_ABLATION, ablation: '字'.repeat(6001) }, 'rule.ablation')
  assert.deepEqual(ruleEffectOf(LIFT_COVER), LIFT_COVER)
  assert.deepEqual(ruleEffectOf(LIFT_ABLATION), LIFT_ABLATION)
})

test('the body keeps the effect in fixed lines and reads it back; other bodies read as none', () => {
  assert.equal(effectBlock(ADD), ['规则提议：新增', `预期效果：${ADD.effect}`, '核对：corrections:edit:task.acceptance 变少，同意后 14 天'].join('\n'))
  assert.equal(effectBlock(LIFT_COVER).split('\n').at(-1), '替补：guard:workspace-containment')
  assert.deepEqual(effectBlock(LIFT_ABLATION).split('\n').slice(3), ['替补：没有，附了单层消融的结果', ABLATION])
  for (const effect of [ADD, LIFT_COVER, LIFT_ABLATION] as readonly RuleEffect[]) {
    assert.deepEqual(effectOf(effectBlock(effect)), effect)
    assert.deepEqual(effectOf(`${effectBlock(effect)}\n\n脚本原文\n\n提议：p-3f9a1c07`), effect.ablation === undefined ? effect : { ...effect, ablation: `${ABLATION}\n\n脚本原文\n\n提议：p-3f9a1c07` }, 'a board\'s text after it')
  }
  for (const body of [undefined, '', '需求：记一下每天花了多少钱', '规则提议：新增\n预期效果：少一点', '规则提议：新增\n预期效果：少\n核对：tokens:all 变少，同意后 14 天']) assert.equal(effectOf(body), undefined, String(body))
  assert.equal(effectShown(ADD), `预期效果：${ADD.effect}；同意后 14 天核对，没做到会写进晨报。`)
  assert.equal(effectShown(LIFT_COVER).split('\n')[1], '撤下 guard:file-tools-only，替补是 guard:workspace-containment，它也管同一类调用。')
  assert.equal(effectShown(LIFT_ABLATION).split('\n')[1], '撤下 guard:file-tools-only，没有替补，单层消融的结果在下面。')
})

// ---------------------------------------------------------------- propose_to_human

test('a rule proposal is put with its effect: the body opens with it and the human reads it after the question', async () => {
  const { host, agent, node } = await mainAgentWithGoal()
  const args = exampleArgs('recommend')
  const value = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...args, rule: ADD }))
  assert.equal(value.text, renderAsk(String(args.text), 1, undefined, effectShown(ADD)))
  assert.doesNotMatch(String(value.message), /keep it verbatim/, 'a new rule carries no original text')
  assert.deepEqual(effectOf((await node('question-1')).body), ADD)
  await nextReply(host, agent)
  const covered = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...args, rule: LIFT_COVER }))
  assert.equal(covered.text, renderAsk(String(args.text), 1, undefined, effectShown(LIFT_COVER)))
  await nextReply(host, agent)
  const ablated = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...args, rule: LIFT_ABLATION }))
  assert.equal(ablated.text, renderAsk(String(args.text), 1, undefined, `${effectShown(LIFT_ABLATION)}\n\n${ABLATION}`))
  assert.match(String(ablated.message), /keep it verbatim/, 'the ablation result is text the human must see')
  assert.equal((await node('question-3')).body, effectBlock(LIFT_ABLATION))
})

test('the call refuses a rule that is wrong, on another form, on a showing once more or beside attach with an ablation; nothing is written', async () => {
  const { host, agent, engine } = await mainAgentWithGoal()
  const before = (await engine.load()).revision
  const refused = async (args: Record<string, unknown>, field: string): Promise<void> => {
    const error = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, args))
    assert.deepEqual([error.code, error.field], ['invalid', field], JSON.stringify(args))
    assert.ok(error.hint.length > 0)
  }
  const { cover: _c, ...noCover } = LIFT_COVER
  await refused({ ...exampleArgs('recommend'), rule: {} }, 'rule.change')
  await refused({ ...exampleArgs('recommend'), rule: noCover }, 'rule.cover')
  await refused({ ...exampleArgs('want'), rule: ADD }, 'rule')
  await refused({ kind: 'question', question: 'question-1', text: '再问一次可以吗？', rule: ADD }, 'rule')
  await refused({ ...exampleArgs('recommend'), attach: 'rules:p-3f9a1c07', rule: LIFT_ABLATION }, 'rule.ablation')
  await refused({ kind: 'confirm', goal: 'goal-1', text: '需求就按上面这样定，可以吗？', rule: ADD }, 'rule')
  assert.equal((await engine.load()).revision, before)
})

test('a rule proposal is revised only with its effect again; the new effect replaces the old', async () => {
  const { host, agent, node } = await mainAgentWithGoal()
  valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('recommend'), rule: ADD }))
  await nextReply(host, agent)
  const { cost: _c, ...base } = exampleArgs('recommend')
  const text = '我建议借书先不收押金，因为押金要退还，管理员得多做一份对账，可以吗？'
  const missing = errorOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...base, question: 'question-1', text }))
  assert.deepEqual([missing.code, missing.field], ['invalid', 'rule'])
  assert.match(missing.hint, /pass rule again with the revision/)
  valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...base, question: 'question-1', text, rule: { ...ADD, days: 28 } }))
  assert.equal(effectOf((await node('question-1')).body)?.days, 28)
  await nextReply(host, agent)
  // Shown once more with text alone, the effect on the graph is shown with it.
  const again = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'question', question: 'question-1', text }))
  assert.equal(again.text, renderAsk(text, 1, undefined, effectShown({ ...ADD, days: 28 })))
})

// ---------------------------------------------------------------- record_human_answer

test('taking off a rule with no cover is agreed to only after the whole ablation result was in the reply', async () => {
  const { host, agent, node } = await mainAgentWithGoal()
  const put = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('recommend'), rule: LIFT_ABLATION }))
  host.reply(agent, String(put.text).replace(ABLATION, '结果略'))
  await host.say(agent, '可以')
  const args = { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以'], recordedAs: '撤下 shell 里写文件的规则' }
  const refused = errorOf(await host.callTool(agent, RECORD_HUMAN_ANSWER, args))
  assert.equal(refused.code, 'not_shown')
  assert.match(refused.message, /ablation result/)
  assert.equal((await node('question-1')).status, 'approved', 'nothing was written')
  const again = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'question', question: 'question-1', text: exampleArgs('recommend').text }))
  assert.ok(String(again.text).endsWith(ABLATION), 'shown once more, the ablation result comes from the body')
  host.reply(agent, String(again.text))
  await host.say(agent, '可以')
  assert.equal(valueOf(await host.callTool(agent, RECORD_HUMAN_ANSWER, args)).outcome, 'decided')
  assert.equal((await node('question-1')).status, 'done')
})

test('taking off a rule with a cover, and a new rule, are agreed to as any recommend', async () => {
  for (const rule of [ADD, LIFT_COVER]) {
    const { host, agent } = await mainAgentWithGoal()
    const put = valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('recommend'), rule }))
    host.reply(agent, String(put.text))
    await host.say(agent, '可以')
    assert.equal(valueOf(await host.callTool(agent, RECORD_HUMAN_ANSWER, { kind: 'question', question: 'question-1', answer: 'agree', words: ['可以'], recordedAs: '照这条规则' })).outcome, 'decided', rule.change)
  }
})

// ---------------------------------------------------------------- the learning digest

test('a 学自 comment on a question lands only when the question carries an expected effect; on other nodes as before', async () => {
  const { host, agent, engine, dir } = await mainAgentWithGoal()
  valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, { ...exampleArgs('recommend'), rule: ADD }))
  await nextReply(host, agent)
  valueOf(await host.callTool(agent, PROPOSE_TO_HUMAN, exampleArgs('recommend')))
  for (const [id, key] of [['question-1', 'edit:task.acceptance'], ['question-2', 'reject:feature'], ['goal-1', 'chat:add']] as const) {
    assert.ok((await engine.apply('llm', { op: 'comment', id, text: `规则提议交给人了。学自：${key}` })).ok)
  }
  const landings = noteLandings((await loadGraph(dir)).nodes.values())
  assert.deepEqual(landings.map(landing => landing.key).sort(), ['chat:add', 'edit:task.acceptance'])
})
