/**
 * The two paths and the two things (takeover design 0.6 §1.4 bootstrap-paths
 * #1, #2, #3 without M7's round trip, #5, #6, #7, #9; row #5's checker gap):
 * the default table (§5.5 with the orchestrator's answer to Q1 of the plan
 * and the person's d-habits-into-framework), the draft of the two things
 * (§5.4) held to M3's checks, the rule draft held to the rules board's own
 * check, the checker gap of §5.8, and the seam with M3: propose_to_human
 * with `attach: bootstrap:<id>:cost|touch`, record_human_answer, and the
 * takeover's acceptProposal on the fake host with the real graph engine.
 */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  DEFAULT_KEYS, DEFAULTS_VERSION, TESTS_MISSING_NOTE, defaultsMarkdown, ecosystemDefaults, gateDraft, gateLine, testsMissing, toolNodeDraft,
  type DefaultFacts, type DefaultKey, type EcosystemDefaults,
} from '../src/bootstrap/defaults.ts'
import { packageJsonCandidates } from '../src/bootstrap/extract.ts'
import { uncheckedExtensions } from '../src/bootstrap/gaps.ts'
import { reminderText, type ReminderFacts } from '../src/bootstrap/notice.ts'
import { BOTH_GUESS, askRefusal, questionsDraft, questionsMarkdown } from '../src/bootstrap/present.ts'
import type { ScanResult } from '../src/bootstrap/scan.ts'
import { BOOTSTRAP_SERVICE, takeoverAttachLine } from '../src/bootstrap/service.ts'
import { PLACEHOLDERS } from '../src/bootstrap/templates.ts'
import { ruleDraft } from '../src/bootstrap/touch.ts'
import { ATTACH_BOARDS, type AttachService } from '../src/design/attach.ts'
import { checkLineRefusal, isCheckLine, parseCheckLine } from '../src/env/check-entry.ts'
import { parseCheckOutput } from '../src/env/parsers.ts'
import { openEngine } from '../src/graph/engine.ts'
import { labeledSections } from '../src/graph/stage.ts'
import { loadGraph } from '../src/graph/store.ts'
import { validateRule } from '../src/rules/model.ts'
import { PROPOSE_TO_HUMAN, RECORD_HUMAN_ANSWER } from '../src/shared/tool-names.ts'
import { git, init, journal, rootAgent, scanFixture, takeoverHost } from './bootstrap-host.ts'
import { graphOf, node } from './execute-helpers.ts'
import { exampleRecord } from './proposal-examples.ts'

const facts = (platform: NodeJS.Platform, fresh: boolean, files: readonly string[] = []): DefaultFacts => ({ platform, fresh, files })
const rowOf = (key: DefaultKey, given: DefaultFacts): EcosystemDefaults => {
  const row = ecosystemDefaults(key, given)
  assert.ok(row !== undefined, key)
  return row
}
const PACKAGE = (scripts: Record<string, string>): string => JSON.stringify({ name: 'demo', scripts }, null, 2)

// ---------------------------------------------------------------- the default table

test('every recognised ecosystem\'s gate draft has exactly one test command; Shell and the ecosystems the table does not know have none (Q1 A)', () => {
  for (const key of DEFAULT_KEYS) {
    for (const platform of ['win32', 'linux'] as const) {
      for (const fresh of [true, false]) {
        const tests = gateDraft(rowOf(key, facts(platform, fresh)), []).filter(item => item.kind === 'test')
        assert.equal(tests.length, key === 'shell' ? 0 : 1, `${key} ${platform} ${fresh ? 'new' : 'existing'}`)
      }
    }
  }
  for (const stack of ['deno', 'meson', 'java-maven', 'java-gradle', 'ruby', 'php', 'dotnet'] as const) assert.equal(ecosystemDefaults(stack, facts('win32', false)), undefined, stack)
  // The project's own test script takes the default's place; a second test script does not make a second test line.
  const own = packageJsonCandidates(PACKAGE({ 'test:unit': 'node --test', test: 'node --test' }), 'package.json', 'pnpm').candidates
  const draft = gateDraft(rowOf('node-pnpm', facts('win32', false, ['pnpm-lock.yaml'])), own)
  const tests = draft.filter(item => item.kind === 'test')
  assert.deepEqual(tests.map(item => [item.command, item.from?.file]), [['pnpm test', 'package.json']])
  assert.equal(gateLine(tests[0]), '`$ pnpm test`')
  assert.equal(gateLine(draft[0]), '`setup $ pnpm install --frozen-lockfile`')
})

