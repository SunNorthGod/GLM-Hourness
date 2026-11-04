/**
 * Deferred-tool search, ported from ZCode 3.16.3 (bundle `searchTools`,
 * `tokenize`, `resolveName`; same algorithm as the 3.16.2 source
 * core/src/tool/search/search.ts).
 *
 * `select:a,b` resolves exact names and aliases (deferred first, then the
 * whole catalog, then MCP raw tool names); a query equal to one tool name
 * returns it; an `mcp__` prefix lists that server's deferred tools; otherwise
 * deferred tools are scored on name parts, MCP server/tool parts, the search
 * hint and the description, with `+term` marking required terms.
 */

/** One tool as the search sees it (ZCode `ToolSearchCandidate`). */
export interface ToolSearchCandidate {
  readonly name: string
  readonly aliases?: readonly string[]
  /** MCP presentation. DSH publishes MCP tools as `mcp__<server>__<tool>` without metadata, so it is derived from the name. */
  readonly mcp?: { readonly serverName: string, readonly toolName: string }
  readonly description?: string
  readonly searchHint?: string
  readonly deferred: boolean
}

const MCP_NAME = /^mcp__(.+?)__(.+)$/

/** Derive the MCP presentation ZCode keeps as metadata from a DSH MCP tool name. */
export function mcpPresentation(name: string): ToolSearchCandidate['mcp'] {
  const match = MCP_NAME.exec(name)
  return match === null ? undefined : { serverName: match[1], toolName: match[2] }
}

function tokenize(tool: ToolSearchCandidate): { coarse: string[], parts: string[], full: string, mcp: boolean } {
  const name = tool.name
  const mcp = tool.mcp !== undefined ? [name, tool.mcp.serverName, tool.mcp.toolName] : MCP_NAME.exec(name)
  const coarse = mcp !== null ? [mcp[1], mcp[2]].map(part => part.toLowerCase()) : [name.toLowerCase()]
  const parts = mcp !== null
    ? coarse.flatMap(part => part.split(/[\s_.]+/)).filter(Boolean)
    : name.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase().split(/\s+/).filter(Boolean)
  return { coarse, parts, full: parts.join(' '), mcp: mcp !== null }
}

function resolveName(name: string, catalog: readonly ToolSearchCandidate[]): ToolSearchCandidate | undefined {
  return catalog.find(tool => tool.name === name || tool.aliases?.includes(name) === true)
}

/**
 * Search the catalog. Returns tool names in result order; `maxResults` caps
 * keyword and prefix results only (direct selection is uncapped).
 */
export function searchTools(query: string, catalog: readonly ToolSearchCandidate[], maxResults = 5): string[] {
  const deferred = catalog.filter(tool => tool.deferred)
  const select = /^select:(.+)$/i.exec(query)
  if (select !== null) {
    return [...new Set(select[1].split(',').flatMap((value) => {
      const name = value.trim()
      const exact = resolveName(name, deferred) ?? resolveName(name, catalog)
      if (exact !== undefined) return [exact.name]
      // ZCode also compares the model-visible form of the raw MCP name; the
      // part derived from a DSH public name is already that form.
      return catalog
        .filter(tool => tool.mcp !== undefined && tool.mcp.toolName === name)
        .map(tool => tool.name)
    }))]
  }
  const text = query.toLowerCase().trim()
  const exact = deferred.find(tool => tool.name.toLowerCase() === text) ?? catalog.find(tool => tool.name.toLowerCase() === text)
  if (exact !== undefined) return [exact.name]
  if (text.startsWith('mcp__') && text.length > 5) {
    const names = deferred.filter(tool => tool.name.toLowerCase().startsWith(text)).slice(0, maxResults).map(tool => tool.name)
    if (names.length > 0) return names
  }
  const terms = text.split(/\s+/).filter(Boolean)
  const required = terms.filter(term => term.startsWith('+') && term.length > 1).map(term => term.slice(1))
  const keywords = required.length > 0 ? [...required, ...terms.filter(term => !(term.startsWith('+') && term.length > 1))] : terms
  const patterns = new Map(keywords.map(term => [term, new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)]))
  return deferred
    .map((tool) => {
      const name = tokenize(tool)
      const description = tool.description?.toLowerCase() ?? ''
      const hint = tool.searchHint?.toLowerCase() ?? ''
      const matches = (term: string): boolean => name.parts.some(part => part.includes(term))
        || name.coarse.some(part => part.includes(term))
        || patterns.get(term)!.test(description)
        || patterns.get(term)!.test(hint)
      if (!required.every(matches)) return { name: tool.name, score: 0 }
      let score = 0
      for (const term of keywords) {
        if (name.parts.includes(term)) score += name.mcp ? 12 : 10
        else if (name.parts.some(part => part.includes(term))) score += name.mcp ? 6 : 5
        if (name.coarse.includes(term)) score += name.mcp ? 12 : 10
        else if (name.coarse.some(part => part.includes(term))) score += name.mcp ? 4 : 3
        if (name.full.includes(term) && score === 0) score += 3
        if (hint.length > 0 && patterns.get(term)!.test(hint)) score += 4
        if (patterns.get(term)!.test(description)) score += 2
      }
      return { name: tool.name, score }
    })
    .filter(tool => tool.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(tool => tool.name)
}
