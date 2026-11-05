/**
 * The rules board's page of the panel (rules design 0.10 §9.1, plain-ui 1.3
 * §4.7, docs/ORCHESTRATION.md §16.14): the head, the board's status entries,
 * and from the top the gates (the two checklists of the project graph), the
 * default rule and the peak mode, the person's rules, the rules written in
 * code, the signals, the waiting work, and the recovery when there is any.
 * Only reading: no button, toggle, choice or form, and no command call —
 * what the person can change is written under the entry as what to tell the
 * main agent or which /rules command to type; the only things to open are
 * 讲细点 and the link down to the waiting work. The data comes from the
 * project's view.json (./source.ts) over the rules row's session projection
 * hournessRules, and the checklists from the panel's graph source
 * (../graph/source.ts); this file registers the board in the panel's table
 * (ui/src/graph/boards.ts).
 */
import { TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement, type RefObject } from 'react'
import type { ClientContext, RemoteRoot, SessionsClient } from '../dsh.ts'
import { registerBoard } from '../graph/boards.ts'
import { holdSource, type GraphSnapshot, type GraphSource } from '../graph/source.ts'
import { rulesBoard } from './board.ts'
import { buildRulesPage } from './model.ts'
import { holdRulesSource, type RulesSnapshot, type RulesSource } from './source.ts'

type PageModel = ReturnType<typeof buildRulesPage>
type Group = PageModel['groups'][number]
type Entry = Group['entries'][number]
type Checklist = Group['lists'][number]

/**
 * Styles of the page, rendered as a <style> element (the static bundle has
 * no `styles` builtin, docs/DEVELOPMENT.md §5.6); the colours are the graph
 * panel's tokens, which the page sits inside.
 */
const RULES_CSS = `
.glmr{padding:4px 2px 16px;animation:glmg-fade .18s ease-out}
.glmr-head{margin:2px 0 10px}
.glmr-head h2{margin:0;color:var(--g-ink);font-size:15px;line-height:24px;font-weight:500}
.glmr-notice{margin:0 0 10px;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));border-radius:var(--dsw-radius-md,12px);color:var(--g-ink2);font-size:12px}
.glmr-items{margin:0 0 10px;padding:8px 10px;border-radius:var(--dsw-radius-md,12px);background:var(--g-layer);font-size:12px}
.glmr-items>div+div,.glmr-items>details{margin-top:4px}
.glmr-section{margin:14px 2px 4px;color:var(--g-ink3);font-size:11px;font-weight:600;letter-spacing:.02em}
.glmr-grey,.glmr-small{color:var(--g-ink3);font-size:11px}
.glmr-small{margin-left:6px;font-family:var(--dsw-font-mono,monospace)}
.glmr-line{margin:2px 2px 0;font-size:12px}
.glmr-entry{margin:6px 0 10px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));border-radius:var(--dsw-radius-lg,16px);background:var(--g-layer)}
.glmr-entry.is-grey{opacity:.62}
.glmr-name{font-size:13px;font-weight:500;line-height:20px}
.glmr-entry .glmr-line{margin:2px 0 0}
.glmr-entry .glmr-grey{margin-top:3px}
.glmr details{color:var(--g-ink3);font-size:11px}
.glmr summary{cursor:pointer}
.glmr-list{margin:4px 0 0 16px;padding:0;font-size:12px}
.glmr-list li{margin:2px 0}
.glmr-jump{color:var(--g-ink2);font-size:12px}
`

/** 讲细点 over some lines; nothing when there are none. */
function Details({ lines }: { readonly lines: readonly string[] }): ReactElement | null {
  if (lines.length === 0) return null
  return (
    <details>
      <summary>讲细点</summary>
      {lines.map((line, index) => <div key={`${index}:${line}`}>{line}</div>)}
    </details>
  )
}

