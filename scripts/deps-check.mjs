/**
 * Dependency report for the update routine (docs/DEVELOPMENT.md §11) and the
 * periodic patrol (docs/ORCHESTRATION.md §12): runs `pnpm outdated` and
 * `pnpm audit` and classifies each finding by what the routine does with it.
 * Read-only: changes no file.
 *
 * Exit 0 when nothing is listed, 1 when an update or an advisory is listed,
 * 2 when pnpm could not report.
 */
import { spawnSync } from 'node:child_process'

/** DSH packages follow the desktop runtime version, never the registry. */
const DSH_SCOPE = '@deepseek-ai/'

function pnpm(args) {
  // pnpm is a .cmd shim on Windows, so it runs through the shell; the
  // arguments are fixed literals.
  return spawnSync(`pnpm ${args.join(' ')}`, { encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 })
}

/** Parse pnpm's JSON output; pnpm exits non-zero when it lists anything. */
function pnpmJson(args) {
  const result = pnpm(args)
  try {
    return JSON.parse(result.stdout || '{}')
  }
  catch {
    console.error(`pnpm ${args.join(' ')} gave no JSON (exit ${result.status}):\n${result.stderr}${result.stdout}`)
    process.exit(2)
  }
}

function versionParts(version) {
  const [core, pre] = version.split('-', 2)
  return { numbers: core.split('.').map(Number), pre }
}

/** Kind of the step from current to target: major, minor, patch or prerelease. */
function stepKind(current, target) {
  const a = versionParts(current)
  const b = versionParts(target)
  if (a.numbers[0] !== b.numbers[0]) return 'major'
  if (a.numbers[1] !== b.numbers[1]) return 'minor'
  if (a.numbers[2] !== b.numbers[2]) return 'patch'
  return 'prerelease'
}

function routeFor(name, kind) {
  if (name.startsWith(DSH_SCOPE)) return 'pinned to the desktop runtime; moves only when the desktop app upgrades'
  if (kind === 'major') return 'major: decision for the user'
  return `${kind}: upgrade through all gates in one commit`
}

let listed = 0

const outdated = Object.entries(pnpmJson(['outdated', '--format', 'json']))
console.log(`pnpm outdated: ${outdated.length} package(s)`)
for (const [name, info] of outdated) {
  const kind = stepKind(info.current, info.latest)
  console.log(`  ${name} ${info.current} -> ${info.latest} (${info.dependencyType}) ${routeFor(name, kind)}`)
  listed += 1
}

const audit = pnpmJson(['audit', '--json'])
const advisories = Object.values(audit.advisories ?? {})
console.log(`pnpm audit: ${advisories.length} advisor${advisories.length === 1 ? 'y' : 'ies'}`)
for (const advisory of advisories) {
  // Paths read ". > top@version > ... > module@version"; the top-level
  // dependency decides who can move the fix.
  const tops = new Set()
  for (const finding of advisory.findings ?? []) {
    for (const path of finding.paths ?? []) {
      const top = path.split(' > ')[1] ?? advisory.module_name
      tops.add(top.slice(0, top.lastIndexOf('@') > 0 ? top.lastIndexOf('@') : top.length))
    }
  }
  const via = [...tops]
  const route = via.length > 0 && via.every((top) => top.startsWith(DSH_SCOPE))
    ? 'reaches us only through DSH packages; moves with the desktop runtime'
    : 'fix: upgrade the path that pulls it in, through all gates'
  console.log(`  ${advisory.severity} ${advisory.module_name} ${advisory.vulnerable_versions} (patched ${advisory.patched_versions}) ${advisory.url}`)
  console.log(`    via ${via.join(', ')}: ${route}`)
  listed += 1
}

process.exitCode = listed > 0 ? 1 : 0
