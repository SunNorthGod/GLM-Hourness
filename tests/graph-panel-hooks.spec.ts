/**
 * The hook-order regression behind the desktop L4 defect (graph node
 * d-panel-released, 2026-11-04): with the project-graph tab open
 * (keepMounted), switching the session across workspaces threw minified
 * React error #310 twice per switch, caught by the panel's PanelBoundary.
 * The desktop host ships React 18.3.1 (reference/dsh-desktop-0.2.1-rc.3
 * dsh-web-frontend dist, "18.3.1"); its #310 is "Rendered more hooks than
 * during the previous render." — a hook order that changes between renders,
 * not a store update. GraphPanel had exactly that: the useCallback for
 * goalTitle stood after the early return for the not-ready snapshots, so a
 * panel that committed on a workspace without a graph gained one hook when
 * the next workspace's graph went ready.
 *
 * The test compiles the real Panel.tsx with esbuild against a fake react
 * module that enforces the same hook-count parity React enforces (both
 * directions: more hooks is #310's text, fewer hooks is #300's text),
 * mounts the panel on a workspace without a graph, and re-renders it across
 * a session switch onto a workspace with a ready graph — the walkthrough
 * scenario, then back.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { build, type Plugin } from 'esbuild'
import { fakeRemote, seedAsHuman, until } from './graph-helpers.ts'
import type { SessionsClient, UiWorkspace, WorkspaceFilesRemote } from '../ui/src/dsh.ts'
import { GraphSource } from '../ui/src/graph/source.ts'


/** The props GraphPanel takes (ui/src/graph/Panel.tsx), typed from the .ts faces it is built of. */
interface PanelProps {
  readonly source: GraphSource
  readonly sessions: SessionsClient
  readonly files: WorkspaceFilesRemote
  readonly workspace: UiWorkspace
  readonly sessionId: string
}

interface PanelBundle {
  readonly GraphPanel: (props: PanelProps) => unknown
  readonly render: (component: unknown, props: PanelProps) => unknown
  /** The shim's hooks, for a component defined on the test side to grow one between renders. */
  readonly useState: (init: unknown) => unknown
  readonly useCallback: (fn: unknown) => unknown
}

/**
 * A react shim with React 18's hook-count rules: every hook call takes one
 * slot per render; a call past the committed count throws #310's text, a
 * render that ends short of it throws #300's text. Rendering a different
 * component starts a fresh fiber. Effects are recorded, never run;
 * components reached through jsx are never invoked, so only the component
 * under test's own hook order is exercised.
 */
const FAKE_REACT = `
const slots = []
let index = 0
let mount = true
let current = null
function take(make) {
  if (mount) { const made = make(); slots.push(made); return made }
  if (index >= slots.length) throw new Error('Rendered more hooks than during the previous render.')
  return slots[index]
}
function useState(init) {
  const cell = take(() => ({ value: typeof init === 'function' ? init() : init }))
  index++
  return [cell.value, () => {}]
}
function useRef(init) {
  const cell = take(() => ({ current: init }))
  index++
  return cell
}
function useCallback(fn) {
  const cell = take(() => ({ fn }))
  index++
  return cell.fn
}
function useMemo(factory) {
  const cell = take(() => ({ value: factory() }))
  index++
  return cell.value
}
function useEffect() {
  take(() => null)
  index++
}
function useLayoutEffect() {
  take(() => null)
  index++
}
function useSyncExternalStore(subscribe, getSnapshot) {
  take(() => null)
  if (mount) subscribe(() => {})
  index++
  return getSnapshot()
}
function useContext() {
  return undefined
}
function createContext() {
  return { Provider: {} }
}
class Component {
  constructor(props) {
    this.props = props
  }
}
const jsx = (type, props, key) => ({ type, props, key })
function render(component, props) {
  if (component !== current) { slots.length = 0; index = 0; mount = true; current = component }
  index = 0
  const element = component(props)
  if (!mount && index < slots.length) throw new Error('Rendered fewer hooks than expected. This may be caused by an accidental early return statement.')
  slots.length = index
  mount = false
  return element
}
module.exports = { useState, useRef, useCallback, useMemo, useEffect, useLayoutEffect, useSyncExternalStore, useContext, createContext, Component, jsx, jsxs: jsx, Fragment: Symbol('react.fragment'), render }
`

