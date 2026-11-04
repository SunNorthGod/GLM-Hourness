/**
 * The session projection `hournessRules` (docs/ORCHESTRATION.md §16.14): where
 * the rules page finds the page data of the session's project. The page does
 * not call the host; it reads `<project root>/.llm/rules/view.json` (view.ts)
 * from the path the projection gives, and watches it. The state is made when
 * the session starts, from the working directory in its header, and no event
 * of the session changes it; a session without a working directory, or one
 * outside a git project, has `null` for both. The unit is the loop board's
 * (src/loops/projection.ts) over the rules board's file.
 */
import { viewFileProjection } from '../loops/projection.ts'
import { rulesPaths } from './store.ts'

export const RULES_KEY = 'hournessRules'

export const rulesProjection = viewFileProjection(RULES_KEY, 'rules', root => rulesPaths(root).view)
