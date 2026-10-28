/**
 * Secret gate (docs/DEVELOPMENT.md §10, §11): gitleaks over what git holds.
 *
 * Scans the commits reachable from HEAD and the uncommitted changes to
 * tracked files (staged and unstaged). Untracked and ignored files are never
 * read, so local files such as the credentials under .llm/ stay out of the
 * scan. History stops at HEAD so that the result depends on this checkout
 * only, not on other branches or worktrees of the same repository.
 *
 * Rules: gitleaks' default rules, or .gitleaks.toml in the repository root
 * when it exists; an allowlist there names the path and the regex of each
 * known false positive. GITLEAKS_CONFIG and GITLEAKS_CONFIG_TOML are not
 * passed on and inline gitleaks:allow comments do not count, so the
 * committed config is the only allowlist. Secrets are redacted in every
 * output.
 *
 * gitleaks is a standalone binary outside the repository: $GITLEAKS_PATH,
 * else %LOCALAPPDATA%\Programs\gitleaks\gitleaks.exe, else gitleaks on PATH.
 * A missing binary fails the gate; it does not skip.
 *
 *   node scripts/check-secrets.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const INSTALL = 'install it as docs/DEVELOPMENT.md §11 describes: the windows_x64 zip of the latest release from '
  + 'https://github.com/gitleaks/gitleaks/releases, checked against the release checksums file, '
  + 'unpacked to %LOCALAPPDATA%\\Programs\\gitleaks\\ (or set GITLEAKS_PATH to the binary)'

/** What each scan reads: its label and the `gitleaks git` flags that select it. */
const SCANS = [
  ['history', ['--log-opts=HEAD']],
  ['staged', ['--staged']],
  ['unstaged', ['--pre-commit']],
]

const env = { ...process.env }
delete env.GITLEAKS_CONFIG
delete env.GITLEAKS_CONFIG_TOML

function fail(summary) {
  console.log(`check-secrets: FAIL (${summary})`)
  process.exit(1)
}

/** The binary to run, or a failure naming why there is none. */
function locate() {
  const configured = process.env.GITLEAKS_PATH
  if (configured !== undefined && configured !== '') {
    if (!existsSync(configured)) fail(`GITLEAKS_PATH points to a missing file: ${configured}; ${INSTALL}`)
    return configured
  }
  const local = process.env.LOCALAPPDATA
  const installed = local === undefined ? undefined : join(local, 'Programs', 'gitleaks', 'gitleaks.exe')
  return installed !== undefined && existsSync(installed) ? installed : 'gitleaks'
}

function gitleaks(binary, args) {
  return spawnSync(binary, args, { cwd: repo, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

const binary = locate()
const version = gitleaks(binary, ['version'])
if (version.error !== undefined || version.status !== 0) {
  fail(`gitleaks did not run (${version.error?.message ?? `exit ${version.status}`}); ${INSTALL}`)
}

const leaks = []
let commits = '?'
for (const [label, flags] of SCANS) {
  const result = gitleaks(binary, [
    'git', ...flags, '--no-banner', '--no-color', '--redact', '--ignore-gitleaks-allow',
    '--log-level', 'info', '--report-format', 'json', '--report-path', '-', repo,
  ])
  let findings
  try {
    findings = JSON.parse(result.stdout)
  }
  catch {
    findings = undefined
  }
  // Exit 0 with an empty report is clean; a non-zero exit with findings is
  // leaks; anything else means gitleaks did not finish the scan.
  if (!Array.isArray(findings) || (result.status === 0) !== (findings.length === 0)) {
    console.log(result.stderr)
    fail(`gitleaks did not scan the ${label} content (exit ${result.status})`)
  }
  for (const finding of findings) leaks.push({ label, finding })
  if (label === 'history') commits = /(\d+) commits scanned/.exec(result.stderr)?.[1] ?? commits
}

for (const { label, finding } of leaks) {
  // Diff scans report no commit.
  const where = typeof finding.Commit === 'string' && finding.Commit !== '' ? ` at ${finding.Commit.slice(0, 12)}` : ''
  console.log(`check-secrets: leak (${label}): ${finding.RuleID} in ${finding.File}:${finding.StartLine}${where}`)
}
const scope = `gitleaks ${version.stdout.trim()}: ${commits} commits on HEAD, staged and unstaged changes`
if (leaks.length > 0) fail(`${leaks.length} leak(s); ${scope}`)
console.log(`check-secrets: ok (${scope}, no leaks)`)
