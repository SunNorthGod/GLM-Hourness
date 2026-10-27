/**
 * ToolSearch query and rendering (pure). Dialect baseline: the 3.16.3
 * protocol capture (docs/02 §8): `select:<name>[,<name>...]` picks exact
 * names, plain queries match keywords against name + description, no regex;
 * each match renders as one `<function>{"description":…,"name":…,"parameters":…}</function>`
 * line inside a `<functions>` block.
 */

export interface DeferredToolEntry {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
}

export interface ToolSearchArgs {
  readonly query: string
  readonly max_results?: number
}

export interface ToolSearchOutcome {
  /** Matched tools in relevance order, at most `max_results`. */
  readonly matches: DeferredToolEntry[]
  readonly total: number
}

const SELECT_PREFIX = 'select:'

/** Keyword score: name hits outweigh description hits; ties keep catalog order. */
function score(entry: DeferredToolEntry, terms: readonly string[]): number {
  const name = entry.name.toLowerCase()
  const description = entry.description.toLowerCase()
  let points = 0
  for (const term of terms) {
    if (name.includes(term)) points += 2
    else if (description.includes(term)) points += 1
  }
  return points
}

/** Search the deferred catalog for one query. */
export function searchTools(catalog: readonly DeferredToolEntry[], args: ToolSearchArgs): ToolSearchOutcome {
  const limit = args.max_results === undefined || args.max_results <= 0 ? 5 : args.max_results
  const query = args.query.trim()
  if (query.startsWith(SELECT_PREFIX)) {
    // Baseline behavior (ZCode tool-search-result-budget test): `select:`
    // direct picks are NOT capped by max_results; only keyword search is.
    const wanted = query.slice(SELECT_PREFIX.length).split(',').map(name => name.trim()).filter(name => name.length > 0)
    const matches = catalog.filter(entry => wanted.includes(entry.name))
    return { matches, total: catalog.length }
  }
  const terms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0)
  if (terms.length === 0) return { matches: [], total: catalog.length }
  const ranked = catalog
    .map(entry => ({ entry, points: score(entry, terms) }))
    .filter(candidate => candidate.points > 0)
    .sort((a, b) => b.points - a.points)
    .map(candidate => candidate.entry)
  return { matches: ranked.slice(0, limit), total: catalog.length }
}

/** Render matched tools as the 3.16.3 `<functions>` block (one line each). */
export function renderFunctionsBlock(matches: readonly DeferredToolEntry[]): string {
  const lines = matches.map(entry => `<function>${JSON.stringify({ description: entry.description, name: entry.name, parameters: entry.parameters })}</function>`)
  return ['<functions>', ...lines, '</functions>'].join('\n')
}
