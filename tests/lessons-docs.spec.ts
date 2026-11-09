/**
 * The pure part of the reminder at a file (src/lessons/docs.ts; docs-at-hand
 * design 0.3 §4, §5): which component a path belongs to, the decision ids a
 * component's `AGENTS.md` lists, what the graph says about them and about the
 * open work under the path, and the words of the reminder with its limits.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import type { GraphNode } from '../src/graph/schema.ts'
import { BODY_MAX, componentDirOf, decisionIdsOf, graphFacts, NOTICE_MAX, pathNotice, type NoticeParts, scopeComponents } from '../src/lessons/docs.ts'

const withAgents = (...dirs: string[]) => (dir: string): boolean => dirs.includes(dir)

test('a file belongs to the nearest directory above it that holds an AGENTS.md, and the checkout root is no component', () => {
  const posix = path.posix
  assert.equal(componentDirOf('/r', '/r/src/a/b/file.ts', withAgents('/r/src/a', '/r/src'), posix), '/r/src/a')
  assert.equal(componentDirOf('/r', '/r/src/a/file.ts', withAgents('/r/src'), posix), '/r/src', 'a nested component is the nearest, an outer one answers for the files outside the inner')
  assert.equal(componentDirOf('/r', '/r/src/a/AGENTS.md', withAgents('/r/src/a'), posix), '/r/src/a', 'the AGENTS.md of a component is in it')
  assert.equal(componentDirOf('/r', '/r/file.ts', withAgents('/r'), posix), undefined, 'the root itself is no component: the host loads its AGENTS.md at the start')
  assert.equal(componentDirOf('/r', '/r/src/file.ts', withAgents(), posix), undefined)
  assert.equal(componentDirOf('/r', '/elsewhere/a/file.ts', withAgents('/elsewhere/a'), posix), undefined, 'a file outside the root belongs to none')
  assert.equal(componentDirOf('/r', '/r2/a/file.ts', withAgents('/r2/a'), posix), undefined, 'a sibling that shares the prefix is outside')
})

test('on Windows the separators and the case do not matter, and a work tree answers with its own root', () => {
  const win = path.win32
  assert.equal(componentDirOf('C:\\Repo', 'c:\\repo\\SRC\\a\\file.ts', withAgents('c:\\repo\\SRC\\a'), win), 'c:\\repo\\SRC\\a')
  assert.equal(componentDirOf('C:\\Repo\\.worktrees\\hz-1', 'C:\\Repo\\.worktrees\\hz-1\\src\\file.ts', withAgents('C:\\Repo\\.worktrees\\hz-1\\src', 'C:\\Repo'), win), 'C:\\Repo\\.worktrees\\hz-1\\src')
  assert.equal(componentDirOf('C:\\Repo\\.worktrees\\hz-1', 'C:\\Repo\\.worktrees\\hz-1\\file.ts', withAgents('C:\\Repo'), win), undefined, 'the main checkout is not above a work tree for this purpose')
})

test('a write scope touches the components of its entries: a directory entry starts at itself, a file entry at its parent, once each, repository-relative', () => {
  const posix = path.posix
  assert.deepEqual(scopeComponents(['src/a/b/file.ts', 'src/'], '/r', withAgents('/r/src'), posix), ['src'], 'the file and the directory that holds it share the component')
  assert.deepEqual(scopeComponents(['src/'], '/r', withAgents('/r/src'), posix), ['src'], 'a directory entry is covered by its own document')
  assert.deepEqual(scopeComponents(['src/x/', 'src/x/inner/'], '/r', withAgents('/r/src', '/r/src/x/inner'), posix), ['src', 'src/x/inner'], 'the outer entry first, the nested one is the inner entry\'s own')
  assert.deepEqual(scopeComponents(['src/', 'src/x/'], '/r', withAgents('/r/src'), posix), ['src'], 'one component once, in first-seen order')
  assert.deepEqual(scopeComponents(['AGENTS.md', 'file.ts'], '/r', withAgents('/r'), posix), [], 'the root itself is no component')
  assert.deepEqual(scopeComponents(['site/feed/feed.json'], '/r', withAgents(), posix), [], 'no component document, no component')
})

test('on Windows a scope entry resolves against the work tree root and reports repository-relative', () => {
  const win = path.win32
  assert.deepEqual(scopeComponents(['src/guarded/writer.js'], 'C:\\Repo\\.worktrees\\hz-1', withAgents('C:\\Repo\\.worktrees\\hz-1\\src'), win), ['src'])
  assert.deepEqual(scopeComponents(['src/'], 'C:\\Repo\\.worktrees\\hz-1', withAgents('C:\\Repo'), win), [], 'the main checkout is not above a work tree here')
})

test('the decisions section lists graph ids: either heading, list items only, ids once, in the order of the document', () => {
  const doc = [
    '# Loop board',
    'What it is.',
    '## Constraints',
    '- d-not-a-decision because it is in another section',
    '## Decisions',
    '- d-loops-own-events',
    '- `d-defaults-readonly`: the entries are the row\'s data',
    '* q-peak-mode （一句说明）',
    '- d-loops-own-events again',
    '- Not an id at all',
    '- D-UPPER-CASE',
    'free text d-free-text',
    '### Sub heading of the same section is a heading too',
    '- d-after-the-next-heading',
  ].join('\n')
  assert.deepEqual(decisionIdsOf(doc), ['d-loops-own-events', 'd-defaults-readonly', 'q-peak-mode'])
  assert.deepEqual(decisionIdsOf('## 决策\n- d-one\n- d-two\n## 验证\n- d-three'), ['d-one', 'd-two'])
  assert.deepEqual(decisionIdsOf('## Decisions\r\n- d-crlf\r\n'), ['d-crlf'])
  assert.deepEqual(decisionIdsOf('no decisions section here\n- d-one'), [])
})

const node = (over: Partial<GraphNode> & Pick<GraphNode, 'id' | 'type' | 'status'>): GraphNode => ({ title: `Title of ${over.id}`, history: [], ...over })
const graphOf = (...nodes: GraphNode[]): ReadonlyMap<string, GraphNode> => new Map(nodes.map(item => [item.id, item]))

test('the graph says what became of each listed decision, and lists the decisions behind the tasks under the path and the open work there', () => {
  const nodes = graphOf(
    node({ id: 'd-a', type: 'decision', status: 'done', verification: 'sandbox' }),
    node({ id: 'd-b', type: 'decision', status: 'superseded', verification: 'superseded', history: [{ at: '2026-11-01T00:00:00.000Z', actor: 'llm', op: 'supersede', by: 'd-c', reason: 'x' }] }),
    node({ id: 'd-c', type: 'decision', status: 'done', verification: 'device' }),
    node({ id: 'd-d', type: 'decision', status: 'doing', verification: 'overturned' }),
    node({ id: 'd-gone', type: 'decision', status: 'dropped' }),
    node({ id: 'd-e', type: 'decision', status: 'approved' }),
    node({ id: 't-1', type: 'task', status: 'doing', title: 'Write the thing', writeScope: ['src/loops/'], edges: [{ type: 'source', to: 'd-e' }, { type: 'depends', to: 'd-a' }] }),
    node({ id: 't-2', type: 'task', status: 'done', writeScope: ['src/loops/run.ts'], edges: [{ type: 'source', to: 'd-a' }] }),
    node({ id: 't-3', type: 'task', status: 'approved', writeScope: ['src/other/'] }),
    node({ id: 't-4', type: 'task', status: 'proposed', writeScope: ['src/loops/'] }),
    node({ id: 't-5', type: 'task', status: 'dropped', writeScope: ['src/loops/'], edges: [{ type: 'source', to: 'd-c' }] }),
    node({ id: 't-6', type: 'task', status: 'doing' }),
  )
  const facts = graphFacts(nodes, 'src/loops/run.ts', ['d-a', 'd-b', 'd-d', 'd-gone', 'd-missing'])
  assert.deepEqual(facts.decisions.map(item => item.line), [
    'd-a "Title of d-a" (done, verified on sandbox)',
    'd-b "Title of d-b" (superseded, superseded by d-c)',
    'd-d "Title of d-d" (doing, overturned)',
    'd-missing (not in the graph)',
    'd-e "Title of d-e" (approved)',
  ])
  assert.deepEqual(facts.work.map(item => item.line), ['t-1 "Write the thing" (doing)'], 'only approved and doing tasks whose scope holds the path; a proposed, dropped, done or scopeless one is not open work here')
  assert.deepEqual(graphFacts(nodes, 'docs/x.md', []), { decisions: [], work: [] })
})

const PARTS: NoticeParts = { path: 'src/loops/run.ts', decisions: [], decisionsMore: 0, work: [], workMore: 0, lessons: [], keepTrue: false }

test('the reminder says where it comes from, in this order, and leaves out the lines with nothing in them', () => {
  assert.equal(pathNotice(PARTS), undefined, 'nothing to say, no reminder')
  assert.equal(pathNotice({ ...PARTS, component: 'src/loops' }), undefined, 'a component with nothing to add is no reminder either')
  assert.equal(pathNotice({
    ...PARTS,
    component: 'src/loops',
    body: '# Loops\nThe loop board.\n',
    decisions: ['d-a "A" (done)', 'd-b "B" (approved)'],
    decisionsMore: 2,
    work: ['t-1 "Task" (doing)'],
    workMore: 0,
    lessons: ['L-1: when files src/loops/** → pitfall → fix'],
    keepTrue: true,
  }), [
    '<system-reminder>',
    'Docs and lessons at hand for src/loops/run.ts (component src/loops):',
    'src/loops/AGENTS.md:',
    '# Loops',
    'The loop board.',
    'Decisions on this path (project graph): d-a "A" (done); d-b "B" (approved) (+2 more)',
    'Open work on this path: t-1 "Task" (doing)',
    'Lessons for this path (advice, not rules): L-1: when files src/loops/** → pitfall → fix',
    'Keep the component doc true: if your change alters what src/loops/AGENTS.md says, update it in the same commit.',
    '</system-reminder>',
  ].join('\n'))
  assert.equal(pathNotice({ ...PARTS, lessons: ['L-1: x'] }), '<system-reminder>\nDocs and lessons at hand for src/loops/run.ts:\nLessons for this path (advice, not rules): L-1: x\n</system-reminder>')
  assert.doesNotMatch(pathNotice({ ...PARTS, component: 'src/loops', keepTrue: false, decisions: ['d-a "A" (done)'] }) ?? '', /Keep the component doc true/)
  assert.doesNotMatch(pathNotice({ ...PARTS, keepTrue: true, lessons: ['L-1: x'] }) ?? '', /Keep the component doc true/, 'no component, no document to keep true')
})

test('a long document is cut at the body limit and says how to read the rest; the whole reminder stays within its limit', () => {
  const body = `${'x'.repeat(BODY_MAX - 10)}\n${'y'.repeat(5_000)}`
  const text = pathNotice({ ...PARTS, component: 'src/loops', body, decisions: ['d-a "A" (done)'] }) ?? ''
  assert.match(text, /\(truncated; Read src\/loops\/AGENTS\.md for the rest\)\n/)
  assert.ok(!text.includes('y'.repeat(30)))
  assert.ok(text.length <= NOTICE_MAX, `${text.length}`)
  const crowded = pathNotice({ ...PARTS, component: 'src/loops', body, decisions: Array.from({ length: 5 }, (_, index) => `d-${index} "${'t'.repeat(80)}" (done, verified on sandbox)`), work: Array.from({ length: 3 }, (_, index) => `t-${index} "${'u'.repeat(80)}" (doing)`), lessons: Array.from({ length: 3 }, (_, index) => `L-${index}: ${'v'.repeat(290)}`), keepTrue: true }) ?? ''
  assert.ok(crowded.length <= NOTICE_MAX, `${crowded.length}`)
  assert.match(crowded, /Lessons for this path/)
})