test('the dead-code and duplicate checks of ORCHESTRATION §7.5 (d-habits-into-framework): knip and jscpd for Node, vulture for Python, none for Rust, Go says it is not covered', () => {
  const kinds = (key: DefaultKey): string[] => gateDraft(rowOf(key, facts('linux', true)), []).map(item => `${item.kind}:${item.command}`)
  for (const key of ['node-npm', 'node-pnpm', 'node-yarn', 'node-bun'] as const) {
    const lines = kinds(key)
    assert.equal(lines.filter(line => line.startsWith('dead-code:') && line.endsWith(' knip')).length, 1, key)
    assert.equal(lines.filter(line => line.startsWith('duplicate:') && line.includes(' jscpd --exit-code 1 --reporters xcode ')).length, 1, key)
  }
  for (const key of ['python-uv', 'python-poetry', 'python'] as const) assert.equal(kinds(key).filter(line => line.startsWith('dead-code:') && line.includes('vulture . --exclude .venv')).length, 1, key)
  assert.deepEqual(kinds('rust').filter(line => line.startsWith('dead-code:') || line.startsWith('duplicate:')), [], 'clippy -D warnings already makes dead_code an error')
  assert.ok(kinds('rust').includes('lint:cargo clippy --locked -- -D warnings'))
  assert.match(rowOf('go', facts('linux', true)).notCovered ?? '', /staticcheck/)
  // The project's own script by the tool's name replaces the default.
  const own = packageJsonCandidates(PACKAGE({ test: 'node --test', knip: 'knip --production' }), 'package.json', 'npm').candidates
  const draft = gateDraft(rowOf('node-npm', facts('linux', false, ['package-lock.json'])), own)
  assert.deepEqual(draft.filter(item => item.kind === 'dead-code').map(item => [item.command, item.from?.file]), [['npm run knip', 'package.json']])
  // What was tried on 2026-11-05 (src/bootstrap/defaults.ts header): jscpd's xcode reporter and vulture read as `lines`, knip's reporters in no format.
  const lines = (stdout: string): ReturnType<typeof parseCheckOutput> => parseCheckOutput('lines', { stdout, stderr: '', exitCode: 1 })
  assert.deepEqual(lines('src\\a.ts:1:3: warning: Found 149 lines (1-150) duplicated on file src\\c.ts (1-150)\nFound 1 clones.').map(found => [found.file, found.line]), [['src\\a.ts', 1]])
  assert.deepEqual(lines('app.py:8: unused function \'unused\' (60% confidence)').map(found => [found.file, found.line]), [['app.py', 8]])
  assert.notDeepEqual(lines('unused  function  src/lib.ts:2:17').map(found => found.file), ['src/lib.ts'], 'knip\'s symbols reporter is misread')
  const existing = defaultsMarkdown(scanFixture({ stacks: ['node-npm'], candidates: own }), ['package.json'], false, 'linux')
  assert.match(existing, /npx jscpd [^\n]*\(its output reads as `lines`\)/)
  assert.match(existing, /`\$ npx tsc --noEmit`|npx jscpd/)
  assert.match(existing, /stays out of norm-merge-gate for now/, 'a default that fails on the current code is not gated on an existing project (§5.6 item 4)')
  assert.doesNotMatch(defaultsMarkdown(scanFixture({}), [], true, 'linux'), /stays out of norm-merge-gate/, 'a new project is strict from the first day')
})

