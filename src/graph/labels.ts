/**
 * Chinese display names of the schema enumerations (docs/ORCHESTRATION.md
 * §2.6 field table, §2.9 history), shared by the picture, the graph panel
 * (ui/src/graph) and the command outcomes.
 */
import type { EngineError, ErrorCode } from './mutation.ts'
import type { Actor, EvidenceKind, NodeType, Op, Stage, Status, TaskKind, Tier, Verification } from './schema.ts'

export const TYPE_LABELS: Readonly<Record<NodeType, string>> = {
  goal: '目标',
  feature: '特性',
  decision: '决策',
  task: '任务',
  risk: '风险',
  question: '待决',
  norm: '规范',
  tool: '工具',
  retro: '复盘',
  role: '用户',
  flow: '流程',
  step: '步骤',
}

export const STATUS_LABELS: Readonly<Record<Status, string>> = {
  proposed: '提议',
  approved: '已批准',
  doing: '进行中',
  done: '完成',
  dropped: '废弃',
  superseded: '被取代',
}

export const VERIFICATION_LABELS: Readonly<Record<Verification, string>> = {
  unverified: '未验证',
  sandbox: '沙盒验证',
  device: '真机验证',
  overturned: '被推翻',
  superseded: '被取代',
}

/** Design-loop stages (§4.1). */
export const STAGE_LABELS: Readonly<Record<Stage, string>> = {
  wish: '许愿',
  interview: '访谈',
  design: '设计',
  release: '放行',
  decompose: '分解',
  execute: '执行',
  merge: '汇合',
  operate: '运维',
}

export const KIND_LABELS: Readonly<Record<TaskKind, string>> = {
  implement: '实现',
  test: '测试',
  review: '审查',
  docs: '文档',
}

export const TIER_LABELS: Readonly<Record<Tier, string>> = {
  hard: '难题',
  standard: '常规',
  simple: '简单',
}

export const EVIDENCE_LABELS: Readonly<Record<EvidenceKind, string>> = {
  commit: '提交',
  test: '测试',
  check: '检查',
  decision: '拍板',
  walk: '走一遍',
}

export const ACTOR_LABELS: Readonly<Record<Actor, string>> = {
  human: '人',
  llm: 'LLM',
  harness: 'harness',
}

export const OP_LABELS: Readonly<Record<Op, string>> = {
  propose: '提议',
  approve: '批准',
  reject: '否决',
  status: '改状态',
  edit: '编辑',
  link: '加连线',
  unlink: '删连线',
  comment: '批注',
  decide: '拍板',
  verify: '验证',
  supersede: '取代',
}

/**
 * An engine refusal as the human who clicked in the panel reads it
 * (the /graph-run outcome): what happened and what to do, in
 * Chinese, with the engine's code in parentheses. The engine's message and
 * hint are written for the LLM, which gets them as the structured error of
 * a graph tool (tools.ts); here only the codes the panel cannot cause
 * quote the engine's message. `status` is the node's status now, for a
 * bad_transition.
 */
export function refusalForHuman(error: Pick<EngineError, 'code' | 'message'>, status?: Status): string {
  const reason: Readonly<Record<ErrorCode, string>> = {
    stale_revision: '这个节点刚被改过，面板已读到新内容，看一眼再点一次',
    bad_transition: `节点已经不在可以这样改的状态${status === undefined ? '' : `（现在：${STATUS_LABELS[status]}）`}`,
    graph_invalid: '图里有校验错误，写入一律被拒；让 agent 修，或用 git 还原节点文件',
    not_found: '图里没有这个节点了',
    invalid: `请求不合法（${error.message}）`,
    forbidden: `没有这样改的权限（${error.message}）`,
    conflict: `与图里已有的内容冲突（${error.message}）`,
    evidence_required: `缺少证据（${error.message}）`,
  }
  return `图没有写入（${error.code}）：${reason[error.code]}`
}

/** Why a human command found no graph: the session has no working directory, or no graph under it. */
export function noGraphText(cwd: string | undefined, configured: string): string {
  return cwd === undefined ? '这个会话没有工作目录，找不到项目图' : `这个会话的工作目录下没有项目图（${configured}）`
}
