/**
 * The memory tools (memory_store, memory_query, memory_forget; M5 design
 * §3.2 to §3.4): the main agent's surface over the memory journals. They
 * register through the normal tools seam and GLM tool search keeps them
 * resident (src/shared/tool-names.ts). The learning tool (learning_signals,
 * §3.6) is the same agent's read-only view of the corrections the person
 * made; it is deferred on the GLM route. A tool body checks its caller
 * itself, because a tool outside an agent's face still runs when it is
 * called by name: a delegated child is refused with `role`.
 *
 * A refusal is a tool error whose text is `{code, message, field?, hint?}`
 * (as the graph tools do), in English because the model reads it. Whether
 * a write is allowed is decided by the model's own functions
 * (src/memory/model.ts); the tool finds the directories, takes the lock
 * through the journal and turns the outcome into the tool's answer.
 */
import { secretRefusal } from '../data/secret-shape.ts'
import { invalid, isObject, isRefusal, refuse, type Refusal } from '../data/refusal.ts'
import type { AgentLike, SessionLike, ToolDefinitionLike, ToolExecutionContext } from '../shared/dsh-min.ts'
import { checkSourceKnown, checkStore, classify, judgeStore, revokeRecord, revokeRefusal, reviewRecord, storeRecord, strength, type MemoryEntry, type MemoryState, type MemoryType, type Scope } from './model.ts'
import { readDigest } from './digest.ts'
import { visibleEntries } from './recall.ts'
import { dirOfScope, noteWrite, readBoth, writeScope, type MemoryEnv, type ReadOutcome, type WriteResult } from './storage.ts'

/** The example in the description of memory_store; the spec runs it through the same check as a real call. */
export const MEMORY_STORE_EXAMPLE = {
  name: 'lead-with-the-answer',
  type: 'feedback',
  scope: 'all',
  description: 'Start every reply with the answer; keep jargon out',
  body: 'Open with the answer in one sentence, then the reasons.\n**Why:** the user reads replies on a phone between meetings.\n**How to apply:** define a term the first time it appears, or leave it out.',
  relay: 'Start with the answer, and keep jargon out.',
} as const

const STORE_DESCRIPTION = [
  'Save a memory that persists across conversations. Types: user (who the user is), feedback (how the user wants the work done), project (a lead to where this project records something, with its source), reference (an external resource).',
  'Only the user\'s own words make a preference (type user or feedback): put them in relay. Do not copy what the repository already records; store where to find it. Storing an existing name updates that memory.',
  `Example: the user said "Start with the answer, and keep jargon out." Store it as a preference:\nmemory_store ${JSON.stringify(MEMORY_STORE_EXAMPLE, null, 2)}`,
].join('\n')

const STORE_PARAMETERS = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'kebab-case name, unique within its scope; storing the same name again updates the memory.' },
    type: { type: 'string', enum: ['user', 'feedback', 'project', 'reference'], description: 'user and feedback are preferences and never fade; project and reference are facts and fade unless they are recalled.' },
    description: { type: 'string', description: 'One line, at most 200 characters; what the memory index shows.' },
    body: { type: 'string', description: 'At most 4000 characters. For feedback and project, follow the fact with **Why:** and **How to apply:** lines.' },
    scope: { type: 'string', enum: ['project', 'all'], description: '"all" for what is about the user themselves (how they talk, what they decide, how they like to work) and applies in every project; "project" for this project\'s facts, norms and references. Required for type feedback.' },
    value: { type: 'string', enum: ['concise', 'balanced', 'detailed'], description: 'Only for the entry named reporting-depth: how long your reports to the user should be from now on. Pass the user\'s own words in relay.' },
    relay: { type: 'string', description: 'The user\'s own words, exactly as they said them. Required for type user and feedback. If you only guessed a habit from their edits, do not store it.' },
    source: { type: 'array', items: { type: 'string' }, description: 'Where the fact lives: a project graph node id, a file path (optionally with §section), a commit id, or a URL.' },
    learnedFrom: { type: 'array', items: { type: 'string' }, description: 'Keys of the learning groups this memory settles (at most 5).' },
    confirmNew: { type: 'boolean', description: 'Store a new memory even though it is close to an existing one.' },
  },
  required: ['name', 'type', 'description', 'body'],
} as const

const QUERY_PARAMETERS = {
  type: 'object',
  properties: {
    focus: { type: 'string', description: 'Space-separated keywords; memories are ranked by keyword hits times recall strength.' },
    name: { type: 'string', description: 'One memory name, to read that memory in full.' },
    type: { type: 'string', enum: ['user', 'feedback', 'project', 'reference'], description: 'Only memories of this type.' },
    limit: { type: 'number', description: 'Maximum memories to return, 1 to 20 (default 5).' },
  },
} as const

