/**
 * The persona section of the main agent, as the two packages agree on it
 * (docs/ORCHESTRATION.md §3.1, docs/DESIGN.md §5.2). The design row of the
 * orchestration package adds a system prompt section of this name to the main
 * agent's assembly when the person has set a persona; the dialect of the GLM
 * channel package recognizes the section by the name, gives the identity
 * section the opening sentence of an active output style and places the
 * section ahead of `glm:context-management`. A string no import rule sees, so
 * tests/contracts.spec.ts pins that the products of both packages carry the
 * same one.
 */
export const OUTPUT_STYLE_SECTION = 'hourness:output-style'
