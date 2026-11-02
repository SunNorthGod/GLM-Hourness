/**
 * Memory tools (memory_store / memory_query / memory_forget): model-facing
 * surface over the persistent store. They register through the normal tools
 * seam; GLM tool search keeps them resident (ORCHESTRATION.md §8,
 * src/toolsearch/exposure.ts). The git policy refuses storing what the
 * repository can already answer.
 */
import type { ToolDefinitionLike } from '../shared/dsh-min.ts'
import { forget, loadStore, remember, retrieve, saveStore, shouldStore, strengthen, type MemoryStoreData } from './store.ts'

export interface ToolStoreIo {
  load(): Promise<MemoryStoreData>
  save(store: MemoryStoreData): Promise<void>
}

/** Build load/save IO over the store filesystem layer. */
export function storeIo(fs: { readFile(path: string): Promise<string>, writeFile(path: string, data: string): Promise<void>, rename(from: string, to: string): Promise<void> }, home: string): ToolStoreIo {
  return {
    load: () => loadStore(fs, home),
    save: store => saveStore(fs, home, store),
  }
}

/**
 * Default git-knowability heuristic: text mentioning file paths or repo
 * artifacts is answerable from the repository, so memory refuses it. Inject
 * a stronger predicate (git grep, LSP) at the row config boundary.
 */
export function defaultKnowableFromGit(text: string): boolean {
  return /[\w.-]+\/[\w.-]+/.test(text) || /\b[\w-]+\.(ts|js|md|json|py|go|rs|yml|yaml|toml)\b/.test(text)
}

const STORE_PARAMETERS = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Stable entry id; re-storing the same id updates it and counts as a review.' },
    text: { type: 'string', description: 'The durable fact to remember. Only store what the repository cannot answer.' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Topic tags used to focus later retrieval.' },
  },
  required: ['id', 'text'],
} as const

const QUERY_PARAMETERS = {
  type: 'object',
  properties: {
    focus: { type: 'string', description: 'Space-separated keywords; entries are ranked by keyword hits times recall strength.' },
    limit: { type: 'number', description: 'Maximum entries to return (default 5).' },
  },
  required: ['focus'],
} as const

const FORGET_PARAMETERS = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Entry id to delete.' },
  },
  required: ['id'],
} as const

function jsonRender(fallback: string): NonNullable<ToolDefinitionLike['output']>['render'] {
  return (_args, value) => [{ type: 'text', text: JSON.stringify(value) ?? fallback }]
}

/** Build the three memory tools over injected store IO and git policy. */
export function memoryTools(io: ToolStoreIo, knowableFromGit: (text: string) => boolean = defaultKnowableFromGit): ToolDefinitionLike[] {
  return [
    {
      name: 'memory_store',
      description: 'Store a durable cross-session fact in the agent memory. Only what git cannot answer belongs here; repository-knowable text is refused.',
      parameters: STORE_PARAMETERS,
      output: { schema: { type: 'object', properties: { stored: { type: 'boolean' }, reason: { type: 'string' } } }, render: jsonRender('{}') },
      async execute(args) {
        const input = args as { id: string, text: string, tags?: string[] }
        if (!shouldStore(input.text, knowableFromGit)) {
          return { stored: false, reason: 'refused: this fact looks answerable from the repository (file path or artifact name); store only what git cannot answer' }
        }
        const store = await io.load()
        const next = remember(store, { id: input.id, text: input.text, tags: input.tags ?? [] }, new Date().toISOString())
        await io.save(next)
        return { stored: true, reviews: next.entries.find(entry => entry.id === input.id)?.reviews ?? 1 }
      },
    },
    {
      name: 'memory_query',
      description: 'Recall memorized facts by keyword focus, strongest first. Untouched memories decay (14-day half-life); each confirmed recall strengthens them.',
      parameters: QUERY_PARAMETERS,
      output: { schema: { type: 'object', properties: { matches: { type: 'array' } } }, render: jsonRender('{}') },
      async execute(args) {
        const input = args as { focus: string, limit?: number }
        const now = new Date().toISOString()
        const store = await io.load()
        const entries = retrieve(store, input.focus, now, input.limit ?? 5)
        // Confirmed recall strengthens the entries (Law of Knowledge Decay).
        if (entries.length > 0) {
          await io.save(strengthen(store, entries.map(entry => entry.id), now))
        }
        const matches = entries
          .map(entry => ({ id: entry.id, text: entry.text, tags: entry.tags, reviews: entry.reviews + 1 }))
        return { matches }
      },
    },
    {
      name: 'memory_forget',
      description: 'Delete one memory entry by id.',
      parameters: FORGET_PARAMETERS,
      output: { schema: { type: 'object', properties: { deleted: { type: 'boolean' } } }, render: jsonRender('{}') },
      async execute(args) {
        const input = args as { id: string }
        const store = await io.load()
        const outcome = forget(store, input.id)
        if (outcome.existed) await io.save(outcome.store)
        return { deleted: outcome.existed }
      },
    },
  ]
}
