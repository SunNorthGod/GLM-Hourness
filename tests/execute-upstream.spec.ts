/**
 * The trunk-advance check against a real bare `origin` (M7 design 0.6
 * §3.8.4, step E7): a pull on the trunk and a hand-written remote-tracking
 * reference are refused before they run; a plain fetch is recorded as one,
 * also when another call's compare is the first to see the moved reference;
 * a fast-forward to the fetched trunk waits for its check and then passes,
 * with the must-review files it brought in listed as incoming; a push of
 * the checked trunk passes and is recorded, a push of an unchecked commit is
 * refused with the push fact, a script push is found after the call (the
 * violation, the unchecked remote line, the notice, the outside-advance
 * event) and its check afterwards adds the remote line 「检查在前进之后」;
 * `push --all` to the upstream is refused. A case whose comment says
 * 「today:」 fails on the tree before E7.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import type { PostExecuteListener, PreExecuteListener } from '../src/shared/dsh-min.ts'
import { advanceEvents, withTrunkRig, type TrunkRig } from './execute-trunk.ts'

let elsewhere = 0

/** A one-shot latch: `open()` lets every waiter on `opened` through. */
function latch(): { readonly open: () => void, readonly opened: Promise<void> } {
  let open = (): void => {}
  const opened = new Promise<void>((done) => { open = done })
  return { open: () => { open() }, opened }
}

/** Somebody else pushes one commit to the rig's origin: a clone of its own, the commit, the push; the rig's tracking reference does not move. */
function pushElsewhere(rig: TrunkRig, files: Readonly<Record<string, string>>, message: string): string {
  const remote = rig.remote
  if (remote === undefined) throw new Error('the rig has no remote')
  const clone = join(dirname(rig.repo.root), `elsewhere-${++elsewhere}`)
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: clone, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  execFileSync('git', ['clone', '--quiet', remote, clone], { stdio: 'ignore' })
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(clone, path)), { recursive: true })
    writeFileSync(join(clone, path), content)
  }
  git('add', '--all', '--', ...Object.keys(files))
  git('commit', '--quiet', '-m', message)
  git('push', '--quiet', 'origin', 'HEAD:main')
  return git('rev-parse', 'HEAD')
}

const remoteMain = (rig: TrunkRig): string => execFileSync('git', ['--git-dir', rig.remote ?? '', 'rev-parse', 'main'], { encoding: 'utf8' }).trim()

test('a pull on the trunk is refused with the three steps; the trunk and its tracking reference stay', async () => {
  await withTrunkRig({ remote: true }, async (rig) => {
    pushElsewhere(rig, { 'NEWS.md': 'news\n' }, 'news from elsewhere')
    const local = rig.repo.git('rev-parse', 'main')
    const tracking = rig.repo.git('rev-parse', 'origin/main')
    // today: the pull fetched and fast-forwarded main to the unchecked commit.
    const { result, text } = await rig.run('git pull --ff-only')
    assert.equal(result.isError, true)
    assert.match(text, /^main would move from [0-9a-f]{12} to what the pull brings in without a passed merge check\.\n/)
    assert.ok(text.includes('Right path: Pull in three steps: git fetch <upstream>; run check_commit <upstream>/<trunk>; then git merge --ff-only <upstream>/<trunk> once it passes.'))
    assert.equal(rig.repo.git('rev-parse', 'main'), local)
    assert.equal(rig.repo.git('rev-parse', 'origin/main'), tracking)
  })
})

test('a fetch that writes the remote-tracking reference by hand is refused; the reference stays', async () => {
  await withTrunkRig({ remote: true }, async (rig) => {
    const { commit } = rig.taskBranch({ 'src/feed.js': 'feed\n' })
    const tracking = rig.repo.git('rev-parse', 'origin/main')
    // today: origin/main moved to the task commit, and 0.3's "already upstream" exemption then let merge --ff-only origin/main through.
    const { result, text } = await rig.run(`git fetch . ${commit}:refs/remotes/origin/main`)
    assert.equal(result.isError, true)
    assert.ok(text.startsWith('origin/main is the harness\'s view of the published main branch; only git fetch updates it.'), text)
    assert.equal(rig.repo.git('rev-parse', 'origin/main'), tracking)
  })
})

