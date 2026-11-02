/**
 * The loop board's storage (docs/ORCHESTRATION.md §18.7; loop board design §9.1
 * to §9.3, §11.2, §15 L2 storage): the entry files in the repository, the
 * change record, the note of what the board wrote and the lock in the
 * project's `.llm/loops/`, and what a read makes of the files when git, an
 * editor or a crash has changed them. Real files in real git repositories in
 * temporary directories: the damage it checks is what a branch switch, a
 * revert, a stash or a power cut leaves, so a fake file system would hide it.
 * The file also serves as the writer process of the concurrency case (`--writer`).
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { appendFile, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendJournal, openLoopStore } from '../src/loops/store.ts'
import { entryFileText } from '../src/loops/model.ts'
import { acquireLock } from '../src/data/lock.ts'
import { entryFileOf, gitProjectTest, namesIn, NOW, quickIo, recordsOf, scriptEntry, SCRIPT_TEXT, seedAgreed, sha256, statusOf, tellEntry, writeFiles, writtenNote } from './loops-helpers.ts'
import { impatientLock } from './rules-helpers.ts'

const WRITER = '--writer'

if (process.argv[2] === WRITER) {
  // The writer of the concurrency case: `count` records under the write lock, a retry when the lock is busy.
  const [root = '', count = '0'] = process.argv.slice(3)
  const store = openLoopStore(root)
  for (let index = 0; index < Number(count); index++) {
    for (;;) {
      const done = await store.locked(async () => {
        await appendJournal(store.paths, { seq: store.read().journal.nextSeq, at: new Date().toISOString(), actor: 'harness', op: 'ack', through: 0, note: `writer ${process.pid}` })
      })
      if (done !== 'busy') break
    }
  }
  process.exit(0)
}

const A = 'u-0a1b2c3d'
const B = 'u-4e5f6a7b'

/** The files under a project that git sees as changed or new, as `git status` lists them. */
const changes = (git: (...args: string[]) => string): string[] => git('status', '--porcelain', '--untracked-files=all').split('\n').filter(line => line !== '')

// ----------------------------------------------------------------- a new clone

gitProjectTest('a clone with entry files and no .llm/loops: an entry that only tells the main agent is taken in, one that runs a script is listed as not adopted, and git sees no change', async (project) => {
  await writeFiles(project.root, tellEntry(A), entryFileText(tellEntry(A)))
  await writeFiles(project.root, scriptEntry(B), entryFileText(scriptEntry(B)), SCRIPT_TEXT)
  project.commit('entries a teammate added')
  const before = project.store.read()
  assert.equal(before.fresh, true)
  assert.deepEqual(before.entries.map(entry => [entry.id, entry.status.kind]), [[A, 'unadopted'], [B, 'unadopted']], 'read alone takes nothing in')
  assert.equal(before.plan.adopt.length, 1)
  assert.equal(await namesIn(project.store.paths.runtimeDir).then(names => names.length), 0, 'a read writes nothing')

  const settled = await project.store.settle()
  assert.notEqual(settled, 'busy')
  assert.deepEqual(project.store.read().entries.map(entry => [entry.id, entry.status.kind]), [[A, 'ok'], [B, 'unadopted']])
  const records = await recordsOf(project)
  assert.deepEqual(records.map(record => [record.op, record.actor, record.id, record.via]), [['adopt', 'harness', A, 'repo']])
  assert.equal(records[0]?.after?.fileSha256, sha256(entryFileText(tellEntry(A))))
  assert.deepEqual(JSON.parse(await readFile(project.store.paths.repoWritten, 'utf8')), { [A]: { fileSha256: sha256(entryFileText(tellEntry(A))), at: new Date(NOW).toISOString() } }, 'the script entry has no note: nothing of it was written')
  assert.deepEqual(changes(project.git), [], 'the board changed nothing under docs/loops/ and .llm/ is ignored')
  assert.match(await readFile(join(project.root, '.git', 'info', 'exclude'), 'utf8'), /^\.llm\/$/m)
  assert.equal(await readFile(join(project.store.paths.runtimeDir, '.gitignore'), 'utf8'), '*\n')
  await project.store.settle()
  assert.equal((await recordsOf(project)).length, 1, 'a second read finds nothing to take in')
  assert.equal(project.store.read().fresh, false)
})

