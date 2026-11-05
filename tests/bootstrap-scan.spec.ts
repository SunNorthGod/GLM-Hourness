/**
 * The takeover's scan, path decision, danger judgement, touch paths and
 * floor draft (takeover design 0.6 §1.4 bootstrap-scan #1–#4, the format
 * part of #5; §15.1). Pure functions are called directly; the scan runs on
 * fixture repositories that `git init` builds in a temporary directory.
 * The floor lines are checked against the judgement forms of M7 §3.8.5 as
 * written there (M7's `parseFloor` is not on main; B7 switches to it).
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { dangerOf, longRunningOf } from '../src/bootstrap/danger.ts'
import {
  justfileCandidates, kindOf, makefileCandidates, noxCandidates, packageJsonCandidates, packageManagerOf, preCommitCandidates,
  pyprojectCandidates, taskfileCandidates, toxCandidates, yamlCandidates, huskyCandidates,
} from '../src/bootstrap/extract.ts'
import { FLOOR_BODY, FLOOR_GENERAL, floorDraft, floorMarkdown, mergeToLimit } from '../src/bootstrap/floor.ts'
import { decidePath, hasProjectGraph, isProjectGraph, type PathDecision } from '../src/bootstrap/path.ts'
import { SCAN_GIT_FLAGS, scanWorkspace, withoutUserInfo, writeScan, type ScanOutput, type ScanResult } from '../src/bootstrap/scan.ts'
import { touchPaths } from '../src/bootstrap/touch.ts'

const temp = mkdtempSync(join(tmpdir(), 'bs-scan-'))
test.after(() => rmSync(temp, { recursive: true, force: true }))
// A fixture outside git must not find a repository above the temporary directory.
process.env.GIT_CEILING_DIRECTORIES = tmpdir()
let fixtureCount = 0

function put(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8' })
}

/** A directory with `files`; `commits` > 0 makes it a git repository with that many commits (the first holds the files), 0 a repository without a commit, undefined no repository. */
function fixture(files: Readonly<Record<string, string>>, commits?: number, dirs: readonly string[] = []): string {
  fixtureCount += 1
  const root = join(temp, `f${fixtureCount}`)
  mkdirSync(root, { recursive: true })
  put(root, files)
  for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true })
  if (commits !== undefined) {
    git(root, 'init', '-q')
    if (commits > 0) {
      git(root, 'add', '-A')
      git(root, 'commit', '-q', '--allow-empty', '-m', 'first')
      for (let index = 1; index < commits; index += 1) git(root, 'commit', '-q', '--allow-empty', '-m', `commit ${index + 1}`)
    }
  }
  return root
}

const scanOf = (root: string, graphRel = 'docs/graph'): Promise<ScanOutput> => scanWorkspace(root, { graphDir: join(root, graphRel) })

function expectPath(decision: PathDecision, path: 'new' | 'existing' | 'gaps', rule: number): void {
  assert.equal(decision.ok, true, JSON.stringify(decision))
  if (!decision.ok) return
  assert.equal(decision.path, path, decision.reason)
  assert.equal(decision.rule, rule, decision.reason)
}

const NODE_PACKAGE = JSON.stringify({
  name: 'fixture',
  scripts: { test: 'node --test', lint: 'eslint .', deploy: 'node scripts/ship.js', build: 'tsc -p .', pretest: 'npm run build' },
}, null, 2)

// ---------------------------------------------------------------- scan #1: the fixtures and their paths