test('a plain fetch of the upstream is recorded as a fetch: no violation, no evidence, the local trunk stays', async () => {
  await withTrunkRig({ remote: true }, async (rig) => {
    const from = rig.repo.git('rev-parse', 'origin/main')
    const fetched = pushElsewhere(rig, { 'NEWS.md': 'news\n' }, 'news from elsewhere')
    const { result, callId } = await rig.run('git fetch origin')
    assert.equal(result.isError, false)
    const [line] = await rig.advances()
    assert.deepEqual({ ...line, at: undefined }, { ref: 'remote', by: 'fetch', from, to: fetched, agent: rig.main.id, callId, at: undefined })
    assert.deepEqual(rig.violations, [])
    assert.equal(rig.repo.git('rev-parse', 'main'), from)
    assert.deepEqual(advanceEvents(rig.metrics).map(event => [event.ref, event.way]), [['remote', 'fetch']])
  })
})

test('a call that ends inside a fetch\'s window books no push: the move is recorded once, as the fetch of the call that fetched', async () => {
  const spanningIn = latch()
  const spanningGo = latch()
  const fetchIn = latch()
  const fetchGo = latch()
  await withTrunkRig({
    remote: true,
    before: (runtime) => {
      // Inside the gate: the spanning call waits with its baseline taken; the fetch waits after git ran, before the gate's compare.
      const pre: PreExecuteListener = async (payload, next) => {
        if (payload.callId === 'spanning') {
          spanningIn.open()
          await spanningGo.opened
        }
        return next()
      }
      const post: PostExecuteListener = async (exec, _result, next) => {
        if (exec.callId === 'fetch') {
          fetchIn.open()
          await fetchGo.opened
        }
        return next()
      }
      runtime.ctx.on('tools/pre-execute', pre, { prepend: true })
      runtime.ctx.on('tools/post-execute', post, { prepend: true })
    },
  }, async (rig) => {
    const from = rig.repo.git('rev-parse', 'origin/main')
    const fetched = pushElsewhere(rig, { 'NEWS.md': 'news\n' }, 'news from elsewhere')
    const spanning = rig.run('node -e "0"', { callId: 'spanning' })
    await spanningIn.opened
    const fetch = rig.run('git fetch origin', { callId: 'fetch' })
    await fetchIn.opened
    assert.equal(rig.repo.git('rev-parse', 'origin/main'), fetched, 'git moved the tracking reference before the fetch call ended')
    spanningGo.open()
    assert.equal((await spanning).result.isError, false)
    fetchGo.open()
    assert.equal((await fetch).result.isError, false)
    // today: the spanning call's compare judged the fetched move as an unchecked push under its own name, and the fetch line was never written.
    assert.deepEqual((await rig.advances()).map(line => [line.ref, line.by, line.from, line.to, line.callId, line.ok]), [['remote', 'fetch', from, fetched, 'fetch', undefined]])
    assert.deepEqual(rig.violations, [])
    assert.deepEqual(rig.events, [])
    assert.ok(!rig.metrics.some(event => event.event === 'execute.unchecked-advance'))
  })
})

test('a fast-forward to the fetched trunk is refused before its check and passes after it, the fetched must-review file listed as incoming', async () => {
  await withTrunkRig({ remote: true, floor: ['碰到受保护的目录：`files src/guarded/`'] }, async (rig) => {
    const fetched = pushElsewhere(rig, { 'src/guarded/x.ts': 'from elsewhere\n' }, 'guarded change from elsewhere')
    assert.equal((await rig.run('git fetch origin')).result.isError, false)
    const before = await rig.run('git merge --ff-only origin/main')
    assert.equal(before.result.isError, true)
    assert.match(before.text, /no passed merge check covers the change/)
    assert.equal((await rig.check('origin/main')).status, 'started')
    const after = await rig.run('git merge --ff-only origin/main')
    assert.equal(after.result.isError, false, after.text)
    assert.equal(rig.repo.git('rev-parse', 'main'), fetched)
    const line = (await rig.advances()).at(-1)
    assert.deepEqual([line?.ref, line?.ok, line?.check, line?.incomingFloor], ['local', true, fetched, ['src/guarded/x.ts']])
    assert.deepEqual(advanceEvents(rig.metrics).filter(event => event.ref === 'local').map(event => event.incomingFloor), [1])
  })
})