gitProjectTest('an entry file that does not match any record and cannot be read is listed as unreadable and is never taken in', async (project) => {
  await mkdir(join(project.root, 'docs', 'loops', 'entries'), { recursive: true })
  await writeFile(entryFileOf(project.root, A), '{"id": "u-0a1b2c3d", "title": ')
  await writeFile(entryFileOf(project.root, B), JSON.stringify({ ...tellEntry(B), id: A }))
  const entries = project.store.read().entries
  assert.deepEqual(entries.map(entry => [entry.id, entry.status.kind, entry.restorable]), [[A, 'unreadable', false], [B, 'unreadable', false]], 'the second names another id than its file does')
  await project.store.settle()
  assert.deepEqual(await recordsOf(project), [])
})

// ------------------------------------------------------- the file is damaged

for (const [label, damage] of [['cleared', ''], ['truncated', 'cut'], ['zero-filled', 'zeros']] as const) {
  gitProjectTest(`an entry file that is ${label} does not run, and /loops restore writes the version the person agreed to back, keeping the damaged file aside`, async (project) => {
    const entry = tellEntry(A)
    const text = entryFileText(entry)
    await seedAgreed(project, entry)
    project.commit('agreed')
    const damaged = damage === 'cut' ? text.slice(0, 90) : damage === 'zeros' ? '\0'.repeat(text.length) : ''
    await writeFile(entryFileOf(project.root, A), damaged)
    assert.equal(statusOf(project, A), 'unreadable')
    assert.equal(project.store.read().entries[0]?.restorable, true)
    await project.store.settle()
    assert.deepEqual((await recordsOf(project)).map(record => record.op), ['add'], 'an unreadable file is not noted as a change: there is nothing to pin')

    const result = await project.store.apply('human', { op: 'restore', entry: A })
    assert.deepEqual(result.ok && [result.title, result.file], ['每周五看一眼没合入的分支', 'written'])
    assert.equal(await readFile(entryFileOf(project.root, A), 'utf8'), text)
    assert.equal(statusOf(project, A), 'ok')
    const records = await recordsOf(project)
    assert.deepEqual(records.map(record => [record.op, record.actor, record.after?.rev, record.after?.status]), [['add', 'human', 1, 'active'], ['restore', 'human', 2, 'active']])
    assert.equal(records[1]?.before?.fileSha256, records[1]?.after?.fileSha256, 'the same bytes as the agreed ones')
    const aside = (await namesIn(project.store.paths.runtimeDir)).filter(name => name.startsWith(`.${A}.json.outside-`))
    assert.equal(aside.length, 1)
    assert.equal(await readFile(join(project.store.paths.runtimeDir, aside[0] ?? ''), 'utf8'), damaged)
    assert.deepEqual(changes(project.git), [], 'the file is as it was committed')
  })
}

gitProjectTest('restoring a script entry writes the script back as well, byte for byte, and checks it against the digest', async (project) => {
  const entry = scriptEntry(B)
  await seedAgreed(project, entry, { scriptText: SCRIPT_TEXT })
  project.commit('agreed')
  const scriptFile = join(project.root, 'docs', 'loops', 'scripts', `${B}.mjs`)
  await writeFile(entryFileOf(project.root, B), '')
  await rm(scriptFile)
  const result = await project.store.apply('human', { op: 'restore', entry: B })
  assert.equal(result.ok && result.file, 'written')
  assert.equal(await readFile(scriptFile, 'utf8'), SCRIPT_TEXT)
  assert.equal(sha256(await readFile(scriptFile, 'utf8')), entry.action.kind === 'script' ? entry.action.script.sha256 : '')
  assert.deepEqual(changes(project.git), [])
})