test('tool nodes: the four labels, and check lines M4 reads that start a program without a shell (no npx, pnpm, yarn or another .cmd)', () => {
  for (const key of DEFAULT_KEYS) {
    for (const platform of ['win32', 'linux'] as const) {
      for (const tool of rowOf(key, facts(platform, true)).tools) {
        const draft = toolNodeDraft(tool)
        assert.deepEqual([draft.type, draft.parent], ['tool', 'env'])
        const labels = labeledSections(draft.body, ['用途', '用法', '选择理由', '安装位置'])
        for (const label of ['用途', '用法', '选择理由', '安装位置']) assert.ok((labels.get(label) ?? '').trim() !== '', `${key} ${tool.title} ${label}`)
        const checks = draft.acceptance.filter(isCheckLine)
        assert.equal(checks.length, 1, `${key} ${tool.title}`)
        for (const line of checks) {
          assert.equal(checkLineRefusal(line), undefined, line)
          const program = parseCheckLine(line)?.argv[0] ?? ''
          assert.ok(!['npx', 'pnpm', 'yarn', 'bunx'].includes(program) && !/\.(cmd|bat)$/i.test(program), `${key} ${platform}: ${line}`)
          assert.ok(!/ \d+s \$ /.test(line), 'no estimate: the trial measures it')
        }
      }
    }
  }
  const pnp = rowOf('node-yarn', facts('win32', false, ['yarn.lock', '.yarnrc.yml', '.pnp.cjs']))
  assert.deepEqual([pnp.tools.length, pnp.setup], [0, ['yarn install --immutable']])
  assert.match(pnp.note ?? '', /node_modules/)
})

