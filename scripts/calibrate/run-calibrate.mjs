/**
 * Calibrated LLM capability runs (docs/ORCHESTRATION.md §10.5, ROADMAP M1.7).
 * Boots the desktop DSH runtime headless on the glmsandbox profile with the
 * native glm-zcode channel enabled through a generated overlay (real model
 * requests: they spend the user's credits), runs every task of
 * tests/calibration/ in a fresh git-initialized copy of its fixture, bounds
 * each run (scripts/calibrate/limits.mjs, plus a hard kill of the process
 * tree after a grace period), checks acceptance with the task's checker,
 * and scores completion, rework, interruptions, credits and violations.
 *
 * Usage: npm run calibrate -- [--tasks <id,...>] [--models glm-5.3,glm-5.3-flash]
 *        [--repeat 1] [--max-steps <n>] [--minutes <n>] [--permission danger-full-access]
 *        npm run calibrate -- --collect <timestamp>
 *        add --wait to any of them to wait for the rules board instead of stopping
 * Run `npm run build` first: the sandbox loads the build output under
 * packages/<package>/dist/ of the checkout its profile links.
 * Before it reads its arguments the runner asks the rules board
 * (scripts/rules-gate.mjs, M6 design §7.2 item 2), saying its GLM spending is
 * optional: in the GLM peak the reduce and stop levels and the project's
 * rules defer it (exit 5) or block it (exit 4) before any sandbox is made;
 * --wait waits until the board lets it run.
 * The bounds of a run are the task's (`limits` in its task.json: maxSteps,
 * minutes), else 40 steps and 15 minutes; --max-steps and --minutes win over
 * both. A run that stops on a bound is counted apart as "boundary too tight",
 * not as a failure of the model.
 * A batch runs outside the repository (scripts/calibrate/run-dir.mjs): every
 * run in a directory of its own in the system temporary directory, so the
 * model under test cannot find the repository or the other runs by walking up
 * from its workspace. When the whole batch is done it is copied back to
 * .llm/calibration-runs/<timestamp>/ (gitignored) and the temporary
 * directories are deleted: results.json for the whole invocation, and per run
 * its overlay, the headless --json event stream, stderr, the limits record,
 * the checker output, result.json, the workspace copy and the run's own data
 * directories (usage journal, guard journal; for an interview task also
 * human.jsonl, what the simulated human said, and in result.json the
 * `interview` numbers of tests/calibration/interview-metrics.mjs; event-times.json
 * holds the arrival time of each line of events.jsonl). A copy that did not finish
 * leaves everything where it was; --collect <timestamp> finishes it, and
 * does the same for a batch the runner did not get to close. Nothing is
 * written to the real user-level directory.
 */
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
// The GLM credit plan (docs/FACTS.md §2.4) the glm-login row serves to the usage panel.
import { chargedCredits, CREDIT_RATES, creditPricing, fullCredits, peakWindowAt } from '../../packages/glm/dist/glm-llm/credits.js'
import { gateOnRules } from '../rules-gate.mjs'
import { ablationRow, attachmentsIn, dataRows, designRows, fenceRow, initRepo, limitsRow, repo, requireDesktop, sandboxCommand, slash, workspaceChangesRow } from '../sandbox.mjs'
import { ARMS } from './ablation.mjs'
import { fencedPathOf } from './fence.mjs'
import { closeBatch, collectBatch, openBatch, openRun } from './run-dir.mjs'

const TASKS_DIR = join(repo, 'tests', 'calibration')
const PROVIDER = 'glm-zcode'
/** File-writing tools and the argument naming the file (the guard's file tools). */
const FILE_TOOLS = new Map([['Write', 'file_path'], ['Edit', 'file_path'], ['write', 'file_path'], ['edit', 'file_path'], ['str_replace_editor', 'path']])
const SHELL_TOOLS = new Set(['Bash', 'pwsh', 'bash', 'terminal_send'])
/** Tools the main agent must not call (dsh-tool-ask-user): in an interview the human is asked in plain chat. A call to one is counted apart (`forbiddenCalls`); the human's turns are counted from what the simulated human said. */
const HUMAN_TOOLS = new Set(['ask_user_question'])
/** Time after the limits row's own time limit before the process tree is killed. */
const HARD_KILL_GRACE_MS = 120_000
/** The bounds of a run whose task names none and whose command line gives none. */
const DEFAULT_MAX_STEPS = 40
const DEFAULT_MINUTES = 15