gitProjectTest('a record somebody appended is not written from: a script text that does not match its digest, a digest that does not match the entry, and a script outside docs/loops/scripts/ are refused, and the files stay as they are', async (project) => {
  const entry = scriptEntry(B)
  const good = await seedAgreed(project, entry, { scriptText: SCRIPT_TEXT })
  project.commit('agreed')
  const scriptFile = join(project.root, 'docs', 'loops', 'scripts', `${B}.mjs`)
  const outside = { ...entry, action: { ...entry.action, script: { ...(entry.action.kind === 'script' ? entry.action.script : { lang: 'node' }), file: 'docs/loops/scripts/../../../outside.mjs' } } }
  const forgeries = [
    ['script text', { ...good, rev: 2, scriptText: 'Remove-Item -Recurse .\n' }],
    ['digest', { ...good, rev: 2, fileSha256: sha256('something else') }],
    ['script path', { ...good, rev: 2, entry: outside }],
  ] as const
  for (const [what, image] of forgeries) {
    await appendJournal(project.store.paths, { seq: project.store.read().journal.nextSeq, at: new Date(NOW).toISOString(), actor: 'human', op: 'edit', id: B, after: image as typeof good })
    if (what === 'digest') {
      // The file is the version before: a write the board would owe, if the line could be written from.
      assert.equal(statusOf(project, B), 'unreadable')
      await project.store.settle()
      assert.equal(await readFile(entryFileOf(project.root, B), 'utf8'), entryFileText(entry), 'nothing was written')
    }
    await writeFile(entryFileOf(project.root, B), '')
    const result = await project.store.apply('human', { op: 'restore', entry: B })
    assert.deepEqual([what, result.ok, !result.ok && result.code], [what, false, 'invalid'])
    await project.store.settle()
    assert.equal(await readFile(entryFileOf(project.root, B), 'utf8'), '', 'nothing was written')
    assert.equal(await readFile(scriptFile, 'utf8'), SCRIPT_TEXT)
    await writeFile(entryFileOf(project.root, B), entryFileText(entry))
  }
})
// ------------------------------------------------- changed outside the board

gitProjectTest('a file edited by hand does not run and is listed; the change is noted once; the board does not write it back; /loops restore does, keeping the edit aside', async (project) => {
  const entry = tellEntry(A)
  await seedAgreed(project, entry)
  project.commit('agreed')
  const edited = entryFileText(tellEntry(A, { title: '改过的名字' }))
  await writeFile(entryFileOf(project.root, A), edited)
  const found = project.store.read().entries[0]
  assert.deepEqual([found?.status.kind, found?.title], ['outside', '改过的名字'])
  await project.store.settle()
  await project.store.settle()
  const records = await recordsOf(project)
  assert.deepEqual(records.map(record => [record.op, record.actor, record.observed?.fileSha256]), [['add', 'human', undefined], ['external', 'harness', sha256(edited)]], 'noted once, whatever the number of reads')
  assert.equal(await readFile(entryFileOf(project.root, A), 'utf8'), edited, 'not written back')
  assert.equal(statusOf(project, A), 'outside')

  assert.equal((await project.store.apply('human', { op: 'restore', entry: A })).ok, true)
  assert.equal(await readFile(entryFileOf(project.root, A), 'utf8'), entryFileText(entry))
  assert.equal(statusOf(project, A), 'ok')
  const aside = (await namesIn(project.store.paths.runtimeDir)).find(name => name.startsWith(`.${A}.json.outside-`))
  assert.equal(await readFile(join(project.store.paths.runtimeDir, aside ?? ''), 'utf8'), edited)
})

for (const way of ['git checkout of the old version', 'git revert of the commit that changed it'] as const) {
  gitProjectTest(`an older version of the file, brought back by a ${way}, does not run, and is not taken for a write the board still owes`, async (project) => {
    const first = tellEntry(A)
    const second = tellEntry(A, { title: '改成第二版' })
    await seedAgreed(project, first)
    project.commit('first version')
    await seedAgreed(project, second, { op: 'edit', rev: 2 })
    project.commit('second version')
    assert.equal(statusOf(project, A), 'ok')
    if (way.includes('checkout')) project.git('checkout', 'HEAD~1', '--', 'docs/loops/entries')
    else project.git('revert', '--no-edit', 'HEAD')
    assert.equal(await readFile(entryFileOf(project.root, A), 'utf8'), entryFileText(first))
    assert.equal(statusOf(project, A), 'outside')
    await project.store.settle()
    assert.equal(await readFile(entryFileOf(project.root, A), 'utf8'), entryFileText(first), 'the old version stays')
    assert.deepEqual((await recordsOf(project)).map(record => record.op), ['add', 'edit', 'external'])
    assert.equal((await project.store.apply('human', { op: 'restore', entry: A })).ok, true)
    assert.equal(await readFile(entryFileOf(project.root, A), 'utf8'), entryFileText(second), 'restore writes the version the person agreed to last')
  })
}

