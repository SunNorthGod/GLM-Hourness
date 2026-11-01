/**
 * Shared pieces of the project graph specs: seeding a graph as the human, a
 * test wrapper that removes the fixture directory afterwards, console.warn
 * capture, and the JSON answer of the command line and the DSH graph tools.
 */
import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import test from 'node:test'
import { openEngine, type EngineOptions } from '../src/graph/engine.ts'
import type { EngineError } from '../src/graph/mutation.ts'
import type { OpenItems, Projection } from '../src/graph/projection.ts'
import type { GraphNode } from '../src/graph/schema.ts'

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
