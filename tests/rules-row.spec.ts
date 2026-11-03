/**
 * The rules row on the fake rc.3 host (docs/ORCHESTRATION.md §16): the
 * `/rules peak` command, the service other rows read, the health it reports,
 * and what it never does: hold or delay an agent. The pricing service is the
 * real GLM credit plan, as `glm-login` provides it; the clock is injected.
 */
import assert from 'node:assert/strict'
import { appendFile, mkdir, mkdtemp, readdir, readFile, rename as renameFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { creditPricing } from '../src/glm-llm/credits.ts'
import { MAIN_AGENT_KEY } from '../src/graph/main-agent.ts'
import { peakStatusItems } from '../src/report/panel.ts'
import type { UserNotice } from '../src/shared/dsh-min.ts'
import { collectHealth, healthServiceName } from '../src/shared/health.ts'
import { PEAK_MODE_SERVICE, PEAK_REDUCE_GLM_WORKERS, peakModeService } from '../src/shared/peak-mode.ts'
import { statusServiceName, type RowStatusView } from '../src/shared/status-host.ts'
import { RULES_TOOL_NAMES } from '../src/shared/tool-names.ts'
import { apply, clockText, inject, name, type RulesContext } from '../src/rules/index.ts'
import { RULES_SERVICE } from '../src/rules/service.ts'
import type { HostHeartbeat } from '../src/rules/heartbeat.ts'
import { openRulesBoard } from '../src/rules/engine.ts'
import { repoJson, type JournalRecord, type RepoRules } from '../src/rules/model.ts'
import { loadState } from '../src/rules/store.ts'
import { fakeRuntime, type FakeRuntime } from './fake-rc3.ts'
import { captureWarnings } from './graph-helpers.ts'
import { FULL_RULES_FILE, ruleOf } from './rules-fixtures.ts'
import { fakeClock, MINUTE, quickIo, writeHeartbeat } from './rules-helpers.ts'
import { health, PEAK_NOW, rowTest, withRow, type Fixture } from './rules-host.ts'
import { skipIfTempInsideGit } from './temp-outside-git.ts'

const NOW = PEAK_NOW
const OFF_PEAK = Date.parse('2026-10-28T20:00:00+08:00')
const PEAK_END = '2026-10-28T10:00:00.000Z'
const NEXT_PEAK = '2026-10-29T06:00:00.000Z'

rowTest('the row is a cordis plugin that needs the tools and commands services, registers /rules and rules_show, provides the services and its health, and withdraws all of it', ({ runtime, commands, dispose }) => {
  assert.equal(name, 'dsh-glm-hourness/rules')
  assert.deepEqual(inject, ['tools', 'commands'])
  const command = commands.get('rules')
  assert.deepEqual([command?.definitionId, command?.name], ['dsh-glm-hourness/rules', 'rules'])
  assert.equal(command?.input?.hint, 'show | peak [无影响|少做|不做] | lift <规则> | delete <规则或开关> | on <开关> [时长] | off <开关> | set <信号> <值> [时长] | clear <信号> | let <单号> | cancel <单号> | recovery <编号…|文件> 照改|忽略')
  assert.deepEqual(runtime.scoped.map(tool => tool.name), [...RULES_TOOL_NAMES], 'the tools the row registers are the contract names')
  assert.ok(runtime.services.has(PEAK_MODE_SERVICE))
  assert.ok(runtime.services.has(RULES_SERVICE))
  assert.deepEqual(health(runtime), { row: 'rules', status: 'idle', reason: `命令 /rules、工具 rules_show 与高峰模式服务 ${PEAK_MODE_SERVICE} 已就绪` })
  assert.ok(peakModeService(runtime.ctx) !== undefined)
  void dispose()
  assert.equal(commands.size, 0)
  assert.equal(runtime.scoped.length, 0, 'the tool leaves with the row')
  assert.equal(peakModeService(runtime.ctx), undefined, 'the readers see the service leave with the row')
  assert.equal(runtime.services.has(PEAK_MODE_SERVICE), false)
  assert.equal(runtime.services.has(RULES_SERVICE), false)
  assert.equal(runtime.services.has(healthServiceName('rules')), false)
  assert.deepEqual(runtime.listeners.map(entry => entry.event), [])
  return Promise.resolve()
})

rowTest('the row never holds the main agent: its lifecycle listeners and the outermost tool-call gate are all it registers, and on every level the main agent\'s call runs and its step is admitted', async ({ runtime, run }) => {
  assert.deepEqual(runtime.listeners.map(entry => entry.event).sort(), ['agent/created', 'session/disposed', 'tools/pre-execute'])
  assert.deepEqual(runtime.listeners.find(entry => entry.event === 'tools/pre-execute')?.options, { prepend: true }, 'the gate is outermost')
  for (const level of ['无影响', '少做', '不做']) {
    await run(`peak ${level}`)
    const result = await runtime.ctx.tools.execute({ callId: `call-${level}`, name: 'pwsh', arguments: {}, agent: runtime.agent, signal: new AbortController().signal })
    assert.equal(result.isError, false, `${level}: a tool call of the main agent in a peak runs`)
    assert.equal((await runtime.preStep()).kind, 'enter', `${level}: a step is admitted`)
  }
})

rowTest('without a choice the project is at the factory level reduce; in a peak the cap is one GLM subagent and the peak holds GLM work until it ends', async ({ root, runtime, service, run }) => {
  const text = (await run('peak')).text ?? ''
  assert.ok(text.startsWith(`高峰模式：少做（出厂默认）。现在是高峰，到 ${clockText(PEAK_END, NOW)}。`), text)
  assert.ok(text.includes('默认是**少做**'), 'the intro follows')
  await runtime.create()
  assert.deepEqual(service.stateFor('agent-1'), { level: 'reduce', origin: 'default', peak: true, until: PEAK_END, glmWorkerCap: 1 })
  assert.deepEqual(service.peakHoldFor('agent-1'), { level: 'reduce', until: PEAK_END })
  assert.deepEqual((await readdir(root)).sort(), ['.git', '.llm'], 'a live session makes the host write its heartbeat')
  assert.deepEqual(await readdir(join(root, '.llm')), ['rules'])
  assert.deepEqual(await readdir(join(root, '.llm', 'rules')), ['hosts'], 'looking wrote no state: nothing but the heartbeat of this host')
})

rowTest('/rules peak 不做 stores the choice in the repository and the project, and the service hands it out; the choice is the person\'s with its time', async ({ root, runtime, service, run }) => {
  const result = await run('peak 不做')
  assert.equal(result.kind, 'success')
  assert.ok(result.text?.startsWith('高峰模式改成了「不做」（高峰里 GLM 的活停下排队，高峰结束后接着做）。现在是高峰，到 '), result.text)
  assert.ok(result.text?.includes('从下一次工具调用和派活起生效'), 'the reply says when the level takes hold')
  assert.ok(!result.text?.includes('不拦任何调用'), 'the level does hold things back now')
  const state = service.stateFor('agent-1')
  assert.deepEqual([state?.level, state?.origin, state?.peak, state?.until, 'glmWorkerCap' in (state ?? {})], ['stop', 'human', true, PEAK_END, false])
  assert.match(state?.at ?? '', /^\d{4}-\d\d-\d\dT/)
  assert.deepEqual(service.peakHoldFor('agent-1'), { level: 'stop', until: PEAK_END })
  const file = await readFile(join(root, 'docs', 'rules', 'rules.json'), 'utf8')
  assert.equal(file, repoJson({ version: 2, peakMode: { level: 'stop', at: state!.at!, origin: { actor: 'human' } } }))
  assert.deepEqual((await readdir(join(root, '.llm', 'rules'))).sort(), ['journal.jsonl', 'repo-written.json', 'state.json'])
  assert.equal(health(runtime).status, 'active')
  assert.match(health(runtime).reason, /^本会话所在项目 rules-row-\w+：高峰模式 不做（你选的）；现在是高峰$/)
  assert.equal((await run('peak 不做')).text, '高峰模式已经是「不做」，没有改动。')
  const again = await run('peak')
  assert.ok(again.text?.startsWith('高峰模式：不做（你在 '), again.text)
})

rowTest('the three levels in a peak: the cap only for reduce, the hold for reduce and stop, and the reply for reduce names the cap that the service hands out', async ({ service, run }) => {
  const seen: Array<[string, boolean | undefined, number | undefined, string | undefined]> = []
  for (const level of ['无影响', '少做', '不做']) {
    const reply = await run(`peak ${level}`)
    const state = service.stateFor('agent-1')
    seen.push([level, state?.peak, state?.glmWorkerCap, service.peakHoldFor('agent-1')?.level])
    if (level === '少做') assert.ok(reply.text?.startsWith(`高峰模式改成了「少做」（高峰里同时至多 ${PEAK_REDUCE_GLM_WORKERS} 个 GLM 子 agent，`), reply.text)
  }
  assert.deepEqual(seen, [['无影响', true, undefined, undefined], ['少做', true, PEAK_REDUCE_GLM_WORKERS, 'reduce'], ['不做', true, undefined, 'stop']])
})

rowTest('out of a peak the state names when the next one starts, and there is no cap and no hold on any level', async ({ service, run }) => {
  for (const level of ['无影响', '少做', '不做']) {
    await run(`peak ${level}`)
    const state = service.stateFor('agent-1')
    assert.deepEqual([state?.peak, state?.until, state?.glmWorkerCap, service.peakHoldFor('agent-1')], [false, NEXT_PEAK, undefined, undefined], level)
  }
  assert.ok(((await run('peak')).text ?? '').includes(`现在不是高峰，下一次 ${clockText(NEXT_PEAK, OFF_PEAK)} 开始。`))
}, { now: OFF_PEAK })

rowTest('without the pricing service nobody knows whether it is peak: no cap, no hold, and the reply says why', async ({ runtime, service, run }) => {
  await run('peak 少做')
  const state = service.stateFor('agent-1')
  assert.deepEqual(state, { level: 'reduce', origin: 'human', at: state?.at, peak: undefined })
  assert.equal(service.peakHoldFor('agent-1'), undefined)
  const reply = await run('peak')
  assert.ok(reply.text?.includes('读不到是不是高峰（没有计价服务（GLM 通道包未装，或它的 glm-login 行未启用）），这一档现在不生效。'), reply.text)
  assert.equal(health(runtime).status, 'active', 'a package without the GLM channel is a supported combination')
  assert.match(health(runtime).reason, /读不出是不是高峰/)
}, { pricing: 'none' })

test('a pricing service of the wrong shape, one whose peak throws and one whose peak is not a boolean each read as unknown with their own reason, and warn once', async () => {
  const cases: ReadonlyArray<readonly [unknown, string, number, RegExp]> = [
    [{ basis: 'x', plan: 'y' }, '计价服务的形状不对', 1, /glmHournessPricing has the wrong shape/],
    [{ basis: 'x', plan: 'y', charged: () => 1, peak: () => { throw new Error('rate table gone') } }, '计价服务的 peak 出错：rate table gone', 1, /peak threw: rate table gone/],
    [{ basis: 'x', plan: 'y', charged: () => 1, peak: () => 'yes' }, '计价服务的 peak 没有返回是或否', 0, /^$/],
  ]
  for (const [pricing, reason, warned, pattern] of cases) {
    const { warnings } = await captureWarnings(() => withRow(async ({ service, run }) => {
      const first = await run('peak 少做')
      const second = await run('peak')
      assert.ok(first.text?.includes(`读不到是不是高峰（${reason}）`), first.text)
      assert.ok(second.text?.includes(`读不到是不是高峰（${reason}）`), second.text)
      assert.equal(service.stateFor('agent-1')?.glmWorkerCap, undefined)
      assert.equal(service.peakHoldFor('agent-1'), undefined)
    }, { pricing }))
    const ours = warnings.filter(warning => warning.startsWith('dsh-glm-hourness/rules: '))
    assert.equal(ours.length, warned, `${reason}: ${warnings.join(' | ')}`)
    if (warned > 0) assert.match(ours.join('\n'), pattern)
  }
})

rowTest('a session is found by the event that created it, by the host registry when the row came late, and is forgotten when it ends', async ({ runtime, root, service, run }) => {
  assert.equal(service.stateFor('agent-1'), undefined, 'a session the host has not shown yet is unknown')
  await runtime.create()
  assert.equal(service.stateFor('agent-1')?.level, 'reduce')
  for (const entry of runtime.listeners.filter(item => item.event === 'session/disposed')) (entry.listener as unknown as (session: { id: string }) => void)({ id: 'agent-1' })
  assert.equal(service.stateFor('agent-1'), undefined)
  runtime.services.set('agents', { get: (id: string) => id === 'agent-1' ? { session: { header: { cwd: root } } } : undefined })
  assert.equal(service.stateFor('agent-1')?.level, 'reduce', 'the registry knows the session')
  assert.equal(service.stateFor('agent-2'), undefined)
  assert.equal(service.stateForProject(root)?.level, 'reduce')
  await run('peak')
  assert.equal(service.stateFor('agent-1')?.level, 'reduce')
})

rowTest('a session without a working directory has no state and a reply that says so', async ({ runtime, service, run }) => {
  await runtime.create()
  assert.equal(service.stateFor('agent-1'), undefined)
  const reply = await run('peak')
  assert.equal(reply.kind, 'error')
  assert.match(reply.text ?? '', /没有工作目录，或不在项目里/)
  assert.equal(health(runtime).status, 'degraded')
  assert.equal((await run('peak 不做')).kind, 'error')
}, { cwd: null })

test('a folder that is no project has no state, and nothing is created in it', { skip: skipIfTempInsideGit() }, async () => {
  const bare = await mkdtemp(join(tmpdir(), 'rules-bare-'))
  try {
    await withRow(async ({ runtime, service, run }) => {
      await runtime.create()
      assert.equal(service.stateFor('agent-1'), undefined)
      assert.equal(service.stateForProject(bare), undefined)
      assert.equal((await run('peak')).kind, 'error')
      assert.equal((await run('peak 不做')).kind, 'error')
      assert.deepEqual(await readdir(bare), [])
    }, { cwd: bare })
  }
  finally {
    await rm(bare, { recursive: true, force: true })
  }
})

rowTest('the command takes the built subcommands and says what it expects for anything else; the proposal subcommands are not there', async ({ run }) => {
  for (const input of ['', 'frobnicate', 'peak a b', 'accept p-1', 'reject p-1', 'detector d-x 生效', 'lift', 'on', 'set x', 'recovery 1-1']) {
    const result = await run(input)
    assert.deepEqual([input, result.kind, result.text?.startsWith('用法：/rules ')], [input, 'error', true])
    assert.ok(result.text?.includes('/rules peak [无影响|少做|不做]'), `${input}: the usage names every subcommand`)
  }
  const unknown = await run('peak 多做')
  assert.deepEqual([unknown.kind, unknown.text?.startsWith('不认识档位「多做」。用法：')], ['error', true])
  for (const word of ['inform', 'reduce', 'stop', 'STOP']) assert.equal((await run(`peak ${word}`)).kind, 'success', word)
})

rowTest('a failed write is a reply, not a throw, and reading the project afterwards does not throw either', async ({ root, service, run }) => {
  await writeFile(join(root, '.llm'), 'a file where the directory should be')
  const result = await run('peak 不做')
  assert.deepEqual([result.kind, result.text?.startsWith('没写成：')], ['error', true])
  assert.doesNotThrow(() => service.stateForProject(root))
})

rowTest('stateForProject on a project with a damaged snapshot replays the journal in memory and leaves every file byte for byte as it was', async ({ root, service, run }) => {
  await run('peak 不做')
  const dir = join(root, '.llm', 'rules')
  await writeFile(join(dir, 'state.json'), '')
  const bytes = async (): Promise<Record<string, string>> => Object.fromEntries(await Promise.all((await readdir(dir)).sort().map(async file => [file, (await readFile(join(dir, file))).toString('base64')] as const)))
  const before = await bytes()
  assert.deepEqual([service.stateForProject(root)?.level, service.stateForProject(root)?.origin], ['stop', 'human'])
  assert.deepEqual(await bytes(), before)
})

rowTest('a state the service cannot read is unknown, not the factory level, and nothing throws', async ({ runtime, root, service }) => {
  await mkdir(join(root, '.llm', 'rules', 'journal.jsonl'), { recursive: true }) // a directory where the journal should be: reading it fails
  assert.equal(service.stateFor('agent-1'), undefined)
  assert.equal(service.stateForProject(root), undefined)
  assert.equal(service.peakHoldFor('agent-1'), undefined)
  await runtime.create()
  assert.equal(health(runtime).status, 'degraded')
  assert.match(health(runtime).reason, /^读规则板的状态失败：/)
})

rowTest('a file in the repository that someone else changed does not change the level and degrades the row until it is the board\'s again', async ({ root, runtime, service, run }) => {
  await run('peak 不做')
  const rules = join(root, 'docs', 'rules', 'rules.json')
  const mine = await readFile(rules, 'utf8')
  await writeFile(rules, mine.replace('"stop"', '"inform"'))
  assert.equal(service.stateFor('agent-1')?.level, 'stop')
  await runtime.create()
  assert.equal(service.stateFor('agent-1')?.level, 'stop')
  assert.equal(health(runtime).status, 'degraded')
  assert.match(health(runtime).reason, /仓库里的规则文件被规则板以外改过，没有生效（peakMode改了（level））/)
  await writeFile(rules, mine)
  await runtime.create()
  assert.equal(health(runtime).status, 'active')
})

// A recovery that cannot be proven lossless degrades the row in every later session; the slice has no /rules recovery, so the message carries the way out.
for (const [reason, text, damage] of [
  ['snapshot-modified', '存档与变更记录对不上', async (dir: string): Promise<void> => {
    const snapshot = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')) as { peakMode: { level: string } }
    snapshot.peakMode.level = 'stop'
    await writeFile(join(dir, 'state.json'), JSON.stringify(snapshot))
  }],
  ['journal-shorter', '变更记录比存档短', async (dir: string): Promise<void> => {
    const [first] = (await readFile(join(dir, 'journal.jsonl'), 'utf8')).split('\n')
    await writeFile(join(dir, 'journal.jsonl'), `${first}\n`)
  }],
] as const) {
  rowTest(`a ${reason} recovery keeps the row degraded in every session and says how to end it; deleting .llm/rules/ ends it`, async ({ root, runtime, run }) => {
    await run('peak 不做')
    await run('peak 无影响')
    await run('peak 少做')
    const dir = join(root, '.llm', 'rules')
    await damage(dir)
    for (const session of ['the session that finds it', 'the next session']) {
      await runtime.create()
      assert.equal(health(runtime).status, 'degraded', session)
      assert.ok(health(runtime).reason.includes(text), `${session}: ${health(runtime).reason}`)
      assert.ok(health(runtime).reason.includes('这一版还没有处理它的命令；要清掉，删掉 .llm/rules/，规则板会照仓库里的规则文件重新开始'), `${session}: ${health(runtime).reason}`)
    }
    await rm(dir, { recursive: true })
    await runtime.create()
    assert.equal(health(runtime).status, 'active')
    assert.equal(health(runtime).reason.includes('存档'), false)
  })
}

rowTest('a project that has the rules file and no state starts from the file when its first session appears', async ({ root, runtime, service }) => {
  await mkdir(join(root, 'docs', 'rules'), { recursive: true })
  await writeFile(join(root, 'docs', 'rules', 'rules.json'), repoJson({ version: 2, peakMode: { level: 'stop', at: '2026-10-29T01:00:00.000Z', origin: { actor: 'human' } } }))
  await runtime.create()
  const state = service.stateFor('agent-1')
  assert.deepEqual([state?.level, state?.origin, state?.at], ['stop', 'human', '2026-10-29T01:00:00.000Z'])
  const journal = await readFile(join(root, '.llm', 'rules', 'journal.jsonl'), 'utf8')
  assert.equal((JSON.parse(journal) as { op: string }).op, 'base')
})

rowTest('a project that starts from a file with scripts says which scripts nobody has read here, keeps the row active, and the file is not touched', async ({ root, runtime, service }) => {
  await mkdir(join(root, 'docs', 'rules'), { recursive: true })
  const rules = join(root, 'docs', 'rules', 'rules.json')
  await writeFile(rules, repoJson(FULL_RULES_FILE))
  await runtime.create()
  assert.equal(service.stateFor('agent-1')?.level, 'stop')
  assert.equal(health(runtime).status, 'active')
  for (const id of ['r-lint-gate', 'd-server-errors']) assert.match(health(runtime).reason, new RegExp(`${id}.{0,60}没有你看过原文的记录，先不跑`), id)
  assert.equal(health(runtime).reason.includes('r-no-evening-push'), false, 'a rule without a script has nothing to approve')
  assert.equal(await readFile(rules, 'utf8'), repoJson(FULL_RULES_FILE))
})

test('the rules directory can be named by the configuration, relative or absolute', async () => {
  const outside = await mkdtemp(join(tmpdir(), 'rules-dir-'))
  try {
    await withRow(async ({ root, run }) => {
      await run('peak 无影响')
      assert.equal((JSON.parse(await readFile(join(outside, 'rules.json'), 'utf8')) as { peakMode: { level: string } }).peakMode.level, 'inform')
      await assert.rejects(readFile(join(root, 'docs', 'rules', 'rules.json')), { code: 'ENOENT' })
    }, { config: { dir: outside } })
    await withRow(async ({ root, run }) => {
      await run('peak 无影响')
      assert.equal((JSON.parse(await readFile(join(root, 'policy', 'rules.json'), 'utf8')) as { peakMode: { level: string } }).peakMode.level, 'inform')
    }, { config: { dir: 'policy' } })
  }
  finally {
    await rm(outside, { recursive: true, force: true })
  }
})

test('activation never throws: a command that cannot register, a service that cannot be provided, a host without events and a bad configuration each leave the row working as far as it can, and say why', async () => {
  const { warnings } = await captureWarnings(async () => {
    await withRow(({ runtime, service }) => {
      assert.ok(runtime.services.has(PEAK_MODE_SERVICE), 'the service is provided without the command')
      assert.equal(service.stateFor('agent-1'), undefined)
      assert.equal(health(runtime).status, 'degraded')
      assert.match(health(runtime).reason, /\/rules 注册失败，档位改不了：taken/)
      return Promise.resolve()
    }, { breakCommands: true })

    // A second rules row on one host: the service name is taken, and its own health is not provided either.
    const twice = fakeRuntime({ natives: [] })
    const ctx = { ...twice.ctx, commands: { register: () => () => {} } } as unknown as RulesContext
    const first = apply(ctx, {})
    const second = apply(ctx, {})
    void first()
    void second()

    // A host that cannot provide anything.
    const lone = fakeRuntime({ natives: [] })
    void apply({ commands: { register: () => () => {} }, on: (...args: unknown[]) => (lone.ctx.on as (...inner: unknown[]) => () => void)(...args), get: (key: string) => lone.ctx.get?.(key) } as unknown as RulesContext, {})()

    // A host whose event registration throws: the gate is not installed, so the row executes no rule and says so.
    const noEvents = fakeRuntime({ natives: [] })
    const stop = apply({ ...noEvents.ctx, commands: { register: () => () => {} }, on: () => { throw new Error('no events') } }, {})
    const view = collectHealth(noEvents.ctx, undefined).find(entry => entry.row === 'rules')
    assert.equal(view?.status, 'inactive')
    assert.ok(view?.reason.includes('会话事件没注册上：no events'), view?.reason)
    assert.ok(view?.reason.includes('工具调用的门没装上，这一行不执行任何规则：no events'), view?.reason)
    void stop()

    // A configuration that is not a path: nothing registers.
    const badDir = fakeRuntime({ natives: [] })
    const never = apply({ ...badDir.ctx, commands: { register: () => { throw new Error('must not register') } } } as unknown as RulesContext, { dir: '  ' })
    assert.equal(collectHealth(badDir.ctx, undefined).find(entry => entry.row === 'rules')?.status, 'inactive')
    assert.equal(badDir.services.has(PEAK_MODE_SERVICE), false)
    void never()
  })
  const ours = warnings.filter(warning => warning.startsWith('dsh-glm-hourness/rules: '))
  assert.equal(ours.length, 9, ours.join(' | '))
  for (const expected of [
    /registering \/rules failed, the level cannot be changed: taken/,
    /row health not provided/,
    /glmHournessPeakMode is not provided/,
    new RegExp(`${RULES_SERVICE} is not provided`),
    /row status not provided/,
    /registering rules_show failed/,
    /the session listeners are not registered/,
    /the tool-call gate is not installed, the row executes no rule: no events/,
    /config\.dir must be a non-empty path/,
  ]) {
    assert.ok(ours.some(warning => expected.test(warning)), `${String(expected)} in ${ours.join(' | ')}`)
  }
})

test('the row ships disabled in the orchestration patch, is exported, and has its locale files', async () => {
  const patch = await readFile(new URL('../packages/hourness/cordis.patch.yml', import.meta.url), 'utf8')
  const start = patch.indexOf('    - id: glm-hourness/rules')
  assert.ok(start >= 0)
  const next = patch.indexOf('\n    - id:', start + 1)
  const block = patch.slice(start, next < 0 ? undefined : next)
  assert.match(block, /^ {6}name: dsh-hourness\/rules$/m)
  assert.match(block, /^ {6}disabled: true$/m)
  assert.match(block, /^ {6}inject: \[tools, commands\]$/m)
  const manifest = JSON.parse(await readFile(new URL('../packages/hourness/package.json', import.meta.url), 'utf8')) as { exports: Record<string, string> }
  assert.equal(manifest.exports['./rules'], './dist/rules/index.js')
  assert.equal(manifest.exports['./rules/locale/*.json'], './locale/rules/*.json')
  for (const language of ['en', 'zh']) {
    const locale = JSON.parse(await readFile(new URL(`../packages/hourness/locale/rules/${language}.json`, import.meta.url), 'utf8')) as { meta: { title: string, description: string } }
    assert.ok(locale.meta.title.length > 0 && locale.meta.description.length > 0, language)
  }
})

// ----------------------------------------------------- the subcommands of /rules

/** What the commands act on: two rules, a switch and an enum signal. */
const COMMAND_FILE: RepoRules = {
  version: 2,
  rules: {
    'r-x': ruleOf({ id: 'r-x', title: 'No x' }),
    'r-y': ruleOf({ id: 'r-y', title: 'No y' }),
  },
  signals: {
    'code-freeze': { type: { kind: 'boolean' } },
    phase: { type: { kind: 'enum', values: ['day', 'night'] } },
  },
}

/** The records of the project's journal, oldest first. */
async function journalOf(root: string): Promise<JournalRecord[]> {
  const text = await readFile(join(root, '.llm', 'rules', 'journal.jsonl'), 'utf8').catch(() => '')
  return text.split('\n').filter(line => line !== '').map(line => JSON.parse(line) as JournalRecord)
}

/** The last record of the journal after `input` has been typed, as [actor, op, target]. */
async function wroteAfter(fixture: Fixture, input: string): Promise<{ readonly result: Awaited<ReturnType<Fixture['run']>>, readonly record: readonly [string | undefined, string | undefined, string | undefined], readonly count: number }> {
  const before = (await journalOf(fixture.root)).length
  const result = await fixture.run(input)
  const records = await journalOf(fixture.root)
  const last = records.at(-1)
  return { result, record: [last?.actor, last?.op, last?.target], count: records.length - before }
}

rowTest('every subcommand that changes something writes its operation as the human, and says in one line what it did', async (fixture) => {
  const cases: ReadonlyArray<readonly [input: string, op: string, target: string | undefined, reply: RegExp]> = [
    ['lift r-x', 'rule-lift', 'r-x', /^规则 r-x 已解除/],
    ['delete r-y', 'rule-delete', 'r-y', /^规则 r-y 已删除/],
    ['on code-freeze', 'signal-manual', 'code-freeze', /^开关 code-freeze 已打开/],
    ['off code-freeze', 'signal-manual', 'code-freeze', /^开关 code-freeze 已关上/],
    ['on code-freeze 2h', 'signal-manual', 'code-freeze', /^开关 code-freeze 已打开（2h 后失效）/],
    ['set phase night', 'signal-manual', 'phase', /^信号 phase 的值设成了 night/],
    ['clear phase', 'signal-clear', 'phase', /^信号 phase 的手设值清掉了/],
    ['delete code-freeze', 'signal-delete', 'code-freeze', /^开关 code-freeze 已删除/],
    ['peak 无影响', 'peak-mode-set', 'peakMode', /^高峰模式改成了「无影响」/],
  ]
  for (const [input, op, target, reply] of cases) {
    const { result, record, count } = await wroteAfter(fixture, input)
    assert.equal(result.kind, 'success', `${input}: ${result.text}`)
    assert.match(result.text ?? '', reply, input)
    assert.equal(count >= 1, true, `${input}: a record`)
    assert.deepEqual(record, ['human', op, target], input)
  }
  const manual = (await journalOf(fixture.root)).filter(record => record.op === 'signal-manual')
  assert.equal(manual.length, 4)
  const state = loadState(openRulesBoard({ projectRoot: fixture.root }).paths).state
  assert.equal(state.rules?.['r-x']?.status, 'lifted')
  assert.equal(state.rules?.['r-y'], undefined)
}, { rules: COMMAND_FILE })

rowTest('a value is true, false, a number or a word, and a duration is a number of minutes, hours or days at most seven', async (fixture) => {
  const board = openRulesBoard({ projectRoot: fixture.root, io: quickIo() })
  const valueOf = (name: string): unknown => loadState(board.paths).state.signals?.[name]?.manual?.value
  assert.equal((await fixture.run('set phase day')).kind, 'success')
  assert.equal(valueOf('phase'), 'day')
  assert.equal((await fixture.run('set code-freeze true')).kind, 'success')
  assert.equal(valueOf('code-freeze'), true)
  const timed = await fixture.run('set code-freeze false 30m')
  assert.equal(timed.kind, 'success')
  const manual = loadState(board.paths).state.signals?.['code-freeze']?.manual
  assert.equal(manual?.value, false)
  assert.ok(manual?.expiresAt !== undefined && Date.parse(manual.expiresAt) - Date.parse(manual.at) === 30 * 60_000, 'thirty minutes after it was set')
  for (const bad of ['on code-freeze 8d', 'on code-freeze soon', 'on code-freeze 0m', 'on code-freeze 2x']) {
    const refused = await fixture.run(bad)
    assert.deepEqual([bad, refused.kind, refused.text?.includes('时长')], [bad, 'error', true])
  }
}, { rules: COMMAND_FILE })

rowTest('a subcommand the board refuses answers one line that says what is so, and writes nothing', async (fixture) => {
  await fixture.run('lift r-x')
  const before = (await journalOf(fixture.root)).length
  const refusals: ReadonlyArray<readonly [string, RegExp]> = [
    ['lift r-x', /r-x 不在生效，不用解除/],
    ['lift r-nope', /没有 r-nope 这条规则/],
    ['delete r-nope', /没有 r-nope 这条规则/],
    ['delete builtin:glm-peak-pricing', /builtin:glm-peak-pricing 是写在代码里的规则/],
    ['lift builtin:glm-peak-pricing', /写在代码里/],
    ['on nope', /没有 nope 这个信号/],
    ['set phase noon', /phase/],
    ['clear phase', /没有手设的值/],
    ['delete nope', /没有 nope 这个信号/],
    ['let q-9', /没有 q-9 这张单/],
    ['cancel q-9', /没有 q-9 这张单/],
    ['recovery 9-9 照改', /没有编号 9-9 的记录/],
    ['recovery 9-9 忽略', /没有编号 9-9 的记录/],
  ]
  for (const [input, reason] of refusals) {
    const result = await fixture.run(input)
    assert.equal(result.kind, 'error', input)
    assert.match(result.text ?? '', reason, input)
    assert.equal((result.text ?? '').includes('\n'), false, `${input}: one line`)
  }
  assert.equal((await journalOf(fixture.root)).length, before, 'nothing was written')
}, { rules: COMMAND_FILE })

rowTest('let and cancel act on a waiting call', async (fixture) => {
  const board = openRulesBoard({ projectRoot: fixture.root, io: quickIo() })
  const host = { pid: 1, startedAt: 1 }
  await writeHeartbeat(board.paths, host, new Date().toISOString())
  for (const signature of ['one', 'two']) {
    const opened = await board.apply('harness', { op: 'ticket-open', sessionId: 'agent-1', agentLabel: 'main', host, signature, tool: 'pwsh', summary: `npm run ${signature}`, rules: ['r-x'] })
    assert.ok(opened.ok, JSON.stringify(opened))
  }
  const letOnce = await wroteAfter(fixture, 'let q-1')
  assert.equal(letOnce.result.kind, 'success', letOnce.result.text)
  assert.match(letOnce.result.text ?? '', /^q-1 放行这一次/)
  assert.deepEqual(letOnce.record, ['human', 'ticket-let-once', 'q-1'])
  const cancel = await wroteAfter(fixture, 'cancel q-2')
  assert.equal(cancel.result.kind, 'success', cancel.result.text)
  assert.match(cancel.result.text ?? '', /^q-2 已取消/)
  assert.deepEqual(cancel.record, ['human', 'ticket-cancel', 'q-2'])
  assert.match((await fixture.run('cancel q-2')).text ?? '', /q-2 已经关了，不用取消/)
}, { rules: COMMAND_FILE })

/** Lines no engine wrote, as an outside writer leaves them; the row's settling lists them under the labels the person types. */
async function forgeLines(fixture: Fixture): Promise<string[]> {
  const notice = { kind: 'late-block', rule: 'r-x', text: 'forged', at: '2026-10-28T06:00:00.000Z' }
  const lines = ['n-1', 'n-2'].map(key => JSON.stringify({ at: '2026-10-28T06:00:00.000Z', actor: 'harness', op: 'notice-add', changes: [{ path: ['notices', key], value: notice }] }))
  for (const line of lines) await appendFile(join(fixture.root, '.llm', 'rules', 'journal.jsonl'), `${line}\n`)
  await fixture.runtime.create()
  return Object.values(loadState(openRulesBoard({ projectRoot: fixture.root }).paths).state.unresolved ?? {}).map(entry => entry.label).sort()
}

rowTest('recovery takes the numbers the health line names: 照改 makes the line the state\'s, 忽略 only clears it', async (fixture) => {
  await fixture.runtime.create()
  const labels = await forgeLines(fixture)
  assert.equal(labels.length, 2)
  assert.equal(health(fixture.runtime).status, 'degraded')
  assert.ok(health(fixture.runtime).reason.includes(`/rules recovery ${labels[0]} 照改`), health(fixture.runtime).reason)
  assert.ok(health(fixture.runtime).reason.includes(`/rules recovery ${labels[0]} 忽略`), health(fixture.runtime).reason)
  assert.equal(health(fixture.runtime).reason.includes('这一版还没有处理'), false)
  const accepted = await wroteAfter(fixture, `recovery ${labels[0]} 照改`)
  assert.equal(accepted.result.kind, 'success', accepted.result.text)
  assert.match(accepted.result.text ?? '', new RegExp(`^已照改 ${labels[0]}`))
  assert.deepEqual(accepted.record, ['human', 'recovery-accept', labels[0]])
  const dismissed = await wroteAfter(fixture, `recovery ${labels[1]} dismiss`)
  assert.equal(dismissed.result.kind, 'success', dismissed.result.text)
  assert.match(dismissed.result.text ?? '', new RegExp(`^已忽略 ${labels[1]}`))
  assert.deepEqual(dismissed.record, ['human', 'recovery-dismiss', labels[1]])
  await fixture.runtime.create()
  assert.equal(health(fixture.runtime).status, 'active')
}, { rules: COMMAND_FILE })

rowTest('recovery 文件 照改 makes a rules file somebody else changed the state\'s, and 忽略 writes the board\'s own back', async (fixture) => {
  const rules = join(fixture.root, 'docs', 'rules', 'rules.json')
  await fixture.runtime.create()
  const mine = await readFile(rules, 'utf8')
  await writeFile(rules, mine.replace('No x', 'No x, by hand'))
  await fixture.runtime.create()
  assert.match(health(fixture.runtime).reason, /仓库里的规则文件被规则板以外改过/)
  const adopted = await wroteAfter(fixture, 'recovery 文件 照改')
  assert.equal(adopted.result.kind, 'success', adopted.result.text)
  assert.deepEqual(adopted.record, ['human', 'repo-adopt', 'rules.json'])
  assert.equal(loadState(openRulesBoard({ projectRoot: fixture.root }).paths).state.rules?.['r-x']?.title, 'No x, by hand')
  assert.match((await fixture.run('recovery file 照改')).text ?? '', /没有被规则板以外改过，不用处理/)
  await writeFile(rules, mine.replace('No y', 'No y, by hand'))
  await fixture.runtime.create()
  const restored = await wroteAfter(fixture, 'recovery 文件 忽略')
  assert.equal(restored.result.kind, 'success', restored.result.text)
  assert.deepEqual(restored.record, ['human', 'repo-restore', 'rules.json'])
  const back = await readFile(rules, 'utf8')
  assert.ok(back.includes('No x, by hand') && !back.includes('No y, by hand'), 'the board\'s own file is back')
}, { rules: COMMAND_FILE })

rowTest('show tells the person what rules_show tells an agent, in Chinese: the level, the rules in force, what is waiting and the signals', async (fixture) => {
  await fixture.run('on code-freeze')
  const result = await fixture.run('show')
  assert.equal(result.kind, 'success')
  const text = result.text ?? ''
  assert.match(text, /^规则板 · rules-row-\w+/)
  assert.ok(text.includes('高峰模式：少做（出厂默认）'), text)
  for (const line of ['- r-x「No x」：拦下', '- r-y「No y」：拦下', '- builtin:glm-peak-pricing', '- code-freeze：开（手设）']) assert.ok(text.includes(line), `${line}\n${text}`)
  assert.ok(text.includes('在等的工作：没有'), text)
  assert.equal((await journalOf(fixture.root)).filter(record => record.op === 'signal-manual').length, 1, 'looking wrote no operation')
}, { rules: COMMAND_FILE })

// ------------------------------------------------------------- the heartbeat

const HOURS = 60 * MINUTE
const hostsDir = (root: string): string => join(root, '.llm', 'rules', 'hosts')

/** The heartbeat files of the project's host directory, by file name. */
async function heartbeatsOf(root: string): Promise<Record<string, HostHeartbeat>> {
  const names = await readdir(hostsDir(root)).catch(() => [] as string[])
  const files = await Promise.all(names.filter(entry => entry.endsWith('.json')).map(async entry => [entry, JSON.parse(await readFile(join(hostsDir(root), entry), 'utf8')) as HostHeartbeat] as const))
  return Object.fromEntries(files)
}

const STARTED = fakeClock('2026-10-28T07:00:00.000Z')
const catalogOf = (beat: HostHeartbeat, id: string): Record<string, unknown> | undefined => beat.catalog.find(entry => entry.id === id)

rowTest('a live session makes the host write its heartbeat: the sessions, the GLM peak it computed, the state of the rows the catalog names, and runner false', async ({ root, runtime }) => {
  assert.deepEqual(await heartbeatsOf(root), {}, 'no live session yet: no file')
  await runtime.create()
  const found = await heartbeatsOf(root)
  const [[name, beat]] = Object.entries(found)
  assert.equal(Object.keys(found).length, 1)
  assert.match(name, new RegExp(`^${process.pid}-\\d+\\.json$`))
  assert.deepEqual(beat.host, { pid: process.pid, startedAt: Number(name.slice(name.indexOf('-') + 1, -5)) })
  assert.equal(beat.at, new Date(NOW).toISOString())
  assert.deepEqual(beat.sessions, ['agent-1'])
  assert.equal(beat.runner, false, 'the election is not built: no host is the runner')
  assert.deepEqual(beat.computed, { glmPeak: { value: true, nextChangeAt: PEAK_END } })
  assert.deepEqual(catalogOf(beat, 'rules:files-only'), { id: 'rules:files-only', state: 'active' }, 'a row reads by its activation')
  assert.deepEqual(catalogOf(beat, 'guard:workspace-containment'), { id: 'guard:workspace-containment', state: 'absent' }, 'a row that is not loaded is absent')
  assert.deepEqual(catalogOf(beat, 'builtin:glm-peak-pricing'), { id: 'builtin:glm-peak-pricing', state: 'active', toldState: 'degraded' }, 'the row that tells the model is read too')
}, { services: { 'glmHournessHealth/glm-prompt': { row: 'glm-prompt', activation: () => ({ state: 'degraded', reason: 'test', at: '' }), session: () => undefined } } })

rowTest('a GLM peak that cannot be read is written as unreadable, with the reason', async ({ root, runtime }) => {
  await runtime.create()
  const [beat] = Object.values(await heartbeatsOf(root))
  const peak = beat?.computed.glmPeak
  assert.ok(peak !== undefined && 'unknown' in peak && typeof peak.unknown === 'string' && !('value' in peak))
}, { pricing: 'none' })

rowTest('the heartbeat is written again on the 15-second timer with the moment of that write, and the sessions it holds follow agent/created and session/disposed', async ({ root, runtime, beat }) => {
  await runtime.create()
  await beat()
  const [first] = Object.values(await heartbeatsOf(root))
  assert.equal(first?.at, STARTED.iso())
  STARTED.advance(15_000)
  await beat()
  const [second] = Object.values(await heartbeatsOf(root))
  assert.equal(second?.at, STARTED.iso())
}, { clock: STARTED })

test('the heartbeat of a host is deleted after 60 seconds without a live session, and a heartbeat of any host older than an hour is removed with the next write', async () => {
  const clock = fakeClock('2026-10-28T07:00:00.000Z')
  await withRow(async ({ root, runtime, beat }) => {
    await runtime.create()
    const other = join(hostsDir(root), '99999-1.json')
    const recent = join(hostsDir(root), '99998-1.json')
    const stale = (at: string): string => JSON.stringify({ host: { pid: 99999, startedAt: 1 }, at, sessions: [], runner: false, computed: { glmPeak: { unknown: 'x' } }, catalog: [] })
    await writeFile(other, stale(new Date(clock.now() - 2 * HOURS).toISOString()))
    await writeFile(recent, stale(new Date(clock.now() - 10 * MINUTE).toISOString()))
    await beat()
    assert.deepEqual(Object.keys(await heartbeatsOf(root)).sort(), ['99998-1.json', ...Object.keys(await heartbeatsOf(root)).filter(entry => entry.startsWith(`${process.pid}-`))].sort(), 'the hour-old file of another host is gone, the 10-minute-old one stays')
    runtime.disposeSession(runtime.agent.session!)
    clock.advance(45_000)
    await beat()
    assert.equal(Object.keys(await heartbeatsOf(root)).filter(entry => entry.startsWith(`${process.pid}-`)).length, 1, 'less than 60 seconds without a session: the file stays')
    clock.advance(20_000)
    await beat()
    assert.deepEqual(Object.keys(await heartbeatsOf(root)).filter(entry => entry.startsWith(`${process.pid}-`)), [], 'more than 60 seconds: deleted')
  }, { clock })
})

test('a rename that fails with EPERM is retried with the board\'s backoff, then given up with one warning until a write succeeds; the temporary file is removed', async () => {
  const clock = fakeClock('2026-10-28T07:00:00.000Z')
  const sleeps: number[] = []
  let failing = true
  const io = quickIo({
    now: clock.now,
    sleep: (ms) => { sleeps.push(ms); return Promise.resolve() },
    rename: (from, to) => (failing && to.includes('hosts') ? Promise.reject(Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })) : renameFile(from, to)),
  })
  await withRow(async ({ root, runtime, beat }) => {
    const { warnings } = await captureWarnings(async () => {
      await runtime.create()
      await beat()
      await beat()
    })
    assert.deepEqual(await heartbeatsOf(root), {}, 'nothing was written')
    assert.deepEqual(sleeps.slice(0, 5), [20, 40, 80, 160, 320], 'the backoff of the snapshot')
    assert.deepEqual((await readdir(hostsDir(root))).filter(entry => entry.endsWith('.tmp')), [], 'no temporary file is left')
    assert.equal(warnings.filter(line => /heartbeat/.test(line)).length, 1, 'warned once, not at every attempt')
    failing = false
    await beat()
    assert.equal(Object.keys(await heartbeatsOf(root)).length, 1, 'the next period writes it')
    failing = true
    const again = await captureWarnings(() => beat())
    assert.equal(again.warnings.filter(line => /heartbeat/.test(line)).length, 1, 'after a success the warning is owed again')
  }, { clock, config: { io } })
})