const FORGET_PARAMETERS = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'The memory to forget.' },
    scope: { type: 'string', enum: ['project', 'all'], description: 'Which scope, when both have the name; the project one is taken first.' },
    reason: { type: 'string', description: 'Why, in one sentence; kept in the journal.' },
    relay: { type: 'string', description: 'The user\'s own words, when they asked you to forget it. Required to forget a preference.' },
  },
  required: ['name', 'reason'],
} as const

type Failure = Refusal<string>

/** Throw a refusal as a tool error: the model reads the structured error after "Error: ". */
function fail(refusal: Failure): never {
  throw new Error(JSON.stringify(refusal))
}

const NO_PROJECT = refuse('no_project', 'this session has no project directory: it has no working directory, or it is in the home directory, or in a folder outside git without a .llm folder', undefined, 'store it with scope "all" if it is about the user, or create a .llm folder in the working directory to turn project memory on')
const NO_USER_DIR = refuse('no_user_dir', 'user-level memory is not available: the data directory row is not active')

interface Caller {
  readonly agent: AgentLike | undefined
  readonly session: SessionLike | undefined
  readonly callId: string | undefined
}

/** The calling agent and session of a tool body; a child session is refused. */
function callerSession(exec: unknown): Caller {
  const context = exec as Partial<ToolExecutionContext> | undefined
  const agent = context?.agent
  if (agent?.session?.header.origin === 'subagent') {
    fail(refuse('role', 'only the main agent keeps the memory', undefined, 'Report what you learned in your handback; the main agent keeps memory.'))
  }
  return { agent, session: agent?.session, callId: context?.callId }
}

/** The ids of the host the journal records as the origin of a write. */
function originOf(caller: Caller, tool: string): { readonly session?: string, readonly agent?: string, readonly tool: string, readonly callId?: string } {
  return {
    ...(caller.session === undefined ? {} : { session: caller.session.id }),
    ...(caller.agent === undefined ? {} : { agent: caller.agent.id }),
    tool,
    ...(caller.callId === undefined ? {} : { callId: caller.callId }),
  }
}

/** The tool error of a write that did not happen for a reason that is not the plan's. */
function writeFailure(result: Exclude<WriteResult<unknown>, { readonly status: 'ok' | 'refused' }>): Failure {
  switch (result.status) {
    case 'busy': return refuse('busy', result.lockLost ? 'the memory file\'s lock was taken over before the write; nothing was written' : 'the memory file is in use by another writer', undefined, 'retry in a moment')
    case 'io': return refuse('io', `the memory could not be written (${result.stage}): ${result.message}`)
    case 'legacy': return refuse('io', `the old memory.json cannot be read (${result.reason}); it was left as it is and nothing was written`)
    default: return refuse('io', `internal error, nothing was written: ${result.message}`)
  }
}

/** Tell the row's health how a write went, and turn a write that did not happen into the tool's error. */
function settle(env: MemoryEnv, caller: Caller, result: WriteResult<Failure>): asserts result is Extract<WriteResult<Failure>, { readonly status: 'ok' }> {
  noteWrite(env, caller.session?.id, result)
  if (result.status === 'refused') fail(result.refused)
  if (result.status !== 'ok') fail(writeFailure(result))
}
const scoreWords = (focus: string): string[] => focus.toLowerCase().split(/\s+/).filter(word => word.length > 0)

const round = (value: number): number => Math.round(value * 100) / 100

// --- memory_store ----------------------------------------------------------

async function store(env: MemoryEnv, args: unknown, exec: unknown): Promise<unknown> {
  const caller = callerSession(exec)
  const request = checkStore(args)
  if (isRefusal(request)) fail(request)
  const dir = dirOfScope(env.places(caller.session), request.scope)
  if (dir === undefined) fail(request.scope === 'project' ? NO_PROJECT : NO_USER_DIR)
  let unchecked: string[] = []
  if (request.type === 'project') {
    const check = await env.sources(caller.session)
    const lacking = checkSourceKnown(request.source, ref => check.inspect(ref) !== 'missing')
    if (lacking !== undefined) fail(lacking)
    unchecked = request.source.filter(ref => check.inspect(ref) === 'unchecked').map(ref => ref.text)
  }
  let updated = false
  const result = await writeScope<Failure>(request.scope, dir, (state) => {
    const verdict = judgeStore(state, request)
    if (isRefusal(verdict)) return { refused: verdict }
    updated = verdict.updated
    return {
      records: [storeRecord(request, {
        actor: 'llm',
        by: originOf(caller, 'memory_store'),
        // The words of a preference are not checked against the person's messages yet.
        ...(classify(request.type) === 'preference' ? { relayChecked: false } : {}),
      })],
    }
  }, env.append)
  settle(env, caller, result)
  return {
    stored: true,
    name: request.name,
    scope: request.scope,
    kind: classify(request.type),
    updated,
    ...(unchecked.length === 0 ? {} : { uncheckedSources: unchecked }),
  }
}

