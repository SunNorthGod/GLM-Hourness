/**
 * The environment of a trial run (takeover design 0.6 §6.2 item 3). Pure:
 * the host's environment in, the whitelist out. A trial runs commands the
 * human has not agreed to yet, so the child gets the names below and
 * nothing else: no token (`GITHUB_TOKEN`, `NPM_TOKEN`, `AWS_*`, the GLM
 * credential secret, `DSH_HOME`…), no `GIT_CONFIG_*`. The home and config
 * directories and the package caches point into the trial directory, so the
 * credentials under the real home are invisible to the standard tools; git
 * reads neither the system nor the global configuration (the Windows
 * credential manager is configured there) and never prompts. This is the
 * GitHub Actions rule for a pull request from a fork: run the code, give it
 * no secrets.
 *
 * `ELECTRON_RUN_AS_NODE` passes through when the host has it: inside the
 * desktop app `process.execPath` is the Electron binary, and the sandbox's
 * runner (`[process.execPath, runner.js]`, sandbox-local:539–553) only runs
 * as Node with it.
 */
import { join } from 'node:path'

/** Changes with the whitelist; part of the trial's environment key (§6.3). */
export const TRIAL_ENV_VERSION = '2026-11-06'

const PASSED: readonly string[] = [
  'PATH', 'PATHEXT', 'SystemRoot', 'SystemDrive', 'windir', 'ComSpec', 'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM', 'ELECTRON_RUN_AS_NODE',
]

/** Where tool chains are installed: read-only use, passed when set. */
const TOOLCHAIN: readonly string[] = ['RUSTUP_HOME', 'GOROOT', 'JAVA_HOME', 'VOLTA_HOME', 'NVM_HOME', 'NVM_SYMLINK', 'PYENV_ROOT', 'UV_PYTHON_INSTALL_DIR']

/** Home and configuration directories, relative to `<trial>/home`. */
const HOME_NAMES: Readonly<Record<string, string>> = {
  HOME: '', USERPROFILE: '', APPDATA: 'AppData/Roaming', LOCALAPPDATA: 'AppData/Local',
  XDG_CONFIG_HOME: '.config', XDG_CACHE_HOME: '.cache', XDG_DATA_HOME: '.local/share',
}

/** Package caches, relative to `<trial>/cache`. */
const CACHE_NAMES: Readonly<Record<string, string>> = {
  npm_config_cache: 'npm', npm_config_store_dir: 'pnpm', YARN_CACHE_FOLDER: 'yarn', PIP_CACHE_DIR: 'pip', UV_CACHE_DIR: 'uv',
  CARGO_HOME: 'cargo', GOPATH: 'go', GOMODCACHE: 'go/pkg/mod', GOCACHE: 'go-build', GRADLE_USER_HOME: 'gradle',
}

/** The directories under `<trial>/home` the run creates before the first command. */
export const TRIAL_HOME_DIRS: readonly string[] = [...new Set(Object.values(HOME_NAMES).filter(name => name !== ''))]

type Env = Readonly<Record<string, string | undefined>>

/** A value by name, case-insensitive on Windows (`Path` and `PATH` are one variable there). */
function lookup(env: Env, name: string, platform: NodeJS.Platform): [string, string] | undefined {
  if (platform !== 'win32') {
    const value = env[name]
    return value === undefined ? undefined : [name, value]
  }
  const key = Object.keys(env).find(candidate => candidate.toUpperCase() === name.toUpperCase())
  const value = key === undefined ? undefined : env[key]
  return key === undefined || value === undefined ? undefined : [key, value]
}

export interface TrialEnvInput {
  readonly env: Env
  /** The trial directory (`<tmp>/hourness-trial-…`). */
  readonly dir: string
  /** The real home directory, for the default places of a tool chain (`~/.rustup`, uv's Python). */
  readonly realHome: string
  readonly platform: NodeJS.Platform
  readonly exists: (path: string) => boolean
}

/** The whole environment of a trial command (§6.2 item 3). */
export function trialEnv(input: TrialEnvInput): Record<string, string> {
  const { env, dir, realHome, platform } = input
  const out: Record<string, string> = {}
  for (const name of [...PASSED, ...TOOLCHAIN]) {
    const found = lookup(env, name, platform)
    if (found !== undefined) out[found[0]] = found[1]
  }
  // A tool chain installed in its default place under the real home is set by its real path (rustup, uv's Pythons).
  const defaults: Readonly<Record<string, string>> = {
    RUSTUP_HOME: join(realHome, '.rustup'),
    UV_PYTHON_INSTALL_DIR: platform === 'win32' ? join(lookup(env, 'APPDATA', platform)?.[1] ?? join(realHome, 'AppData', 'Roaming'), 'uv', 'python') : join(realHome, '.local', 'share', 'uv', 'python'),
  }
  for (const [name, path] of Object.entries(defaults)) {
    if (lookup(env, name, platform) === undefined && input.exists(path)) out[name] = path
  }
  const home = join(dir, 'home')
  for (const [name, rel] of Object.entries(HOME_NAMES)) out[name] = rel === '' ? home : join(home, ...rel.split('/'))
  for (const [name, rel] of Object.entries(CACHE_NAMES)) out[name] = join(dir, 'cache', ...rel.split('/'))
  out.GIT_CONFIG_NOSYSTEM = '1'
  out.GIT_CONFIG_GLOBAL = join(home, '.gitconfig')
  out.GIT_TERMINAL_PROMPT = '0'
  out.GCM_INTERACTIVE = 'never'
  out.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes -o IdentityAgent=none -o IdentitiesOnly=yes'
  return out
}
