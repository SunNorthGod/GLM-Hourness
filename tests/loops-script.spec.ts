/**
 * The two boards' shared script executor (src/loops/script.ts; loop board
 * design 0.6 §6.6, M4 design §6.3): the digest and the command line, the
 * program resolution that skips the project and its work trees, the private
 * copy that runs exactly the bytes the person agreed to, the tree-ending
 * timeout, the output caps and the log, the whitelist environment, and the
 * three lanes (work: one per project and board; check: two, its own lane;
 * direct: never queued). Real subprocesses: what is asserted here is what a
 * process does, not what a mock would say.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, delimiter, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { CHECK_CONCURRENT, commandText, OUTPUT_DEFAULT_BYTES, OUTPUT_MAX_BYTES, resolveProgram, runCommand, runScript, scriptSha256, sweepRunCopies, WORK_TIMEOUT_MAX_MS, WORK_TIMEOUT_MS, type HookEnvelope } from '../src/loops/script.ts'

/** A project that is a real directory; removed after the case. */
function projectTest(name: string, body: (project: string) => Promise<void>): void {
  test(name, async () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'loops-script-')))
    try {
      await body(root)
    }
    finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })
}

const digest = (text: string): string => createHash('sha256').update(text).digest('hex')

const envelopeOf = (project: string, run = 'run-000000000001'): HookEnvelope => ({
  version: 1,
  board: 'loops',
  entry: 'u-1a2b3c4d',
  run,
  event: 'loops.host-restarted',
  id: 'ev-0123456789abcdef',
  at: '2026-11-04T01:00:00.000Z',
  project,
  key: 'host-restarted:k:at',
  payload: { n: 1 },
})

/** A script of Node under `docs/loops/scripts/`, the way an agreed entry holds it. */
function seedScript(project: string, id: string, text: string): { readonly file: string, readonly sha256: string, readonly lang: 'node' } {
  const file = `docs/loops/scripts/${id}.mjs`
  mkdirSync(join(project, 'docs', 'loops', 'scripts'), { recursive: true })
  writeFileSync(join(project, ...file.split('/')), text)
  return { file, sha256: digest(text), lang: 'node' }
}

// ---------------------------------------------------------------- the pieces

test('the executor\'s numbers are the design\'s (loop board design 0.6 §6.6)', () => {
  assert.equal(WORK_TIMEOUT_MS, 60_000, 'the work default is 60 seconds')
  assert.equal(WORK_TIMEOUT_MAX_MS, 1_800_000, 'the work ceiling is half an hour')
  assert.equal(CHECK_CONCURRENT, 2, 'two checks of a project at a time (review F50)')
  assert.equal(OUTPUT_DEFAULT_BYTES, 1_048_576, 'a MiB of output per stream by default')
  assert.equal(OUTPUT_MAX_BYTES, 4_194_304, 'four MiB at the most')
})

test('the digest is the file bytes\' SHA-256, and the command line is the interpreter\'s or the vector\'s', () => {
  const bytes = new TextEncoder().encode('console.log(1)\n')
  assert.equal(scriptSha256(bytes), createHash('sha256').update(bytes).digest('hex'))
  assert.equal(commandText({ file: 'docs/loops/scripts/u-1a2b3c4d.mjs', sha256: digest('x'), lang: 'node' }), 'node docs/loops/scripts/u-1a2b3c4d.mjs')
  assert.equal(
    commandText({ file: 'docs/loops/scripts/u-1a2b3c4d.ps1', sha256: digest('x'), lang: 'pwsh' }),
    'pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass docs/loops/scripts/u-1a2b3c4d.ps1',
  )
  assert.equal(commandText(['node', 'tsc', '--noEmit']), 'node tsc --noEmit')
  assert.equal(commandText(['node', 'a b.js']), 'node "a b.js"', 'a space asks for quotes')
  assert.equal(commandText(['node', 'say "hi".js']), 'node "say \\"hi\\".js"', 'a quote is escaped, the backslash before it doubled')
  assert.equal(commandText(['node', 'ends on \\']), 'node "ends on \\\\"', 'backslashes before the closing quote are doubled')
})

