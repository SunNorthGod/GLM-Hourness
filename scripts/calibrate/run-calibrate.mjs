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
 *        [--repeat 1] [--max-steps 40] [--minutes 15] [--permission danger-full-access]
 * Run `npm run build` first: the sandbox loads the build output under
 * packages/<package>/dist/ of the checkout its profile links.
 * Each invocation writes .llm/calibration-runs/<timestamp>/ (gitignored):
 * results.json for the whole invocation, and per run its overlay, the
 * headless --json event stream, stderr, the limits record, the checker
 * output, result.json, the workspace copy and the run's own data
 * directories (usage journal, guard journal). Nothing is written to the
 * real user-level directory.
 */
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
// The GLM credit plan (docs/FACTS.md §2.4) the glm-login row serves to the usage panel.
import { chargedCredits, CREDIT_RATES, fullCredits, peakWindowAt } from '../../packages/glm/dist/glm-llm/credits.js'
import { attachmentsIn, dataRows, initRepo, limitsRow, repo, requireDesktop, sandboxCommand, slash, workspaceChangesRow } from '../sandbox.mjs'

requireDesktop('calibrate')

const TASKS_DIR = join(repo, 'tests', 'calibration')
const PROVIDER = 'glm-zcode'
/** File-writing tools and the argument naming the file (the guard's file tools). */
const FILE_TOOLS = new Map([['Write', 'file_path'], ['Edit', 'file_path'], ['write', 'file_path'], ['edit', 'file_path'], ['str_replace_editor', 'path']])
const SHELL_TOOLS = new Set(['Bash', 'pwsh', 'bash', 'terminal_send'])
/** Tools that ask the human in an interactive session (dsh-tool-ask-user). */
const HUMAN_TOOLS = new Set(['ask_user_question'])
/** Time after the limits row's own time limit before the process tree is killed. */
const HARD_KILL_GRACE_MS = 120_000

const { values: options } = parseArgs({
  options: {
    'tasks': { type: 'string' },
    'models': { type: 'string', default: [...CREDIT_RATES.keys()].join(',') },
    'repeat': { type: 'string', default: '1' },
    'max-steps': { type: 'string', default: '40' },
    'minutes': { type: 'string', default: '15' },
    'permission': { type: 'string', default: 'danger-full-access' },
  },
})
const fail = (message) => {
  console.error(`calibrate: ${message}`)
  process.exit(2)
}
const positive = (name) => {
  const value = Number(options[name])
  if (!Number.isInteger(value) || value < 1) fail(`--${name} must be a positive integer`)
  return value
}
const repeat = positive('repeat')
const maxSteps = positive('max-steps')
const timeLimitMs = positive('minutes') * 60_000
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
const tasks = taskIds.map((id) => {
  const dir = join(TASKS_DIR, id)
  return { id, dir, fixture: join(dir, 'fixture'), prompt: readFileSync(join(dir, 'prompt.md'), 'utf8'), ...JSON.parse(readFileSync(join(dir, 'task.json'), 'utf8')) }
})

const gitOut = (args, cwd) => (spawnSync('git', args, { cwd, encoding: 'utf8' }).stdout ?? '').trim()
const commit = gitOut(['rev-parse', '--short', 'HEAD'], repo)
const dirty = gitOut(['status', '--porcelain', '--untracked-files=no'], repo).length > 0
const runRoot = join(repo, '.llm', 'calibration-runs', new Date().toISOString().replace(/[:.]/g, '-'))
mkdirSync(runRoot, { recursive: true })

const jsonl = file => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line)) : []
const round = value => Math.round(value * 100) / 100

