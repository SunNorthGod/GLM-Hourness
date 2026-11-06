/**
 * What the panel's views write, rendered (plain-ui 1.3, the Q4 desktop
 * findings F1, F2, F4 and F5 of .agents/tasks/panel/l4-2026-11-05.md):
 * the home's 需要你 shows the first item whole and the others with their
 * ask (done conditions 1 and 6); an empty graph's home is 效果是 with the way
 * to start and nothing else (design §4.10); the list rows carry no type
 * name (done condition 2); the light theme's grey text and links reach
 * 4.5:1 (design §1.3, §10.3 item 10).
 *
 * The views are compiled with esbuild against a small react stand-in that
 * renders synchronously to markup: function and class components are
 * called, contexts follow their providers, state keeps its initial value,
 * effects never run. The primitives package is inert stand-ins.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { TYPE_LABELS } from '../src/graph/labels.ts'
import type { AwaitingEntry } from '../src/graph/live.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import { planOf } from '../src/graph/plain-view.ts'
import type { GraphNode } from '../src/graph/schema.ts'
import type { Board, BoardState } from '../ui/src/graph/boards.ts'
import { LIGHT_TOKENS, PANEL_CSS } from '../ui/src/graph/styles.ts'
import { GUIDE_LINE } from '../ui/src/metrics/board.ts'
import { at } from './execute-helpers.ts'
import { graphOf, node } from './graph-memory.ts'

const STAND_IN_REACT = `
const Fragment = Symbol.for('stand-in.fragment')
const provided = new Map()
function createContext(value) { const context = { value }; context.Provider = { context }; return context }
function useContext(context) { const stack = provided.get(context); return stack !== undefined && stack.length > 0 ? stack[stack.length - 1] : context.value }
const noop = () => {}
class Component { constructor(props) { this.props = props } }
function markup(element) {
  if (element === null || element === undefined || typeof element === 'boolean') return ''
  if (typeof element === 'string' || typeof element === 'number') return String(element)
  if (Array.isArray(element)) return element.map(markup).join('')
  const { type, props } = element
  if (type === Fragment) return markup(props.children)
  if (typeof type === 'string') return '<' + type + (props.className === undefined ? '' : ' class="' + props.className + '"') + '>' + markup(props.children) + '</' + type + '>'
  if (type.context !== undefined) {
    const stack = provided.get(type.context) ?? []
    provided.set(type.context, [...stack, props.value])
    try { return markup(props.children) } finally { provided.set(type.context, stack) }
  }
  if (type.prototype instanceof Component) return markup(new type(props).render())
  return markup(type(props))
}
export { Fragment, Component, createContext, useContext, markup, noop as useEffect, noop as useLayoutEffect }
export const jsx = (type, props) => ({ type, props })
export const jsxs = jsx
export const useState = init => [typeof init === 'function' ? init() : init, noop]
export const useRef = current => ({ current })
export const useMemo = make => make()
export const useCallback = fn => fn
export const useSyncExternalStore = (subscribe, read) => read()
`

const STAND_IN_PRIMITIVES = `
const host = type => props => ({ type, props })
export const Button = host('button')
export const Tag = host('span')
export const MarkdownText = props => props.text
export const IconChevronLeftOutlineRegular = () => null
export const writeClipboard = () => Promise.resolve(true)
`

type ViewElement = { readonly type: unknown, readonly props: Record<string, unknown> }

interface Views {
  readonly jsx: (type: unknown, props: Record<string, unknown>) => ViewElement
  readonly markup: (element: ViewElement) => string
  readonly Home: unknown
  readonly NodeRow: unknown
  readonly PlanPage: unknown
  readonly GuidePage: unknown
  readonly registerBoard: (board: Board) => void
  readonly ServicesContext: { readonly Provider: unknown }
  readonly NowContext: { readonly Provider: unknown }
  readonly MainChatContext: { readonly Provider: unknown }
}

let loaded: Promise<Views> | undefined

/** Home.tsx, common.tsx, Plan.tsx, MainChat.tsx, Guide.tsx and the board table in one ES module bundle over the stand-ins, loaded once. */
function views(): Promise<Views> {
  loaded ??= build({
    stdin: {
      contents: `export { jsx, markup } from 'react'; export { Home } from './Home.tsx'; export { NodeRow, NowContext, ServicesContext } from './common.tsx'; export { PlanPage } from './Plan.tsx'; export { MainChatContext } from './MainChat.tsx'; export { GuidePage } from './Guide.tsx'; export { registerBoard } from './boards.ts'`,
      resolveDir: fileURLToPath(new URL('../ui/src/graph/', import.meta.url)),
      loader: 'js',
    },
    plugins: [{
      name: 'stand-ins',
      setup(builder) {
        builder.onResolve({ filter: /^(react|react\/jsx-runtime|@deepseek-ai\/dsh-client-ui-primitives)$/ }, args => ({ path: args.path, namespace: 'stand-in' }))
        builder.onLoad({ filter: /.*/, namespace: 'stand-in' }, args => ({ contents: args.path.startsWith('react') ? STAND_IN_REACT : STAND_IN_PRIMITIVES, loader: 'js' }))
      },
    }],
    jsx: 'automatic',
    platform: 'node',
    format: 'esm',
    bundle: true,
    write: false,
    logLevel: 'silent',
  }).then(async result => {
    const [output] = result.outputFiles
    if (output === undefined) throw new Error('esbuild wrote no views bundle')
    // The bundle imports nothing outside itself, so it loads from a data URL.
    return await import(`data:text/javascript;base64,${Buffer.from(output.text).toString('base64')}`) as Views
  })
  return loaded
}