rowTest('a session outside any project has no heartbeat, and a project the host does not live in has no host directory', async ({ root, runtime }) => {
  await runtime.create()
  assert.deepEqual(await heartbeatsOf(root), {})
}, { cwd: null })

rowTest('the row withdraws its timers, its listeners and its heartbeat file when it goes', async ({ root, runtime, dispose, timers }) => {
  await runtime.create()
  assert.equal(timers() > 0, true)
  assert.equal(Object.keys(await heartbeatsOf(root)).length, 1)
  await dispose()
  assert.equal(timers(), 0)
  assert.deepEqual(runtime.listeners.map(entry => entry.event), [])
  assert.deepEqual(await heartbeatsOf(root), {})
})

// --------------------------------------------------------------- the reminder

const INFORM_FRIDAY = ruleOf({ id: 'r-friday', title: 'No release on Fridays', when: { kind: 'event', events: ['rules.step'] }, action: { kind: 'inform' } })
const BLOCK_PROBE = ruleOf({ id: 'r-no-probe', title: 'No probe word', filter: { command: { matches: 'rules-probe-blocked' } } })
const RECORD_NPM = ruleOf({ id: 'r-note-npm', title: 'Note npm runs', filter: { command: { matches: '^npm\\b' } }, action: { kind: 'record' } })
const HOLD_DEPLOY = ruleOf({ id: 'r-hold', title: 'Hold deploys', filter: { command: { matches: 'deploy' } }, action: { kind: 'queue' } })
const reminderFile = (...rules: Array<ReturnType<typeof ruleOf>>): RepoRules => ({ version: 2, rules: Object.fromEntries(rules.map(rule => [rule.id, rule])) })

