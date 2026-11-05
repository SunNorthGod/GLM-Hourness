/**
 * The loop board's page of the panel (loop board design 0.6 §8.1, §8.2,
 * plain-ui 0.7 §4.7): from the top, the head with the main agent's line,
 * what the person is to look at, the plugins' entries something starts, the
 * ones the clock starts, the project's own entries (the deleted ones
 * folded), and the last runs. Only reading: no button, toggle or form, and
 * no command call — what the person can change is written under the item as
 * what to tell the main agent or which command to type, and the only thing
 * to open is 讲细点. The data comes from the page source (./source.ts) over
 * the loop row's session projection hournessLoops; this file registers the
 * board in the panel's table (ui/src/graph/boards.ts). The board hands over
 * no status entries and no home line yet (docs/ORCHESTRATION.md §18.7).
 */
import { TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { ClientContext, RemoteRoot, SessionsClient } from '../dsh.ts'
import { registerBoard } from '../graph/boards.ts'
import { loopsBoard } from './board.ts'
import type { LoopItem, LoopsPageModel } from './model.ts'
import { holdLoopsSource, type LoopsSnapshot, type LoopsSource } from './source.ts'

/**
 * Styles of the page, rendered as a <style> element (the static bundle has
 * no `styles` builtin, docs/DEVELOPMENT.md §5.6); the colours are the graph
 * panel's tokens, which the page sits inside.
 */
const LOOPS_CSS = `
.glmo{padding:4px 2px 16px;animation:glmg-fade .18s ease-out}
.glmo-head{margin:2px 0 10px}
.glmo-head h2{margin:0;color:var(--g-ink);font-size:15px;line-height:24px;font-weight:500}
.glmo-sub,.glmo-small{color:var(--g-ink3);font-size:12px}
.glmo-holder{margin-top:4px;color:var(--g-ink2);font-size:12px}
.glmo-notice{margin:0 0 10px;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));border-radius:var(--dsw-radius-md,12px);color:var(--g-ink2);font-size:12px}
.glmo-look{margin:0 0 10px;padding:8px 10px;border-radius:var(--dsw-radius-md,12px);background:var(--g-layer);font-size:12px}
.glmo-look div+div{margin-top:4px}
.glmo-section{margin:12px 2px 6px;color:var(--g-ink3);font-size:11px;font-weight:600;letter-spacing:.02em}
.glmo-entry{margin:0 0 10px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));border-radius:var(--dsw-radius-lg,16px);background:var(--g-layer)}
.glmo-entry.is-grey{opacity:.62}
.glmo-name{font-size:13px;font-weight:500;line-height:20px}
.glmo-line{margin-top:2px;font-size:12px}
.glmo-grey{margin-top:3px;color:var(--g-ink3);font-size:11px}
.glmo-entry details{margin-top:4px;color:var(--g-ink3);font-size:11px}
.glmo-entry summary{cursor:pointer}
.glmo-fold{margin:2px 0 10px}
.glmo-fold>summary{padding:4px 2px;color:var(--g-ink2);font-size:12px;cursor:pointer}
.glmo-run{padding:2px 2px;color:var(--g-ink2);font-size:12px}
`

/** The grey line under the head (design §8.2 item 1): where the timed entries also show, and what archiving the session does to them. */
const SCHEDULE_NOTE = '到点告诉主 Agent 的几项，DSH 的自动化任务页里也看得到；在那里改的不算数。主 Agent 的会话里挂着这些提醒，归档这个会话时 DSH 会先停掉它们，换到新的主 Agent 会话之后循环板再建。'

/** One entry: its name, 什么时候 · 做什么, its runs, who brought it, and 讲细点. */
function EntryItem({ row }: { readonly row: LoopItem }): ReactElement {
  return (
    <div className={row.greyed ? 'glmo-entry is-grey' : 'glmo-entry'}>
      <div className="glmo-name">{row.title}</div>
      <div className="glmo-line">{row.whatLine}</div>
      <div className="glmo-line">{row.runLine}</div>
      {row.note === null ? null : <div className="glmo-line">{row.note}</div>}
      <div className="glmo-grey">{row.fromLine}</div>
      {row.checkLines.map((line, index) => <div className="glmo-line" key={`${index}:${line}`}>{line}</div>)}
      {row.workLines.map((line, index) => <div className="glmo-line" key={`work:${index}:${line}`}>{line}</div>)}
      {row.changeLine === null ? null : <div className="glmo-grey">{row.changeLine}</div>}
      <details>
        <summary>讲细点</summary>
        {row.details.map((line, index) => <div key={`${index}:${line}`}>{line}</div>)}
      </details>
    </div>
  )
}

/** A section of entries under its title; nothing when it has none. */
function Section({ title, rows }: { readonly title: string, readonly rows: readonly LoopItem[] }): ReactElement | null {
  if (rows.length === 0) return null
  return (
    <>
      <div className="glmo-section">{title}</div>
      {rows.map(row => <EntryItem key={row.id} row={row} />)}
    </>
  )
}

function Body({ model }: { readonly model: LoopsPageModel }): ReactElement {
  return (
    <>
      {model.attention.length === 0 ? null : (
        <div className="glmo-look" role="status">
          <div className="glmo-small">要你看一眼的</div>
          {model.attention.map(line => <div key={line}>{line}</div>)}
        </div>
      )}
      {model.peakLine === null ? null : <div className="glmo-holder">{model.peakLine}</div>}
      <Section title={model.events.title} rows={model.events.rows} />
      <Section title={model.timed.title} rows={model.timed.rows} />
      <div className="glmo-section">{model.mine.title}</div>
      {model.mineEmpty === null ? null : <div className="glmo-grey">{model.mineEmpty}</div>}
      {model.mine.rows.map(row => <EntryItem key={row.id} row={row} />)}
      {model.deleted.rows.length === 0 ? null : (
        <details className="glmo-fold">
          <summary>{model.deleted.title}</summary>
          {model.deleted.rows.map(row => <EntryItem key={row.id} row={row} />)}
        </details>
      )}
      {model.recent.length === 0 ? null : <div className="glmo-section">最近跑过的</div>}
      {model.recent.map((line, index) => <div className="glmo-run" key={`${index}:${line}`}>{line}</div>)}
    </>
  )
}

function LoopsContent({ source }: { readonly source: LoopsSource }): ReactElement {
  const snapshot: LoopsSnapshot = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const { model } = snapshot
  return (
    <div className="glmo">
      <style>{LOOPS_CSS}</style>
      <div className="glmo-head">
        <h2>循环板</h2>
        <span className="glmo-sub">到点了或碰到某件事，就去做一件事</span>
        {model.holderLine === null ? null : (
          <div className="glmo-holder">
            {model.holderLine}
            {model.holderSession === null ? null : <span className="glmo-small">{` · ${model.holderSession}`}</span>}
          </div>
        )}
        {model.waitingLine === null ? null : <div className="glmo-holder">{model.waitingLine}</div>}
        <div className="glmo-grey">{SCHEDULE_NOTE}</div>
      </div>
      {snapshot.loading ? <TextShimmer active>正在读循环板…</TextShimmer> : null}
      {snapshot.problem === null ? null : <div className="glmo-notice" role="status">{snapshot.problem}</div>}
      {snapshot.missing ? <div className="glmo-notice">循环板还没在这个项目里写出它的样子：在这个项目的会话里打 /loops 就会写出来</div> : <Body model={model} />}
    </div>
  )
}

/** The view.json of one session, out of the loop row's projection; null when the session has no board. */
function useViewFile(sessions: SessionsClient, sessionId: string): string | null {
  return useSyncExternalStore(
    useCallback(listener => sessions.list.subscribe(listener), [sessions]),
    useCallback(() => sessions.list.getSnapshot().projectionsBySession[sessionId]?.values.hournessLoops?.viewFile ?? null, [sessions, sessionId]),
  )
}

function makeLoopsPage(remote: RemoteRoot, sessions: SessionsClient): (props: { readonly sessionId: string }) => ReactElement | null {
  return function LoopsPage({ sessionId }: { readonly sessionId: string }): ReactElement | null {
    const viewFile = useViewFile(sessions, sessionId)
    const [source, setSource] = useState<LoopsSource | undefined>(undefined)
    useEffect(() => {
      if (viewFile === null) return undefined
      const held = holdLoopsSource(remote, sessionId, viewFile)
      setSource(held.source)
      return () => { held.release() }
    }, [remote, sessionId, viewFile])
    if (viewFile === null || source === undefined) return null
    return <LoopsContent source={source} />
  }
}

/** Register the board in the panel's table (design §8.1); the disposer stops following the session list. */
export function installLoopsBoard(ctx: ClientContext): () => void {
  const { board, dispose } = loopsBoard(makeLoopsPage(ctx.remote, ctx.sessions), ctx.sessions)
  registerBoard(board)
  return dispose
}