/** Boot one headless run in `ws` and collect the --json run events (dsh-headless json-stream). */
function runHeadless(dir, ws, prompt, model) {
  const patch = join(dir, 'calibrate.patch.yml')
  writeFileSync(patch, [
    '- id: agent-default-model',
    `  config: { provider: ${PROVIDER}, model: ${JSON.stringify(model)} }`,
    '- id: glm-hourness/glm-llm',
    '  disabled: false',
    ...dataRows(dir),
    ...attachmentsIn(dir),
    ...limitsRow({ maxSteps, timeLimitMs, record: slash(join(dir, 'limits.jsonl')) }),
    ...workspaceChangesRow('glm-hourness-calibrate/workspace-changes'),
    '',
  ].join('\n'))
  const { exe, args, env } = sandboxCommand(patch, ['--json', '-'])
  const started = Date.now()
  return new Promise((resolve) => {
    const child = spawn(exe, args, { cwd: ws, env: { ...env, DSH_PERMISSION_MODE: permission } })
    const events = []
    const raw = createWriteStream(join(dir, 'events.jsonl'))
    const take = (line) => {
      try {
        events.push(JSON.parse(line))
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
    }, timeLimitMs + HARD_KILL_GRACE_MS)
    child.on('error', (error) => {
      spawnError = error.message
    })
    child.on('close', (code) => {
      clearTimeout(hardKill)
      take(pending)
      raw.end()
      resolve({ code, killed, events, durationMs: Date.now() - started, ...(spawnError === undefined ? {} : { spawnError }) })
    })
    child.stdin.end(prompt)
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
  const dir = join(runRoot, `${task.id}--${model}${repeat > 1 ? `--${index + 1}` : ''}`)
  const ws = join(dir, 'ws')
  mkdirSync(join(dir, 'home'), { recursive: true })
  cpSync(task.fixture, ws, { recursive: true })
  if (!initRepo(ws)) fail(`git init of the workspace copy failed in ${ws}`)
  const startedAt = new Date().toISOString()
  console.log(`calibrate: ${task.id} on ${model}${repeat > 1 ? ` (run ${index + 1}/${repeat})` : ''} ...`)
  const run = await runHeadless(dir, ws, task.prompt, model)
  const limits = jsonl(join(dir, 'limits.jsonl'))
  const usage = jsonl(join(dir, 'dsh-home', 'glm-hourness', 'audit', 'usage.jsonl'))
  const guard = jsonl(join(dir, 'home', 'audit', 'violations.jsonl'))
  const events = type => run.events.filter(event => event.type === type)
  const phases = phase => events('status').filter(event => event.phase === phase)
  const calls = events('tool_call')
  const results = new Map(events('tool_result').map(result => [result.callId, result]))
  const turnEnd = phases('turn_end').at(-1)?.reason
  const stop = run.killed ? 'killed' : limits.some(entry => entry.kind === 'time-limit') ? 'time-limit' : limits.some(entry => entry.kind === 'step-limit') ? 'step-limit' : turnEnd?.kind ?? 'no-turn-end'
  const acceptance = runChecker(task, dir, ws)
  const changed = changedFiles(ws)
  const result = {
    task: task.id,
    kind: task.kind,
    model,
    provider: PROVIDER,
    run: index + 1,
    sessionId: events('session')[0]?.sessionId,
    startedAt,
    durationMs: run.durationMs,
    exit: run.code,
    ...(run.spawnError === undefined ? {} : { spawnError: run.spawnError }),
    stop,
    turnEnd,
    completed: acceptance.pass === true,
    acceptance,
    steps: phases('step_start').length,
    toolCalls: calls.length,
    toolErrors: [...results.values()].filter(entry => entry.status === 'error').length,
    tools: countBy(calls, 'tool'),
    rework: reworkOf(calls, results),
    interruptions: limits.filter(entry => entry.kind === 'approval').length + calls.filter(call => HUMAN_TOOLS.has(call.tool)).length,
    violations: guard.filter(record => record.mode !== 'shadow').length,
    shadowRecords: guard.filter(record => record.mode === 'shadow').length,
    changedFiles: changed,
    strayFiles: changed.filter(path => !task.touches.some(touch => touch.endsWith('/') ? path.startsWith(touch) : path === touch)),
    tokens: tokensOf(usage),
    credits: creditsOf(usage),
    peakCalls: usage.filter(record => isPeak(record.at)).length,
    finalText: (events('final').at(-1)?.text ?? '').slice(0, 2000),
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
    violations: sum(run => run.violations),
    strayFiles: sum(run => run.strayFiles.length),
    creditsCharged: mean(run => run.credits.charged),
    creditsRaw: mean(run => run.credits.raw),
    minutes: mean(run => run.durationMs / 60_000),
  }
}

const runs = []
const writeResults = () => {
  const groups = keyOf => [...new Set(runs.map(keyOf))].map(key => ({ key, ...summarize(runs.filter(run => keyOf(run) === key)) }))
  writeFileSync(join(runRoot, 'results.json'), `${JSON.stringify({
    date: new Date().toISOString(),
    commit,
    dirty,
    options: { tasks: taskIds, models, repeat, maxSteps, timeLimitMs, permission },
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
      console.log(`  ${result.completed ? 'PASS' : 'FAIL'}  stop ${result.stop}, ${result.steps} step(s), ${result.toolCalls} call(s), rework ${result.rework}, interruptions ${result.interruptions}, violations ${result.violations}, credits ${result.credits.charged} (raw ${result.credits.raw}), ${round(result.durationMs / 60_000)} min${failed.length > 0 ? `; failed: ${failed.join('; ')}` : ''}${result.acceptance.error === undefined ? '' : `; checker: ${result.acceptance.error}`}`)
    }
  }
}
console.log(`calibrate: ${runs.filter(run => run.completed).length}/${runs.length} completed at ${commit}${dirty ? ' (dirty)' : ''}; results in ${join(runRoot, 'results.json')}`)
// A run that never reached the model is a harness failure, not a model result.
process.exit(runs.some(run => run.steps === 0) ? 1 : 0)