test('scan #1: each fixture workspace gets its path and the sentence behind it', async () => {
  const empty = fixture({})
  const emptyScan = (await scanOf(empty)).scan
  const emptyPath = decidePath(emptyScan)
  expectPath(emptyPath, 'new', 2)
  assert.equal(emptyPath.ok && emptyPath.init, true)
  assert.equal(emptyPath.ok && emptyPath.reason, '空目录：当新项目，已建 git 仓库')

  const readmeOnly = fixture({ 'README.md': '# hello\n' }, 1)
  const readmePath = decidePath((await scanOf(readmeOnly)).scan)
  expectPath(readmePath, 'new', 4)
  assert.equal(readmePath.ok && readmePath.reason, 'git 仓库里还没有代码（1 个提交）：当新项目')

  const noCommit = fixture({ 'index.js': 'console.log(1)\n' }, 0)
  const noCommitPath = decidePath((await scanOf(noCommit)).scan)
  expectPath(noCommitPath, 'new', 4)
  assert.equal(noCommitPath.ok && noCommitPath.note, '仓库里还没有提交：工作区里的文件不当已有的代码读')

  // `git init && git add .` before the first commit: the index lists the staged code, but nothing is tracked yet (review B2 F1).
  const staged = fixture({ 'index.js': 'console.log(1)\n' }, 0)
  git(staged, 'add', '-A')
  const stagedScan = (await scanOf(staged)).scan
  assert.equal(stagedScan.git.state === 'repo' && stagedScan.git.head, undefined)
  assert.equal(stagedScan.files.code, 1, 'the scan still records the staged file')
  const stagedPath = decidePath(stagedScan)
  expectPath(stagedPath, 'new', 4)
  assert.equal(stagedPath.ok && stagedPath.reason, 'git 仓库里还没有代码（0 个提交）：当新项目')
  assert.equal(stagedPath.ok && stagedPath.note, '仓库里还没有提交：工作区里的文件不当已有的代码读')

  const node = fixture({ 'package.json': NODE_PACKAGE, 'package-lock.json': '{}\n', 'src/index.js': 'export const a = 1\n', 'vendor/lib.js': 'x\n' }, 2)
  const nodeScan = (await scanOf(node)).scan
  const nodePath = decidePath(nodeScan)
  expectPath(nodePath, 'existing', 5)
  assert.equal(nodePath.ok && nodePath.reason, '已有项目：2 个代码文件、2 个提交、清单 package-lock.json、package.json')
  assert.deepEqual(nodeScan.stacks, ['node-npm'])

  const python = fixture({ 'pyproject.toml': '[project]\nname = "app"\n\n[tool.ruff]\nline-length = 100\n\n[tool.pytest.ini_options]\naddopts = "-q"\n\n[tool.poe.tasks]\nlint = "ruff check ."\n', 'uv.lock': 'version = 1\n', 'app/main.py': 'print(1)\n' }, 1)
  const pythonScan = (await scanOf(python)).scan
  expectPath(decidePath(pythonScan), 'existing', 5)
  assert.deepEqual(pythonScan.stacks, ['python-uv'])
  assert.deepEqual(pythonScan.checkers.pyprojectTools, ['ruff', 'pytest', 'poe'])
  assert.deepEqual(pythonScan.candidates.map(candidate => candidate.text), ['poe lint'])

  const go = fixture({ 'go.mod': 'module example.com/app\n\ngo 1.22\n', 'main.go': 'package main\n' }, 1)
  const goScan = (await scanOf(go)).scan
  expectPath(decidePath(goScan), 'existing', 5)
  assert.deepEqual(goScan.stacks, ['go'])

  const actions = fixture({
    '.github/workflows/ci.yml': 'name: ci\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - name: Test\n        run: "npm test"\n      - run: |\n          npm run build\n          npm run e2e\n',
    'package.json': NODE_PACKAGE,
    'src/a.ts': 'export {}\n',
  }, 1)
  const actionsScan = (await scanOf(actions)).scan
  expectPath(decidePath(actionsScan), 'existing', 5)
  assert.deepEqual(actionsScan.sources.ci, ['.github/workflows/ci.yml'])
  const ciTexts = actionsScan.candidates.filter(candidate => candidate.origin === 'ci').map(candidate => [candidate.text, candidate.source.line, candidate.multiline])
  assert.deepEqual(ciTexts, [['npm ci', 8, false], ['npm test', 10, false], ['npm run build', 12, true]])

  const withGraph = fixture({ 'docs/graph/nodes/goal.json': '{}\n', 'src/a.ts': 'export {}\n' }, 1)
  const graphPath = decidePath((await scanOf(withGraph)).scan)
  expectPath(graphPath, 'gaps', 1)
  assert.equal(graphPath.ok && graphPath.reason, '已有项目图（1 个节点）：只补缺的')

  const emptyNodes = fixture({ 'src/a.ts': 'export {}\n' }, 1, ['docs/graph/nodes'])
  const emptyNodesScan = (await scanOf(emptyNodes)).scan
  assert.equal(emptyNodesScan.graph.present, false)
  expectPath(decidePath(emptyNodesScan), 'existing', 5)

  const filesNoGit = fixture({ 'notes.txt': 'x\n', 'README.md': '# r\n' })
  const refused = decidePath((await scanOf(filesNoGit)).scan)
  assert.deepEqual(refused, { ok: false, rule: 3, reason: '这个目录有文件但不是 git 仓库：先在终端里 git init 并提交一次，再发 /wish' })

  const graphDirOnly = fixture({}, undefined, ['docs/graph'])
  const graphDirPath = decidePath((await scanOf(graphDirOnly)).scan)
  expectPath(graphDirPath, 'new', 2)
  assert.equal(graphDirPath.ok && graphDirPath.init, true)

  // The graph chain is ignored only while it holds nothing else: a second entry in docs/ is a file of the project.
  const docsWithMore = fixture({ 'docs/intro.md': '# intro\n' }, undefined, ['docs/graph'])
  assert.equal(decidePath((await scanOf(docsWithMore)).scan).rule, 3)
  // Ignorable entries do not count either.
  const ignorable = fixture({ 'README.md': '# r\n', 'LICENSE': 'MIT\n', '.gitignore': 'x\n', '.vscode/settings.json': '{}\n', '.llm/x': 'y' })
  expectPath(decidePath((await scanOf(ignorable)).scan), 'new', 2)
})

