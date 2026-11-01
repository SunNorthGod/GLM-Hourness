/**
 * Shared pieces of the memory tool and row specs: a memory environment over
 * real temporary directories (the journals, the lock and the migration are
 * the real ones), agents with a session header, and the answer of a tool
 * that refused.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ParsedRef } from '../src/data/evidence.ts'
import type { MemoryEnv, NoteKey, Places, SourceCheck } from '../src/memory/storage.ts'
import { memoryTools } from '../src/memory/tools.ts'
import type { AgentLike, PluginContext, ToolDefinitionLike } from '../src/shared/dsh-min.ts'

/** An agent with a session header; `subagent` makes it a delegated child. */
export function agentOf(id: string, header: { readonly cwd?: string, readonly subagent?: boolean } = {}): AgentLike {
  return {
    id,
    ctx: {} as PluginContext,
    session: { id, header: { id, ...(header.cwd === undefined ? {} : { cwd: header.cwd }), ...(header.subagent === true ? { origin: 'subagent' as const } : {}) }, deriveMessages: () => [] },
  }
}

export interface MemoryFixture {
  /** A temporary directory that holds everything below. */
  readonly root: string
  readonly places: Places
  readonly notes: Array<{ readonly sessionId: string | undefined, readonly key: NoteKey, readonly text: string | undefined }>
  readonly env: MemoryEnv
  readonly tools: ReadonlyMap<string, ToolDefinitionLike>
  /** Run a memory tool as `agent` (the main agent by default); resolves to the tool's value. */
  call(name: string, args: unknown, agent?: AgentLike): Promise<Record<string, unknown>>
  dispose(): void
}

export interface FixtureOptions {
  /** Nodes and files the sources of a project memory may name. Everything else is missing; `node:`-less ids and paths both count. */
  readonly known?: readonly string[]
  /** Replaces the places (no project, or no user directory); it gets the fixture's temporary directory. */
  readonly places?: (root: string) => Places
  /** The clock; default 2026-11-01T12:00:00Z. */
  readonly now?: Date
  readonly append?: MemoryEnv['append']
}

export const MAIN = agentOf('main-session', { cwd: 'C:/work/project' })

/** A memory environment over temporary directories, and the three tools over it. */
export function memoryFixture(options: FixtureOptions = {}): MemoryFixture {
  const root = mkdtempSync(join(tmpdir(), 'memory-'))
  const places: Places = options.places?.(root) ?? { project: join(root, 'project'), user: join(root, 'user', 'memory') }
  const known = new Set(options.known ?? [])
  const notes: MemoryFixture['notes'] = []
  const check: SourceCheck = {
    inspect: (ref: ParsedRef) => ref.kind === 'node' || ref.kind === 'other' ? (known.has(ref.id) || known.has(ref.text) ? 'ok' : 'missing') : 'ok',
  }
  const env: MemoryEnv = {
    places: () => places,
    sources: () => Promise.resolve(check),
    now: () => options.now ?? new Date('2026-11-01T12:00:00Z'),
    note: (sessionId, key, text) => { notes.push({ sessionId, key, text }) },
    ...(options.append === undefined ? {} : { append: options.append }),
  }
  const tools = new Map(memoryTools(env).map(tool => [tool.name, tool]))
  return {
    root,
    places,
    notes,
    env,
    tools,
    async call(name, args, agent = MAIN) {
      const tool = tools.get(name)
      assert.ok(tool !== undefined, name)
      return await tool.execute(args, { agent, callId: 'call-1', signal: new AbortController().signal, deferContext: () => {}, concludeTurn: () => {} }) as Record<string, unknown>
    },
    dispose: () => { rmSync(root, { recursive: true, force: true }) },
  }
}

/** The refusal a tool answered with: the JSON after "Error: ", which the tool body throws as the error message. */
export async function refusalOf(promise: Promise<unknown>): Promise<{ readonly code: string, readonly message: string, readonly field?: string, readonly hint?: string }> {
  try {
    await promise
  }
  catch (error) {
    return JSON.parse((error as Error).message) as { code: string, message: string, field?: string, hint?: string }
  }
  assert.fail('the tool was expected to refuse')
}

