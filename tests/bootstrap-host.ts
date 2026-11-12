/**
 * What the takeover specs share (tests/bootstrap-scan.spec.ts,
 * tests/bootstrap-row.spec.ts, tests/bootstrap-paths.spec.ts): git with a
 * fixed identity, the fake host with the design row and the takeover row, a
 * root agent the person makes the main agent with /wish, /hourness-init, the
 * takeover journal read back as records, and an empty scan result.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { apply as applyBootstrap } from '../src/bootstrap/index.ts'
import type { ScanResult } from '../src/bootstrap/scan.ts'
import { BOOTSTRAP_SERVICE } from '../src/bootstrap/service.ts'
import { journalPath } from '../src/bootstrap/takeover.ts'
import { apply as applyDesign } from '../src/design/index.ts'
import { designHost, type DesignHost, type FakeAgent } from './design-host.ts'

export const git = (cwd: string, ...args: string[]): string => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' })

/** A host with the design row and the takeover row, the takeover row loaded second (its order in the patch). */
export function takeoverHost(): DesignHost {
  const made = designHost()
  // rc.3 serves sessionProjections through ctx.get as well (src/data/main-agent.ts reads it there); the design host only injects it.
  made.ctx.provide?.('sessionProjections', made.projections)
  applyDesign(made.ctx)
  applyBootstrap(made.ctx)
  return made
}

/** A root agent of `workspace`, announced to the rows; with `wish` the person makes it the main agent with /wish (no words). */
export async function rootAgent(made: DesignHost, id: string, workspace: string, wish = true): Promise<FakeAgent> {
  const agent = made.addAgent(id, { workspace })
  await made.created(agent)
  if (wish) assert.equal((await made.execute(agent, '/wish'))?.result.kind, 'success')
  return agent
}

/**
 * A root agent that became the main agent with a /wish that had no takeover
 * to call (design 0.6 §3.1, the transition path): the takeover service is
 * withdrawn for that one /wish, as it is while the takeover row is off, and
 * put back after. The takeover then opens with /hourness-init.
 */
export async function transitionAgent(made: DesignHost, id: string, workspace: string): Promise<FakeAgent> {
  const service = made.services.get(BOOTSTRAP_SERVICE)
  made.services.delete(BOOTSTRAP_SERVICE)
  try {
    return await rootAgent(made, id, workspace)
  }
  finally {
    if (service !== undefined) made.services.set(BOOTSTRAP_SERVICE, service)
  }
}

/** `/hourness-init` with `input` as the person sends it, and its result. */
export async function init(made: DesignHost, agent: FakeAgent, input = ''): Promise<{ readonly kind: string, readonly text: string }> {
  const run = await made.execute(agent, input === '' ? '/hourness-init' : `/hourness-init ${input}`)
  assert.ok(run !== undefined, '/hourness-init is registered')
  return run.result
}

/** A scan result with nothing in it but what `overrides` sets, for the pure functions that read one. */
export function scanFixture(overrides: Partial<ScanResult>): ScanResult {
  return {
    version: 1,
    root: '/r',
    at: '2026-11-05T00:00:00.000Z',
    ms: 0,
    git: { state: 'repo', toplevel: '/r', head: 'abc', commits: 1, remotes: [], tags: [], submodules: [], lfs: [] },
    files: { tracked: 0, code: 0, byExtension: {}, topDirs: [] },
    workspace: { loose: [] },
    stacks: [],
    sources: { from: 'head', manifests: [], ci: [], taskFiles: [], hookTools: [] },
    candidates: [],
    unreadable: [],
    checkers: { configs: [], pyprojectTools: [] },
    docs: { root: [], files: [], adr: [] },
    issues: { read: false, reason: 'x' },
    graph: { dir: '/r/docs/graph', rel: 'docs/graph', present: false, nodes: 0 },
    truncated: [],
    ...overrides,
  }
}

/** One record of the takeover journal. */
export interface JournalLine {
  readonly op: string
  readonly id: string
  readonly data?: Record<string, unknown>
}

/** The takeover journal of a project root; empty when there is none. */
export const journal = (root: string): JournalLine[] =>
  existsSync(journalPath(root)) ? readFileSync(journalPath(root), 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as JournalLine) : []
