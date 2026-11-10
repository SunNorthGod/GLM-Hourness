/**
 * The scripts a person approved are run by `checkCall` (docs/ORCHESTRATION.md §16.15; rules
 * design 0.11 §6.7, §1.4 item 24): real approvals made through the board's own path
 * (propose, then the person's word), the real executor (a process of node per script, the
 * copy of the approved bytes, the end of the process tree), and the real `checkCall`. What an
 * ending means (0 allows, 2 blocks, 3 defers, anything else goes by the rule's failure
 * setting), which scripts are not run at all, and what the refusal says.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { checkCall, type CheckResult } from '../src/rules/check.ts'
import { prepareProposal } from '../src/rules/proposal.ts'
import type { ScriptResult } from '../src/loops/script.ts'
import type { RunScript } from '../src/rules/script-run.ts'
import { loadState } from '../src/rules/store.ts'
import { approvedScriptRules } from '../src/rules/model.ts'
import { draftOf } from './rules-fixtures.ts'
import { projectTest, type Project } from './rules-helpers.ts'

const MAIN = { sessionId: 's-main', agentId: 'agent-main' }
let counter = 0

/** A script of node that ends as the case says; it writes what it got on standard input to `seen.json` in the project first when asked. */
const script = (body: string, options: { readonly seen?: boolean } = {}): string => `${options.seen === true ? 'import { readFileSync, writeFileSync } from \'node:fs\'\nwriteFileSync(\'seen.json\', readFileSync(0, \'utf8\'))\n' : ''}${body}\n`

/** A rule that runs `text` before the calls whose command names `word`, approved the way the human approves: proposed, then agreed to. */
async function approve(project: Project, id: string, word: string, text: string, over: Record<string, unknown> = {}): Promise<void> {
  const proposalId = `p-${(++counter).toString(16).padStart(8, '0')}`
  const draft = draftOf({
    id,
    title: `Script of ${id}`,
    filter: { command: { matches: word } },
    action: { kind: 'script', lang: 'node', text, timeoutSeconds: 10 },
    // draftOf's default condition keeps the rule off between 09:00 and 21:00
    // (+08:00), which would leave every scripted call unjudged during the
    // day; these cases are about the endings, so no condition applies.
    condition: undefined,
    ...over,
  })
  const state = loadState(project.board.paths).state
  const made = prepareProposal({ kind: 'rule', body: draft, reason: 'the human asked' }, { state, rulesDirFromRoot: 'docs/rules', now: new Date(), via: 'graph', proposedBy: MAIN, id: proposalId, readScript: () => undefined })
  assert.ok(made.ok, JSON.stringify(made))
  assert.ok((await project.board.apply('llm', { op: 'propose', proposal: made.proposal })).ok)
  const agreed = await project.board.apply('human', { op: 'proposal-accept', id: proposalId, by: 'llm', relay: '可以', question: 'question-1' })
  assert.ok(agreed.ok, JSON.stringify(agreed))
}

/** A stand-in executor that records which scripts it was asked to run and ends each as given. */
function standIn(result: ScriptResult): { readonly run: RunScript, readonly started: string[] } {
  const started: string[] = []
  return { started, run: (request) => { started.push(request.envelope.entry); return Promise.resolve(result) } }
}

const check = (project: Project, command: string, over: Partial<Parameters<typeof checkCall>[1]> = {}): Promise<CheckResult> => checkCall({ tool: 'pwsh', args: { command } }, { project: project.root, ...over })
const scriptsOf = (result: CheckResult): Array<[string, string]> => result.scripts.map(entry => [entry.rule, entry.outcome])

// ---------------------------------------------------------------- the endings

projectTest('exit 0 lets the call through; the script got the event of the call on standard input, from the project directory', async (project) => {
  await approve(project, 'r-allow', 'case-allow', script('process.exit(0)', { seen: true }))
  const result = await check(project, 'run case-allow now', { session: 's-7', role: 'subagent', model: 'zai/glm-4.6' })
  assert.equal(result.effect, 'allow')
  assert.equal(result.exitCode, 0)
  assert.deepEqual(scriptsOf(result), [['r-allow', 'allow']])
  assert.equal(typeof result.scripts[0]?.ms, 'number')
  assert.equal(result.scripts[0]?.file, 'docs/rules/scripts/r-allow.mjs')
  assert.deepEqual(result.rules.map(rule => [rule.id, rule.effect]), [['r-allow', 'script']])
  const seen = JSON.parse(readFileSync(join(project.root, 'seen.json'), 'utf8')) as Record<string, unknown> & { payload: Record<string, unknown> }
  assert.deepEqual([seen.version, seen.board, seen.entry, seen.event, seen.session, seen.project], [1, 'rules', 'r-allow', 'gate.tool-call', 's-7', project.root])
  assert.match(String(seen.run), /^rr-[0-9a-f]{8}$/)
  assert.deepEqual([seen.payload.tool, seen.payload.command, seen.payload.role, seen.payload.model, seen.payload.caller, seen.payload.cwd], ['pwsh', 'run case-allow now', 'subagent', 'zai/glm-4.6', 'library', project.root])
})

