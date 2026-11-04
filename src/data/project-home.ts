/**
 * The project home of one session (m4-gate G1, design §2.4): the row's own
 * `home` first (probes, tests, an explicit setting), then the `.llm` of the
 * project the session's working directory is in (src/data/project-root.ts
 * projectOf, the one project-root module), then the data service's project
 * directory, else nothing — the row health says so and the call is not
 * recorded, but nothing else changes. It lives in src/data/ rather than
 * src/shared/ because the project root is this directory's module and the
 * boundary rule keeps src/shared/ out of package directories; the journal
 * readers (guard row, graph row, /hourness) import it from here.
 */
import { projectOf } from './project-root.ts'
import { dataService } from '../shared/data-home.ts'
import type { ServiceLookup } from '../shared/dsh-min.ts'

/** The project root of a working directory, or undefined without a working directory (projectOf needs one). */
export function projectRootOf(cwd: string | undefined): string | undefined {
  return cwd === undefined || cwd.length === 0 ? undefined : projectOf(cwd)?.root
}

/** The `.llm` directory of the project a working directory belongs to, resolved in the order the design fixes; undefined when none of the three has one. */
export function projectHomeFor(ctx: ServiceLookup, configHome: string | undefined, cwd: string | undefined): string | undefined {
  if (configHome !== undefined && configHome.length > 0) return configHome
  const root = projectRootOf(cwd)
  if (root !== undefined) return `${root.replace(/[\\/]+$/, '')}/.llm`
  return dataService(ctx)?.projectHome
}
