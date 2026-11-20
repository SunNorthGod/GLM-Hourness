import assert from 'node:assert/strict'
import test from 'node:test'
import type { ExecuteLiveBoard as HostExecuteLiveBoard } from '../src/execute/live-board.ts'
import type { LiveView } from '../src/graph/live.ts'
import type { ProjectionValues } from '../ui/src/dsh.ts'
import {
  buildFleetModel,
  collectSubagentTree,
  extractSessionPreview,
  formatDuration,
  formatProviderLabel,
  formatTokensCompact,
  parseCommandsTail,
  subagentChatAddress,
  type ExecuteLiveBoard,
} from '../ui/src/subagents/model.ts'
import { SUBAGENTS_CSS, SUBAGENT_LIGHT_TOKENS } from '../ui/src/subagents/styles.ts'

function live(overrides: Partial<LiveView> = {}): LiveView {
  return {
    focus: 'task-1',
    model: 'glm-5.3',
    provider: 'glm-zcode',
    turn: 1,
    turnSince: 1_000,
    stepSince: 1_100,
    steps: 2,
    phase: 'tool',
    turnEndReason: null,
    tool: { name: 'Bash', since: 1_200, argHint: 'npm test' },
    recent: [{ name: 'Read', at: 1_150, ok: true, ms: 45, argHint: 'src/a.ts' }],
    awaiting: [],
    requests: [],
    pendingApproval: null,
    lastError: null,
    ...overrides,
  }
}

function boardFixture(overrides: Partial<ExecuteLiveBoard> = {}): ExecuteLiveBoard {
  return {
    version: 1,
    updatedAt: 5_000,
    projectRoot: '/tmp/proj',
    slots: { max: 3, activeWorkers: 1, glmWorkers: 1, peakCap: 1 },
    drive: { goalId: 'goal-1', phase: 'active', counters: { idle: 0, peak: 0 } },
    peak: { peak: true, level: 'reduce', until: '18:00' },
    dispatchMode: 'eco',
    dispatches: [
      {
        childId: 'hz-task-1-a1-abc123',
        task: 'task-1',
        role: 'worker',
        attempt: 1,
        status: 'running',
        startedAt: 1_000,
        parentSession: 'main-1',
        provider: 'glm-zcode',
        model: 'glm-5.3',
        why: 'implement',
        worktree: '/tmp/proj/.worktrees/hz-task-1',
        branch: 'hz/task-1',
        plan: 'approved',
      },
      {
        childId: 'hz-task-2-a1-def456',
        task: 'task-2',
        role: 'review',
        attempt: 1,
        status: 'completed',
        startedAt: 500,
        settledAt: 900,
        parentSession: 'main-1',
        provider: 'glm-start-plan',
        model: 'glm-5.3-flash',
        why: 'review',
        plan: 'none',
        handbackDone: true,
      },
    ],
    requests: [
      {
        id: 'R-abc123',
        kind: 'plan',
        childId: 'hz-task-1-a1-abc123',
        task: 'task-1',
        attempt: 1,
        since: 2_000,
        version: 1,
      },
    ],
    jobs: [
      {
        id: 'walk-goal-1-xyz999',
        kind: 'walk',
        label: 'hourness walk goal-1',
        status: 'running',
        startedAt: 3_000,
        goalId: 'goal-1',
        flows: ['flow-1'],
        mode: 'activation',
      },
    ],
    ...overrides,
  }
}

test('collectSubagentTree discovers children and grandchildren recursively while skipping external and cycles', () => {
  const projections: Record<string, { readonly values: ProjectionValues }> = {
    'main-1': {
      values: {
        subagentCatalog: [
          { id: 'c1', mode: 'one-shot', label: 'worker-1', createdAt: 100 },
          { id: 'ext-1', mode: 'external', label: 'gate', createdAt: 120 },
        ],
      },
    },
    c1: {
      values: {
        subagentCatalog: [
          { id: 'gc1', mode: 'continuable', label: 'helper', createdAt: 200 },
          { id: 'main-1', mode: 'continuable', label: 'cycle' },
        ],
      },
    },
  }
  const tree = collectSubagentTree('main-1', projections)
  assert.deepEqual(tree.map(n => [n.id, n.parentId, n.depth]), [
    ['c1', 'main-1', 1],
    ['gc1', 'c1', 2],
  ])
})