/** One step of the agent: the notices of the board among what the step admitted; the step's input is what rc.3 keeps in the history. */
async function stepOf(fixture: Fixture, over: { readonly messages?: readonly unknown[] } = {}): Promise<UserNotice[]> {
  const decision = await fixture.runtime.preStep({ messages: over.messages ?? [], step: 2 })
  assert.equal(decision.kind, 'enter')
  const admitted = (decision as { messages: readonly unknown[] }).messages
  fixture.runtime.history.push(...admitted)
  const notices = admitted.filter((message): message is UserNotice => (message as UserNotice).source?.kind === 'hourness-rules')
  if (notices.length > 0) assert.equal(admitted.at(-1), notices.at(-1), 'a notice goes at the end of the step\'s input')
  return notices
}
const bodyOf = (notice: UserNotice | undefined): string => notice?.content[0]?.text ?? ''

rowTest('the reminder lists the rules that only inform and nothing the harness carries out; the default rule is never in it', async (fixture) => {
  await fixture.runtime.create()
  const [notice, ...rest] = await stepOf(fixture)
  assert.equal(rest.length, 0)
  assert.equal(bodyOf(notice), '<system-reminder>\nRules board: for your information only; the harness does not check these.\n- [inform, not checked] r-friday: "No release on Fridays" (set by the human)\n</system-reminder>')
  assert.match(String(notice?.source.rulesReminder && (notice.source.rulesReminder as { digest: string }).digest), /^[0-9a-f]{12}$/)
  assert.doesNotMatch(bodyOf(notice), /r-no-probe|r-note-npm|r-hold|glm-peak-pricing/)
}, { rules: reminderFile(INFORM_FRIDAY, BLOCK_PROBE, RECORD_NPM, HOLD_DEPLOY) })

