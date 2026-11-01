/**
 * The simulated human's choice of what to say (scripts/calibrate/
 * simulated-human.mjs; docs/ORCHESTRATION.md §3.5): a pure function of the turn.
 * The row is a stand-in for the person in the L3 probe and the calibration
 * runs, not part of the bundle.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error The script is plain JavaScript without a declaration file.
import { readConfig, simulatedReply } from '../scripts/calibrate/simulated-human.mjs'

interface Reply {
  readonly kind: 'reply' | 'silent'
  readonly rule: number
  readonly text?: string
  readonly shown: ReadonlyArray<{ readonly kind: string, readonly number: number, readonly form?: string }>
  readonly used: Record<string, number>
}

const reply = (context: Record<string, unknown>): Reply => simulatedReply(context) as Reply

test('the config is read with defaults; what is wrong is reported and left out; without replies or answers the row never speaks', () => {
  const warnings: string[] = []
  const config = readConfig({ replies: { question: ['可以，就按推荐的来'], bogus: ['x'], release: [] }, answers: { need: '记账' }, maxReplies: -1, extra: 1 }, (text: string) => warnings.push(text))
  assert.deepEqual(config.replies, { question: ['可以，就按推荐的来'] })
  assert.deepEqual(config.answers, { need: '记账' })
  assert.equal(config.maxReplies, 24)
  assert.equal(config.enabled, true)
  assert.equal(warnings.length, 4, warnings.join(' | '))
  assert.equal(readConfig({ wish: true }).enabled, false)
  assert.equal(readConfig(undefined).enabled, false)
})

test('rule 1: after maxReplies replies the person says nothing', () => {
  const config = readConfig({ replies: {}, maxReplies: 2 })
  const result = reply({ config, replied: 2, shown: [{ kind: 'question', number: 1 }] })
  assert.deepEqual([result.kind, result.rule, result.text], ['silent', 1, undefined])
})

test('rule 2: when the main agent said it would record the answer, the person confirms the restatement', () => {
  const config = readConfig({ replies: {}, restateReply: '对，就这么记' })
  const result = reply({ config, replied: 0, lastAssistant: '那我记成：借书先不收押金。', shown: [{ kind: 'question', number: 1 }] })
  assert.deepEqual([result.kind, result.rule, result.text], ['reply', 2, '对，就这么记'])
})

test('rule 3: each matter put this turn gets the next sentence for its kind, said once; the last one again when they run out; the kind of a module release is module', () => {
  const config = readConfig({ replies: { question: ['可以，就按推荐的来', '第二条'], release: ['可以，放行'] } })
  const shown = [{ kind: 'question', number: 1, form: 'recommend' }, { kind: 'question', number: 2, form: 'choose' }, { kind: 'question', number: 3, form: 'want' }]
  const first = reply({ config, replied: 0, shown })
  assert.deepEqual([first.kind, first.rule, first.text], ['reply', 3, '可以，就按推荐的来\n第二条\n第二条'])
  assert.deepEqual(first.shown, shown, 'what was shown is logged with its way of asking')
  assert.deepEqual(first.used, { question: 3 })
  const next = reply({ config, replied: 1, shown: [{ kind: 'question', number: 1 }, { kind: 'release', number: 2 }, { kind: 'release', number: 3, module: 'module-a' }], used: first.used })
  assert.equal(next.text, '第二条\n可以，放行\n可以，放行这个模块', 'the defaults fill the kinds with no sentence')
  assert.equal(reply({ config: readConfig({ replies: {} }), replied: 0, shown: [{ kind: 'confirm', number: 1 }] }).text, '对，就这样')
})

test('rules 4 to 6: a missing requirement item is answered, an unfinished goal gets the fallback, and otherwise the person is silent', () => {
  const config = readConfig({ answers: { need: '记账' }, fallback: '你按经验定吧' })
  assert.deepEqual([reply({ config, replied: 0, missing: 'need' }).rule, reply({ config, replied: 0, missing: 'need' }).text], [4, '记账'])
  assert.equal(reply({ config, replied: 0, missing: 'risks' }).text, '你按经验定吧')
  assert.deepEqual([reply({ config, replied: 0, unreleased: true }).rule, reply({ config, replied: 0, unreleased: true }).text], [5, '你按经验定吧'])
  assert.deepEqual([reply({ config, replied: 0 }).kind, reply({ config, replied: 0 }).rule], ['silent', 6])
})