test('scan #1: three commits without code are still a new project, four are an existing one; a manifest is not code', async () => {
  expectPath(decidePath((await scanOf(fixture({ 'README.md': '# r\n' }, 3))).scan), 'new', 4)
  expectPath(decidePath((await scanOf(fixture({ 'README.md': '# r\n' }, 4))).scan), 'existing', 5)
  expectPath(decidePath((await scanOf(fixture({ 'package.json': '{"name": "x"}\n' }, 1))).scan), 'new', 4)
})

// ---------------------------------------------------------------- path.ts as pure functions

function scanFixture(overrides: Partial<ScanResult>): ScanResult {
  return {
    version: 1,
    root: '/r',
    at: '2026-11-05T00:00:00.000Z',
    ms: 0,
    git: { state: 'repo', toplevel: '/r', head: 'abc', commits: 1, remotes: [], tags: [], submodules: [], lfs: [] },
    files: { tracked: 0, code: 0, byExtension: {}, topDirs: [] },
    workspace: { loose: [] },
    stacks: [],
    sources: { from: 'head', manifests: [], ci: [], taskFiles: [], hookTools: [] },
    candidates: [],
    unreadable: [],
    checkers: { configs: [], pyprojectTools: [] },
    docs: { root: [], files: [], adr: [] },
    issues: { read: false, reason: 'x' },
    graph: { dir: '/r/docs/graph', rel: 'docs/graph', present: false, nodes: 0 },
    truncated: [],
    ...overrides,
  }
}

test('decidePath: the five rules in order, with the refusals for git that cannot be read', () => {
  assert.equal(decidePath(scanFixture({ graph: { dir: '/g', present: true, nodes: 3 }, git: { state: 'missing' } })).rule, 1)
  assert.deepEqual(decidePath(scanFixture({ git: { state: 'missing' } })), { ok: false, rule: 0, reason: '找不到 git：接管要用 git' })
  assert.equal(decidePath(scanFixture({ git: { state: 'unread' } })).ok, false)
  assert.equal(decidePath(scanFixture({ git: { state: 'none' }, workspace: { loose: ['a.txt'] } })).rule, 3)
  assert.equal(decidePath(scanFixture({ git: { state: 'none' } })).rule, 2)
  const repo = (commits: number, code: number): PathDecision => decidePath(scanFixture({
    git: { state: 'repo', toplevel: '/r', head: 'abc', commits, remotes: [], tags: [], submodules: [], lfs: [] },
    files: { tracked: code, code, byExtension: {}, topDirs: [] },
  }))
  assert.equal(repo(3, 0).rule, 4)
  assert.equal(repo(4, 0).rule, 5)
  assert.equal(repo(0, 1).rule, 5)
  const existing = decidePath(scanFixture({ files: { tracked: 1, code: 1, byExtension: {}, topDirs: [] } }))
  assert.equal(existing.ok && existing.reason, '已有项目：1 个代码文件、1 个提交')
})

