/**
 * The configuration stamp of a calibration run (docs/ORCHESTRATION.md
 * §10.5.1; reading-digest 2026-11-20 ②): the profile's row composition an
 * overlay patch leaves in force, as data the batch's results.json and every
 * run's result.json carry, so a comparison refuses across configurations.
 *
 * Pure functions; the patch text is the one the runner writes
 * (`calibrate.patch.yml` / the probe's patch rows), so the stamp is exactly
 * what the run booted with.
 */

/**
 * The rows of an overlay patch: every `- id: <row>` line with the
 * `disabled: <bool>` line that follows it when there is one (a row without
 * one is enabled). Inserted rows (`- insert:`) are indented one step deeper;
 * their ids are stamped the same way. One row is `{id, enabled}`.
 * @param {string} patchText the overlay patch as the runner wrote it
 * @returns {Array<{id: string, enabled: boolean}>}
 */
export function profileStampOf(patchText) {
  const rows = []
  for (const line of patchText.split('\n')) {
    const id = /^\s*-\s+id:\s*(\S+)\s*$/.exec(line)?.[1]
    if (id !== undefined) {
      rows.push({ id, enabled: true })
      continue
    }
    const disabled = /^\s*disabled:\s*(true|false)\s*$/.exec(line)?.[1]
    if (disabled !== undefined && rows.length > 0) {
      const last = rows[rows.length - 1]
      rows[rows.length - 1] = { id: last.id, enabled: disabled === 'false' }
    }
  }
  return rows
}

/**
 * The configuration of one batch's results.json, as the comparison reads it:
 * the commit and its dirtiness, what was run, and the row stamp. Fields an
 * older batch never wrote read as `null`, so a comparison against one
 * refuses on every difference it cannot vouch for.
 * @param {Record<string, unknown>} results a parsed results.json
 * @returns {Record<string, unknown>}
 */
export function configOf(results) {
  const options = typeof results.options === 'object' && results.options !== null ? results.options : {}
  return {
    commit: results.commit ?? null,
    dirty: results.dirty ?? null,
    arm: options.arm ?? null,
    permission: options.permission ?? null,
    tasks: [...(Array.isArray(options.tasks) ? options.tasks : [])].sort(),
    models: [...(Array.isArray(options.models) ? options.models : [])].sort(),
    repeat: options.repeat ?? null,
    bounds: options.bounds ?? null,
    rows: Array.isArray(results.profile?.rows) ? results.profile.rows : null,
  }
}

/** One difference the comparison refuses on, with both sides in it. */
const field = (key, a, b) => `${key}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`

/**
 * The differences that make two batches incomparable (reading-digest
 * 2026-11-20 ②): every key of the configuration that differs, the row stamp
 * compared by id regardless of order. An empty list means the two stand on
 * the same configuration and their numbers may be laid side by side.
 * @param {Record<string, unknown>} a configOf of one batch
 * @param {Record<string, unknown>} b configOf of the other
 * @returns {readonly string[]}
 */
export function configDiff(a, b) {
  const differences = []
  for (const key of ['commit', 'dirty', 'arm', 'permission', 'repeat', 'bounds']) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) differences.push(field(key, a[key], b[key]))
  }
  for (const key of ['tasks', 'models']) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) differences.push(field(key, a[key], b[key]))
  }
  const rowsOf = rows => Array.isArray(rows) ? [...rows].sort((x, y) => String(x.id).localeCompare(String(y.id))) : null
  if (JSON.stringify(rowsOf(a.rows)) !== JSON.stringify(rowsOf(b.rows))) differences.push(field('rows (profile 行组合)', a.rows, b.rows))
  return differences
}
