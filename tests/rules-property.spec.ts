/**
 * The property of the write path (docs/ORCHESTRATION.md §16.9; design §7.4,
 * §7.5, §15 R2 and R3): whatever the board wrote, replaying its journal gives
 * the state it wrote, with no help from the clock, the heartbeat directory or
 * the snapshot. Five fixed seeds drive a generator written for this domain
 * (a valid request is one the current state allows, so it is built from the
 * state; no library, no shrinking: a disagreement is reported with the seed
 * and the first sequence number that does not reproduce its digest, and the
 * run replays from the seed). Each seed makes 200 or more writes that between
 * them use every operation the board has, with a clean-up 25 hours on (one host
 * lost), journal rotations, two lines no engine wrote with their recovery,
 * and the rules file changed from outside and settled each way. Afterwards the
 * snapshot is zeroed twice and the whole journal directory replayed from nothing.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openRulesBoard, type RulesBoard } from '../src/rules/engine.ts'
import { emptyState, type JournalRecord, type ProjectState, type RepoRules, type RulesActor } from '../src/rules/model.ts'
import { refusalFor, WRITE_OPS, type WriteOp } from '../src/rules/permissions.ts'
import { settleProject } from '../src/rules/repo.ts'
import { applyRecord, loadState, replayJournals, stateDigest } from '../src/rules/store.ts'
import { ruleOf } from './rules-fixtures.ts'
import { fakeClock, HOUR, MINUTE, quickIo, writeHeartbeat } from './rules-helpers.ts'

const SEEDS = [11, 2027, 31415, 271828, 1618033] as const
const WRITES = 200
/** Small enough that a seed's journal turns over a few times; larger than the state, so a base never fills a file by itself. */
const ROTATE_AT = 24_000
const START = '2026-11-03T08:00:00.000Z'
const PEAK_STOP = 'any:builtin:glm-peak-stop'
const LEVELS = ['inform', 'reduce', 'stop'] as const

/** mulberry32: a small generator whose sequence is the seed's alone. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Host {
  readonly pid: number
  readonly startedAt: number
}

type Done = Extract<Awaited<ReturnType<RulesBoard['apply']>>, { readonly ok: true }>
type Request = Record<string, unknown>

/** Every journal record there is, oldest first, read straight from the files: the numbered ones in order, then the current. */
async function allLines(runtimeDir: string): Promise<string[]> {
  const names = (await readdir(runtimeDir)).filter(name => /^journal-\d+\.jsonl$/.test(name)).sort((a, b) => Number(a.slice(8, -6)) - Number(b.slice(8, -6)))
  const lines: string[] = []
  for (const name of [...names, 'journal.jsonl']) lines.push(...(await readFile(join(runtimeDir, name), 'utf8')).split('\n').filter(line => line !== ''))
  return lines
}

