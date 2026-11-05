/**
 * The default table (takeover design 0.6 §5.5; docs/ORCHESTRATION.md §7.5,
 * the community defaults turned into commands). Pure. One row per
 * ecosystem: how to set it up, the merge gate's commands, and the tool
 * nodes under `env` with their check and config lines (M4 design §6.1.1;
 * the one place a tool node is drafted is `toolNodeDraft`).
 *
 * A check command does not go through a shell, so its first item is a
 * program that starts directly (`node` with a script path, `uv`, `go`,
 * `cargo`, an `.exe`), never `npx`, `pnpm`, `yarn` or another `.cmd`. A gate
 * line is run whole by a shell and is written as people type it.
 *
 * Every recognised ecosystem's gate carries one test command, whether or not
 * the project has tests yet (the person's decision d-tests-required-gate,
 * applied to the takeover by the orchestrator on 2026-11-04: the merge stays
 * blocked until there is a test). Shell and the ecosystems the table does
 * not know get no invented command: only the project's own are copied.
 *
 * The gate also carries the dead-code and duplicate checks of
 * docs/ORCHESTRATION.md §7.5 (the person's decision d-habits-into-framework,
 * 2026-11-05): Node knip and jscpd, Python vulture. Rust needs none (its
 * `cargo clippy … -D warnings` makes rustc's dead_code warning an error); Go
 * is not covered (`go vet` does not find unused functions). Tried on
 * 2026-11-05 with M4's parsers (src/env/parsers.ts): jscpd 5.4.2 with
 * `--reporters xcode` and vulture 2.16 print `<file>:<line>[:<col>]: <message>`,
 * which the `lines` format reads; no reporter of knip 6.43.0 prints a line
 * any format reads, so knip's output reads in none (design §5.6 item 4).
 *
 * The gate draft takes M7's basic forms only (`$`, `setup $`); the `only`
 * line joins when M7's `GATE_LINE_FORMS` is on main (plan B7).
 */
import type { CommandCandidate } from './extract.ts'
import type { ScanResult, Stack } from './scan.ts'

export const DEFAULTS_VERSION = '2026-11-05'

/** The ecosystems the table has a row for. */
export const DEFAULT_KEYS = ['node-npm', 'node-pnpm', 'node-yarn', 'node-bun', 'python-uv', 'python-poetry', 'python', 'go', 'rust', 'shell', 'cmake'] as const
export type DefaultKey = typeof DEFAULT_KEYS[number]

/** What a gate command does; a draft has one command per kind at most. */
type GateKind = 'build' | 'typecheck' | 'lint' | 'format-check' | 'dead-code' | 'duplicate' | 'test'
const GATE_KINDS: readonly GateKind[] = ['build', 'typecheck', 'lint', 'format-check', 'dead-code', 'duplicate', 'test']

/** One gate command of a row; `format` is the check format its output reads in, when one does (src/env/parsers.ts). */
interface GateDefault {
  readonly kind: GateKind
  readonly command: string
  readonly format?: 'lines'
}

/** One check line of M4 (design §6.1.1), without an estimate: the trial measures that (§5.5). */
interface CheckDefault {
  readonly name: string
  readonly format: 'eslint-json' | 'tsc' | 'lines'
  readonly command: string
  readonly when: string
}

interface ToolDefault {
  readonly title: string
  readonly purpose: string
  readonly usage: string
  readonly why: string
  readonly place: string
  readonly check: CheckDefault
  readonly config?: string
}

export interface EcosystemDefaults {
  readonly key: DefaultKey
  readonly title: string
  readonly recognisedBy: string
  readonly setup: readonly string[]
  readonly gate: readonly GateDefault[]
  readonly tools: readonly ToolDefault[]
  /** The packages the gate and the checks run, installed as development dependencies by a new project's task 检查器配置. */
  readonly devTools: readonly string[]
  /** Why there are no tool nodes, when there are none. */
  readonly note?: string
  /** What the row leaves uncovered on purpose. */
  readonly notCovered?: string
}

