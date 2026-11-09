/**
 * A temporary project for the execute specs that run real git (M7 E7): a
 * repository under an isolated global git configuration (a user, no
 * autocrlf, no signing, `main` as the first branch; tests/execute-git.spec.ts
 * makes its repositories in the same sandbox), commits of the named
 * files only (the graph and the runtime files stay out of the commits), a
 * bare `origin` next to it, graph nodes staged through the engine as the
 * person's, and a `subagents` service that starts a registered external
 * provider the way rc.3 does (`startExternal`: the provider's `start` with
 * the resolved request, the run's id as the child id).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { openEngine } from '../src/graph/engine.ts'
import type { SubagentsService } from '../src/shared/dsh-min.ts'

/** The directory the temporary repositories of the git specs live in; its `gitconfig` is git's global configuration for the whole test process. */
export const sandbox = realpathSync.native(mkdtempSync(join(tmpdir(), 'execute-repo-')))
const globalConfig = join(sandbox, 'gitconfig')
writeFileSync(globalConfig, '[user]\n\tname = Test\n\temail = test@example.invalid\n[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n[commit]\n\tgpgsign = false\n')
process.env.GIT_CONFIG_GLOBAL = globalConfig
process.env.GIT_CONFIG_NOSYSTEM = '1'
process.on('exit', () => rmSync(sandbox, { recursive: true, force: true, maxRetries: 3 }))

export interface TestRepo {
  /** The main checkout and project root, on `main`. */
  readonly root: string
  readonly graphDir: string
  /** Run git in the main checkout and return its trimmed output; throws when git fails. */
  git(...args: string[]): string
  /** Write (a string) or delete (null) files on the current branch, commit exactly those, and return the new commit. */
  commit(files: Readonly<Record<string, string | null>>, message: string): string
  /** The same on `branch` (made from the current `main` when it does not exist); the checkout is back on `main` afterwards. */
  commitOn(branch: string, files: Readonly<Record<string, string | null>>, message: string): string
  /** A bare repository next to the project, added as `origin`, with `main` pushed to it. */
  withRemote(): string
  dispose(): void
}

let counter = 0

/** A repository with README.md committed on `main`; `.llm/` and the holder's `dsh-home/` are ignored through info/exclude. */
export function testRepo(): TestRepo {
  const base = join(sandbox, `p${++counter}`)
  const root = join(base, 'work')
  const graphDir = join(root, 'docs', 'graph')
  mkdirSync(graphDir, { recursive: true })
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '--quiet', '-b', 'main')
  mkdirSync(join(root, '.git', 'info'), { recursive: true })
  appendFileSync(join(root, '.git', 'info', 'exclude'), '.llm/\ndsh-home/\n')
  const commit = (files: Readonly<Record<string, string | null>>, message: string): string => {
    const paths = Object.keys(files)
    for (const [path, content] of Object.entries(files)) {
      const target = join(root, path)
      if (content === null) rmSync(target, { force: true })
      else {
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, content)
      }
    }
    if (paths.length > 0) git('add', '--all', '--', ...paths)
    git('commit', '--quiet', '--allow-empty', '-m', message)
    return git('rev-parse', 'HEAD')
  }
  commit({ 'README.md': 'probe workspace\n' }, 'seed')
  return {
    root,
    graphDir,
    git,
    commit,
    commitOn(branch, files, message) {
      const exists = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: root }).status === 0
      git('checkout', '--quiet', ...(exists ? [branch] : ['-b', branch]))
      try {
        return commit(files, message)
      }
      finally {
        git('checkout', '--quiet', 'main')
      }
    },
    withRemote() {
      const remote = join(base, 'origin.git')
      git('init', '--quiet', '--bare', '-b', 'main', remote)
      git('remote', 'add', 'origin', remote)
      git('push', '--quiet', '--set-upstream', 'origin', 'main')
      return remote
    },
    dispose() {
      rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    },
  }
}

/** Nodes proposed by the person, in order; a refusal throws with the engine's error. */
export async function stageNodes(graphDir: string, nodes: readonly Readonly<Record<string, unknown>>[]): Promise<void> {
  const engine = openEngine(graphDir)
  for (const node of nodes) {
    const seeded = await engine.apply('human', { op: 'propose', reason: 'test seed', node })
    if (!seeded.ok) throw new Error(`seeding ${String(node.id)} failed: ${JSON.stringify(seeded.error)}`)
  }
}

export const GOAL = { type: 'goal', id: 'goal-1', title: 'Static blog', stage: 'release', acceptance: ['the blog builds'] } as const
export const TASK = { type: 'task', id: 'task-1', parent: 'goal-1', title: 'Add the feed', kind: 'implement', writeScope: ['src/'], acceptance: ['the feed builds'], worktree: true } as const

/** `norm-merge-gate` with these acceptance lines, under the goal. */
export const gateNode = (acceptance: readonly string[]): Readonly<Record<string, unknown>> => ({ type: 'norm', id: 'norm-merge-gate', title: '合入前的检查', parent: 'goal-1', acceptance })

/** `norm-review-floor` with these acceptance lines, under the goal. */
export const floorNode = (acceptance: readonly string[]): Readonly<Record<string, unknown>> => ({ type: 'norm', id: 'norm-review-floor', title: '必须全审的改动', parent: 'goal-1', acceptance })

type Provider = Parameters<SubagentsService['registerProvider']>[0]
type StartSpec = Parameters<SubagentsService['startActivation']>[0]
type Activation = Awaited<ReturnType<SubagentsService['startActivation']>>

export interface ProviderSubagents {
  readonly service: Pick<SubagentsService, 'registerProvider' | 'startActivation'>
  /** The start specs, in order. */
  readonly starts: StartSpec[]
  /** The results of the started runs, in order. */
  readonly results: Activation['result'][]
}

/** `registerProvider` keeps one provider per name; `startActivation` starts the named one the way rc.3's `startExternal` does. */
export function providerSubagents(): ProviderSubagents {
  const providers = new Map<string, Provider>()
  const starts: StartSpec[] = []
  const results: Activation['result'][] = []
  return {
    starts,
    results,
    service: {
      registerProvider(provider) {
        if (providers.has(provider.name)) throw new Error(`a subagent provider named "${provider.name}" is already registered`)
        providers.set(provider.name, provider)
        return () => { providers.delete(provider.name) }
      },
      async startActivation(spec) {
        const provider = providers.get(spec.provider)
        if (provider === undefined) throw new Error(`no subagent provider named "${spec.provider}"`)
        starts.push(spec)
        const controller = new AbortController()
        const run = await provider.start({ ...spec.request, cwd: spec.request.cwd ?? sandbox, label: spec.label, signal: controller.signal })
        results.push(run.result)
        return { childId: run.id, result: run.result, dispose: () => run.dispose() }
      },
    },
  }
}