test('hasProjectGraph: nodes/ with a .json file; an empty nodes/, a missing one, and a directory named x.json are no graph', () => {
  const root = join(temp, 'graphs')
  mkdirSync(join(root, 'a', 'nodes'), { recursive: true })
  mkdirSync(join(root, 'b', 'nodes', 'x.json'), { recursive: true })
  mkdirSync(join(root, 'c', 'nodes'), { recursive: true })
  writeFileSync(join(root, 'c', 'nodes', 'goal.json'), '{}')
  assert.equal(hasProjectGraph(join(root, 'a')), false)
  assert.equal(hasProjectGraph(join(root, 'b')), false)
  assert.equal(hasProjectGraph(join(root, 'c')), true)
  assert.equal(hasProjectGraph(join(root, 'missing')), false)
  assert.equal(isProjectGraph([]), false)
  assert.equal(isProjectGraph(['README.md', 'goal.json']), true)
  assert.equal(isProjectGraph(['goal.json.bak']), false)
})

// ---------------------------------------------------------------- scan #2: candidates with their file and line

test('scan #2: package.json scripts carry their line, the package manager, and the bodies they reach', () => {
  const { candidates } = packageJsonCandidates(NODE_PACKAGE, 'package.json', 'pnpm')
  const byName = new Map(candidates.map(candidate => [candidate.name, candidate]))
  assert.equal(byName.get('test')?.text, 'pnpm test')
  assert.equal(byName.get('lint')?.text, 'pnpm run lint')
  assert.equal(byName.get('test')?.source.line, 4)
  assert.equal(byName.get('lint')?.source.line, 5)
  assert.equal(byName.get('test')?.kind, 'test')
  assert.equal(byName.get('lint')?.kind, 'lint')
  assert.equal(byName.get('build')?.kind, 'build')
  assert.deepEqual(byName.get('test')?.expanded, ['npm run build', 'node --test', 'tsc -p .'])
  assert.equal(byName.get('deploy')?.danger, 'deploy')
  assert.equal(byName.get('test')?.danger, null)
  assert.equal(packageJsonCandidates('{"scripts": {"test": "x"}}', 'package.json', 'bun').candidates[0]?.text, 'bun run test')
  assert.deepEqual(packageJsonCandidates('{ not json', 'package.json', 'npm'), { candidates: [], unreadable: { file: 'package.json', reason: '读不懂：不是合法的 JSON' } })
  assert.equal(packageManagerOf('{"packageManager": "yarn@4.1.0"}', ['pnpm-lock.yaml']), 'yarn')
  assert.equal(packageManagerOf('{}', ['pnpm-lock.yaml']), 'pnpm')
  assert.equal(packageManagerOf(undefined, ['bun.lockb']), 'bun')
  assert.equal(packageManagerOf('{}', []), 'npm')
})

test('scan #2: CI YAML gives one-line values, quoted ones, list items under script:, and block scalars as multi-line scripts', () => {
  const gitlab = [
    'test:',
    '  script:',
    '    - npm ci',
    "    - 'npm run lint'",
    '    - "npm test" # the tests',
    '    - |',
    '      echo one',
    '      ./scripts/deploy.sh',
    'build:',
    '  script: make all',
  ].join('\n')
  const { candidates } = yamlCandidates(gitlab, '.gitlab-ci.yml', 'ci')
  assert.deepEqual(candidates.map(candidate => [candidate.text, candidate.source.line, candidate.source.endLine, candidate.multiline]), [
    ['npm ci', 3, undefined, false],
    ['npm run lint', 4, undefined, false],
    ['npm test', 5, undefined, false],
    ['echo one', 7, 8, true],
    ['make all', 10, undefined, false],
  ])
  // A multi-line script is judged over every line: the deploy script on its second line marks it.
  assert.equal(candidates[3]?.danger, 'deploy')
  assert.deepEqual(candidates.map(candidate => candidate.origin), ['ci', 'ci', 'ci', 'ci', 'ci'])
})

