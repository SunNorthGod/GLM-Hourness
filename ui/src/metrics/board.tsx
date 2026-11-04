/**
 * The metrics board's page (metrics design §7.6.3): the ratios the system
 * recorded, paired over the last and the previous seven days. Only
 * reading: no button, toggle or form, and no command call — the page has
 * no write control and the module never touches `commands`. The data comes
 * from the reader (./board.ts) over the `hournessMetrics` projection; this
 * file registers the board in the panel's table (ui/src/graph/boards.ts).
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { ClientContext, RemoteRoot, SessionsClient } from '../dsh.ts'
import { registerBoard } from '../graph/boards.ts'
import { holdMetricsSource, metricsBoard, stampOf, type MetricsSnapshot } from './board.ts'

/**
 * Styles of the page, rendered as a <style> element (the static bundle has
 * no `styles` builtin, docs/DEVELOPMENT.md §5.6); the colours are the graph
 * panel's tokens, which the page sits inside.
 */
const METRICS_CSS = `
.glmm{padding:4px 2px 16px;animation:glmg-fade .18s ease-out}
.glmm-head{margin:2px 0 10px}
.glmm-head h2{margin:0;color:var(--g-ink);font-size:15px;line-height:24px;font-weight:500}
.glmm-sub{color:var(--g-ink3);font-size:12px}
.glmm-notice{margin:0 0 10px;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));border-radius:var(--dsw-radius-md,12px);color:var(--g-ink2);font-size:12px}
.glmm-topline{margin:2px 0 8px;color:var(--g-ink2);font-size:12px}
.glmm-group{margin:0 0 10px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));border-radius:var(--dsw-radius-lg,16px);background:var(--g-layer)}
.glmm-group h3{margin:0 0 4px;color:var(--g-ink);font-size:13px;line-height:20px;font-weight:500}
.glmm-row{display:flex;justify-content:space-between;gap:12px;font-size:12px;line-height:22px}
.glmm-label{color:var(--g-ink2)}
.glmm-value{color:var(--g-ink)}
.glmm-note{margin-top:4px;color:var(--g-ink3);font-size:11px}
.glmm-fold{margin:2px 0 10px}
.glmm-fold summary{padding:4px 2px;color:var(--g-ink2);font-size:12px;cursor:pointer}
.glmm-foot{margin-top:12px;color:var(--g-ink3);font-size:11px}
`

/** One row of a group: the name and the two windows' values, already formatted by the host. */
function Row({ row }: { readonly row: { readonly label: string, readonly values: readonly [string, string] } }): ReactElement {
  return (
    <div className="glmm-row">
      <span className="glmm-label">{row.label}</span>
      <span className="glmm-value">{row.values[0]} / {row.values[1]}</span>
    </div>
  )
}

function MetricsContent({ snapshot }: { readonly snapshot: MetricsSnapshot }): ReactElement {
  const view = snapshot.view
  const topLine = view === null || view.at === null
    ? '还没有算过：项目编排启用后几分钟内算第一次'
    : `${stampOf(view.at)} 算的 · ${view.windows[0]} / ${view.windows[1]}`
  return (
    <div className="glmm">
      <style>{METRICS_CSS}</style>
      <div className="glmm-head">
        <h2>指标</h2>
        <span className="glmm-sub">系统记下的数，只给你看，主 Agent 不转述</span>
      </div>
      <div className="glmm-topline">{topLine}</div>
      {view === null ? null : (
        <>
          {view.problem === null ? null : <div className="glmm-notice" role="status">{view.problem}</div>}
          {[...view.groups].sort((a, b) => Number(b.relayed) - Number(a.relayed)).map(group => (
            <section key={group.id} className="glmm-group">
              <h3>{group.title}</h3>
              {group.rows.map(row => <Row key={row.label} row={row} />)}
              {group.note === undefined ? null : <div className="glmm-note">{group.note}</div>}
            </section>
          ))}
          <details className="glmm-fold">
            <summary>讲细点</summary>
            <div className="glmm-note">依据：{view.basis}</div>
            {view.groups.flatMap(group =>
              group.rows.filter(row => row.note !== undefined).map(row => (
                <div key={`${group.id} ${row.label}`} className="glmm-note">{row.label}：{row.note}</div>
              )))}
          </details>
        </>
      )}
      <div className="glmm-foot">也可以在插件仓库的命令行打 npm run metrics -- summary --project &lt;这个项目的目录&gt;</div>
    </div>
  )
}

/** The view file of one session, out of the row's projection; null when the row is off or the session has no project. */
function useViewFile(sessions: SessionsClient, sessionId: string): string | null {
  const projections = useSyncExternalStore(
    useCallback(listener => sessions.list.subscribe(listener), [sessions]),
    useCallback(() => sessions.list.getSnapshot().projectionsBySession, [sessions]),
  )
  const viewFile = projections[sessionId]?.values.hournessMetrics?.viewFile
  return useMemo(() => typeof viewFile === 'string' && viewFile !== '' ? viewFile : null, [viewFile])
}

function makeMetricsPage(remote: RemoteRoot, sessions: SessionsClient): (props: { readonly sessionId: string }) => ReactElement | null {
  return function MetricsPage({ sessionId }: { readonly sessionId: string }): ReactElement | null {
    const path = useViewFile(sessions, sessionId)
    const [state, setState] = useState<{ readonly snapshot: MetricsSnapshot } | undefined>(undefined)
    useEffect(() => {
      if (path === null) return undefined
      const held = holdMetricsSource(remote, sessionId, path)
      const update = (): void => setState({ snapshot: held.source.getSnapshot() })
      update()
      const unsubscribe = held.source.subscribe(update)
      return () => {
        unsubscribe()
        held.release()
      }
    }, [remote, sessionId, path])
    if (path === null || state === undefined) return null
    return <MetricsContent snapshot={state.snapshot} />
  }
}

/** Register the board in the panel's table (§7.6.3); the disposer stops following the session list. */
export function installMetricsBoard(ctx: ClientContext): () => void {
  const { board, dispose } = metricsBoard(makeMetricsPage(ctx.remote, ctx.sessions), { remote: ctx.remote, sessions: ctx.sessions })
  registerBoard(board)
  return dispose
}
