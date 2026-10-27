/**
 * dsh-workflow — the tuning layer over DSH's Agent Team: decision grading,
 * the decision journal, the five-key design-phase review card, and the
 * harvest morning report. Dispatch itself stays fully autonomous on DSH's
 * own team seams; this row only observes and records.
 */

/** Decision grading. */
export type DecisionLevel = 'L1' | 'L2' | 'L3'

/** Grade one dispatch/autonomy decision. */
export function gradeDecision(kind: string): DecisionLevel {
  // L1 fully autonomous: ordinary in-workspace dispatch and tool use.
  // L2 notify-next-morning: model-route changes, background jobs.
  // L3 ask-now: anything outside the workspace or touching credentials.
  switch (kind) {
    case 'dispatch': return 'L1'
    case 'tool-call': return 'L1'
    case 'model-route': return 'L2'
    case 'background-job': return 'L2'
    case 'out-of-workspace': return 'L3'
    case 'credential': return 'L3'
    default: return 'L2'
  }
}

/** Five-key review card for the design phase (user-owned vocabulary, fixed). */
export const FIVE_KEYS = [
  { key: 'approve', label: '批准', meaning: '按方案放行，进入完全自主执行。' },
  { key: 'reject', label: '拒绝（带理由）', meaning: '理由会随拒绝一起返回，供重新设计。' },
  { key: 'augment', label: '补充', meaning: '补充上下文或约束后重提方案。' },
  { key: 'more-detail', label: '讲细点', meaning: '汇报细度上调一档：展开理由、证据与岔路对比，并记入画像。' },
  { key: 'to-the-point', label: '说重点', meaning: '汇报细度下调一档：只留结论、影响与要拍板的岔路，并记入画像。' },
] as const

export type FiveKey = (typeof FIVE_KEYS)[number]['key']
