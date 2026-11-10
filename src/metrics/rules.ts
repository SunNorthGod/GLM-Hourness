/**
 * The metrics row's code rule, `metrics-files-only` (metrics design §3.4,
 * §15.32; docs/ORCHESTRATION.md §10.6): the journal is the harness's
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
 * violation journal and, from the same record, a `rule` event the row writes
 * into its own journal (src/metrics/index.ts).
 */
import { join } from 'node:path'
import { projectOf } from '../data/project-root.ts'
import { cwdOf, installRuleGate, type GateHost, type GateRules } from '../guard/gate.ts'
import { writesInto } from '../guard/directory-writes.ts'
import { cleansIgnored, gitInvocations } from '../guard/git-snapshot.ts'
import type { GuardRecord } from '../guard/records.ts'
import { originOf } from '../guard/origin.ts'
import { fileToolsOnly, NATIVE_FACE, shellCommandOf, type Correction, type GuardRule, type RuleVerdict, type ToolCall } from '../guard/rules.ts'
import { commandName, simpleCommands, WRITE_COMMANDS, type ShellDialect } from '../guard/shell.ts'
import type { JournalOutcome } from '../memory/audit.ts'
import { dialectNames, dialectService, dialectWarner, type DialectProblem } from '../shared/dialect.ts'
import type { RowHealth } from '../shared/health.ts'
import { sessionRoute } from '../shared/route.ts'
import type { ToolExecutionPayload } from '../shared/dsh-min.ts'

/**
 * The rule's id, one spelling everywhere: the denial's `rule` in the
 * violation journal and the `rule` event, the id `guard_lift` takes and the
 * lift record and `lift` event carry (src/guard/catalog.ts); the rules
 * board's catalog lists it as `metrics:metrics-files-only` (src/rules/builtin.ts).
 */
export const METRICS_FILES_ONLY = 'metrics-files-only'

const ALLOW: RuleVerdict = { kind: 'allow' }

/** Command names that delete, move or rename (POSIX utilities, cmd built-ins, PowerShell cmdlets and their aliases): the shell actions the journal's rule judges a mention with (§3.4). */
const DELETES_OR_MOVES: ReadonlySet<string> = new Set([
  'rm', 'rmdir', 'rd', 'del', 'erase', 'remove-item', 'ri', 'unlink', 'shred', 'truncate',
  'mv', 'move', 'move-item', 'mi', 'rename', 'rename-item', 'ren', 'rni',
])

/**
 * Command names that write a file and that file-tools-only's table
 * (src/guard/shell.ts) does not hold: cmd's `copy` and `xcopy`, the
 * PowerShell aliases `cpi` (Copy-Item), `ni` (New-Item), `clc`
 * (Clear-Content) and `ac` (Add-Content). The common spellings, not all of
 * them. The rule keeps its own table, so the guard row's reading of every
 * other shell write stays as it is.
 */
const WRITES: ReadonlySet<string> = new Set(['copy', 'xcopy', 'cpi', 'ni', 'clc', 'ac'])

const CMD_WORDS = [...DELETES_OR_MOVES, ...WRITES, ...WRITE_COMMANDS].join('|')

/**
 * The action words of the whole-text reading of what cmd runs: the rule's
 * two tables and file-tools-only's write commands, each as a whole word,
 * with an optional `.exe` (the text is lower case, with `/` for `\`). A
 * word after a space, the start or `;"'|&(` may run into a switch
 * (`del/q`); a word after a `/` that follows another character is the last
 * part of a path (`c:/git/usr/bin/rm`). A word after a `/` that follows a
 * space is a switch (`findstr /ni`), and one with a `/` on both sides is a
 * directory on a path (`c:/users/mi/…`): neither is an action (review
 * S7R4-1, S7R4-2).
 */
const CMD_ACTION = new RegExp(`(?:(?:^|[\\s;"'|&(])(?:${CMD_WORDS})(?:\\.exe)?(?=$|[\\s/"')>])|(?<=\\S)/(?:${CMD_WORDS})(?:\\.exe)?(?=$|[\\s"')>]))`)

/** A redirection that writes a file: not one onto another handle (`2>&1`) and not one to `nul`. */
const CMD_REDIRECT = /(?<!>)>+(?!>)(?!\s*&\d)(?!\s*nul\b)/

/**
 * Whether the text a `cmd` (or `cmd.exe`) command runs changes files, read
 * as a whole the way 3f59b61 read every shell text (§3.4): it holds one of
 * the action words or a redirection that writes. cmd's own grammar (its
 * switches before `/c` or `/k`, quoting the whole command line, `if exist`,
 * `&` inside the quotes) is not parsed, so every way of wrapping a command
 * in cmd is judged at once; a cmd-wrapped read whose text holds one of the
 * words is refused as well (the cost in docs/ORCHESTRATION.md §10.6).
 */
const cmdChanges = (words: readonly string[]): boolean => {
  const text = words.join(' ').replace(/\\/g, '/').toLowerCase()
  return CMD_ACTION.test(text) || CMD_REDIRECT.test(text)
}

/**
 * Whether one shell text changes files by a command the rule judges itself
 * (§3.4, §5.3): some simple command of it (quote-aware, src/guard/shell.ts)
 * is named in one of the two tables, is a `find` with `-delete`, or is a
 * `git clean` that deletes ignored files (`-x`, `-X`, not a dry run). A word
 * inside quotes or among the arguments is not an action, except in what a
 * `cmd` command runs, which is judged as text (`cmdChanges`).
 */
