/**
 * suppression-reason (m4-gate G3, design §4.3): a file-tool write that adds
 * a suppression comment without a reason and a graph node on the same line is
 * denied. "Added" is per marker: the new text holds more occurrences of the
 * marker than the old one (edit compares `new_string` with `old_string`,
 * str_replace_editor `new_str` with `old_str`, while `create` and `write`
 * compare the whole new text with the target's old content from the
 * judgment context, design §4.1). The one counter of the markers is
 * env/suppressions.ts countMarkers, the same function the daily count
 * classes by.
 *
 * A well-formed suppression carries a reason (at least three latin words or
 * six han characters, ESLint's `-- <reason>` counted in) and a node id in
 * square brackets matching the graph's ID_PATTERN, one that exists in the
 * project graph when the graph was readable. Facts that were unknown pass
 * the call without a record: an unknown must never turn into a denial
 * (design §4.1). Not requestable: the way out is the correction's right
 * path — fix the finding, or write the reason and the node.
 */
import { ID_PATTERN } from '../graph/schema.ts'
import { countMarkers } from '../env/suppressions.ts'
import { fileToolTargetOf, type Correction, type GuardRule, type RuleVerdict, type ToolCall } from './rules.ts'
import type { RuleContext } from './context.ts'

const NODE_BRACKET = /\[([a-z][a-z0-9-]{0,47})\]/

const correctionOf = (marker: string): Correction => ({
  fact: `You added \`${marker}\` without a reason and a graph node.`,
  violation: 'New suppressions need a reason and a node id on the same line.',
  rightPath: 'Fix the finding instead; if the suppression is right, add `-- <why> [<node id>]` (ESLint) or a reason and `[<node id>]` after the marker.',
  exception: 'If no node fits, propose one with graph_propose first.',
})

const ALLOW: RuleVerdict = { kind: 'allow' }

/** The new text of one write, with the old text the call itself carries (edit and str_replace_editor); `create` and `write` take theirs from the context (design §4.3). */
function addedTextOf(call: ToolCall): { readonly added: string, readonly removed?: string } | undefined {
  const args = typeof call.arguments === 'object' && call.arguments !== null && !Array.isArray(call.arguments) ? call.arguments as Record<string, unknown> : undefined
  if (args === undefined) return undefined
  const text = (name: string): string | undefined => typeof args[name] === 'string' ? args[name] : undefined
  if (call.name === 'edit') {
    const added = text('new_string')
    const removed = text('old_string')
    return added !== undefined && removed !== undefined ? { added, removed } : undefined
  }
  if (call.name === 'str_replace_editor') {
    if (args.command === 'create') return text('file_text') !== undefined ? { added: text('file_text') as string } : undefined
    const added = text('new_str')
    const removed = text('old_str')
    return added !== undefined && removed !== undefined ? { added, removed } : undefined
  }
  if (call.name === 'write') return text('content') !== undefined ? { added: text('content') as string } : undefined
  return undefined
}

/** The lines the added occurrences of one marker sit on, reading from the end: appends are the common case. */
function addedLines(text: string, marker: string, count: number): readonly string[] {
  const lines = text.split(/\r?\n/)
  const found: string[] = []
  for (let index = lines.length - 1; index >= 0 && found.length < count; index--) {
    let at = lines[index].indexOf(marker)
    while (at >= 0 && found.length < count) {
      found.push(lines[index])
      at = lines[index].indexOf(marker, at + 1)
    }
  }
  return found
}

/** Whether one line carries a reason after the marker (at least three latin words or six han characters) and a node id that exists when the graph was readable. */
function lineQualifies(line: string, marker: string, nodeIds: ReadonlySet<string> | undefined): boolean {
  const tail = line.slice(line.indexOf(marker) + marker.length)
  // ESLint's own description syntax counts in: strip the leading `--`.
  const prose = tail.replace(/^\s*--/, '')
  const node = NODE_BRACKET.exec(prose)?.[1]
  if (node === undefined) return false
  const withoutNode = prose.replace(NODE_BRACKET, ' ')
  const words = withoutNode.match(/[A-Za-z0-9'’-]+/g) ?? []
  const han = withoutNode.match(/[\u4e00-\u9fff]/g) ?? []
  if (words.length < 3 && han.length < 6) return false
  if (!ID_PATTERN.test(node)) return false
  // A graph that could not be read does not deny: only a known table can say the node is missing (design §4.1).
  return nodeIds === undefined || nodeIds.has(node)
}

/** The rule over one call's prepared context (design §4.1). */
export function suppressionOnly(context: RuleContext): GuardRule {
  return {
    id: 'suppression-reason',
    detect(call) {
      if (fileToolTargetOf(call) === undefined) return ALLOW
      const texts = addedTextOf(call)
      if (texts === undefined) return ALLOW
      // The old text: the call's own for edit and str_replace_editor, the
      // target's old content from the context for create and write — known
      // whenever the target existed and was readable (`''` when new); an
      // unknown passes the call (design §4.1).
      const removed = texts.removed ?? context.oldContent
      if (removed === undefined) return ALLOW
      const before = countMarkers(removed)
      const after = countMarkers(texts.added)
      for (const [marker, grown] of Object.entries(after)) {
        const old = before[marker] ?? 0
        if (grown <= old) continue
        for (const line of addedLines(texts.added, marker, grown - old)) {
          if (!lineQualifies(line, marker, context.nodeIds)) return { kind: 'deny', rule: 'suppression-reason', correction: correctionOf(marker) }
        }
      }
      return ALLOW
    },
  }
}