test('scan #2: task files, hook tools and pyproject tables', () => {
  const make = makefileCandidates('.PHONY: test\nVAR := x\nall: build\n\tgo build ./...\ntest lint:\n\tgo test ./...\n%.o: %.c\nrelease:\n\t./ship\n', 'Makefile').candidates
  assert.deepEqual(make.map(candidate => [candidate.text, candidate.source.line]), [['make all', 3], ['make test', 5], ['make lint', 5], ['make release', 8]])
  assert.equal(make.find(candidate => candidate.name === 'release')?.danger, 'release')
  assert.deepEqual(justfileCandidates('set shell := ["bash"]\nbuild target:\n  cargo build\n@test:\n  cargo test\n', 'justfile').candidates.map(candidate => candidate.text), ['just build', 'just test'])
  assert.deepEqual(taskfileCandidates('version: "3"\ntasks:\n  build:\n    cmds:\n      - go build\n  lint:\n    cmds: [x]\n', 'Taskfile.yml').candidates.map(candidate => candidate.text), ['task build', 'task lint'])
  assert.deepEqual(toxCandidates('[tox]\nenvlist = py312, lint\n[testenv:lint]\ncommands = ruff check\n', 'tox.ini').candidates.map(candidate => candidate.text), ['tox -e py312', 'tox -e lint', 'tox -e lint'])
  assert.deepEqual(noxCandidates('import nox\n\n@nox.session\ndef tests(session):\n    pass\n\n@nox.session(name="type-check")\ndef typing(session):\n    pass\n', 'noxfile.py').candidates.map(candidate => candidate.text), ['nox -s tests', 'nox -s type-check'])
  assert.deepEqual(preCommitCandidates('repos:\n  - repo: x\n    hooks:\n      - id: ruff\n      - id: "end-of-file-fixer"\n', '.pre-commit-config.yaml').candidates.map(candidate => [candidate.text, candidate.origin]), [['pre-commit run ruff --all-files', 'hook-tool'], ['pre-commit run end-of-file-fixer --all-files', 'hook-tool']])
  assert.deepEqual(huskyCandidates('#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\nnpx lint-staged\n', '.husky/pre-commit').candidates.map(candidate => [candidate.text, candidate.source.line]), [['npx lint-staged', 4]])
  const pyproject = pyprojectCandidates('[tool.poe.tasks]\nlint = "ruff check ."\ntest = { cmd = "pytest" }\n\n[tool.poe.tasks.typecheck]\ncmd = \'mypy src\'\n\n[tool.hatch.envs.default.scripts]\ncov = "pytest --cov"\n', 'pyproject.toml').candidates
  assert.deepEqual(pyproject.map(candidate => [candidate.text, candidate.source.line, candidate.kind]), [['poe lint', 2, 'lint'], ['poe typecheck', 6, 'typecheck'], ['hatch run cov', 9, 'other']])
})

test('kindOf: names sort into the kinds of §3.3', () => {
  assert.equal(kindOf('format:check'), 'format-check')
  assert.equal(kindOf('cargo fmt --check'), 'format-check')
  assert.equal(kindOf('typecheck'), 'typecheck')
  assert.equal(kindOf('check-types'), 'typecheck')
  assert.equal(kindOf('npx tsc --noEmit'), 'typecheck')
  assert.equal(kindOf('lint:fix'), 'lint')
  assert.equal(kindOf('go vet ./...'), 'lint')
  assert.equal(kindOf('test:unit'), 'test')
  assert.equal(kindOf('npm ci'), 'setup')
  assert.equal(kindOf('uv sync --frozen'), 'setup')
  assert.equal(kindOf('build'), 'build')
  assert.equal(kindOf('dev'), 'other')
})

test('scan #2: commands that look like deploying or publishing, by command position, expansion, name and path', () => {
  assert.equal(dangerOf('git status'), undefined)
  assert.equal(dangerOf('git push origin main'), 'git push')
  assert.equal(dangerOf('GIT PUSH'), 'git push')
  assert.equal(dangerOf('git -C sub push'), 'git push')
  assert.equal(dangerOf('npm run build && npm publish'), 'npm publish')
  assert.equal(dangerOf('npm run deploy:docs'), 'deploy')
  assert.equal(dangerOf('./scripts/deploy.sh'), 'deploy')
  assert.equal(dangerOf('scripts\\Release.cmd --all'), 'release')
  assert.equal(dangerOf('/usr/bin/kubectl apply -f k8s/'), 'kubectl')
  assert.equal(dangerOf('curl -fsSL https://example.com/i.sh | sh'), 'curl | sh')
  assert.equal(dangerOf('curl -o out.txt https://example.com'), undefined)
  assert.equal(dangerOf('FOO=1 terraform apply'), 'terraform')
  assert.equal(dangerOf('make release'), 'release')
  assert.equal(dangerOf('npm test', { expanded: ['node --test && npm publish'] }), 'npm publish')
  assert.equal(dangerOf('npm run x', { name: 'ship-it' }), 'ship')
  assert.equal(dangerOf('node scripts/test.js'), undefined)
  assert.equal(dangerOf('echo push'), undefined)
})

