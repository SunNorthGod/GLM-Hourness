/**
 * The rules board's uncommitted-changes check (src/rules/repo-changes.ts;
 * docs/ORCHESTRATION.md §16.16; design §6.4): a rules directory the board has
 * written and nobody has committed yet makes the main agent's reminder line,
 * until a commit takes the changes in; the host stops asking once the diff is
 * clean and starts again at the next write. Real git repositories, the way
 * rules-repo.spec makes them.
 */
import assert from 'node:assert/strict'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { openRulesBoard } from '../src/rules/engine.ts'
import { watchRepoChanges } from '../src/rules/repo-changes.ts'
import { gitTest } from './rules-helpers.ts'

const LINE = 'has changes the human made that are not committed yet'

/** Make the rules directory dirty the way a hand or a merge left it, without committing. */
const dirty = async (root: string): Promise<void> => { await appendFile(`${root}/docs/rules/rules.json`, ' ') }

/** The board writes the rules directory the way a person's decision does, and the write record lands with it. */
const boardWrites = async (root: string, level: 'stop' | 'inform'): Promise<void> => {
  const written = await openRulesBoard({ projectRoot: root }).apply('human', { op: 'peak-mode-set', level, reason: 'probe' })
  assert.ok(written.ok, JSON.stringify(written))
}

gitTest('the board never wrote the rules directory: no line, even when the directory is dirty', async ({ root }) => {
  const watch = watchRepoChanges({ warn: () => undefined })
  await mkdir(`${root}/docs/rules`, { recursive: true })
  await writeFile(`${root}/docs/rules/rules.json`, '{}\n')
  await dirty(root)
  await watch.check(root, 'docs/rules')
  assert.equal(watch.line(root), undefined)
})

gitTest('after a write a dirty rules directory makes the line; a commit takes it away', async ({ root, commit }) => {
  const watch = watchRepoChanges({ warn: () => undefined })
  await boardWrites(root, 'stop')
  commit("the board's write starts committed")
  await dirtyAndCheck(watch, root)
  assert.equal(watch.line(root), 'Rules board: docs/rules has changes the human made that are not committed yet; include them in your next commit.')
  await watch.check(root, 'docs/rules')
  assert.match(watch.line(root) ?? '', new RegExp(LINE), 'still dirty, still the line')
  commit('the person takes the board\'s write in')
  await watch.check(root, 'docs/rules')
  assert.equal(watch.line(root), undefined, 'the commit took the changes in')
  // The asking stopped on the clean diff: dirtying the directory by hand without a new write does not start it again.
  await dirty(root)
  await watch.check(root, 'docs/rules')
  assert.equal(watch.line(root), undefined, 'stopped is stopped until the board writes once more')
})

gitTest('a new write restarts the asking after the diff came out clean', async ({ root, commit }) => {
  const watch = watchRepoChanges({ warn: () => undefined })
  await boardWrites(root, 'stop')
  commit("the board's write starts committed")
  await dirtyAndCheck(watch, root)
  commit('taken in')
  await watch.check(root, 'docs/rules')
  assert.equal(watch.line(root), undefined)
  // A second write starts the check again even though the last one stopped on a clean diff.
  await boardWrites(root, 'inform')
  await dirtyAndCheck(watch, root)
  commit('taken in once more')
  await watch.check(root, 'docs/rules')
  assert.equal(watch.line(root), undefined)
})

/** Dirty the rules directory, ask once, and expect the line. */
async function dirtyAndCheck(watch: ReturnType<typeof watchRepoChanges>, root: string): Promise<void> {
  await dirty(root)
  await watch.check(root, 'docs/rules')
  assert.match(watch.line(root) ?? '', new RegExp(LINE))
}

gitTest('a rules directory outside the project says nothing; another spelling of the root answers all the same', async ({ root, commit }) => {
  const watch = watchRepoChanges({ warn: () => undefined })
  await boardWrites(root, 'stop')
  commit("the board's write starts committed")
  await dirty(root)
  await watch.check(root, 'outside/rules')
  assert.equal(watch.line(root), undefined, 'the directory is not under the root')
  const watch2 = watchRepoChanges({ warn: () => undefined })
  await watch2.check(`${root}/.`, 'docs/rules')
  assert.match(watch2.line(`${root}/.`) ?? '', new RegExp(LINE), 'the same directory by another spelling of the root')
})
