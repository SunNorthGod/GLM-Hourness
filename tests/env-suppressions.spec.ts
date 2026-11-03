/**
 * The daily suppression-comment count (src/env/suppressions.ts) and the
 * morning-report line (src/workflow/morning-report.ts): what counts on a
 * real repository, what is skipped (untracked, oversized, binary), the
 * once-per-repository-and-day gate, and the 「压制注释 N 处（本期 +a / −b）」
 * line over a period.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { countMarkers, countRepository, dailySuppressions, suppressionDay, type SuppressionRecord } from '../src/env/suppressions.ts'
import { morningReport, suppressionLineOf, type ReportInput } from '../src/workflow/morning-report.ts'

function git(dir: string, args: readonly string[]): void {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@localhost', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'ignore' })
}

test('countMarkers classes by the longest marker first', () => {
  const counts = countMarkers('// eslint-disable-next-line require-await\n// eslint-disable-line x\nconst a = 1 // @ts-ignore\n# noqa\n')
  assert.deepEqual(counts, { 'eslint-disable-next-line': 1, 'eslint-disable-line': 1, '@ts-ignore': 1, '# noqa': 1 })
})

test('countRepository counts tracked text files; untracked, oversized and binary files stay out', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'env-supp-'))
  try {
    git(dir, ['init'])
    await mkdir(join(dir, 'src'), { recursive: true })
    await writeFile(join(dir, 'src', 'a.ts'), '// eslint-disable-next-line no-console\n// @ts-expect-error later\n')
    await writeFile(join(dir, 'big.ts'), `// eslint-disable x${'y'.repeat(1024 * 1024)}\n`)
    await writeFile(join(dir, 'bin.dat'), Buffer.from([0x00, 0x01, 0x02]))
    await writeFile(join(dir, 'untracked.py'), '# type: ignore\n')
    git(dir, ['add', 'src/a.ts', 'big.ts', 'bin.dat'])
    const record = await countRepository(dir, { readFile })
    assert.equal(record.total, 2)
    assert.deepEqual(record.byMarker, { 'eslint-disable-next-line': 1, '@ts-expect-error': 1 })
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the day key is the UTC+8 calendar day', () => {
  assert.equal(suppressionDay(new Date('2026-11-01T16:30:00Z')), '2026-11-02')
  assert.equal(suppressionDay(new Date('2026-11-01T15:59:00Z')), '2026-11-01')
})

test('dailySuppressions appends once per repository and day; the journal of the same day skips the append', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'env-supp-day-'))
  try {
    git(dir, ['init'])
    await writeFile(join(dir, 'a.ts'), '// eslint-disable no-console\n')
    git(dir, ['add', 'a.ts'])
    const writes: SuppressionRecord[] = []
    const append = (record: SuppressionRecord): Promise<void> => { writes.push(record); return Promise.resolve() }
    const monday = { now: () => new Date('2026-11-02T01:00:00Z') }
    const first = await dailySuppressions(dir, append, monday)
    assert.equal(writes.length, 1)
    assert.equal(first?.total, 1)
    // The same process, the same day: nothing.
    assert.equal(await dailySuppressions(dir, append, monday), undefined)
    assert.equal(writes.length, 1)
    // A restart reads the journal: the same day still writes nothing.
    const journal = writes
    const restarted = await dailySuppressions(dir, append, { ...monday, lastRecord: () => journal.at(-1) })
    assert.equal(restarted, undefined)
    assert.equal(writes.length, 1)
    // The next day counts again.
    const tuesday = await dailySuppressions(dir, append, { now: () => new Date('2026-11-03T01:00:00Z'), lastRecord: () => journal.at(-1) })
    assert.equal(tuesday?.total, 1)
    assert.equal(writes.length, 2)
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
})

const input = (suppressions: SuppressionRecord[]): ReportInput => ({
  decisions: [], violations: [], usage: [], suppressions, period: '2026-11-02',
  asks: { waiting: { count: 0 }, agentOwn: 0, decided: { person: 0, inChat: 0, agent: 0 } },
})

test('the morning report carries the suppression line with the movement of the period', () => {
  const day = (total: number): SuppressionRecord => ({ at: '2026-11-02T00:00:00Z', repo: 'r', total, byMarker: {} })
  assert.equal(suppressionLineOf([]), undefined)
  assert.equal(suppressionLineOf([day(3)]), '压制注释 3 处')
  assert.equal(suppressionLineOf([day(3), day(5), day(2)]), '压制注释 2 处（本期 +2 / −3）')
  const report = morningReport(input([day(3), day(5)]))
  assert.ok(report.includes('压制注释 5 处（本期 +2 / −0）'), report)
  assert.ok(report.indexOf('压制注释') > report.indexOf('## 例外（先看）'), report)
  assert.ok(!morningReport(input([])).includes('压制注释'))
})
