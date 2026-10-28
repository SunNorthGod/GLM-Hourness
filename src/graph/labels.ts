/**
 * Chinese display names of the schema enumerations (docs/ORCHESTRATION.md
 * §2.6 field table, §2.9 history), shared by the picture, the graph panel
 * (ui/src/graph) and the command outcomes.
 */
import type { EngineError } from './mutation.ts'
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

/** An engine refusal as one readable line of a command outcome: what failed and the way forward (CHARTER.md §6). */
export function refusalText(error: Pick<EngineError, 'code' | 'message' | 'hint'>): string {
  return `图没有写入（${error.code}）：${error.message}。${error.hint}`
}
