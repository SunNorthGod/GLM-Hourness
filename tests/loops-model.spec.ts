/**
 * An entry of the loop board (docs/ORCHESTRATION.md §18.3; loop board design 0.6
 * §2.1, §2.3, §12): validateEntry for both sources, a person's and a plugin's.
 * The checks that depend on the event table take it from the context, so the
 * table here is written in the test. Pure functions; no host, no file system.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import test from 'node:test'
import { validateEntry, type EntryContext } from '../src/loops/model.ts'
import type { LoopEventDeclaration, TriggerIssue } from '../src/loops/trigger.ts'

const NOW = new Date('2026-11-02T01:00:00Z')
const SHA = 'a'.repeat(64)

const CHANGED: LoopEventDeclaration = {
  id: 'x.changed',
  title: '文件改了',
  fields: [
    { name: 'files', type: 'strings', title: '文件', filter: 'paths' },
    { name: 'kind', type: 'string', title: '种类', filter: 'in' },
    { name: 'count', type: 'number', title: '个数', filter: 'atLeast' },
    { name: 'ok', type: 'boolean', title: '成功', filter: 'is' },
    { name: 'note', type: 'string', title: '备注' },
  ],
  personSelectable: true,
}
const OTHER: LoopEventDeclaration = { id: 'x.other', title: '另一件事', fields: [{ name: 'kind', type: 'string', title: '种类', filter: 'in' }], personSelectable: true }
const INTERNAL: LoopEventDeclaration = { id: 'x.internal', title: '内部的事', fields: [], personSelectable: false }
const LISTED: LoopEventDeclaration = { id: 'x.listed', title: '只列出的事', fields: [], personSelectable: true, listedOnly: true }
const TABLE = new Map([CHANGED, OTHER, INTERNAL, LISTED].map(event => [event.id, event]))

const context = (extra: Partial<EntryContext> = {}): EntryContext => ({ table: TABLE, now: NOW, ...extra })

const PLUGIN = {
  id: 'x.one',
  title: '改完之后',
  why: '有改动就叫主 Agent 看一眼',
  when: { kind: 'event', events: ['x.changed'] },
  action: { kind: 'tell-main', text: 'Something changed: {kind}', wake: true },
}
const PERSON_ID = 'u-0123abcd'
const PERSON = {
  id: PERSON_ID,
  title: '我加的提醒',
  when: { kind: 'event', events: ['x.changed'] },
  action: { kind: 'tell-main', text: 'Look at it', wake: false },
}
const SCRIPT = {
  kind: 'script',
  script: { file: `docs/loops/scripts/${PERSON_ID}.ps1`, sha256: SHA, lang: 'pwsh' },
  report: 'on-failure',
}
const CHECK = { kind: 'check', tool: 'tool-typescript', argv: ['npx', 'tsc', '--noEmit'], report: 'on-failure' }

const paths = (issues: readonly TriggerIssue[]): readonly string[] => issues.map(issue => issue.path)
const plugin = (patch: Record<string, unknown> = {}, extra: Partial<EntryContext> = {}): readonly TriggerIssue[] => validateEntry({ ...PLUGIN, ...patch }, 'plugin', context(extra))
const person = (patch: Record<string, unknown> = {}, extra: Partial<EntryContext> = {}): readonly TriggerIssue[] => validateEntry({ ...PERSON, ...patch }, 'person', context(extra))

test('the module imports no Node built-in, so a client can import it', () => {
  const text = readFileSync(new URL('../src/loops/model.ts', import.meta.url), 'utf8')
  const specifiers = [...text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+['"]([^'"]+)['"]/g)].map(match => match[1] ?? '')
  const builtins = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)])
  assert.deepEqual(specifiers.filter(specifier => specifier.startsWith('node:') || builtins.has(specifier)), [])
})

test('a sound entry of either source has no issue', () => {
  assert.deepEqual(plugin(), [])
  assert.deepEqual(person(), [])
  // The fields beyond the minimum, each at its edge.
  assert.deepEqual(plugin({
    limits: { debounceSeconds: 3600, maxPerHour: 60 },
    quiet: { from: '22:00', to: '08:00' },
    scope: 'project',
    basis: '依据 GLM 通道的高峰时刻与规则板的高峰模式',
    ownRules: ['一步至多等 20 秒', '每个检查 60 秒超时'],
  }), [])
})

test('ids: a person\'s is u- and eight lowercase hex digits; a plugin\'s is a namespace and a name, or a channel and a name', () => {
  assert.deepEqual(paths(person({ id: 'u-0123ABCD' })), ['id'])
  assert.deepEqual(paths(person({ id: 'u-0123abc' })), ['id'])
  assert.deepEqual(paths(person({ id: 'x.one' })), ['id'])
  assert.deepEqual(paths(person({ id: undefined })), ['id'])
  for (const id of ['execute.release', 'loops.deps-after-merge', 'glm:quota-low', 'a.b']) assert.deepEqual(plugin({ id }), [], id)
  for (const id of ['Execute.release', 'execute', 'execute.', '.release', 'u-0123abcd', 'a.b.c', 'averyveryverylongnamespace.x', 42]) assert.deepEqual(paths(plugin({ id })), ['id'], String(id))
})

test('title: 1 to 60 code points after trimming, one line', () => {
  assert.deepEqual(paths(plugin({ title: '' })), ['title'])
  assert.deepEqual(paths(plugin({ title: '   ' })), ['title'])
  assert.deepEqual(paths(plugin({ title: 'a'.repeat(61) })), ['title'])
  assert.deepEqual(paths(plugin({ title: 'one\ntwo' })), ['title'])
  assert.deepEqual(paths(plugin({ title: 7 })), ['title'])
  assert.deepEqual(plugin({ title: 'a'.repeat(60) }), [])
  assert.deepEqual(plugin({ title: '😀'.repeat(60) }), [], 'code points, not UTF-16 units')
  assert.deepEqual(plugin({ title: '  padded  ' }), [])
  assert.deepEqual(paths(plugin({ title: '😀'.repeat(61) })), ['title'])
})

test('why: a plugin\'s is required, a person\'s may be missing; 1 to 150 code points, one line', () => {
  assert.deepEqual(paths(plugin({ why: undefined })), ['why'])
  assert.deepEqual(paths(plugin({ why: '' })), ['why'])
  assert.deepEqual(paths(plugin({ why: 'a'.repeat(151) })), ['why'])
  assert.deepEqual(paths(plugin({ why: 'a\nb' })), ['why'])
  assert.deepEqual(plugin({ why: 'a'.repeat(150) }), [])
  assert.deepEqual(person({ why: undefined }), [])
  assert.deepEqual(person({ why: '为了这件事' }), [])
  assert.deepEqual(paths(person({ why: 'a'.repeat(151) })), ['why'])
  assert.deepEqual(paths(person({ why: 'a\r\nb' })), ['why'])
})

test('basis and ownRules: at most 80 code points a line, at most 6 lines', () => {
  assert.deepEqual(plugin({ basis: 'a'.repeat(80) }), [])
  assert.deepEqual(paths(plugin({ basis: 'a'.repeat(81) })), ['basis'])
  assert.deepEqual(paths(plugin({ basis: 'a\nb' })), ['basis'])
  assert.deepEqual(plugin({ ownRules: Array.from({ length: 6 }, () => 'a'.repeat(80)) }), [])
  assert.deepEqual(paths(plugin({ ownRules: Array.from({ length: 7 }, () => 'a') })), ['ownRules'])
  assert.deepEqual(paths(plugin({ ownRules: ['a'.repeat(81)] })), ['ownRules[0]'])
  assert.deepEqual(paths(plugin({ ownRules: ['ok', 'a\nb'] })), ['ownRules[1]'])
  assert.deepEqual(paths(plugin({ ownRules: 'one line' })), ['ownRules'])
})

test('fields the board writes are not the writer\'s: source, rev, status and anything unknown are refused by name', () => {
  assert.deepEqual(paths(plugin({ source: { kind: 'plugin' } })), ['source'])
  assert.deepEqual(paths(plugin({ rev: 'abc' })), ['rev'])
  assert.deepEqual(paths(person({ status: 'active' })), ['status'])
  assert.deepEqual(paths(person({ colour: 'red' })), ['colour'])
})

test('limits: whole numbers, debounce 0 to 3600, at most 1 to 60 an hour, nothing else', () => {
  assert.deepEqual(plugin({ limits: { debounceSeconds: 0 } }), [])
  assert.deepEqual(paths(plugin({ limits: { debounceSeconds: 3601 } })), ['limits.debounceSeconds'])
  assert.deepEqual(paths(plugin({ limits: { debounceSeconds: -1 } })), ['limits.debounceSeconds'])
  assert.deepEqual(paths(plugin({ limits: { debounceSeconds: 1.5 } })), ['limits.debounceSeconds'])
  assert.deepEqual(paths(plugin({ limits: { maxPerHour: 0 } })), ['limits.maxPerHour'])
  assert.deepEqual(paths(plugin({ limits: { maxPerHour: 61 } })), ['limits.maxPerHour'])
  assert.deepEqual(paths(plugin({ limits: { perDay: 3 } })), ['limits.perDay'])
  assert.deepEqual(paths(plugin({ limits: 'often' })), ['limits'])
})

test('quiet: two different HH:MM times, and only on an event entry that tells the main agent', () => {
  assert.deepEqual(plugin({ quiet: { from: '00:00', to: '23:59' } }), [])
  assert.deepEqual(paths(plugin({ quiet: { from: '22:00', to: '22:00' } })), ['quiet.to'])
  assert.deepEqual(paths(plugin({ quiet: { from: '24:00', to: '08:00' } })), ['quiet.from'])
  assert.deepEqual(paths(plugin({ quiet: { from: '22:00', to: '8:00' } })), ['quiet.to'])
  assert.deepEqual(paths(plugin({ quiet: { from: '22:00', to: '08:00', tz: 'UTC' } })), ['quiet.tz'])
  assert.deepEqual(paths(plugin({ quiet: { from: '22:00', to: '08:00' }, when: { kind: 'daily', time: '08:30' }, action: { kind: 'tell-main', text: 'Daily.', wake: true } })), ['quiet'])
  assert.deepEqual(paths(plugin({ quiet: { from: '22:00', to: '08:00' }, action: { kind: 'self', does: 'the host does it', by: 'x' } })), ['quiet'])
})

test('scope: project, or machine for a plugin only', () => {
  assert.deepEqual(plugin({ scope: 'machine' }), [])
  assert.deepEqual(paths(person({ scope: 'machine' })), ['scope'])
  assert.deepEqual(paths(plugin({ scope: 'global' })), ['scope'])
})

test('which actions a source may have: a plugin never runs a script or a check, a person only tells the main agent, or runs a script or a check', () => {
  assert.deepEqual(paths(plugin({ action: { ...SCRIPT, script: { file: 'docs/loops/scripts/x.one.ps1', sha256: SHA, lang: 'pwsh' } } })), ['action.kind'])
  assert.deepEqual(paths(plugin({ action: CHECK })), ['action.kind'])
  assert.deepEqual(paths(person({ action: { kind: 'self', does: 'it', by: 'x' } })), ['action.kind'])
  assert.deepEqual(paths(person({ action: { kind: 'harness', action: 'x.run' } }, { actions: new Set(['x.run']) })), ['action.kind'])
  assert.deepEqual(paths(plugin({ action: { kind: 'dance' } })), ['action.kind'])
  assert.deepEqual(paths(plugin({ action: 'tell-main' })), ['action'])
  assert.deepEqual(paths(plugin({ action: undefined })), ['action'])
  assert.deepEqual(person({ action: SCRIPT }), [])
  assert.deepEqual(person({ action: CHECK }), [])
})

test('tell-main: the text is 1 to 2000 code points and wake says whether it wakes the agent', () => {
  assert.deepEqual(paths(plugin({ action: { kind: 'tell-main', text: '', wake: true } })), ['action.text'])
  assert.deepEqual(paths(plugin({ action: { kind: 'tell-main', text: 'a'.repeat(2001), wake: true } })), ['action.text'])
  assert.deepEqual(plugin({ action: { kind: 'tell-main', text: 'a'.repeat(2000), wake: false } }), [])
  assert.deepEqual(paths(plugin({ action: { kind: 'tell-main', text: 'hi' } })), ['action.wake'])
  assert.deepEqual(paths(plugin({ action: { kind: 'tell-main', text: 'hi', wake: 'yes' } })), ['action.wake'])
  assert.deepEqual(paths(plugin({ action: { kind: 'tell-main', text: 'hi', wake: true, extra: 1 } })), ['action.extra'])
})

test('placeholders: a {name} must be a field every listed event declares; a time entry has none; braces that are not a name stay text', () => {
  const text = (value: string, patch: Record<string, unknown> = {}): readonly TriggerIssue[] => plugin({ action: { kind: 'tell-main', text: value, wake: true }, ...patch })
  assert.deepEqual(text('{kind} and {count} and {files}'), [])
  assert.deepEqual(paths(text('{nope}')), ['action.text'])
  assert.deepEqual(paths(text('{at}')), ['action.text'], 'the envelope\'s own fields are not payload fields')
  assert.deepEqual(text('json {"a": 1} and { spaced } and {} and {1x}'), [])
  // Two events: only the field both declare.
  const both = { when: { kind: 'event', events: ['x.changed', 'x.other'] } }
  assert.deepEqual(text('{kind}', both), [])
  assert.deepEqual(paths(text('{count}', both)), ['action.text'])
  // A time entry has no payload.
  assert.deepEqual(paths(text('{kind}', { when: { kind: 'daily', time: '08:30' } })), ['action.text'])
  assert.deepEqual(text('plain text', { when: { kind: 'daily', time: '08:30' } }), [])
})

test('harness: the action is one the contribution lists, and the optional tell is a text with wake', () => {
  const harness = (action: Record<string, unknown>, actions: readonly string[] = ['x.run']): readonly TriggerIssue[] => plugin({ action: { kind: 'harness', ...action } }, { actions: new Set(actions) })
  assert.deepEqual(harness({ action: 'x.run' }), [])
  assert.deepEqual(harness({ action: 'x.run', tell: { text: 'Done: {kind}', wake: true } }), [])
  assert.deepEqual(paths(harness({ action: 'x.walk' })), ['action.action'])
  assert.deepEqual(paths(harness({ action: 'x.run' }, [])), ['action.action'])
  assert.deepEqual(paths(plugin({ action: { kind: 'harness', action: 'x.run' } })), ['action.action'], 'no list of actions: none is listed')
  assert.deepEqual(paths(harness({ action: 'x.run', tell: { text: '', wake: true } })), ['action.tell.text'])
  assert.deepEqual(paths(harness({ action: 'x.run', tell: { text: '{nope}', wake: true } })), ['action.tell.text'])
  assert.deepEqual(paths(harness({ action: 'x.run', tell: { text: 'hi' } })), ['action.tell.wake'])
  assert.deepEqual(paths(harness({ action: 'x.run', tell: 'hi' })), ['action.tell'])
  assert.deepEqual(paths(harness({ action: 'x.run', colour: 1 })), ['action.colour'])
})

test('self: who does it and what, in a plain line', () => {
  const self = (action: Record<string, unknown>): readonly TriggerIssue[] => plugin({ action: { kind: 'self', ...action } })
  assert.deepEqual(self({ does: 'The host reads the quota', by: 'dsh-glm-zcode' }), [])
  assert.deepEqual(paths(self({ does: '', by: 'x' })), ['action.does'])
  assert.deepEqual(paths(self({ does: 'a'.repeat(501), by: 'x' })), ['action.does'])
  assert.deepEqual(paths(self({ does: 'two\nlines', by: 'x' })), ['action.does'])
  assert.deepEqual(paths(self({ does: 'ok', by: '' })), ['action.by'])
  assert.deepEqual(paths(self({ does: 'ok', by: 'a'.repeat(65) })), ['action.by'])
  assert.deepEqual(self({ does: 'ok', by: 'a'.repeat(64) }), [])
})

test('script: the reference names the file after the entry, the hash is 64 lowercase hex digits, the language agrees with the suffix', () => {
  const script = (action: Record<string, unknown>): readonly TriggerIssue[] => person({ action: { ...SCRIPT, ...action } })
  assert.deepEqual(script({}), [])
  for (const [lang, suffix] of [['pwsh', 'ps1'], ['node', 'mjs'], ['python', 'py'], ['bash', 'sh']] as const) {
    assert.deepEqual(script({ script: { file: `docs/loops/scripts/${PERSON_ID}.${suffix}`, sha256: SHA, lang } }), [], lang)
  }
  assert.deepEqual(paths(script({ script: { file: `docs/loops/scripts/${PERSON_ID}.sh`, sha256: SHA, lang: 'pwsh' } })), ['action.script.file'])
  assert.deepEqual(paths(script({ script: { file: 'docs/loops/scripts/u-ffffffff.ps1', sha256: SHA, lang: 'pwsh' } })), ['action.script.file'], 'another entry\'s script')
  assert.deepEqual(paths(script({ script: { file: `scripts/${PERSON_ID}.ps1`, sha256: SHA, lang: 'pwsh' } })), ['action.script.file'])
  assert.deepEqual(paths(script({ script: { file: `docs/loops/scripts/../${PERSON_ID}.ps1`, sha256: SHA, lang: 'pwsh' } })), ['action.script.file'])
  assert.deepEqual(paths(script({ script: { file: `docs\\loops\\scripts\\${PERSON_ID}.ps1`, sha256: SHA, lang: 'pwsh' } })), ['action.script.file'])
  assert.deepEqual(paths(script({ script: { file: `docs/loops/scripts/${PERSON_ID}.ps1`, sha256: SHA.toUpperCase(), lang: 'pwsh' } })), ['action.script.sha256'])
  assert.deepEqual(paths(script({ script: { file: `docs/loops/scripts/${PERSON_ID}.ps1`, sha256: 'abc', lang: 'pwsh' } })), ['action.script.sha256'])
  assert.deepEqual(paths(script({ script: { file: `docs/loops/scripts/${PERSON_ID}.ps1`, sha256: SHA, lang: 'ruby' } })), ['action.script.lang'])
  assert.deepEqual(paths(script({ script: { file: `docs/loops/scripts/${PERSON_ID}.ps1`, sha256: SHA, lang: 'pwsh', approvedAt: 'now' } })), ['action.script.approvedAt'])
  assert.deepEqual(paths(script({ script: 'run.ps1' })), ['action.script'])
})

test('script: timeout 5 to 1800 whole seconds, a report policy, a destination, a note, a spend; no onError', () => {
  const script = (action: Record<string, unknown>): readonly TriggerIssue[] => person({ action: { ...SCRIPT, ...action } })
  assert.deepEqual(script({ timeoutSeconds: 5 }), [])
  assert.deepEqual(script({ timeoutSeconds: 1800 }), [])
  for (const seconds of [4, 1801, 1.5, '60']) assert.deepEqual(paths(script({ timeoutSeconds: seconds })), ['action.timeoutSeconds'], String(seconds))
  assert.deepEqual(paths(script({ report: undefined })), ['action.report'])
  assert.deepEqual(paths(script({ report: 'never' })), ['action.report'])
  for (const report of ['always', 'on-failure', 'on-change']) assert.deepEqual(script({ report }), [], report)
  assert.deepEqual(script({ note: 'a'.repeat(500) }), [])
  assert.deepEqual(paths(script({ note: 'a'.repeat(501) })), ['action.note'])
  assert.deepEqual(script({ glmSpend: 'optional' }), [])
  assert.deepEqual(script({ glmSpend: 'necessary' }), [])
  assert.deepEqual(paths(script({ glmSpend: 'lots' })), ['action.glmSpend'])
  assert.ok(paths(script({ onError: 'block' })).includes('action.onError'), 'a loop board entry meets no gating event')
  assert.deepEqual(paths(script({ colour: 1 })), ['action.colour'])
})

test('script and check: "to: event-session" needs an event trigger, because a time entry has no session', () => {
  const entry = (action: Record<string, unknown>, when: Record<string, unknown>): readonly TriggerIssue[] => person({ action, when })
  const event = { kind: 'event', events: ['x.changed'] }
  const daily = { kind: 'daily', time: '08:30', timeZone: 'Asia/Shanghai' }
  assert.deepEqual(entry({ ...SCRIPT, to: 'event-session' }, event), [])
  assert.deepEqual(entry({ ...SCRIPT, to: 'main' }, daily), [])
  assert.deepEqual(paths(entry({ ...SCRIPT, to: 'event-session' }, daily)), ['action.to'])
  assert.deepEqual(paths(entry({ ...CHECK, to: 'event-session' }, daily)), ['action.to'])
  assert.deepEqual(paths(entry({ ...SCRIPT, to: 'elsewhere' }, event)), ['action.to'])
})

test('check: the tool node, the command the person agreed to, a timeout, the same report fields as a script', () => {
  const check = (action: Record<string, unknown>): readonly TriggerIssue[] => person({ action: { ...CHECK, ...action } })
  assert.deepEqual(check({}), [])
  assert.deepEqual(check({ check: 'typecheck', timeoutSeconds: 120, to: 'main', note: 'Fix it', glmSpend: 'optional' }), [])
  assert.deepEqual(paths(check({ tool: '' })), ['action.tool'])
  assert.deepEqual(paths(check({ tool: undefined })), ['action.tool'])
  assert.deepEqual(paths(check({ check: '' })), ['action.check'])
  assert.deepEqual(paths(check({ argv: [] })), ['action.argv'])
  assert.deepEqual(paths(check({ argv: 'npx tsc' })), ['action.argv'])
  assert.deepEqual(check({ argv: Array.from({ length: 64 }, () => 'a') }), [])
  assert.deepEqual(paths(check({ argv: Array.from({ length: 65 }, () => 'a') })), ['action.argv'])
  assert.deepEqual(paths(check({ argv: ['npx', ''] })), ['action.argv[1]'])
  assert.deepEqual(paths(check({ argv: ['npx', 'a'.repeat(2001)] })), ['action.argv[1]'])
  assert.deepEqual(paths(check({ argv: ['npx', 'a\0b'] })), ['action.argv[1]'])
  assert.deepEqual(paths(check({ timeoutSeconds: 4 })), ['action.timeoutSeconds'])
  assert.deepEqual(paths(check({ timeoutSeconds: 1801 })), ['action.timeoutSeconds'])
  assert.deepEqual(paths(check({ report: 'sometimes' })), ['action.report'])
  assert.deepEqual(paths(check({ extra: 1 })), ['action.extra'])
})

test('when and filter go through the shared validateWhen, with the action mapped to the rule it needs', () => {
  // Telling the main agent wakes it: an "every" is at least 600 seconds. A harness action or a script is not heard: 300.
  const every = (seconds: number, action: Record<string, unknown>, extra: Partial<EntryContext> = {}): readonly TriggerIssue[] => plugin({ when: { kind: 'every', seconds }, action }, extra)
  const tell = { kind: 'tell-main', text: 'hi', wake: true }
  const run = { kind: 'harness', action: 'x.run' }
  assert.deepEqual(paths(every(599, tell)), ['when.seconds'])
  assert.deepEqual(every(600, tell), [])
  assert.deepEqual(paths(every(299, run, { actions: new Set(['x.run']) })), ['when.seconds'])
  assert.deepEqual(every(300, run, { actions: new Set(['x.run']) }), [])
  assert.deepEqual(every(300, { kind: 'self', does: 'it', by: 'x' }), [])
  assert.deepEqual(paths(person({ when: { kind: 'every', seconds: 299 }, action: SCRIPT })), ['when.seconds'])
  assert.deepEqual(person({ when: { kind: 'every', seconds: 300 }, action: SCRIPT }), [])
  // Cron is for telling the main agent only; a command trigger and a listed-only event are a plugin's self entries.
  assert.deepEqual(plugin({ when: { kind: 'cron', expression: '0 9 * * 1' }, action: tell }), [])
  assert.deepEqual(paths(plugin({ when: { kind: 'cron', expression: '0 9 * * 1' }, action: { kind: 'self', does: 'it', by: 'x' } })), ['when'])
  assert.deepEqual(plugin({ when: { kind: 'command', names: ['status'] }, action: { kind: 'self', does: 'it', by: 'x' } }), [])
  assert.deepEqual(paths(plugin({ when: { kind: 'command', names: ['status'] }, action: tell })), ['when'])
  assert.deepEqual(paths(person({ when: { kind: 'command', names: ['status'] }, action: tell })), ['when'])
  assert.deepEqual(plugin({ when: { kind: 'event', events: ['x.listed'] }, action: { kind: 'self', does: 'it', by: 'x' } }), [])
  assert.deepEqual(paths(plugin({ when: { kind: 'event', events: ['x.listed'] }, action: tell })), ['when.events'])
  // A person selects only what is marked for people; a plugin may name any.
  assert.deepEqual(paths(person({ when: { kind: 'event', events: ['x.internal'] }, action: tell })), ['when.events'])
  assert.deepEqual(plugin({ when: { kind: 'event', events: ['x.internal'] }, action: tell }), [])
  // The filter keys and comparisons follow the declarations, and a filter is for an event trigger.
  assert.deepEqual(plugin({ filter: { files: { paths: ['*.ts'] }, kind: { in: ['a'] } } }), [])
  assert.deepEqual(paths(plugin({ filter: { nope: { in: ['a'] } } })), ['filter.nope'])
  assert.deepEqual(paths(plugin({ filter: { count: { in: ['a'] } } })), ['filter.count'])
  assert.deepEqual(paths(plugin({ when: { kind: 'daily', time: '08:30' }, filter: { kind: { in: ['a'] } }, action: tell })), ['filter'])
  // The gating events belong to the rules board.
  assert.deepEqual(paths(plugin({ when: { kind: 'event', events: ['gate.tool-call'] }, action: tell })), ['when.events'])
  assert.deepEqual(paths(plugin({ when: { kind: 'once', at: '2026-11-01T00:00:00Z' }, action: tell })), ['when.at'], 'a once is measured against the context\'s now')
})

test('an event nobody declares yet: a plugin may name it and the entry waits; a person may not; the part that is declared is still checked', () => {
  const absent = new Set(['m.later', 'm.also'])
  const waiting = (patch: Record<string, unknown>, extra: Partial<EntryContext> = {}): readonly TriggerIssue[] => plugin(patch, { absent, ...extra })
  assert.deepEqual(waiting({ when: { kind: 'event', events: ['m.later'] } }), [])
  assert.deepEqual(waiting({ when: { kind: 'event', events: ['m.later'] }, filter: { whatever: { in: ['a'] } } }), [], 'a filter on an event nobody declared is checked when it is declared')
  assert.deepEqual(waiting({ when: { kind: 'event', events: ['m.later'] }, action: { kind: 'tell-main', text: '{anything}', wake: true } }), [])
  assert.deepEqual(waiting({ when: { kind: 'event', events: ['m.later', 'x.changed'] }, filter: { kind: { in: ['a'] } } }), [])
  assert.deepEqual(paths(waiting({ when: { kind: 'event', events: ['m.later', 'x.changed'] }, filter: { nope: { in: ['a'] } } })), ['filter.nope'])
  assert.deepEqual(paths(waiting({ when: { kind: 'event', events: ['m.later', 'x.changed'] }, action: { kind: 'tell-main', text: '{nope}', wake: true } })), ['action.text'])
  // Not on the list of events that may come: unknown.
  assert.deepEqual(paths(waiting({ when: { kind: 'event', events: ['m.never'] } })), ['when.events'])
  assert.deepEqual(paths(waiting({ when: { kind: 'event', events: ['m.later', 'm.never'] } })), ['when.events'])
  assert.deepEqual(paths(plugin({ when: { kind: 'event', events: ['m.later'] } })), ['when.events'], 'without the list nothing is waited for')
  assert.deepEqual(paths(person({ when: { kind: 'event', events: ['m.later'] } }, { absent })), ['when.events'])
  // The count of events still holds.
  assert.deepEqual(paths(waiting({ when: { kind: 'event', events: [] } })), ['when.events'])
  assert.deepEqual(paths(waiting({ when: { kind: 'event', events: ['m.later', 'm.also', 'x.changed', 'x.other', 'x.changed'] } })), ['when.events'])
  // An event the table has is not waited for, even when it is on the list.
  assert.deepEqual(paths(waiting({ when: { kind: 'event', events: ['x.changed'] }, filter: { nope: { in: ['a'] } } }, { absent: new Set(['x.changed']) })), ['filter.nope'])
})

test('input that is not an entry is reported, never thrown at', () => {
  const junk: unknown[] = [undefined, null, 7, 'entry', [], () => 1, { when: 7 }, { ...PLUGIN, when: null }, { ...PLUGIN, filter: 4 }, { ...PLUGIN, action: { kind: 'tell-main', text: Symbol('x') } }]
  for (const [index, input] of junk.entries()) {
    const issues = validateEntry(input, 'plugin', context())
    assert.ok(issues.length > 0, `junk #${index}`)
    assert.ok(issues.every(issue => typeof issue.path === 'string' && issue.message.length > 0))
  }
  assert.deepEqual(paths(validateEntry(7, 'person', context())), ['entry'])
})
