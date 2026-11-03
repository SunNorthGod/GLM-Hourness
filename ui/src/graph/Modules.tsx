/**
 * 框架与模块 (plain-ui 1.3 §4.11, mockup-modules.svg): the two-level loop's
 * page — per split goal its framework decisions, its module list with each
 * state, the fresh candidates that wait for the next framework round, and
 * the directions at the end. Everything read-only: release and lists are
 * decided in the main agent's chat. The page exists only when the
 * directions are on the graph (modulesView returns a view then).
 */
import type { ReactElement } from 'react'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { MODULE_PHRASES, type ModuleState, type ModulesGoalView, type ModulesView } from '../../../src/graph/plain-view.ts'
import { NodeRow, Part } from './common.tsx'

/** One module line: the state, and for a working module its remaining work. */
function ModuleLine({ graph, line }: { readonly graph: LoadedGraph, readonly line: { readonly node: ModulesGoalView['modules'][number]['node'], readonly state: ModuleState, readonly done: number, readonly left: number } }): ReactElement {
  const text = line.state === 'released' && line.done + line.left > 0
    ? `做完 ${line.done} 件，还剩 ${line.left} 件`
    : MODULE_PHRASES[line.state]
  return (
    <div className="glmg-modulerow">
      <NodeRow graph={graph} node={line.node} tone="doing" status={false} />
      <div className="glmg-meta"><span>{text}</span></div>
    </div>
  )
}

/** The page's body: one section per split goal, the directions last. */
export function ModulesPage({ graph, view }: { readonly graph: LoadedGraph, readonly view: ModulesView }): ReactElement {
  return (
    <div className="glmg-view">
      <div className="glmg-notice">框架与模块 · 先定框架、模块与方向，再一块一块地设计、放行、开发</div>
      {view.goals.map((section: ModulesGoalView) => (
        <Part key={section.goal.id} title={section.goal.title}>
          <Part title="框架">
            {section.framework.length === 0
              ? <div className="glmg-meta">框架还没写到图上</div>
              : section.framework.map(decision => <NodeRow key={decision.id} graph={graph} node={decision} tone="doing" status />)}
            {section.changing ? <div className="glmg-meta">在改：主 Agent 会在对话里跟你定，受影响的活先停着</div> : null}
          </Part>
          <Part title={`模块 · ${section.modules.length}`}>
            {section.hasModules
              ? section.modules.map(line => <ModuleLine key={line.node.id} graph={graph} line={line} />)
              : <div className="glmg-meta">还没有模块</div>}
            {section.fresh.length === 0 ? null : (
              <>
                <div className="glmg-meta">
                  新提的、等下一次定框架时一起定：{section.fresh.map(node => `「${node.title}」`).join('、')}
                </div>
                <div className="glmg-meta">要加一块、改一块：跟主 Agent 说「框架要改，加一块……」，它会先问你，你同意再把框架退回去</div>
              </>
            )}
          </Part>
        </Part>
      ))}
      <Part title="方向清单">
        {view.directions.map((direction, index) => <div key={index} className="glmg-text">{index + 1}. {direction}</div>)}
        <div className="glmg-meta">你定过的方向。每个模块的设计都对照它，违背了要改设计</div>
        <div className="glmg-meta">要改：跟主 Agent 说「方向清单加一条……」</div>
      </Part>
    </div>
  )
}