const NOW = Date.parse(at(10_000))

/** One view inside the panel's contexts: the clock, the services, and the main agent's chat being this one. */
async function render(view: keyof Pick<Views, 'Home' | 'NodeRow' | 'PlanPage' | 'GuidePage'>, props: Record<string, unknown>): Promise<string> {
  const v = await views()
  const inner = v.jsx(v[view], props)
  const chat = v.jsx(v.MainChatContext.Provider, { value: { chat: { kind: 'here' }, open: () => undefined }, children: inner })
  const services = v.jsx(v.ServicesContext.Provider, { value: { open: () => undefined }, children: chat })
  return v.markup(v.jsx(v.NowContext.Provider, { value: NOW, children: services }))
}

const noop = (): void => undefined

function home(graph: LoadedGraph, awaiting: readonly AwaitingEntry[] = []): Promise<string> {
  return render('Home', {
    graph, agents: [], awaiting, since: undefined, quiet: new Set(), sessionId: 's-1', mainHere: true,
    onPlan: noop, onChanges: noop, onLive: noop, onNeeds: noop, onModules: noop, onUser: noop, onBoard: noop,
  })
}

/** The titles of the home's sections, in order. */
function sections(html: string): string[] {
  return [...html.matchAll(/<div class="glmg-section">([^<]*)<\/div>/gu)].map(match => match[1])
}

/** The markup of each 需要你 card, in order (the last runs to the end of the page). */
function cards(html: string): string[] {
  return html.split('<div class="glmg-card wait">').slice(1)
}

const goal = (fields: Partial<GraphNode> = {}): GraphNode => node({ id: 'goal-1', type: 'goal', status: 'doing', title: '借书系统', ...fields }, 0, 'human')

test('需要你 on the home: the first item whole — the ask and the lines of its way of asking — the others with title and ask, a chat-only matter with its text', async () => {
  const graph = graphOf([
    goal(),
    node({
      id: 'q-1', type: 'question', parent: 'goal-1', title: '借书要不要先交押金',
      ask: '我建议借书先不收押金，因为押金要退还，可以吗？', form: 'recommend', proposal: '借书先不收押金', reason: '押金要退还', cost: '书丢了只能事后追责', notTaken: '先收押金再借',
    }, 1),
    node({
      id: 'q-2', type: 'question', parent: 'goal-1', title: '逾期怎么提醒读者',
      ask: '逾期时怎么提醒读者？', form: 'choose', proposal: '站内通知加邮件', reason: '多数读者不会每天登录', ways: ['只在借书记录页标红', '站内通知加邮件'],
    }, 2),
  ])
  const html = await home(graph, [{ kind: 'unknown', goal: '', module: '', text: '需求就这样定下来，可以吗？', at: Date.parse(at(3)) }])
  const [first, second, third] = cards(html)
  assert.ok(first !== undefined && second !== undefined && third !== undefined, html)
  for (const line of ['借书要不要先交押金', '我建议借书先不收押金，因为押金要退还，可以吗？', '推荐：借书先不收押金', '理由：押金要退还', '代价：书丢了只能事后追责', '不选的那种：先收押金再借', '在这个对话里回话']) {
    assert.ok(first.includes(line), `the first item shows ${line}`)
  }
  assert.ok(second.includes('逾期怎么提醒读者') && second.includes('逾期时怎么提醒读者？'), 'the second item shows its title and ask')
  for (const line of ['推荐：站内通知加邮件', '理由：多数读者不会每天登录', '1. 只在借书记录页标红']) {
    assert.ok(!second.includes(line), `the second item does not show ${line}`)
  }
  assert.ok(third.includes('需求就这样定下来，可以吗？'), 'a matter only the chat holds shows its text')
})