gitProjectTest('a file back after a deletion, brought by git, does not run: the person deleted it', async (project) => {
  await seedAgreed(project, tellEntry(A))
  project.commit('agreed')
  assert.equal((await project.store.apply('human', { op: 'delete', entry: A })).ok, true)
  assert.equal(statusOf(project, A), 'deleted')
  project.git('checkout', '--', 'docs/loops/entries')
  assert.equal(statusOf(project, A), 'outside')
})

// ------------------------------------------------- a file that is not there

gitProjectTest('a file missing because of a branch switch is not in this checkout: it does not run, nothing is written back, and it runs again when it returns', async (project) => {
  const base = project.git('rev-parse', 'HEAD')
  await seedAgreed(project, tellEntry(A))
  project.commit('agreed')
  project.git('checkout', '--quiet', '--detach', base)
  assert.equal(statusOf(project, A), 'not-in-checkout')
  assert.equal(project.store.read().plan.owed.length, 0)
  await project.store.settle()
  assert.deepEqual(await namesIn(join(project.root, 'docs', 'loops')), [], 'nothing is written back')
  assert.equal((await recordsOf(project)).length, 1)
  project.git('checkout', '--quiet', 'main')
  assert.equal(statusOf(project, A), 'ok')
  assert.equal((await recordsOf(project)).length, 1, 'no new agreement is asked for')
})

gitProjectTest('git stash -u takes an entry that was never committed away: it is not in this checkout, and it is there again after the pop', async (project) => {
  await seedAgreed(project, scriptEntry(B), { scriptText: SCRIPT_TEXT })
  project.git('stash', 'push', '--quiet', '--include-untracked')
  assert.equal(statusOf(project, B), 'not-in-checkout')
  await project.store.settle()
  assert.deepEqual(await namesIn(join(project.root, 'docs')), [])
  project.git('stash', 'pop', '--quiet')
  assert.equal(statusOf(project, B), 'ok')
})

// ------------------------------------------------ the record is ahead of the file

gitProjectTest('a record whose files were not written (the host stopped between them) is finished by the next read: the script first, then the entry, then the note', async (project) => {
  const entry = scriptEntry(B)
  await seedAgreed(project, entry, { scriptText: SCRIPT_TEXT, files: false })
  assert.equal(statusOf(project, B), 'owed')
  assert.deepEqual(await namesIn(join(project.root, 'docs')), [])
  await project.store.settle()
  assert.equal(await readFile(entryFileOf(project.root, B), 'utf8'), entryFileText(entry))
  assert.equal(await readFile(join(project.root, 'docs', 'loops', 'scripts', `${B}.mjs`), 'utf8'), SCRIPT_TEXT)
  assert.equal(statusOf(project, B), 'ok')
  assert.equal((await writtenNote(project, B))?.fileSha256, sha256(entryFileText(entry)))
  assert.equal((await recordsOf(project)).length, 1)
})

gitProjectTest('an edit whose file was not written leaves the file of the version before, and the next read writes the new one', async (project) => {
  await seedAgreed(project, tellEntry(A))
  const second = tellEntry(A, { title: '第二版' })
  await seedAgreed(project, second, { op: 'edit', rev: 2, files: false })
  assert.equal(statusOf(project, A), 'owed')
  await project.store.settle()
  assert.equal(await readFile(entryFileOf(project.root, A), 'utf8'), entryFileText(second))
  assert.equal(statusOf(project, A), 'ok')
})

