/**
 * The onboarding state of the orchestration package's client (plain-ui
 * 1.3 §6.4, §6.5, §6.8): the local records in window.localStorage, the
 * first-visit rule one pure function answers, and the graph check it
 * takes. The guide page, the 「第一次用？」 line and the no-graph card
 * all ask here, never deciding on their own. No React, no Node
 * built-ins: the specs run it under Node.
 */
import type { LoadedGraph } from '../../../src/graph/parse.ts'

/** When the guide page was last seen (§6.8); its presence ends the first visit. */
export const GUIDE_KEY = 'glm-hourness.onboarding.hourness.v1'

/** Per workspace, when the no-graph card was last shown (§6.6, §6.8). */
const NOGRAPH_KEY = 'glm-hourness.nograph.v1'

/**
 * The first-visit rule (§6.4, §6.5), pure: true when this machine has no
 * record of the guide page having been seen and the graph carries no
 * human-actor history. The history check keeps today's users - whose
 * early panels wrote `actor: 'human'` entries - undisturbed, without
 * blocking new users; a relayed `llm` entry does not count, and neither
 * does anything else the panel no longer writes.
 */
export function firstVisit(storage: Storage | undefined, graphHasHumanActorHistory: boolean): boolean {
  if (graphHasHumanActorHistory) return false
  return readStamp(storage, GUIDE_KEY) === undefined
}

/** Whether any node's history has a `human` actor entry (the upgrade check of §6.4). */
export function graphHasHumanActorHistory(graph: LoadedGraph): boolean {
  for (const node of graph.nodes.values()) {
    if (node.history.some(entry => entry.actor === 'human')) return true
  }
  return false
}

/** A record's ISO stamp, or undefined; a broken read stays quiet (§6.8). */
export function readStamp(storage: Storage | undefined, key: string): string | undefined {
  try {
    const value = storage?.getItem(key)
    return typeof value === 'string' && value !== '' ? value : undefined
  }
  catch {
    return undefined
  }
}

/** Write a record's ISO stamp; a broken storage stays quiet (§6.8). */
export function writeStamp(storage: Storage | undefined, key: string, at: string): void {
  try {
    storage?.setItem(key, at)
  }
  catch {
    // the record is best effort
  }
}

/** The per-workspace key of the no-graph record: the cwd, lower case, forward slashes (§6.8). */
export function noGraphKey(workspacePath: string): string {
  return `${NOGRAPH_KEY}:${workspacePath.replaceAll('\\', '/').toLowerCase()}`
}