test('需要你 on the home: a choose question first shows its recommendation, reason and the ways numbered; a later legacy option card its title only', async () => {
  const graph = graphOf([
    goal(),
    node({
      id: 'q-2', type: 'question', parent: 'goal-1', title: '逾期怎么提醒读者',
      ask: '逾期时怎么提醒读者？', form: 'choose', proposal: '站内通知加邮件', reason: '多数读者不会每天登录', ways: ['只在借书记录页标红', '站内通知加邮件'],
    }, 1),
    node({ id: 'q-3', type: 'question', parent: 'goal-1', title: '书架怎么排', options: [{ key: 'A', label: '按作者', consequence: '' }, { key: 'B', label: '按类别', consequence: '' }], recommend: 'B' }, 2),
  ])
  const [first, second] = cards(await home(graph))
  assert.ok(first !== undefined && second !== undefined)
  const order = ['逾期时怎么提醒读者？', '推荐：站内通知加邮件', '理由：多数读者不会每天登录', '1. 只在借书记录页标红', '2. 站内通知加邮件'].map(line => first.indexOf(line))
  assert.ok(order.every(index => index >= 0), first)
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'the ask, the recommendation, the reason, then the ways')
  assert.ok(!first.includes('（推荐）'), 'no recommendation mark on a way')
  assert.ok(second.includes('书架怎么排') && !second.includes('按作者'), 'a later legacy card shows its title only')
})

test('an empty graph: the home is 效果是 with the way to start and nothing else; closed goals are not an empty graph', async () => {
  const empty = await home(graphOf([]))
  assert.deepEqual(sections(empty), ['效果是'])
  for (const line of ['这张图还是空的', '在输入框打 /wish，后面跟一句你想做的', '复制 /wish']) assert.ok(empty.includes(line), `the empty home shows ${line}`)
  const closed = await home(graphOf([goal({ status: 'done' }), node({ id: 'task-1', type: 'task', parent: 'goal-1', status: 'done', title: '记下借出' }, 1)]))
  assert.deepEqual(sections(closed).map(title => title.split(' · ')[0]), ['效果是', '需要你', '现在', '怎么做', '最近一天'])
  assert.ok(!closed.includes('这张图还是空的') && !closed.includes('复制 /wish'))
})

test('list rows carry no type name: the node row with and without its status, and the plan page', async () => {
  const graph = graphOf([
    goal(),
    node({ id: 'feature-1', type: 'feature', parent: 'goal-1', title: '借书' }, 1),
    node({ id: 'task-1', type: 'task', parent: 'feature-1', status: 'doing', title: '记下借出' }, 2),
    node({ id: 'task-2', type: 'task', parent: 'feature-1', title: '提醒归还', edges: [{ type: 'depends', to: 'task-1' }] }, 3),
    node({ id: 'decision-1', type: 'decision', parent: 'goal-1', verification: 'unverified', title: '用本地文件存' }, 4),
  ])
  const pages = [
    ...await Promise.all(['feature-1', 'task-1', 'decision-1'].flatMap(id => [true, false].map(status => render('NodeRow', { graph, node: graph.nodes.get(id), tone: 'doing', status })))),
    await render('PlanPage', { graph, plan: planOf(graph, NOW), goalTitle: (id: string) => graph.nodes.get(id)?.title }),
  ]
  const typeNames = Object.values(TYPE_LABELS)
  for (const html of pages) {
    const text = html.replace(/<[^>]*>/gu, ' ')
    for (const name of typeNames) assert.ok(!text.includes(name), `no type name ${name} in: ${text}`)
  }
  assert.ok(pages[2].includes('进行中'), 'a row with its status shows the status')
})

/** A board whose state per session is fixed by the test (the guide page reads only snapshot). */
function fixedBoard(id: string, states: Readonly<Record<string, BoardState>>): Board {
  const none: BoardState = { available: false, homeLine: null, guideLine: null, peakApplies: false }
  return { id, label: id, subscribe: () => () => undefined, snapshot: sessionId => states[sessionId] ?? none, Page: () => null }
}