test('the scan\'s signal that there are no tests: Node without scripts.test, Python without tests; the reminder and defaults.md ask for a task 补上测试', () => {
  const withTest = packageJsonCandidates(PACKAGE({ test: 'node --test' }), 'package.json', 'npm').candidates
  assert.equal(testsMissing(scanFixture({ stacks: ['node-npm'] })), true)
  assert.equal(testsMissing(scanFixture({ stacks: ['node-npm'], candidates: withTest })), false)
  assert.equal(testsMissing(scanFixture({ stacks: ['python'] })), true)
  assert.equal(testsMissing(scanFixture({ stacks: ['python'], files: { tracked: 1, code: 1, byExtension: {}, topDirs: ['tests/'] } })), false)
  assert.equal(testsMissing(scanFixture({ stacks: ['python-uv'], checkers: { configs: [], pyprojectTools: ['pytest'] } })), false)
  assert.equal(testsMissing(scanFixture({ stacks: ['go'] })), false, 'the other ecosystems give no signal')
  const reminder = (missing: boolean): string => {
    const given: ReminderFacts = { takeover: { id: 'tk-abcdefgh', path: 'existing' }, history: 1, anchor: 'goal-1', proposed: { total: 0, byType: {} }, missing: [], unchecked: [], things: {}, touchInside: [], rulesWhole: false, testsMissing: missing }
    return reminderText(given)
  }
  assert.match(reminder(true), /No tests were found: propose a task "补上测试"/)
  assert.match(reminder(false), /If you find no tests while reading, propose a task "补上测试"/)
  const markdown = defaultsMarkdown(scanFixture({ stacks: ['node-npm'] }), ['package.json'], false, 'linux')
  assert.ok(markdown.startsWith(`# Default checks (defaults ${DEFAULTS_VERSION})`))
  assert.ok(markdown.includes(TESTS_MISSING_NOTE))
  assert.ok(markdown.includes('`$ npm test`'))
  const fresh = defaultsMarkdown(scanFixture({}), [], true, 'win32')
  assert.equal(fresh.split('\n').filter(line => line.startsWith('## ')).length, DEFAULT_KEYS.length, 'a new project lists every row')
  assert.ok(!fresh.includes(TESTS_MISSING_NOTE))
  assert.match(defaultsMarkdown(scanFixture({ stacks: ['ruby'] }), [], false), /## ruby\n\nNo default for this ecosystem/)
})

// ---------------------------------------------------------------- the two things

const costly = packageJsonCandidates(PACKAGE({ test: 'node --test', 'test:e2e': 'playwright test' }), 'package.json', 'npm').candidates

test('the two things: one recommend question each that passes M3\'s checks, the cost after the question mark; the touch question says no rule can block while the rules board cannot take one', () => {
  const scan = scanFixture({ stacks: ['node-npm'], candidates: costly, files: { tracked: 3, code: 1, byExtension: {}, topDirs: ['src/', 'vendor/'] } })
  for (const rulesWhole of [false, true]) {
    const [cost, touch] = questionsDraft(scan, ['package.json', 'src/a.js', 'vendor/x.js', '.env.local'], rulesWhole)
    assert.ok(cost?.ask !== undefined && touch?.ask !== undefined)
    for (const ask of [cost.ask, touch.ask]) {
      assert.equal(askRefusal(ask), undefined, ask.text)
      assert.match(ask.text, /^我建议.+，因为.+，可以吗？代价是.+。$/)
    }
    assert.deepEqual(cost.shown, ['npm run test:e2e'])
    assert.ok(cost.ask.text.includes('npm run test:e2e'))
    assert.deepEqual(touch.shown, ['vendor/', '.env.local'])
    assert.match(touch.ask.proposal, rulesWhole ? /另提一条规则/ : /写进规范$/)
    assert.equal(touch.ask.cost, rulesWhole ? '以后要改它们得先撤下这条规则' : '系统不会拦，只靠主 Agent 改之前先问你')
  }
  const markdown = questionsMarkdown(questionsDraft(scan, ['vendor/x.js'], false), 'tk-abcdefgh')
  assert.ok(markdown.includes('"attach": "bootstrap:tk-abcdefgh:cost"') && markdown.includes('"attach": "bootstrap:tk-abcdefgh:touch"'))
})

test('without candidates the two things are one guess asked in the chat; a gaps takeover asks only the thing it fills', () => {
  const none = questionsDraft(scanFixture({}), [], false)
  assert.deepEqual(none.map(thing => [thing.which, thing.ask, thing.guess]), [['cost', undefined, BOTH_GUESS], ['touch', undefined, BOTH_GUESS]])
  assert.match(questionsMarkdown(none, 'tk-abcdefgh'), new RegExp(`Ask in the chat, not with propose_to_human: ${BOTH_GUESS}`))
  const touchOnly = questionsDraft(scanFixture({}), [], false, ['touch'])
  assert.deepEqual(touchOnly.map(thing => thing.which), ['touch'])
  assert.ok(touchOnly[0]?.guess !== BOTH_GUESS && (touchOnly[0]?.guess ?? '').includes('不许碰'))
})

test('the rule draft passes the rules board\'s own check, takes at most 20 paths and leaves out the ones the board refuses', () => {
  const inside = [...Array.from({ length: 23 }, (_, index) => `vendor/p${index}/`), 'gen\\out.js', 'a/../b', 'dist/**']
  const { draft, left } = ruleDraft('tk-abcdefgh', inside)
  assert.ok(draft !== undefined)
  assert.equal(draft.body.filter.writes.paths.length, 20)
  assert.deepEqual(left, ['vendor/p20/', 'vendor/p21/', 'vendor/p22/', 'gen\\out.js', 'a/../b', 'dist/**'])
  assert.deepEqual([draft.body.id, draft.body.source, draft.body.action.kind, draft.body.when.events], ['r-no-touch-tk-abcdefgh', 'norm-decision-tiers', 'block', ['gate.tool-call']])
  assert.deepEqual(validateRule({ ...draft.body, reason: draft.reason }, { now: new Date(), signals: new Map(), existing: [] }), [])
  assert.deepEqual(ruleDraft('tk-abcdefgh', ['C:/x']), { left: ['C:/x'] })
})

test('the checker gap of §5.8: the most used code extensions no check line with when of a tool under env covers', () => {
  const eslint = toolNodeDraft(rowOf('node-npm', facts('linux', true)).tools[0])
  const files = ['src/a.ts', 'src/b.ts', 'src/c.js', 'tools/d.py', 'tools/e.py', 'f.go', 'README.md']
  const graph = (status: 'approved' | 'dropped') => graphOf([node({ id: 'env', type: 'feature' }), node({ id: 'tool-eslint', type: 'tool', parent: 'env', status, acceptance: [...eslint.acceptance] })])
  // Top three by count, ties by name: .py and .ts (2 each), then .go before .js (1 each); ESLint's line covers .ts.
  assert.deepEqual(uncheckedExtensions(graph('approved'), files), ['.py', '.go'])
  assert.deepEqual(uncheckedExtensions(graph('dropped'), files), ['.py', '.ts', '.go'], 'a dropped tool covers nothing')
  assert.deepEqual(uncheckedExtensions(graphOf([]), []), [])
})

// ---------------------------------------------------------------- the seam with M3

/** An existing project with a test that costs money and a vendored directory, committed. */
function costlyProject(ws: string): void {
  writeFileSync(join(ws, 'package.json'), PACKAGE({ test: 'node --test', 'test:e2e': 'playwright test' }))
  mkdirSync(join(ws, 'src'), { recursive: true })
  mkdirSync(join(ws, 'vendor'), { recursive: true })
  writeFileSync(join(ws, 'src', 'index.js'), 'export const one = 1\n')
  writeFileSync(join(ws, 'vendor', 'lib.js'), 'export const two = 2\n')
  git(ws, 'init', '-q')
  git(ws, 'add', 'package.json', 'src', 'vendor')
  git(ws, 'commit', '-q', '-m', 'first')
}

test('the seam with M3: the drafted questions go through propose_to_human with attach, the human agrees, record_human_answer hands the agreement to the takeover; forged, repeated and closed hand-backs', async () => {
  const made = takeoverHost()
  const ws = made.workspace('seam')
  costlyProject(ws)
  const agent = await rootAgent(made, 's-seam', 'seam')
  assert.equal((await init(made, agent)).kind, 'success')
  const tk = journal(ws).find(record => record.op === 'takeover-open')?.id ?? ''
  const dir = join(ws, 'docs', 'graph')
  const service = made.services.get(BOOTSTRAP_SERVICE) as AttachService
  const board = ATTACH_BOARDS.find(entry => entry.prefix === 'bootstrap:')
  assert.ok(board !== undefined && board.format.test(`bootstrap:${tk}:cost`) && !board.format.test(`bootstrap:${tk}:list-1`))
  assert.equal(board.idOf(`说明\n\n${takeoverAttachLine(`bootstrap:${tk}:touch`)}`), `${tk}:touch`)

  // Before the norms are on the graph the takeover refuses the attach; a takeover it does not have, and what is not its attach, too.
  assert.match((await service.attachable({ cwd: ws, proposal: `${tk}:cost` }) as { message?: string }).message ?? '', /norm-verify-tiers is not on the graph yet/)
  assert.match((await service.attachable({ cwd: ws, proposal: 'tk-zzzzzzzz:cost' }) as { message?: string }).message ?? '', /no open takeover/)
  assert.equal((await service.attachable({ cwd: ws, proposal: `${tk}:list-1` })).ok, false)

  assert.ok((await openEngine(dir).apply('llm', { op: 'propose', reason: '接管：读项目', node: { type: 'goal', title: '这个项目要做成什么' } })).ok)
  await agent.assemble()
  await agent.step()
  assert.deepEqual(await service.attachable({ cwd: ws, proposal: `${tk}:cost` }), { ok: true })
  assert.match((await init(made, agent, 'status')).text, /花钱或独占：还没问你\n不许碰：还没问你/)

  // The drafts as the harness wrote them, put to the human as they are.
  const scan = JSON.parse(readFileSync(join(ws, '.llm', 'bootstrap', tk, 'scan.json'), 'utf8')) as ScanResult
  const files = readFileSync(join(ws, '.llm', 'bootstrap', tk, 'files.txt'), 'utf8').split('\n').filter(line => line !== '')
  assert.match(readFileSync(join(ws, '.llm', 'bootstrap', tk, 'questions.md'), 'utf8'), new RegExp(`"attach": "bootstrap:${tk}:touch"`))
  assert.ok(existsSync(join(ws, '.llm', 'bootstrap', tk, 'defaults.md')) && existsSync(join(ws, '.llm', 'bootstrap', tk, 'floor.md')))
  const shown: string[] = []
  for (const thing of questionsDraft(scan, files, false)) {
    assert.ok(thing.ask !== undefined, thing.which)
    const put = await made.callTool(agent, PROPOSE_TO_HUMAN, { kind: 'question', form: 'recommend', parent: 'goal-1', ...thing.ask, attach: `bootstrap:${tk}:${thing.which}` })
    assert.equal(put.kind, 'ok', JSON.stringify(put))
    shown.push(put.kind === 'ok' ? String(put.value.text) : '')
  }
  const question = async (id: string) => (await loadGraph(dir)).nodes.get(id)
  assert.equal((await question('question-1'))?.body, takeoverAttachLine(`bootstrap:${tk}:cost`))
  assert.match((await init(made, agent, 'status')).text, /花钱或独占：在等你回话/)
  made.reply(agent, shown.join('\n\n'))
  await made.say(agent, '可以，都按你说的来')
  const record = (id: string, recordedAs: string) => made.callTool(agent, RECORD_HUMAN_ANSWER, { kind: 'question', question: id, answer: 'agree', words: ['可以，都按你说的来'], recordedAs })
  const costAnswer = await record('question-1', 'npm run test:e2e 攒到一批再跑')
  assert.equal(costAnswer.kind, 'ok', JSON.stringify(costAnswer))
  assert.equal(costAnswer.kind === 'ok' ? costAnswer.value.handedBack : '', `Takeover ${tk}: write the human's answer into the label 花钱或独占 of norm-verify-tiers now (graph_edit body, their words as relay).`)
  const touchAnswer = await record('question-2', 'vendor/ 和 .env 不许碰')
  assert.match(touchAnswer.kind === 'ok' ? String(touchAnswer.value.handedBack) : JSON.stringify(touchAnswer), /No rule can block paths in this composition/)
  assert.deepEqual(journal(ws).filter(entry => entry.op === 'asked').map(entry => entry.data), [{ which: 'cost', questionId: 'question-1' }, { which: 'touch', questionId: 'question-2' }])
  assert.match((await init(made, agent, 'status')).text, /花钱或独占：你说了，主 Agent 还没记进规范/)

  // The same agreement handed back again writes nothing more.
  const by = { actor: 'llm', relay: '可以，都按你说的来' } as const
  assert.match(await service.acceptProposal({ questionId: 'question-1', graphDir: dir, cwd: ws, by }), /^Takeover tk-/)
  assert.equal(journal(ws).filter(entry => entry.op === 'asked').length, 2)
  // A decision without the human's words through record_human_answer is refused; so is a node that is no takeover question.
  const engine = openEngine(dir)
  const forged = await engine.apply('llm', { op: 'propose', reason: '冒充', node: { type: 'question', parent: 'goal-1', ...exampleRecord('recommend'), body: takeoverAttachLine(`bootstrap:${tk}:cost`) } })
  assert.ok(forged.ok)
  assert.ok((await engine.apply('human', { op: 'decide', id: forged.id, rev: (await engine.load()).revisions.get(forged.id), conclusion: '默认少做', reason: '人拍板' })).ok)
  assert.match(await service.acceptProposal({ questionId: forged.id, graphDir: dir, cwd: ws, by }), /does not carry the human's words/)
  assert.match(await service.acceptProposal({ questionId: 'goal-1', graphDir: dir, cwd: ws, by }), /No open takeover matches this question/)

  // The answers written into the labels: the things are done, and the rule and floor drafts follow 不许碰.
  for (const [id, label, value] of [['norm-verify-tiers', '花钱或独占', 'npm run test:e2e'], ['norm-decision-tiers', '不许碰', 'vendor/、.env']] as const) {
    const now = await engine.load()
    const body = now.nodes.get(id)?.body ?? ''
    const placeholder = label === '不许碰' ? PLACEHOLDERS.touch : PLACEHOLDERS.cost
    assert.ok((await engine.apply('human', { op: 'edit', id, rev: now.revisions.get(id), set: { body: body.replace(`${label}：${placeholder}`, `${label}：${value}`) }, reason: '人说的' })).ok, id)
  }
  await agent.step()
  assert.match((await init(made, agent, 'status')).text, /花钱或独占：你说了，已记进规范\n不许碰：你说了，已记进规范/)
  const rule = JSON.parse(readFileSync(join(ws, '.llm', 'bootstrap', tk, 'rule-draft.json'), 'utf8')) as { body: { filter: { writes: { paths: string[] } } } }
  assert.deepEqual(rule.body.filter.writes.paths, ['vendor/', '.env'])
  assert.match(readFileSync(join(ws, '.llm', 'bootstrap', tk, 'floor.md'), 'utf8'), /改到不许碰的地方：\.env、vendor\/ `files \.env, vendor\/`/)

  // Once the takeover is closed nothing matches.
  assert.equal((await init(made, agent, 'off')).kind, 'success')
  assert.match(await service.acceptProposal({ questionId: 'question-1', graphDir: dir, cwd: ws, by }), /No open takeover matches this question/)
})
