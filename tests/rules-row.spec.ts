/**
 * The rules row on the fake rc.3 host (docs/ORCHESTRATION.md §16): the
 * `/rules peak` command, the service other rows read, the health it reports,
 * and what it never does: hold or delay an agent. The pricing service is the
 * real GLM credit plan, as `glm-login` provides it; the clock is injected.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { creditPricing } from '../src/glm-llm/credits.ts'
import type { AgentCommandInvocationLike, CommandDefinitionLike, CommandResultLike } from '../src/shared/dsh-min.ts'
import { collectHealth, healthServiceName } from '../src/shared/health.ts'
import { PEAK_MODE_SERVICE, peakModeService, type PeakModeService } from '../src/shared/peak-mode.ts'
import { PRICING_SERVICE } from '../src/shared/pricing.ts'
import { apply, clockText, inject, name, type RulesConfig, type RulesContext } from '../src/rules/index.ts'
import { repoJson } from '../src/rules/model.ts'
import { fakeRuntime, type FakeRuntime } from './fake-rc3.ts'
import { captureWarnings } from './graph-helpers.ts'
import { quickIo } from './rules-helpers.ts'

const NOW = Date.parse('2026-10-28T15:00:00+08:00') // a Wednesday in the GLM peak, 14:00-18:00 UTC+8
const OFF_PEAK = Date.parse('2026-10-28T20:00:00+08:00')
const PEAK_END = '2026-10-28T10:00:00.000Z'
const NEXT_PEAK = '2026-10-29T06:00:00.000Z'

interface Fixture {
  readonly root: string
  readonly runtime: FakeRuntime
  readonly commands: Map<string, CommandDefinitionLike<AgentCommandInvocationLike>>
  readonly service: PeakModeService
  readonly dispose: () => void
  /** Run `/rules <input>` in the fake agent's session. */
  readonly run: (input: string) => Promise<CommandResultLike>
}

interface Options {
  /** The pricing service on the host: the GLM credit plan unless given, none for `'none'`. */
  readonly pricing?: unknown
  readonly now?: number
  readonly config?: RulesConfig
  /** The working directory of the fake agent: the project unless given, none for `null`. */
  readonly cwd?: string | null
  readonly breakCommands?: boolean
}

/** A git project in a temporary directory with the rules row applied on a fake host whose agent works in it. */
async function withRow(body: (fixture: Fixture) => Promise<void>, options: Options = {}): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'rules-row-'))
  try {
    await mkdir(join(root, '.git'))
    const runtime = fakeRuntime({ natives: ['pwsh'], ...(options.cwd === null ? {} : { cwd: options.cwd ?? root }) })
    if (options.pricing !== 'none') runtime.services.set(PRICING_SERVICE, options.pricing ?? creditPricing)
    const commands = new Map<string, CommandDefinitionLike<AgentCommandInvocationLike>>()
    const ctx = {
      ...runtime.ctx,
      commands: {
        register: (definition: CommandDefinitionLike<AgentCommandInvocationLike>) => {
          if (options.breakCommands === true) throw new Error('taken')
          commands.set(definition.name, definition)
          return () => { commands.delete(definition.name) }
        },
      },
    } as unknown as RulesContext
    const now = options.now ?? NOW
    const dispose = apply(ctx, { now: () => now, io: quickIo(), ...options.config })
    await body({
      root,
      runtime,
      commands,
      service: peakModeService(runtime.ctx)!,
      dispose,
      run: input => commands.get('rules')!.handler({ commandId: 'test', agent: { id: runtime.agent.id, session: runtime.agent.session }, rawInput: input } as unknown as AgentCommandInvocationLike),
    })
    dispose()
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}

function rowTest(title: string, body: (fixture: Fixture) => Promise<void>, options: Options = {}): void {
  test(title, () => withRow(body, options))
}

const health = (runtime: FakeRuntime) => collectHealth(runtime.ctx, 'agent-1').find(entry => entry.row === 'rules')!

rowTest('the row is a cordis plugin that needs the commands service, registers /rules, provides the service and its health, and withdraws all of it', ({ runtime, commands, dispose }) => {
  assert.equal(name, 'dsh-glm-hourness/rules')
  assert.deepEqual(inject, ['commands'])
  const command = commands.get('rules')
  assert.deepEqual([command?.definitionId, command?.name, command?.input?.hint], ['dsh-glm-hourness/rules', 'rules', 'peak [无影响|少做|不做]'])
  assert.ok(runtime.services.has(PEAK_MODE_SERVICE))
  assert.deepEqual(health(runtime), { row: 'rules', status: 'idle', reason: `命令 /rules 与高峰模式服务 ${PEAK_MODE_SERVICE} 已就绪` })
  assert.ok(peakModeService(runtime.ctx) !== undefined)
  dispose()
  assert.equal(commands.size, 0)
  assert.equal(peakModeService(runtime.ctx), undefined, 'the readers see the service leave with the row')
  assert.equal(runtime.services.has(PEAK_MODE_SERVICE), false)
  assert.equal(runtime.services.has(healthServiceName('rules')), false)
  assert.deepEqual(runtime.listeners.map(entry => entry.event), [])
  return Promise.resolve()
})