// --- memory_query ----------------------------------------------------------

interface QueryRequest {
  readonly focus?: string
  readonly name?: string
  readonly type?: MemoryType
  readonly limit: number
}

const QUERY_KEYS: readonly string[] = ['focus', 'name', 'type', 'limit']
const TYPES: readonly string[] = ['user', 'feedback', 'project', 'reference']

function checkQuery(args: unknown): QueryRequest | Refusal<'invalid'> {
  if (!isObject(args)) return invalid(undefined, 'arguments must be an object')
  const extra = Object.keys(args).find(key => !QUERY_KEYS.includes(key))
  if (extra !== undefined) return invalid(extra, `unknown field ${extra}`)
  const { focus, name, type, limit } = args
  if (focus === undefined && name === undefined) return invalid(undefined, 'give focus (keywords) or name (one memory)')
  if (focus !== undefined && (typeof focus !== 'string' || focus.trim().length === 0 || focus.length > 500)) return invalid('focus', 'focus must be 1 to 500 characters of keywords')
  if (name !== undefined && (typeof name !== 'string' || name.length === 0 || name.length > 64)) return invalid('name', 'name must be one memory name')
  if (type !== undefined && (typeof type !== 'string' || !TYPES.includes(type))) return invalid('type', `type must be one of ${TYPES.join(', ')}`)
  if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 20)) return invalid('limit', 'limit must be a whole number from 1 to 20')
  return {
    ...(typeof focus === 'string' ? { focus } : {}),
    ...(typeof name === 'string' ? { name } : {}),
    ...(typeof type === 'string' ? { type: type as MemoryType } : {}),
    limit: typeof limit === 'number' ? limit : 5,
  }
}

function matchOf(entry: MemoryEntry, now: string, shadows: boolean): Record<string, unknown> {
  return {
    name: entry.name,
    scope: entry.scope,
    type: entry.type,
    kind: entry.kind,
    description: entry.description,
    body: entry.body,
    source: entry.source,
    ...(entry.relay === undefined ? {} : { relay: entry.relay }),
    ...(entry.relayChecked === undefined ? {} : { relayChecked: entry.relayChecked }),
    ...(entry.value === undefined ? {} : { value: entry.value }),
    ...(entry.confirmed === undefined ? {} : { confirmed: entry.confirmed }),
    strength: round(strength(entry, now)),
    created: entry.created,
    lastReviewed: entry.lastReviewed,
    ...(shadows ? { shadows: 'all' } : {}),
  }
}

/** The state of an outcome that could be read; the reason of one that could not goes to `notes`. */
function usable(label: string, outcome: ReadOutcome | undefined, notes: string[]): MemoryState | undefined {
  if (outcome === undefined) return undefined
  if (outcome.ok) return outcome.read.state
  notes.push(`${label} memory could not be read: ${outcome.kind === 'legacy' ? `the old memory.json is unreadable (${outcome.reason})` : outcome.reason}`)
  return undefined
}