/** What a row depends on in the project: its platform and the files git tracks (lock files, `tsconfig.json`, `.yarnrc.yml`). */
export interface DefaultFacts {
  readonly platform: NodeJS.Platform
  /** Repository-relative tracked paths; empty for a new project. */
  readonly files: readonly string[]
  /** A new project: nothing is there yet, so the row is what its first task builds. */
  readonly fresh: boolean
}

const has = (facts: DefaultFacts, name: string): boolean => facts.files.includes(name)

const JS_FILES = '*.js, *.mjs, *.cjs, *.ts, *.mts, *.tsx'
const PNP_NOTE = '这个项目没有 node_modules，改完即查先不提'

const NODE_TOOLS: readonly ToolDefault[] = [
  {
    title: 'ESLint', purpose: '检查 JavaScript 与 TypeScript 的写法问题', usage: '改完 .js、.ts 一类文件后由检查器自动跑', why: '社区默认方案，规则多、插件全', place: '项目的 node_modules（开发依赖）',
    check: { name: 'eslint', format: 'eslint-json', command: 'node node_modules/eslint/bin/eslint.js --format json {files}', when: JS_FILES },
    config: 'eslint.config.mjs',
  },
  {
    title: 'TypeScript', purpose: '检查类型', usage: '改完 .ts 一类文件后由检查器自动跑', why: '类型错误在合入之前发现', place: '项目的 node_modules（开发依赖）',
    check: { name: 'tsc', format: 'tsc', command: 'node node_modules/typescript/bin/tsc --noEmit --pretty false', when: '*.ts, *.mts, *.tsx' },
    config: 'tsconfig.json',
  },
]

function nodeRow(key: 'node-npm' | 'node-pnpm' | 'node-yarn' | 'node-bun', facts: DefaultFacts): EcosystemDefaults {
  const tsconfig = facts.fresh || has(facts, 'tsconfig.json')
  const pnp = has(facts, '.pnp.cjs') || has(facts, '.pnp.js')
  // `exec` runs a development dependency's program the way the package manager does.
  const shape = {
    'node-npm': { title: 'Node + npm', by: 'package-lock.json，或没有锁文件的 package.json', setup: has(facts, 'package-lock.json') || has(facts, 'npm-shrinkwrap.json') ? 'npm ci' : 'npm install', test: 'npm test', exec: 'npx' },
    'node-pnpm': { title: 'Node + pnpm', by: 'pnpm-lock.yaml', setup: 'pnpm install --frozen-lockfile', test: 'pnpm test', exec: 'pnpm exec' },
    'node-yarn': { title: 'Node + yarn', by: 'yarn.lock', setup: has(facts, '.yarnrc.yml') ? 'yarn install --immutable' : 'yarn install --frozen-lockfile', test: 'yarn test', exec: 'yarn' },
    'node-bun': { title: 'Node + bun', by: 'bun.lockb 或 bun.lock', setup: 'bun install --frozen-lockfile', test: 'bun run test', exec: 'bunx' },
  }[key]
  return {
    key, title: shape.title, recognisedBy: shape.by, setup: [shape.setup],
    gate: [
      ...tsconfig ? [{ kind: 'typecheck' as const, command: `${shape.exec} tsc --noEmit` }] : [],
      { kind: 'dead-code', command: `${shape.exec} knip` },
      { kind: 'duplicate', command: `${shape.exec} jscpd --exit-code 1 --reporters xcode --format javascript,jsx,typescript,tsx .`, format: 'lines' },
      { kind: 'test', command: shape.test },
    ],
    tools: pnp ? [] : NODE_TOOLS,
    devTools: ['eslint', ...tsconfig ? ['typescript'] : [], 'knip', 'jscpd'],
    ...pnp ? { note: PNP_NOTE } : {},
  }
}

/** vulture over the project, without the virtual environment it would otherwise read (tried: `vulture .` reads `.venv/`). */
const vulture = (program: string): GateDefault => ({ kind: 'dead-code', command: `${program} vulture . --exclude .venv`, format: 'lines' })
const PYTHON_DEV_TOOLS = ['ruff', 'pytest', 'vulture']