// The rules board first: a deferred or blocked run ends here, before the arguments, the desktop and the sandbox.
await gateOnRules({ glmSpend: 'optional', peakAt: at => creditPricing.peak(at) })

const { values: options } = parseArgs({
  options: {
    'tasks': { type: 'string' },
    'models': { type: 'string', default: [...CREDIT_RATES.keys()].join(',') },
    'repeat': { type: 'string', default: '1' },
    'max-steps': { type: 'string' },
    'minutes': { type: 'string' },
    'permission': { type: 'string', default: 'danger-full-access' },
    'arm': { type: 'string', default: 'A0' },
    'collect': { type: 'string' },
  },
})
const fail = (message) => {
  console.error(`calibrate: ${message}`)
  process.exit(2)
}
// A batch that was cut off, or whose copy did not finish: copy it back from its record and clear the temporary directories. It runs nothing, so it needs no desktop.
if (options.collect !== undefined) {
  const collected = collectBatch(repo, options.collect)
  if (!collected.ok) {
    console.error(`calibrate: ${collected.message}`)
    process.exit(1)
  }
  if (collected.message !== '') console.warn(`calibrate: ${collected.message}`)
  console.log(`calibrate: batch ${options.collect} copied to ${join(repo, '.llm', 'calibration-runs', options.collect)}`)
  process.exit(0)
}
requireDesktop('calibrate')
const positiveInteger = (value, label) => {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) fail(`${label} must be a positive integer`)
  return number
}
const repeat = positiveInteger(options.repeat, '--repeat')
const flagSteps = options['max-steps'] === undefined ? undefined : positiveInteger(options['max-steps'], '--max-steps')
const flagMinutes = options.minutes === undefined ? undefined : positiveInteger(options.minutes, '--minutes')
const list = text => text.split(',').map(item => item.trim()).filter(item => item.length > 0)
const available = readdirSync(TASKS_DIR, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && existsSync(join(TASKS_DIR, entry.name, 'task.json')))
  .map(entry => entry.name)
  .sort()
const taskIds = options.tasks === undefined ? available : list(options.tasks)
const unknownTasks = taskIds.filter(id => !available.includes(id))
if (unknownTasks.length > 0) fail(`unknown task(s) ${unknownTasks.join(', ')}; available: ${available.join(', ')}`)
const models = list(options.models)
if (models.length === 0) fail('--models is empty')
// The headless template reads DSH_PERMISSION_MODE for its sandbox policy and
// approval rows. The default mirrors the user's desktop profile preset
// (danger-full-access, approval never); under workspace-write the Windows
// sandbox fails `node --test` child spawns with EPERM.
const PERMISSION_MODES = ['read-only', 'workspace-write', 'danger-full-access']
const permission = options.permission
if (!PERMISSION_MODES.includes(permission)) fail(`--permission must be one of ${PERMISSION_MODES.join(', ')}`)
// The ablation arm (scripts/calibrate/ablation.mjs): A0 runs the prompt as it is, every other arm inserts the switch row.
const arm = options.arm
if (!ARMS.includes(arm)) fail(`--arm must be one of ${ARMS.join(', ')}`)
// What the read fence keeps the model under test from (scripts/calibrate/fence.mjs): this checkout, its main checkout (a work tree sits inside it), the user's DSH home and the one the run boots with.
const commonDir = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repo, encoding: 'utf8' }).stdout?.trim() ?? ''
const FENCED = [...new Set([repo, ...(commonDir.length > 0 ? [dirname(commonDir)] : []), join(homedir(), '.dsh'), ...(process.env.DSH_HOME === undefined ? [] : [process.env.DSH_HOME])])]
const tasks = taskIds.map((id) => {
  const dir = join(TASKS_DIR, id)
  const task = { id, dir, fixture: join(dir, 'fixture'), prompt: readFileSync(join(dir, 'prompt.md'), 'utf8'), ...JSON.parse(readFileSync(join(dir, 'task.json'), 'utf8')) }
  // The bounds of the task: the command line wins, then the task's own `limits`, then the defaults. A value that is not a positive integer stops the runner before any run starts.
  const own = task.limits ?? {}
  const maxSteps = flagSteps ?? (own.maxSteps === undefined ? DEFAULT_MAX_STEPS : positiveInteger(own.maxSteps, `task ${id}: limits.maxSteps`))
  const minutes = flagMinutes ?? (own.minutes === undefined ? DEFAULT_MINUTES : positiveInteger(own.minutes, `task ${id}: limits.minutes`))
  return { ...task, bounds: { maxSteps, minutes, timeLimitMs: minutes * 60_000 } }
})

