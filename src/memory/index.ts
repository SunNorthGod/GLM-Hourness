/**
 * dsh-memory row entry: the memory tools over the project directory, and
 * usage per model call via the read-only `llm/stream` waterfall (observe
 * options and chunk usage, always delegate) into the user-level journal the
 * data row provides (docs/DESIGN.md §2.4). Sinks never throw into the
 * caller's stream; without a project directory the memory tools stay off,
 * without the data service the usage journal does.
 */
import { rowJournal, type AuditFs, type UsageRecord } from './audit.ts'
import { memoryTools, storeIo } from './tools.ts'
import { dataHomes } from '../shared/data-home.ts'
import type { TokenUsage } from '../shared/lm-min.ts'
import type { LlmStreamHost, ServiceLookup, ToolsLike } from '../shared/dsh-min.ts'

export interface MemoryConfig {
  /** The project directory (workspace `.llm`): the store at `<home>/memory.json`. The memory tools need it at activation; the row cannot infer the workspace. */
  readonly home?: string
  /** Injected filesystem override for tests. */
  readonly fs?: AuditFs & { readFile?: (path: string) => Promise<string>, writeFile?: (path: string, data: string) => Promise<void> }
  /** Git-knowability predicate for the memory storage policy; defaults to the path/artifact heuristic. */
  readonly knowableFromGit?: (text: string) => boolean
}

/** The row's context: the `llm/stream` waterfall, the injected tools service and the optional data service. */
export type MemoryContext = LlmStreamHost & ServiceLookup & { readonly tools: Pick<ToolsLike, 'register'> }

/** cordis plugin identity: needs the tools service (memory tools family). */
export const name = 'dsh-glm-hourness/memory'
export const inject = ['tools']

/**
 * cordis plugin entry: records one usage line per model call and registers
 * the memory tools. A missing home warns and leaves the tools off
 * (fail-open); activation must never throw, because an activation failure
 * takes the whole host startup down.
 */
export function apply(ctx: MemoryContext, config: MemoryConfig = {}): () => void {
  const disposers: Array<() => void> = []
  if (config.home === undefined || config.home.length === 0) {
    console.warn('dsh-glm-hourness/memory: home is not configured; the memory tools stay off (set config.home)')
  }
  else {
    for (const tool of memoryTools(storeIo(memoryFs(config), config.home), config.knowableFromGit)) {
      disposers.push(ctx.tools.register(tool))
    }
  }
  const journal = rowJournal(name, () => dataHomes(ctx, config.home), config.fs)
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
        void journal.usage(record)
      }
    })()
  }))
  return () => { for (const dispose of disposers) dispose() }
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