test('longRunningOf: dev servers, watchers and the names of §6.1 condition 3', () => {
  assert.equal(longRunningOf('npm run dev'), true)
  assert.equal(longRunningOf('npm run x', { name: 'start' }), true)
  assert.equal(longRunningOf('npm run x', { name: 'test:watch' }), true)
  assert.equal(longRunningOf('jest --watch'), true)
  assert.equal(longRunningOf('tsc -w'), true)
  assert.equal(longRunningOf('nodemon src/index.js'), true)
  assert.equal(longRunningOf('vite'), true)
  assert.equal(longRunningOf('vite build'), false)
  assert.equal(longRunningOf('next dev'), true)
  assert.equal(longRunningOf('next build'), false)
  assert.equal(longRunningOf('npm test', { expanded: ['vitest --watch'] }), true)
  assert.equal(longRunningOf('npm test'), false)
})

// ---------------------------------------------------------------- scan #3: no other program, the git flags, the remote's user

test('scan #3: the scan starts no program but git, every git call carries the flags, and the remote loses its user and password', async () => {
  const password = ['s3cr', 'etTok3n'].join('')
  const root = fixture({ 'package.json': NODE_PACKAGE, 'Makefile': 'all:\n\techo\n', 'src/a.js': 'x\n' }, 1)
  git(root, 'remote', 'add', 'origin', `https://alice:${password}@example.com/team/app.git`)
  const childProcess = createRequire(import.meta.url)('node:child_process') as Record<string, unknown>
  const names = ['execFile', 'spawn', 'exec', 'fork', 'execSync', 'execFileSync', 'spawnSync']
  const originals = new Map(names.map(name => [name, childProcess[name]]))
  const calls: { name: string, file: string, args: readonly string[] }[] = []
  for (const name of names) {
    const original = originals.get(name) as (...args: unknown[]) => unknown
    childProcess[name] = (...args: unknown[]) => {
      calls.push({ name, file: String(args[0]), args: Array.isArray(args[1]) ? args[1].map(String) : [] })
      return original(...args)
    }
  }
  syncBuiltinESMExports()
  let output: ScanOutput
  try {
    output = await scanOf(root)
  }
  finally {
    for (const [name, original] of originals) childProcess[name] = original
    syncBuiltinESMExports()
  }
  assert.ok(calls.length >= 5, `git calls: ${calls.length}`)
  for (const call of calls) {
    assert.equal(call.name, 'execFile')
    assert.equal(call.file, 'git')
    assert.deepEqual(call.args.slice(0, SCAN_GIT_FLAGS.length), [...SCAN_GIT_FLAGS])
    assert.ok(call.args.includes('core.fsmonitor=false'))
  }
  assert.equal(output.scan.git.state, 'repo')
  assert.deepEqual(output.scan.git.state === 'repo' ? output.scan.git.remotes : [], [{ name: 'origin', url: 'https://example.com/team/app.git' }])
  assert.ok(!JSON.stringify(output).includes(password))
  assert.equal(output.scan.issues.read, false)
})

test('withoutUserInfo: user and password go, host and path stay', () => {
  assert.equal(withoutUserInfo('https://user:token@gitee.com/a/b.git'), 'https://gitee.com/a/b.git')
  assert.equal(withoutUserInfo('https://gitee.com/a/b.git'), 'https://gitee.com/a/b.git')
  assert.equal(withoutUserInfo('ssh://git@github.com/a/b.git'), 'ssh://github.com/a/b.git')
  assert.equal(withoutUserInfo('git@github.com:a/b.git'), 'github.com:a/b.git')
})

