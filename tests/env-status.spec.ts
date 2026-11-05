/**
 * The env module's status entries (src/env/status.ts, status hub design 0.3
 * §3.1, §12 M4 row): the one `env/suppressions` entry over the project's
 * daily counts, and the row providing it as glmHournessStatus/env for the
 * collector — withdrawn with the row, no entry without a journal or a
 * session the row knows, a journal that cannot be read into the collector's
 * placeholder, a line that cannot be parsed skipped.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply as envApply } from '../src/env/index.ts'
import { envStatusItems, suppressionLineOf, suppressionTotalLine } from '../src/env/status.ts'
import type { SuppressionRecord } from '../src/env/suppressions.ts'
import { collectStatus } from '../src/report/status.ts'
import { statusServiceName, type RowStatusView } from '../src/shared/status-host.ts'
import { fakeRuntime, type FakeRuntime } from './fake-rc3.ts'

const record = (at: string, total: number): SuppressionRecord => ({ at, repo: 'r', total, byMarker: {} })

test('envStatusItems: the latest count is the text, the field, the moment; no count, no entry', () => {
  assert.deepEqual(envStatusItems([], 'suppressions.jsonl'), [])
  const [only] = envStatusItems([record('2026-11-04T00:30:00Z', 7)], 'suppressions.jsonl')
  assert.equal(only?.id, 'env/suppressions')
  assert.equal(only?.owner, 'env')
  assert.equal(only?.audience, 'agent')
  assert.equal(only?.asOf, '2026-11-04T00:30:00Z')
  assert.equal(only?.source, 'suppressions.jsonl')
  assert.equal(only?.text, '压制注释 7 处')
  assert.deepEqual(only?.fields, { total: 7 })
  assert.ok((only?.staleAfterMs ?? 0) > 0, 'a count that stopped refreshing grows stale')
  const [latest] = envStatusItems([record('2026-11-02T00:30:00Z', 3), record('2026-11-04T00:30:00Z', 7)], 's')
  assert.equal(latest?.text, '压制注释 7 处', 'the entry states the latest count, the movement stays the report\'s period line')
})

test('the count line is one wording for the entry and the report\'s no-churn line', () => {
  assert.equal(suppressionLineOf([record('2026-11-04T00:30:00Z', 7)]), suppressionTotalLine(7))
  assert.equal(suppressionLineOf([record('2026-11-03T00:30:00Z', 3), record('2026-11-04T00:30:00Z', 7)]), `${suppressionTotalLine(7)}（本期 +4 / −0）`)
})

/**
 * A fixture whose daily gate must not run: the journal's last record is
 * today's (UTC+8), so the row skips the count and with it the git call.
 */
const settledJournal = (): string => `${JSON.stringify(record(`${new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)}T00:00:00Z`, 7))}\n`

async function withRow(body: (view: RowStatusView, workspace: string, rt: FakeRuntime) => void, options: { readFile?: (path: string) => string, journal?: string } = {}): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), 'env-status-'))
  try {
    await mkdir(join(workspace, '.llm', 'audit'), { recursive: true })
    await writeFile(join(workspace, '.llm', 'audit', 'suppressions.jsonl'), options.journal ?? settledJournal())
    const rt = fakeRuntime({ cwd: workspace })
    const dispose = envApply(rt.ctx, options.readFile === undefined ? {} : { readFile: options.readFile })
    await rt.create()
    const view = rt.services.get(statusServiceName('env')) as RowStatusView | undefined
    assert.ok(view !== undefined, 'the row provides glmHournessStatus/env')
    body(view, workspace, rt)
    dispose()
    assert.equal(rt.services.has(statusServiceName('env')), false, 'the view goes with the row')
  }
  finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

test('the env row provides glmHournessStatus/env: the latest count as the one entry, the collector reads it', async () => {
  await withRow((view, workspace, rt) => {
    const [item] = view.items('agent-1')
    assert.equal(item?.id, 'env/suppressions')
    assert.equal(item?.text, '压制注释 7 处')
    assert.deepEqual(item?.fields, { total: 7 })
    assert.equal(item?.source, join(workspace, '.llm', 'audit', 'suppressions.jsonl'))
    const collected = collectStatus(rt.services, 'agent-1', 'agent', Date.now())
    assert.equal(collected.items.some(entry => entry.id === 'env/suppressions'), true)
  })
})

test('a session the row does not know has no entry; a journal that cannot be read throws for the collector', async () => {
  await withRow((view) => {
    assert.deepEqual(view.items('no-such-session'), [])
    assert.throws(() => view.items('agent-1'), /EACCES/, 'the view throws; the collector takes the placeholder')
  }, {
    readFile: (path) => {
      const error = new Error(`EACCES: permission denied, access '${path}'`) as NodeJS.ErrnoException
      error.code = 'EACCES'
      throw error
    },
  })
})

test('a journal that is not there yet is no entry, not an error', async () => {
  await withRow((view) => {
    assert.deepEqual(view.items('agent-1'), [])
  }, {
    readFile: (path) => {
      const error = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    },
  })
})

test('a line the journal cannot parse is skipped, the rest counted', async () => {
  const corrupt = `${'not json'}\n${settledJournal()}`
  await withRow((view) => {
    const [item] = view.items('agent-1')
    assert.equal(item?.text, '压制注释 7 处')
  }, { journal: corrupt })
})