const ruffTool = (program: string): ToolDefault => ({
  title: 'Ruff', purpose: '检查 Python 的写法问题', usage: '改完 .py 文件后由检查器自动跑', why: '社区默认方案，快，一个工具管写法与导入', place: '项目的虚拟环境（开发依赖）',
  check: { name: 'ruff', format: 'lines', command: `${program} --output-format concise {files}`, when: '*.py' },
  config: 'pyproject.toml',
})

function pythonRow(key: 'python-uv' | 'python-poetry' | 'python', facts: DefaultFacts): EcosystemDefaults {
  if (key === 'python-uv') {
    return {
      key, title: 'Python + uv', recognisedBy: 'uv.lock', setup: ['uv sync --frozen'],
      gate: [{ kind: 'lint', command: 'uv run ruff check .' }, vulture('uv run'), { kind: 'test', command: 'uv run pytest' }],
      tools: [ruffTool('uv run ruff check')], devTools: PYTHON_DEV_TOOLS,
    }
  }
  if (key === 'python-poetry') {
    return {
      key, title: 'Python + Poetry', recognisedBy: 'poetry.lock', setup: ['poetry install'],
      gate: [{ kind: 'lint', command: 'poetry run ruff check .' }, vulture('poetry run'), { kind: 'test', command: 'poetry run pytest' }],
      tools: [ruffTool('poetry run ruff check')], devTools: PYTHON_DEV_TOOLS,
    }
  }
  const win = facts.platform === 'win32'
  const shell = win ? '.venv\\Scripts\\python' : '.venv/bin/python'
  const direct = win ? '.venv/Scripts/python' : '.venv/bin/python'
  const requirements = facts.files.find(file => /^requirements.*\.txt$/.test(file)) ?? (facts.fresh ? 'requirements.txt' : undefined)
  return {
    key, title: 'Python（其他）', recognisedBy: 'pyproject.toml、requirements*.txt，没有 uv.lock 与 poetry.lock',
    setup: ['python -m venv .venv', requirements === undefined ? `${shell} -m pip install -e .` : `${shell} -m pip install -r ${requirements}`],
    gate: [{ kind: 'lint', command: `${shell} -m ruff check .` }, vulture(`${shell} -m`), { kind: 'test', command: `${shell} -m pytest` }],
    tools: [ruffTool(`${direct} -m ruff check`)], devTools: PYTHON_DEV_TOOLS,
  }
}

function otherRow(key: 'go' | 'rust' | 'shell' | 'cmake', facts: DefaultFacts): EcosystemDefaults {
  if (key === 'go') {
    return {
      key, title: 'Go', recognisedBy: 'go.mod', setup: ['go mod download'],
      gate: [{ kind: 'build', command: 'go build ./...' }, { kind: 'lint', command: 'go vet ./...' }, { kind: 'test', command: 'go test ./...' }],
      tools: [{ title: 'go vet', purpose: '检查 Go 代码里可疑的写法', usage: '改完 .go 文件后由检查器自动跑', why: 'Go 自带，不用另装', place: 'Go 工具链', check: { name: 'govet', format: 'lines', command: 'go vet ./...', when: '*.go' } }],
      devTools: [],
      notCovered: 'unused functions and duplicates: go vet does not find them, and staticcheck is not in the table for now',
    }
  }
  if (key === 'rust') {
    return {
      key, title: 'Rust', recognisedBy: 'Cargo.toml', setup: facts.fresh || has(facts, 'Cargo.lock') ? ['cargo fetch --locked'] : [],
      gate: [{ kind: 'build', command: 'cargo build --locked' }, { kind: 'lint', command: 'cargo clippy --locked -- -D warnings' }, { kind: 'test', command: 'cargo test --locked' }],
      tools: [{ title: 'Clippy', purpose: '检查 Rust 代码里的常见问题', usage: '改完 .rs 文件后由检查器自动跑', why: 'Rust 工具链自带', place: 'Rust 工具链（rustup 组件）', check: { name: 'clippy', format: 'lines', command: 'cargo clippy --message-format short', when: '*.rs' }, config: 'Cargo.toml' }],
      // `-D warnings` makes rustc's dead_code warning an error: no separate dead-code line.
      devTools: [],
    }
  }
  if (key === 'shell') {
    return {
      key, title: 'Shell', recognisedBy: '已跟踪的 .sh', setup: [], gate: [],
      tools: [{ title: 'ShellCheck', purpose: '检查 shell 脚本', usage: '改完 .sh 文件后由检查器自动跑', why: '社区默认方案', place: '系统里装的 shellcheck', check: { name: 'shellcheck', format: 'lines', command: 'shellcheck -f gcc {files}', when: '*.sh' } }],
      devTools: [],
    }
  }
  return {
    key, title: 'C / C++（CMake）', recognisedBy: 'CMakeLists.txt', setup: ['cmake -S . -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON'],
    gate: [{ kind: 'build', command: 'cmake --build build' }, { kind: 'test', command: 'ctest --test-dir build' }],
    tools: [{ title: 'clang-tidy', purpose: '检查 C 与 C++ 代码', usage: '改完 .c、.cpp 一类文件后由检查器自动跑', why: '社区默认方案', place: '系统里装的 LLVM', check: { name: 'clangtidy', format: 'lines', command: 'clang-tidy -p build {files}', when: '*.c, *.cc, *.cpp, *.h, *.hpp' }, config: '.clang-tidy' }],
    devTools: [],
  }
}