rowTest('nothing in the row holds or delays an agent: it listens to two lifecycle events and gates neither a tool call nor a step, on any level', async ({ runtime, run }) => {
  assert.deepEqual(runtime.listeners.map(entry => entry.event).sort(), ['agent/created', 'session/disposed'])
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
  assert.deepEqual(await readdir(root), ['.git'], 'looking wrote nothing')
})

rowTest('/rules peak 不做 stores the choice in the repository and the project, and the service hands it out; the choice is the person\'s with its time', async ({ root, runtime, service, run }) => {
  const result = await run('peak 不做')
  assert.equal(result.kind, 'success')
  assert.ok(result.text?.startsWith('高峰模式改成了「不做」（高峰里 GLM 的活停下排队，高峰结束后接着做）。现在是高峰，到 '), result.text)
  assert.ok(result.text?.includes('不拦任何调用'), 'the reply says what this version does not do yet')
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

rowTest('the three levels in a peak: the cap only for reduce, the hold for reduce and stop', async ({ service, run }) => {
  const seen: Array<[string, boolean | undefined, number | undefined, string | undefined]> = []
  for (const level of ['无影响', '少做', '不做']) {
    await run(`peak ${level}`)
    const state = service.stateFor('agent-1')
    seen.push([level, state?.peak, state?.glmWorkerCap, service.peakHoldFor('agent-1')?.level])
  }
  assert.deepEqual(seen, [['无影响', true, undefined, undefined], ['少做', true, 1, 'reduce'], ['不做', true, undefined, 'stop']])
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

test('a folder that is no project has no state, and nothing is created in it', async () => {
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

rowTest('the command takes nothing but peak and one level, and says what it expects', async ({ run }) => {
  for (const input of ['', 'show', 'lift r-x', 'peak a b']) {
    const result = await run(input)
    assert.deepEqual([input, result.kind, result.text?.startsWith('用法：/rules peak [无影响|少做|不做]')], [input, 'error', true])
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
    first()
    second()

    // A host that cannot provide anything.
    const lone = fakeRuntime({ natives: [] })
    apply({ commands: { register: () => () => {} }, on: (...args: unknown[]) => (lone.ctx.on as (...inner: unknown[]) => () => void)(...args), get: (key: string) => lone.ctx.get?.(key) }, {})()

    // A host whose event registration throws.
    const noEvents = fakeRuntime({ natives: [] })
    const stop = apply({ ...noEvents.ctx, commands: { register: () => () => {} }, on: () => { throw new Error('no events') } }, {})
    const view = collectHealth(noEvents.ctx, undefined).find(entry => entry.row === 'rules')
    assert.deepEqual([view?.status, view?.reason.includes('会话事件没注册上：no events')], ['degraded', true])
    stop()

    // A configuration that is not a path: nothing registers.
    const badDir = fakeRuntime({ natives: [] })
    const never = apply({ ...badDir.ctx, commands: { register: () => { throw new Error('must not register') } } } as unknown as RulesContext, { dir: '  ' })
    assert.equal(collectHealth(badDir.ctx, undefined).find(entry => entry.row === 'rules')?.status, 'inactive')
    assert.equal(badDir.services.has(PEAK_MODE_SERVICE), false)
    never()
  })
  const ours = warnings.filter(warning => warning.startsWith('dsh-glm-hourness/rules: '))
  assert.equal(ours.length, 5, ours.join(' | '))
  for (const expected of [/registering \/rules failed, the level cannot be changed: taken/, /row health not provided/, /glmHournessPeakMode is not provided/, /the session listeners are not registered/, /config\.dir must be a non-empty path/]) {
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
  assert.match(block, /^ {6}inject: \[commands\]$/m)
  const manifest = JSON.parse(await readFile(new URL('../packages/hourness/package.json', import.meta.url), 'utf8')) as { exports: Record<string, string> }
  assert.equal(manifest.exports['./rules'], './dist/rules/index.js')
  assert.equal(manifest.exports['./rules/locale/*.json'], './locale/rules/*.json')
  for (const language of ['en', 'zh']) {
    const locale = JSON.parse(await readFile(new URL(`../packages/hourness/locale/rules/${language}.json`, import.meta.url), 'utf8')) as { meta: { title: string, description: string } }
    assert.ok(locale.meta.title.length > 0 && locale.meta.description.length > 0, language)
  }
})