async function runSeed(seed: number): Promise<void> {
  const rng = random(seed)
  const int = (low: number, high: number): number => low + Math.floor(rng() * (high - low + 1))
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)]
  const chance = (p: number): boolean => rng() < p
  const fail = (message: string, seq?: number): never => assert.fail(`seed ${seed}${seq === undefined ? '' : `, first sequence number that disagrees: ${seq}`}: ${message}`)

  const root = await mkdtemp(join(tmpdir(), 'rules-property-'))
  try {
    await mkdir(join(root, '.git'))
    const clock = fakeClock(START)
    const board = openRulesBoard({ projectRoot: root, io: quickIo({ now: clock.now }), rotateAtBytes: ROTATE_AT })
    const { paths } = board
    const hosts: Host[] = [1, 2, 3].map(index => ({ pid: 5000 + index, startedAt: 10 + index }))
    const alive = new Set<number>([0, 1, 2])
    const forged = new Set<string>()
    let writes = 0
    let counter = 0
    let model: ProjectState = emptyState()

    const state = (): ProjectState => loadState(paths).state
    const aliveHosts = (): Host[] => [...alive].map(index => hosts[index])
    const beat = async (): Promise<void> => {
      for (const host of aliveHosts()) await writeHeartbeat(paths, host, clock.iso())
    }

    /** The journal since the model: every record the engine wrote reproduces its digest on the model, and the model ends at the state read. */
    async function verify(label: string): Promise<void> {
      // A write settles first and rotates after, so its records can be in the file a rotation set aside: all the files are read.
      for (const line of await allLines(paths.runtimeDir)) {
        if (forged.has(line)) continue
        const record = JSON.parse(line) as JournalRecord
        if (record.seq <= model.seq) continue
        let next: ProjectState
        try {
          next = applyRecord(model, record)
        }
        catch (error) {
          return fail(`${label}: record ${record.seq} (${record.op}) cannot be applied: ${String(error)}`, record.seq)
        }
        if (stateDigest(next) !== record.snapshot) return fail(`${label}: record ${record.seq} (${record.op}) does not leave the state it says`, record.seq)
        model = next
      }
      const read = loadState(paths)
      if (stateDigest(read.state) !== stateDigest(model)) fail(`${label}: the snapshot is not the state the records make`, model.seq)
    }

    /** One write that has to succeed: the request is built from the state, so a refusal is a defect. */
    async function ask(actor: RulesActor, request: Request): Promise<Done> {
      await beat()
      const result = await board.apply(actor, request)
      if (!result.ok) return fail(`${String(request.op)} was refused (${result.error.code}): ${result.error.message}`, state().seq)
      if (result.changed) writes++
      await verify(String(request.op))
      return result
    }

    /** A request that has to be refused, and leave the journal as it was. */
    async function askRefused(actor: RulesActor, request: Request, code: string): Promise<void> {
      await beat()
      const before = await readFile(paths.journal, 'utf8')
      const result = await board.apply(actor, request)
      if (result.ok || result.error.code !== code) fail(`${String(request.op)} by ${actor} should have been ${code}: ${JSON.stringify(result)}`, state().seq)
      if (await readFile(paths.journal, 'utf8') !== before) fail(`a refused ${String(request.op)} wrote to the journal`, state().seq)
    }

    const noticeOf = (text: string): { readonly kind: string, readonly rule: string, readonly text: string, readonly at: string } => ({ kind: 'late-block', rule: 'r-keep-1', text, at: clock.iso() })
    const nothing = (): Request => ({ op: 'notice-add', kind: 'late-block', rule: 'r-keep-1', text: `a write ${++counter}` })

    // ------------------------------------------------------------ the start
    const initial: RepoRules = {
      version: 2,
      rules: {
        'r-keep-1': ruleOf({ id: 'r-keep-1' }),
        'r-keep-2': ruleOf({ id: 'r-keep-2', when: { kind: 'event', events: ['gate.dispatch'] } }),
        'r-keep-3': ruleOf({ id: 'r-keep-3', action: { kind: 'queue' } }),
        'r-ttl-0': ruleOf({ id: 'r-ttl-0', lifetime: { kind: 'ttl', expiresAt: new Date(clock.now() + 30 * MINUTE).toISOString() } }),
        'r-until-0': ruleOf({ id: 'r-until-0', lifetime: { kind: 'until', condition: { signal: 'sw-0', is: false } } }),
      },
      signals: {
        'sw-0': { type: { kind: 'boolean' }, description: 'a switch' },
        'sw-shift': { type: { kind: 'enum', values: ['day', 'night', 'weekend'] } },
        'sw-level': { type: { kind: 'number', unit: 'points' } },
        measured: { type: { kind: 'number' }, detector: 'd-measured' },
      },
    }
    await mkdir(paths.rulesDir, { recursive: true })
    await writeFile(paths.rulesFile, `${JSON.stringify(initial, null, 2)}\n`)
    assert.notEqual(await board.settle(), 'busy')
    model = state()

    // --------------------------------------------------------- micro writes
    const open = (s: ProjectState): Array<NonNullable<ProjectState['tickets']>[string]> => Object.values(s.tickets ?? {}).filter(ticket => ticket.state === 'deferred' || ticket.state === 'cleared')
    const MICRO: ReadonlyArray<readonly [number, (s: ProjectState) => readonly [RulesActor, Request] | undefined]> = [
      [5, () => ['human', { op: 'peak-mode-set', level: pick(LEVELS) }]],
      [4, (s) => {
        const active = Object.values(s.rules ?? {}).filter(rule => rule.status === 'active')
        return active.length === 0 ? undefined : ['human', { op: 'rule-lift', id: pick(active).id }]
      }],
      [2, (s) => {
        const rules = Object.values(s.rules ?? {})
        return rules.length <= 3 ? undefined : ['human', { op: 'rule-delete', id: pick(rules).id }]
      }],
      [6, (s) => {
        const names = Object.keys(s.signals ?? {})
        const name = pick(names)
        const type = s.signals?.[name]?.type
        const value = type?.kind === 'boolean' ? chance(0.5) : type?.kind === 'enum' ? pick(type.values) : int(0, 9)
        return ['human', { op: 'signal-manual', name, value, ...(chance(0.5) ? { durationMs: int(1, 90) * MINUTE } : {}) }]
      }],
      [3, (s) => {
        const withValue = Object.entries(s.signals ?? {}).filter(([, signal]) => signal.manual !== undefined)
        return withValue.length === 0 ? undefined : ['human', { op: 'signal-clear', name: pick(withValue)[0] }]
      }],
      [1, (s) => {
        const switches = Object.entries(s.signals ?? {}).filter(([, signal]) => signal.detector === undefined)
        return switches.length <= 2 ? undefined : ['human', { op: 'signal-delete', name: pick(switches)[0] }]
      }],
      [5, (s) => {
        const rules = Object.keys(s.rules ?? {})
        return ['harness', {
          op: 'ticket-open',
          sessionId: `s-${int(1, 6)}`,
          agentLabel: `agent-${int(1, 3)}`,
          host: pick(aliveHosts()),
          signature: chance(0.3) ? PEAK_STOP : createHash('sha256').update(String(++counter)).digest('hex').slice(0, 12),
          tool: pick(['pwsh', 'bash', 'subagent']),
          summary: `call ${counter}`,
          rules: [pick(rules.length === 0 ? ['r-keep-1'] : rules)],
          ...(chance(0.2) ? { nested: true } : {}),
        }]
      }],
      [6, (s) => {
        const tickets = open(s)
        if (tickets.length === 0) return undefined
        const ticket = pick(tickets)
        if (chance(0.25) && ticket.signature === PEAK_STOP && ticket.pausedGoal === undefined) return ['harness', { op: 'ticket-update', id: ticket.id, pausedGoal: { id: `goal-${int(1, 3)}`, revision: int(1, 9) } }]
        const next = ticket.state === 'deferred' ? pick(['cleared', 'done', 'cancelled']) : pick(['done', 'cancelled'])
        return ['harness', { op: 'ticket-update', id: ticket.id, state: next, ...(chance(0.3) ? { resumed: true } : {}) }]
      }],
      [3, (s) => {
        const tickets = open(s)
        return tickets.length === 0 ? undefined : ['harness', { op: 'ticket-handover', id: pick(tickets).id, sessionId: `s-h${++counter}`, agentLabel: `root-${counter}`, ...(chance(0.5) ? { focus: 'task-1' } : {}) }]
      }],
      [3, (s) => {
        const eligible = Object.values(s.tickets ?? {}).filter(ticket => ticket.signature === PEAK_STOP && (ticket.state === 'deferred' || ticket.state === 'cleared' || (ticket.state === 'expired' && ticket.expiredWhy === 'host-gone' && ticket.resumedAt === undefined)))
        return eligible.length === 0 ? undefined : ['harness', { op: 'ticket-adopt', id: pick(eligible).id, host: pick(aliveHosts()) }]
      }],
      [3, (s) => {
        const deferred = open(s).filter(ticket => ticket.state === 'deferred')
        return deferred.length === 0 ? undefined : ['human', { op: 'ticket-let-once', id: pick(deferred).id, ...(chance(0.4) ? { until: new Date(clock.now() + int(1, 300) * MINUTE).toISOString() } : {}) }]
      }],
      [3, (s) => {
        const tickets = open(s)
        return tickets.length === 0 ? undefined : ['human', { op: 'ticket-cancel', id: pick(tickets).id }]
      }],
      [5, () => ['harness', { ...nothing(), kind: pick(['late-block', 'script-capped']) }]],
      [3, (s) => {
        const ids = Object.keys(s.notices ?? {})
        return ids.length === 0 ? undefined : ['harness', { op: 'notice-delivered', id: pick(ids) }]
      }],
      // The path of agreement: proposals are made, shown, agreed to, turned down and lapse.
      [4, (s) => {
        if (Object.values(s.proposals ?? {}).filter(proposal => proposal.status === 'open').length >= 12) return undefined
        const n = ++counter
        const id = `p-${n.toString(16).padStart(8, '0')}`
        const replaces = Object.values(s.proposals ?? {}).filter(proposal => proposal.status === 'open')
        return ['llm', {
          op: 'propose',
          proposal: {
            id,
            kind: 'rule',
            body: { id: `r-prop-${n}`, title: `proposed ${n}`, scope: 'project', when: { kind: 'event', events: ['gate.tool-call'] }, action: { kind: 'block' }, lifetime: { kind: 'until-lifted' }, reason: 'because' },
            describe: `a proposal ${n}`,
            cautions: [],
            reason: 'the human asked',
            via: chance(0.5) ? 'graph' : 'board',
            proposedBy: { sessionId: `s-${int(1, 6)}`, agentId: `agent-${int(1, 3)}` },
            ...(replaces.length > 0 && chance(0.2) ? { replaces: pick(replaces).id } : {}),
          },
        }]
      }],
      [3, (s) => {
        const open = Object.values(s.proposals ?? {}).filter(proposal => proposal.status === 'open')
        return open.length === 0 ? undefined : ['human', { op: 'proposal-show', id: pick(open).id }]
      }],
      [3, (s) => {
        const open = Object.values(s.proposals ?? {}).filter(proposal => proposal.status === 'open' && Object.values(s.rules ?? {}).filter(rule => rule.status === 'active').length < 40)
        return open.length === 0 ? undefined : [chance(0.3) ? 'harness' : 'human', { op: 'proposal-accept', id: pick(open).id, by: chance(0.5) ? 'human' : 'llm', relay: '可以', ...(chance(0.5) ? { question: `question-${int(1, 9)}` } : {}) }]
      }],
      [2, (s) => {
        const open = Object.values(s.proposals ?? {}).filter(proposal => proposal.status === 'open')
        return open.length === 0 ? undefined : [chance(0.3) ? 'harness' : 'human', { op: 'proposal-reject', id: pick(open).id }]
      }],
      [2, (s) => {
        const open = Object.values(s.proposals ?? {}).filter(proposal => proposal.status === 'open')
        return open.length === 0 ? undefined : ['harness', { op: 'proposal-expire', id: pick(open).id }]
      }],
    ]
    const weighted = MICRO.flatMap(([weight, build]) => Array.from({ length: weight }, () => build))
    async function micro(): Promise<void> {
      for (let attempt = 0; attempt < 20; attempt++) {
        const built = pick(weighted)(state())
        if (built === undefined) continue
        const [actor, request] = built
        const roll = rng()
        if (roll < 0.06) {
          // The wrong identity: refused, with nothing written.
          await askRefused(pick((['llm', 'detector', 'human', 'harness'] as const).filter(candidate => refusalFor(candidate, request.op as WriteOp) !== undefined)), request, 'forbidden')
        }
        else if (roll < 0.09) {
          await askRefused(actor, { ...request, rev: Math.max(0, state().seq - 1 - int(0, 2)) }, 'stale_revision')
        }
        else {
          await ask(actor, request)
        }
        return
      }
    }

    // ---------------------------------------------------------- macro steps
    const edit = async (change: (file: { rules?: Record<string, unknown>, signals?: Record<string, unknown> }) => void): Promise<void> => {
      const file = JSON.parse(await readFile(paths.rulesFile, 'utf8')) as { rules?: Record<string, unknown>, signals?: Record<string, unknown> }
      change(file)
      await writeFile(paths.rulesFile, `${JSON.stringify(file, null, 1)}\n`)
    }
    /** The first rule of the file given a new title, the way a hand or a merge would. */
    const touchByHand = (): Promise<void> => edit((file) => {
      const first = Object.values(file.rules as Record<string, { title?: string }>)[0]
      if (first !== undefined) first.title = `edited by hand ${++counter}`
    })
    /** New rules (and a switch) arrive through the rules file, the person adopts them, and a rule whose time is up is expired by the host. */
    async function adoptNew(withSwitch: boolean): Promise<void> {
      const n = ++counter
      await edit((file) => {
        file.rules = {
          ...file.rules,
          [`r-gen-${n}`]: ruleOf({ id: `r-gen-${n}`, lifetime: { kind: 'ttl', expiresAt: new Date(clock.now() + 10 * MINUTE).toISOString() } }),
          ...(withSwitch ? { [`r-gen-${n}-until`]: ruleOf({ id: `r-gen-${n}-until`, lifetime: { kind: 'until', condition: { signal: `sw-${n}`, is: true } } }) } : {}),
        }
        if (withSwitch) file.signals = { ...file.signals, [`sw-${n}`]: { type: { kind: 'boolean' } } }
      })
      clock.advance(1000)
      await ask('human', { op: 'repo-adopt' })
      clock.advance(11 * MINUTE)
      await ask('harness', { op: 'rule-expire', id: `r-gen-${n}` })
    }
    const MACROS: Array<{ readonly name: string, at: number, readonly run: () => Promise<void>, done: boolean }> = [
      {
        name: 'adopt',
        at: int(5, 20),
        done: false,
        run: () => adoptNew(true),
      },
      {
        // Two lines no engine wrote: one with a digest that is made up, one without; a write settles them; one is accepted, the other dismissed.
        name: 'forge',
        at: int(30, 50),
        done: false,
        async run() {
          const seq = loadState(paths).nextSeq
          const a = JSON.stringify({ seq: seq + 3, at: clock.iso(), actor: 'harness', op: 'notice-add', changes: [{ path: ['notices', `n-forged-${seq}-a`], value: noticeOf('forged, with a digest') }], snapshot: '0123456789abcdef' })
          const b = JSON.stringify({ at: clock.iso(), actor: 'harness', op: 'notice-add', changes: [{ path: ['notices', `n-forged-${seq}-b`], value: noticeOf('forged, without one') }] })
          for (const line of [a, b]) {
            forged.add(line)
            await appendFile(paths.journal, `${line}\n`)
          }
          await ask('harness', nothing())
          const key = (line: string): string => createHash('sha256').update(line).digest('hex').slice(0, 12)
          const unresolved = state().unresolved ?? {}
          const [labelA, labelB] = [unresolved[key(a)]?.label, unresolved[key(b)]?.label]
          if (labelA === undefined || labelB === undefined) fail('the two forged lines were not listed', state().seq)
          await ask('human', { op: 'recovery-accept', labels: [labelA] })
          await ask('human', { op: 'recovery-dismiss', labels: [labelB] })
          if (state().notices?.[`n-forged-${seq}-a`] === undefined || state().notices?.[`n-forged-${seq}-b`] !== undefined) fail('the accepted line took effect and the dismissed one did not', state().seq)
        },
      },
      {
        // The rules file changed by hand, and the board's own written back.
        name: 'restore',
        at: int(55, 75),
        done: false,
        async run() {
          await touchByHand()
          clock.advance(1000)
          await ask('human', { op: 'repo-restore' })
        },
      },
      {
        // A change from outside that is undone before anyone settles it.
        name: 'cleared',
        at: int(80, 95),
        done: false,
        async run() {
          const mine = await readFile(paths.rulesFile, 'utf8')
          await touchByHand()
          clock.advance(1000)
          const added = await ask('harness', nothing())
          await writeFile(paths.rulesFile, mine)
          clock.advance(1000)
          await ask('harness', { op: 'notice-delivered', id: added.target })
        },
      },
      {
        // 25 hours on, one host lost: closed tickets older than a day go, the lost host's tickets expire, a peak-stop ticket is taken over by a live host.
        name: 'jump',
        at: int(100, 130),
        done: false,
        async run() {
          const doomed = pick([...alive])
          const doomedHost = hosts[doomed]
          const survivor = hosts[pick([...alive].filter(index => index !== doomed))]
          const stop = await ask('harness', { op: 'ticket-open', sessionId: 's-jump', agentLabel: 'jump', host: doomedHost, signature: PEAK_STOP, tool: 'pwsh', summary: 'held for the peak', rules: ['r-keep-1'] })
          const closed = await ask('harness', { op: 'ticket-open', sessionId: 's-jump-2', agentLabel: 'jump', host: survivor, signature: 'feedfacefeed', tool: 'pwsh', summary: 'closed', rules: ['r-keep-1'] })
          await ask('human', { op: 'ticket-cancel', id: closed.target })
          clock.advance(25 * HOUR)
          alive.delete(doomed)
          while (alive.size < 2) alive.add(hosts.push({ pid: 6000 + hosts.length, startedAt: 100 + hosts.length }) - 1)
          await unlink(join(paths.runtimeDir, 'hosts', `${doomedHost.pid}-${doomedHost.startedAt}.json`))
          const done = await ask('harness', nothing())
          const record = (await readFile(paths.journal, 'utf8')).split('\n').filter(line => line !== '').map(line => JSON.parse(line) as JournalRecord).find(item => item.seq === done.state.seq)
          const causes = new Set(record?.changes.map(change => change.cause))
          if (!causes.has('prune') || !causes.has('expire')) fail(`the write 25 hours on carried causes ${[...causes].join(',')}, not prune and expire`, done.state.seq)
          if (state().tickets?.[closed.target ?? '']?.state !== undefined) fail('the ticket closed 25 hours ago is still in the state', done.state.seq)
          if (state().tickets?.[stop.target ?? '']?.expiredWhy !== 'host-gone') fail('the lost host\'s ticket did not expire as host-gone', done.state.seq)
          await ask('harness', { op: 'ticket-adopt', id: stop.target, host: pick(aliveHosts()) })
        },
      },
      {
        name: 'adopt again',
        at: int(140, 160),
        done: false,
        run: () => adoptNew(false),
      },
    ]

    // ------------------------------------------------------------- the run
    while (writes < WRITES) {
      clock.advance(chance(0.05) ? int(5, 40) * MINUTE : int(1, 2500))
      const due = MACROS.find(macro => !macro.done && macro.at <= writes)
      if (due === undefined) {
        await micro()
      }
      else {
        due.done = true
        await due.run()
      }
    }
    for (const macro of MACROS) if (!macro.done) fail(`the step "${macro.name}" never ran`)

    // Everything the board has was used, a journal was rotated and the clean-up wrote values.
    const lines = await allLines(paths.runtimeDir)
    const records = lines.filter(line => !forged.has(line)).map(line => JSON.parse(line) as JournalRecord)
    const used = new Set(records.map(record => record.op))
    for (const op of WRITE_OPS) if (!used.has(op)) fail(`the operation ${op} was never used`)
    if ((await readdir(paths.runtimeDir)).filter(name => /^journal-\d+\.jsonl$/.test(name)).length === 0) fail('the journal was never rotated')
    if (!records.some(record => record.op === 'base' && record.seq > 1 && record.state !== undefined && record.changes.length === 0)) fail('no rotation left a base')

    // ---------------------------------------------------- (a), (b) and (c)
    const firstDisagreement = (): number | undefined => {
      let replayed = emptyState()
      for (const record of records) {
        let next: ProjectState | undefined
        try {
          next = applyRecord(replayed, record)
        }
        catch {
          return record.seq
        }
        if (stateDigest(next) !== record.snapshot) return record.seq
        replayed = next
      }
      return undefined
    }
    const before = stateDigest(state())
    const listed = Object.keys(state().unresolved ?? {})
    await writeFile(paths.state, '')
    const first = loadState(paths)
    if (stateDigest(first.state) !== before) fail('(a) the replay of a zeroed snapshot is not the state it was', firstDisagreement())
    if (first.plan?.recovered?.skipped.length !== 0) fail(`(a) the replay skipped ${String(first.plan?.recovered?.skipped.length)} lines`, firstDisagreement())
    if (first.plan?.recovered?.reason !== 'snapshot-corrupt') fail(`(a) the reason is ${String(first.plan?.recovered?.reason)}`)
    assert.notEqual(await settleProject(paths, quickIo({ now: clock.now })), 'busy')
    const afterA = state()
    if (afterA.recovered?.reason !== 'snapshot-corrupt' || afterA.seq <= first.state.seq) fail('(a) no recovered record of the reason snapshot-corrupt was written')
    if (JSON.stringify(Object.keys(afterA.unresolved ?? {}).sort()) !== JSON.stringify(listed.sort())) fail('(a) the recovered record listed rows of its own')

    const digestA = stateDigest(afterA)
    await writeFile(paths.state, '')
    const second = loadState(paths)
    if (stateDigest(second.state) !== digestA) fail('(b) the second replay is not the state after the first', firstDisagreement())
    if (second.plan?.recovered?.skipped.length !== 0) fail('(b) the second replay skipped lines')
    assert.notEqual(await settleProject(paths, quickIo({ now: clock.now })), 'busy')
    const afterB = state()
    if (afterB.seq !== afterA.seq + 1 || afterB.recovered?.reason !== 'snapshot-corrupt') fail('(b) exactly one more recovered record was not written')

    const all = replayJournals(paths)
    if (stateDigest(all.state) !== stateDigest(afterB)) fail('(c) the whole directory, replayed from nothing, is not the snapshot', firstDisagreement())
    if (all.skipped.length !== 0) fail(`(c) the replay of the whole directory skipped ${all.skipped.length} lines (the chain of bases does not verify)`)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}

for (const seed of SEEDS) {
  test(`seed ${seed}: the journal replays to the state the board wrote, from the snapshot, from a base, and from nothing`, async () => {
    await runSeed(seed)
  })
}
