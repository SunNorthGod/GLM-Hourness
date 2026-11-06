/**
 * The check lines of an environment tool node (src/env/check-entry.ts, M4
 * design §6.1.1) and their output (src/env/parsers.ts, §6.4): every rule of
 * checkLineRefusal, splitArgs that interprets nothing, fillCheckArgv's
 * expansion and limits, the example line of §6.6, the three parsers and
 * formatCheckOutput, the branch's reading of check lines, and the static
 * check that src/env/ starts no process and reads no loop board entry.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { envBranch } from '../src/env/branch.ts'
import { CHECK_LINE_EXAMPLE, checkLineRefusal, COMMAND_LINE_LIMIT, fillCheckArgv, parseCheckLine, SHELL_PROGRAMS, splitArgs } from '../src/env/check-entry.ts'
import { formatCheckOutput, parseCheckOutput } from '../src/env/parsers.ts'
import type { LoadedGraph } from '../src/graph/parse.ts'
import type { GraphNode } from '../src/graph/schema.ts'

const refusedFor = (line: string): string => {
  const reason = checkLineRefusal(line)
  assert.ok(reason !== undefined, `expected a refusal: ${line}`)
  return reason
}

test('a readable line: name, format, estimate, argv with {files}, when as paths', () => {
  assert.deepEqual(parseCheckLine('`check eslint eslint-json 3s $ node node_modules/eslint/bin/eslint.js --format json --pass-on-unpruned-suppressions {files}` when *.ts, *.mts, *.js, *.mjs, *.tsx'), {
    name: 'eslint',
    format: 'eslint-json',
    estimateSeconds: 3,
    argv: ['node', 'node_modules/eslint/bin/eslint.js', '--format', 'json', '--pass-on-unpruned-suppressions', '{files}'],
    paths: ['*.ts', '*.mts', '*.js', '*.mjs', '*.tsx'],
  })
  // Without when: a definition only, no paths; without an estimate: none.
  assert.deepEqual(parseCheckLine('`check lint lines $ node lint.mjs {files}`'), { name: 'lint', format: 'lines', argv: ['node', 'lint.mjs', '{files}'] })
  assert.deepEqual(parseCheckLine('`check tsc tsc 2s $ node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json --pretty false`'), {
    name: 'tsc', format: 'tsc', estimateSeconds: 2, argv: ['node', 'node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.json', '--pretty', 'false'],
  })
})

test('the example line of design §6.6 passes the reader as the main agent reads it', () => {
  assert.equal(checkLineRefusal(CHECK_LINE_EXAMPLE), undefined)
  const entry = parseCheckLine(CHECK_LINE_EXAMPLE)
  assert.deepEqual(entry, { name: 'ruff', format: 'lines', estimateSeconds: 3, argv: ['ruff', 'check', '--output-format', 'concise', '{files}'], paths: ['*.py'] })
  const split = splitArgs('ruff check --output-format concise {files}')
  assert.ok(split.ok)
  assert.deepEqual(split.value, entry?.argv)
})

test('the estimate: 4s reads; 4, 4 s, 0s and 1000s do not', () => {
  assert.equal(parseCheckLine('`check a lines 4s $ node a.mjs`')?.estimateSeconds, 4)
  assert.equal(parseCheckLine('`check a lines 999s $ node a.mjs`')?.estimateSeconds, 999)
  for (const estimate of ['4', '4 s', '0s', '1000s', '04s', '4.5s']) refusedFor(`\`check a lines ${estimate} $ node a.mjs\``)
})

test('every refusal rule has its case', () => {
  const cases: ReadonlyArray<readonly [string, RegExp]> = [
    ['`check a lines $ pwsh -File x.ps1 {files}`', /pwsh/],
    ['`check a lines $ bash -c {files}`', /bash/],
    ['`check a lines $ node a.mjs --files={files}`', /单独/],
    ['`check a lines $ node a.mjs {files} {files}`', /至多一处/],
    ['`check a lines $ `', /空/],
    ['`check a lines $ x.cmd {files}`', /\.cmd/],
    ['`check a lines $ tools/x.BAT`', /\.bat/],
    ['`check A lines $ node a.mjs`', /名字/],
    ['`check a-very-long-name-of-25-chars lines $ node a.mjs`', /名字/],
    ['`check a json $ node a.mjs`', /格式/],
    ['`check a lines $ node a.mjs` when ', /条件/],
    ['`check a lines $ node a.mjs` when *.ts, ', /条件/],
    ['`check a lines node a.mjs`', /\$/],
    ['`check a lines $ node "a b.mjs`', /双引号/],
    ['`check a lines $ node a"b.mjs`', /双引号/],
    ['`check a lines $ {files}`', /第一项/],
    ['`check a lines $ node a.mjs', /反引号/],
    [`\`check a lines $ ${Array.from({ length: 65 }, () => 'x').join(' ')}\``, /64/],
    [`\`check a lines $ node ${'x'.repeat(2001)}\``, /2000/],
  ]
  for (const [line, reason] of cases) assert.match(refusedFor(line), reason, line)
  // 21 when conditions are more than the loop board's paths take.
  assert.match(refusedFor(`\`check a lines $ node a.mjs\` when ${Array.from({ length: 21 }, (_, index) => `*.e${index}`).join(', ')}`), /20/)
  // Every shell of the list refuses {files}; a non-shell program with the same letters does not.
  for (const shell of SHELL_PROGRAMS) refusedFor(`\`check a lines $ ${shell}.exe {files}\``)
  assert.equal(checkLineRefusal('`check a lines $ shellcheck -f gcc {files}`'), undefined)
  assert.equal(checkLineRefusal('`check a lines $ pwsh -File check.ps1`'), undefined, 'a shell without {files} is a command like any other')
})

test('splitArgs interprets nothing but spaces and double quotes', () => {
  const split = splitArgs('node  "a b.mjs" $(x) %PATH% `id` ; | > {files}')
  assert.ok(split.ok)
  assert.deepEqual(split.value, ['node', 'a b.mjs', '$(x)', '%PATH%', '`id`', ';', '|', '>', '{files}'])
  const quotedLine = parseCheckLine('`check a lines $ node "my lint.mjs" {files}` when src/')
  assert.deepEqual(quotedLine?.argv, ['node', 'my lint.mjs', '{files}'])
  assert.deepEqual(quotedLine?.paths, ['src/'])
  assert.equal(splitArgs('node "a"b').ok, false)
})

test('fillCheckArgv: one item per file, ./ before a dash, newlines skipped, the line limit drops and counts', () => {
  assert.deepEqual(fillCheckArgv(['node', 'lint.mjs', '{files}', '--x'], ['a.ts', '-b.ts', 'c\nd.ts', 'e\0.ts', 'b$(echo x).ts']), {
    argv: ['node', 'lint.mjs', 'a.ts', './-b.ts', 'b$(echo x).ts', '--x'],
    used: 3,
    dropped: 0,
  })
  const plain = ['node', 'lint.mjs']
  assert.deepEqual(fillCheckArgv(plain, ['a.ts']), { argv: plain, used: 0, dropped: 0 })
  // 300 names of 100 characters: about 30,300 characters, so some do not fit under 28,000.
  const files = Array.from({ length: 300 }, (_, index) => `${String(index).padStart(3, '0')}${'x'.repeat(97)}`)
  const filled = fillCheckArgv(['node', 'lint.mjs', '{files}'], files)
  assert.equal(filled.used + filled.dropped, 300)
  assert.ok(filled.dropped > 0)
  const line = filled.argv.map(item => item.length + 1).reduce((sum, length) => sum + length, 0)
  assert.ok(line <= COMMAND_LINE_LIMIT, String(line))
  assert.deepEqual(filled.argv.slice(2), files.slice(0, filled.used), 'files keep their order; the dropped ones are the last')
})

test('the three parsers read their formats', () => {
  const eslint = JSON.stringify([
    { filePath: 'C:/r/src/a.ts', messages: [{ line: 41, column: 7, ruleId: 'no-unused-vars', message: '\'x\' is assigned a value but never used.', severity: 2 }] },
    { filePath: 'C:/r/src/b.ts', messages: [] },
  ])
  assert.deepEqual(parseCheckOutput('eslint-json', { stdout: eslint, stderr: '', exitCode: 1 }), [
    { file: 'C:/r/src/a.ts', line: 41, column: 7, rule: 'no-unused-vars', message: '\'x\' is assigned a value but never used.' },
  ])
  assert.deepEqual(parseCheckOutput('tsc', { stdout: 'src/a.ts(3,5): error TS2322: Type \'string\' is not assignable to type \'number\'.\n  continuation\n', stderr: '', exitCode: 2 }), [
    { file: 'src/a.ts', line: 3, column: 5, rule: 'TS2322', message: 'Type \'string\' is not assignable to type \'number\'.' },
  ])
  assert.deepEqual(parseCheckOutput('lines', { stdout: 'a.py:1:1: F401 `os` imported but unused\n', stderr: 'C:\\r\\b.c:12: warning: x\nnot a finding\n', exitCode: 1 }), [
    { file: 'a.py', line: 1, column: 1, message: 'F401 `os` imported but unused' },
    { file: 'C:\\r\\b.c', line: 12, message: 'warning: x' },
  ])
})

test('formatCheckOutput: counts, at most 20 lines of 200 characters, undefined only for unreadable output that failed', () => {
  const many = Array.from({ length: 25 }, (_, index) => `a.txt:${index + 1}:1: todo found ${'y'.repeat(250)}`).join('\n')
  const formatted = formatCheckOutput('lines', { stdout: many, stderr: '', exitCode: 1 })
  assert.equal(formatted?.findings, 25)
  assert.equal(formatted?.lines.length, 20)
  assert.ok(formatted?.lines.every(line => line.length <= 200))
  assert.ok(formatted?.lines[0]?.startsWith('a.txt:1:1 todo found'))
  assert.deepEqual(formatCheckOutput('lines', { stdout: '', stderr: '', exitCode: 0 }), { findings: 0, lines: [] })
  assert.equal(formatCheckOutput('eslint-json', { stdout: 'Oops! Something went wrong!', stderr: '', exitCode: 2 }), undefined)
  assert.equal(formatCheckOutput('tsc', { stdout: 'error TS5058: The specified path does not exist', stderr: '', exitCode: 1 }), undefined)
  assert.deepEqual(formatCheckOutput('tsc', { stdout: 'src/a.ts(1,1): error TS1005: \';\' expected.', stderr: '', exitCode: 2 })?.lines, ['src/a.ts:1:1 TS1005 \';\' expected.'])
})

function graphOf(nodes: readonly Partial<GraphNode>[]): LoadedGraph {
  return { nodes: new Map(nodes.map(node => [node.id ?? '', { type: 'tool', status: 'approved', parent: 'env', body: '', history: [], ...node } as GraphNode])), revisions: new Map() } as unknown as LoadedGraph
}

test('the branch reads check lines with and without when; an unreadable line and a repeated name are issues with their number', () => {
  const branch = envBranch(graphOf([{
    id: 'tool-1',
    title: 'Lint',
    acceptance: [
      '`config eslint.config.js`',
      '`check lint lines $ node lint.mjs {files}` when *.txt',
      '`check bad lines 4 s $ node x.mjs`',
      '`check lint lines $ node other.mjs`',
      '`check def lines 2s $ node def.mjs {files}`',
    ],
  }]))
  const tool = branch.tools[0]
  assert.deepEqual(tool?.configs, ['eslint.config.js'])
  assert.deepEqual(tool?.checks.map(check => [check.name, check.paths ?? null, check.estimateSeconds ?? null]), [['lint', ['*.txt'], null], ['def', null, 2]])
  assert.equal(branch.issues.length, 2)
  assert.match(branch.issues[0] ?? '', /^tool-1 第 3 条检查行读不懂：/)
  assert.equal(branch.issues[1], 'tool-1 第 4 条检查行读不懂：名字 lint 在这个节点里重复了')
})

test('src/env/ starts no process and reads no loop board entry (design §6.3, F17)', () => {
  const dir = join(import.meta.dirname, '..', 'src', 'env')
  for (const file of readdirSync(dir).filter(name => name.endsWith('.ts'))) {
    const text = readFileSync(join(dir, file), 'utf8')
    assert.doesNotMatch(text, /node:child_process/, file)
    assert.doesNotMatch(text, /docs\/loops|\.llm\/loops/, file)
  }
})
