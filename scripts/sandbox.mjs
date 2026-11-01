/**
 * Headless runs of the desktop DSH runtime (docs/DEVELOPMENT.md §3), shared
 * by the L3 probe (scripts/probe/run-probe.mjs) and the calibration runner
 * (scripts/calibrate/run-calibrate.mjs). The probe boots a profile it
 * generates under its run directory (generateProfile), linked to this
 * checkout; calibration boots the glmsandbox profile, which links the main
 * checkout (DSH_SANDBOX_PROFILE names another one).
 *
 * Overlay patches are generated per run with literal values: the loader
 * validates a row's `name` before `!!js` expressions evaluate, so paths
 * cannot be computed inside the patch. JSON values are valid YAML.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACKAGES } from './packages.mjs'

export const repo = resolve(fileURLToPath(new URL('..', import.meta.url)))
const desktop = process.env.DSH_DESKTOP_DIR ?? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DeepSeek Harness')
const exe = join(desktop, 'DeepSeek Harness.exe')
const bin = join(desktop, 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
/** The calibration profile under the user's DSH home. */
const sandboxProfile = process.env.DSH_SANDBOX_PROFILE ?? 'glmsandbox'

/** Exit with status 2 when the desktop install is missing. */
export function requireDesktop(label) {
  if (existsSync(exe)) return
  console.error(`${label}: desktop runtime not found at ${exe} (set DSH_DESKTOP_DIR)`)
  process.exit(2)
}

/**
 * Executable, arguments and environment that boot the runtime with an
 * overlay patch (Electron node mode): on the sandbox profile, or on
 * `profile`, one generateProfile wrote under its own DSH home.
 */
export const sandboxCommand = (patch, args, profile) => ({
  exe,
  args: [bin, '--profile', profile?.name ?? sandboxProfile, '--patch', patch, ...args],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...(profile === undefined ? {} : { DSH_HOME: profile.dshHome }) },
})

const byKey = key => PACKAGES.filter(pkg => pkg.key === key)
/**
 * The profiles the probe generates and the packages of this checkout each
 * lists, in profile order (scripts/packages.mjs): probe-full lists the two
 * packages the way the desktop profile lists them after the split (each
 * brings its nested client package through its own patch); probe-glm and
 * probe-hourness list one package each, the way a user installs only one.
 */
export const PROBE_PROFILES = {
  'probe-full': PACKAGES,
  'probe-glm': byKey('glm'),
  'probe-hourness': byKey('hourness'),
}
/** The bundles of the shipped headless template (dsh-app-boot PROFILE_TEMPLATES.headless), listed first. */
const BASE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless']

/**
 * Write the DSH home `dshHome` holding the profile `name`, listing the
 * packages `packages` ({ name, dir } with `dir` relative to this checkout):
 * package.json lists the base bundles and the packages (dependencies as
 * `link:`), cordis.yml and cordis.patch.yml are empty lists, and
 * node_modules/<package> is a junction to the package directory in this
 * checkout. Booted with DSH_HOME and --profile (sandboxCommand), the run
 * neither reads nor writes ~/.dsh/profiles, and it loads whichever checkout
 * this script is in (the main checkout or a worktree). The runtime rewrites
 * cordis.yml on every boot (dsh profile-boot prepareProfile), which shows the
 * profile was the one booted. Throws when a directory or junction cannot be
 * created.
 */
export function generateProfile(dshHome, name, packages) {
  const dir = join(dshHome, 'profiles', name)
  const modules = join(dir, 'node_modules')
  mkdirSync(modules, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: `dsh-profile-${name}`,
    private: true,
    dependencies: Object.fromEntries(packages.map(pkg => [pkg.name, `link:${slash(join(repo, pkg.dir))}`])),
    dsh: { profile: { bundles: [...BASE_BUNDLES, ...packages.map(pkg => pkg.name)] } },
  }, null, 2)}\n`)
  writeFileSync(join(dir, 'cordis.yml'), '[]\n')
  writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n')
  const profile = { name, dshHome, dir, packages: packages.map(pkg => pkg.name), links: packages.map(pkg => join(modules, pkg.name)) }
  try {
    packages.forEach((pkg, index) => symlinkSync(join(repo, pkg.dir), profile.links[index], 'junction'))
  }
  catch (error) {
    unlinkProfile(profile)
    throw error
  }
  return profile
}

/**
 * Remove the junctions of a generated profile; the rest stays as a run
 * artifact. A run directory then holds no link back into the checkout, so
 * deleting it or walking it cannot reach the checkout.
 */
export function unlinkProfile(profile) {
  for (const link of profile.links) {
    try {
      if (lstatSync(link).isSymbolicLink()) unlinkSync(link)
    }
    catch {
      // Never created (generation failed part way) or already gone.
    }
  }
}

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

/**
 * Overlay lines for a run that exercises the design row: the row is enabled
 * (it ships disabled), the question tool of the standard presets is mounted
 * (the headless template has none, and the main agent's face has to be seen
 * against a face that does), and the simulated human
 * (scripts/calibrate/simulated-human.mjs) stands in for the person with
 * `config` ({ record, wish }). `rowConfig`, when given, is the design row's
 * own configuration (its `persona` setting).
 */
export const designRows = (config, rowConfig) => [
  '- id: glm-hourness/design',
  '  disabled: false',
  ...rowConfig === undefined ? [] : [`  config: ${JSON.stringify(rowConfig)}`],
  '- insert:',
  '    - id: glm-hourness-probe/tool-ask-user',
  '      name: \'@deepseek-ai/dsh-tool-ask-user\'',
  '    - id: glm-hourness-calibrate/simulated-human',
  `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'calibrate', 'simulated-human.mjs')))}`,
  '      inject: [commands]',
  `      config: ${JSON.stringify(config)}`,
]

/** Make `dir` a git repository with one commit of its current files; whether every git step succeeded. */
export function initRepo(dir) {
  const git = args => spawnSync('git', ['-c', 'user.name=glm-hourness', '-c', 'user.email=glm-hourness@localhost', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' })
  return [['init', '-q'], ['add', '.'], ['commit', '-q', '-m', 'init']].every(args => git(args).status === 0)
}