/** The row of an ecosystem; undefined for one the table does not know (deno, meson, Java, Ruby, PHP, .NET…). */
export function ecosystemDefaults(stack: Stack, facts: DefaultFacts): EcosystemDefaults | undefined {
  switch (stack) {
    case 'node-npm': case 'node-pnpm': case 'node-yarn': case 'node-bun': return nodeRow(stack, facts)
    case 'python-uv': case 'python-poetry': case 'python': return pythonRow(stack, facts)
    case 'go': case 'rust': case 'shell': case 'cmake': return otherRow(stack, facts)
    default: return undefined
  }
}

/** A check line as M4 reads it: `` `check <name> <format> $ <command>` when <conditions> ``. */
const checkLine = (check: CheckDefault): string => `\`check ${check.name} ${check.format} $ ${check.command}\` when ${check.when}`

/** A tool node as the main agent proposes it under `env` (M4 design §7.1 labels; the check and config lines in its acceptance). */
export function toolNodeDraft(tool: ToolDefault): { readonly type: 'tool', readonly parent: 'env', readonly title: string, readonly body: string, readonly acceptance: readonly string[] } {
  return {
    type: 'tool', parent: 'env', title: tool.title,
    body: [`用途：${tool.purpose}`, `用法：${tool.usage}`, `选择理由：${tool.why}`, `安装位置：${tool.place}`].join('\n'),
    acceptance: [checkLine(tool.check), ...tool.config === undefined ? [] : [`\`config ${tool.config}\``]],
  }
}

/** One command of a gate draft: a default, or the project's own with where it was read. */
interface GateItem {
  readonly form: 'setup' | 'check'
  readonly kind: GateKind | 'setup'
  readonly command: string
  readonly from?: { readonly file: string, readonly line: number }
}

/** The acceptance line of a gate command (M7 §3.8.1). */
export const gateLine = (item: GateItem): string => item.form === 'setup' ? `\`setup $ ${item.command}\`` : `\`$ ${item.command}\``

/** Words in a candidate's name or expanded text that make it look like a check that costs money or holds the machine (§5.4). */
const COST_EXACT = ['e2e', 'load', 'device', 'emulator', 'desktop', 'gpu', 'cloud', 'staging']
const COST_PREFIX = ['bench', 'perf', 'calibrat', 'integrat']

const tokens = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 0)

/** Whether a candidate looks like a check that costs money or holds the machine (§5.4, the first thing). A CI step that reads `secrets.` does too. */
export function looksCostly(candidate: CommandCandidate): boolean {
  const words = [...tokens(candidate.name ?? candidate.text), ...(candidate.expanded ?? []).flatMap(tokens)]
  if (words.some(word => COST_EXACT.includes(word) || COST_PREFIX.some(prefix => word.startsWith(prefix)))) return true
  return candidate.origin === 'ci' && /\bsecrets\./.test(candidate.text)
}

