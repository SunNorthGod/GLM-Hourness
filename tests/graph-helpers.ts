/**
 * Shared pieces of the project graph specs: seeding a graph as the human, a
 * test wrapper that removes the fixture directory afterwards, console.warn
 * capture, and the JSON answer of the command line and the DSH graph tools.
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openEngine, type ApplyResult, type EngineOptions, type GraphEngine } from '../src/graph/engine.ts'
import type { EngineError } from '../src/graph/mutation.ts'
import type { OpenItems, Projection } from '../src/graph/projection.ts'
import type { Actor, GraphNode } from '../src/graph/schema.ts'
import { loadGraph } from '../src/graph/store.ts'

/**
 * A JSON answer of the command line or a graph tool: one
 * of their result shapes (a refusal, a projection, the open items, a write).
 * Each test reads the fields of the shape it expects; a field the answer
 * lacks fails that test's assertion.
 */
export interface GraphAnswer {
  readonly ok: boolean
  readonly error: EngineError
  readonly projection: Projection
  readonly items: OpenItems
  readonly id: string
  readonly rev: string
  readonly revision: string
  readonly node: GraphNode
  readonly changed: readonly string[]
}

/** Propose each node as the human, in order; the engine numbers the ids per type unless a node names its own. */
export async function seedAsHuman(dir: string, nodes: readonly Record<string, unknown>[], options: EngineOptions = {}): Promise<void> {
  const engine = openEngine(dir, options)
  for (const node of nodes) {
    const result = await engine.apply('human', { op: 'propose', reason: '建图', node })
    assert.ok(result.ok, JSON.stringify(result))
  }
}

/** Tests on a fixture that owns a temporary directory: each test makes a fresh one and removes it afterwards. */
export function fixtureTest<F extends { readonly dir: string }>(make: () => Promise<F>): (name: string, body: (fixture: F) => Promise<void>) => void {
  return (name, body) => {
    test(name, async () => {
      const fixture = await make()
      try {
        await body(fixture)
      }
      finally {
        await rm(fixture.dir, { recursive: true, force: true })
      }
    })
  }
}

/** Run `body` with console.warn captured. */
export async function captureWarnings<T>(body: (live: string[]) => T): Promise<{ result: Awaited<T>, warnings: string[] }> {
  const warnings: string[] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')) }
  try {
    return { result: await body(warnings), warnings }
  }
  finally {
    console.warn = original
  }
}

export type Success = Extract<ApplyResult, { ok: true }>

export function must(result: ApplyResult): Success {
  assert.ok(result.ok, `expected success, got ${JSON.stringify(result)}`)
  return result
}

/** The engine refused with `code` (and on `field` when given), and said what to do instead. */
export function refused(result: ApplyResult, code: string, field?: string): void {
  assert.equal(result.ok, false, `expected ${code}, got success`)
  const { error } = result
  assert.equal(error.code, code, JSON.stringify(error))
  if (field !== undefined) assert.equal(error.field, field, JSON.stringify(error))
  assert.ok(error.hint.length > 0, 'every refusal names the way forward')
}

export interface EngineFixture {
  readonly dir: string
  readonly engine: GraphEngine
  readonly rev: (id: string) => Promise<string>
  readonly node: (id: string) => Promise<GraphNode>
  readonly run: (actor: Actor, mutation: Record<string, unknown>) => Promise<Success>
  /** Apply a mutation with the current rev of mutation.id filled in. */
  readonly act: (actor: Actor, mutation: Record<string, unknown>) => Promise<ApplyResult>
}

/** The engine over a fresh graph directory, its clock one second further at each call from 08:00 on `day` of October 2026; `seed` writes the nodes the test starts from. */
export async function engineFixture(prefix: string, day: number, seed: (fixture: EngineFixture) => Promise<void>): Promise<EngineFixture> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  let tick = 0
  const engine = openEngine(dir, { now: () => new Date(Date.UTC(2026, 9, day, 8, 0, tick++)) })
  const rev = async (id: string): Promise<string> => (await loadGraph(dir)).revisions.get(id)!
  const node = async (id: string): Promise<GraphNode> => (await loadGraph(dir)).nodes.get(id)!
  const run = async (actor: Actor, mutation: Record<string, unknown>): Promise<Success> => must(await engine.apply(actor, mutation))
  const act = async (actor: Actor, mutation: Record<string, unknown>): Promise<ApplyResult> => engine.apply(actor, { ...mutation, rev: await rev(mutation.id as string) })
  const fixture = { dir, engine, rev, node, run, act }
  await seed(fixture)
  return fixture
}