projectTest('exit 2 blocks the call with the rule, the script and its reason from standard error, exit code 4', async (project) => {
  await approve(project, 'r-block', 'case-block', script('process.stderr.write("keys differ\\nin zh.json\\u0007")\nprocess.exit(2)'))
  const result = await check(project, 'run case-block')
  assert.equal(result.effect, 'block')
  assert.equal(result.exitCode, 4)
  assert.deepEqual(scriptsOf(result), [['r-block', 'block']])
  assert.deepEqual(result.rules.map(rule => [rule.id, rule.effect]), [['r-block', 'block']])
  assert.match(result.text ?? '', /^You tried to run "run case-block"\.\nBoundary: Rule r-block "Script of r-block" \(set by an agent, with the human's agreement at .*, until lifted\) ran its script docs\/rules\/scripts\/r-block\.mjs, which blocked the call: "keys differ\\nin zh\.json"\.\nRight path: Fix what the script reports and try again; if you think the rule is wrong, tell the human\.\nException: /)
  assert.ok(!(result.text ?? '').includes('\u0007'), 'control characters are taken out')
})

projectTest('the reason is the first 500 code points, and a script with nothing to say gives the fixed words', async (project) => {
  await approve(project, 'r-long', 'case-long', script('process.stderr.write("字".repeat(900))\nprocess.exit(2)'))
  await approve(project, 'r-mute', 'case-mute', script('process.exit(2)'))
  const long = await check(project, 'run case-long')
  assert.ok((long.text ?? '').includes(`which blocked the call: "${'字'.repeat(500)}".`), 'at most 500 code points')
  assert.ok(!(long.text ?? '').includes('字'.repeat(501)))
  const mute = await check(project, 'run case-mute')
  assert.ok((mute.text ?? '').includes('which blocked the call: "the script gave no reason".'))
})

projectTest('exit 3 defers the call, exit code 5; a rule that filters on writes blocks instead, because a write is not deferred', async (project) => {
  await approve(project, 'r-queue', 'case-queue', script('process.stderr.write("wait for the build")\nprocess.exit(3)'))
  const queued = await check(project, 'run case-queue')
  assert.equal(queued.effect, 'queue')
  assert.equal(queued.exitCode, 5)
  assert.deepEqual(scriptsOf(queued), [['r-queue', 'queue']])
  assert.match(queued.text ?? '', /ran its script docs\/rules\/scripts\/r-queue\.mjs, which deferred the call: "wait for the build"\./)
  assert.match(queued.text ?? '', /Would be deferred; the command line opens no ticket\./)
  await approve(project, 'r-queue-write', 'unused', script('process.stderr.write("later")\nprocess.exit(3)'), { filter: { writes: { paths: ['locales/'] } } })
  const write = await checkCall({ tool: 'write', args: { file_path: 'locales/zh.json', content: '{}' } }, { project: project.root })
  assert.equal(write.effect, 'block')
  assert.equal(write.exitCode, 4)
  assert.match(write.text ?? '', /which asked to defer the call; a write is not deferred, so it is blocked: "later"\./)
  assert.ok(write.notes.some(note => note.includes('写文件不配排队')), write.notes.join(' | '))
})

projectTest('a failure goes by the rule\'s failure setting: allow by default, block when the rule says so, and the refusal says what failed and for how long', async (project) => {
  const cases: Array<[string, string, string]> = [
    ['exit', 'process.exit(1)', 'exited with code 1'],
    ['timeout', 'setTimeout(() => {}, 30_000)', 'did not finish within 1 s'],
  ]
  for (const [word, body, said] of cases) {
    await approve(project, `r-${word}-allow`, `case-${word}-allow`, script(body), { action: { kind: 'script', lang: 'node', text: script(body), timeoutSeconds: 1 } })
    await approve(project, `r-${word}-block`, `case-${word}-block`, script(body), { action: { kind: 'script', lang: 'node', text: script(body), timeoutSeconds: 1, onError: 'block' } })
    const allowed = await check(project, `run case-${word}-allow`)
    assert.equal(allowed.effect, 'allow', word)
    assert.equal(allowed.exitCode, 0)
    assert.equal(scriptsOf(allowed)[0]?.[1], word === 'timeout' ? 'timeout' : 'failed')
    assert.ok(allowed.notes.some(note => note.includes(`r-${word}-allow.mjs`) && note.includes('按条目的失败做法判了放行')), allowed.notes.join(' | '))
    const blocked = await check(project, `run case-${word}-block`)
    assert.equal(blocked.effect, 'block', word)
    assert.equal(blocked.exitCode, 4)
    assert.match(blocked.text ?? '', new RegExp(`ran its script docs/rules/scripts/r-${word}-block\\.mjs, which ${said}, and the rule says to block when its script fails\\.`), word)
    assert.match(blocked.text ?? '', /Right path: The call did not run\. Try again in a minute; if it fails again, tell the human that this rule's script is failing\./)
    assert.ok(blocked.notes.some(note => note.includes('按条目的失败做法判了拦下')), blocked.notes.join(' | '))
  }
})

projectTest('a timeout ends the process tree and its children, and the call is not held much longer than the timeout', async (project) => {
  const marker = join(project.root, 'child.pid')
  const text = `import { spawn } from 'node:child_process'\nimport { writeFileSync } from 'node:fs'\nconst child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })\nwriteFileSync(${JSON.stringify(marker)}, String(child.pid))\nsetInterval(() => {}, 1000)\n`
  await approve(project, 'r-tree', 'case-tree', text, { action: { kind: 'script', lang: 'node', text, timeoutSeconds: 2, onError: 'block' } })
  const startedAt = Date.now()
  const result = await check(project, 'run case-tree')
  assert.equal(result.effect, 'block')
  assert.equal(Date.now() - startedAt < 9_000, true, 'the timeout was 2 seconds')
  const child = Number(readFileSync(marker, 'utf8'))
  await new Promise(done => setTimeout(done, 700))
  assert.throws(() => process.kill(child, 0), /ESRCH/, 'the child of the script is gone')
})

// ----------------------------------------------------- what is not run, and when

projectTest('a script that is not the approved bytes does not run: changed, missing, or a pin nobody on this machine approved', async (project) => {
  await approve(project, 'r-edited', 'case-edited', script('process.exit(2)'), { action: { kind: 'script', lang: 'node', text: script('process.exit(2)'), onError: 'block' } })
  await approve(project, 'r-gone', 'case-gone', script('process.exit(2)'))
  const base = join(project.root, 'docs', 'rules', 'scripts')
  writeFileSync(join(base, 'r-edited.mjs'), script('process.exit(0)'))
  await rm(join(base, 'r-gone.mjs'))
  const edited = await check(project, 'run case-edited')
  assert.equal(edited.effect, 'block', 'the edited script says exit 0 but is not the one the human read: the rule\'s failure setting is block')
  assert.deepEqual(scriptsOf(edited), [['r-edited', 'refused']])
  assert.match(edited.text ?? '', /has a script docs\/rules\/scripts\/r-edited\.mjs that was changed after the human agreed, so it did not run, and the rule says to block when its script fails\./)
  const gone = await check(project, 'run case-gone')
  assert.equal(gone.effect, 'allow', 'allow by default')
  assert.deepEqual(scriptsOf(gone), [['r-gone', 'refused']])
  assert.ok(gone.notes.some(note => note.includes('没有跑：is missing, so it did not run')), gone.notes.join(' | '))
  // A pin that came with the rules file and was never approved on this machine.
  const state = loadState(project.board.paths).state
  assert.deepEqual([...approvedScriptRules(state)].sort(), ['r-edited', 'r-gone'])
})

projectTest('nothing is started when no script is due: a filter that does not match, a rule the call is not about, a rule already blocking, a pin not approved on this machine', async (project) => {
  const { run, started } = standIn({ kind: 'exited', exitCode: 0, stdout: '', stderr: '', durationMs: 1, truncated: false })
  await approve(project, 'r-quiet', 'case-quiet', script('process.exit(0)'))
  assert.equal((await check(project, 'run something else', { runScript: run })).effect, 'allow')
  assert.deepEqual(started, [], 'the filter did not match: no process')
  assert.equal((await check(project, 'run case-quiet', { runScript: run, role: 'main-agent' })).effect, 'allow')
  assert.deepEqual(started, ['r-quiet'], 'the stand-in was asked once')
  await approve(project, 'r-first', 'case-both', script('process.exit(0)'))
  await approve(project, 'r-blocks', 'case-both', script('process.exit(0)'), { action: { kind: 'block' } })
  started.length = 0
  const both = await check(project, 'run case-both', { runScript: run })
  assert.equal(both.effect, 'block')
  assert.deepEqual(started, [], 'a call that a rule\'s own action blocks starts no script')
  const unapproved = join(project.root, 'docs', 'rules', 'rules.json')
  const file = JSON.parse(readFileSync(unapproved, 'utf8')) as { scripts: Record<string, Record<string, unknown>> }
  assert.equal(Object.values(file.scripts).every(pin => pin.approvedAt === undefined), true, 'the rules file never carries an approval')
})

projectTest('a script of a rules file that came with git (a pin with no approval on this machine) is not run, whatever it says', async (project) => {
  await approve(project, 'r-cloned', 'case-cloned', script('process.exit(2)'))
  const { rulesFile } = project.board.paths
  const file = readFileSync(rulesFile, 'utf8')
  await rm(join(project.root, '.llm'), { recursive: true, force: true })
  assert.equal(readFileSync(rulesFile, 'utf8'), file)
  const { run, started } = standIn({ kind: 'exited', exitCode: 2, stdout: '', stderr: 'would block', durationMs: 1, truncated: false })
  const result = await check(project, 'run case-cloned', { runScript: run })
  assert.deepEqual(started, [], 'the board started again from the file, and no one here read the script')
  assert.equal(result.effect, 'allow')
  assert.deepEqual(scriptsOf(result), [['r-cloned', 'refused']])
  assert.ok(result.notes.some(note => note.includes('is not approved on this machine')), result.notes.join(' | '))
})

projectTest('a script that calls checkCall runs no script: the call from inside a script says so and cannot call itself without end', async (project) => {
  const { run, started } = standIn({ kind: 'exited', exitCode: 2, stdout: '', stderr: 'blocked', durationMs: 1, truncated: false })
  await approve(project, 'r-self', 'case-self', script('process.exit(2)'))
  const before = process.env.HOURNESS_BOARD
  process.env.HOURNESS_BOARD = 'rules'
  try {
    const result = await check(project, 'run case-self', { runScript: run })
    assert.equal(result.effect, 'allow')
    assert.deepEqual(started, [])
    assert.deepEqual(scriptsOf(result), [['r-self', 'refused']])
    assert.ok(result.notes.includes('在脚本里自查，没有再跑脚本'))
  }
  finally {
    if (before === undefined) delete process.env.HOURNESS_BOARD
    else process.env.HOURNESS_BOARD = before
  }
})

projectTest('scripts run side by side: the first that blocks ends the wait, the slow one is called off and its process ended', async (project) => {
  const marker = join(project.root, 'slow.pid')
  const slow = `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(marker)}, String(process.pid))\nsetTimeout(() => process.exit(0), 25_000)\n`
  await approve(project, 'r-slow', 'case-pair', slow, { action: { kind: 'script', lang: 'node', text: slow, timeoutSeconds: 30 } })
  await approve(project, 'r-fast', 'case-pair', script('await new Promise(done => setTimeout(done, 800))\nprocess.stderr.write("no")\nprocess.exit(2)'))
  const startedAt = Date.now()
  const result = await check(project, 'run case-pair')
  assert.equal(result.effect, 'block')
  assert.equal(result.rules.find(rule => rule.id === 'r-fast')?.effect, 'block')
  assert.equal(Date.now() - startedAt < 12_000, true, 'the blocker did not wait for the slow script')
  assert.deepEqual(scriptsOf(result), [['r-fast', 'block']], 'what the called-off script ended with is not read')
  const pid = Number(readFileSync(marker, 'utf8'))
  await new Promise(done => setTimeout(done, 700))
  assert.throws(() => process.kill(pid, 0), /ESRCH/, 'the slow script\'s process is gone')
})

projectTest('checkCall starts no process of its own for a project with no approved script, and writes nothing in the rules directories', async (project) => {
  await writeFile(join(project.root, 'x.txt'), 'x')
  const { run, started } = standIn({ kind: 'exited', exitCode: 0, stdout: '', stderr: '', durationMs: 1, truncated: false })
  const result = await check(project, 'anything', { runScript: run })
  assert.equal(result.effect, 'allow')
  assert.deepEqual(started, [])
  assert.equal(existsSync(join(project.root, '.llm', 'loops', 'run')), false)
})