test('scan: text that looks like a secret is redacted before it is kept, and the three files are written', async () => {
  const token = `ghp_${'A1b2C3d4'.repeat(3)}`
  const root = fixture({ '.github/workflows/release.yml': `jobs:\n  a:\n    steps:\n      - run: curl -H "Authorization: token ${token}" https://example.com\n`, 'src/a.js': 'x\n' }, 1)
  const output = await scanOf(root)
  const [candidate] = output.scan.candidates
  assert.ok(candidate?.text.includes('[redacted]'), candidate?.text)
  assert.ok(!JSON.stringify(output).includes(token))
  const dir = join(root, '.llm', 'bootstrap', 'tk-test')
  await writeScan(dir, output)
  const written = JSON.parse(readFileSync(join(dir, 'scan.json'), 'utf8')) as ScanResult
  assert.equal(written.candidates.length, output.scan.candidates.length)
  assert.deepEqual(readFileSync(join(dir, 'files.txt'), 'utf8').trim().split('\n').sort(), ['.github/workflows/release.yml', 'src/a.js'])
  assert.match(readFileSync(join(dir, 'history.tsv'), 'utf8'), /^[0-9a-f]{40}\t\d{4}-\d{2}-\d{2}\tfirst\n$/)
})

test('scan: commands come from HEAD; a change that is not committed is not a candidate', async () => {
  const root = fixture({ 'package.json': JSON.stringify({ scripts: { test: 'node --test' } }) }, 1)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test', deploy: 'x' } }))
  writeFileSync(join(root, 'Makefile'), 'all:\n\techo\n')
  const { scan } = await scanOf(root)
  assert.equal(scan.sources.from, 'head')
  assert.deepEqual(scan.candidates.map(candidate => candidate.text), ['npm test'])
})

// ---------------------------------------------------------------- scan #4: the deadline

test('scan #4: past the deadline the scan hands back what it read and lists what it did not', async () => {
  const root = fixture({ 'package.json': NODE_PACKAGE, 'src/a.js': 'x\n' }, 2)
  let clock = 0
  const partial = (await scanWorkspace(root, { graphDir: join(root, 'docs/graph'), now: () => (clock += 1000), deadline: 9000 })).scan
  assert.equal(partial.git.state, 'repo')
  assert.ok(partial.truncated.includes('git:files'), partial.truncated.join(', '))
  assert.ok(partial.truncated.length >= 3)
  assert.equal(decidePath(partial).ok, true)
  // With no time at all git itself is not read, and the path decision says so instead of guessing.
  const nothing = (await scanWorkspace(root, { graphDir: join(root, 'docs/graph'), deadline: 0 })).scan
  assert.equal(nothing.git.state, 'unread')
  assert.ok(nothing.truncated.includes('git'))
  assert.deepEqual(decidePath(nothing), { ok: false, rule: 0, reason: '读 git 的状态时扫描超时了：再发一次 /wish' })
})

// ---------------------------------------------------------------- touchPaths (§5.4)

test('touchPaths: repository paths, outside paths, the norm-only marker, 无, and words', () => {
  assert.deepEqual(touchPaths('vendor/、generated/，dist/*.js; ~/.dsh、C:\\Users\\x、../sibling、reference/ 只写进规范、build/（只写进规范） 别人的代码'), {
    inside: ['vendor/', 'generated/', 'dist/*.js'],
    outside: ['~/.dsh', 'C:\\Users\\x', '../sibling'],
    normOnly: ['reference/', 'build/'],
    unrecognized: ['别人的代码'],
  })
  assert.deepEqual(touchPaths('无'), { inside: [], outside: [], normOnly: [], unrecognized: [] })
  assert.deepEqual(touchPaths('third_party/（外部库）'), { inside: ['third_party/'], outside: [], normOnly: [], unrecognized: [] })
  const many = touchPaths(Array.from({ length: 42 }, (_, index) => `d${index}/`).join('、'))
  assert.equal(many.inside.length, 40)
  assert.deepEqual(many.unrecognized, ['d40/', 'd41/'])
})

// ---------------------------------------------------------------- scan #5, the format part: the floor draft

