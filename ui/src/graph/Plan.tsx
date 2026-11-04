/**
 * 怎么做 (plain-ui 1.3 §4.4): the plan page — every remaining item,
 * numbered, in the four groups the home page's 接下来 takes the first three
 * from. The order comes from planOf (plain-view.ts): the focus first, the
 * free items by age, the held ones by dependency; a held item names what
 * holds it. Rows open the node; nothing here writes.
 */
import type { ReactElement } from 'react'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import type { Plan, PlanItem } from '../../../src/graph/plain-view.ts'
import { NodeRow, Part } from './common.tsx'

const GROUP_TITLES: Readonly<Record<'doing' | 'ready' | 'waiting' | 'unsplit', string>> = {
  doing: '在做',
  ready: '可以开工',
  waiting: '要等别的先做完',
  unsplit: '还没细分',
}

/** One group's rows: 第 n 件 in front, the status line under the title. */
function Group({ graph, kind, title, items, goalTitle, severalGoals }: {
  readonly graph: LoadedGraph
  readonly kind: keyof typeof GROUP_TITLES
  readonly title?: string
  readonly items: readonly PlanItem[]
  readonly goalTitle: (id: string) => string | undefined
  readonly severalGoals: boolean
}): ReactElement | null {
  if (items.length === 0) return null
  return (
    <Part title={title ?? `${GROUP_TITLES[kind]} · ${items.length}`}>
      {items.map(item => (
        <div key={item.node.id} className="glmg-planrow">
          <span className="glmg-plan-no" aria-hidden="true">{item.number}</span>
          <span className="glmg-sr">第 {item.number} 件，</span>
          <div className="glmg-row-main">
            <NodeRow graph={graph} node={item.node} tone="doing" status={false} />
            <div className="glmg-meta">
              <span>{item.status}</span>
              {severalGoals ? <span>属于「{goalTitle(item.goalId) ?? item.goalId}」</span> : null}
            </div>
          </div>
        </div>
      ))}
    </Part>
  )
}

/** The plan page's body: the header counts, the four groups, the note on the order. */
export function PlanPage({ graph, plan, goalTitle }: { readonly graph: LoadedGraph, readonly plan: Plan, readonly goalTitle: (id: string) => string | undefined }): ReactElement {
  const severalGoals = plan.goals.length > 1
  return (
    <div className="glmg-view">
      <div className="glmg-notice">怎么做：还剩 {plan.total} 件</div>
      <div className="glmg-meta">有依赖的按依赖排，其余按加进来的先后；agent 改了依赖，这里跟着变</div>
      {severalGoals
        ? plan.goals.map(goalId => (
            <div key={goalId}>
              <Part title={goalTitle(goalId) ?? goalId}>
                <Group graph={graph} kind="doing" title="在做" items={plan.doing.filter(item => item.goalId === goalId)} goalTitle={goalTitle} severalGoals={false} />
                <Group graph={graph} kind="ready" title="可以开工" items={plan.ready.filter(item => item.goalId === goalId)} goalTitle={goalTitle} severalGoals={false} />
                <Group graph={graph} kind="waiting" title="要等别的先做完" items={plan.waiting.filter(item => item.goalId === goalId)} goalTitle={goalTitle} severalGoals={false} />
                <Group graph={graph} kind="unsplit" title="还没细分" items={plan.unsplit.filter(item => item.goalId === goalId)} goalTitle={goalTitle} severalGoals={false} />
              </Part>
            </div>
          ))
        : (
            <>
              <Group graph={graph} kind="doing" items={plan.doing} goalTitle={goalTitle} severalGoals={false} />
              <Group graph={graph} kind="ready" items={plan.ready} goalTitle={goalTitle} severalGoals={false} />
              <Group graph={graph} kind="waiting" items={plan.waiting} goalTitle={goalTitle} severalGoals={false} />
              <Group graph={graph} kind="unsplit" items={plan.unsplit} goalTitle={goalTitle} severalGoals={false} />
            </>
          )}
    </div>
  )
}
