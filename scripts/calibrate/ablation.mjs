/**
 * Ablation switch of a calibration run (docs/ORCHESTRATION.md §10.5.1,
 * project graph node `ablation`, plan in .agents/tasks/ablation/plan.md): an
 * overlay-only plugin row that scripts/calibrate/run-calibrate.mjs inserts
 * for a run of an arm other than A0. Each arm changes one piece of the text
 * the GLM route injects:
 *
 * - A1: drop the `# Reporting Depth` section (`glm:reporting-depth`);
 * - A2: shorten the `# Workspace rules` section (`glm:guard`) to one general
 *   sentence; the guard's judgment is unchanged;
 * - A3: the 15 graph tools and the 3 memory tools are deferred behind GLM
 *   tool search instead of resident;
 * - A4: drop ZCode's Dynamic Behavior (`glm:dynamic-behavior`);
 * - A5: drop DSH's `tool:read`, `tool:write`, `tool:edit`, `tool:glob` and
 *   `tool:grep` sections.
 *
 * A1, A2, A4 and A5 rewrite the system prompt of every model request at
 * `llm/stream` (global, prepend): the leading system messages, and the
 * `system` text of a one-shot call. The sections of the rendered prompt are
 * joined by a blank line and these sections have none inside, so they are
 * found as whole paragraphs. A request that needs a change is copied, the
 * copy marked, and the copy dispatched through the full waterfall (the way
 * src/glm-prompt/compact-row.ts does it); a request that needs none goes on
 * unchanged, so two rows that re-dispatch never loop. The assemble waterfall
 * is not used because the order in which rows activate does not follow the
 * configuration (M3 design §3.1.3), and an assemble listener needs to be
 * outermost to see the dialect's sections.
 *
 * A3 takes the names out of the GLM tool search's resident set
 * (packages/glm/dist/toolsearch/exposure.js `RESIDENT_TOOLS`, the module the
 * runtime loaded through the profile's link) on activation and puts them
 * back on disposal.
 *
 * Every request rewritten or looked at is one JSON line in `record`
 * (`removed` and `replaced` paragraphs); A3 writes one line on activation.
 * Not part of the bundle.
 */
import { appendFileSync } from 'node:fs'
import { RESIDENT_TOOLS } from '../../packages/glm/dist/toolsearch/exposure.js'
import { DYNAMIC_BEHAVIOR } from '../../packages/glm/dist/glm-prompt/verbatim.js'
import { GRAPH_TOOL_NAMES, MEMORY_TOOL_NAMES } from '../../packages/glm/dist/shared/tool-names.js'
import { WORKSPACE_RULES_TEXT } from '../../packages/hourness/dist/guard/sections.js'

export const name = 'glm-hourness-calibrate/ablation'
export const inject = ['llm']

/** The arms; A0 is the unchanged prompt and needs no row. */
export const ARMS = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5']

/** The one sentence A2 leaves of the workspace rules (prompt-audit report §7 item 5): the production text since the arm was adopted (DESIGN.md §5.2a), so the arm rewrites nothing on an adopted prompt. */
export const WORKSPACE_RULES_SHORT = WORKSPACE_RULES_TEXT

/** The tools A3 defers. */
export const DEFERRED_BY_A3 = [...GRAPH_TOOL_NAMES, ...MEMORY_TOOL_NAMES]

/** Openings of DSH's five file-tool sections that the ZCode aliases cover (A5). */
const DSH_FILE_TOOL_SECTIONS = [
  'Use the read tool',
  'Read an existing file before overwriting it with write',
  'Read a file before editing it',
  'Use the glob tool',
  'Use the grep tool',
]

/**
 * What an arm does to one paragraph of the system prompt: `undefined` keeps
 * it, `null` drops it, a string replaces it.
 */
export function paragraphRule(arm) {
  switch (arm) {
    case 'A1': return text => text.startsWith('# Reporting Depth\n') ? null : undefined
    case 'A2': return text => text.startsWith('# Workspace rules\n') ? WORKSPACE_RULES_SHORT : undefined
    case 'A4': return text => text === DYNAMIC_BEHAVIOR ? null : undefined
    case 'A5': return text => DSH_FILE_TOOL_SECTIONS.some(opening => text.startsWith(opening)) ? null : undefined
    default: return undefined
  }
}

/** Rewrite one system text by paragraphs; the new text and the counts. */
export function rewriteText(text, rule) {
  let removed = 0
  let replaced = 0
  const out = []
  for (const paragraph of text.split('\n\n')) {
    const verdict = rule(paragraph)
    if (verdict === undefined) out.push(paragraph)
    else if (verdict === null) removed += 1
    else {
      if (verdict !== paragraph) replaced += 1
      out.push(verdict)
    }
  }
  return { text: out.join('\n\n'), removed, replaced }
}

/** The rewritten copy of one request, or undefined when the arm changes nothing in it; with the counts. */
export function rewriteRequest(options, rule) {
  let removed = 0
  let replaced = 0
  const take = (text) => {
    const result = rewriteText(text, rule)
    removed += result.removed
    replaced += result.replaced
    return result.text
  }
  const system = typeof options.system === 'string' ? take(options.system) : undefined
  const messages = [...options.messages]
  for (let index = 0; index < messages.length && messages[index]?.role === 'system'; index += 1) {
    const message = messages[index]
    const content = (message.content ?? [])
      .map(block => block.type === 'text' && typeof block.text === 'string' ? { ...block, text: take(block.text) } : block)
      .filter(block => block.type !== 'text' || block.text.length > 0)
    messages[index] = { ...message, content }
  }
  const counts = { removed, replaced }
  if (removed + replaced === 0) return { copy: undefined, counts }
  return { copy: { ...options, ...(system === undefined ? {} : { system }), messages: messages.filter(message => message.role !== 'system' || message.content.length > 0) }, counts }
}

export function apply(ctx, config = {}) {
  const arm = config.arm
  const note = (entry) => {
    if (typeof config.record === 'string') appendFileSync(config.record, `${JSON.stringify({ at: new Date().toISOString(), arm, ...entry })}\n`)
  }
  if (!ARMS.includes(arm) || arm === 'A0') {
    console.warn(`calibrate ablation: arm ${JSON.stringify(arm)} changes nothing; the row does nothing`)
    return () => {}
  }
  if (arm === 'A3') {
    const resident = RESIDENT_TOOLS
    const taken = DEFERRED_BY_A3.filter(tool => resident.delete(tool))
    note({ kind: 'deferred', names: taken })
    return () => taken.forEach(tool => resident.add(tool))
  }
  const rule = paragraphRule(arm)
  const copies = new WeakSet()
  return ctx.on('llm/stream', (options, next) => {
    if (copies.has(options)) return next()
    const { copy, counts } = rewriteRequest(options, rule)
    note({ kind: 'request', purpose: options.purpose ?? null, sessionId: options.sessionId ?? null, ...counts })
    if (copy === undefined) return next()
    copies.add(copy)
    return ctx.llm.stream(copy)
  }, { global: true, prepend: true })
}
