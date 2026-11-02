/**
 * The DSH client services the UI bundle uses, as far as it uses them
 * (docs/DEVELOPMENT.md §5.6). Shapes come from the rc.3 client bundles in
 * reference/dsh-desktop-0.2.1-rc.3: dsh-client-ui-sidebar-files and
 * dsh-client-ui-sidebar-documentpreview (tab registration, slot inject,
 * remote.workspaceFiles list / readBytes / changes through remote.$stream),
 * dsh-api-session-controller and dsh-client-ui-subagent (the sessions
 * service, its projection values), and this bundle's own use of
 * remote.commands.execute.
 */
import type { ComponentType } from 'react'
import type { LiveView } from '../../src/graph/live.ts'

/** A Remote call's settled value (Typert RemoteResult). */
type RemoteResult<T> =
  | { readonly ok: true, readonly value: T }
  | { readonly ok: false, readonly error: { readonly code: string, readonly message: string } }

interface DirectoryEntry {
  readonly name: string
  readonly type: string
  readonly size?: number
}

/** One frame of a `changes` feed: readiness, then invalidations with the current stat or an absence. */
export type WatchFrame =
  | { readonly kind: 'ready' }
  | { readonly kind: 'change', readonly change: { readonly absolutePath: string, readonly absent?: true } }

interface WorkspaceFilesRemote {
  list(sessionId: string, path: string, signal?: AbortSignal): Promise<RemoteResult<{ readonly path: string, readonly entries: readonly DirectoryEntry[], readonly truncated: boolean }>>
  /** Identity, version and size of one regular file, without content (dsh-api-workspace-files). */
  stat(sessionId: string, path: string, signal?: AbortSignal): Promise<RemoteResult<{ readonly absolutePath: string, readonly version: string, readonly bytes?: number }>>
  readBytes(sessionId: string, path: string, options: Record<string, never>, signal?: AbortSignal): Promise<RemoteResult<{ readonly absolutePath: string, readonly version: string, readonly bytes?: number, readonly offset: number, readonly data: Uint8Array, readonly eof: boolean }>>
  changes(sessionId: string, path: string, lifetime: AbortSignal): unknown
}

/** One item of a supervised Remote stream; a ready frame must be accepted. */
export interface StreamItem<T> {
  readonly value: T
  accept(): void
}

interface SupervisedStream<T> extends AsyncIterable<StreamItem<T>> {
  dispose(): Promise<void>
}

export interface CommandsRemote {
  execute(sessionId: string, line: string, attachments: readonly never[]): Promise<RemoteResult<{ readonly result: { readonly kind: 'success' | 'error', readonly text?: string } } | undefined>>
}

export interface RemoteRoot {
  readonly workspaceFiles: WorkspaceFilesRemote
  readonly commands: CommandsRemote
  $stream<T>(spec: { readonly name: string, open(lifetime: AbortSignal): unknown, ended(): Error }): SupervisedStream<T>
}

interface GuideEntry {
  readonly id: string
  readonly order: number
  title(): string
  description?(): string
  readonly icon?: ComponentType<{ readonly size?: number, readonly className?: string }>
}

interface TabDefinition {
  readonly id: string
  readonly kind: string
  readonly priority?: 'extension' | 'builtin' | 'fallback'
  readonly keepMounted?: boolean
  title(): string
  readonly guide?: readonly GuideEntry[]
}

interface SlotRegistration<P> {
  readonly name: string
  readonly id?: string
  readonly key?: string
  readonly order?: number
  readonly label?: string
  /** Session slots: props the body receives in addition to the framework's. */
  inject?(sessionId: string, actions: unknown): P
}

/** One entry of DSH's subagentCatalog projection (dsh-subagent), as the host snapshot carries it. */
interface CatalogEntry {
  readonly id: string
  readonly label?: string
  readonly mode: string
  readonly createdAt?: number
}

/** DSH's tokenUsage projection: four disjoint provider-usage buckets. */
export interface TokenUsage {
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

/** The projection values of one session the panel reads; graphLive is this bundle's own unit, the two hourness keys are the wire views of the memory and lessons rows (src/memory/index.ts, src/lessons/index.ts). */
export interface ProjectionValues {
  readonly graphLive?: LiveView
  readonly subagentCatalog?: readonly CatalogEntry[]
  readonly tokenUsage?: TokenUsage
  readonly hournessLessons?: { readonly journal: string | null }
  readonly hournessMemory?: { readonly projectJournal: string | null, readonly userJournal: string | null }
}

/**
 * The client `sessions` service (dsh-api-session-controller ClientSessions):
 * `list` is a snapshot store whose projectionsBySession follows the host's
 * live control stream (every projection change of every live session);
 * refreshProjections reads the values of a session that has none yet.
 */
export interface SessionsClient {
  readonly list: {
    getSnapshot(): { readonly projectionsBySession: Readonly<Record<string, { readonly values: ProjectionValues, readonly state?: string } | undefined>> }
    subscribe(listener: () => void): () => void
  }
  refreshProjections(sessionId: string): Promise<void>
}

export interface ClientContext {
  readonly sessions: SessionsClient
  readonly slots: {
    inject(name: string, register: () => () => void): () => void
    register<P>(registration: SlotRegistration<P>, component: ComponentType<never>): () => void
  }
  readonly sidebarRightTabs: { register(definition: TabDefinition): () => void }
  readonly remote: RemoteRoot
  effect(body: () => () => void, label?: string): void
}
