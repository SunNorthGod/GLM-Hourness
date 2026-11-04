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

export interface WorkspaceFilesRemote {
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

/** One command the session offers, as `remote.commands.list` returns it (dsh-client-ui-commands reads `name`; only the name is read here). */
interface CommandDescriptor {
  readonly name: string
}

interface CommandsRemote {
  execute(sessionId: string, line: string, attachments: readonly never[]): Promise<RemoteResult<{ readonly result: { readonly kind: 'success' | 'error', readonly text?: string } } | undefined>>
  /** The commands of a retained, open session (dsh-client-ui-commands lib/client.js CommandDirectory). */
  list(sessionId: string): Promise<RemoteResult<readonly CommandDescriptor[]>>
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

/**
 * The projection values of one session this bundle reads; graphLive and
 * hournessMainAgent are this bundle's own units (the second is read through
 * mainAgentActive, which takes the table as a whole, hence the index signature),
 * hournessProject is the graph-panel row's holder-record pointer (plain-ui
 * 1.3 §4.9), the two hourness keys after it are the wire views of the memory
 * and lessons rows (src/memory/index.ts, src/lessons/index.ts), and
 * hournessLoops is where the loop row's page finds the project's view.json
 * (src/loops/projection.ts).
 */
export interface ProjectionValues {
  readonly graphLive?: LiveView
  readonly subagentCatalog?: readonly CatalogEntry[]
  readonly tokenUsage?: TokenUsage
  readonly hournessProject?: { readonly holderFile: string | null, readonly reason?: string }
  readonly hournessLessons?: { readonly journal: string | null }
  readonly hournessMemory?: { readonly projectJournal: string | null, readonly userJournal: string | null }
  readonly hournessLoops?: { readonly projectKey: string | null, readonly viewFile: string | null }
  /** The metrics row's wire view (src/metrics/index.ts): where the board's `view.json` is, or why there is none. */
  readonly hournessMetrics?: { readonly viewFile: string | null, readonly reason?: string }
  readonly [key: string]: unknown
}

/** The fields of a session's snapshot the /wish entry reads (dsh-api-session-controller lib/types/client/sessions/session.js:832-835). */
interface SessionFields {
  readonly blank: boolean
  readonly promptAttempted: boolean
  readonly running: boolean
}

/** The fields of the input source the /wish entry reads (dsh-client-ui-conversation lib/client.js InputBar: `input.draft`). */
interface InputFields {
  readonly draft: string
}

/** Standard prop of session slots: reads the slot session's snapshot through a selector (a hook; the selector returns a primitive). */
export type UseSession = <T>(select: (snapshot: SessionFields | undefined) => T) => T

/** Standard prop of session slots: reads the session's input source through a selector (a hook). */
export type UseInput = <T>(select: (input: InputFields | undefined) => T) => T

/** Standard prop `inputActions` (dsh-client-ui-conversation SessionInputShell.actions); only the draft setter is used. */
export interface InputActions {
  setDraft(text: string): void
}

/** What the dock slot components receive: the registration's inject result plus the standard props, which a third-party component may not get. */
export interface SessionSlotProps {
  readonly sessionId: string
  readonly useSession?: UseSession
  readonly useInput?: UseInput
  readonly inputActions?: InputActions
}

/**
 * The client `sessions` service (dsh-api-session-controller ClientSessions):
 * `list` is a snapshot store whose projectionsBySession follows the host's
 * live control stream (every projection change of every live session);
 * refreshProjections reads the values of a session that has none yet.
 */
export interface SessionsClient {
  readonly list: {
    getSnapshot(): {
      readonly projectionsBySession: Readonly<Record<string, { readonly values: ProjectionValues, readonly state?: string } | undefined>>
      /**
       * The session summaries; `blank` is true until the first prompt
       * (api-session-controller lib/client.js:4148-4163). The fields the
       * main chat's fallback reads (plain-ui 1.3 §4.9 step 4) come from
       * the same summary: the working directory and the projection values.
       */
      readonly byId: Readonly<Record<string, {
        readonly blank?: boolean
        readonly cwd?: string
        readonly projectionValues?: ProjectionValues
      } | undefined>>
    }
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
  /** dsh-client-ui-sidebar-right's navigation face (README, openTab): opens a page tab by kind; throws when no session surface is mounted. */
  readonly sidebarRight: { openTab(kind: string, options?: { readonly params?: Record<string, unknown> }): void }
  readonly remote: RemoteRoot
  /** dsh-client-ui-workspace: opens a session in the main view (README, uiWorkspace.openSession). */
  readonly uiWorkspace: UiWorkspace
  effect(body: () => () => void, label?: string): void
}

/** The client `uiWorkspace` service as far as the panel uses it (dsh-client-ui-workspace README): jump to the main agent's conversation. */
export interface UiWorkspace {
  /** Replace the main view with the named session (a session id); synchronous, history loads in the target view. */
  openSession: (target: string) => void
}
