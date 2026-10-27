/**
 * dsh-memory row entry: wires the audit journal into the live seams — usage
 * per model call via the read-only `llm/stream` waterfall (observe options
 * and chunk usage, always delegate), plus exported helpers for the guard and
 * workflow rows to share the same journal. Sinks never throw into the
 * caller's stream; a row without a usable home degrades to a no-op.
 */
import { mkdir, appendFile } from 'node:fs/promises'
import { auditJournal, auditPaths, fsAppender, type AuditJournal, type UsageRecord } from './audit.ts'
import { memoryTools, storeIo } from './tools.ts'
import type { TokenUsage } from '../shared/lm-min.ts'
import type { LlmStreamHost, ToolsLike } from '../shared/dsh-min.ts'

export interface MemoryConfig {
  /** The agent home directory (workspace `.llm`); audit lives under `<home>/audit`, the store at `<home>/memory.json`. Required: the row cannot infer the workspace at activation. */
  readonly home?: string
  /** Injected filesystem override for tests. */
  readonly fs?: { mkdir: (path: string, options: { recursive: boolean }) => Promise<unknown>, appendFile: (path: string, data: string) => Promise<void>, readFile?: (path: string) => Promise<string>, writeFile?: (path: string, data: string) => Promise<void> }
  /** Git-knowability predicate for the memory storage policy; defaults to the path/artifact heuristic. */
  readonly knowableFromGit?: (text: string) => boolean
}

/** The row's context: the `llm/stream` waterfall and the injected tools service. */
export type MemoryContext = LlmStreamHost & { readonly tools: Pick<ToolsLike, 'register'> }

/** cordis plugin identity: needs the tools service (memory tools family). */
export const name = 'dsh-glm-hourness/memory'
export const inject = ['tools']

/**
 * cordis plugin entry: records one usage line per model call and registers
 * the memory tools. A missing home warns and registers nothing (fail-open);
 * activation must never throw, because an activation failure takes the whole
 * host startup down.
 */
export function apply(ctx: MemoryContext, config: MemoryConfig = {}): () => void {
  if (config.home === undefined || config.home.length === 0) {
    console.warn('dsh-glm-hourness/memory: home is not configured; memory tools and usage journal stay off (set config.home)')
    return () => {}
  }
  const home = config.home
  const journal = journalFor({ ...config, home })
  const fs = memoryFs(config)
  const disposers: Array<() => void> = []
  for (const tool of memoryTools(storeIo(fs, home), config.knowableFromGit)) {
    disposers.push(ctx.tools.register(tool))
  }
  disposers.push(ctx.on('llm/stream', (options, next) => {
    return (async function* () {
      let usage: TokenUsage | undefined
      for await (const chunk of next()) {
        if (chunk.type === 'usage') usage = chunk.usage
        yield chunk
      }
      if (usage !== undefined) {
        const record: UsageRecord = {
          at: new Date().toISOString(),
          ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
          provider: options.provider,
          model: options.model,
          ...(options.purpose === undefined ? {} : { purpose: options.purpose }),
          usage,
        }
        void journal.usage(record).catch(() => {}) // sinks never break the stream
      }
    })()
  }))
  return () => { for (const dispose of disposers) dispose() }
}

/** Build the journal for one home directory. */
export function journalFor(config: MemoryConfig): AuditJournal {
  const fs = config.fs ?? { mkdir: (path: string, options: { recursive: boolean }) => mkdir(path, options), appendFile: (path: string, data: string) => appendFile(path, data) }
  return auditJournal(fsAppender(fs), auditPaths(requireHome(config.home)))
}

/** Require an explicitly configured home; an empty value fails loud where a caller chose to mount the journal. */
export function requireHome(home: string | undefined): string {
  if (home === undefined || home.length === 0) {
    throw new Error('dsh-glm-hourness: home must be a non-empty directory')
  }
  return home
}

/** Resolve the store filesystem for a config (audit shape extended with readFile/writeFile/rename). */
function memoryFs(config: MemoryConfig): { readFile(path: string): Promise<string>, writeFile(path: string, data: string): Promise<void>, rename(from: string, to: string): Promise<void> } {
  return {
    readFile: config.fs?.readFile
      ? path => config.fs!.readFile!(path)
      : async path => (await import('node:fs/promises')).readFile(path, 'utf8'),
    writeFile: config.fs?.writeFile
      ? (path, data) => config.fs!.writeFile!(path, data)
      : async (path, data) => (await import('node:fs/promises')).writeFile(path, data),
    rename: async (from, to) => (await import('node:fs/promises')).rename(from, to),
  }
}
