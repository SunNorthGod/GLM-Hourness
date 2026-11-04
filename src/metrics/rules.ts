/**
 * The metrics row's code rule, `metrics:metrics-files-only` (metrics design
 * §3.4, §15.32; docs/ORCHESTRATION.md §16.10): the journal is the harness's
 * record, so a file tool or a shell command that writes, deletes or moves
 * into it is denied, and so is `npm run metrics -- prune` — pruning old day
 * files is the human's own command, run in their terminal. Reads pass
 * (§15.42): the summary, `verify` and reading `view.json` stay open, and the
 * row's own writes never pass a tool call, so the rule never sees them.
 *
 * The rule is installed through the guard framework's one gate
 * (src/guard/gate.ts) like every row's, denies from the day the row is
 * enabled (no shadow mode, `d-code-rules-enforce`), and is lifted only the
 * one M4 way (`d-one-lift-path`): the human says so and the main agent calls
 * `guard_lift` (the board's `/rules lift` path is wired after dogfood). The
 * catalog entry is in src/guard/catalog.ts; every denial is a line of the
 * violation journal and a `rule` event through its wrapper.
 */
import { join } from 'node:path'
import { projectOf } from '../data/project-root.ts'
import { cwdOf, installRuleGate, type GateHost, type GateRules } from '../guard/gate.ts'
import { writesInto } from '../guard/directory-writes.ts'
import type { GuardRecord } from '../guard/records.ts'
import { originOf } from '../guard/origin.ts'
import { fileToolsOnly, NATIVE_FACE, shellCommandOf, type Correction, type GuardRule, type RuleVerdict, type ToolCall } from '../guard/rules.ts'
import { dialectNames, dialectService, dialectWarner, type DialectProblem } from '../shared/dialect.ts'
import { sessionRoute } from '../shared/route.ts'
import type { ToolExecutionPayload } from '../shared/dsh-min.ts'

/** The id the gate carries in the violation journal and the rules board's catalog (`<row>:<id>`). */
export const METRICS_FILES_ONLY = 'metrics:metrics-files-only'

/** The line the rule adds to the guard section of every route's system prompt; it does not change with the project. */
export const METRICS_DECLARATION = 'The metrics journal (.llm/metrics/) is written by the harness alone; you cannot change it, and npm run metrics -- prune is the human\'s own command.'

const ALLOW: RuleVerdict = { kind: 'allow' }

/** Whole words that delete, move or rename: the shell actions the journal's rule judges a mention with (§3.4). */
const DESTRUCTIVE = /(?:^|[\s/;"'|&])(?:rm|rmdir|rd|del|erase|remove-item|remove|ri|unlink|shred|mv|move|move-item|mi|rename|rename-item|ren|rni|truncate)(?:$|[\s/"'])/

const filesCorrection = (fact: string): Correction => ({
  fact,
  violation: `Rule ${METRICS_FILES_ONLY} blocks writes, deletes and moves under the metrics journal (.llm/metrics/, .llm/metrics-manifest.jsonl, .llm/metrics-key); only the harness writes there.`,
  rightPath: 'Reading the journal and npm run metrics -- summary or verify are allowed; tell the human what you need and why.',
  exception: 'Only the human can lift this rule, by saying so to the main agent.',
})

const pruneCorrection = (fact: string): Correction => ({
  fact,
  violation: `Rule ${METRICS_FILES_ONLY} blocks npm run metrics -- prune: pruning old day files of the metrics journal is the human's own command, run in their terminal.`,
  rightPath: 'Ask the human to run the prune in their terminal, or to lift this rule by saying so.',
  exception: 'Only the human can lift this rule, by saying so to the main agent.',
})

// ------------------------------------------------------------------ isPruneCall

/** A head word the prune call may start with, equality after the path and the extension are gone (`pnpm` is not `npm`). */
const HEADS: ReadonlySet<string> = new Set(['npm', 'npx', 'node', 'tsx'])

/** Words a prune call may hide behind, skipped repeatedly before the head word (F64). */
const PREFIXES: ReadonlySet<string> = new Set(['call', 'start', 'time', 'env'])

/** `NAME=value` environment words are skipped like the named prefixes (F64). */
const NAME_VALUE = /^[a-z_][a-z0-9_]*=/

/** The comparable form of one word: lower case, the path part and a trailing `.cmd`/`.exe` gone. */
const bare = (word: string): string => word.slice(word.lastIndexOf('/') + 1).replace(/\.(?:cmd|exe)$/, '')

/**
 * The simple commands of one shell text (§3.4, F53, F64): backslashes become
 * slashes and the text is lower cased first; the splits are at `;`, `&&`,
 * `||`, `|`, a single `&` and a newline — never inside quotes, and an `&`
 * beside a `>` is redirection (`2>&1`, `*>&1`, `>&2`, `&>`), not a separator.
 */
function splitCommands(command: string): readonly string[] {
  const text = `${command.replace(/\\/g, '/').toLowerCase()} `
  const segments: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  const end = (): void => {
    const trimmed = current.trim()
    if (trimmed.length > 0) segments.push(trimmed)
    current = ''
  }
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at]
    if (quote !== undefined) {
      if (char === quote) quote = undefined
      current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === ';' || char === '|' || char === '&' || char === '\n') {
      if (char === '&' && text[at + 1] !== '&' && (text[at - 1] === '>' || text[at + 1] === '>')) {
        current += char
        continue
      }
      end()
      if (char === '&' || char === '|') at += text[at + 1] === char ? 1 : 0
      continue
    }
    current += char
  }
  end()
  return segments
}