for (const marker of ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'BISECT_LOG', 'index.lock', 'rebase-merge', 'rebase-apply']) {
  gitProjectTest(`nothing is written into docs/loops/ while git has ${marker}; the write is made when the mark is gone`, async (project) => {
    const entry = tellEntry(A)
    await seedAgreed(project, entry, { files: false })
    const gitDir = join(project.root, '.git')
    if (marker.startsWith('rebase-')) await mkdir(join(gitDir, marker))
    else await writeFile(join(gitDir, marker), '')
    assert.equal(project.store.read().git, marker)
    await project.store.settle()
    assert.deepEqual(await namesIn(join(project.root, 'docs')), [], 'the file is owed, not written')
    assert.equal(statusOf(project, A), 'owed')
    await rm(join(gitDir, marker), { recursive: true, force: true })
    await project.store.settle()
    assert.equal(await readFile(entryFileOf(project.root, A), 'utf8'), entryFileText(entry))
    assert.equal(statusOf(project, A), 'ok')
  })
}

gitProjectTest('a delete while git is merging is in the record at once and the files go when the merge is over; a restore the same way', async (project) => {
  await seedAgreed(project, scriptEntry(B), { scriptText: SCRIPT_TEXT })
  project.commit('agreed')
  const mark = join(project.root, '.git', 'MERGE_HEAD')
  await writeFile(mark, '')
  const deleted = await project.store.apply('human', { op: 'delete', entry: B })
  assert.equal(deleted.ok && deleted.file, 'deferred')
  assert.equal((await readFile(entryFileOf(project.root, B), 'utf8')).length > 0, true, 'the file stays during the merge')
  assert.equal(statusOf(project, B), 'owed')
  await rm(mark)
  await project.store.settle()
  assert.deepEqual(await namesIn(join(project.root, 'docs', 'loops', 'entries')), [])
  assert.deepEqual(await namesIn(join(project.root, 'docs', 'loops', 'scripts')), [])
  assert.equal(statusOf(project, B), 'deleted')

  await writeFile(mark, '')
  const restored = await project.store.apply('human', { op: 'restore', entry: B })
  assert.equal(restored.ok && restored.file, 'deferred')
  assert.equal(statusOf(project, B), 'owed')
  await rm(mark)
  await project.store.settle()
  assert.equal(statusOf(project, B), 'ok')
  assert.equal(await readFile(join(project.root, 'docs', 'loops', 'scripts', `${B}.mjs`), 'utf8'), SCRIPT_TEXT)
  assert.deepEqual(changes(project.git), [])
})

// ------------------------------------------------------------ a rename that fails

gitProjectTest('a rename refused with EPERM is retried; when it keeps failing the record stands, the temporary file stays outside docs/, and the next read finishes the write', async (project) => {
  const entry = tellEntry(A)
  await seedAgreed(project, entry)
  await project.store.apply('human', { op: 'delete', entry: A })
  const refused: string[] = []
  const failing = openLoopStore(project.root, { io: quickIo({ rename: (from, to) => { refused.push(to); return Promise.reject(Object.assign(new Error('operation not permitted'), { code: 'EPERM' })) } }) })
  const restored = await failing.apply('human', { op: 'restore', entry: A })
  assert.equal(restored.ok && restored.file, 'failed')
  assert.equal(refused.length, 6, 'the first try and the five waits')
  assert.deepEqual((await recordsOf(project)).map(record => record.op), ['add', 'delete', 'restore'])
  assert.deepEqual(await namesIn(join(project.root, 'docs', 'loops', 'entries')), [], 'no file was left in the repository')
  assert.equal((await namesIn(project.store.paths.tmpDir)).filter(name => name.endsWith('.tmp')).length, 1)
  assert.equal(statusOf(project, A), 'owed')

  await project.store.settle()
  assert.equal(await readFile(entryFileOf(project.root, A), 'utf8'), entryFileText(entry))
  assert.equal(statusOf(project, A), 'ok')
  assert.equal((await recordsOf(project)).length, 3, 'finishing the write adds no record')
})

