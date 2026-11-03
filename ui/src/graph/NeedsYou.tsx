/**
 * 需要你 (plain-ui 1.3 §4.3): the entries that wait for the human — the
 * second-layer page (the home section takes its first three), every entry
 * with its question open. The panel only looks: the answer is said in the
 * main agent's chat, and every card says so.
 */
import type { ReactElement } from 'react'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import type { NeedEntry } from '../../../src/graph/plain-view.ts'
import { Options, When, useServices } from './common.tsx'
import { MainChatLine } from './MainChat.tsx'

/** 需要你, all of it (plain-ui 1.3 §4.3): every entry with its question open — the page behind the home section's 还有 N 件. */
export function NeedsPage({ graph, needs }: { readonly graph: LoadedGraph, readonly needs: readonly NeedEntry[] }): ReactElement {
  const { open } = useServices()
  if (needs.length === 0) return <div className="glmg-view"><div className="glmg-notice">现在没有要你回话的事</div></div>
  return (
    <div className="glmg-view">
      <div className="glmg-notice">需要你 · {needs.length} 件</div>
      {needs.map((need, index) => {
        const node = need.node
        if (node === undefined) {
          return (
            <div key={`awaiting:${index}`} className="glmg-card wait">
              <div className="glmg-row-title">{need.matter?.text ?? '主 Agent 在对话里等你回话'}</div>
              <MainChatLine />
            </div>
          )
        }
        const parent = node.parent === undefined ? undefined : graph.nodes.get(node.parent)
        const first = node.history[0]
        return (
          <div key={node.id} className="glmg-card wait">
            <h3 className="glmg-card-title"><button type="button" className="glmg-card-link" onClick={() => { open(node.id) }}>{node.title}</button></h3>
            <div className="glmg-meta">
              <span>{parent === undefined || parent.type === 'goal' ? null : `挂在「${parent.title}」下`}</span>
              <When at={need.since} />
            </div>
            {node.status === 'proposed' ? <div className="glmg-notice">要批准或不要</div> : <Options node={node} />}
            <MainChatLine />
            {first === undefined ? null : <div className="glmg-meta">{first.actor === 'human' ? '你' : 'agent '}提的 · <When at={first.at} /></div>}
          </div>
        )
      })}
    </div>
  )
}