rowTest('a project with no rule that informs and no ticket gets no reminder, and the default rule at a peak does not make one', async (fixture) => {
  await fixture.runtime.create()
  assert.deepEqual(await stepOf(fixture), [])
  assert.deepEqual(await stepOf(fixture), [])
}, { rules: reminderFile(BLOCK_PROBE) })

rowTest('the reminder is injected when it changes, once, and when nothing is left once with a line that says so', async (fixture) => {
  await fixture.runtime.create()
  assert.equal((await stepOf(fixture)).length, 1)
  assert.deepEqual(await stepOf(fixture), [], 'nothing changed, the request prefix stays the same')
  assert.deepEqual(await stepOf(fixture), [])
  assert.equal((await fixture.run('lift r-friday')).kind, 'success')
  const [gone, ...rest] = await stepOf(fixture)
  assert.equal(rest.length, 0)
  assert.equal(bodyOf(gone), '<system-reminder>\nNo rules board item applies to you now.\n</system-reminder>')
  assert.deepEqual(await stepOf(fixture), [], 'told once')
}, { rules: reminderFile(INFORM_FRIDAY) })

rowTest('the reminder is injected again after a compaction took the earlier one out of what the model sees, and once per checkpoint', async (fixture) => {
  await fixture.runtime.create()
  assert.equal((await stepOf(fixture)).length, 1)
  fixture.runtime.history.splice(0, fixture.runtime.history.length, { role: 'user', content: [{ type: 'text', text: 'summary' }], source: { kind: 'compact-checkpoint', compactionId: 'c-1' } })
  const [again] = await stepOf(fixture)
  assert.equal((again?.source.rulesReminder as { reason: string }).reason, 'compaction')
  assert.deepEqual(await stepOf(fixture), [], 'the checkpoint is answered once')
  fixture.runtime.history.splice(0, fixture.runtime.history.length, { role: 'user', content: [{ type: 'text', text: 'summary' }], source: { kind: 'compact-checkpoint', compactionId: 'c-2' } })
  assert.equal((await stepOf(fixture)).length, 1, 'another checkpoint, another reminder')
}, { rules: reminderFile(INFORM_FRIDAY) })

