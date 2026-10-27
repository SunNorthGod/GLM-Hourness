/**
 * Headless runs of the desktop DSH runtime on the glmsandbox profile
 * (docs/DEVELOPMENT.md §3), shared by the L3 probe
 * (scripts/probe/run-probe.mjs) and the calibration runner
 * (scripts/calibrate/run-calibrate.mjs).
 *
 * Overlay patches are generated per run with literal values: the loader
 * validates a row's `name` before `!!js` expressions evaluate, so paths
 * cannot be computed inside the patch. JSON values are valid YAML.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repo = resolve(fileURLToPath(new URL('..', import.meta.url)))
const desktop = process.env.DSH_DESKTOP_DIR ?? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DeepSeek Harness')
const exe = join(desktop, 'DeepSeek Harness.exe')
const bin = join(desktop, 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

/** Exit with status 2 when the desktop install is missing. */
export function requireDesktop(label) {
  if (existsSync(exe)) return
  console.error(`${label}: desktop runtime not found at ${exe} (set DSH_DESKTOP_DIR)`)
  process.exit(2)
}

/** Executable, arguments and environment that boot the runtime on glmsandbox with an overlay patch (Electron node mode). */
export const sandboxCommand = (patch, args) => ({
  exe,
  args: [bin, '--profile', 'glmsandbox', '--patch', patch, ...args],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})

export const slash = path => path.replaceAll('\\', '/')

/**
 * Overlay rows that keep a run's data inside `dir`: the project directory
 * `<dir>/home` (memory, workflow and hourness get it as their row home, as
 * the user's profile patch does; the guard reads it from the data service)
 * and the DSH home `<dir>/dsh-home`, so the user-level directory is
 * `<dir>/dsh-home/glm-hourness`.
 */
export function dataRows(dir) {
  const home = JSON.stringify(slash(join(dir, 'home')))
  return [
    ...['memory', 'workflow', 'hourness'].flatMap(row => [`- id: glm-hourness/${row}`, `  config: { home: ${home} }`]),
    '- id: glm-hourness/data',
    `  config: { dshHome: ${JSON.stringify(slash(join(dir, 'dsh-home')))}, projectHome: ${home} }`,
  ]
}

/** Overlay lines that keep the attachment store of a run inside its own directory. */
export const attachmentsIn = dir => ['- id: attachment-local', `  config: { dshHome: ${JSON.stringify(slash(join(dir, 'dsh-home')))} }`]

/** Overlay lines that mount dsh-workspace-changes (the desktop profile has it through dsh-web-app; the sandbox template does not). */
export const workspaceChangesRow = id => ['- insert:', `    - id: ${id}`, '      name: \'@deepseek-ai/dsh-workspace-changes\'']

/** Overlay lines that insert the calibration bounds (scripts/calibrate/limits.mjs) with `config`. */
export const limitsRow = config => [
  '- insert:',
  '    - id: glm-hourness-calibrate/limits',
  `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'calibrate', 'limits.mjs')))}`,
  `      config: ${JSON.stringify(config)}`,
]

/** Make `dir` a git repository with one commit of its current files; whether every git step succeeded. */
export function initRepo(dir) {
  const git = args => spawnSync('git', ['-c', 'user.name=glm-hourness', '-c', 'user.email=glm-hourness@localhost', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' })
  return [['init', '-q'], ['add', '.'], ['commit', '-q', '-m', 'init']].every(args => git(args).status === 0)
}
