/**
 * The metrics row's code rule (src/metrics/rules.ts; metrics design §3.4,
 * §15.32): `isPruneCall` recognizes the metrics command line's `prune` across
 * the shell spellings the design lists and stays quiet on the commands it
 * lists as passing; `metricsFilesOnly` denies a file tool or a shell command
 * that writes, deletes or moves into the journal's files, denies the prune,
 * and lets every read and every other command through.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { isGateListener } from '../src/guard/gate.ts'
import { installMetricsFileGuard, isPruneCall, metricsFilesOnly, METRICS_DECLARATION, METRICS_FILES_ONLY } from '../src/metrics/rules.ts'
import { NATIVE_FACE, type RuleVerdict, type ToolCall } from '../src/guard/rules.ts'

const ROOT = 'C:/work/app'
const RULE = metricsFilesOnly(ROOT, join(ROOT, 'ws'))

const fileWrite = (path: string): ToolCall => ({ name: 'write', arguments: { file_path: path } })
const shell = (command: string): ToolCall => ({ name: 'pwsh', arguments: { command } })
const read = (path: string): ToolCall => ({ name: 'read', arguments: { file_path: path } })
const verdictOf = (call: ToolCall): RuleVerdict => RULE.detect(call, NATIVE_FACE)

test('isPruneCall recognizes the prune spellings the design lists (§15.32)', () => {
  const blocked = [
    'npm run metrics -- prune',
    'node scripts/metrics/cli.ts prune',
    'npx tsx scripts/metrics/cli.ts prune',
    'npm run build && npm run metrics -- prune --before 2026-01-01',
    '& npm run metrics -- prune',
    'cmd /c npm run metrics -- prune',
    'env CI=1 npm run metrics -- prune',
    'git status & npm run metrics -- prune',
    'npm.EXE run metrics -- prune',
    'call npm run metrics -- prune',
    'npm --silent run metrics -- prune',
  ]
  for (const command of blocked) assert.equal(isPruneCall(command), true, command)
})

test('isPruneCall stays quiet on the spellings the design lists as passing (§15.32)', () => {
  const allowed = [
    'git commit -m "doc: npm run metrics -- prune 只给人用"',
    'npm run metrics -- summary',
    'npm run metrics -- summary; echo prune',
    'npm run metrics -- verify',
    'pnpm run metrics -- prune',
    'npm run build',
    'echo metrics prune',
    'pwsh -c "npm run metrics -- prune"',
  ]
  for (const command of allowed) assert.equal(isPruneCall(command), false, command)
})

test('a file tool writing into the journal, the manifest or the key is denied; a read passes', () => {
  for (const path of [
    join(ROOT, '.llm', 'metrics', 'events-2026-11-04.jsonl'),
    join(ROOT, '.llm', 'metrics', 'view.json'),
    join(ROOT, '.llm', 'metrics-manifest.jsonl'),
    join(ROOT, '.llm', 'metrics-key'),
  ]) {
    const verdict = verdictOf(fileWrite(path))
    assert.equal(verdict.kind, 'deny', path)
    assert.equal(verdict.kind === 'deny' && verdict.rule, METRICS_FILES_ONLY, path)
    assert.match(verdict.kind === 'deny' ? verdict.correction.violation : '', /only the harness writes there/)
  }
  assert.equal(verdictOf(read(join(ROOT, '.llm', 'metrics', 'events-2026-11-04.jsonl'))).kind, 'allow', 'reads pass (§15.42)')
  assert.equal(verdictOf(fileWrite(join(ROOT, 'docs', 'notes.md'))).kind, 'allow', 'a write outside the journal passes')
})

test('a shell command that mentions the journal with a destructive verb is denied; the prune is denied by its own reading', () => {
  for (const command of [
    'rm -rf .llm/metrics',
    'Remove-Item .llm/metrics-manifest.jsonl',
    'mv .llm/metrics .llm/metrics-old',
    'npm run metrics -- prune',
    'git status & npm run metrics -- prune',
  ]) {
    const verdict = verdictOf(shell(command))
    assert.equal(verdict.kind, 'deny', command)
  }
  const prune = verdictOf(shell('npm run metrics -- prune'))
  assert.match(prune.kind === 'deny' ? prune.correction.violation : '', /the human's own command/)
})

test('a shell command that only reads or only mentions the journal passes', () => {
  for (const command of [
    'npm run metrics -- summary',
    'Get-Content .llm/metrics/events-2026-11-04.jsonl',
    'echo the journal lives in .llm/metrics',
    'npm run build',
  ]) {
    assert.equal(verdictOf(shell(command)).kind, 'allow', command)
  }
})

test('the rule declares itself once, and the gate it installs is a gate listener over the metrics row', () => {
  assert.equal(typeof METRICS_DECLARATION, 'string')
  assert.ok(METRICS_DECLARATION.length > 0 && METRICS_DECLARATION.length <= 200)
  const installed: Array<{ event: string, listener: unknown }> = []
  const ctx = { on: (event: string, listener: unknown) => { installed.push({ event, listener }); return () => {} }, get: () => undefined }
  const uninstall = installMetricsFileGuard({ ctx, now: () => 0, journal: () => {} })
  assert.equal(installed.filter(entry => entry.event === 'tools/pre-execute').length, 1)
  assert.ok(installed.every(entry => isGateListener(entry.listener)))
  uninstall()
  uninstall()
})