gitProjectTest('a rename refused twice and then allowed goes through within the retries', async (project) => {
  await seedAgreed(project, tellEntry(A))
  await project.store.apply('human', { op: 'delete', entry: A })
  const tries: string[] = []
  const flaky = openLoopStore(project.root, { io: quickIo({ rename: (from, to) => { tries.push(to); return tries.length <= 2 ? Promise.reject(Object.assign(new Error('busy'), { code: 'EBUSY' })) : quickIo().rename(from, to) } }) })
  const restored = await flaky.apply('human', { op: 'restore', entry: A })
  assert.equal(restored.ok && restored.file, 'written')
  assert.equal(tries.filter(to => to.endsWith(`${A}.json`)).length, 3, 'refused twice, allowed the third time')
})

gitProjectTest('a temporary file a crash left is removed once it is an hour old, and not before', async (project) => {
  await seedAgreed(project, tellEntry(A))
  const stale = join(project.store.paths.tmpDir, 'old.tmp')
  const fresh = join(project.store.paths.tmpDir, 'new.tmp')
  await writeFile(stale, 'x')
  await writeFile(fresh, 'x')
  await utimes(stale, new Date(NOW - 3_700_000), new Date(NOW - 3_700_000))
  await utimes(fresh, new Date(NOW - 60_000), new Date(NOW - 60_000))
  await project.store.settle()
  assert.deepEqual(await namesIn(project.store.paths.tmpDir), ['new.tmp'])
})

// ------------------------------------------------------ the change record is damaged

gitProjectTest('a change record whose last line is unfinished is cut: the line is kept aside and the entries are judged by the lines before it', async (project) => {
  await seedAgreed(project, tellEntry(A))
  const complete = await readFile(project.store.paths.journal, 'utf8')
  await appendFile(project.store.paths.journal, '{"seq":2,"at":"2026-11-02T00:00:00.000Z","actor":"human","op":"dele')
  const before = project.store.read()
  assert.equal(before.journal.tail.startsWith('{"seq":2'), true)
  assert.equal(before.journal.nextSeq, 2)
  assert.equal(statusOf(project, A), 'ok')
  await project.store.settle()
  assert.equal(await readFile(project.store.paths.journal, 'utf8'), complete)
  const kept = (await namesIn(project.store.paths.runtimeDir)).filter(name => name.startsWith('.journal.corrupt-'))
  assert.equal(kept.length, 1)
  assert.equal(await readFile(join(project.store.paths.runtimeDir, kept[0] ?? ''), 'utf8'), '{"seq":2,"at":"2026-11-02T00:00:00.000Z","actor":"human","op":"dele')
  assert.equal(project.store.read().journal.tail, '')
})

gitProjectTest('a line in the middle of the change record that cannot be read is skipped: the entry is judged by the lines after it, the record is copied aside once, and the line is listed until /loops ack', async (project) => {
  const first = tellEntry(A)
  const second = tellEntry(A, { title: '第二版' })
  await seedAgreed(project, first)
  await appendFile(project.store.paths.journal, 'this is not a record\n')
  await seedAgreed(project, second, { op: 'edit', rev: 2 })
  const read = project.store.read()
  assert.deepEqual([read.journal.unreadable, read.journal.unacknowledged], [[2], [2]])
  assert.equal(statusOf(project, A), 'ok', 'the line after the bad one carries the entry whole')
  assert.equal(read.entries[0]?.title, '第二版')
  await project.store.settle()
  await project.store.settle()
  assert.equal((await namesIn(project.store.paths.runtimeDir)).filter(name => name.startsWith('.journal.corrupt-')).length, 1, 'copied once')
  assert.deepEqual(project.store.read().journal.unacknowledged, [2])

  const acked = await project.store.apply('human', { op: 'ack' })
  assert.deepEqual(acked.ok && [acked.op, acked.file], ['ack', 'none'])
  const after = project.store.read()
  assert.deepEqual([after.journal.unreadable, after.journal.unacknowledged], [[2], []])
  assert.deepEqual((await recordsOf(project)).at(-1), { seq: 3, at: new Date(NOW).toISOString(), actor: 'human', op: 'ack', through: 2, via: 'board' })
  const again = await project.store.apply('human', { op: 'ack' })
  assert.equal(again.ok, false)

  await appendFile(project.store.paths.journal, '{"seq": "x"}\n')
  assert.deepEqual(project.store.read().journal.unacknowledged, [5], 'a new bad line is listed again')
  await project.store.settle()
  assert.equal((await namesIn(project.store.paths.runtimeDir)).filter(name => name.startsWith('.journal.corrupt-')).length, 2, 'and copied')
})