rowTest('a goal round carries the reminder again, one beat of the goal driver', async (fixture) => {
  await fixture.runtime.create()
  assert.equal((await stepOf(fixture)).length, 1)
  assert.deepEqual(await stepOf(fixture), [])
  const round = { id: 'g-1', role: 'user', content: [{ type: 'text', text: 'Round: 2/3' }], source: { kind: 'goal', round: 2 } }
  const [notice] = await stepOf(fixture, { messages: [round] })
  assert.equal((notice?.source.rulesReminder as { reason: string }).reason, 'goal-round')
}, { rules: reminderFile(INFORM_FRIDAY) })

rowTest('a rule that asks about a role or a model other than the agent\'s is not in its reminder', async (fixture) => {
  await fixture.runtime.create()
  assert.deepEqual(await stepOf(fixture), [], 'the main agent has nothing to be told')
}, { rules: reminderFile(ruleOf({ id: 'r-subagents', title: 'Subagents only', when: { kind: 'event', events: ['rules.step'] }, filter: { role: { in: ['subagent'] } }, action: { kind: 'inform' } })) })

test('the reminder names the agent\'s own open tickets with the time, and what it should do about a ticket handed over from a subagent; the tickets of others are not in it', async () => {
  const clock = fakeClock('2026-10-28T07:00:00.000Z')
  await withRow(async (fixture) => {
    await fixture.runtime.create()
    await fixture.exec('pwsh', { command: 'npm run deploy' })
    const [first] = await stepOf(fixture)
    assert.match(bodyOf(first), /\nYour open tickets: q-1 pwsh "npm run deploy" \(deferred since \d\d:\d\d\)\.\n<\/system-reminder>$/)
    assert.doesNotMatch(bodyOf(first), /Do not dispatch/)
    // A ticket of another session is not this agent's.
    const other = openRulesBoard({ projectRoot: fixture.root, io: quickIo({ now: clock.now }) })
    const opened = await other.apply('harness', { op: 'ticket-open', sessionId: 'sub-9', agentLabel: 'sub-9', host: { pid: process.pid, startedAt: 1 }, signature: 'abc', tool: 'pwsh', summary: 'npm test', rules: ['r-hold'] })
    assert.ok(opened.ok)
    assert.deepEqual(await stepOf(fixture), [], 'the other session\'s ticket changes nothing for this agent')
    const handed = await other.apply('harness', { op: 'ticket-handover', id: 'q-2', sessionId: 'agent-1', agentLabel: 'agent-1' })
    assert.ok(handed.ok)
    const [second] = await stepOf(fixture)
    assert.match(bodyOf(second), /q-2 handed over from subagent "sub-9": pwsh "npm test"/)
    assert.match(bodyOf(second), /Do not dispatch these tasks again before their tickets clear\./)
  }, { clock, live: true, rules: reminderFile(HOLD_DEPLOY) })
})

