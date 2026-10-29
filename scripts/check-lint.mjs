/**
 * Checker gate (docs/DEVELOPMENT.md §10, docs/ORCHESTRATION.md §7.6-7.7):
 * ESLint, knip and jscpd against committed baselines.
 *
 * - ESLint: its own bulk suppressions (eslint-suppressions.json). A violation
 *   beyond them fails; a suppression that no longer occurs fails too.
 * - knip: knip has no baseline, so knip-baseline.json lists the accepted
 *   findings by type, file and name (no line numbers, so edits elsewhere in
 *   a file do not move them).
 * - jscpd: its fingerprint baseline (.jscpd-baseline.json, see .jscpd.json).
 *
 * Ratchet: a finding missing from a baseline fails; a baseline entry that no
 * longer occurs also fails until `--update` shrinks the baseline, so the
 * baselines only shrink. `--update` refuses while any new finding exists;
 * accepting a new finding is a decision for the user (ORCHESTRATION.md §7.6).
 * `--update` creates a missing baseline from the current findings; deleting a
 * baseline to recreate it accepts every finding and needs the same decision.
 *
 *   node scripts/check-lint.mjs            gate
 *   node scripts/check-lint.mjs --update   shrink the baselines to the current findings
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const update = process.argv.includes('--update')

// eslint and knip do not export their bin files; pnpm links every direct
// dependency at node_modules/<name>.
const ESLINT = join(repo, 'node_modules', 'eslint', 'bin', 'eslint.js')
const KNIP = join(repo, 'node_modules', 'knip', 'bin', 'knip.js')
const JSCPD = fileURLToPath(import.meta.resolve('jscpd/run-jscpd.js'))
const ESLINT_SUPPRESSIONS = join(repo, 'eslint-suppressions.json')
const KNIP_BASELINE = join(repo, 'knip-baseline.json')
const JSCPD_BASELINE = join(repo, '.jscpd-baseline.json')
// The jscpd Windows binary is refused writes into %TEMP% on this machine, so
// its report goes to the gitignored project directory and is removed after.
const JSCPD_REPORT_DIR = join(repo, '.llm', 'checks')

/** Run a checker's Node entry; `inherit` streams its output to the console. */
function run(script, args, inherit = false) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: inherit ? 'inherit' : 'pipe',
    env: { ...process.env, JSCPD_NO_TIPS: '1' },
  })
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function eslint() {
  const missing = !existsSync(ESLINT_SUPPRESSIONS)
  if (missing && !update) return { ok: false, summary: 'eslint-suppressions.json is missing' }
  const mode = missing ? ['--suppress-all'] : update ? ['--prune-suppressions'] : []
  const result = run(ESLINT, ['--max-warnings', '0', ...mode, '.'], true)
  let suppressed = 0
  for (const rules of Object.values(readJson(ESLINT_SUPPRESSIONS))) {
    for (const entry of Object.values(rules)) suppressed += entry.count
  }
  if (result.status !== 0) return { ok: false, summary: `failed (exit ${result.status}); ${suppressed} suppressed` }
  return { ok: true, summary: `${suppressed} suppressed` }
}

/** knip findings as stable keys: "<type> <file> <name>" ("files <file>" for unused files). */
function knipFindings() {
  // tsconfig.knip.json references the package tsconfigs, so imports of
  // packages/*/dist map back to src/ (only knip reads it: tsc refuses
  // references to non-composite projects).
  const result = run(KNIP, ['--reporter', 'json', '--no-progress', '--no-exit-code', '--tsConfig', 'tsconfig.knip.json'])
  if (result.status !== 0) throw new Error(`knip did not run (exit ${result.status}):\n${result.stderr}`)
  const findings = new Set()
  for (const issue of JSON.parse(result.stdout).issues) {
    for (const [type, items] of Object.entries(issue)) {
      if (!Array.isArray(items)) continue
      for (const item of items) {
        const name = Array.isArray(item) ? item.map((part) => part.name).join('|') : item.name
        findings.add(name === issue.file ? `${type} ${issue.file}` : `${type} ${issue.file} ${name}`)
      }
    }
  }
  return findings
}

