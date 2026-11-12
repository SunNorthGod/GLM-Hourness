/**
 * The policy digest (reval design 0.2 §3, §4.2): a `policy:` line of the same
 * shape as the pins line, one 12-hex digest per class of the forms a worker's
 * work is judged by —
 *
 * - `gate`: the parsed entries of `norm-merge-gate` (`normDigest`), prose
 *   excluded, the same digest the check records and the trunk advances carry;
 * - `floor`: the parsed entries of `norm-review-floor` and its unparsed lines
 *   (the strictness is part of the policy);
 * - `rules`: the text of the exported `docs/rules/rules.json`; a file that is
 *   not there is the legal no-rules state and digests the empty text — the
 *   absent file and the empty file are the same stable digest (§3.2);
 * - `checker`: the env tool nodes' config acceptance paths (the graph half of
 *   checker-config); the built-in file-name table is code, not policy.
 *
 * A class whose carrying node is gone, dropped or superseded reads as
 * `missing`; a rules file that answers with an error reads as `unreadable` —
 * both fail closed in the comparison (`policyStaleness`), never as fresh.
 * Pure functions: the digest function is a parameter, the rules file arrives
 * as data, and nothing here imports a Node built-in, so the host rows and
 * the DSH client import the same rules.
 */
import type { LoadedGraph } from '../graph/parse.ts'
import { envBranch } from '../env/branch.ts'
import { parseFloor } from './floor.ts'
import { normDigest, parseGateNorm } from './gate-norm.ts'

/** The id of the merge gate's norm. */
const GATE_NORM_ID = 'norm-merge-gate'
/** The id of the must-review floor's norm. */
const FLOOR_NORM_ID = 'norm-review-floor'

/** SHA-256 of a UTF-8 text as 64 lowercase hex digits. */
export type Sha256 = (text: string) => string

/** The four classes of the policy digest, in the order the line carries them. */
const POLICY_CLASSES = ['gate', 'floor', 'rules', 'checker'] as const

export type PolicyClass = (typeof POLICY_CLASSES)[number]

/** What one class digested to: a 12-hex digest, or why it could not. */
export type ClassDigest =
  | { readonly ok: true, readonly digest: string }
  | { readonly ok: false, readonly why: 'missing' | 'unreadable' }

/** What the caller read of the rules file: absent, its text, or a failed read. */
export type RulesRead =
  | { readonly kind: 'absent' }
  | { readonly kind: 'text', readonly text: string }
  | { readonly kind: 'unreadable' }

export interface PolicyDigests {
  readonly gate: ClassDigest
  readonly floor: ClassDigest
  readonly rules: ClassDigest
  readonly checker: ClassDigest
}

/** Whether a node that carries a policy class still stands (deleted and superseded nodes do not). */
function stands(node: { readonly status?: string } | undefined): boolean {
  return node !== undefined && node.status !== 'dropped' && node.status !== 'superseded'
}

function gateDigestOf(graph: LoadedGraph, sha256: Sha256): ClassDigest {
  const node = graph.nodes.get(GATE_NORM_ID)
  if (!stands(node)) return { ok: false, why: 'missing' }
  return { ok: true, digest: normDigest(parseGateNorm(node), sha256) }
}

function floorDigestOf(graph: LoadedGraph, sha256: Sha256): ClassDigest {
  const node = graph.nodes.get(FLOOR_NORM_ID)
  if (!stands(node)) return { ok: false, why: 'missing' }
  const floor = parseFloor(node)
  const entries = [
    ...floor.entries.map(entry => ({ index: entry.index, text: entry.text, tests: entry.tests })),
    ...(floor.unparsed.length > 0 ? [{ kind: 'unparsed' as const, indexes: floor.unparsed }] : []),
  ]
  return { ok: true, digest: sha256(JSON.stringify(entries)).slice(0, 12) }
}

function rulesDigestOf(rules: RulesRead, sha256: Sha256): ClassDigest {
  if (rules.kind === 'unreadable') return { ok: false, why: 'unreadable' }
  return { ok: true, digest: sha256(rules.kind === 'text' ? rules.text : '').slice(0, 12) }
}

function checkerDigestOf(graph: LoadedGraph, sha256: Sha256): ClassDigest {
  // The same paths the guard's graph context carries (checker-config's graph half), de-duplicated in line order.
  const configs = [...new Set(envBranch(graph).tools.flatMap(tool => tool.configs))]
  return { ok: true, digest: sha256(JSON.stringify(configs)).slice(0, 12) }
}