test('a ticket that cleared is told as cleared, and one that closed is gone from the reminder', async () => {
  const clock = fakeClock('2026-10-28T07:00:00.000Z')
  const rules: RepoRules = { ...reminderFile(ruleOf({ ...HOLD_DEPLOY, condition: { signal: 'code-freeze', is: true } })), signals: { 'code-freeze': { type: { kind: 'boolean' }, manual: { value: true, at: '2026-10-28T06:40:00.000Z' } } } }
  await withRow(async (fixture) => {
    await fixture.runtime.create()
    await fixture.exec('pwsh', { command: 'npm run deploy' })
    assert.equal((await stepOf(fixture)).length, 1)
    await fixture.run('off code-freeze')
    const [cleared] = await stepOf(fixture)
    assert.match(bodyOf(cleared), /Your open tickets: q-1 pwsh "npm run deploy" \(cleared at \d\d:\d\d, run it again\)\./)
    assert.equal((await fixture.exec('pwsh', { command: 'npm run deploy' })).isError, false)
    const [gone] = await stepOf(fixture)
    assert.equal(bodyOf(gone), '<system-reminder>\nNo rules board item applies to you now.\n</system-reminder>')
  }, { clock, live: true, rules })
})

rowTest('at most 12 items: the rest is counted and rules_show is named', async (fixture) => {
  await fixture.runtime.create()
  const [notice] = await stepOf(fixture)
  const lines = bodyOf(notice).split('\n')
  assert.equal(lines.filter(line => line.startsWith('- [inform')).length, 12)
  assert.equal(lines.at(-2), 'and 3 more: call rules_show')
}, { rules: reminderFile(...Array.from({ length: 15 }, (_, index) => ruleOf({ id: `r-note-${String(index).padStart(2, '0')}`, title: `Note ${index}`, when: { kind: 'event', events: ['rules.step'] }, action: { kind: 'inform' } }))) })