function writeKnipBaseline(findings) {
  writeFileSync(KNIP_BASELINE, `${JSON.stringify({ findings: [...findings].sort() }, null, 2)}\n`)
}

function knip() {
  const current = knipFindings()
  if (!existsSync(KNIP_BASELINE)) {
    if (!update) return { ok: false, summary: 'knip-baseline.json is missing' }
    writeKnipBaseline(current)
    return { ok: true, summary: `baseline created: ${current.size} finding(s)` }
  }
  const baseline = new Set(readJson(KNIP_BASELINE).findings)
  const added = [...current].filter((key) => !baseline.has(key))
  const gone = [...baseline].filter((key) => !current.has(key))
  for (const key of added) console.log(`knip: new finding: ${key}`)
  if (added.length > 0) return { ok: false, summary: `${added.length} new finding(s) beyond the baseline` }
  if (update && gone.length > 0) {
    writeKnipBaseline(current)
    return { ok: true, summary: `baseline shrunk: ${current.size} finding(s), ${gone.length} removed` }
  }
  for (const key of gone) console.log(`knip: fixed, still in the baseline: ${key}`)
  if (gone.length > 0) return { ok: false, summary: `${gone.length} baseline finding(s) no longer occur; run npm run lint:update` }
  return { ok: true, summary: `${current.size} in the baseline` }
}

/** One jscpd scan against its baseline; returns the report's totals and new clones. */
function jscpdScan(extra) {
  mkdirSync(JSCPD_REPORT_DIR, { recursive: true })
  try {
    const result = run(JSCPD, ['--reporters', 'json', '--output', JSCPD_REPORT_DIR, '--silent', ...extra])
    const reportPath = join(JSCPD_REPORT_DIR, 'jscpd-report.json')
    if (!existsSync(reportPath)) throw new Error(`jscpd did not report (exit ${result.status}):\n${result.stderr}`)
    const report = readJson(reportPath)
    return { total: report.statistics.total, fresh: report.duplicates.filter((clone) => clone.isNew) }
  }
  finally {
    rmSync(JSCPD_REPORT_DIR, { recursive: true, force: true })
  }
}

function jscpd() {
  if (!existsSync(JSCPD_BASELINE)) {
    if (!update) return { ok: false, summary: '.jscpd-baseline.json is missing' }
    const { total } = jscpdScan(['--update-baseline'])
    return { ok: true, summary: `baseline created: ${total.clones} clone(s)` }
  }
  const { total, fresh } = jscpdScan([])
  for (const clone of fresh) {
    const a = clone.firstFile
    const b = clone.secondFile
    console.log(`jscpd: new clone (${clone.format}, ${clone.lines} lines): ${a.name}:${a.start}-${a.end} ~ ${b.name}:${b.start}-${b.end}`)
  }
  if (fresh.length > 0) return { ok: false, summary: `${fresh.length} new clone(s) beyond the baseline` }
  const accepted = Object.values(readJson(JSCPD_BASELINE).fingerprints).reduce((sum, count) => sum + count, 0)
  const gone = accepted - total.clones
  if (update && gone > 0) {
    jscpdScan(['--update-baseline'])
    return { ok: true, summary: `baseline shrunk: ${total.clones} clone(s), ${gone} removed` }
  }
  if (gone > 0) return { ok: false, summary: `${gone} baseline clone(s) no longer occur; run npm run lint:update` }
  return { ok: true, summary: `${total.clones} clone(s) in the baseline, ${total.duplicatedLines} duplicated lines` }
}

const results = [['eslint', eslint()], ['knip', knip()], ['jscpd', jscpd()]]
for (const [name, result] of results) console.log(`${name}: ${result.ok ? 'ok' : 'FAIL'} (${result.summary})`)
if (results.some(([, result]) => !result.ok)) process.exitCode = 1