/** Stub the module table's react with the shim above and the primitives package with inert components. */
const stubTable: Plugin = {
  name: 'stub-module-table',
  setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime|@deepseek-ai\/.+)$/ }, args => ({ path: args.path, namespace: 'stub' }))
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({
      contents: args.path.startsWith('react') ? FAKE_REACT : 'module.exports = { Button: () => null, MarkdownText: () => null }',
      loader: 'js',
    }))
  },
}

/** Compile the real Panel.tsx against the shim and load the bundle. */
async function loadPanel(): Promise<PanelBundle> {
  const entry = `const react = require('react'); const panel = require('./Panel.tsx'); module.exports = { GraphPanel: panel.GraphPanel, render: react.render, useState: react.useState, useCallback: react.useCallback }`
  const result = await build({
    stdin: { contents: entry, resolveDir: fileURLToPath(new URL('../ui/src/graph/', import.meta.url)), loader: 'js' },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    plugins: [stubTable],
  })
  const dir = await mkdtemp(join(tmpdir(), 'graph-panel-hooks-'))
  const file = join(dir, 'panel.cjs')
  await writeFile(file, result.outputFiles[0].text)
  const loaded = createRequire(import.meta.url)(file) as Partial<PanelBundle>
  if (loaded.GraphPanel === undefined || loaded.render === undefined || loaded.useState === undefined || loaded.useCallback === undefined) throw new Error('the panel bundle did not export GraphPanel, render and the shim hooks')
  return { GraphPanel: loaded.GraphPanel, render: loaded.render, useState: loaded.useState, useCallback: loaded.useCallback }
}

/** A Remote face over a workspace directory on disk, without a change feed (static reads only). */
/** One sessions store with a stable snapshot identity, the way dsh-client-store's createSnapshotStore reads. */
const sessionState = { projectionsBySession: {}, byId: {} } as const
const sessions: SessionsClient = {
  list: { getSnapshot: () => sessionState, subscribe: () => () => {} },
  refreshProjections: () => Promise.resolve(),
}
const workspace: UiWorkspace = { openSession: () => {} }

test('the panel keeps its hook order across a session switch between a workspace without a graph and one with a ready graph', async () => {
  const fresh = await mkdtemp(join(tmpdir(), 'graph-panel-hooks-fresh-'))
  const main = await mkdtemp(join(tmpdir(), 'graph-panel-hooks-main-'))
  try {
    // ws-fresh: no docs/graph — the snapshot stays missing, the panel takes the no-graph branch.
    const freshRemote = fakeRemote(fresh).remote
    const freshSource = new GraphSource(freshRemote, 's-fresh')
    freshSource.start()
    await until(freshSource, snapshot => snapshot.status === 'missing')

    // ws-main: a seeded graph — the panel takes the full branch (the home page over the graph).
    const graphDir = join(main, 'docs', 'graph')
    await mkdir(graphDir, { recursive: true })
    await seedAsHuman(graphDir, [{ type: 'goal', title: '目标' }, { type: 'task', title: '甲', parent: 'goal-1' }])
    const mainRemote = fakeRemote(main).remote
    const mainSource = new GraphSource(mainRemote, 's-main')
    mainSource.start()
    await until(mainSource, snapshot => snapshot.status === 'ready')

    const { GraphPanel, render } = await loadPanel()
    const freshProps: PanelProps = { source: freshSource, sessions, files: freshRemote.workspaceFiles, workspace, sessionId: 's-fresh' }
    // Mount on the workspace without a graph, the way the open tab sits before the switch.
    render(GraphPanel, freshProps)
    // The switch: another session, another workspace, a ready graph — the transition that threw #310 on the desktop.
    const mainProps: PanelProps = { source: mainSource, sessions, files: mainRemote.workspaceFiles, workspace, sessionId: 's-main' }
    render(GraphPanel, mainProps)
    // And back: the reverse transition is where the dropped hook would have fired (#300's direction).
    render(GraphPanel, freshProps)
  }
  finally {
    await rm(fresh, { recursive: true, force: true })
    await rm(main, { recursive: true, force: true })
  }
})

test('the shim fires on a real hook-order change: a component that grows one hook between renders', async () => {
  const { render, useState, useCallback } = await loadPanel()
  const grows = (props: { readonly ready: boolean }): null => {
    useState(() => props.ready)
    if (props.ready) useCallback(() => 'goal')
    return null
  }
  render(grows, { ready: false })
  assert.throws(() => render(grows, { ready: true }), /Rendered more hooks than during the previous render/)
})