function changesFiles(command: string, dialects: readonly ShellDialect[]): boolean {
  return dialects.some(dialect =>
    gitInvocations(command, dialect, undefined).some(cleansIgnored)
    || simpleCommands(command, dialect).some((words) => {
      const name = commandName(words[0] ?? '')
      if (name === 'cmd') return cmdChanges(words.slice(1))
      return DELETES_OR_MOVES.has(name) || WRITES.has(name) || (name === 'find' && words.slice(1).includes('-delete'))
    }))
}

const filesCorrection = (fact: string): Correction => ({
  fact,
  violation: `Rule ${METRICS_FILES_ONLY} blocks writes, deletes and moves under the metrics journal (.llm/metrics/, .llm/metrics-manifest.jsonl, .llm/metrics-key); only the harness writes there.`,
  rightPath: 'Tell the human what you need and why; the harness alone writes these files.',
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

/** One switch of cmd, lower case: a letter, maybe with a `:value` (`/s`, `/v:on`). */
const CMD_SWITCH = /^\/[a-z](?::\S*)?$/

/** `NAME=value` environment words are skipped like the named prefixes (F64); tested on the whole word, since the value may hold a path. */
const NAME_VALUE = /^[a-z_][a-z0-9_]*=/

/** The comparable form of one command name: lower case, the path part and a trailing `.cmd`/`.exe` gone. */
const bare = (word: string): string => word.slice(word.lastIndexOf('/') + 1).replace(/\.(?:cmd|exe)$/, '')

/** One word without the pair of quotes around it (`'prune'`, `"metrics"`). */
const unquoted = (word: string): string =>
  word.length >= 2 && (word[0] === '"' || word[0] === "'") && word.at(-1) === word[0] ? word.slice(1, -1) : word

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
    while (head < words.length) {
      const word = words[head] ?? ''
      if (PREFIXES.has(bare(word)) || NAME_VALUE.test(word)) {
        head += 1
        continue
      }
      if (bare(word) === 'cmd') {
        // cmd's other switches (`/d`, `/s`, `/q`, `/v:on`) may stand before `/c` or `/k`; §3.4 has `/c` or `/k` right after cmd, and ORCHESTRATION.md §10.6 records the departure.
        let next = head + 1
        while (CMD_SWITCH.test(words[next] ?? '') && words[next] !== '/c' && words[next] !== '/k') next += 1
        if (words[next] === '/c' || words[next] === '/k') {
          head = next + 1
          continue
        }
      }
      break
    }
    if (!HEADS.has(bare(words[head] ?? ''))) continue
    const rest = words.slice(head + 1)
    const marker = rest.findIndex(word => unquoted(word) === 'metrics' || word.includes('scripts/metrics/cli'))
    if (marker < 0) continue
    if (rest.slice(marker + 1).some(word => bare(unquoted(word)) === 'prune')) return true
  }
  return false
}

// -------------------------------------------------------------------- the rule

/** The rule over one project's journal: `root` is the project the paths hang from, `cwd` the directory relative targets resolve against (without it a relative target cannot be judged and passes). */
export function metricsFilesOnly(root: string, cwd: string | undefined): GuardRule {
  const protectedPaths = [join(root, '.llm', 'metrics'), join(root, '.llm', 'metrics-manifest.jsonl'), join(root, '.llm', 'metrics-key')]
  const writes = writesInto(protectedPaths, cwd)
  return {
    id: METRICS_FILES_ONLY,
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
      // The mention is a substring of the whole text (§3.4), so `cd .llm/metrics; rm *` and a pipe into Remove-Item count; the action is a command's own.
      const mentions = shell.command.replace(/\\/g, '/').toLowerCase().includes('.llm/metrics')
      if (mentions && (fileToolsOnly.detect(call, NATIVE_FACE).kind === 'deny' || changesFiles(shell.command, shell.dialects))) {
        return { kind: 'deny', rule: METRICS_FILES_ONLY, correction: filesCorrection(`You tried to change the metrics journal through the shell: "${shell.command}".`) }
      }
      return ALLOW
    },
  }
}

// ------------------------------------------------------------------- the gate

/**
 * The gate's dependencies: the host, the journal a denial goes to (it never
 * rejects into the call; the outcome it returns reaches the gate, so a lost
 * record is counted) and the row's health, for the gate's lasting notes.
 */
interface MetricsGuardDeps {
  readonly ctx: GateHost
  readonly journal: (record: GuardRecord, cwd: string | undefined) => Promise<JournalOutcome> | void
  readonly health?: Pick<RowHealth, 'note'>
}

/** The session project's journal rule, under the face the model reads and the origin of where it ran (the same reading in the other gates, ORCHESTRATION.md §6.2); undefined when the call has no project, where there is no journal to guard. */
function rulesOf(deps: MetricsGuardDeps, warn: DialectProblem, payload: ToolExecutionPayload): GateRules | undefined {
  const route = sessionRoute(payload.agent?.session)
  const cwd = cwdOf(payload)
  const project = cwd === undefined ? undefined : projectOf(cwd)
  // The journal is the project's own (.llm of its root); projectOf follows the common git directory, so a worktree's session guards the main checkout's journal.
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
    journal: (record, payload) => deps.journal(record, cwdOf(payload)),
    ...(deps.health === undefined ? {} : { health: deps.health }),
  })
}
