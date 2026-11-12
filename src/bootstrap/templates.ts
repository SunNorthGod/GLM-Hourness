/**
 * The three norm templates a takeover proposes under its anchor goal
 * (takeover design 0.6 §4.2): fixed ids, a title, a one-line `why` (plain-ui
 * §8.2, at most 80 code points) and a body whose labels each start a line
 * with the label name and a full-width colon, so M3's `labeledSections`
 * (src/graph/stage.ts) reads them. The templates hold the mechanism only,
 * never a project's paths or commands (§14). The graph schema has no `why`
 * field yet, so the line stays with the template until plain-ui adds one.
 */

/** The placeholder values of the two labels the human answers during the takeover. */
export const PLACEHOLDERS = {
  touch: '（接管时问人；碰之前问人）',
  cost: '（接管时问人；这些不进每次合入，攒到批次点跑）',
} as const

export interface NormTemplate {
  readonly id: 'norm-decision-tiers' | 'norm-audit-trail' | 'norm-verify-tiers'
  readonly title: string
  readonly why: string
  readonly body: string
}

export const NORM_TEMPLATES: readonly NormTemplate[] = [
  {
    id: 'norm-decision-tiers',
    title: '决策分级：只有五类事问人',
    why: '定下哪些事要问你，其余由 agent 定、你可以推翻',
    body: [
      '必须问人：1 改目标、验收条件或非目标；2 仓库以外的动作（用户配置、安装程序、删工作区外的文件）；3 不可逆或对外的动作；4 新增运行时依赖或升大版本；5 以后改起来很贵的方向性岔路。',
      '其余由 agent 定：提一张决定者为 agent 的待决并拍板，人可推翻。人在对话里说的话由 agent 带原话写进图。',
      `不许碰：${PLACEHOLDERS.touch}`,
      '常设授权：无',
    ].join('\n'),
  },
  {
    id: 'norm-audit-trail',
    title: '处处留痕：每个改变状态的动作都能追',
    why: '出了事能查到谁在什么时候、凭什么做的',
    body: '每个改变状态的动作写明谁做的（人、agent、harness；经对话转述的带原话）、何时、为什么、凭什么证据，记在它所属的地方：图上的节点历史、审计流水、会话日志、提交信息。一处动作只记一个事实源，别处引用。',
  },
  {
    id: 'norm-verify-tiers',
    title: '验证分级：每次合入跑什么，什么攒批跑',
    why: '每次合入只跑快的、不花钱的检查，贵的攒到一批再跑',
    body: [
      '每次合入都跑的是合入门禁（norm-merge-gate）的 $ 行；只在改动碰到某些路径时才跑的写 when；夜里跑的写 patrol。',
      `花钱或独占：${PLACEHOLDERS.cost}`,
    ].join('\n'),
  },
]
