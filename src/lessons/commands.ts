/**
 * The person's command `/lessons` (M5 design §4.7): `show` lists what the
 * lessons board holds, `delete <L-id>` and `restore <L-id>` take a lesson out
 * and bring it back, `drop <C-id>` throws a candidate away. A slash command
 * comes from the person only (docs/ORCHESTRATION.md §2.10), so the writer is
 * `human`, who needs no quoted words; the journal keeps the command id. The
 * texts are Chinese: the person reads them. The page of the lessons shows,
 * and never writes (docs/ORCHESTRATION.md, plain-ui §4.7); this command and
 * the main agent's `lessons_merge` are the two ways to change a lesson.
 */
import type { AgentCommandInvocationLike, CommandDefinitionLike, CommandResultLike } from '../shared/dsh-min.ts'
import { checkMerge, planMerge, type MergeAction, type MergeRefusal } from './merge.ts'
import { activeLessons, openCandidates } from './model.ts'
import { noteWrite, readLessons, writeLessons, type LessonsEnv } from './storage.ts'

const USAGE = '用法：/lessons show（看经验）、/lessons delete <L-编号>、/lessons restore <L-编号>（删掉或找回一条经验）、/lessons drop <C-编号>（丢掉一条候选）。'
const SHOWN = 10
const ACTIONS: Readonly<Record<string, MergeAction>> = { delete: 'delete', restore: 'restore', drop: 'drop' }
const VERBS: Readonly<Record<string, string>> = { delete: '删除', restore: '找回', drop: '丢掉' }

const clip = (text: string, max: number): string => text.length <= max ? text : `${text.slice(0, max - 1)}…`

async function show(env: LessonsEnv, invocation: AgentCommandInvocationLike): Promise<CommandResultLike> {
  const dir = env.dirOf(invocation.agent.session)
  if (dir === undefined) return { kind: 'error', text: '这个会话不在项目里（用户主目录、盘符根，或不在 git 仓库里又没有 .llm 文件夹），没有经验可看。' }
  const read = await readLessons(dir)
  if (!read.ok) return { kind: 'error', text: `经验读不出（${read.reason}）。` }
  const { state } = read.reading
  const lessons = activeLessons(state)
  const deleted = [...state.lessons.values()].filter(lesson => lesson.status === 'deleted').length
  const retired = [...state.lessons.values()].filter(lesson => lesson.status === 'retired').length
  const recent = [...lessons].sort((a, b) => Date.parse(b.created) - Date.parse(a.created)).slice(0, SHOWN)
  return {
    kind: 'success',
    text: [
      '## 经验',
      `本项目：${lessons.length} 条经验，${openCandidates(state).length} 条候选等主 Agent 合并，${retired} 条被 agent 收起，${deleted} 条被你删掉${read.reading.bad.length > 0 ? `，${read.reading.bad.length} 行读不出` : ''}`,
      ...(recent.length === 0 ? [] : [`最近 ${recent.length} 条：`, ...recent.map(lesson => `- ${lesson.id}：${clip(lesson.pitfall, 80)}`)]),
      '要删掉或找回一条：/lessons delete <L-编号>、/lessons restore <L-编号>。',
    ].join('\n'),
  }
}

const refusalText = (id: string, refusal: MergeRefusal): string => {
  if (refusal.code === 'not_found') return `找不到 ${id}，可能已被删除，刷新一下。`
  if (refusal.code === 'stale') return `${id} 刚刚被别处改过，现在不能这样做：/lessons show 看一下。`
  return `没有做成：${refusal.message}`
}

async function change(env: LessonsEnv, invocation: AgentCommandInvocationLike, sub: string, id: string): Promise<CommandResultLike> {
  const action = ACTIONS[sub]
  const { session } = invocation.agent
  const request = action === undefined ? undefined : checkMerge({ action, reason: `人用 /lessons ${sub} 做的`, [action === 'drop' ? 'candidate' : 'lesson']: id })
  if (request === undefined || 'code' in request) return { kind: 'error', text: `「${id}」不是${action === 'drop' ? '候选' : '经验'}的编号（${action === 'drop' ? 'C-' : 'L-'}加六位小写十六进制）。` }
  const dir = env.dirOf(session)
  if (dir === undefined || session === undefined) return { kind: 'error', text: '这个会话不在项目里，没有经验可改。' }
  const taken: { what?: string } = {}
  const written = await writeLessons<MergeRefusal>(dir, (state) => {
    const planned = planMerge(state, request, { actor: 'human', by: { session: session.id, agent: invocation.agent.id, commandId: invocation.commandId } }, env.now().toISOString(), env.random)
    if ('code' in planned) return { refused: planned }
    taken.what = clip((state.lessons.get(id) ?? state.candidates.get(id))?.pitfall ?? '', 40)
    return { records: planned.records }
  }, env.append)
  noteWrite(env, session.id, written)
  switch (written.status) {
    case 'ok': return { kind: 'success', text: `已${VERBS[sub] ?? sub}「${taken.what ?? id}」（${id}）。` }
    case 'refused': return { kind: 'error', text: refusalText(id, written.refused) }
    case 'busy': return { kind: 'error', text: '经验文件正被另一个写入占用，稍后再试一次。' }
    case 'io': return { kind: 'error', text: `没有做成（${written.stage}）：${written.message}` }
    default: return { kind: 'error', text: `没有做成：${written.message}` }
  }
}

/** The `/lessons` definition over the row's environment. */
export function lessonsCommand(env: LessonsEnv): CommandDefinitionLike<AgentCommandInvocationLike> {
  return {
    definitionId: 'dsh-glm-hourness/lessons',
    name: 'lessons',
    description: '经验：看有什么，或删掉、找回一条经验，丢掉一条候选',
    input: { hint: 'show | delete <L-编号> | restore <L-编号> | drop <C-编号>' },
    async handler(invocation) {
      const [sub, id, ...extra] = invocation.rawInput.trim().split(/\s+/).filter(word => word !== '')
      if (sub === 'show' && id === undefined) return show(env, invocation)
      if (sub !== undefined && id !== undefined && extra.length === 0 && Object.hasOwn(ACTIONS, sub)) return change(env, invocation, sub, id)
      return { kind: 'error', text: USAGE }
    },
  }
}