const gitOut = (args, cwd) => (spawnSync('git', args, { cwd, encoding: 'utf8' }).stdout ?? '').trim()
const commit = gitOut(['rev-parse', '--short', 'HEAD'], repo)
const dirty = gitOut(['status', '--porcelain', '--untracked-files=no'], repo).length > 0
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
// The batch runs in the system temporary directory and is copied to .llm/calibration-runs/<stamp>/ when it is done (scripts/calibrate/run-dir.mjs).
const batch = openBatch(repo, stamp)

const jsonl = file => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line)) : []
const round = value => Math.round(value * 100) / 100

/** Boot one headless run in `ws` and collect the --json run events (dsh-headless json-stream). An interview task runs with the design row on and the simulated human answering (docs/ORCHESTRATION.md §10.5.1). */
function runHeadless(dir, ws, task, model) {
  const { maxSteps, timeLimitMs } = task.bounds
  const patch = join(dir, 'calibrate.patch.yml')
  writeFileSync(patch, [
    '- id: agent-default-model',
    `  config: { provider: ${PROVIDER}, model: ${JSON.stringify(model)} }`,
    '- id: glm-hourness/glm-llm',
    '  disabled: false',
    ...dataRows(dir),
    ...attachmentsIn(dir),
    ...limitsRow({ maxSteps, timeLimitMs, record: slash(join(dir, 'limits.jsonl')) }),
    ...fenceRow({ workspace: slash(ws), fenced: FENCED.map(slash), tmp: slash(tmpdir()), record: slash(join(dir, 'fence.jsonl')) }),
    ...arm === 'A0' ? [] : ablationRow({ arm, record: slash(join(dir, 'ablation.jsonl')) }),
    ...workspaceChangesRow('glm-hourness-calibrate/workspace-changes'),
    ...task.kind === 'interview' ? designRows({ record: slash(join(dir, 'human.jsonl')), ...task.human }) : [],
    '',
  ].join('\n'))
  const { exe, args, env } = sandboxCommand(patch, ['--json', '-'])
  const started = Date.now()
  return new Promise((resolve) => {
    const child = spawn(exe, args, { cwd: ws, env: { ...env, DSH_PERMISSION_MODE: permission } })
    const events = []
    // When each event line arrived, in the order of `events` (the interview metrics measure how long a question waited).
    const times = []
    const raw = createWriteStream(join(dir, 'events.jsonl'))
    const take = (line) => {
      try {
        const event = JSON.parse(line)
        events.push(event)
        times.push(Date.now())
      }
      catch {
        // Not an event line.
      }
    }
    let pending = ''
    let killed = false
    let spawnError
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      raw.write(chunk)
      const lines = (pending + chunk).split('\n')
      pending = lines.pop()
      lines.forEach(take)
    })
    child.stderr.pipe(createWriteStream(join(dir, 'stderr.txt')))
    const hardKill = setTimeout(() => {
      killed = true
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'])
    }, task.bounds.timeLimitMs + HARD_KILL_GRACE_MS)
    child.on('error', (error) => {
      spawnError = error.message
    })
    child.on('close', (code) => {
      clearTimeout(hardKill)
      take(pending)
      // The stream is complete on disk before the checker reads it.
      raw.end(() => resolve({ code, killed, events, times, durationMs: Date.now() - started, ...(spawnError === undefined ? {} : { spawnError }) }))
    })
    child.stdin.end(task.prompt)
  })
}