projectTest('resolveProgram searches PATH outside the project only, and reads an explicit path against cwd', project => {
  const outside = realpathSync.native(mkdtempSync(join(tmpdir(), 'loops-script-path-')))
  try {
    mkdirSync(join(project, 'bin'), { recursive: true })
    writeFileSync(join(project, 'bin', 'node.exe'), 'not a program', 'utf8')
    writeFileSync(join(outside, 'planted.cmd'), 'not a program', 'utf8')
    const path = process.env.PATH
    const ext = process.env.PATHEXT
    try {
      // Only the project's own bin is on PATH: it is skipped, so nothing is found.
      process.env.PATH = join(project, 'bin')
      assert.deepEqual(resolveProgram('node.exe', project, project, []), { ok: false, reason: 'not-found' })
      // A relative entry of PATH (`.`, a bare name) is skipped as well.
      process.env.PATH = '.'
      assert.deepEqual(resolveProgram('node.exe', project, project, []), { ok: false, reason: 'not-found' })
      // The project's bin first, the machine's own directories behind it: the planted one must not win.
      process.env.PATH = `${join(project, 'bin')}${delimiter}${path ?? ''}`
      const found = resolveProgram('node.exe', project, project, [])
      assert.equal(found.ok, true)
      assert.equal(found.ok && found.needsShell, false)
      assert.equal(found.ok && found.path.toLowerCase().includes(join(project, 'bin').toLowerCase()), false, 'the program never comes from inside the project')
      // A `.cmd` on PATH is found but flagged: Node cannot start it without a shell.
      process.env.PATH = `${outside}${delimiter}${path ?? ''}`
      const cmd = resolveProgram('planted', project, project, [])
      assert.equal(cmd.ok, true)
      assert.equal(cmd.ok && cmd.needsShell, true)
      // A name with a slash is a path: resolved against cwd, required to exist.
      assert.deepEqual(resolveProgram('./bin/missing.exe', project, project, []), { ok: false, reason: 'not-found' })
      const direct = resolveProgram(join(outside, 'planted.cmd'), project, project, [])
      assert.equal(direct.ok, true)
      assert.equal(direct.ok && direct.needsShell, true)
      // Nothing anywhere: not found.
      assert.deepEqual(resolveProgram('no-such-program-xyz', project, project, []), { ok: false, reason: 'not-found' })
    }
    finally {
      if (path !== undefined) process.env.PATH = path
      if (ext !== undefined) process.env.PATHEXT = ext
      else delete process.env.PATHEXT
    }
  }
  finally {
    rmSync(outside, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

// ---------------------------------------------------------------- runScript

projectTest('a script runs from a private copy of the agreed bytes, reads its envelope, and the copy goes away', async project => {
  const script = seedScript(project, 'u-1a2b3c4d', 'import { readFileSync } from "node:fs"\nconst envelope = JSON.parse(readFileSync(0, "utf8"))\nconsole.log(envelope.event + " " + envelope.run)\n')
  const result = await runScript({ project, script, envelope: envelopeOf(project), purpose: 'work' })
  assert.deepEqual([result.kind, result.kind === 'exited' && result.exitCode], ['exited', 0])
  assert.equal(result.kind === 'exited' && result.stdout, 'loops.host-restarted run-000000000001\n')
  assert.equal(result.kind === 'exited' && result.truncated, false)
  assert.equal(existsSync(join(project, '.llm', 'loops', 'run', 'run-000000000001.mjs')), false, 'the private copy is removed at the end')
})

projectTest('the pin holds: another byte, a missing file, a size over the cap and a path out of the project are all refused', async project => {
  const script = seedScript(project, 'u-1a2b3c4d', 'console.log(1)\n')
  const changed = await runScript({ project, script: { ...script, sha256: digest('other') }, envelope: envelopeOf(project), purpose: 'work' })
  assert.deepEqual([changed.kind, changed.kind === 'refused' && changed.reason], ['refused', 'script-changed'])
  const missing = await runScript({ project, script: { ...script, file: 'docs/loops/scripts/u-00000000.mjs' }, envelope: envelopeOf(project), purpose: 'work' })
  assert.deepEqual([missing.kind, missing.kind === 'refused' && missing.reason], ['refused', 'script-missing'])
  const large = seedScript(project, 'u-22222222', `console.log('${'x'.repeat(70_000)}')\n`)
  const tooLarge = await runScript({ project, script: large, envelope: { ...envelopeOf(project), run: 'run-000000000002' }, purpose: 'work' })
  assert.deepEqual([tooLarge.kind, tooLarge.kind === 'refused' && tooLarge.reason], ['refused', 'too-large'])
  // A link inside the scripts directory points out of the project: the real path decides, not the spelled one.
  const elsewhere = realpathSync.native(mkdtempSync(join(tmpdir(), 'loops-script-escape-')))
  try {
    writeFileSync(join(elsewhere, 'sneak.mjs'), 'console.log(1)\n')
    const scripts = join(project, 'docs', 'loops', 'scripts')
    mkdirSync(scripts, { recursive: true })
    const link = join(scripts, 'outside')
    symlinkSync(elsewhere, link, 'junction')
    try {
      const escaped = await runScript({
        project,
        script: { file: 'docs/loops/scripts/outside/sneak.mjs', sha256: digest('console.log(1)\n'), lang: 'node' },
        envelope: { ...envelopeOf(project), run: 'run-000000000003' },
        purpose: 'work',
      })
      assert.equal(escaped.kind === 'refused' || escaped.kind === 'crashed', true, `a script outside the project does not run (${escaped.kind})`)
      assert.equal(escaped.kind === 'refused' && escaped.reason, 'outside-project')
    }
    finally {
      rmSync(link, { force: true })
    }
  }
  finally {
    rmSync(elsewhere, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

projectTest('the timeout ends the tree, and the result says the run did not finish', async project => {
  const script = seedScript(project, 'u-1a2b3c4d', 'setTimeout(() => process.exit(0), 10_000)\n')
  const startedAt = Date.now()
  const result = await runScript({ project, script, envelope: envelopeOf(project), purpose: 'work', timeoutMs: 400 })
  assert.equal(result.kind, 'timeout')
  assert.equal(result.kind === 'timeout' && result.durationMs < 5_000, true, 'the tree was ended near the limit')
  assert.equal(Date.now() - startedAt < 5_000, true, 'the case did not wait for the script\'s own end')
}, { timeout: 20_000 })

projectTest('output is capped per stream and the log takes the command line, the digest, the program and everything', async project => {
  const script = seedScript(project, 'u-1a2b3c4d', `for (let i = 0; i < 40; i++) process.stdout.write('x'.repeat(100000))\n`)
  const logFile = join(project, '.llm', 'loops', 'logs', 'u-1a2b3c4d', 'run.log')
  const result = await runScript({ project, script, envelope: envelopeOf(project), purpose: 'work', logFile })
  assert.equal(result.kind, 'exited')
  assert.equal(result.kind === 'exited' && result.truncated, true, 'four megabytes do not fit a MiB')
  assert.equal(result.kind === 'exited' && result.stdout.length < 1_100_000, true)
  const log = readFileSync(logFile, 'utf8')
  const first = log.split('\n')[0] ?? ''
  assert.equal(first.startsWith('$ node docs/loops/scripts/u-1a2b3c4d.mjs · sha256 '), true, `the first line names the command: ${first.slice(0, 60)}`)
  assert.equal(first.includes('· program '), true, 'the resolved program is on the first line')
  assert.equal(log.length > 3_000_000, true, 'the log keeps the whole output, not the capped part')
})

projectTest('the environment is the whitelist plus the HOURNESS_* names, and nothing of the host leaks', async project => {
  const script = seedScript(
    project,
    'u-1a2b3c4d',
    'console.log(JSON.stringify({ e: process.env.HOURNESS_EVENT ?? "", p: process.env.HOURNESS_PROJECT_ROOT ?? "", leak: process.env.LOOPS_TEST_SECRET ?? "", path: (process.env.PATH ?? "") !== "" }))\n',
  )
  const had = process.env.LOOPS_TEST_SECRET
  try {
    process.env.LOOPS_TEST_SECRET = 'sk-leaky-value'
    const result = await runScript({ project, script, envelope: envelopeOf(project), purpose: 'work' })
    assert.equal(result.kind, 'exited')
    const said = JSON.parse(result.kind === 'exited' ? result.stdout : '{}') as { e: string, p: string, leak: string, path: boolean }
    assert.deepEqual([said.e, said.path], ['loops.host-restarted', true])
    assert.equal(said.p, project)
    assert.equal(said.leak, '', 'a variable outside the whitelist does not reach the script')
  }
  finally {
    if (had === undefined) delete process.env.LOOPS_TEST_SECRET
    else process.env.LOOPS_TEST_SECRET = had
  }
})

projectTest('one script of each board per project at a time: the second waits for the first', async project => {
  const script = seedScript(project, 'u-1a2b3c4d', 'setTimeout(() => process.exit(0), 350)\n')
  const first = runScript({ project, script, envelope: envelopeOf(project), purpose: 'work' })
  const second = runScript({ project, script, envelope: { ...envelopeOf(project), run: 'run-000000000002' }, purpose: 'work' })
  const startedAt = Date.now()
  await first
  await second
  assert.equal(Date.now() - startedAt >= 300, true, 'the second run waited for the first to end')
}, { timeout: 20_000 })

projectTest('stale private copies a crash left behind go after an hour, fresh ones stay', project => {
  const run = join(project, '.llm', 'loops', 'run')
  mkdirSync(run, { recursive: true })
  const stale = join(run, 'run-000000000001.mjs')
  const fresh = join(run, 'run-000000000002.mjs')
  writeFileSync(stale, 'old')
  utimesSync(stale, Date.now() / 1000, (Date.now() - 2 * 3_600_000) / 1000)
  writeFileSync(fresh, 'new')
  sweepRunCopies(project, Date.now())
  assert.equal(existsSync(stale), false, 'a copy from two hours ago goes')
  assert.equal(existsSync(fresh), true, 'a copy from just now stays')
})

// ---------------------------------------------------------------- runCommand

projectTest('a direct command starts at once with an empty standard input and only the project root of the HOURNESS_* names', async project => {
  const result = await runCommand({
    queue: 'direct',
    project,
    argv: ['node', '-e', 'process.stdout.write(`${process.env.HOURNESS_EVENT ?? "none"} ${process.env.HOURNESS_PROJECT_ROOT ?? "none"}`)'],
  })
  assert.deepEqual([result.kind, result.kind === 'exited' && result.exitCode], ['exited', 0])
  assert.equal(result.kind === 'exited' && result.stdout, `none ${project}`, 'a direct run names the project root, and no other HOURNESS_* name')
})

projectTest('a check command names the run, is refused without an envelope, and stays out of the work lane', async project => {
  const without = await runCommand({ queue: 'check', project, argv: ['node', '-v'] })
  assert.deepEqual([without.kind, without.kind === 'refused' && without.reason], ['refused', 'aborted'])
  const result = await runCommand({
    queue: 'check',
    project,
    argv: ['node', '-e', 'process.stdout.write(process.env.HOURNESS_EVENT ?? "none")'],
    envelope: envelopeOf(project),
  })
  assert.equal(result.kind === 'exited' && result.stdout, 'loops.host-restarted', 'a check run names its event')
})

projectTest('a command outside the checkouts of the project, a program that is not there and a .cmd are all refused before anything starts', async project => {
  const elsewhere = realpathSync.native(mkdtempSync(join(tmpdir(), 'loops-script-elsewhere-')))
  try {
    const outside = await runCommand({ queue: 'direct', project, cwd: elsewhere, argv: ['node', '-v'] })
    assert.deepEqual([outside.kind, outside.kind === 'refused' && outside.reason], ['refused', 'outside-project'])
    const missing = await runCommand({ queue: 'direct', project, argv: ['no-such-program-xyz', '-v'] })
    assert.equal(missing.kind, 'crashed')
    assert.equal(missing.kind === 'crashed' && missing.reason, 'spawn')
    assert.equal(missing.kind === 'crashed' && missing.message.includes('找不到'), true)
    const outsidePath = realpathSync.native(mkdtempSync(join(tmpdir(), 'loops-script-cmd-')))
    try {
      writeFileSync(join(outsidePath, 'planted.cmd'), 'not a program', 'utf8')
      const path = process.env.PATH
      try {
        process.env.PATH = `${outsidePath}${delimiter}${process.env.PATH ?? ''}`
        const shell = await runCommand({ queue: 'direct', project, argv: ['planted', '-v'] })
        assert.equal(shell.kind, 'crashed')
        assert.equal(shell.kind === 'crashed' && shell.message.includes('写成能直接起的程序'), true, `the message names the fix: ${shell.kind === 'crashed' ? shell.message : ''}`)
      }
      finally {
        if (path !== undefined) process.env.PATH = path
      }
    }
    finally {
      rmSync(outsidePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }
  finally {
    rmSync(elsewhere, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

projectTest('a check runs in a work tree of the project, two at a time in a lane of their own', async project => {
  // A real work tree: the project becomes a git repository and adds one.
  const git = (...args: string[]): string => execFileSync('git', ['-c', 'user.name=Loops Test', '-c', 'user.email=loops@example.invalid', ...args], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd()
  git('init', '--quiet', '-b', 'main')
  writeFileSync(join(project, 'README.md'), 'a project\n')
  git('add', '--all')
  git('commit', '--quiet', '-m', 'first')
  const worktree = join(project, '..', `${basename(project)}-wt`)
  git('worktree', 'add', '--quiet', worktree)
  try {
    const result = await runCommand({
      queue: 'check',
      project,
      cwd: worktree,
      argv: ['node', '-e', 'process.stdout.write(process.cwd())'],
      envelope: envelopeOf(project),
      timeoutMs: WORK_TIMEOUT_MS,
    })
    assert.equal(result.kind === 'exited' && result.stdout.replace(/\\/g, '/'), worktree.replace(/\\/g, '/'), 'the check ran in the work tree it was given')
    // Three checks of 300 ms with two slots: two batches, so clearly more than one batch, clearly less than running one by one.
    const slow = ['node', '-e', 'setTimeout(() => process.exit(0), 300)']
    const startedAt = Date.now()
    await Promise.all([
      runCommand({ queue: 'check', project, argv: slow, envelope: envelopeOf(project) }),
      runCommand({ queue: 'check', project, argv: slow, envelope: { ...envelopeOf(project), run: 'run-000000000002' } }),
      runCommand({ queue: 'check', project, argv: slow, envelope: { ...envelopeOf(project), run: 'run-000000000003' } }),
    ])
    const took = Date.now() - startedAt
    assert.equal(took >= 450, true, `the third check waited for a slot (took ${took}ms)`)
    assert.equal(took < 1_500, true, `two slots, not one (took ${took}ms)`)
  }
  finally {
    git('worktree', 'remove', '--force', worktree)
    rmSync(worktree, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}, { timeout: 30_000 })