rowTest('an agent created twice gets one reminder, not two', async (fixture) => {
  await fixture.runtime.create()
  await fixture.runtime.create()
  assert.equal((await stepOf(fixture)).length, 1)
}, { rules: reminderFile(INFORM_FRIDAY) })

// ------------------------------------------------------ the main agent's peak line

const MAIN_AGENT = { sessionProjections: { stateOf: (_session: unknown, key: string) => (key === MAIN_AGENT_KEY ? { active: true } : undefined) } }
/** `HH:MM` on the wall clock of this machine, by another route than the code takes (the Swedish format is year-first and 24-hour). */
const clockHm = (iso: string): string => new Date(iso).toLocaleString('sv-SE').slice(11, 16)
const END = clockHm(PEAK_END)
const NEXT = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(NEXT_PEAK).getDay()]} ${clockHm(NEXT_PEAK)}`
const DEFAULT_MODE = 'Peak mode: reduce (the default; the human can change it)'
const REDUCE_WORDS = (until: string): string => `Run at most 1 GLM subagent at a time until ${until}. Move optional work that spends many GLM credits (calibration runs, ablations, large reviews) to after ${until}, including work you dispatch; keep necessary work going.`
const STOP_WORDS = `You keep working and answering the human; until ${END} no GLM subagents and no scripts that report GLM spending: such dispatches and scripts are deferred and you are told when they can run.`
const reminderOf = (...lines: string[]): string => `<system-reminder>\n${lines.join('\n')}\n</system-reminder>`
const SILENT_PRICING = { basis: 'test', plan: 'test', charged: () => undefined, peak: () => { throw new Error('boom') } }

rowTest('the main agent\'s reminder starts with a line about the peak and the level, in the words of the level and of where it came from', async (fixture) => {
  await fixture.runtime.create()
  assert.equal(bodyOf((await stepOf(fixture))[0]), reminderOf(`GLM peak: now until ${END}. ${DEFAULT_MODE}. ${REDUCE_WORDS(END)}`))
  await fixture.run('peak 无影响')
  assert.equal(bodyOf((await stepOf(fixture))[0]), reminderOf(`GLM peak: now until ${END}. Peak mode set by the human: inform (no change to your work).`))
  await fixture.run('peak 不做')
  assert.equal(bodyOf((await stepOf(fixture))[0]), reminderOf(`GLM peak: now until ${END}. Peak mode set by the human: stop. ${STOP_WORDS}`))
  await fixture.run('peak 少做')
  assert.equal(bodyOf((await stepOf(fixture))[0]), reminderOf(`GLM peak: now until ${END}. Peak mode set by the human: reduce. ${REDUCE_WORDS(END)}`), 'chosen again, it is the human\'s now')
}, { services: MAIN_AGENT, rules: { version: 2 } })

rowTest('out of a peak the line says when the next one is, and what may run now', async (fixture) => {
  await fixture.runtime.create()
  assert.equal(bodyOf((await stepOf(fixture))[0]), reminderOf(`GLM peak: not now (next ${NEXT}). ${DEFAULT_MODE}. Work moved out of peak can run now.`))
  await fixture.run('peak 无影响')
  assert.equal(bodyOf((await stepOf(fixture))[0]), reminderOf(`GLM peak: not now (next ${NEXT}). Peak mode set by the human: inform (no change to your work).`))
  await fixture.run('peak 不做')
  assert.equal(bodyOf((await stepOf(fixture))[0]), reminderOf(`GLM peak: not now (next ${NEXT}). Peak mode set by the human: stop. GLM subagents and scripts that report GLM spending can run now.`))
}, { services: MAIN_AGENT, rules: { version: 2 }, now: OFF_PEAK })

rowTest('when the peak cannot be read the line says so with the reason, and that the level does not apply', async (fixture) => {
  await fixture.runtime.create()
  assert.equal(bodyOf((await stepOf(fixture))[0]), reminderOf(`GLM peak: unknown (the pricing service failed: boom). ${DEFAULT_MODE}; it does not apply while peak is unknown.`))
}, { services: MAIN_AGENT, rules: { version: 2 }, pricing: SILENT_PRICING })

test('the line is injected when the peak starts, when it ends and when the level changes, and not again within a peak', async () => {
  const clock = fakeClock('2026-10-28T05:30:00.000Z')
  await withRow(async (fixture) => {
    await fixture.runtime.create()
    const lines: string[] = []
    const step = async (): Promise<void> => {
      const [notice] = await stepOf(fixture)
      if (notice !== undefined) lines.push(bodyOf(notice).split('\n')[1] ?? '')
    }
    await step()
    await step()
    clock.advance(31 * MINUTE)
    await step()
    await step()
    clock.advance(2 * 3_600_000)
    await step()
    await fixture.run('peak 不做')
    await step()
    await step()
    clock.advance(2 * 3_600_000)
    await step()
    assert.deepEqual(lines.map(line => line.slice(0, line.indexOf('Peak mode') - 1)), [
      `GLM peak: not now (next ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date('2026-10-28T06:00:00.000Z').getDay()]} ${clockHm('2026-10-28T06:00:00.000Z')}).`,
      `GLM peak: now until ${END}.`,
      `GLM peak: now until ${END}.`,
      `GLM peak: not now (next ${NEXT}).`,
    ], 'the first step, the start of the peak, the level changed in it, and its end: one line each')
    assert.match(lines[2] ?? '', /Peak mode set by the human: stop/)
  }, { clock, services: MAIN_AGENT, rules: { version: 2 } })
})

rowTest('there is no line while there is no pricing service, and an agent that is not the main agent has none', async (fixture) => {
  await fixture.runtime.create()
  assert.deepEqual(await stepOf(fixture), [])
}, { services: MAIN_AGENT, rules: { version: 2 }, pricing: 'none' })

rowTest('a session that holds a stop ticket gets the line though it is not the main agent', async (fixture) => {
  await fixture.runtime.create()
  assert.deepEqual(await stepOf(fixture), [], 'no line before it has one')
  await fixture.run('peak 不做')
  const board = openRulesBoard({ projectRoot: fixture.root, io: quickIo() })
  assert.ok((await board.apply('harness', { op: 'ticket-open', sessionId: 'agent-1', agentLabel: 'agent-1', host: { pid: process.pid, startedAt: 1 }, signature: 'any:builtin:glm-peak-stop', tool: 'pwsh', summary: 'npm test', rules: ['builtin:glm-peak-stop'] })).ok)
  const [notice] = await stepOf(fixture)
  assert.match(bodyOf(notice), /^<system-reminder>\nGLM peak: now until \d\d:\d\d\. Peak mode set by the human: stop\. .*\nYour open tickets: q-1 pwsh "npm test" \(deferred since \d\d:\d\d\)\.\n<\/system-reminder>$/)
}, { rules: { version: 2 } })

rowTest('the line counts as one of the 12 items', async (fixture) => {
  await fixture.runtime.create()
  const lines = bodyOf((await stepOf(fixture))[0]).split('\n')
  assert.match(lines[1] ?? '', /^GLM peak: now until /)
  assert.equal(lines.filter(line => line.startsWith('- [inform')).length, 11)
  assert.equal(lines.at(-2), 'and 4 more: call rules_show')
}, { services: MAIN_AGENT, rules: reminderFile(...Array.from({ length: 15 }, (_, index) => ruleOf({ id: `r-note-${String(index).padStart(2, '0')}`, title: `Note ${index}`, when: { kind: 'event', events: ['rules.step'] }, action: { kind: 'inform' } }))) })

// --- the row's status view: the one rules/peak entry (status hub design 0.3 §3.2, §12 rules row) ---

const statusView = (runtime: FakeRuntime): RowStatusView => {
  const view = runtime.services.get(statusServiceName('rules')) as RowStatusView | undefined
  assert.ok(view !== undefined, 'the row provides glmHournessStatus/rules')
  return view
}

rowTest('the row submits its status view: the one rules/peak entry, the hours line the report face shows with the level in the fields, withdrawn with the row', async (fixture) => {
  const view = statusView(fixture.runtime)
  assert.equal(view.row, 'rules')
  const [item] = view.items(fixture.runtime.agent.id)
  const [hours] = peakStatusItems(creditPricing, PEAK_NOW)
  assert.equal(item?.text, hours?.text, 'the words are the report face words, one computation')
  assert.deepEqual(item?.fields, { peakMode: 'reduce', peakModeOrigin: 'default' })
  assert.equal(item?.audience, 'agent')
  await fixture.run('peak 不做')
  assert.deepEqual(view.items(fixture.runtime.agent.id).at(0)?.fields, { peakMode: 'stop', peakModeOrigin: 'human' })
  await fixture.dispose()
  assert.equal(fixture.runtime.services.has(statusServiceName('rules')), false)
}, { live: true })

rowTest('the peak entry keeps the hours half alone for a session the row does not know the project of', async (fixture) => {
  const view = statusView(fixture.runtime)
  const [hours] = peakStatusItems(creditPricing, PEAK_NOW)
  const [unknown] = view.items('no-such-session')
  assert.equal(unknown?.text, hours?.text)
  assert.equal(unknown?.fields, undefined)
  await fixture.dispose()
})

rowTest('the row has no peak entry while there is no pricing service', async (fixture) => {
  const view = statusView(fixture.runtime)
  assert.deepEqual(view.items(fixture.runtime.agent.id), [])
  await fixture.dispose()
}, { pricing: 'none' })
