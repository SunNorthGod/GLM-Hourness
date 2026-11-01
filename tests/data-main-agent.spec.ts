/**
 * The one main-agent judgement of the memory and lessons rows
 * (src/data/main-agent.ts, M5 design §4.2.1): the holder record on real
 * files, the session's own mode from a projection, and the "design row not
 * there" fallback in which every root agent counts and the reason is
 * returned. The graph and data services are cordis-style value stores; the
 * record is written and read by the real holder module.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { isMainAgentFor } from '../src/data/main-agent.ts'
import { MAIN_AGENT_KEY } from '../src/graph/main-agent.ts'
import { claimHolder, holderFileOf } from '../src/graph/main-agent-holder.ts'
import type { SessionLike } from '../src/shared/dsh-min.ts'
import { serviceStore } from './fake-rc3.ts'

const WORK = resolve(tmpdir(), 'main-agent-project')
const GRAPH_DIR = join(WORK, 'docs', 'graph')

interface Setup {
  readonly store: ReturnType<typeof serviceStore>
  readonly userHome: string
  /** The mode each session's projection reports. */
  readonly modes: Map<string, unknown>
  readonly session: (id: string, header?: { readonly cwd?: string, readonly origin?: 'subagent' }) => SessionLike
  /** Make `sessionId` the main agent of the project, in the record file. */
  hold(sessionId: string): void
}

function setup(options: { readonly graph?: boolean, readonly projections?: 'working' | 'throws' | 'absent' } = {}): Setup {
  const store = serviceStore()
  const userHome = mkdtempSync(join(tmpdir(), 'main-agent-'))
  const modes = new Map<string, unknown>()
  store.provide('glmHournessData', { userHome })
  if (options.graph !== false) store.provide('glmHournessGraph', { dirFor: (cwd: string | undefined) => cwd === undefined ? undefined : join(resolve(cwd), 'docs', 'graph'), isGraphTool: () => false })
  if (options.projections !== 'absent') {
    store.provide('sessionProjections', {
      stateOf: (session: SessionLike, key: string) => {
        if (options.projections === 'throws') throw new Error('projection store is gone')
        return key === MAIN_AGENT_KEY ? modes.get(session.id) : undefined
      },
    })
  }
  return {
    store,
    userHome,
    modes,
    session: (id, header = { cwd: WORK }) => ({ id, header: { id, ...header }, deriveMessages: () => [] }),
    hold(sessionId) {
      claimHolder(holderFileOf(userHome, GRAPH_DIR), { version: 1, sessionId, graphDir: GRAPH_DIR, since: '2026-11-01T00:00:00.000Z', commandId: `cmd-${sessionId}` })
    },
  }
}

const on = { active: true, running: null, settled: null }
const off = { active: false, running: null, settled: null }

test('the session the record names, with its mode on, is the main agent; nothing is wrong', () => {
  const s = setup()
  s.hold('main')
  s.modes.set('main', on)
  assert.deepEqual(isMainAgentFor(s.store, { session: s.session('main') }), { main: true })
})

test('the session the record names, with its mode off, is not the main agent, and the row is told why', () => {
  const s = setup()
  s.hold('main')
  s.modes.set('main', off)
  const judgement = isMainAgentFor(s.store, { session: s.session('main') })
  assert.equal(judgement.main, false)
  assert.match(judgement.note ?? '', /主 Agent 模式已关/)
})

test('another session of the same project, whatever its own mode, is not the main agent and nothing is wrong with that', () => {
  const s = setup()
  s.hold('main')
  s.modes.set('main', on)
  s.modes.set('plain', on)
  assert.deepEqual(isMainAgentFor(s.store, { session: s.session('plain') }), { main: false })
})

test('without a design row there is no record to read: every root agent counts, with the reason', () => {
  const noRecord = setup()
  const none = isMainAgentFor(noRecord.store, { session: noRecord.session('any') })
  assert.equal(none.main, true)
  assert.match(none.note ?? '', /没有可读的主 Agent 记录/)

  const noGraph = setup({ graph: false })
  noGraph.hold('main')
  const withoutGraph = isMainAgentFor(noGraph.store, { session: noGraph.session('any') })
  assert.equal(withoutGraph.main, true)
  assert.match(withoutGraph.note ?? '', /项目图行没有启用/)

  const noCwd = setup()
  noCwd.hold('main')
  const withoutDirectory = isMainAgentFor(noCwd.store, { session: noCwd.session('any', {}) })
  assert.equal(withoutDirectory.main, true)
  assert.match(withoutDirectory.note ?? '', /没有工作目录/)
})

test('a record that cannot be read counts as no record', () => {
  const s = setup()
  const file = holderFileOf(s.userHome, GRAPH_DIR)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, '{not json')
  const judgement = isMainAgentFor(s.store, { session: s.session('any') })
  assert.equal(judgement.main, true)
  assert.match(judgement.note ?? '', /没有可读的主 Agent 记录/)
})

test('a delegated child and an agent without a session are never the main agent, and are not looked up', () => {
  const s = setup({ graph: false })
  assert.deepEqual(isMainAgentFor(s.store, { session: s.session('child', { cwd: WORK, origin: 'subagent' }) }), { main: false })
  assert.deepEqual(isMainAgentFor(s.store, {}), { main: false })
  assert.deepEqual(isMainAgentFor({}, { session: s.session('child', { origin: 'subagent' }) }), { main: false }, 'a context without ctx.get')
})

test('the named session\'s mode cannot be read: not the main agent, with the reason', () => {
  const broken = setup({ projections: 'throws' })
  broken.hold('main')
  const thrown = isMainAgentFor(broken.store, { session: broken.session('main') })
  assert.equal(thrown.main, false)
  assert.match(thrown.note ?? '', /读不到本会话的主 Agent 状态（projection store is gone）/)

  const absent = setup({ projections: 'absent' })
  absent.hold('main')
  const withoutService = isMainAgentFor(absent.store, { session: absent.session('main') })
  assert.equal(withoutService.main, false)
  assert.match(withoutService.note ?? '', /sessionProjections/)

  const unregistered = setup()
  unregistered.hold('main')
  const noState = isMainAgentFor(unregistered.store, { session: unregistered.session('main') })
  assert.equal(noState.main, false)
  assert.match(noState.note ?? '', /没有主 Agent 状态/)

  const malformed = setup()
  malformed.hold('main')
  malformed.modes.set('main', { active: 'yes' })
  assert.equal(isMainAgentFor(malformed.store, { session: malformed.session('main') }).main, false)
})

test('the record of another project is not this project\'s', () => {
  const s = setup()
  s.hold('main')
  s.modes.set('main', on)
  const elsewhere = join(tmpdir(), 'main-agent-other-project')
  const judgement = isMainAgentFor(s.store, { session: s.session('main', { cwd: elsewhere }) })
  assert.equal(judgement.main, true, 'no record for that project: the fallback')
  assert.match(judgement.note ?? '', /没有可读的主 Agent 记录/)
})