// ------------------------------------------------------------------- the lock

gitProjectTest('a lock left by a writer that is gone is taken over and kept as write.lock.stale; a lock held by a live one makes the writer wait and say busy', async (project) => {
  await seedAgreed(project, tellEntry(A))
  const { lock } = project.store.paths
  await writeFile(lock, JSON.stringify({ pid: 2_147_483_000, startedAt: 1, at: 1, token: 'dead' }))
  const result = await project.store.apply('human', { op: 'delete', entry: A })
  assert.equal(result.ok, true)
  assert.deepEqual((await namesIn(project.store.paths.runtimeDir)).filter(name => name.startsWith('write.lock')).length, 1, 'the stale lock is kept under another name and the writer released its own')
  assert.equal((await namesIn(project.store.paths.runtimeDir)).some(name => name.startsWith('write.lock.stale-')), true)

  const environment = impatientLock()
  const held = await acquireLock(lock, environment)
  assert.notEqual(held, 'busy')
  const patient = openLoopStore(project.root, { io: quickIo(), lock: environment })
  const busy = await patient.apply('human', { op: 'restore', entry: A })
  assert.deepEqual(busy.ok, false)
  assert.equal(!busy.ok && busy.code, 'busy')
  assert.equal(statusOf(project, A), 'deleted', 'nothing was written')
  if (held !== 'busy') await held.release()
})

gitProjectTest('only a person changes the entries: another identity gets forbidden and nothing is written; an id that is not an entry id, or names no entry, is refused', async (project) => {
  await seedAgreed(project, tellEntry(A))
  project.commit('agreed')
  const before = await readFile(project.store.paths.journal, 'utf8')
  for (const actor of ['llm', 'harness'] as const) {
    const refused = await project.store.apply(actor, { op: 'delete', entry: A })
    assert.deepEqual([refused.ok, !refused.ok && refused.code], [false, 'forbidden'])
  }
  assert.deepEqual(await Promise.all(['loops.remind-waiting', '../../x', ''].map(async entry => { const result = await project.store.apply('human', { op: 'delete', entry }); return !result.ok && result.code })), ['invalid', 'invalid', 'invalid'])
  const unknown = await project.store.apply('human', { op: 'restore', entry: B })
  assert.equal(!unknown.ok && unknown.code, 'not_found')
  assert.equal(await readFile(project.store.paths.journal, 'utf8'), before)
  assert.deepEqual(changes(project.git), [])
})

// ---------------------------------------------------------- delete and restore

gitProjectTest('a deleted entry can be restored for 7 days and not after; an entry that is fine is not restored', async (project) => {
  const clock = { now: NOW }
  const store = openLoopStore(project.root, { io: quickIo({ now: () => clock.now }) })
  const entry = scriptEntry(B)
  await seedAgreed({ root: project.root, store }, entry, { scriptText: SCRIPT_TEXT })
  project.commit('agreed')
  const fine = await store.apply('human', { op: 'restore', entry: B })
  assert.equal(!fine.ok && fine.code, 'invalid')
  const deleted = await store.apply('human', { op: 'delete', entry: B })
  assert.deepEqual(deleted.ok && [deleted.file, deleted.title], ['removed', '重启之后查一下服务'])
  assert.deepEqual(changes(project.git).sort(), [` D docs/loops/entries/${B}.json`, ` D docs/loops/scripts/${B}.mjs`])
  assert.equal(store.read().entries[0]?.status.kind, 'deleted')
  const twice = await store.apply('human', { op: 'delete', entry: B })
  assert.equal(!twice.ok && twice.code, 'invalid')

  clock.now = NOW + 6 * 24 * 3_600_000
  assert.equal(store.read().entries[0]?.restorable, true)
  clock.now = NOW + 8 * 24 * 3_600_000
  assert.equal(store.read().entries[0]?.restorable, false)
  const late = await store.apply('human', { op: 'restore', entry: B })
  assert.equal(!late.ok && late.code, 'invalid')
  assert.equal(!late.ok && late.message.includes('7 天'), true)
  clock.now = NOW + 6 * 24 * 3_600_000
  const restored = await store.apply('human', { op: 'restore', entry: B })
  assert.equal(restored.ok && restored.file, 'written')
  assert.deepEqual(changes(project.git), [], 'back as committed')
  assert.deepEqual((await recordsOf({ store })).map(record => [record.op, record.after?.rev, record.after?.status]), [['add', 1, 'active'], ['delete', 2, 'deleted'], ['restore', 3, 'active']])
})

