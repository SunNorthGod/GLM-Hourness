/**
 * The lessons page of the panel (M5 design §4.7, plain-ui 0.7 §4.7): the
 * project's lessons on top, the memory sections on the lower half of the
 * same page. Only reading: no button, toggle or form, and no command call —
 * what the person can change is written under every item as a 要改 line
 * naming what to say to the main agent or which person's command to type.
 * The data comes from the page source (./source.ts) over the two rows'
 * session projections; this file registers the board in the panel's table
 * (ui/src/graph/boards.ts).
 */
import { Tag, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { ClientContext, RemoteRoot, SessionsClient } from '../dsh.ts'
import { registerBoard } from '../graph/boards.ts'
import { lessonsBoard } from './board.ts'
import type { FactRow, LessonRow, LessonsPageModel, PreferenceRow } from './model.ts'
import { holdLessonsSource, type LessonsPaths, type LessonsSnapshot, type LessonsSource } from './source.ts'

/**
 * Styles of the page, rendered as a <style> element (the static bundle has
 * no `styles` builtin, docs/DEVELOPMENT.md §5.6); the colours are the graph
 * panel's tokens, which the page sits inside.
 */
const LESSONS_CSS = `
.glml{padding:4px 2px 16px;animation:glmg-fade .18s ease-out}
.glml-head{margin:2px 0 10px}
.glml-head h2{margin:0;color:var(--g-ink);font-size:15px;line-height:24px;font-weight:500}
.glml-sub{color:var(--g-ink3);font-size:12px}
.glml-notice{margin:0 0 10px;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));border-radius:var(--dsw-radius-md,12px);color:var(--g-ink2);font-size:12px}
.glml-topline{margin:2px 0 8px;color:var(--g-ink2);font-size:12px}
.glml-item{margin:0 0 10px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.28));border-radius:var(--dsw-radius-lg,16px);background:var(--g-layer)}
.glml-title{font-size:13px;font-weight:500;line-height:20px}
.glml-state{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px;font-size:12px}
.glml-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.glml-grey{margin-top:3px;color:var(--g-ink3);font-size:11px}
.glml-change{margin-top:6px;color:var(--g-ink3);font-size:11px}
.glml-fold{margin:2px 0 10px}
.glml-fold summary{padding:4px 2px;color:var(--g-ink2);font-size:12px;cursor:pointer}
.glml-memory{margin-top:18px;padding-top:12px;border-top:1px solid var(--g-line)}
.glml-memory h3{margin:0 0 4px;color:var(--g-ink);font-size:14px;line-height:20px;font-weight:500}
.glml-section{margin:12px 2px 6px;color:var(--g-ink3);font-size:11px;font-weight:600;letter-spacing:.02em}
`

/** The page's items: title, how it stands, where it comes from, and the 要改 line. */
function LessonItem({ row }: { readonly row: LessonRow }): ReactElement {
  return (
    <div className="glml-item">
      <div className="glml-title">{row.title}</div>
      <div className="glml-state">{row.stateLine}</div>
      {row.situation.length === 0 ? null : <div className="glml-tags">{row.situation.map(tag => <Tag key={tag} tone="neutral">{tag}</Tag>)}</div>}
      {row.evidence.length === 0 ? null : <div className="glml-grey">证据：{row.evidence.join(' · ')}</div>}
      <div className="glml-grey">{row.originLine}</div>
      <div className="glml-change">{row.changeLine}</div>
    </div>
  )
}

function PreferenceItem({ row }: { readonly row: PreferenceRow }): ReactElement {
  return (
    <div className="glml-item">
      <div className="glml-title">{row.description}</div>
      <div className="glml-state">
        {row.saidLine}
        {row.unchecked ? <Tag tone="warning">原话未核对</Tag> : null}
      </div>
      <div className="glml-change">{row.changeLine}</div>
    </div>
  )
}

function FactItem({ row }: { readonly row: FactRow }): ReactElement {
  return (
    <div className="glml-item">
      <div className="glml-title">{row.description}</div>
      <div className="glml-state">
        {row.strengthText}
        {row.noSource ? <Tag tone="warning">没有出处</Tag> : null}
      </div>
      {row.sourceLine === null ? null : <div className="glml-grey">{row.sourceLine}</div>}
      <div className="glml-change">{row.changeLine}</div>
    </div>
  )
}

/** The memory half: the person's preferences with their relay, the project's facts, the reporting depth. */
function MemoryHalf({ memory }: { readonly memory: LessonsPageModel['memory'] }): ReactElement | null {
  if (memory.preferences.length === 0 && memory.facts.length === 0 && memory.depth === null) return null
  return (
    <div className="glml-memory">
      <h3>记忆</h3>
      <div className="glml-section">关于你</div>
      {memory.depth === null ? null : (
        <div className="glml-item">
          <div className="glml-state">{memory.depth.line}</div>
          <div className="glml-change">{memory.depth.changeLine}</div>
        </div>
      )}
      {memory.preferences.length === 0 ? <div className="glml-grey">还没有记住关于你的事。</div> : memory.preferences.map(row => <PreferenceItem key={row.name} row={row} />)}
      {memory.facts.length === 0 ? null : <div className="glml-section">项目里的线索</div>}
      {memory.facts.map(row => <FactItem key={row.name} row={row} />)}
    </div>
  )
}

function LessonsContent({ source }: { readonly source: LessonsSource }): ReactElement {
  const snapshot: LessonsSnapshot = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const { model } = snapshot
  return (
    <div className="glml">
      <style>{LESSONS_CSS}</style>
      <div className="glml-head">
        <h2>经验</h2>
        <span className="glml-sub">这个项目踩过的坑和解法，以及 agent 记住的事</span>
      </div>
      {snapshot.loading ? <TextShimmer active>正在读经验与记忆…</TextShimmer> : null}
      {snapshot.problem === null ? null : <div className="glml-notice" role="status">{snapshot.problem}</div>}
      <div className="glml-topline">{model.topLine}</div>
      {model.rows.map(row => <LessonItem key={row.id} row={row} />)}
      {model.retired.rows.length === 0 ? null : (
        <details className="glml-fold">
          <summary>{model.retired.title}</summary>
          {model.retired.rows.map(row => <LessonItem key={row.id} row={row} />)}
        </details>
      )}
      {model.deleted.rows.length === 0 ? null : (
        <details className="glml-fold">
          <summary>{model.deleted.title}</summary>
          {model.deleted.rows.map(row => <LessonItem key={row.id} row={row} />)}
        </details>
      )}
      <MemoryHalf memory={model.memory} />
    </div>
  )
}

/** The paths of one session, out of the two rows' projections; undefined when neither row is on. */
function useProjectionPaths(sessions: SessionsClient, sessionId: string): LessonsPaths | undefined {
  const projections = useSyncExternalStore(
    useCallback(listener => sessions.list.subscribe(listener), [sessions]),
    useCallback(() => sessions.list.getSnapshot().projectionsBySession, [sessions]),
  )
  const values = projections[sessionId]?.values
  const present = values?.hournessLessons !== undefined || values?.hournessMemory !== undefined
  const lessons = values?.hournessLessons?.journal ?? null
  const project = values?.hournessMemory?.projectJournal ?? null
  const user = values?.hournessMemory?.userJournal ?? null
  return useMemo(
    () => present ? { lessons, project, user } : undefined,
    [present, lessons, project, user],
  )
}

function makeLessonsPage(remote: RemoteRoot, sessions: SessionsClient): (props: { readonly sessionId: string }) => ReactElement | null {
  return function LessonsPage({ sessionId }: { readonly sessionId: string }): ReactElement | null {
    const paths = useProjectionPaths(sessions, sessionId)
    const [source, setSource] = useState<LessonsSource | undefined>(undefined)
    useEffect(() => {
      if (paths === undefined) return undefined
      const held = holdLessonsSource(remote, sessionId, paths)
      setSource(held.source)
      return () => { held.release() }
    }, [remote, sessionId, paths])
    if (paths === undefined || source === undefined) return null
    return <LessonsContent source={source} />
  }
}

/** Register the board in the panel's table (M5 design §8.2); the disposer stops following the session list. */
export function installLessonsBoard(ctx: ClientContext): () => void {
  const { board, dispose } = lessonsBoard(makeLessonsPage(ctx.remote, ctx.sessions), { sessions: ctx.sessions })
  registerBoard(board)
  return dispose
}
