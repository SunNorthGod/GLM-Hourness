/**
 * Chinese display names of the schema enumerations (docs/ORCHESTRATION.md
 * §2.6 field table), shared by the picture and later clients.
 */
import type { NodeType, Status, Verification } from './schema.ts'

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