gitProjectTest('after a write git lists only files under docs/loops/: the change record, the note, the lock and the temporary files are in .llm/, which git is told to ignore', async (project) => {
  await seedAgreed(project, scriptEntry(B), { scriptText: SCRIPT_TEXT })
  await seedAgreed(project, tellEntry(A))
  project.commit('agreed')
  await project.store.apply('human', { op: 'delete', entry: B })
  await project.store.apply('human', { op: 'restore', entry: B })
  await project.store.apply('human', { op: 'delete', entry: A })
  const listed = changes(project.git)
  assert.deepEqual(listed, [` D docs/loops/entries/${A}.json`])
  assert.ok(listed.every(line => line.slice(3).startsWith('docs/loops/')))
  assert.ok((await namesIn(project.store.paths.runtimeDir)).includes('journal.jsonl'))
})

gitProjectTest('.llm/ is added to .git/info/exclude before the first file is made under .llm/loops/, and not repeated', async (project) => {
  const exclude = join(project.root, '.git', 'info', 'exclude')
  assert.doesNotMatch(await readFile(exclude, 'utf8'), /\.llm/)
  await seedAgreed(project, tellEntry(A))
  await project.store.apply('human', { op: 'delete', entry: A })
  await project.store.apply('human', { op: 'restore', entry: A })
  assert.equal((await readFile(exclude, 'utf8')).split('\n').filter(line => line.trim() === '.llm/').length, 1)
  assert.equal(project.git('check-ignore', '.llm/loops/journal.jsonl'), '.llm/loops/journal.jsonl')
})

gitProjectTest('empty collections are not stored: a project with nothing to note has no note file, no change record and no runtime directory, and a read creates none', async (project) => {
  assert.equal((await project.store.settle()) === 'busy', false)
  project.store.read()
  assert.deepEqual(await namesIn(join(project.root, '.llm')), [])
  await seedAgreed(project, tellEntry(A, { limits: { debounceSeconds: 5 } }))
  const records = await recordsOf(project)
  assert.ok(!JSON.stringify(records).includes('[]') && !JSON.stringify(records).includes('{}'))
  await project.store.apply('human', { op: 'delete', entry: A })
  assert.deepEqual(JSON.parse(await readFile(project.store.paths.repoWritten, 'utf8')), { [A]: { fileSha256: null, at: new Date(NOW).toISOString() } })
})

// ----------------------------------------------------------------- two processes

gitProjectTest('two processes appending to the change record at once lose no line and give no sequence number twice; no lock is left', async (project) => {
  const script = fileURLToPath(import.meta.url)
  const run = (): Promise<void> => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', script, WRITER, project.root, '30'], { stdio: ['ignore', 'ignore', 'inherit'] })
    child.on('error', reject)
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`writer exited ${String(code)}`))))
  })
  await Promise.all([run(), run()])
  const records = await recordsOf(project)
  assert.equal(records.length, 60)
  assert.deepEqual(records.map(record => record.seq), records.map((_, index) => index + 1))
  assert.equal(new Set(records.map(record => record.note)).size, 2, 'both writers wrote')
  assert.deepEqual((await namesIn(project.store.paths.runtimeDir)).filter(name => name.startsWith('write.lock')), [])
  assert.deepEqual(project.store.read().journal.unreadable, [])
})
