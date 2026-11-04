/**
 * Fixtures the metrics specs share: the checker's clean findings and a
 * scratch git project (tests/metrics-calc.spec.ts, tests/metrics-row.spec.ts,
 * tests/metrics-board.spec.ts).
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import type { LogFindings } from '../src/metrics/read.ts'

/** The checker's answer over nothing, for inputs that need a `findings`. */
export function emptyFindings(): LogFindings {
  return {
    events: 0,
    unreadable: [],
    missing: [],
    chainBreaks: [],
    noStop: [],
    clockRollbacks: [],
    duplicates: 0,
    lostFiles: [] as readonly string[],
    forgeries: [],
    bytes: 0,
  }
}

/** A fresh git repository in the temp dir, its root returned. */
export function scratchGitProject(prefix: string): string {
  const root = join(mkdtempSync(join(tmpdir(), prefix)), 'ws')
  mkdirSync(root, { recursive: true })
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: root }).status, 0)
  return root
}