test('a push of the checked trunk passes and is recorded; a push of an unchecked commit is refused with the push fact', async () => {
  await withTrunkRig({ remote: true }, async (rig) => {
    const { commit } = rig.taskBranch({ 'src/feed.js': 'feed\n' })
    await rig.check(commit)
    assert.equal((await rig.run(`git merge --ff-only ${commit}`)).result.isError, false)
    const from = rig.repo.git('rev-parse', 'origin/main')
    const pushed = await rig.run('git push origin main')
    assert.equal(pushed.result.isError, false, pushed.text)
    assert.equal(remoteMain(rig), commit)
    const line = (await rig.advances()).at(-1)
    assert.deepEqual([line?.ref, line?.by, line?.from, line?.to, line?.ok], ['remote', 'push', from, commit, true])

    const unchecked = rig.repo.commitOn('hz/task-2', { 'src/other.js': 'other\n' }, 'unchecked work')
    // today: the unchecked commit went to the published trunk.
    const refused = await rig.run(`git push origin ${unchecked}:main`)
    assert.equal(refused.result.isError, true)
    assert.match(refused.text, new RegExp(`^origin/main would be pushed from ${commit.slice(0, 12)} to ${unchecked.slice(0, 12)} without a passed merge check \\(`))
    assert.equal(remoteMain(rig), commit)
    assert.deepEqual(rig.violations.map(record => [record.rule, record.effect]), [['trunk-advance-checked', undefined]])
  })
})

test('a script push of an unchecked commit is found after the call; its check afterwards adds the remote line 检查在前进之后', async () => {
  await withTrunkRig({ remote: true }, async (rig) => {
    const { commit } = rig.taskBranch({ 'src/feed.js': 'feed\n' })
    const from = rig.repo.git('rev-parse', 'origin/main')
    const { result } = await rig.run(`git -c alias.up="push origin ${commit}:main" up`)
    assert.equal(result.isError, false)
    assert.equal(remoteMain(rig), commit)
    const line = (await rig.advances()).at(-1)
    assert.deepEqual([line?.ref, line?.by, line?.from, line?.to, line?.ok], ['remote', 'push', from, commit, false])
    assert.match(line?.missing ?? '', /^no passed merge check covers the change/)
    assert.deepEqual(rig.violations.map(record => [record.rule, record.effect]), [['trunk-advance-checked', 'detected-after']])
    assert.match(rig.sent.at(-1)?.content[0]?.text ?? '', new RegExp(`^origin/main was pushed from ${from.slice(0, 12)} to ${commit.slice(0, 12)} without a passed merge check \\(.+\\)\\. The published main branch now carries unchecked commits\\.`))
    assert.deepEqual(rig.events.map(seen => [seen.event.event, seen.event.payload.from, seen.event.payload.to, seen.event.payload.files]), [['hourness.outside-advance', from, commit, ['src/feed.js']]])
    assert.ok(rig.metrics.some(event => event.event === 'execute.unchecked-advance' && event.ref === 'remote'))

    assert.equal((await rig.check(commit)).status, 'started')
    const after = (await rig.advances()).at(-1)
    assert.deepEqual([after?.ref, after?.by, after?.to, after?.ok, after?.checkedAfter], ['remote', 'push', commit, true, true])
  })
})

test('push --all to the upstream is refused: the trunk is pushed by name', async () => {
  await withTrunkRig({ remote: true }, async (rig) => {
    rig.taskBranch({ 'src/feed.js': 'feed\n' })
    // today: every branch, task branches included, went to origin.
    const { result, text } = await rig.run('git push --all origin')
    assert.equal(result.isError, true)
    assert.ok(text.startsWith('origin/main would be pushed for every branch at once.'), text)
    assert.ok(text.includes('Right path: Push the trunk by name: git push origin main.'))
    assert.equal(execFileSync('git', ['--git-dir', rig.remote ?? '', 'branch', '--list', 'hz/*'], { encoding: 'utf8' }).trim(), '', 'no task branch reached origin')
  })
})