test('buildFleetModel fuses session projections with live-board.json, builds alerts, aggregates tokens, and filters cleanly', () => {
  const projections: Record<string, { readonly values: ProjectionValues }> = {
    'main-1': {
      values: {
        subagentCatalog: [
          { id: 'hz-task-1-a1-abc123', mode: 'one-shot', label: 'task-1 写手', createdAt: 1_000 },
          { id: 'hz-task-2-a1-def456', mode: 'one-shot', label: 'task-2 审查', createdAt: 500 },
        ],
        tokenUsage: { uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 300, cacheWriteTokens: 0 },
      },
    },
    'hz-task-1-a1-abc123': {
      values: {
        graphLive: live({
          pendingApproval: { id: 'apr-1', toolName: 'Bash', since: 2_500 },
        }),
        subagentTiming: { settledMs: 200, active: { since: 1_000, through: 2_500 } },
        tokenUsage: { uncachedInputTokens: 200, outputTokens: 100, cacheReadTokens: 600, cacheWriteTokens: 100 },
      },
    },
    'hz-task-2-a1-def456': {
      values: {
        graphLive: live({
          provider: 'glm-start-plan',
          model: 'glm-5.3-flash',
          turnSince: null,
          phase: 'ended',
          turnEndReason: 'completed',
          tool: null,
        }),
        subagentTiming: { settledMs: 400, lastTurnCompleted: true },
        tokenUsage: { uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 100, cacheWriteTokens: 0 },
      },
    },
  }

  const all = buildFleetModel({
    rootSessionId: 'main-1',
    projections,
    board: boardFixture(),
    now: 4_000,
    filter: 'all',
  })

  assert.deepEqual(all.counts, { all: 3, running: 2, attention: 1, done: 1 })
  assert.equal(all.slots.activeWorkers, 1)
  assert.equal(all.slots.peakCap, 1)
  // Root (450) + c1 (1000) + c2 (250) = 1700 total; cacheRead=1000, totalInput=1500 -> 67%
  assert.equal(all.tokens.total, 1700)
  assert.equal(all.tokens.cacheHitPercent, 67)
  // Alerts: 1 plan request + 1 pendingApproval + 1 peak reduce
  assert.equal(all.alerts.length, 3)
  assert.deepEqual(all.alerts.map(a => a.kind), ['request', 'approval', 'drive-wait'])
  // Groups: task-1 (attention+running) comes first, then goal-1 (running walk job), then task-2 (done)
  assert.deepEqual(all.groups.map(g => g.key), ['task-1', 'goal-1', 'task-2'])
  assert.equal(all.groups[0]?.agents[0]?.providerLabel, '个人套餐')
  assert.equal(all.groups[2]?.agents[0]?.providerLabel, '免费套餐')

  const attentionOnly = buildFleetModel({
    rootSessionId: 'main-1',
    projections,
    board: boardFixture(),
    now: 4_000,
    filter: 'attention',
  })
  assert.equal(attentionOnly.groups.length, 1)
  assert.equal(attentionOnly.groups[0]?.key, 'task-1')
})

test('formatting helpers, chat resource URI, session preview, and commands tail work cleanly', () => {
  assert.equal(formatProviderLabel('glm-zcode'), '个人套餐')
  assert.equal(formatProviderLabel('glm-start-plan'), '免费套餐')
  assert.equal(formatProviderLabel('openai'), 'openai')
  assert.equal(formatDuration(45_000), '45s')
  assert.equal(formatDuration(125_000), '2m 5s')
  assert.equal(formatTokensCompact(12_340), '12.3K')
  assert.equal(
    subagentChatAddress('c/1', 'p/1', 'one-shot'),
    'dsh-resource://subagentchat/session/c%2F1?parent=p%2F1&mode=one-shot',
  )

  const preview = extractSessionPreview([
    { type: 'event', event: { type: 'assistant/message', seq: 1, time: 100, data: { message: { content: [{ type: 'text', text: 'Working on it' }] } } } },
    { type: 'transient', event: { type: 'assistant/live-chunk', seq: 2, time: 150, data: { chunk: { delta: 'streaming ' } } } },
    { type: 'transient', event: { type: 'assistant/live-chunk', seq: 3, time: 160, data: { chunk: { delta: 'more' } } } },
  ])
  assert.deepEqual(preview, [
    { kind: 'assistant', text: 'Working on it' },
    { kind: 'streaming', text: 'streaming more' },
  ])

  const cmds = parseCommandsTail([
    JSON.stringify({ command: 'npm test', ok: true }),
    JSON.stringify({ name: 'Edit', path: 'src/a.ts', exit: 1 }),
    'not-json-line',
  ].join('\n'))
  assert.deepEqual(cmds, [
    { line: 'npm test', ok: true },
    { line: 'Edit src/a.ts', ok: false },
    { line: 'not-json-line' },
  ])
})

test('SUBAGENTS_CSS enforces light-theme contrast and prefers-reduced-motion', () => {
  assert.ok(SUBAGENTS_CSS.includes(`body:not([data-ds-dark-theme]) .glms{--s-ink3:${SUBAGENT_LIGHT_TOKENS.ink3};--s-link:${SUBAGENT_LIGHT_TOKENS.link}}`))
  assert.ok(SUBAGENTS_CSS.includes('@media (prefers-reduced-motion:reduce)'))
})

test('client ExecuteLiveBoard and host ExecuteLiveBoard schemas remain mutually assignable', () => {
  const clientBoard: ExecuteLiveBoard = boardFixture()
  const hostBoard: HostExecuteLiveBoard = clientBoard
  const roundTrip: ExecuteLiveBoard = hostBoard
  assert.equal(roundTrip.version, 1)
  assert.equal(roundTrip.dispatchMode, 'eco')

  const model = buildFleetModel({
    rootSessionId: 'main-1',
    projections: {},
    board: boardFixture({ dispatchMode: 'burn' }),
    now: 5_000,
    filter: 'all',
  })
  assert.equal(model.dispatchMode, 'burn')
})
