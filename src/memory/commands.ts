/**
 * The person's command `/memory` (M5 design §3.4): `show` lists what the
 * memory holds, `forget <name> [project|all]` and `restore <name>
 * [project|all]` take a memory out and bring it back. A slash command comes
 * from the person only (docs/ORCHESTRATION.md §2.10), so the writer is
 * `human`, who may revoke anything, a preference included; the journal keeps
 * the command id. The texts are Chinese: the person reads them.
 */
import type { AgentCommandInvocationLike, CommandDefinitionLike, CommandResultLike } from '../shared/dsh-min.ts'
import { forgetProposalRecord, revokeRecord, type MemoryEntry, type MemoryState, type Scope } from './model.ts'
import { dirOfScope, noteWrite, readBoth, writeScope, type MemoryEnv, type ReadOutcome, type WriteResult } from './storage.ts'

const MEMORY_COMMAND = 'memory'

const USAGE = '用法：/memory show（看记忆有什么）、/memory forget <名字> [project|all]（忘掉一条）、/memory restore <名字> [project|all]（找回忘掉的一条）。'
const SCOPE_WORDS: Readonly<Record<Scope, string>> = { project: '本项目', all: '关于你的（所有项目）' }
const SHOWN = 10

const lineOf = (entry: MemoryEntry): string =>
  `- ${entry.name}（${entry.type}，${SCOPE_WORDS[entry.scope]}）：${entry.description}${entry.relayChecked === false ? ' [原话未核对]' : ''}`

function countsOf(label: string, outcome: ReadOutcome | undefined): string {
  if (outcome === undefined) return `${label}：没有这个目录`
  if (!outcome.ok) return `${label}：读不出（${outcome.reason}）`
  const entries = [...outcome.read.state.entries.values()]
  const active = entries.filter(entry => entry.status === 'active')
  const bad = outcome.read.bad > 0 ? `，${outcome.read.bad} 行读不出` : ''
  return `${label}：偏好 ${active.filter(entry => entry.kind === 'preference').length} 条，事实 ${active.filter(entry => entry.kind === 'fact').length} 条，已忘掉 ${entries.length - active.length} 条${bad}`
}

function show(read: Awaited<ReturnType<typeof readBoth>>): string {
  const states = [read.project, read.user].flatMap(outcome => outcome?.ok === true ? [outcome.read.state] : [])
  const recent = states
    .flatMap(state => [...state.entries.values()])
    .filter(entry => entry.status === 'active')
    .sort((a, b) => Date.parse(b.created) - Date.parse(a.created))
    .slice(0, SHOWN)
  return [
    '## 记忆',
    countsOf('本项目', read.project),
    countsOf('关于你的（所有项目）', read.user),
    ...(recent.length === 0 ? [] : [`最近 ${recent.length} 条：`, ...recent.map(lineOf)]),
    '要忘掉或找回一条：/memory forget <名字>、/memory restore <名字>。',
  ].join('\n')
}

function failureText(result: Exclude<WriteResult<string>, { readonly status: 'ok' }>): string {
  switch (result.status) {
    case 'refused': return result.refused
    case 'busy': return '记忆文件正被另一个写入占用，稍后再试一次。'
    case 'io': return `记忆没写成（${result.stage}）：${result.message}`
    case 'legacy': return `旧的 memory.json 读不出（${result.reason}），没有动它，也没有写任何东西。`
    default: return `记忆没写成：${result.message}`
  }
}

/** The scope whose entry the command acts on: the named one, else the project's first; the entry must be in the state the operation needs. A consolidation proposal (dreaming design §3.3) a `forget` drops too. */
function targetOf(states: ReadonlyArray<readonly [Scope, MemoryState | undefined]>, name: string, scope: Scope | undefined, wanted: MemoryEntry['status']): Scope | undefined {
  return states.find(([candidate, state]) => (scope === undefined || scope === candidate)
    && (state?.entries.get(name)?.status === wanted || (wanted === 'active' && state?.proposals.get(name) !== undefined)))?.[0]
}

async function change(env: MemoryEnv, invocation: AgentCommandInvocationLike, op: 'forget' | 'restore', rest: readonly string[]): Promise<CommandResultLike> {
  const [name, word, ...extra] = rest
  if (name === undefined || extra.length > 0 || (word !== undefined && word !== 'project' && word !== 'all')) return { kind: 'error', text: USAGE }
  const scope = word as Scope | undefined
  const { session } = invocation.agent
  const places = env.places(session)
  const read = await readBoth(places)
  const unreadable = [read.project, read.user].find(outcome => outcome?.ok === false)
  const wanted = op === 'forget' ? 'active' : 'forgotten'
  const target = targetOf([['project', read.project?.ok === true ? read.project.read.state : undefined], ['all', read.user?.ok === true ? read.user.read.state : undefined]], name, scope, wanted)
  const verb = op === 'forget' ? '忘掉' : '找回'
  if (target === undefined) {
    if (unreadable?.ok === false) return { kind: 'error', text: `没有${verb}「${name}」：有一份记忆读不出（${unreadable.reason}）。` }
    return { kind: 'error', text: op === 'forget' ? `没有叫「${name}」的记忆。/memory show 能看到现有的。` : `没有叫「${name}」且已忘掉的记忆。` }
  }
  const dir = dirOfScope(places, target)
  if (dir === undefined) return { kind: 'error', text: `没有${verb}「${name}」：这个会话找不到${SCOPE_WORDS[target]}记忆的目录。` }
  const result = await writeScope<string>(target, dir, (state) => {
    const entry = state.entries.get(name)
    if (entry?.status === wanted) {
      return { records: [revokeRecord(op, entry, `人用 /memory ${op} 做的`, { actor: 'human', by: { session: session.id, agent: invocation.agent.id, commandId: invocation.commandId } })] }
    }
    // A proposal has no restore: a pattern the person asks for again is proposed again (dreaming design §3.2).
    const proposal = op === 'forget' ? state.proposals.get(name) : undefined
    if (proposal !== undefined) {
      return { records: [forgetProposalRecord(proposal, '人用 /memory forget 做的', { actor: 'human', by: { session: session.id, agent: invocation.agent.id, commandId: invocation.commandId } })] }
    }
    return { refused: `「${name}」刚刚被别处改过，现在不能${verb}，/memory show 看一下。` }
  }, env.append)
  noteWrite(env, session.id, result)
  if (result.status !== 'ok') return { kind: 'error', text: failureText(result) }
  return { kind: 'success', text: `已${verb}「${name}」（${SCOPE_WORDS[target]}）。` }
}

/** The `/memory` definition over the row's environment. */
export function memoryCommand(env: MemoryEnv): CommandDefinitionLike<AgentCommandInvocationLike> {
  return {
    definitionId: 'dsh-glm-hourness/memory',
    name: MEMORY_COMMAND,
    description: '记忆：看有什么，或忘掉、找回一条',
    input: { hint: 'show | forget <名字> | restore <名字>' },
    async handler(invocation) {
      const [sub, ...rest] = invocation.rawInput.trim().split(/\s+/).filter(word => word !== '')
      if (sub === 'show' && rest.length === 0) return { kind: 'success', text: show(await readBoth(env.places(invocation.agent.session))) }
      if (sub === 'forget' || sub === 'restore') return change(env, invocation, sub, rest)
      return { kind: 'error', text: USAGE }
    },
  }
}