/** The four class digests of one loaded graph and one rules-file read. */
export function policyDigests(graph: LoadedGraph, rules: RulesRead, sha256: Sha256): PolicyDigests {
  return {
    gate: gateDigestOf(graph, sha256),
    floor: floorDigestOf(graph, sha256),
    rules: rulesDigestOf(rules, sha256),
    checker: checkerDigestOf(graph, sha256),
  }
}

const POLICY_PREFIX = 'policy:'
const POLICY_SEGMENT = /^(gate|floor|rules|checker)@([0-9a-f]{12})$/

/**
 * The `policy:` line: one `class@digest` segment per class that digested,
 * in class order. `undefined` when no class digested — a dispatch without a
 * comparable baseline carries no line (§3.1, the exemption).
 */
export function renderPolicyLine(digests: PolicyDigests): string | undefined {
  const segments = POLICY_CLASSES.map((cls) => {
    const digest = digests[cls]
    return digest.ok ? `${cls}@${digest.digest}` : undefined
  }).filter(segment => segment !== undefined)
  return segments.length === 0 ? undefined : `${POLICY_PREFIX} ${segments.join(' ')}`
}

/** The digests one text's last `policy:` line carries, per class it names; `undefined` when there is none. A word that does not read leaves its class out, which the comparison reads as changed (fail closed). */
export function parsePolicyLine(text: string): Partial<Record<PolicyClass, string>> | undefined {
  const line = [...text.split(/\r?\n/)].reverse().find(entry => entry.trimStart().startsWith(POLICY_PREFIX))
  if (line === undefined) return undefined
  const words = line.trimStart().slice(POLICY_PREFIX.length).trim().split(/\s+/).filter(word => word !== '')
  const digests: Partial<Record<PolicyClass, string>> = {}
  for (const word of words) {
    const match = POLICY_SEGMENT.exec(word)
    if (match !== null) digests[match[1] as PolicyClass] = match[2]
  }
  return digests
}

/** What differs for one policy class. */
export interface PolicyChange {
  readonly id: PolicyClass
  readonly change: 'changed' | 'missing' | 'unreadable'
  /** The digest the dispatch recorded, when the line carried it. */
  readonly from?: string
  /** The digest now, when one was computed. */
  readonly to?: string
}

/**
 * The policy classes whose current digest differs from the dispatch's line
 * (§4.2), compared class by class, in class order. A line the dispatch never
 * carried is no comparison: `undefined` reports nothing (§4.2's exemption).
 * A class the line omitted reads as changed when it computes now; a class
 * that went missing or unreadable reports that against the recorded digest;
 * a class neither side could read reports nothing — there is nothing to
 * compare.
 */
export function policyStaleness(line: string | undefined, digests: PolicyDigests): readonly PolicyChange[] {
  if (line === undefined) return []
  const recorded = parsePolicyLine(line) ?? {}
  const changes: PolicyChange[] = []
  for (const cls of POLICY_CLASSES) {
    const from = recorded[cls]
    const now = digests[cls]
    if (now.ok) {
      if (from === undefined) changes.push({ id: cls, change: 'changed', to: now.digest })
      else if (from !== now.digest) changes.push({ id: cls, change: 'changed', from, to: now.digest })
    }
    else if (from !== undefined) {
      changes.push(now.why === 'missing' ? { id: cls, change: 'missing', from } : { id: cls, change: 'unreadable', from })
    }
  }
  return changes
}

const DRIFT_PREFIX = '政策差：'

/** The 政策差 line the handback comment carries: the class names, comma separated. */
export function renderPolicyDrift(classes: readonly PolicyClass[]): string {
  return `${DRIFT_PREFIX}${classes.join(', ')}`
}

/** The classes one text's 政策差 line names, in class order; `undefined` when there is none or it names none of the four. */
export function parsePolicyDrift(text: string): readonly PolicyClass[] | undefined {
  const line = [...text.split(/\r?\n/)].reverse().find(entry => entry.trimStart().startsWith(DRIFT_PREFIX))
  if (line === undefined) return undefined
  const words = line.trimStart().slice(DRIFT_PREFIX.length).split(/[，,]/).map(word => word.trim())
  const classes = POLICY_CLASSES.filter(cls => words.includes(cls))
  return classes.length > 0 ? classes : undefined
}