/** The judgement forms of M7 §3.8.5 as written there: trailing backtick segments, each `files <paths>`, `deletes`, `commands <words>, …` or `outside`; paths repository-relative, no `..`, no wildcard, no backslash or drive. */
function floorForms(line: string): readonly string[] | undefined {
  const segments: string[] = []
  let rest = line.trimEnd()
  while (rest.endsWith('`')) {
    const opening = rest.lastIndexOf('`', rest.length - 2)
    if (opening < 0) break
    segments.unshift(rest.slice(opening + 1, -1))
    rest = rest.slice(0, opening).trimEnd()
  }
  if (segments.length === 0) return undefined
  const pathOk = (path: string): boolean => path.length > 0 && !/[*?[\\]/.test(path) && !/^[A-Za-z]:/.test(path)
    && (path.endsWith('/') ? path.slice(0, -1) : path).split('/').every(part => part.length > 0 && part !== '.' && part !== '..')
  const ok = segments.every(segment => segment === 'deletes' || segment === 'outside'
    || (segment.startsWith('files ') && segment.slice(6).split(',').map(path => path.trim()).every(pathOk))
    || (segment.startsWith('commands ') && segment.slice(9).split(',').every(words => words.trim().length > 0)))
  return ok ? segments : undefined
}

test('floor: every line of the draft carries judgement forms M7 can read; only classes with paths appear, plus the two general ones', async () => {
  const root = fixture({
    'package.json': NODE_PACKAGE,
    'package-lock.json': '{}\n',
    'src/auth/login.ts': 'x\n',
    'src/permissions.ts': 'x\n',
    'tests/auth.spec.ts': 'x\n',
    'docs/security.md': '# s\n',
    'db/migrations/001.sql': 'x\n',
    'api/openapi.yaml': 'x\n',
    'Dockerfile': 'FROM x\n',
    '.github/workflows/ci.yml': 'jobs: {}\n',
    'vendor/auth/x.js': 'x\n',
  }, 1)
  const output = await scanOf(root)
  const draft = floorDraft(output.scan, output.files, { touch: ['vendor/', 'generated/**', 'a/*.js'] })
  assert.deepEqual(draft.acceptance, [
    '改到拦截与权限：src/auth/、src/permissions.ts `files src/auth/, src/permissions.ts`',
    '改到数据格式与迁移：api/openapi.yaml、db/migrations/ `files api/openapi.yaml, db/migrations/`',
    '改到发布与部署：.github/workflows/ci.yml、Dockerfile `files .github/workflows/ci.yml, Dockerfile`',
    '改到依赖与构建：package-lock.json、package.json `files package-lock.json, package.json`',
    '改到不许碰的地方：generated/、vendor/ `files generated/, vendor/`',
    ...FLOOR_GENERAL,
  ])
  for (const line of draft.acceptance) assert.notEqual(floorForms(line), undefined, line)
  // floor.md lists the same lines, one `- ` item each, so the count read back equals the count written.
  const markdown = floorMarkdown(draft)
  const listed = markdown.split('\n').slice(markdown.split('\n').indexOf('acceptance:') + 1).filter(line => line.startsWith('- ')).map(line => line.slice(2))
  assert.deepEqual(listed, draft.acceptance)
  // A project with nothing found has only the two general classes.
  const bare = await scanOf(fixture({ 'README.md': '# r\n' }, 1))
  assert.deepEqual(floorDraft(bare.scan, bare.files).acceptance, FLOOR_GENERAL)
})

test('floor: more than 40 paths merge into their shared parent directories; the human part shows six', () => {
  const paths = Array.from({ length: 45 }, (_, index) => `src/auth/p${index % 3}/f${index}.ts`)
  const merged = mergeToLimit(paths)
  assert.ok(merged.length <= 40, String(merged.length))
  assert.ok(merged.includes('src/auth/p0/'))
  assert.ok(merged.every(path => !(path !== 'src/auth/p0/' && path.startsWith('src/auth/p0/'))))
  // Every path is still covered: by itself or by a directory that took its place.
  for (const path of paths) assert.ok(merged.some(entry => entry === path || (entry.endsWith('/') && path.startsWith(entry))), path)
  assert.deepEqual(mergeToLimit(paths, 3), ['src/auth/p0/', 'src/auth/p1/', 'src/auth/p2/'])
  const draft = floorDraft(scanFixture({}), Array.from({ length: 9 }, (_, index) => `guard${index}/x.ts`))
  const [line = ''] = draft.acceptance
  assert.match(line, /^改到拦截与权限：guard0\/、guard1\/、guard2\/、guard3\/、guard4\/、guard5\/ 等 3 处 `files /)
  assert.notEqual(floorForms(line), undefined)
})

test('floor: the template and the general classes hold nothing of this repository', () => {
  for (const text of [FLOOR_BODY, ...FLOOR_GENERAL]) {
    for (const word of ['src/', 'hourness', 'glm', 'docs/graph', 'reference/', '.dsh', 'npm ']) assert.ok(!text.includes(word), `${word} in ${text}`)
  }
})