async function query(env: MemoryEnv, args: unknown, exec: unknown): Promise<unknown> {
  const caller = callerSession(exec)
  const request = checkQuery(args)
  if (isRefusal(request)) fail(request)
  const places = env.places(caller.session)
  const both = await readBoth(places)
  const notes: string[] = []
  const project = usable('project', both.project, notes)
  const user = usable('user-level', both.user, notes)
  if (project === undefined && user === undefined && notes.length > 0) fail(refuse('io', notes.join('; ')))
  if (places.project === undefined) notes.push('this session has no project, so only user-level memory was searched')
  const now = env.now().toISOString()
  const hidden = new Set([...(user?.entries.values() ?? [])].filter(entry => entry.status === 'active').map(entry => entry.name))
  const candidates = visibleEntries(project, user).filter(entry => request.type === undefined || entry.type === request.type)
  const terms = scoreWords(request.focus ?? '')
  const ranked = request.name !== undefined
    ? candidates.filter(entry => entry.name === request.name).map(entry => ({ entry, score: 1 }))
    : candidates
        .map((entry) => {
          const haystack = `${entry.name} ${entry.description} ${entry.body} ${entry.source.join(' ')}`.toLowerCase()
          return { entry, score: terms.filter(term => haystack.includes(term)).length * strength(entry, now) }
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || (a.entry.name < b.entry.name ? -1 : 1))
  const matches = ranked.slice(0, request.limit).map(({ entry }) => entry)
  // A recalled fact counts as reviewed; a preference does not fade, so it has nothing to review. A failed review is only noted.
  const facts = matches.filter(entry => entry.kind === 'fact').map(entry => entry.name)
  if (facts.length > 0 && places.project !== undefined) {
    const reviewed = await writeScope<never>('project', places.project, () => ({ records: [reviewRecord(facts)] }), env.append)
    noteWrite(env, caller.session?.id, reviewed)
  }
  return {
    matches: matches.map(entry => matchOf(entry, now, entry.scope === 'project' && hidden.has(entry.name))),
    ...(notes.length === 0 ? {} : { notes }),
  }
}

// --- memory_forget ---------------------------------------------------------

interface ForgetRequest {
  readonly name: string
  readonly scope?: Scope
  readonly reason: string
  readonly relay?: string
}

const FORGET_KEYS: readonly string[] = ['name', 'scope', 'reason', 'relay']

function checkForget(args: unknown): ForgetRequest | Refusal {
  if (!isObject(args)) return invalid(undefined, 'arguments must be an object')
  const extra = Object.keys(args).find(key => !FORGET_KEYS.includes(key))
  if (extra !== undefined) return invalid(extra, `unknown field ${extra}`)
  const { name, scope, reason, relay } = args
  if (typeof name !== 'string' || name.length === 0 || name.length > 64) return invalid('name', 'name must be the name of a memory')
  if (scope !== undefined && scope !== 'project' && scope !== 'all') return invalid('scope', 'scope must be "project" or "all"')
  if (typeof reason !== 'string' || reason.length < 1 || reason.length > 300) return invalid('reason', 'reason must be 1 to 300 characters')
  if (relay !== undefined && (typeof relay !== 'string' || relay.trim() === '' || relay.length > 500)) return invalid('relay', 'relay must be the user\'s own words, 1 to 500 characters')
  const secret = secretRefusal([['reason', reason], ['relay', relay]])
  if (secret !== undefined) return secret
  return { name, reason, ...(scope === undefined ? {} : { scope }), ...(typeof relay === 'string' ? { relay } : {}) }
}

const notFound = (name: string): Failure => refuse('not_found', `no active memory named ${name}`, 'name', 'memory_query lists what exists')

async function forget(env: MemoryEnv, args: unknown, exec: unknown): Promise<unknown> {
  const caller = callerSession(exec)
  const request = checkForget(args)
  if (isRefusal(request)) fail(request)
  const places = env.places(caller.session)
  const both = await readBoth(places)
  const notes: string[] = []
  const scopes: ReadonlyArray<readonly [Scope, MemoryState | undefined]> = [['project', usable('project', both.project, notes)], ['all', usable('user-level', both.user, notes)]]
  const found = scopes.find(([scope, state]) => (request.scope === undefined || request.scope === scope) && state?.entries.get(request.name)?.status === 'active')
  if (found === undefined) fail(notes.length > 0 ? refuse('io', notes.join('; ')) : notFound(request.name))
  const [scope] = found
  const dir = dirOfScope(places, scope)
  if (dir === undefined) fail(notFound(request.name))
  const who = {
    actor: 'llm' as const,
    ...(request.relay === undefined ? {} : { relay: request.relay }),
    ...(caller.session === undefined ? {} : { session: caller.session.id }),
    ...(caller.agent === undefined ? {} : { agent: caller.agent.id }),
  }
  let kind: MemoryEntry['kind'] = 'fact'
  const result = await writeScope<Failure>(scope, dir, (state) => {
    const entry = state.entries.get(request.name)
    if (entry?.status !== 'active') return { refused: notFound(request.name) }
    const refusal = revokeRefusal(entry, who, 'forget')
    if (refusal !== undefined) return { refused: refusal }
    kind = entry.kind
    return { records: [revokeRecord('forget', entry, request.reason, { actor: 'llm', ...(request.relay === undefined ? {} : { relay: request.relay }), by: originOf(caller, 'memory_forget') })] }
  }, env.append)
  settle(env, caller, result)
  return { forgotten: true, name: request.name, scope, kind }
}

// --- learning_signals ------------------------------------------------------

interface LearningRequest {
  readonly since?: string
  readonly minCount?: number
}

const LEARNING_KEYS: readonly string[] = ['since', 'minCount']

function checkLearning(args: unknown, now: Date): LearningRequest | Refusal<'invalid'> {
  if (args !== undefined && !isObject(args)) return invalid(undefined, 'arguments must be an object')
  const extra = Object.keys(args ?? {}).find(key => !LEARNING_KEYS.includes(key))
  if (extra !== undefined) return invalid(extra, `unknown field ${extra}`)
  const { since, minCount } = args ?? {}
  if (since !== undefined && (typeof since !== 'string' || Number.isNaN(Date.parse(since)) || Date.parse(since) >= now.getTime())) return invalid('since', 'since must be an ISO date or time in the past')
  if (minCount !== undefined && (typeof minCount !== 'number' || !Number.isInteger(minCount) || minCount < 1 || minCount > 50)) return invalid('minCount', 'minCount must be a whole number from 1 to 50')
  return { ...(typeof since === 'string' ? { since } : {}), ...(typeof minCount === 'number' ? { minCount } : {}) }
}

const LEARNING_DESCRIPTION = [
  'Read-only: lists the kinds of correction the person has made to your work, in the last 28 days or since `since`, that happened at least `minCount` times (default 2). Each group has its key, what the key means, how many times it happened, examples, how many memories, lessons and notes already settle it (learned), how many times it came back after the first of those (recurrences) and the counts of the last four weeks (weekly).',
  'Call it when the learning digest reminder arrives or the person asks what could be learned. It writes nothing. Settle a group with memory_store or lessons_merge and name the group key in learnedFrom, or with a graph_comment on the node that starts "学自：" and the key. Example key: edit:task.acceptance, "the person changed the acceptance the agent had set on a task".',
].join('\n')

async function signals(env: MemoryEnv, args: unknown, exec: unknown): Promise<unknown> {
  const caller = callerSession(exec)
  const request = checkLearning(args, env.now())
  if (isRefusal(request)) fail(request)
  return await readDigest(env, caller.session, request)
}

const render: ToolDefinitionLike['output']['render'] = (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]

/** The learning tool over the row's environment: the main agent's, deferred on the GLM route, hidden from a delegated child like the memory tools. */
export function learningTools(env: MemoryEnv): ToolDefinitionLike[] {
  return [
    {
      name: 'learning_signals',
      description: LEARNING_DESCRIPTION,
      parameters: {
        type: 'object',
        properties: {
          since: { type: 'string', description: 'ISO date or time to start from; default 28 days before now.' },
          minCount: { type: 'number', description: 'List groups with at least this many corrections, 1 to 50 (default 2).' },
        },
      },
      output: { schema: { type: 'object', properties: { since: { type: 'string' }, until: { type: 'string' }, groups: { type: 'array', items: { type: 'object' } }, graph: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } } } }, render },
      execute: (args, exec) => signals(env, args, exec),
    },
  ]
}

