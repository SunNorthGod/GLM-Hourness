/**
 * The three code rules of m4-gate G3 over the judgment context (design
 * §4.1, §4.3–§4.5, §3.7's incident table): suppression-reason denies a
 * write that adds a suppression comment without a reason and a node id on
 * the same line; checker-config denies a write to a checker configuration
 * or baseline; scratch-only denies a created script outside .llm/scratch/
 * in a directory that holds no tracked file of its kind. A fact the context
 * could not learn never denies (§4.1) — each rule shows the unknown passing.
 * The facts that read a checkout (tracked files, the graph) use a real
 * temporary git repository.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { checkerConfigOnly } from '../src/guard/checker-config.ts'
import { prepareContext, type ContextIo, type RuleContext } from '../src/guard/context.ts'
import { scratchOnly } from '../src/guard/scratch.ts'
import { suppressionOnly } from '../src/guard/suppression.ts'
import { NATIVE_FACE, type GuardRule, type RuleVerdict, type ToolCall } from '../src/guard/rules.ts'

const EMPTY: RuleContext = {}

const detect = (rule: GuardRule, call: ToolCall): RuleVerdict => rule.detect(call, NATIVE_FACE)

const write = (path: string, over: Record<string, unknown> = {}): ToolCall => ({
  name: 'write',
  arguments: { file_path: path, content: 'x', ...over },
})

// A real checkout for the facts that read one.
function tempRepo(files: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'guard-rules-'))
  const run = (args: string[]): void => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' })
  run(['init', '-q'])
  run(['config', 'user.email', 'probe@example.com'])
  run(['config', 'user.name', 'probe'])
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), 'export {}\n')
  }
  if (files.length > 0) {
    run(['add', '.'])
    run(['commit', '-q', '-m', 'seed'])
  }
  return root
}

// ------------------------------------------------------------ suppression-reason

test('suppression-reason: a new bare eslint-disable is denied, with the marker named in the fact', () => {
  const rule = suppressionOnly({ oldContent: 'const a = 1\n' })
  const verdict = detect(rule, write('C:\\ws\\a.ts', { content: 'const a = 1\n// eslint-disable-next-line require-await\nconst b = 2\n' }))
  assert.equal(verdict.kind, 'deny')
  assert.equal((verdict as { rule: string }).rule, 'suppression-reason')
  assert.ok((verdict as { correction: { fact: string } }).correction.fact.includes('`eslint-disable-next-line`'), 'the fact names the marker')
  // The four parts, verbatim (design §4.3).
  assert.equal((verdict as { correction: { violation: string } }).correction.violation, 'New suppressions need a reason and a node id on the same line.')
  assert.equal((verdict as { correction: { rightPath: string } }).correction.rightPath, 'Fix the finding instead; if the suppression is right, add `-- <why> [<node id>]` (ESLint) or a reason and `[<node id>]` after the marker.')
  assert.equal((verdict as { correction: { exception: string } }).correction.exception, 'If no node fits, propose one with graph_propose first.')
})

test('suppression-reason: reason and existing node id pass; a node the graph does not list denies; unreadable graph passes', () => {
  const good = '// eslint-disable-next-line require-await -- the waterfall awaits every listener [m4-checks]\n'
  const known: RuleContext = { oldContent: '', nodeIds: new Set(['m4-checks']) }
  assert.equal(detect(suppressionOnly(known), write('C:\\ws\\a.ts', { content: good })).kind, 'allow')
  assert.equal(detect(suppressionOnly({ oldContent: '', nodeIds: new Set(['other-node']) }), write('C:\\ws\\a.ts', { content: good })).kind, 'deny', 'a node id the graph does not list denies')
  assert.equal(detect(suppressionOnly({ oldContent: '', nodeIds: undefined }), write('C:\\ws\\a.ts', { content: '// eslint-disable-next-line x -- short [whatever]\n' })).kind, 'allow', 'the graph unreadable, the id is not checked')
  assert.equal(detect(suppressionOnly({ oldContent: '', nodeIds: new Set(['m4-checks']) }), write('C:\\ws\\a.ts', { content: '// eslint-disable-next-line x -- 一句足够长的中文理由不用英文词 [m4-checks]\n' })).kind, 'allow', 'six han characters are a reason')
})

test('suppression-reason: the marker count is per marker against the old text; edit compares its two strings', () => {
  const rule = suppressionOnly({ oldContent: '// eslint-disable-next-line a -- keep the old one, it has a reason [m4-checks]\n' })
  // One more occurrence than before: denied even though the old text carried one.
  assert.equal(detect(rule, write('C:\\ws\\a.ts', { content: '// eslint-disable-next-line a -- keep [m4-checks]\n// eslint-disable-next-line a\n' })).kind, 'deny')
  // Same count, the line rewritten well-formed: allowed.
  assert.equal(detect(rule, write('C:\\ws\\a.ts', { content: '// eslint-disable-next-line a -- keep the old one, it has a reason [m4-checks]\n' })).kind, 'allow')
  const edit = suppressionOnly({ oldContent: '' })
  assert.equal(detect(edit, { name: 'edit', arguments: { file_path: 'C:\\ws\\a.ts', old_string: 'a', new_string: 'a\n// @ts-ignore\nb' } }).kind, 'deny')
  assert.equal(detect(edit, { name: 'edit', arguments: { file_path: 'C:\\ws\\a.ts', old_string: '// @ts-ignore\n', new_string: '// @ts-ignore -- now explained [m4-checks]\n' } }).kind, 'allow', 'a rewrite that does not add markers passes')
})

test('suppression-reason: an unknown old content never denies (design §4.1)', () => {
  assert.equal(detect(suppressionOnly(EMPTY), write('C:\\ws\\a.ts', { content: '// eslint-disable-next-line a\n' })).kind, 'allow')
  // Non-file tools and missing arguments pass as well.
  assert.equal(detect(suppressionOnly({ oldContent: '' }), { name: 'pwsh', arguments: { command: 'Set-Content a.ts' } }).kind, 'allow')
})

// --------------------------------------------------------------- checker-config

test('checker-config: the built-in names are denied, neighbors pass; the correction carries the ref (design §4.4, §5.2)', () => {
  const rule = checkerConfigOnly(EMPTY, 'r-ab12cd34')
  for (const path of ['C:\\ws\\tsconfig.json', 'C:\\ws\\tsconfig.build.json', 'C:\\ws\\eslint.config.mjs', 'C:\\ws\\.eslintrc.cjs', 'C:\\ws\\knip-baseline.json', 'C:\\ws\\.jscpd.json', 'C:\\ws\\mypy.ini']) {
    const verdict = detect(rule, write(path))
    assert.equal(verdict.kind, 'deny', path)
    const correction = (verdict as { correction: { fact: string, rightPath: string, exception: string } }).correction
    assert.ok(correction.fact.startsWith('You tried to change the checker configuration'), path)
    assert.ok(correction.rightPath.includes('request_exception with ref "r-ab12cd34"'), 'the correction names this call\'s ref')
    assert.equal(correction.exception, 'Shrinking a baseline with the project\'s update script (for example `npm run lint:update`) is not a configuration edit.')
  }
  for (const path of ['C:\\ws\\src\\tsconfig.view.tsx', 'C:\\ws\\notes\\tsconfig.txt', 'C:\\ws\\package.json', 'C:\\ws\\readme.md']) {
    assert.equal(detect(rule, write(path)).kind, 'allow', path)
  }
})

test('checker-config: the env tool nodes\' config lines count, repository-relative, only when the graph was readable', () => {
  const root = tempRepo([])
  try {
    const withGraph = checkerConfigOnly({ envConfigs: ['config/style.toml', 'tools/style/lint.yaml'] }, 'r-1')
    assert.equal(detect(withGraph, write(join(root, 'config', 'style.toml'))).kind, 'deny')
    assert.equal(detect(withGraph, write(join(root, 'tools', 'style', 'lint.yaml'))).kind, 'deny')
    assert.equal(detect(withGraph, write('C:\\other\\place\\style.toml')).kind, 'allow', 'outside the checkout the relative path does not name the project\'s config')
    assert.equal(detect(checkerConfigOnly(EMPTY, 'r-1'), write(join(root, 'config', 'style.toml'))).kind, 'allow', 'the graph unreadable: built-ins only')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ----------------------------------------------------------------- scratch-only

test('scratch-only: a new script outside the scratch area is denied; under .llm/scratch/ or a non-script passes', () => {
  // The deny legs run in a real checkout: the rule denies only a known empty
  // tracked list (design §4.1 keeps an unknown one out of the denial).
  const root = tempRepo([])
  try {
    const rule = scratchOnly([root], { target: { exists: false }, tracked: [] }, 'r-9')
    const verdict = detect(rule, write(join(root, 'fix.py')))
    assert.equal(verdict.kind, 'deny')
    const correction = (verdict as { correction: { fact: string, exception: string } }).correction
    assert.equal(correction.fact, `You created the script \`${join(root, 'fix.py')}\` outside the scratch area.`)
    assert.ok(correction.exception.includes('request_exception with ref "r-9"'))
    assert.equal(detect(rule, write(join(root, '.llm', 'scratch', 'fix.py'))).kind, 'allow')
    assert.equal(detect(rule, write(join(root, 'notes.txt'))).kind, 'allow', 'not a script extension')
    assert.equal(detect(rule, write(join(root, 'sub', 'deep', 'run.sh'))).kind, 'deny')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('scratch-only: an unknown tracked list never denies (design §4.1)', () => {
  const rule = scratchOnly(['C:\\ws'], { target: { exists: false }, tracked: undefined }, 'r-9')
  assert.equal(detect(rule, write('C:\\ws\\fix.py')).kind, 'allow', 'the tracked list unreadable')
})

test('scratch-only: a directory that already holds tracked files of the kind passes (a real checkout)', () => {
  const root = tempRepo(['src/helpers/one.ts', 'src/helpers/two.ts'])
  try {
    const tracked = ['src/helpers/one.ts', 'src/helpers/two.ts', 'docs/readme.md']
    const rule = scratchOnly([root], { target: { exists: false }, tracked }, 'r-9')
    assert.equal(detect(rule, write(join(root, 'src', 'helpers', 'three.ts'))).kind, 'allow', 'a module among its own kind')
    assert.equal(detect(rule, write(join(root, 'scripts', 'lone.ts'))).kind, 'deny', 'scripts/ holds no tracked .ts in this fixture')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ------------------------------------------------------------------- context

test('prepareContext: the unknown facts of a call without a target are all absent; ENOENT reads as empty old content', async () => {
  assert.deepEqual(await prepareContext(undefined, 'C:\\ws'), {})
  const io: ContextIo = {
    stat: () => Promise.reject(Object.assign(new Error('gone'), { code: 'ENOENT' })),
    readFile: () => Promise.resolve('should not be read'),
    trackedFiles: () => Promise.reject(new Error('no git')),
    graph: () => Promise.resolve(undefined),
  }
  const context = await prepareContext('C:\\ws\\gone.ts', 'C:\\ws', io)
  assert.deepEqual(context.target, { exists: false })
  assert.equal(context.oldContent, '')
  assert.equal(context.tracked, undefined)
  assert.equal(context.envConfigs, undefined)
  assert.equal(context.nodeIds, undefined)
})

test('prepareContext: the facts of an existing target are known, up to the 1 MiB content cap', async () => {
  const root = tempRepo([])
  try {
    const big = 'x'.repeat(1024 * 1024 + 1)
    const io: ContextIo = {
      stat: () => Promise.resolve({ size: big.length }),
      readFile: () => Promise.resolve(big),
      trackedFiles: () => Promise.resolve(['src/a.ts']),
      graph: () => Promise.resolve({ revision: 'r1', configs: ['config/x.toml'], nodeIds: new Set(['n1']) }),
    }
    const context = await prepareContext(join(root, 'big.ts'), root, io)
    assert.deepEqual(context.target, { exists: true, size: big.length })
    assert.equal(context.oldContent, undefined, 'above 1 MiB the content stays unknown')
    assert.deepEqual(context.tracked, ['src/a.ts'])
    assert.deepEqual(context.envConfigs, ['config/x.toml'])
    assert.deepEqual([...(context.nodeIds ?? [])], ['n1'])
    const small = await prepareContext(join(root, 'small.ts'), root, { ...io, stat: () => Promise.resolve({ size: 3 }) })
    assert.equal(small.oldContent, big, 'within the cap the content is the fact')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