/**
 * Whether one shell text runs the metrics command line's `prune` (§15.32):
 * some simple command starts — after the prefix words are skipped — with
 * `npm`, `npx`, `node` or `tsx`, names `metrics` or a word containing
 * `scripts/metrics/cli`, and names `prune` after it. A command the splitter
 * cannot see through (quoted whole to another shell, quoted paths with
 * spaces) is not recognized; the journal's own `prune` events and the tool
 * events find it afterwards.
 */
export function isPruneCall(command: string): boolean {
  for (const segment of splitCommands(command)) {
    const words = segment.split(/\s+/)
    let head = 0
    for (;;) {
      const word = bare(words[head] ?? '')
      if (head >= words.length) break
      if (PREFIXES.has(word) || NAME_VALUE.test(word)) {
        head += 1
        continue
      }
      if (word === 'cmd' && (bare(words[head + 1] ?? '') === '/c' || bare(words[head + 1] ?? '') === '/k' || (words[head + 1] ?? '') === '/c' || (words[head + 1] ?? '') === '/k')) {
        head += 2
        continue
      }
      break
    }
    if (!HEADS.has(bare(words[head] ?? ''))) continue
    const rest = words.slice(head + 1)
    const marker = rest.findIndex(word => word === 'metrics' || word.includes('scripts/metrics/cli'))
    if (marker < 0) continue
    if (rest.slice(marker + 1).some(word => bare(word) === 'prune')) return true
  }
  return false
}

// -------------------------------------------------------------------- the rule

/** The rule over one project's journal: `root` is the project the paths hang from, `cwd` the directory relative targets resolve against (without it a relative target cannot be judged and passes). */
export function metricsFilesOnly(root: string, cwd: string | undefined): GuardRule {
  const protectedPaths = [join(root, '.llm', 'metrics'), join(root, '.llm', 'metrics-manifest.jsonl'), join(root, '.llm', 'metrics-key')]
  const writes = writesInto(protectedPaths, cwd)
  return {
    id: 'metrics-files-only',
    declare: METRICS_DECLARATION,
    detect(call: ToolCall): RuleVerdict {
      const write = writes(call)
      if (write !== undefined) {
        return {
          kind: 'deny',
          rule: METRICS_FILES_ONLY,
          correction: filesCorrection(write.kind === 'file' ? `You tried to write "${write.target}".` : `You tried to change the metrics journal through the shell: "${write.command}".`),
        }
      }
      const shell = shellCommandOf(call)
      if (shell === undefined) return ALLOW
      if (isPruneCall(shell.command)) {
        return { kind: 'deny', rule: METRICS_FILES_ONLY, correction: pruneCorrection(`You tried to run "${shell.command}", which prunes old day files of the metrics journal.`) }
      }
      const normalized = shell.command.replace(/\\/g, '/').toLowerCase()
      if (normalized.includes('.llm/metrics') && (DESTRUCTIVE.test(normalized) || fileToolsOnly.detect(call, NATIVE_FACE).kind === 'deny')) {
        return { kind: 'deny', rule: METRICS_FILES_ONLY, correction: filesCorrection(`You tried to change the metrics journal through the shell: "${shell.command}".`) }
      }
      return ALLOW
    },
  }
}

// ------------------------------------------------------------------- the gate

/** The gate's dependencies: the host, the clock and the journal a denial goes to (it never rejects into the call). */
interface MetricsGuardDeps {
  readonly ctx: GateHost
  readonly now: () => number
  readonly journal: (record: GuardRecord, cwd: string | undefined) => void
}

/** The session project's journal rule, under the face the model reads and the origin of where it ran (the same reading in the other gates, ORCHESTRATION.md §6.2); undefined when the call has no project, where there is no journal to guard. */
function rulesOf(deps: MetricsGuardDeps, warn: DialectProblem, payload: ToolExecutionPayload): GateRules | undefined {
  const route = sessionRoute(payload.agent?.session)
  const cwd = cwdOf(payload)
  const project = cwd === undefined ? undefined : projectOf(cwd)
  // The journal is the project's own (.llm of its root); another worktree is its own project with its own row.
  if (project === undefined) return undefined
  return {
    rules: [metricsFilesOnly(project.root, cwd)],
    face: NATIVE_FACE,
    origin: originOf(dialectNames(dialectService(deps.ctx, warn), payload.agent, route, warn) !== undefined, route),
  }
}

/** Install the gate on `tools/pre-execute`, outermost; the disposer takes it out. Throws only when the host refuses the registration. */
export function installMetricsFileGuard(deps: MetricsGuardDeps): () => void {
  const warn = dialectWarner('metrics')
  return installRuleGate(deps.ctx, {
    row: 'metrics',
    prepend: true,
    // A run_code program's tool call (it carries `parent`) is judged like a direct one, as the loop board's file gate does.
    judgeChildren: true,
    rules: payload => rulesOf(deps, warn, payload),
    journal: (record, payload) => { deps.journal(record, cwdOf(payload)) },
  })
}
