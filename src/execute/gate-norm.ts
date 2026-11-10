/**
 * The merge gate's checklist (M7 design 0.6 §3.8.1): the judgement forms of
 * the `norm-merge-gate` norm, one acceptance line each. Every line that does
 * not take a form is prose and is shown as written. Pure functions; the
 * digest function is a parameter so the DSH client can import the file too.
 *
 * Forms: `` $ <command> `` always runs, in the order listed; `` $ <command>
 * when <paths> `` runs when the change touches one of the paths; `` setup $
 * … `` runs in a fresh worktree and again when a watched file changed; ``
 * patrol $ <command> `` runs in the nightly patrol only; `` push `` is the
 * push after the trunk moved; `` only <paths> `` both skips the commands for
 * a change that touches nothing else and lets one checked commit stand for
 * another that differs by those paths only; `` changed <format> $ <command>
 * `` runs the command on the files the change still holds and fails only
 * when a finding of the named format falls on a line the change added
 * (takeover design 0.6 §5.6: the ratchet; this form arrives with the
 * takeover row, bootstrap-ratchet).
 */
import type { GraphNode } from '../graph/schema.ts'
import { isCheckFormat, type CheckFormat } from '../env/check-entry.ts'
import { isFloorPath } from './floor.ts'

/** The forms a line of the gate may take, for a takeover draft to propose (design §3.8.1; the `changed` form arrives with the takeover row). */
export const GATE_LINE_FORMS = [
  '$ <command>',
  '$ <command> when <paths>',
  'setup $ <command>',
  'setup $ <command> when <paths>',
  'patrol $ <command>',
  'push',
  'only <paths>',
  'changed <format> $ <command>',
] as const

/** The files whose digest re-runs a `setup` command when none are named (§3.8.1; the git executor digests the same list). */
export const DEFAULT_WATCHED: readonly string[] = ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock']

interface GateCommand {
  /** The acceptance line's index. */
  readonly index: number
  readonly kind: 'check' | 'setup' | 'patrol'
  readonly command: string
  /** For `when`: the paths that make the command run. */
  readonly when?: readonly string[]
  /** A `changed` line (§5.6): the output format its findings are read in; only findings on lines the change added count. */
  readonly changed?: CheckFormat
}

export interface ParsedGate {
  readonly commands: readonly GateCommand[]
  /** The `push` line: the trunk is pushed, without force, after it moved. */
  readonly push: boolean
  /** The `only` paths: a change touching nothing else runs no command. */
  readonly only: readonly string[]
  /** The lines that are prose, with their indexes, shown as written. */
  readonly prose: readonly { readonly index: number, readonly text: string }[]
}

function parseWhen(value: string): readonly string[] | undefined {
  const paths = value.split(',').map(path => path.trim()).filter(path => path.length > 0)
  return paths.length > 0 && paths.every(isFloorPath) ? paths : undefined
}

/** The form of one backtick-wrapped line; undefined when it is prose. */
function parseLine(line: string, index: number): GateCommand | { readonly push: true } | { readonly only: readonly string[] } | undefined {
  if (line === 'push') return { push: true }
  if (line.startsWith('only ')) {
    const paths = parseWhen(line.slice('only '.length))
    return paths === undefined ? undefined : { only: paths }
  }
  const whenSplit = line.split(/\s+when\s+/)
  const when = whenSplit.length === 2 ? parseWhen(whenSplit[1] ?? '') : whenSplit.length === 1 ? [] : undefined
  if (when === undefined) return undefined
  const body = whenSplit[0] ?? ''
  const setup = body.startsWith('setup $ ')
  const patrol = !setup && body.startsWith('patrol $ ')
  const changed = /^changed\s+(\S+)\s+\$\s(.+)$/.exec(setup || patrol ? '' : body) ?? undefined
  const format = changed === undefined ? undefined : changed[1]
  if (format !== undefined && !isCheckFormat(format)) return undefined
  const command = setup ? body.slice('setup $ '.length) : patrol ? body.slice('patrol $ '.length) : changed !== undefined ? changed[2] : body.startsWith('$ ') ? body.slice(2) : undefined
  if (command === undefined || command.trim().length === 0 || /\r?\n/.test(command)) return undefined
  return {
    index,
    kind: setup ? 'setup' : patrol ? 'patrol' : 'check',
    command: command.trim(),
    // The format check above has already thrown out the non-formats.
    ...(format === undefined ? {} : { changed: format }),
    // A `when` on a setup line is the watch list; without one it is the
    // default watched files (§3.8.1), filled in here so every reader and the
    // digest see the same paths.
    ...(when.length === 0 ? (setup ? { when: DEFAULT_WATCHED } : {}) : { when }),
  }
}

/**
 * The gate of a `norm-merge-gate` node (§3.8.1). An undefined node, or one
 * without a single command, is an empty gate — `check_commit` refuses it
 * (`no_gate_norm`), and so does the trunk's advance check. A `setup` line
 * without `when` watches `DEFAULT_WATCHED`; the caller fills that in.
 */
export function parseGateNorm(node: GraphNode | undefined): ParsedGate {
  const acceptance = node?.acceptance ?? []
  const commands: GateCommand[] = []
  const prose: { index: number, text: string }[] = []
  let push = false
  const only: string[] = []
  acceptance.forEach((text, index) => {
    const segment = /^\s*`([^`]*)`\s*$/.exec(text)?.[1]
    if (segment === undefined) {
      prose.push({ index, text })
      return
    }
    const parsed = parseLine(segment.trim(), index)
    if (parsed === undefined) {
      prose.push({ index, text })
      return
    }
    if ('push' in parsed) {
      push = true
      return
    }
    if ('only' in parsed) {
      only.push(...parsed.only)
      return
    }
    commands.push(parsed)
  })
  return { commands, push, only, prose }
}

/**
 * The digest of a gate (§3.8.1): the parsed entries — commands, push, only —
 * in order, as canonical JSON, through the SHA-256. Records and advances
 * carry it; a changed list makes the old records count for nothing.
 */
export function normDigest(gate: ParsedGate, sha256: (text: string) => string): string {
  const entries = [
    ...gate.commands.map(command => ({ kind: command.kind, command: command.command, when: command.when ?? null, ...(command.changed === undefined ? {} : { changed: command.changed }) })),
    ...(gate.push ? [{ kind: 'push' as const }] : []),
    ...(gate.only.length > 0 ? [{ kind: 'only' as const, paths: gate.only }] : []),
  ]
  return sha256(JSON.stringify(entries)).slice(0, 12)
}