/** Run the task's acceptance checker; the verdict is the last JSON line it prints. */
function runChecker(task, dir, ws) {
  const scratch = join(dir, 'check')
  mkdirSync(scratch, { recursive: true })
  const result = spawnSync(process.execPath, [join(task.dir, 'check.mjs'), '--workspace', ws, '--fixture', task.fixture, '--scratch', scratch], { encoding: 'utf8', timeout: 180_000 })
  writeFileSync(join(dir, 'check.txt'), `${result.stdout ?? ''}${result.stderr ?? ''}`)
  try {
    return JSON.parse((result.stdout ?? '').trim().split('\n').at(-1))
  }
  catch {
    return { pass: false, checks: [], error: result.error?.message ?? `checker exit ${result.status}: ${(result.stderr ?? '').slice(0, 500)}` }
  }
}

/** Files the run changed or created, from the workspace's git status (`XY path` lines; the status columns may be blank). */
const changedFiles = ws => (spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: ws, encoding: 'utf8' }).stdout ?? '')
  .split('\n')
  .filter(line => line.length > 3)
  .map(line => line.slice(3))

/**
 * Rework: a successful write to a file this run had already written, after
 * at least one shell call since that earlier write (the model changed a
 * file, ran something, and had to change the same file again).
 */
function reworkOf(calls, results) {
  let rework = 0
  let shellCalls = 0
  const lastWrite = new Map()
  for (const call of calls) {
    if (SHELL_TOOLS.has(call.tool)) {
      shellCalls += 1
      continue
    }
    const path = FILE_TOOLS.has(call.tool) ? call.input?.[FILE_TOOLS.get(call.tool)] : undefined
    if (typeof path !== 'string' || results.get(call.callId)?.status !== 'completed') continue
    const key = slash(path).toLowerCase()
    if (lastWrite.has(key) && lastWrite.get(key) < shellCalls) rework += 1
    lastWrite.set(key, shellCalls)
  }
  return rework
}

/** Weekdays 14:00-18:00 UTC+8 are peak (docs/FACTS.md §2.4); everything else, weekends included, is charged at 50 percent. */
const isPeak = at => peakWindowAt(Date.parse(at)) !== undefined

/** Token totals of the run's usage journal (one record per model call, side calls included). */
function tokensOf(records) {
  const sum = key => records.reduce((total, record) => total + (record.usage[key] ?? 0), 0)
  return { calls: records.length, input: sum('inputTokens'), cacheRead: sum('cacheReadTokens'), cacheWrite: sum('cacheWriteTokens'), output: sum('outputTokens'), reasoning: sum('reasoningTokens') }
}

/**
 * Credits by the FACTS.md §2.4 formula, before (`raw`) and after the
 * off-peak discount (`charged`). The formula has no cache-write
 * coefficient; cache writes are priced as input.
 */
function creditsOf(records) {
  let raw = 0
  let charged = 0
  let unpriced = 0
  for (const { model, usage, at } of records) {
    const rate = CREDIT_RATES.get(model)
    if (rate === undefined) {
      unpriced += 1
      continue
    }
    raw += fullCredits(rate, usage)
    charged += chargedCredits(rate, usage, Date.parse(at))
  }
  return { raw: round(raw), charged: round(charged), ...(unpriced === 0 ? {} : { unpriced }) }
}

const countBy = (items, key) => Object.fromEntries([...new Set(items.map(item => item[key]))].sort().map(value => [value, items.filter(item => item[key] === value).length]))

