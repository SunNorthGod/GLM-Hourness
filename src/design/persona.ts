/**
 * The persona of the main agent (docs/ORCHESTRATION.md §3.1; task
 * m3-main-persona): one setting of the design row, `persona: {name, text}`,
 * that the person writes in the plugin manager. The plugin ships no persona;
 * `text` is the person's own configuration (docs/CHARTER.md §9: persona and
 * speaking style stay out of the plugin). It becomes a system prompt section
 * for the main agent only, so what the person's persona says never reaches the code, comments
 * and commit messages of an ordinary session or a subagent.
 *
 * The section reads as ZCode 3.17.1 builds an output style (`n8o`, pristine
 * reference/zcode-3.17.1/zcode.cjs): `# Output Style: <name>`, one newline, the
 * style text without its surrounding whitespace, no blank line between. The
 * one sentence after it is this project's, not ZCode's (docs/reference/
 * zcode-verbatim.md, 「不跟 3.17.1 的地方」).
 */
import type { AssembledSection } from '../shared/dsh-min.ts'
import { OUTPUT_STYLE_SECTION } from '../shared/output-style.ts'

/** The name of the persona when the setting has none. */
export const DEFAULT_PERSONA_NAME = '主 Agent'

/** The longest name, in code points; a longer one is cut. */
export const PERSONA_NAME_LIMIT = 40

/** The longest text, in code points, measured after its surrounding whitespace is removed; a longer one is not added. */
export const PERSONA_TEXT_LIMIT = 4000

/** The sentence after the person's text: the persona governs what the main agent says to the human, nothing it writes into a tool call or a file. */
export const PERSONA_SCOPE = 'This style applies to your replies to the human only. Text you put into tool calls (graph nodes, briefs for subagents) and anything written to files stays plain.'

/** What the row health says when the text is too long. */
export const PERSONA_TOO_LONG = '人设超过 4000 字符，没有加'

const NOT_TEXT = '人设的 text 不是文字，没有加'
const NOT_OBJECT = '人设设置不是 {name, text} 的形状，没有加'

/** What the setting comes to. */
export interface PersonaReading {
  /** The section to add to the main agent's assembly; undefined when there is no persona to add. */
  readonly section: AssembledSection | undefined
  /** Why a persona the person wrote is not added (row health, degraded); undefined when nothing is wrong. */
  readonly problem: string | undefined
  /** What to log once at activation. */
  readonly warnings: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const codePoints = (text: string): number => Array.from(text).length

/** The text of the section: the heading line, the person's text, a blank line, the scope sentence. */
function outputStyleText(name: string, text: string): string {
  return `# Output Style: ${name}\n${text}\n\n${PERSONA_SCOPE}`
}

/**
 * Read the design row's configuration. Never throws: what cannot be read
 * counts as no persona, with the reason in `problem` and `warnings`.
 * `config` is the row's configuration as the loader hands it over (the
 * `Config` schema of src/design/index.ts has filled the defaults), or
 * anything a test or another host passes.
 */
export function readPersona(config: unknown): PersonaReading {
  const none = (problem: string | undefined, warnings: readonly string[]): PersonaReading => ({ section: undefined, problem, warnings })
  const persona = isRecord(config) ? config.persona : undefined
  if (persona === undefined || persona === null) return none(undefined, [])
  if (!isRecord(persona)) return none(NOT_OBJECT, ['persona is not an object with name and text; no persona is added'])
  const { text: rawText, name: rawName } = persona
  if (rawText === undefined || rawText === null) return none(undefined, [])
  if (typeof rawText !== 'string') return none(NOT_TEXT, ['persona.text is not a string; no persona is added'])
  const text = rawText.trim()
  if (text.length === 0) return none(undefined, [])
  if (codePoints(text) > PERSONA_TEXT_LIMIT) return none(PERSONA_TOO_LONG, [`persona.text is longer than ${PERSONA_TEXT_LIMIT} characters; no persona is added`])
  const warnings: string[] = []
  let name = DEFAULT_PERSONA_NAME
  if (typeof rawName === 'string') {
    const oneLine = rawName.trim().replace(/\s+/g, ' ')
    const kept = Array.from(oneLine)
    if (kept.length > PERSONA_NAME_LIMIT) {
      warnings.push(`persona.name is longer than ${PERSONA_NAME_LIMIT} characters; it is cut to ${PERSONA_NAME_LIMIT}`)
      name = kept.slice(0, PERSONA_NAME_LIMIT).join('')
    }
    else if (oneLine.length > 0) name = oneLine
  }
  else if (rawName !== undefined && rawName !== null) warnings.push(`persona.name is not a string; the name ${DEFAULT_PERSONA_NAME} is used`)
  return { section: { name: OUTPUT_STYLE_SECTION, text: outputStyleText(name, text), interpolate: false }, problem: undefined, warnings }
}
