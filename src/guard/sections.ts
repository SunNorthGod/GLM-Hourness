/**
 * Where the orchestration rows put their system prompt sections (docs/DESIGN.md
 * §5.2, split design B5): the names starting with `hourness:` are the
 * orchestration package's, added on every route. Pure functions; the guard's
 * declaration listener, the design row's identity section and, later, the
 * bootstrap's project rules section share them.
 */
import type { AssembledSection } from '../shared/dsh-min.ts'

/** The name of the system prompt section that declares the active rules. */
export const DECLARATION_SECTION = 'glm:guard'

/**
 * Add an orchestration section to an assembly's sections: before the guard's
 * declaration section when there is one, else last. A section of the same
 * name already present is replaced where it stands, so installing a listener
 * twice never doubles the section.
 */
export function insertHournessSection(sections: readonly AssembledSection[], section: AssembledSection): AssembledSection[] {
  const existing = sections.findIndex(entry => entry.name === section.name)
  if (existing >= 0) return sections.map((entry, index) => index === existing ? section : entry)
  const declaration = sections.findIndex(entry => entry.name === DECLARATION_SECTION)
  return declaration < 0 ? [...sections, section] : [...sections.slice(0, declaration), section, ...sections.slice(declaration)]
}