test('the guide page: the metrics board adds its guideLine after the loops block while it is there with a line; otherwise the page is the six blocks as before (guide-metrics-line, metrics design §11 item 19)', async () => {
  const v = await views()
  const on: BoardState = { available: true, homeLine: null, guideLine: null, peakApplies: false }
  const guide = (sessionId: string): Promise<string> => render('GuidePage', { sessionId, onOpenBoard: noop, onDone: noop })
  v.registerBoard(fixedBoard('rules', { present: on, off: on, silent: on, unregistered: on }))
  v.registerBoard(fixedBoard('loops', { present: on, off: on, silent: on, unregistered: on }))
  const six = ['一眼看懂', '你要做的只有回话', '让主 Agent 接手', '规则板', '循环板', '去哪看进度']
  // Before the metrics board registers: the six blocks only.
  const before = await guide('unregistered')
  assert.deepEqual(sections(before), six)
  v.registerBoard(fixedBoard('metrics', {
    present: { ...on, guideLine: GUIDE_LINE },
    off: { available: false, homeLine: null, guideLine: GUIDE_LINE, peakApplies: false },
    silent: on,
  }))
  const present = await guide('present')
  assert.deepEqual(sections(present), ['一眼看懂', '你要做的只有回话', '让主 Agent 接手', '规则板', '循环板', '指标板', '去哪看进度'], 'the line sits after the loops block')
  assert.ok(present.includes(`<div class="glmg-meta">${GUIDE_LINE}</div>`), 'the text is the board\'s GUIDE_LINE')
  assert.ok(present.includes('去看指标板 ›'))
  assert.equal(present.replace(/<section class="glmg-part"><div class="glmg-section">指标板<\/div>.*?<\/section>/u, ''), before, 'the six blocks and the footer are unchanged')
  for (const sessionId of ['off', 'silent']) {
    const absent = await guide(sessionId)
    assert.equal(absent, before, `${sessionId}: no metrics line`)
    assert.ok(!absent.includes(GUIDE_LINE) && !absent.includes('去看指标板'))
  }
})

/** The relative luminance of an sRGB colour (WCAG 2.1). */
function luminance([r, g, b]: readonly [number, number, number]): number {
  const channel = (value: number): number => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The host's light tokens (rc.3, read on the desktop: .agents/tasks/ui-audit/findings.md
 * Q-07, the Q4 report l4-2026-11-05.md item 1): label primary, secondary and
 * tertiary, the business colour, the panel's white base.
 */
const LIGHT = { primary: [15, 17, 21], secondary: [97, 102, 107], tertiary: [129, 133, 140], business: [65, 118, 230], base: [255, 255, 255] } as const

test('the light theme: grey text takes the secondary label and links mix the ink into the business colour, both at 4.5:1 or more on the base', () => {
  assert.ok(contrast(LIGHT.tertiary, LIGHT.base) < 4.5 && contrast(LIGHT.business, LIGHT.base) < 4.5, 'the host tokens the panel used fall short (3.71:1 and 4.23:1)')
  assert.equal(LIGHT_TOKENS.ink3, 'var(--dsw-alias-label-secondary,#61666b)')
  assert.equal(LIGHT_TOKENS.link, 'color-mix(in srgb,var(--dsw-alias-state-business-primary,#4176e6) 80%,var(--dsw-alias-label-primary,#0f1115))')
  const mixed = LIGHT.business.map((value, index) => 0.8 * value + 0.2 * LIGHT.primary[index]) as unknown as readonly [number, number, number]
  assert.ok(contrast(LIGHT.secondary, LIGHT.base) >= 4.5, `grey ${contrast(LIGHT.secondary, LIGHT.base).toFixed(2)}:1`)
  assert.ok(contrast(mixed, LIGHT.base) >= 4.5, `link ${contrast(mixed, LIGHT.base).toFixed(2)}:1`)
  // Keyed on the host's own switch: its CSS keys the dark tokens on body[data-ds-dark-theme], absent in the light theme.
  assert.ok(PANEL_CSS.includes(`body:not([data-ds-dark-theme]) .glmg{--g-ink3:${LIGHT_TOKENS.ink3};--g-link:${LIGHT_TOKENS.link}}`))
  assert.match(PANEL_CSS, /\.glmg-more\{[^}]*color:var\(--g-link\)/u)
  assert.match(PANEL_CSS, /\.glmg-meta\{[^}]*color:var\(--g-ink3\)/u)
})
