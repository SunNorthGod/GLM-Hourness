/**
 * 上次看之后 (plain-ui 1.3 §4.8): the changes page — every row since the
 * human last looked, newest first, what the templates write from the
 * graph's history. The home page takes the first five; this page lists all
 * of them and opens agent 自己定的事 at the top. Rows are read-only.
 */
import type { ReactElement } from 'react'
import type { ChangeRow } from '../../../src/graph/plain-view.ts'
import { When } from './common.tsx'

/** One change row: the line, and the small note under it (连同 N 件, 要推翻). */
function Row({ row }: { readonly row: ChangeRow }): ReactElement {
  return (
    <div className="glmg-changes-row">
      <div className="glmg-text">{row.text}</div>
      {row.note === undefined ? null : <div className="glmg-meta">{row.note}</div>}
      <div className="glmg-meta"><When at={row.at} /></div>
    </div>
  )
}

/** The changes page's body: agent 自己定的事 opens its page from the top. */
export function ChangesPage({ rows, onDecided }: { readonly rows: readonly ChangeRow[], readonly onDecided: () => void }): ReactElement {
  return (
    <div className="glmg-view">
      <div className="glmg-notice">上次看之后{rows.length === 0 ? '没有变化' : ` · ${rows.length} 处`}</div>
      <button type="button" className="glmg-more" onClick={onDecided}>agent 自己定的事 ›</button>
      {rows.map((row, index) => <Row key={`${row.at}:${index}`} row={row} />)}
    </div>
  )
}