/** The three memory tools over the row's environment. */
export function memoryTools(env: MemoryEnv): ToolDefinitionLike[] {
  return [
    {
      name: 'memory_store',
      description: STORE_DESCRIPTION,
      parameters: STORE_PARAMETERS as unknown as Record<string, unknown>,
      output: { schema: { type: 'object', properties: { stored: { type: 'boolean' }, name: { type: 'string' }, scope: { type: 'string' }, kind: { type: 'string' }, updated: { type: 'boolean' }, uncheckedSources: { type: 'array', items: { type: 'string' } } } }, render },
      execute: (args, exec) => store(env, args, exec),
    },
    {
      name: 'memory_query',
      description: 'Recall memories by keyword focus (strongest first), or read one in full by name. Facts fade (14-day half-life) unless they are recalled; each recalled fact counts as a review. Preferences do not fade.',
      parameters: QUERY_PARAMETERS as unknown as Record<string, unknown>,
      output: { schema: { type: 'object', properties: { matches: { type: 'array', items: { type: 'object' } }, notes: { type: 'array', items: { type: 'string' } } } }, render },
      execute: (args, exec) => query(env, args, exec),
    },
    {
      name: 'memory_forget',
      description: 'Forget one memory by name. Only the user revokes a preference: quote their words in relay. A fact can be forgotten without them.',
      parameters: FORGET_PARAMETERS as unknown as Record<string, unknown>,
      output: { schema: { type: 'object', properties: { forgotten: { type: 'boolean' }, name: { type: 'string' }, scope: { type: 'string' }, kind: { type: 'string' } } }, render },
      execute: (args, exec) => forget(env, args, exec),
    },
  ]
}
