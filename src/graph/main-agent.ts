/**
 * The main-agent session projection as its readers see it
 * (docs/ORCHESTRATION.md §3.1): the projection key and view, and whether a
 * table of projection values says the session is in main-agent mode. The
 * design row registers the projection; the graph panel row and the DSH
 * client read it through this module, so neither imports the design row.
 * No Node built-ins.
 */

/** Session projection key of main-agent mode, set and cleared by /wish. */
export const MAIN_AGENT_KEY = 'hournessMainAgent'

/** The wire view of the projection. */
export interface MainAgentView {
  readonly active: boolean
}

/**
 * Whether a table of projection values (a host snapshot's values, or the
 * client's projectionsBySession[id].values) has main-agent mode on. False
 * when the table or the value is missing or the value has another shape.
 */
export function mainAgentActive(values: Readonly<Record<string, unknown>> | undefined): boolean {
  const view = values?.[MAIN_AGENT_KEY]
  return typeof view === 'object' && view !== null && (view as Partial<MainAgentView>).active === true
}