async function calibrate(task, model, index) {
  // The run's directory is one of its own in the temporary directory, recorded before it starts.
  const dir = openRun(batch, `${task.id}--${model}${repeat > 1 ? `--${index + 1}` : ''}`)
  const ws = join(dir, 'ws')
  mkdirSync(join(dir, 'home'), { recursive: true })
  cpSync(task.fixture, ws, { recursive: true })
  if (!initRepo(ws)) fail(`git init of the workspace copy failed in ${ws}`)
  const startedAt = new Date().toISOString()
  console.log(`calibrate: ${task.id} on ${model}${repeat > 1 ? ` (run ${index + 1}/${repeat})` : ''} ...`)
  const run = await runHeadless(dir, ws, task, model)
  writeFileSync(join(dir, 'event-times.json'), JSON.stringify(run.times))
  const limits = jsonl(join(dir, 'limits.jsonl'))
  const fenced = jsonl(join(dir, 'fence.jsonl'))
  const ablation = jsonl(join(dir, 'ablation.jsonl'))
  const usage = jsonl(join(dir, 'dsh-home', 'glm-hourness', 'audit', 'usage.jsonl'))
  const guard = jsonl(join(dir, 'home', 'audit', 'violations.jsonl'))
  // What the simulated human said (an interview task): each turn it answered is one interruption of the person.
  const replies = jsonl(join(dir, 'human.jsonl')).filter(entry => entry.kind === 'reply').length
  const events = type => run.events.filter(event => event.type === type)
  const phases = phase => events('status').filter(event => event.phase === phase)
  const calls = events('tool_call')
  const results = new Map(events('tool_result').map(result => [result.callId, result]))
  const places = { workspace: ws, fenced: FENCED, tmp: tmpdir() }
  const outside = calls.filter(call => fencedPathOf(call.input, places) !== undefined)
  const turnEnd = phases('turn_end').at(-1)?.reason
  const stop = run.killed ? 'killed' : limits.some(entry => entry.kind === 'time-limit') ? 'time-limit' : limits.some(entry => entry.kind === 'step-limit') ? 'step-limit' : turnEnd?.kind ?? 'no-turn-end'
  // An interview task's checker also prints the numbers step 12(a) counts (tests/calibration/interview-metrics.mjs): they go to result.json as `interview`, apart from the verdict.
  const { metrics, ...acceptance } = runChecker(task, dir, ws)
  const changed = changedFiles(ws)
  const result = {
    task: task.id,
    kind: task.kind,
    arm,
    model,
    provider: PROVIDER,
    run: index + 1,
    sessionId: events('session')[0]?.sessionId,
    startedAt,
    durationMs: run.durationMs,
    exit: run.code,
    ...(run.spawnError === undefined ? {} : { spawnError: run.spawnError }),
    stop,
    boundaryTooTight: stop === 'step-limit' || stop === 'time-limit',
    bounds: { maxSteps: task.bounds.maxSteps, minutes: task.bounds.minutes },
    turnEnd,
    completed: acceptance.pass === true,
    acceptance,
    steps: phases('step_start').length,
    toolCalls: calls.length,
    toolErrors: [...results.values()].filter(entry => entry.status === 'error').length,
    tools: countBy(calls, 'tool'),
    rework: reworkOf(calls, results),
    interruptions: limits.filter(entry => entry.kind === 'approval').length + replies,
    humanReplies: replies,
    forbiddenCalls: calls.filter(call => HUMAN_TOOLS.has(call.tool)).length,
    violations: guard.filter(record => record.mode !== 'shadow').length,
    shadowRecords: guard.filter(record => record.mode === 'shadow').length,
    changedFiles: changed,
    strayFiles: changed.filter(path => !task.touches.some(touch => touch.endsWith('/') ? path.startsWith(touch) : path === touch)),
    tokens: tokensOf(usage),
    credits: creditsOf(usage),
    peakCalls: usage.filter(record => isPeak(record.at)).length,
    // Calls the read fence denied.
    fence: fenced.filter(entry => entry.kind === 'denied').length,
    // The scan of the event stream after the run: calls whose arguments name a path outside the fence, and those of them that ran (should be none).
    outsideCalls: outside.length,
    outsideRan: outside.filter(call => results.get(call.callId)?.status === 'completed').map(call => ({ tool: call.tool, ...fencedPathOf(call.input, places) })),
    // The ablation switch: requests it looked at, and those it changed nothing in (A3 defers once on activation and looks at no request).
    ...arm === 'A0' ? {} : { ablation: { requests: ablation.filter(entry => entry.kind === 'request').length, unchanged: ablation.filter(entry => entry.kind === 'request' && entry.removed + entry.replaced === 0).length, deferred: ablation.find(entry => entry.kind === 'deferred')?.names.length ?? 0 } },
    finalText: (events('final').at(-1)?.text ?? '').slice(0, 2000),
    ...metrics === undefined ? {} : { interview: metrics },
  }
  writeFileSync(join(dir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  return result
}

/** Means per run (sums for the counts that should stay at zero). */
function summarize(runs) {
  const mean = pick => round(runs.reduce((total, run) => total + pick(run), 0) / runs.length)
  const sum = pick => runs.reduce((total, run) => total + pick(run), 0)
  return {
    runs: runs.length,
    completed: runs.filter(run => run.completed).length,
    steps: mean(run => run.steps),
    toolCalls: mean(run => run.toolCalls),
    toolErrors: mean(run => run.toolErrors),
    rework: mean(run => run.rework),
    interruptions: sum(run => run.interruptions),
    forbiddenCalls: sum(run => run.forbiddenCalls),
    violations: sum(run => run.violations),
    strayFiles: sum(run => run.strayFiles.length),
    fence: sum(run => run.fence),
    outsideRan: sum(run => run.outsideRan.length),
    boundaryTooTight: sum(run => run.boundaryTooTight ? 1 : 0),
    creditsCharged: mean(run => run.credits.charged),
    creditsRaw: mean(run => run.credits.raw),
    minutes: mean(run => run.durationMs / 60_000),
  }
}

const runs = []
const writeResults = () => {
  const groups = keyOf => [...new Set(runs.map(keyOf))].map(key => ({ key, ...summarize(runs.filter(run => keyOf(run) === key)) }))
  // In the batch directory of the temporary root; the copy back to the repository is the end of the invocation.
  writeFileSync(join(batch.root, 'results.json'), `${JSON.stringify({
    date: new Date().toISOString(),
    commit,
    dirty,
    options: { arm, tasks: taskIds, models, repeat, bounds: Object.fromEntries(tasks.map(task => [task.id, { maxSteps: task.bounds.maxSteps, minutes: task.bounds.minutes }])), permission },
    summary: { byTaskAndModel: groups(run => `${run.task} ${run.model}`), byModel: groups(run => run.model) },
    runs,
  }, null, 2)}\n`)
}
for (const model of models) {
  for (const task of tasks) {
    for (let index = 0; index < repeat; index += 1) {
      const result = await calibrate(task, model, index)
      runs.push(result)
      writeResults()
      const failed = result.acceptance.checks.filter(check => !check.ok).map(check => check.name)
      console.log(`  ${result.completed ? 'PASS' : 'FAIL'}  stop ${result.stop}${result.boundaryTooTight ? ' (boundary too tight, not the model\'s failure)' : ''}, ${result.steps} step(s), ${result.toolCalls} call(s), rework ${result.rework}, interruptions ${result.interruptions}, violations ${result.violations}, credits ${result.credits.charged} (raw ${result.credits.raw}), ${round(result.durationMs / 60_000)} min${failed.length > 0 ? `; failed: ${failed.join('; ')}` : ''}${result.acceptance.error === undefined ? '' : `; checker: ${result.acceptance.error}`}`)
    }
  }
}
// The batch is done: everything goes back to the repository and the temporary directories are deleted, or nothing is deleted and the way to finish is said.
const closed = closeBatch(batch)
if (!closed.ok) {
  console.error(`calibrate: ${closed.message}`)
  process.exit(1)
}
if (closed.message !== '') console.warn(`calibrate: ${closed.message}`)
console.log(`calibrate: ${runs.filter(run => run.completed).length}/${runs.length} completed at ${commit}${dirty ? ' (dirty)' : ''}${runs.some(run => run.boundaryTooTight) ? `; ${runs.filter(run => run.boundaryTooTight).length} stopped on a bound (boundary too tight)` : ''}; results in ${join(batch.target, 'results.json')}`)
// A run that never reached the model is a harness failure, not a model result.
process.exit(runs.some(run => run.steps === 0) ? 1 : 0)