/** The link down to the waiting work: it only scrolls the page. */
function Jump({ text, to }: { readonly text: string, readonly to: RefObject<HTMLDivElement> }): ReactElement {
  return (
    <div className="glmr-line">
      <a className="glmr-jump" href="#" onClick={(event) => { event.preventDefault(); to.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{text}</a>
    </div>
  )
}

function EntryItem({ entry, waiting }: { readonly entry: Entry, readonly waiting: RefObject<HTMLDivElement> }): ReactElement {
  return (
    <div className={entry.greyed ? 'glmr-entry is-grey' : 'glmr-entry'}>
      <div className="glmr-name">
        {entry.title}
        {entry.small === null ? null : <span className="glmr-small">{entry.small}</span>}
      </div>
      {entry.lines.map((line, index) => <div className="glmr-line" key={`${index}:${line}`}>{line}</div>)}
      {entry.jump === null ? null : <Jump text={entry.jump} to={waiting} />}
      {entry.grey.map((line, index) => <div className="glmr-grey" key={`${index}:${line}`}>{line}</div>)}
      <Details lines={entry.details} />
    </div>
  )
}

/** One checklist of the gates group: its name, where it comes from, its items verbatim, and who enforces it. */
function ChecklistItem({ list }: { readonly list: Checklist }): ReactElement {
  return (
    <div className="glmr-entry">
      <div className="glmr-name">{list.title}</div>
      {list.from === null ? null : <div className="glmr-grey">{list.from}</div>}
      {list.from === null
        ? list.items.map(line => <div className="glmr-line" key={line}>{line}</div>)
        : <ul className="glmr-list">{list.items.map((line, index) => <li key={`${index}:${line}`}>{line}</li>)}</ul>}
      {list.tail === null ? null : <div className="glmr-grey">{list.tail}</div>}
    </div>
  )
}

function GroupView({ group, waiting }: { readonly group: Group, readonly waiting: RefObject<HTMLDivElement> }): ReactElement {
  return (
    <div ref={group.key === 'waiting' ? waiting : undefined}>
      <div className="glmr-section">{group.title}</div>
      {group.grey.map(line => <div className="glmr-grey glmr-line" key={line}>{line}</div>)}
      {group.lines.map(line => <div className="glmr-line" key={line}>{line}</div>)}
      {group.lists.map(list => <ChecklistItem key={list.id} list={list} />)}
      {group.entries.map(entry => <EntryItem key={entry.key} entry={entry} waiting={waiting} />)}
      {group.tail.map(line => <div className="glmr-grey glmr-line" key={line}>{line}</div>)}
    </div>
  )
}

/** The page of a model: the head, what could not be read, the status entries and the groups. */
function RulesBody({ model, loading, problem }: { readonly model: PageModel, readonly loading: boolean, readonly problem: string | null }): ReactElement {
  const waiting = useRef<HTMLDivElement>(null)
  return (
    <div className="glmr">
      <style>{RULES_CSS}</style>
      <div className="glmr-head"><h2>{model.head}</h2></div>
      {loading ? <TextShimmer active>正在读规则板…</TextShimmer> : null}
      {problem === null ? null : <div className="glmr-notice" role="status">{problem}</div>}
      {model.notice === null ? null : <div className="glmr-notice">{model.notice}</div>}
      {model.items.length === 0 && model.problems.length === 0 ? null : (
        <div className="glmr-items" role="status">
          {model.problems.map(line => <div key={line}>{line}</div>)}
          {model.items.map(item => (
            <div key={item.id}>
              {item.text}
              <Details lines={item.detail} />
            </div>
          ))}
        </div>
      )}
      {model.groups.map(group => <GroupView key={group.key} group={group} waiting={waiting} />)}
    </div>
  )
}

/** The checklist nodes of the panel's graph, or why it cannot be read now. */
function nodesOf(snapshot: GraphSnapshot): Parameters<typeof buildRulesPage>[1] {
  switch (snapshot.status) {
    case 'ready': return snapshot.graph.nodes
    case 'missing': return new Map()
    case 'loading': return '正在读项目图…'
    case 'failed': return `项目图读不出：${snapshot.message}`
  }
}

function RulesContent({ source, graph }: { readonly source: RulesSource, readonly graph: GraphSource }): ReactElement {
  const snapshot: RulesSnapshot = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const graphSnapshot = useSyncExternalStore(graph.subscribe, graph.getSnapshot)
  // The sentence that the row has not written the page yet holds only once a read found no file.
  const quiet = snapshot.loading || (snapshot.problem !== null && !snapshot.missing)
  const model = useMemo(() => {
    const built = buildRulesPage(snapshot.model, nodesOf(graphSnapshot))
    return quiet ? { ...built, notice: null } : built
  }, [snapshot.model, graphSnapshot, quiet])
  return <RulesBody model={model} loading={snapshot.loading} problem={snapshot.problem} />
}

/** Where the session stands for the rules row: no projection value, no working directory, outside a git project, or in a project. */
type Where = 'absent' | 'no-cwd' | 'not-git' | 'project'

function useWhere(sessions: SessionsClient, sessionId: string): { readonly where: Where, readonly viewFile: string | null } {
  const subscribe = useCallback((listener: () => void) => sessions.list.subscribe(listener), [sessions])
  const where = useSyncExternalStore(subscribe, useCallback((): Where => {
    const snapshot = sessions.list.getSnapshot()
    const value = snapshot.projectionsBySession[sessionId]?.values.hournessRules
    if (value === undefined) return 'absent'
    if (value.projectKey !== null) return 'project'
    const cwd = snapshot.byId[sessionId]?.cwd
    return cwd === undefined || cwd === '' ? 'no-cwd' : 'not-git'
  }, [sessions, sessionId]))
  const viewFile = useSyncExternalStore(subscribe, useCallback(() => sessions.list.getSnapshot().projectionsBySession[sessionId]?.values.hournessRules?.viewFile ?? null, [sessions, sessionId]))
  return { where, viewFile }
}

function makeRulesPage(remote: RemoteRoot, sessions: SessionsClient): (props: { readonly sessionId: string }) => ReactElement | null {
  return function RulesPage({ sessionId }: { readonly sessionId: string }): ReactElement | null {
    const { where, viewFile } = useWhere(sessions, sessionId)
    const [source, setSource] = useState<RulesSource | undefined>(undefined)
    const [graph, setGraph] = useState<GraphSource | undefined>(undefined)
    useEffect(() => {
      if (viewFile === null) return undefined
      const held = holdRulesSource(remote, sessionId, viewFile)
      setSource(held.source)
      return () => { held.release() }
    }, [sessionId, viewFile])
    useEffect(() => {
      const held = holdSource(remote, sessionId)
      setGraph(held.source)
      return () => { held.release() }
    }, [sessionId])
    if (where === 'absent') return null
    if (where !== 'project') return <RulesBody model={buildRulesPage(null, new Map(), { noProject: where })} loading={false} problem={null} />
    if (source === undefined || graph === undefined) return null
    return <RulesContent source={source} graph={graph} />
  }
}

/** Register the board in the panel's table (rules design 0.10 §9.1); the disposer stops following the session list and lets the readers go. */
export function installRulesBoard(ctx: ClientContext): () => void {
  const { board, dispose } = rulesBoard(makeRulesPage(ctx.remote, ctx.sessions), { remote: ctx.remote, sessions: ctx.sessions })
  registerBoard(board)
  return dispose
}