/** A candidate the gate takes as it is: not publishing, not running on, one line, not costly (§5.5). */
const gateable = (candidate: CommandCandidate): boolean => candidate.danger === null && !candidate.longRunning && !candidate.multiline && !looksCostly(candidate)

/** The kind of a project's own command for the gate: the dead-code and duplicate tools by their script name, else the scan's kind. */
function ownKind(candidate: CommandCandidate): GateKind | 'setup' | 'other' {
  const words = tokens(candidate.name ?? candidate.text)
  if (words.some(word => word === 'knip' || word === 'vulture' || word === 'deadcode')) return 'dead-code'
  if (words.some(word => word === 'jscpd' || word.startsWith('dup'))) return 'duplicate'
  return candidate.kind
}

/** The manifest an ecosystem's own commands are read from. */
const OWN_FILE: Partial<Record<DefaultKey, string>> = { 'node-npm': 'package.json', 'node-pnpm': 'package.json', 'node-yarn': 'package.json', 'node-bun': 'package.json', 'python-uv': 'pyproject.toml', 'python-poetry': 'pyproject.toml', python: 'pyproject.toml' }

/**
 * The gate draft of one ecosystem: its setup, then for each kind the
 * project's own command when its manifest names one (a script named after
 * the kind first), else the default. One command per kind, so exactly one
 * test command wherever the row has one. A default the project already has
 * but that is left out (it looks costly or publishing) is not put back.
 */
export function gateDraft(row: EcosystemDefaults, candidates: readonly CommandCandidate[]): readonly GateItem[] {
  const file = OWN_FILE[row.key]
  const mine = file === undefined ? [] : candidates.filter(candidate => candidate.source.file === file)
  const own = mine.filter(gateable)
  const left = new Set(mine.filter(candidate => !gateable(candidate)).map(candidate => candidate.text))
  const items: GateItem[] = row.setup.map(command => ({ form: 'setup', kind: 'setup', command }))
  for (const kind of GATE_KINDS) {
    const found = own.filter(candidate => ownKind(candidate) === kind).sort((a, b) => Number(b.name === kind) - Number(a.name === kind))[0]
    if (found !== undefined) {
      items.push({ form: 'check', kind, command: found.text, from: { file: found.source.file, line: found.source.line } })
      continue
    }
    const fallback = row.gate.find(entry => entry.kind === kind)
    if (fallback !== undefined && !left.has(fallback.command)) items.push({ form: 'check', kind, command: fallback.command })
  }
  return items
}

/**
 * Whether the scan found no tests, the signal of the person's test gate:
 * Node without a `test` script, Python without a top `tests/` or `test/`
 * directory and without `[tool.pytest…]`. The other ecosystems give none.
 */
export function testsMissing(scan: ScanResult): boolean {
  const node = scan.stacks.some(stack => stack.startsWith('node-')) && !scan.candidates.some(candidate => candidate.source.file === 'package.json' && candidate.name === 'test')
  const python = scan.stacks.some(stack => stack.startsWith('python')) && !scan.files.topDirs.some(dir => dir === 'tests/' || dir === 'test/') && !scan.checkers.pyprojectTools.includes('pytest')
  return node || python
}

/** What `defaults.md` and the reminder say when the scan found no tests. */
export const TESTS_MISSING_NOTE = 'No tests were found: the test command stays in the merge gate all the same, so once the human agrees the first merge is blocked (npm test without a script exits 1, pytest without tests exits 5). Propose a task "补上测试" with the other nodes.'

/** Where a default gate line's output is read (design §5.6): in a check format, or in none. */
function readsIn(row: EcosystemDefaults, item: GateItem): string {
  if (item.from !== undefined || (item.kind !== 'dead-code' && item.kind !== 'duplicate')) return ''
  const format = row.gate.find(entry => entry.kind === item.kind)?.format
  return format === undefined ? '  (its output reads in no check format)' : `  (its output reads as \`${format}\`)`
}

/** On an existing project a dead-code or duplicate default may fail on the code as it is (§5.6): until M7 gates only new findings, it then stays out. */
const RED_ON_HEAD_NOTE = 'A dead-code or duplicate default that fails on the current code stays out of norm-merge-gate for now: propose a task "让 <command> 在现在的代码上通过" instead (design §5.6 item 4).'

function rowMarkdown(row: EcosystemDefaults, candidates: readonly CommandCandidate[], missing: boolean, fresh: boolean): string[] {
  const gate = gateDraft(row, candidates)
  const added = gate.some(item => item.from === undefined && (item.kind === 'dead-code' || item.kind === 'duplicate'))
  return [
    `## ${row.title} (recognised by ${row.recognisedBy})`,
    '',
    'norm-merge-gate acceptance, one line each:',
    ...gate.length === 0 ? ['- (none by default: copy only the project\'s own commands)'] : gate.map(item => `- ${gateLine(item)}${item.from === undefined ? '' : `  (the project's own, ${item.from.file}:${item.from.line})`}${readsIn(row, item)}`),
    ...missing && gate.some(item => item.kind === 'test' && item.from === undefined) ? ['', TESTS_MISSING_NOTE] : [],
    ...!fresh && added ? ['', RED_ON_HEAD_NOTE] : [],
    ...row.devTools.length === 0 ? [] : ['', `Development dependencies the lines run: ${row.devTools.join(', ')}${fresh ? ' (the task 检查器配置 installs them)' : '; a default whose tool the project lacks needs a task that adds it'}.`],
    ...row.notCovered === undefined ? [] : ['', `Not covered: ${row.notCovered}.`],
    '',
    ...row.tools.length === 0
      ? [`Tool nodes under env: none (${row.note ?? 'no default'}).`]
      : ['Tool nodes under env (graph_propose, type tool, parent env):', ...row.tools.flatMap((tool) => {
          const draft = toolNodeDraft(tool)
          return [`- title: ${draft.title}`, ...draft.body.split('\n').map(line => `  ${line}`), '  acceptance:', ...draft.acceptance.map(line => `  - ${line}`)]
        })],
    '',
  ]
}

/**
 * `defaults.md`: for an existing project the rows of the ecosystems the
 * scan recognised, the project's own commands in place of the defaults;
 * for a new project every row, for the main agent to pick one with the human.
 */
export function defaultsMarkdown(scan: ScanResult, files: readonly string[], fresh: boolean, platform: NodeJS.Platform = process.platform): string {
  const facts: DefaultFacts = { platform, files, fresh }
  const stacks: readonly Stack[] = fresh ? DEFAULT_KEYS : scan.stacks
  const rows = stacks.map(stack => ({ stack, row: ecosystemDefaults(stack, facts) }))
  const missing = !fresh && testsMissing(scan)
  return [
    `# Default checks (defaults ${DEFAULTS_VERSION})`,
    '',
    fresh
      ? 'Every ecosystem the table knows. Pick one with the human; after they agree, propose its merge gate, the env feature with its tool nodes, a decision "技术栈与检查器的选择" and a task "检查器配置" (create the files of the config lines, and at least one test) exactly as listed.'
      : 'The ecosystems the scan recognised. A gate line marked as the project\'s own is copied from its manifest; the others are defaults for what it lacks. Every gate keeps one test command.',
    'A check line starts a program without a shell. Do not add an estimate such as `8s` to a check line yourself.',
    '',
    ...rows.flatMap(({ stack, row }) => row === undefined ? [`## ${stack}`, '', 'No default for this ecosystem: copy only the project\'s own commands.', ''] : rowMarkdown(row, fresh ? [] : scan.candidates, missing, fresh)),
    ...rows.length === 0 ? ['No ecosystem was recognised: copy only the project\'s own commands. With none at all, propose norm-merge-gate without commands and a task "定下合入前的检查".', ''] : [],
  ].join('\n')
}
