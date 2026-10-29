/**
 * L3 behavior probe (docs/DEVELOPMENT.md §3, ROADMAP M1.7): boots the real
 * desktop DSH runtime headless on a generated profile with the probe
 * provider (scripts/probe/probe-llm.mjs), runs scripted tasks, and checks
 * what the GLM-Hourness rows actually did to the model-visible request.
 *
 * Scenarios: a GLM route must get the ZCode dialect; a non-GLM route through
 * the same provider must stay untouched (no cross-route pollution). The
 * guard's shadow scenario runs in a scratch git repository under the run
 * directory with dsh-workspace-changes mounted through the overlay. Two
 * scenarios check the calibration run bounds (scripts/calibrate/limits.mjs).
 * The peak scenario and the non-GLM one run on the probe clock
 * (scripts/probe/probe-clock.mjs), set inside a peak window. Three
 * scenarios run the dispatch feasibility spike
 * (scripts/probe/probe-dispatch.mjs): a background child with a write
 * scope, a plugin-created goal driven through two rounds, and the headless
 * runner's exit with an armed goal. The graph panel scenarios run the
 * bundle's /graph-apply and /graph-run handlers mid-step for the session;
 * the GLM and non-GLM scenarios run /hourness and /hourness-status at their
 * last step, after /glm-status is recorded.
 *
 * Usage: node scripts/probe/run-probe.mjs
 * Requires the desktop install (DSH_DESKTOP_DIR overrides the location).
 * The runtime boots the profile probe-full, generated per run under its own
 * DSH home in the run directory and linked to the checkout this script is in
 * (scripts/sandbox.mjs generateProfile), so the main checkout and a worktree
 * are tested the same way and ~/.dsh/profiles is never used. Each run writes
 * the DSH home, overlays, request dumps and logs under
 * .llm/probe-runs/<timestamp>/ (gitignored).
 *
 * Guard (exit 2, no conclusion): probe-full already exists under the real
 * profiles directory, the profile cannot be generated, or the project part
 * of the desktop or glmsandbox profile (bundles, dependencies, glm-hourness/
 * overrides; scripts/profile-shape.mjs) changed during the run; other
 * changes there are listed only. A probe-full appearing under the real
 * profiles directory (DSH_HOME not honored) or a change of the real usage
 * journal fails the run (exit 1).
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { DISPATCH_TOOLS } from '../../dist/workflow/index.js'
import { PEAK_REMINDER_SOURCE, PEAK_REMINDER_TEXT } from '../../dist/glm-prompt/peak-reminder.js'
import { peakWindowAt } from '../../dist/glm-llm/credits.js'
import { userDataHome } from '../../dist/shared/data-home.js'
import { HEALTH_PACKAGES, HEALTH_ROWS } from '../../dist/shared/health.js'
import { GRAPH_TOOL_NAMES } from '../../dist/shared/tool-names.js'
import { openEngine } from '../../dist/graph/engine.js'
import { runNote } from '../../dist/graph/run.js'
import { loadGraph } from '../../dist/graph/store.js'
import { compareShapes, describeDifference, isProjectDifference, profileShape } from '../profile-shape.mjs'
import { attachmentsIn, dataRows, generateProfile, initRepo, limitsRow, repo, requireDesktop, sandboxCommand, slash, unlinkProfile, workspaceChangesRow } from '../sandbox.mjs'
import { GOAL_GATE_DENIAL, PROJECTION_SOURCE, SCOPE_DENIAL } from './probe-dispatch.mjs'

requireDesktop('probe')

const runDir = join(repo, '.llm', 'probe-runs', new Date().toISOString().replace(/[:.]/g, '-'))

// The run boots a profile generated under its own DSH home; the user's
// profiles directory must not gain it, and the profiles there must keep
// their project part (scripts/profile-shape.mjs).
const GENERATED_PROFILE = 'probe-full'
const realProfiles = join(dirname(userDataHome()), 'profiles')
if (existsSync(join(realProfiles, GENERATED_PROFILE))) {
  console.error(`probe: ${join(realProfiles, GENERATED_PROFILE)} already exists; find out which run left it before deleting it`)
  process.exit(2)
}
const GUARDED_PROFILES = ['desktop', 'glmsandbox'].filter(name => existsSync(join(realProfiles, name, 'package.json')))
const readShape = (name) => {
  try {
    return profileShape(join(realProfiles, name))
  }
  catch (error) {
    return error instanceof Error && 'code' in error ? String(error.code) : 'unreadable'
  }
}
const shapesBefore = new Map(GUARDED_PROFILES.map(name => [name, readShape(name)]))
for (const [name, shape] of shapesBefore) {
  if (typeof shape === 'string') {
    console.error(`probe: cannot read the ${name} profile under ${realProfiles} (${shape})`)
    process.exit(2)
  }
}
let profile
try {
  profile = generateProfile(join(runDir, 'dsh-root'), GENERATED_PROFILE)
}
catch (error) {
  console.error(`probe: cannot generate the ${GENERATED_PROFILE} profile under ${runDir}: ${error instanceof Error && 'code' in error ? error.code : String(error)}`)
  process.exit(2)
}
process.on('exit', () => unlinkProfile(profile))

/** A solid red 8x8 RGB PNG, built byte by byte so the fixture needs no binary file. */
function redPng(size = 8) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), body.length + 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth; colour type 2 (truecolour), default compression, filter, interlace
  header[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, Buffer.from([255, 0, 0]))])
  const pixels = deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))])
}

// The real user-level directory (<DSH home>/glm-hourness) must not change
// during a run: every scenario points the data row at its own DSH home.
const realUsage = join(userDataHome(), 'audit', 'usage.jsonl')
const usageStamp = () => existsSync(realUsage) ? (({ size, mtimeMs }) => `${size}/${mtimeMs}`)(statSync(realUsage)) : 'absent'
const realUsageBefore = usageStamp()

/**
 * Boot one headless task on `model` with a scripted reply sequence and return
 * the main agent's step requests plus the compaction requests (the
 * session-title request carries no tools), the exit status and the wall
 * time. `overlay` adds patch lines. The scenario keeps its data in its own
 * directory (scripts/sandbox.mjs dataRows: project directory `<dir>/home`,
 * DSH home `<dir>/dsh-home`). `others` holds the scripts of later sessions
 * (subagents, extra root agents) in the order they first ask; their
 * requests are in `steps` too, under their own session id.
 */
function runScenario(name, model, script, task, overlay = [], cwd = repo, others = []) {
  const dir = join(runDir, name)
  const home = join(dir, 'home')
  mkdirSync(home, { recursive: true })
  const dump = join(dir, 'requests.jsonl')
  writeFileSync(dump, '')
  const patch = join(dir, 'probe.patch.yml')
  writeFileSync(patch, [
    '- id: agent-default-model',
    `  config: { provider: glm-probe, model: ${JSON.stringify(model)} }`,
    ...dataRows(dir),
    // /glm-status reads the credential store under the glm-login home; the
    // scenario home has none, so the probe never reads the real store.
    '- id: glm-hourness/glm-login',
    `  config: { home: ${JSON.stringify(slash(home))} }`,
    '- insert:',
    '    - id: glm-hourness-probe/llm',
    `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-llm.mjs')))}`,
    '      inject: [llm]',
    `      config: { dump: ${JSON.stringify(slash(dump))}, script: ${JSON.stringify(JSON.stringify(script))}, others: ${JSON.stringify(JSON.stringify(others))} }`,
    ...overlay,
    '',
  ].join('\n'))
  const { exe, args, env } = sandboxCommand(patch, [task], profile)
  const started = Date.now()
  const result = spawnSync(exe, args, { cwd, encoding: 'utf8', timeout: 180_000, env })
  const elapsedMs = Date.now() - started
  writeFileSync(join(dir, 'stdout.txt'), result.stdout ?? '')
  writeFileSync(join(dir, 'stderr.txt'), result.stderr ?? '')
  const requests = readFileSync(dump, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line))
  return {
    status: result.status,
    elapsedMs,
    steps: requests.filter(request => request.tools.length > 0 && request.purpose !== 'compaction'),
    compactions: requests.filter(request => request.purpose === 'compaction'),
  }
}

const zcodeFace = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']
// read_image is covered by the Read alias (image paths route to it).
const nativeFace = ['read', 'write', 'edit', 'glob', 'grep', 'pwsh', 'read_image']
const searchControls = ['LocalToolSearch', 'DeferredToolCall']
const names = step => new Set((step?.tools ?? []).map(tool => tool.name))
const lastToolResult = step => step?.messages.filter(message => message.role === 'tool').at(-1)
const announcements = step => (step?.messages ?? []).filter(message => message.role === 'user' && message.source === 'glm-tool-search')

// GLM steps: load TodoWrite through local tool search, call it through
// DeferredToolCall, read a file through the Read alias, create a file with
// Write, edit it with Edit (replace_all as a ZCode semantic-boolean string),
// read it back, try to overwrite an existing file that was never read (the
// Write description promises that fails), list both scratch files with Glob
// (newest first), search package.json with Grep (content mode, -i), run a
// command through Bash (timeout in milliseconds, no description), read a
// PNG (GLM-5.3 is text-only, so read_image refuses), write a file through
// the shell (the guard denies it and journals the violation), finish.
// The scratch files live in the scenario directory inside the workspace.
const glmDir = join(runDir, 'glm')
mkdirSync(glmDir, { recursive: true })
const scratch = join(glmDir, 'scratch.txt')
const unread = join(glmDir, 'unread.txt')
const blocked = join(glmDir, 'blocked.txt')
writeFileSync(unread, 'existing\n')
const png = join(runDir, 'red.png')
writeFileSync(png, redPng())
const glm = runScenario('glm', 'glm-5.3', [
  { tool: { name: 'LocalToolSearch', arguments: { query: 'select:TodoWrite', max_results: 5 } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'TodoWrite', input: { todos: [{ content: 'probe', status: 'in_progress', priority: 'high' }] } } } },
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { tool: { name: 'Write', arguments: { file_path: scratch, content: 'alpha beta alpha\n' } } },
  { tool: { name: 'Edit', arguments: { file_path: scratch, old_string: 'alpha', new_string: 'gamma', replace_all: 'true' } } },
  { tool: { name: 'Read', arguments: { file_path: scratch, offset: 0 } } },
  { tool: { name: 'Write', arguments: { file_path: unread, content: 'clobbered\n' } } },
  { tool: { name: 'Glob', arguments: { pattern: '{scratch,unread}.txt', path: glmDir } } },
  { tool: { name: 'Grep', arguments: { 'pattern': 'DSH-GLM-HOURNESS', 'path': join(repo, 'package.json'), 'output_mode': 'content', '-i': true } } },
  { tool: { name: 'Bash', arguments: { command: 'Write-Output probe-bash', timeout: 30000 } } },
  { tool: { name: 'Read', arguments: { file_path: png } } },
  { tool: { name: 'Bash', arguments: { command: `Set-Content -Path '${blocked}' -Value probe` } } },
  // The health table is recorded before /hourness runs, so the hourness row is still idle in it.
  { text: 'done', status: true, command: { name: 'hourness' } },
], 'Load TodoWrite, record one todo, read package.json, write, edit and re-read a scratch file, list, search, run a command, read an image, write a file through the shell, then reply done.', attachmentsIn(glmDir))
const glmFirst = glm.steps[0]
const glmTools = names(glmFirst)
const glmTool = name => (glmFirst?.tools ?? []).find(tool => tool.name === name)
const plainToolOf = (step, name) => (step?.tools ?? []).find(tool => tool.name === name)
const searchResult = lastToolResult(glm.steps[1])
const deferredResult = lastToolResult(glm.steps[2])
const readResult = lastToolResult(glm.steps[3])
const writeResult = lastToolResult(glm.steps[4])
const editResult = lastToolResult(glm.steps[5])
const rereadResult = lastToolResult(glm.steps[6])
const overwriteResult = lastToolResult(glm.steps[7])
const globResult = lastToolResult(glm.steps[8])
const grepResult = lastToolResult(glm.steps[9])
const bashResult = lastToolResult(glm.steps[10])
const imageRefusal = lastToolResult(glm.steps[11])
const blockedResult = lastToolResult(glm.steps[12])
const READ_IMAGE_LINE = '- Reads images (PNG, JPG, …) and presents them visually.'
const imageFree = steps => steps.every(step => step.messages.every(message => message.images === undefined) && step.wire?.images?.length === 0)

// GLM-5.3-Flash declares image input: Read of the PNG goes through
// read_image, the image block reaches the adapter, and the glm-zcode encoder
// places it inside tool_result as a base64 image block.
const flashDir = join(runDir, 'glm-flash')
const flash = runScenario('glm-flash', 'glm-5.3-flash', [
  { tool: { name: 'Read', arguments: { file_path: png } } },
  { text: 'done' },
], 'Read the image and reply done.', attachmentsIn(flashDir))
const flashRead = lastToolResult(flash.steps[1])
const flashWire = flash.steps[1]?.wire
const properties = tool => Object.keys(tool?.parameters.properties ?? {})
const firstAnnouncement = announcements(glmFirst)[0]
const zcodeSchema = 'https://json-schema.org/draft/2020-12/schema'

// GLM todo reminder (ZCode 10/10 over assistant turns): record one todo,
// then ten assistant turns of two parallel Read calls each. Counting per
// assistant turn opens the gate exactly before the twelfth request; counting
// per tool call would have fired around the sixth.
const todo = runScenario('glm-todo', 'glm-5.3', [
  { tool: { name: 'DeferredToolCall', arguments: { name: 'TodoWrite', input: { todos: [{ content: 'probe todo', status: 'in_progress', priority: 'high' }] } } } },
  ...Array.from({ length: 10 }, () => ({ tools: [0, 1].map(() => ({ name: 'Read', arguments: { file_path: join(repo, 'package.json') } })) })),
  { text: 'done' },
], 'Record one todo, read package.json twice per turn ten times, then reply done.')
const todoReminders = step => (step?.messages ?? []).filter(message => message.role === 'user' && message.source === 'glm-todo-reminder')
const todoReminderSteps = todo.steps.flatMap((step, index) => todoReminders(step).length > 0 ? [index + 1] : [])
const todoFinal = todo.steps[11]
const todoNotice = todoReminders(todoFinal)[0]
const todoNoticeIndex = todoFinal?.messages.findIndex(message => message === todoNotice) ?? -1
const todoLastResult = todoFinal?.messages.findLastIndex(message => message.role === 'tool') ?? -1
const todoParallel = todo.steps[2]?.messages.findLast(message => message.role === 'assistant')?.toolCalls

// GLM compaction: a low pressure threshold makes compaction-basic compact
// at the second step boundary (sandbox overlay only).
const compacted = runScenario('glm-compact', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { text: 'done', status: true },
], 'Read package.json and reply done.', [
  '- id: compaction-basic',
  '  config: { thresholdRatio: 0.02, retainTokens: 0 }',
])
// Guard, quote-aware reading and the workspace-change fallback (shadow
// mode): the session runs in a scratch git repository with
// dsh-workspace-changes mounted (the desktop profile has it through
// dsh-web-app; the sandbox template does not). Quoted arrows and a git
// subcommand run; a .NET file write the reader cannot see runs too and must
// leave one shadow record naming that file, not the file Write created.
const shadowDir = join(runDir, 'glm-shadow')
const shadowWs = join(shadowDir, 'ws')
mkdirSync(shadowWs, { recursive: true })
writeFileSync(join(shadowWs, 'README.md'), 'probe workspace\n')
const gitReady = initRepo(shadowWs)
const shadowFile = join(shadowWs, 'shadow.txt')
const toolFile = join(shadowWs, 'tool.txt')
const dotnetWrite = `[System.IO.File]::WriteAllText('${slash(shadowFile)}', 'probe')`
const shadow = runScenario('glm-shadow', 'glm-5.3', [
  { tool: { name: 'Bash', arguments: { command: 'Write-Output \'a => b -> c >>> d\'' } } },
  { tool: { name: 'Bash', arguments: { command: 'git log -1 --format="%s => %h"' } } },
  { tool: { name: 'Bash', arguments: { command: dotnetWrite } } },
  { tool: { name: 'Write', arguments: { file_path: toolFile, content: 'tool\n' } } },
  { text: 'done', status: true },
], 'Run three commands, write a file, then reply done.', workspaceChangesRow('glm-hourness-probe/workspace-changes'), shadowWs)
const arrowsResult = lastToolResult(shadow.steps[1])
const gitResult = lastToolResult(shadow.steps[2])
const dotnetResult = lastToolResult(shadow.steps[3])

// Guard scope and relative targets (L4 2026-10-28: a relative Write inside
// the workspace was denied, and the guard acted on a DeepSeek session). On
// GLM a relative Write resolves against the session directory and runs; a
// relative target that climbs out with `..` is denied. On a non-GLM route
// the guard stays out: a shell write GLM would be denied runs.
const pathsDir = join(runDir, 'glm-guard-paths')
const pathsWs = join(pathsDir, 'ws')
mkdirSync(join(pathsWs, 'sub'), { recursive: true })
const relativeFile = join(pathsWs, 'sub', 'rel.txt')
const escapedFile = join(pathsDir, 'escaped.txt')
const guardPaths = runScenario('glm-guard-paths', 'glm-5.3', [
  { tool: { name: 'Write', arguments: { file_path: 'sub/rel.txt', content: 'relative\n' } } },
  { tool: { name: 'Write', arguments: { file_path: '../escaped.txt', content: 'escaped\n' } } },
  { text: 'done', status: true },
], 'Write two files, then reply done.', [], pathsWs)
const relativeResult = lastToolResult(guardPaths.steps[1])
const escapeResult = lastToolResult(guardPaths.steps[2])
const plainGuardDir = join(runDir, 'non-glm-guard')
const plainGuardWs = join(plainGuardDir, 'ws')
mkdirSync(plainGuardWs, { recursive: true })
const plainShellFile = join(plainGuardWs, 'shell.txt')
const plainGuard = runScenario('non-glm-guard', 'deepseek-probe', [
  { tool: { name: 'write', arguments: { file_path: 'rel.txt', content: 'relative\n' } } },
  { tool: { name: 'pwsh', arguments: { command: `Set-Content -Path '${plainShellFile}' -Value probe`, description: 'Write a file through the shell' } } },
  { text: 'done', status: true },
], 'Write a file, write one through the shell, then reply done.', [], plainGuardWs)
const plainWriteResult = lastToolResult(plainGuard.steps[1])
const plainShellResult = lastToolResult(plainGuard.steps[2])

// Peak-hour reminder (docs/ORCHESTRATION.md §11.4). The probe clock row
// (scripts/probe/probe-clock.mjs) starts the runtime's Date.now() at a
// Wednesday 15:00 UTC+8: the first GLM request gets the notice, later
// requests carry it once because it persists, and the non-GLM scenario runs
// on the same clock and gets none. Each request records the runtime clock.
const PEAK_AT = '2026-10-28T15:00:00+08:00'
const clockRow = at => [
  '- insert:',
  '    - id: glm-hourness-probe/clock',
  `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-clock.mjs')))}`,
  `      config: { at: ${JSON.stringify(at)} }`,
]
const peak = runScenario('glm-peak', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { text: 'done' },
], 'Read package.json twice, then reply done.', clockRow(PEAK_AT))
const peakNotices = step => (step?.messages ?? []).filter(message => message.role === 'user' && message.source === PEAK_REMINDER_SOURCE)
/** Peak notices each request should carry: one per distinct peak window among the clocks of the requests so far (a notice persists). */
const expectedPeakCounts = steps => steps.map((_, index) => new Set(steps.slice(0, index + 1).map(step => peakWindowAt(step.clock)).filter(window => window !== undefined)).size)
const peakCountsMatch = scenario => scenario.steps.length > 0 && expectedPeakCounts(scenario.steps).every((count, index) => peakNotices(scenario.steps[index]).length === count)
const peakFirst = peakNotices(peak.steps[0])
const PEAK_NOTICE = `<system-reminder>\n${PEAK_REMINDER_TEXT}\n</system-reminder>`

// /hourness-status runs at the same step, after /glm-status is recorded.
const plain = runScenario('non-glm', 'deepseek-probe', [{ text: 'done', status: true, command: { name: 'hourness-status' } }], 'Reply done.', clockRow(PEAK_AT))
const plainFirst = plain.steps[0]
const plainTools = names(plainFirst)

// Calibration run bounds (scripts/calibrate/limits.mjs, ROADMAP M1.7). The
// step limit rejects the third step of a script that would read forever;
// the time limit cancels the agent five seconds after its creation, in the
// middle of a 60-second shell command, and rejects every later step.
const limitsRecord = scenario => join(runDir, scenario, 'limits.jsonl')
const stepLimited = runScenario('limits-steps', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
], 'Read package.json until stopped.', limitsRow({ maxSteps: 2, record: slash(limitsRecord('limits-steps')) }))
const timeLimited = runScenario('limits-time', 'glm-5.3', [
  { tool: { name: 'Bash', arguments: { command: 'Start-Sleep -Seconds 60; Write-Output slept', timeout: 120000 } } },
  { text: 'done' },
], 'Sleep, then reply done.', limitsRow({ timeLimitMs: 5000, record: slash(limitsRecord('limits-time')) }))

const jsonl = file => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line)) : []

// GLM without the dialect (docs/ORCHESTRATION.md §6.1): the overlay
// disables glm-prompt, so the GLM request carries the native tools and no
// dialect service is provided. The guard's scope is unchanged (GLM calls):
// a pwsh shell write is denied, and the correction and the rule declaration
// name the native tools the model sees. With the dialect (scenario glm) they
// name Read, Write and Edit, word for word as before the names were mapped.
const RIGHT_PATH_ZCODE = 'Right path: Read the target with Read, then apply the change with Write or Edit.'
const RIGHT_PATH_NATIVE = 'Right path: Read the target with read, then apply the change with write or edit.'
const noDialectDir = join(runDir, 'glm-no-dialect')
const noDialectWs = join(noDialectDir, 'ws')
mkdirSync(noDialectWs, { recursive: true })
const noDialectFile = join(noDialectWs, 'shell.txt')
const noDialect = runScenario('glm-no-dialect', 'glm-5.3', [
  { tool: { name: 'pwsh', arguments: { command: `Set-Content -Path '${noDialectFile}' -Value probe`, description: 'Write a file through the shell' } } },
  { text: 'done' },
], 'Write a file through the shell, then reply done.', ['- id: glm-hourness/glm-prompt', '  disabled: true'], noDialectWs)
const noDialectFirst = noDialect.steps[0]
const noDialectResult = lastToolResult(noDialect.steps[1])
const noDialectViolations = jsonl(join(noDialectDir, 'home', 'audit', 'violations.jsonl'))

// Dispatch feasibility spike (docs/ORCHESTRATION.md §2.1, §3.2; DESIGN.md
// §2.4a). The overlay-only row scripts/probe/probe-dispatch.mjs records what
// it observes in <scenario>/dispatch.jsonl.
const dispatchRow = record => [
  '- insert:',
  '    - id: glm-hourness-probe/dispatch',
  `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-dispatch.mjs')))}`,
  '      inject: [subagents, goals, agents, tools]',
  `      config: { record: ${JSON.stringify(slash(record))} }`,
]
// The graph panel row (disabled by default until the L3 checklist passes)
// also registers the graphLive projection the live view reads.
const PANEL_ROW = ['- id: glm-hourness/graph-panel', '  disabled: false']
const dispatchRecord = scenario => jsonl(join(runDir, scenario, 'dispatch.jsonl'))
const bySession = (scenario, sessionId) => scenario.steps.filter(step => step.sessionId === sessionId)
const messagesOf = (step, source) => (step?.messages ?? []).filter(message => message.source === source)

// (a) and (b): the GLM main agent dispatches task T1 through the spike's
// tool (deferred on GLM, so through DeferredToolCall) to a background child
// on GLM-5.3-Flash in its own directory with write scope `allowed/` and a
// structured hand-back, reads a file while the child sleeps, and ends its
// turn; the completion notice wakes it once more. The child sleeps, prints
// its working directory, tries a write outside its scope, writes inside it,
// and submits the structured result.
const dispatchDir = join(runDir, 'glm-dispatch')
const dispatchWs = join(dispatchDir, 'ws')
mkdirSync(join(dispatchWs, 'allowed'), { recursive: true })
const outsideFile = join(dispatchWs, 'outside.txt')
const insideFile = join(dispatchWs, 'allowed', 'inside.txt')
const CHILD_PROMPT = 'Probe task T1: write allowed/inside.txt and report.'
const HAND_BACK = { summary: 'wrote allowed/inside.txt', files: ['allowed/inside.txt'] }
const dispatch = runScenario('glm-dispatch', 'glm-5.3', [
  { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_dispatch', input: { task: 'T1', prompt: CHILD_PROMPT, cwd: dispatchWs, scope: 'allowed', model: 'glm-5.3-flash' } } } },
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { text: 'Waiting for task T1.' },
  { text: 'done', status: true, live: true },
], 'Dispatch task T1, keep working, then reply done.', [...dispatchRow(join(dispatchDir, 'dispatch.jsonl')), ...PANEL_ROW], repo, [[
  { tool: { name: 'Bash', arguments: { command: 'Start-Sleep -Seconds 3; (Get-Location).Path' } } },
  { tool: { name: 'Write', arguments: { file_path: outsideFile, content: 'outside\n' } } },
  { tool: { name: 'Write', arguments: { file_path: insideFile, content: 'inside\n' } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'structured_output', input: HAND_BACK } }, live: true },
  { text: 'child done' },
]])
const dispatchNotes = dispatchRecord('glm-dispatch')
const started = dispatchNotes.find(entry => entry.kind === 'started')
const dispatchMain = bySession(dispatch, started?.parentId)
const dispatchChild = bySession(dispatch, started?.childId)
const childCalls = dispatchNotes.filter(entry => entry.kind === 'call')
const childResult = dispatchNotes.find(entry => entry.kind === 'result')
const settled = messagesOf(dispatchMain.at(-1), 'subagent-settled')
const childBash = lastToolResult(dispatchChild[1])
const scopeDenied = lastToolResult(dispatchChild[2])
const childFirstUser = dispatchChild[0]?.messages.find(message => message.source === 'user')

// (c): the GLM main agent runs the spike's goal tool, which creates a second
// root agent with a plugin-created goal (three rounds at most) and waits for
// it. Round 1 tries to complete without evidence (denied), writes the
// evidence and ends the turn with the goal active; round 2 completes.
const goalDir = join(runDir, 'glm-goal')
const goalWs = join(goalDir, 'ws')
mkdirSync(goalWs, { recursive: true })
const evidenceFile = join(goalWs, 'evidence.txt')
const completeGoal = { tool: { name: 'DeferredToolCall', arguments: { name: 'update_goal', input: { action: 'complete' } } }, goal: true }
const goalRun = runScenario('glm-goal', 'glm-5.3', [
  { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_goal_run', input: { objective: 'Produce evidence.txt, then mark the goal complete.', cwd: goalWs, evidence: 'evidence.txt', maxGoalRounds: 3 } } } },
  { text: 'done', status: true },
], 'Run the goal probe, then reply done.', dispatchRow(join(goalDir, 'dispatch.jsonl')), repo, [[
  completeGoal,
  { tool: { name: 'Write', arguments: { file_path: evidenceFile, content: 'evidence\n' } } },
  { text: 'Evidence written; the goal stays active for the next round.' },
  completeGoal,
  { text: 'Goal complete.' },
]])
const goalNotes = dispatchRecord('glm-goal')
const goalCreated = goalNotes.find(entry => entry.kind === 'goal-created')
const goalFinal = goalNotes.find(entry => entry.kind === 'goal-final')
const goalGates = goalNotes.filter(entry => entry.kind === 'goal-gate')
const goalSteps = bySession(goalRun, goalCreated?.agentId)
const goalMain = goalRun.steps.filter(step => step.sessionId !== goalCreated?.agentId)
const roundMessages = step => messagesOf(step, 'goal')
const roundOf = (step, round) => roundMessages(step).some(message => message.text.startsWith('<goal_round>\nObjective: ') && message.text.includes(`\nRound: ${round}/3\n`))
const projections = step => messagesOf(step, PROJECTION_SOURCE)
const firstRoundOrder = goalSteps[0] === undefined ? [] : [goalSteps[0].messages.findIndex(message => message.source === 'goal'), goalSteps[0].messages.findIndex(message => message.source === PROJECTION_SOURCE)]
const gateDenied = lastToolResult(goalSteps[1])
const goalCompleted = lastToolResult(goalSteps[4])
const goalRunResult = lastToolResult(goalMain.at(-1))

// The headless runner exits at the first quiescent idle of its own agent: an
// armed goal created in the task turn gets no round before exit (the reason
// the goal scenario drives a second root agent from inside a tool call).
const headlessGoal = runScenario('goal-headless', 'glm-5.3', [
  { tool: { name: 'DeferredToolCall', arguments: { name: 'create_goal', input: { objective: 'Probe objective.', max_goal_rounds: 2 } } } },
  { text: 'Goal created.' },
  { text: 'round reply' },
], 'Create a goal for the probe objective.')
const headlessCreated = lastToolResult(headlessGoal.steps[1])

// Graph panel write path (docs/ORCHESTRATION.md §2.10, §13): the overlay
// enables glm-hourness/graph-panel and disables the graph row, so the face
// check sees what the panel row alone adds; the probe provider runs its
// /graph-apply handler for the session the way the panel's
// remote.commands.execute does: a comment, then a decide with the
// question's rev, both into the graph under the session working directory.
const panelDir = join(runDir, 'glm-graph-panel')
const panelWs = join(panelDir, 'ws')
const panelGraph = join(panelWs, 'docs', 'graph')
mkdirSync(panelGraph, { recursive: true })
const panelEngine = openEngine(panelGraph)
for (const node of [
  { type: 'goal', title: '探针目标' },
  { type: 'question', title: '探针问题', parent: 'goal-1', options: [{ key: 'A', label: '甲', consequence: '快' }, { key: 'B', label: '乙', consequence: '稳' }], recommend: 'B' },
]) {
  const seeded = await panelEngine.apply('human', { op: 'propose', reason: 'probe seed', node })
  if (!seeded.ok) throw new Error(`probe: seeding the panel graph failed: ${JSON.stringify(seeded.error)}`)
}
const panelQuestionRev = (await loadGraph(panelGraph)).revisions.get('question-1')
const graphPanel = runScenario('glm-graph-panel', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } }, command: { name: 'graph-apply', input: JSON.stringify({ op: 'comment', id: 'goal-1', text: 'probe comment' }) } },
  { text: 'done', live: true, command: { name: 'graph-apply', input: JSON.stringify({ op: 'decide', id: 'question-1', rev: panelQuestionRev, option: 'A', reason: 'probe decide' }) } },
], 'Read package.json, then reply done.', [...PANEL_ROW, '- id: glm-hourness/graph', '  disabled: true'], panelWs)
const panelCommands = graphPanel.steps.flatMap(step => step.command === undefined ? [] : [step.command])
const panelAfter = await loadGraph(panelGraph)
const panelLast = id => panelAfter.nodes.get(id)?.history.at(-1)
const panelStderr = existsSync(join(panelDir, 'stderr.txt')) ? readFileSync(join(panelDir, 'stderr.txt'), 'utf8') : ''

// Graph row (ROADMAP M2 2.11, docs/ORCHESTRATION.md §2.5, §2.7, §2.10): the
// overlay enables glm-hourness/graph on a copy of this repository's graph
// inside a scratch git workspace, with the directory as a literal path. The
// GLM session reads, is refused a done without evidence, comments, sets a
// focus, edits the focus title, then tries to write node files with Write
// and Bash; workspace-changes runs so the shadow fallback sees the turn.
// Three more scenarios: a non-GLM route, a compaction, and a goal round.
const repoGraph = join(repo, 'docs', 'graph')
const repoGraphBefore = (await loadGraph(repoGraph)).revision
const graphRowDir = join(runDir, 'glm-graph')
const graphWs = join(graphRowDir, 'ws')
const graphCopy = join(graphWs, 'docs', 'graph')
cpSync(join(repoGraph, 'nodes'), join(graphCopy, 'nodes'), { recursive: true })
writeFileSync(join(graphWs, 'README.md'), 'probe workspace\n')
const graphGitReady = initRepo(graphWs)
const graphRow = dir => ['- id: glm-hourness/graph', '  disabled: false', `  config: { dir: ${JSON.stringify(slash(dir))} }`]
const copyBefore = await loadGraph(graphCopy)
const parents = new Set([...copyBefore.nodes.values()].flatMap(node => node.parent === undefined ? [] : [node.parent]))
const leafTask = status => [...copyBefore.nodes.values()].find(node => node.type === 'task' && node.status === status && !parents.has(node.id))
const doingTask = leafTask('doing')
const focusTask = leafTask('approved')
const GRAPH_FILES_LINE = '- Change the project graph only with the graph tools; never write its files directly.'
const graphNodeFile = join(graphCopy, 'nodes', 'probe-direct.json')
const graphNotes = join(graphWs, 'notes.txt')
const graphRun = runScenario('glm-graph', 'glm-5.3', [
  { tool: { name: 'graph_show', arguments: { id: focusTask?.id } } },
  { tool: { name: 'graph_status', arguments: { id: doingTask?.id, rev: copyBefore.revisions.get(doingTask?.id ?? ''), to: 'done', reason: 'probe: done without evidence' } } },
  { tool: { name: 'graph_comment', arguments: { id: doingTask?.id, text: 'probe comment' } } },
  { tool: { name: 'graph_focus', arguments: { id: focusTask?.id } } },
  { tool: { name: 'Read', arguments: { file_path: join(graphWs, 'README.md') } } },
  { tool: { name: 'Bash', arguments: { command: 'Write-Output probe-graph' } } },
  { tool: { name: 'graph_edit', arguments: { id: focusTask?.id, rev: copyBefore.revisions.get(focusTask?.id ?? ''), set: { title: 'probe title' }, reason: 'probe: change the focus title' } } },
  { tool: { name: 'Write', arguments: { file_path: graphNodeFile, content: '{}\n' } } },
  { tool: { name: 'Bash', arguments: { command: `Set-Content -Path '${graphNodeFile}' -Value x` } } },
  { tool: { name: 'Write', arguments: { file_path: graphNotes, content: 'notes\n' } } },
  { text: 'done', status: true },
], 'Work on the project graph, then reply done.', [...graphRow(graphCopy), ...workspaceChangesRow('glm-hourness-probe/workspace-changes')], graphWs)
const graphSteps = graphRun.steps
const graphResult = index => lastToolResult(graphSteps[index])
const graphNotices = step => (step?.messages ?? []).filter(message => message.role === 'user' && message.source === 'glm-graph-projection')
const copyAfter = await loadGraph(graphCopy)
const graphViolations = jsonl(join(graphRowDir, 'home', 'audit', 'violations.jsonl'))
const graphStderr = existsSync(join(graphRowDir, 'stderr.txt')) ? readFileSync(join(graphRowDir, 'stderr.txt'), 'utf8') : ''
const graphFace = step => (step?.tools ?? []).filter(tool => GRAPH_TOOL_NAMES.includes(tool.name))

const plainGraph = runScenario('non-glm-graph', 'deepseek-probe', [
  { tool: { name: 'graph_open', arguments: {} } },
  { text: 'done' },
], 'List the open work, then reply done.', graphRow(graphCopy), graphWs)
const plainGraphOpen = lastToolResult(plainGraph.steps[1])

const compactGraph = runScenario('glm-graph-compact', 'glm-5.3', [
  { tool: { name: 'graph_focus', arguments: { id: focusTask?.id } } },
  { tool: { name: 'Read', arguments: { file_path: join(graphWs, 'README.md') } } },
  { tool: { name: 'Read', arguments: { file_path: join(graphWs, 'README.md') } } },
  { text: 'done' },
], 'Set the focus, read the README twice, then reply done.', [...graphRow(graphCopy), '- id: compaction-basic', '  config: { thresholdRatio: 0.02, retainTokens: 0 }'], graphWs)
/** Requests that carry a compaction checkpoint, and the projection reasons that follow it in each. */
const reanchored = compactGraph.steps.flatMap((step) => {
  const at = step.messages.findLastIndex(message => message.source === 'compact-checkpoint')
  return at < 0 ? [] : [step.messages.slice(at + 1).filter(message => message.source === 'glm-graph-projection').map(message => message.projection)]
})

const graphGoalDir = join(runDir, 'glm-graph-goal')
const graphGoalWs = join(graphGoalDir, 'ws')
mkdirSync(graphGoalWs, { recursive: true })
writeFileSync(join(graphGoalWs, 'evidence.txt'), 'evidence\n')
const graphGoal = runScenario('glm-graph-goal', 'glm-5.3', [
  { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_goal_run', input: { objective: 'Set the graph focus, then mark the goal complete in the next round.', cwd: graphGoalWs, evidence: 'evidence.txt', maxGoalRounds: 2 } } } },
  { text: 'done' },
], 'Run the goal probe, then reply done.', [...dispatchRow(join(graphGoalDir, 'dispatch.jsonl')), ...graphRow(graphCopy)], repo, [[
  { tool: { name: 'graph_focus', arguments: { id: focusTask?.id } } },
  { text: 'Focus set; the goal stays active for the next round.' },
  completeGoal,
  { text: 'Goal complete.' },
]])
const graphGoalCreated = dispatchRecord('glm-graph-goal').find(entry => entry.kind === 'goal-created')
const graphGoalSteps = bySession(graphGoal, graphGoalCreated?.agentId)
const graphRoundTwo = graphGoalSteps.find(step => step.messages.some(message => message.source === 'goal' && message.text.includes('\nRound: 2/2\n')))

// Run controls (docs/ORCHESTRATION.md §2.10 运行控制, m2-9): the graph and
// graph-panel rows on a seeded graph; the probe provider runs the real
// /graph-run handler mid-step, as the panel's remote.commands.execute does.
// Turn 1: start task-1 while the agent is busy (the followup waits for the
// turn to end), reply done. Turn 2 opens on the start message: the agent
// sets the focus; on the next step, while it runs on the node, stop task-1
// cancels the turn (keepInbox) before the scripted Bash runs, so the
// session asks nothing more. The pause notice is injected without a wake,
// so no request shows it here (L4 does).
const controlDir = join(runDir, 'glm-graph-run')
const controlWs = join(controlDir, 'ws')
const controlGraph = join(controlWs, 'docs', 'graph')
mkdirSync(controlGraph, { recursive: true })
const controlEngine = openEngine(controlGraph)
for (const node of [
  { type: 'goal', title: '探针目标' },
  { type: 'task', title: '探针任务', parent: 'goal-1', acceptance: ['probe acceptance'] },
]) {
  const seeded = await controlEngine.apply('human', { op: 'propose', reason: 'probe seed', node })
  if (!seeded.ok) throw new Error(`probe: seeding the run-control graph failed: ${JSON.stringify(seeded.error)}`)
}
const graphControl = runScenario('glm-graph-run', 'glm-5.3', [
  { text: 'done', command: { name: 'graph-run', input: 'start task-1' } },
  { tool: { name: 'graph_focus', arguments: { id: 'task-1' } }, status: true },
  { tool: { name: 'Bash', arguments: { command: 'Write-Output probe-after-stop' } }, live: true, command: { name: 'graph-run', input: 'stop task-1' } },
  { text: 'after stop' },
], 'Reply done.', [...PANEL_ROW, ...graphRow(controlGraph)], controlWs)
const controlSteps = bySession(graphControl, graphControl.steps[0]?.sessionId)
const controlCommands = controlSteps.flatMap(step => step.command === undefined ? [] : [step.command])
const controlHistory = ((await loadGraph(controlGraph)).nodes.get('task-1')?.history ?? []).filter(entry => entry.actor === 'human' && entry.op === 'comment').map(entry => entry.text)
const controlStart = (controlSteps[1]?.messages ?? []).find(message => message.role === 'user' && message.source === 'glm-graph-run')
const controlStderr = existsSync(join(controlDir, 'stderr.txt')) ? readFileSync(join(controlDir, 'stderr.txt'), 'utf8') : ''
const repoGraphAfter = (await loadGraph(repoGraph)).revision

// Live view (docs/ORCHESTRATION.md §2.10, m2-8): the graphLive projection
// the panel row registers, read mid-step from the session projection
// registry: the panel scenario's second step, the dispatch parent's last
// step and the child's last step.
const liveRead = steps => steps.find(step => step.live !== undefined)?.live ?? null
const panelRead = liveRead(graphPanel.steps)
const panelLive = panelRead?.graphLive ?? null
const parentCatalog = liveRead(dispatchMain)?.subagentCatalog ?? null
const childRead = liveRead(dispatchChild)
const childLive = childRead?.graphLive ?? null
const tokens = usage => usage === null || usage === undefined ? 0 : usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
const liveCalls = live => (live?.recent ?? []).map(call => `${call.name}:${call.ok ? 'ok' : 'error'}`)

const compactRequest = compacted.compactions[0]
const compactInstruction = compactRequest?.messages.at(-1)
const checkpoint = compacted.steps.at(-1)?.messages.find(message => message.source === 'compact-checkpoint')

// The memory row journals one usage record per model call from the
// llm/stream request fields (rc.3 GenerateOptions: provider, model,
// sessionId, purpose) into the user-level directory the data row provides
// (<DSH home>/glm-hourness, the scenario's dsh-home); the guard journals
// each denial into the project directory it reads from the data service.
const usageOf = scenario => jsonl(join(runDir, scenario, 'dsh-home', 'glm-hourness', 'audit', 'usage.jsonl'))
const glmUsage = usageOf('glm').filter(record => record.purpose === undefined)
const compactUsage = usageOf('glm-compact').filter(record => record.purpose === 'compaction')
const projectUsage = ['glm', 'glm-flash', 'glm-todo', 'glm-compact', 'glm-shadow', 'glm-guard-paths', 'non-glm', 'non-glm-guard', 'glm-no-dialect', 'glm-peak', 'limits-steps', 'limits-time', 'glm-dispatch', 'glm-goal', 'goal-headless'].filter(scenario => existsSync(join(runDir, scenario, 'home', 'audit', 'usage.jsonl')))
const glmViolations = jsonl(join(glmDir, 'home', 'audit', 'violations.jsonl'))
const stepLimits = jsonl(limitsRecord('limits-steps'))
const timeLimits = jsonl(limitsRecord('limits-time'))
const realUsageAfter = usageStamp()
// The workflow row journals dispatch calls by tool name; the names must be
// the ones the rc.3 composition registers.
const plainSubagentTools = [...plainTools].filter(name => name === 'subagent' || name === 'subagent_fork')

// Row health: the probe provider ran the bundle's /glm-status handler for
// the session at the last scripted step of a scenario. Each table line is
// `| package | row | status | reason |`; a package with no row loaded is one
// line whose row cell is 全部 (src/shared/health.ts).
const statusStep = scenario => scenario.steps.findLast(step => step.status !== undefined)
const TABLE_HEAD = '| 包 | 行 | 状态 | 说明 |'
const healthOf = (scenario) => {
  const step = statusStep(scenario)
  const lines = (step?.status ?? '').split('\n').filter(line => line.startsWith('| ') && line !== TABLE_HEAD && !line.startsWith('| ---'))
  return Object.fromEntries(lines.map((line) => {
    const [pkg, row, status, ...reason] = line.slice(2, -2).split(' | ')
    return [row, { package: pkg, status, reason: reason.join(' | ') }]
  }))
}
const packageOf = Object.fromEntries(HEALTH_PACKAGES.flatMap(entry => entry.rows.map(row => [row, entry.name])))
const grouped = health => HEALTH_ROWS.every(row => health[row]?.package === packageOf[row])
const glmHealth = healthOf(glm)
const plainHealth = healthOf(plain)
const compactHealth = healthOf(compacted)
const shadowHealth = healthOf(shadow)
const shadowRecords = jsonl(join(shadowDir, 'home', 'audit', 'violations.jsonl'))
const pathsViolations = jsonl(join(pathsDir, 'home', 'audit', 'violations.jsonl'))
const plainGuardViolations = jsonl(join(plainGuardDir, 'home', 'audit', 'violations.jsonl'))
const plainGuardHealth = healthOf(plainGuard)
const GUARD_SECTION = '# Workspace rules\nThe harness checks every tool call against these rules before it runs;'
const glmStatusText = statusStep(glm)?.status ?? ''
// /hourness at the same step: the panel prices the scenario's usage journal
// through the pricing service the glm-login row provides (src/shared/pricing.ts).
const plainStatusText = statusStep(plain)?.status ?? ''
const plainHourness = statusStep(plain)?.command
const glmHourness = statusStep(glm)?.command
const glmPanel = glmHourness?.text.split('## 面板\n')[1] ?? ''
const healthLine = (health, row) => health[row] === undefined ? `${row}: missing` : `${row}: ${health[row].status}`
const ACTED = '生效'
const IDLE = '已加载，本会话未触发'
const conversationTexts = [glm, plain, compacted, shadow].flatMap(scenario => scenario.steps.flatMap(step => [step.system, ...step.messages.map(message => message.text)]))


// The launcher rewrites the root config of the profile it boots
// (cordis.yml, written here as a bare []): the runs used the generated
// profile, found through DSH_HOME, and the real profiles directory did not
// gain it.
const generatedRoot = readFileSync(join(profile.dir, 'cordis.yml'), 'utf8')
const leakedProfile = existsSync(join(realProfiles, GENERATED_PROFILE))

const checks = [
  ['sandbox: the runtime booted the profile generated under the run directory (its cordis.yml rewritten by the launcher); the real profiles directory has no probe-full', generatedRoot.startsWith('# dsh profile root') && !leakedProfile, `cordis.yml ${generatedRoot.startsWith('# dsh profile root') ? 'rewritten' : 'untouched'}; ${join(realProfiles, GENERATED_PROFILE)} ${leakedProfile ? 'exists' : 'absent'}`],
  ['glm boot: the runtime reached the probe provider', glmFirst !== undefined, `exit ${glm.status}, ${glm.steps.length} step(s)`],
  ['graph panel: /graph-apply comments as the human in the graph under the session working directory', panelCommands[0]?.kind === 'success' && panelCommands[0].text === '已批注「探针目标」' && panelLast('goal-1')?.actor === 'human' && panelLast('goal-1')?.text === 'probe comment', JSON.stringify(panelCommands[0] ?? null)],
  ['graph panel: /graph-apply decides with the question rev as the human', panelCommands[1]?.kind === 'success' && panelCommands[1].text === '已拍板「探针问题」：A 甲' && panelAfter.nodes.get('question-1')?.status === 'done' && panelLast('question-1')?.actor === 'human' && panelLast('question-1')?.op === 'decide', JSON.stringify(panelCommands[1] ?? null)],
  ['graph live: the session view has the model, the steps of the open turn and the finished Read, nothing running, no focus', panelLive?.model === 'glm-5.3' && panelLive.steps >= 2 && typeof panelLive.turnSince === 'number' && panelLive.tool === null && panelLive.focus === null && liveCalls(panelLive).includes('Read:ok'), JSON.stringify(panelLive)],
  ['graph live: the dispatch parent\'s subagentCatalog names the child; the child view has its own model, the scope-denied Write as an error, and token usage', parentCatalog?.some(entry => entry.id === started?.childId) === true && childLive?.model === 'glm-5.3-flash' && liveCalls(childLive).includes('Write:error') && liveCalls(childLive).includes('Write:ok') && childRead?.tokenUsage !== null, `catalog ${JSON.stringify(parentCatalog)}; child ${childLive?.model ?? 'none'} ${liveCalls(childLive).join(', ')}; tokens ${tokens(childRead?.tokenUsage)} ${JSON.stringify(childRead?.tokenUsage ?? null)}`],
  ['graph row: the copy has a doing leaf task and an approved one; the workspace is a git repository', doingTask !== undefined && focusTask !== undefined && graphGitReady, `doing ${doingTask?.id ?? 'none'}, focus ${focusTask?.id ?? 'none'}, git ${graphGitReady}`],
  ['graph row: activates without warnings; rc.3 takes all 13 graph tools, resident in the GLM face (not deferred)', graphSteps.length > 0 && !graphStderr.includes('dsh-glm-hourness/graph:') && graphFace(graphSteps[0]).length === GRAPH_TOOL_NAMES.length && graphFace(graphSteps[0]).every(tool => tool.deferLoading !== true), `${graphFace(graphSteps[0]).length} graph tool(s); stderr mentions the row: ${graphStderr.includes('dsh-glm-hourness/graph:')}`],
  ['graph row: on a non-GLM route the graph tools are in the face and graph_open answers', GRAPH_TOOL_NAMES.every(name => names(plainGraph.steps[0]).has(name)) && plainGraphOpen?.isError !== true && plainGraphOpen?.text.includes('"items"') === true, `exit ${plainGraph.status}; ${plainGraphOpen?.text.slice(0, 80) ?? 'no result'}`],
  ['graph row: graph_show returns the projection; graph_status done without evidence gets evidence_required', graphResult(1)?.isError !== true && graphResult(1)?.text.includes('"projection"') === true && graphResult(2)?.isError === true && graphResult(2)?.text.includes('evidence_required') === true, `${graphResult(1)?.text.slice(0, 60) ?? 'none'} | ${graphResult(2)?.text.slice(0, 120) ?? 'none'}`],
  ['graph row: graph_comment leaves an llm history entry in the copy; the repository graph is unchanged', graphResult(3)?.isError !== true && copyAfter.nodes.get(doingTask?.id ?? '')?.history.at(-1)?.actor === 'llm' && copyAfter.nodes.get(doingTask?.id ?? '')?.history.at(-1)?.text === 'probe comment' && repoGraphBefore === repoGraphAfter, `repo graph ${repoGraphBefore} -> ${repoGraphAfter}`],
  ['graph row: after graph_focus the next request ends with the projection notice (focus); unchanged steps add none; a title edit adds one (changed)', graphNotices(graphSteps[4]).length === 1 && graphSteps[4]?.messages.at(-1)?.source === 'glm-graph-projection' && graphNotices(graphSteps[4])[0]?.projection === 'focus' && graphNotices(graphSteps[5]).length === 1 && graphNotices(graphSteps[6]).length === 1 && graphNotices(graphSteps[7]).length === 2 && graphSteps[7]?.messages.at(-1)?.projection === 'changed' && graphSteps[7]?.messages.at(-1)?.text.includes('probe title') === true, `notices per request: ${graphSteps.map(step => graphNotices(step).map(notice => notice.projection).join('+') || '0').join(', ')}`],
  ['graph row: after a compaction checkpoint the first request carries the projection again (compaction)', reanchored.some(reasons => reasons.includes('compaction')), `${compactGraph.compactions.length} compaction(s); after checkpoints: ${JSON.stringify(reanchored)}`],
  ['graph row: a goal round carries the projection (goal-round)', graphNotices(graphRoundTwo).some(notice => notice.projection === 'goal-round'), graphRoundTwo === undefined ? `no round 2 request (${graphGoalSteps.length} goal-agent request(s), exit ${graphGoal.status})` : graphNotices(graphRoundTwo).map(notice => notice.projection).join(', ')],
  ['graph row: Write and Bash into the copy\'s node files are denied by graph-files-only and journaled; a write elsewhere runs', [8, 9].every(index => graphResult(index)?.isError === true && graphResult(index)?.text.includes('inside the project graph') === true) && graphResult(10)?.isError !== true && !existsSync(graphNodeFile) && existsSync(graphNotes) && graphViolations.filter(record => record.rule === 'graph-files-only').map(record => record.tool).join(',') === 'Write,Bash', `records: ${graphViolations.map(record => `${record.rule}${record.mode === 'shadow' ? '(shadow)' : ''}:${record.tool ?? ''}`).join(', ')}`],
  ['graph row: the shadow fallback runs and counts the graph tool writes as known (no shadow record names a node file)', healthOf(graphRun).guard?.reason.includes('影子兜底：工作区变更记录') === true && graphViolations.filter(record => record.mode === 'shadow').every(record => record.paths.every(path => !path.startsWith('docs/graph/'))), JSON.stringify(graphViolations.filter(record => record.mode === 'shadow').map(record => record.paths))],
  ['graph row: the GLM rule section declares graph-files-only; /glm-status reports the graph row with the focus and the panel row in effect', graphSteps[0]?.system.includes(GRAPH_FILES_LINE) === true && healthOf(graphRun).graph?.status === ACTED && healthOf(graphRun).graph.reason.includes(`焦点 ${focusTask?.id}`) && healthOf(graphRun)['graph-panel']?.status === ACTED, `${healthLine(healthOf(graphRun), 'graph')} (${healthOf(graphRun).graph?.reason ?? ''}); ${healthLine(healthOf(graphRun), 'graph-panel')}`],
  ['graph run: /graph-run start mid-turn answers that the busy agent takes it next; the node history keeps the click as the human', controlCommands[0]?.kind === 'success' && controlCommands[0].text === '已让主 Agent 从「探针任务」开始做（它正忙，这一轮做完就接着做）' && controlHistory.includes(runNote('start')), `${JSON.stringify(controlCommands[0] ?? null)}; human comments ${JSON.stringify(controlHistory)}`],
  ['graph run: the start message opens the next turn as a glm-graph-run notice asking for graph_focus on the node', controlSteps[0]?.messages.every(message => message.source !== 'glm-graph-run') === true && controlStart?.text.includes('graph_focus {"id":"task-1"}') === true, controlStart === undefined ? `no notice in request 2 (${controlSteps.length} request(s), exit ${graphControl.status})` : controlStart.text.slice(0, 120).replace(/\n/g, ' ')],
  ['graph run: after graph_focus the live view stands the main agent on the node, mid-turn', controlSteps[2]?.live?.graphLive?.focus === 'task-1' && typeof controlSteps[2].live.graphLive.turnSince === 'number', JSON.stringify(controlSteps[2]?.live?.graphLive ?? null)],
  ['graph run: /graph-run stop on the running agent cancels its turn: the outcome line, the history entry, and no request after it (the scripted Bash never ran)', controlCommands[1]?.kind === 'success' && controlCommands[1].text === '已暂停「探针任务」：停下了主 Agent' && controlHistory.includes(`${runNote('stop')}：停下了主 Agent`) && controlSteps.length === 3, `${JSON.stringify(controlCommands[1] ?? null)}; ${controlSteps.length} request(s), exit ${graphControl.status}`],
  ['graph run: /glm-status reports graph-panel in effect, able to stop subagents; no warning from the row', healthOf(graphControl)['graph-panel']?.status === ACTED && healthOf(graphControl)['graph-panel'].reason.includes('能停子 agent') && !controlStderr.includes('graph-panel'), `${healthLine(healthOf(graphControl), 'graph-panel')} (${healthOf(graphControl)['graph-panel']?.reason ?? ''}); stderr mentions graph-panel: ${controlStderr.includes('graph-panel')}`],
  ['graph panel: the row adds nothing to the model face and activates without warnings', graphPanel.steps.length > 0 && graphPanel.steps.every(step => step.tools.every(tool => !tool.name.startsWith('graph_'))) && !panelStderr.includes('graph-panel'), `exit ${graphPanel.status}, ${graphPanel.steps.length} step(s); stderr mentions graph-panel: ${panelStderr.includes('graph-panel')}`],
  ['glm prompt: ZCode CLI prefix in the system prompt', glmFirst?.system.includes('You are ZCode, an interactive coding agent') === true, glmFirst === undefined ? 'no request' : glmFirst.system.slice(0, 80).replace(/\n/g, ' ')],
  ['glm prompt: DSH identity replaced', glmFirst !== undefined && !glmFirst.system.includes('powered by DeepSeek Harness'), ''],
  ['glm tools: ZCode-facing aliases present', zcodeFace.every(name => glmTools.has(name)), zcodeFace.filter(name => !glmTools.has(name)).join(', ') || 'all present'],
  ['glm tools: covered natives hidden', nativeFace.every(name => !glmTools.has(name)), nativeFace.filter(name => glmTools.has(name)).join(', ') || 'none visible'],
  ['glm tools: search controls present, deferred tools out of the face', searchControls.every(name => glmTools.has(name)) && !glmTools.has('TodoWrite') && !glmTools.has('web_fetch'), [...glmTools].filter(name => ['TodoWrite', 'web_fetch'].includes(name)).join(', ') || `${glmTools.size} tools`],
  ['glm announcement: deferred names announced in the first request', firstAnnouncement?.text.includes('available via LocalToolSearch') === true && firstAnnouncement.text.includes('\nTodoWrite\n'), firstAnnouncement === undefined ? 'no notice' : firstAnnouncement.text.slice(0, 80).replace(/\n/g, ' ')],
  ['glm announcement: not repeated on later steps', announcements(glm.steps.at(-1)).length === 1, `${announcements(glm.steps.at(-1)).length} notice(s) in the last request`],
  ['glm search: LocalToolSearch returned the definition and the loaded reminder', searchResult !== undefined && searchResult.isError !== true && searchResult.text.includes('<functions>\n<function>{"description":') && searchResult.text.includes('Loaded: TodoWrite. Call it now with DeferredToolCall'), searchResult === undefined ? 'no tool result' : searchResult.text.slice(0, 80).replace(/\n/g, ' ')],
  ['glm deferred call: DeferredToolCall ran TodoWrite', deferredResult !== undefined && deferredResult.isError !== true && deferredResult.text.length > 0, deferredResult === undefined ? 'no tool result' : deferredResult.text.slice(0, 80).replace(/\n/g, ' ')],
  ['glm tools: Read, Write and Edit carry the ZCode 3.16.3 descriptions and schemas', glmTool('Read')?.description.startsWith('Reads a file from the local filesystem.\n\n- `file_path` must be an absolute path.') === true && !glmTool('Read').description.includes('Reads videos') && glmTool('Write')?.description.startsWith('Writes a file to the local filesystem, overwriting if one exists.') === true && glmTool('Edit')?.description.startsWith('Performs exact string replacement in a file.') === true && ['Read', 'Write', 'Edit'].every(name => glmTool(name)?.parameters.$schema === zcodeSchema), ['Read', 'Write', 'Edit'].map(name => `${name}: ${(glmTool(name)?.description ?? 'missing').slice(0, 30)}`).join('; ')],
  ['glm tools: Write and Edit declare the native sandbox escalation fields exactly when the natives do', ['write', 'edit'].every((nativeName) => {
    const nativeHas = plainToolOf(plainFirst, nativeName)?.parameters.properties?.sandbox_permissions !== undefined
    const aliasHas = glmTool(nativeName === 'write' ? 'Write' : 'Edit')?.parameters.properties?.sandbox_permissions !== undefined
    return plainFirst !== undefined && nativeHas === aliasHas
  }), `native write escalation: ${plainToolOf(plainFirst, 'write')?.parameters.properties?.sandbox_permissions !== undefined}`],
  ['glm execution: Read alias returned the file in cat -n form', readResult !== undefined && readResult.isError !== true && readResult.text.startsWith('1\t{\n') && readResult.text.includes('\t  "name": "dsh-glm-hourness",'), readResult === undefined ? 'no tool result' : readResult.text.slice(0, 80).replace(/\n/g, ' ')],
  ['glm execution: Write alias created the file with the ZCode result text', writeResult !== undefined && writeResult.isError !== true && writeResult.text.startsWith('File created successfully at: ') && writeResult.text.endsWith('no need to Read it back)'), writeResult === undefined ? 'no tool result' : writeResult.text.slice(0, 80).replace(/\n/g, ' ')],
  ['glm execution: Edit alias replaced all occurrences (replace_all "true")', editResult !== undefined && editResult.isError !== true && editResult.text.includes('has been updated. All occurrences were successfully replaced.'), editResult === undefined ? 'no tool result' : editResult.text.slice(0, 100).replace(/\n/g, ' ')],
  ['glm execution: Read alias shows the edited file (offset 0 reads from line 1)', rereadResult !== undefined && rereadResult.isError !== true && rereadResult.text === '1\tgamma beta gamma', rereadResult === undefined ? 'no tool result' : rereadResult.text.slice(0, 80).replace(/\n/g, ' ')],
  ['glm execution: Write over an existing file that was never read fails and leaves it intact', overwriteResult?.isError === true && readFileSync(unread, 'utf8') === 'existing\n', overwriteResult === undefined ? 'no tool result' : overwriteResult.text.slice(0, 100).replace(/\n/g, ' ')],
  ['glm tools: Glob, Grep, Bash and TodoWrite carry the 3.16.3 texts with the documented localizations', glmTool('Glob')?.description.startsWith('Fast file pattern matching. Supports glob patterns like') === true
    && glmTool('Grep')?.description.startsWith('Content search built on ripgrep.') === true && !glmTool('Grep').description.includes('multiline')
    && properties(glmTool('Grep')).includes('-i') && properties(glmTool('Grep')).includes('type') && !properties(glmTool('Grep')).some(key => ['-A', '-B', '-C', 'context', '-o', 'multiline'].includes(key))
    && glmTool('Bash')?.description.startsWith('Executes a PowerShell command and returns its output.') === true && properties(glmTool('Bash')).includes('timeout') && !properties(glmTool('Bash')).includes('dangerouslyDisableSandbox')
    && ['Glob', 'Grep', 'Bash'].every(name => glmTool(name)?.parameters.$schema === zcodeSchema)
    && searchResult?.text.includes('Create and update a task list for the current session.') === true, ['Glob', 'Grep', 'Bash'].map(name => `${name}: ${(glmTool(name)?.description ?? 'missing').slice(0, 30)}`).join('; ')],
  ['glm tools: Bash declares run_in_background and the escalation fields exactly when pwsh does', ['run_in_background', 'sandbox_permissions', 'justification'].every(field => plainFirst !== undefined && properties(plainToolOf(plainFirst, 'pwsh')).includes(field) === properties(glmTool('Bash')).includes(field)), `Bash: ${properties(glmTool('Bash')).join(', ')}`],
  ['glm execution: Glob lists both scratch files newest first with ZCode display paths', globResult !== undefined && globResult.isError !== true && /\/glm\/scratch\.txt\n.*\/glm\/unread\.txt$/.test(globResult.text) && !globResult.text.includes('\\'), globResult === undefined ? 'no tool result' : globResult.text.slice(0, 160).replace(/\n/g, ' | ')],
  ['glm execution: Grep -i in content mode returns the package name line', grepResult !== undefined && grepResult.isError !== true && grepResult.text === 'package.json:2:  "name": "dsh-glm-hourness",', grepResult === undefined ? 'no tool result' : grepResult.text.slice(0, 100).replace(/\n/g, ' | ')],
  ['glm execution: Bash ran the command through pwsh without a description', bashResult !== undefined && bashResult.isError !== true && bashResult.text.includes('probe-bash'), bashResult === undefined ? 'no tool result' : bashResult.text.slice(0, 100).replace(/\n/g, ' | ')],
  ['glm image: Read keeps the ZCode image line on both models (ZCode does not condition it on image input)', glmTool('Read')?.description.includes(READ_IMAGE_LINE) === true && (flash.steps[0]?.tools ?? []).find(tool => tool.name === 'Read')?.description.includes(READ_IMAGE_LINE) === true, `flash steps: ${flash.steps.length}`],
  ['glm image: on text-only GLM-5.3 read_image refuses the PNG and no image reaches the request', imageRefusal?.isError === true && imageRefusal.text.includes('does not declare image input') && imageFree(glm.steps), imageRefusal === undefined ? 'no tool result' : imageRefusal.text.slice(0, 120).replace(/\n/g, ' ')],
  ['glm-flash image: Read returns the read_image envelope with one image block', flashRead !== undefined && flashRead.isError !== true && flashRead.images === 1 && flashRead.text.includes('<type>image</type>'), flashRead === undefined ? `no tool result (exit ${flash.status})` : `${flashRead.images ?? 0} image(s): ${flashRead.text.slice(0, 80).replace(/\n/g, ' ')}`],
  ['glm-flash wire: the glm-zcode encoder sends the PNG inside tool_result as a base64 image block', flashWire?.images?.length === 1 && flashWire.images[0].where === 'tool_result' && flashWire.images[0].mediaType === 'image/png' && flashWire.images[0].png === true && flashWire.images[0].base64Length > 0, JSON.stringify(flashWire ?? null)],
  ['glm todo: a scripted turn carries two parallel tool calls', todoParallel?.length === 2, `steps: ${todo.steps.length}, calls in the first Read turn: ${todoParallel?.join(', ') ?? 'none'}`],
  ['glm todo: the reminder fires once, before the twelfth request (10 assistant turns after TodoWrite)', todo.steps.length === 12 && todoReminderSteps.length === 1 && todoReminderSteps[0] === 12, `reminder in request(s): ${todoReminderSteps.join(', ') || 'none'} of ${todo.steps.length}`],
  ['glm todo: the reminder is the wrapped ZCode text with the todo echo, after the last tool results', todoNotice !== undefined && todoNotice.text.startsWith("<system-reminder>\nThe TodoWrite tool hasn't been used recently.") && todoNotice.text.endsWith('[1. [in_progress] probe todo]\n</system-reminder>') && todoNoticeIndex > todoLastResult, todoNotice === undefined ? 'no notice' : `${todoNotice.text.slice(-60).replace(/\n/g, ' ')} (at ${todoNoticeIndex}, last tool result at ${todoLastResult})`],
  ['glm peak: with the probe clock at Wednesday 15:00 UTC+8 the first GLM request carries the wrapped peak reminder once', peakWindowAt(peak.steps[0]?.clock) === '2026-10-28' && peakFirst.length === 1 && peakFirst[0].text === PEAK_NOTICE, peak.steps[0] === undefined ? `no request (exit ${peak.status})` : `clock ${new Date(peak.steps[0].clock).toISOString()}, ${peakFirst.length} notice(s): ${(peakFirst[0]?.text ?? '').slice(0, 60).replace(/\n/g, ' ')}`],
  ['glm peak: the reminder persists in the session and is not repeated on later steps', peak.steps.length === 3 && peakNotices(peak.steps.at(-1)).length === 1 && peakCountsMatch(peak), `notices per request: ${peak.steps.map(step => peakNotices(step).length).join(', ')}`],
  ['glm peak (real clock): the GLM scenario carries a reminder exactly for the peak windows its requests fell in', peakCountsMatch(glm), `windows: ${[...new Set(glm.steps.map(step => peakWindowAt(step.clock) ?? 'off-peak'))].join(', ')}; notices per request: ${glm.steps.map(step => peakNotices(step).length).join(', ')}`],
  ['non-glm peak: a non-GLM session in peak hours gets no peak reminder', plainFirst !== undefined && peakWindowAt(plainFirst.clock) === '2026-10-28' && peakNotices(plainFirst).length === 0, plainFirst === undefined ? 'no request' : `clock ${new Date(plainFirst.clock).toISOString()}, ${peakNotices(plainFirst).length} notice(s)`],
  ['glm compact: the summarization request ends with the ZCode compact prompt', compactInstruction?.role === 'user' && compactInstruction.text.startsWith('CRITICAL: Respond with TEXT ONLY.'), compactRequest === undefined ? `no compaction request (exit ${compacted.status})` : compactInstruction?.text.slice(0, 60).replace(/\n/g, ' ')],
  ['glm compact: the checkpoint carries the formatted summary', checkpoint !== undefined && checkpoint.text.includes('Summary:\nprobe summary') && !checkpoint.text.includes('<analysis>'), checkpoint === undefined ? 'no checkpoint in the next request' : checkpoint.text.slice(0, 80).replace(/\n/g, ' ')],
  ['memory usage: one record per GLM step with the request provider, model and session id', glmUsage.length === glm.steps.length && glmUsage.every(record => record.provider === 'glm-probe' && record.model === 'glm-5.3' && typeof record.sessionId === 'string' && record.sessionId.length > 0), `${glmUsage.length} record(s) for ${glm.steps.length} step(s); first: ${JSON.stringify(glmUsage[0] ?? null).slice(0, 120)}`],
  ['memory usage: the compaction call is recorded with purpose compaction', compactUsage.length === compacted.compactions.length && compactUsage.length > 0, `${compactUsage.length} compaction record(s) for ${compacted.compactions.length} request(s)`],
  ['data: usage lands only in the user-level directory, never in a project directory or the real one', projectUsage.length === 0 && realUsageBefore === realUsageAfter, `project usage files: ${projectUsage.join(', ') || 'none'}; real ${realUsage}: ${realUsageBefore} -> ${realUsageAfter}`],
  ['guard: a shell write is denied with the four-part correction naming the ZCode tools, and the file is not created', blockedResult?.isError === true && blockedResult.text.includes('Shell file writes are not permitted') && blockedResult.text.includes(RIGHT_PATH_ZCODE) && !existsSync(blocked), blockedResult === undefined ? 'no tool result' : blockedResult.text.slice(0, 100).replace(/\n/g, ' ')],
  ['guard: the denial is journaled in the scenario project directory with rule, tool and the calling agent ids', glmViolations.length === 1 && glmViolations[0].rule === 'file-tools-only' && glmViolations[0].tool === 'Bash' && typeof glmViolations[0].agentId === 'string' && glmViolations[0].agentId.length > 0 && glmViolations[0].sessionId === glmUsage[0]?.sessionId, `${glmViolations.length} record(s); first: ${JSON.stringify(glmViolations[0] ?? null).slice(0, 140)}`],
  ['guard: the GLM system prompt declares the active rules (containment and file-tools-only) after the dialect sections; the non-GLM prompt does not', glmFirst?.system.includes(GUARD_SECTION) === true && glmFirst.system.includes('\n- You may only create and modify files inside the user\'s workspace.') && glmFirst.system.includes('\n- Modify files and code only with the dedicated Write/Edit tools.') && glmFirst.system.indexOf(GUARD_SECTION) > glmFirst.system.indexOf('# Context management') && plainFirst !== undefined && !plainFirst.system.includes('# Workspace rules'), glmFirst === undefined ? 'no request' : `section at ${glmFirst.system.indexOf(GUARD_SECTION)} of ${glmFirst.system.length}`],
  ['guard: quoted =>, -> and >>> and a git subcommand with a quoted arrow run through Bash', arrowsResult !== undefined && arrowsResult.isError !== true && arrowsResult.text.includes('a => b -> c >>> d') && gitResult !== undefined && gitResult.isError !== true && gitResult.text.includes('init => '), `${(arrowsResult?.text ?? 'no tool result').slice(0, 60).replace(/\n/g, ' ')} | ${(gitResult?.text ?? 'no tool result').slice(0, 60).replace(/\n/g, ' ')}`],
  ['guard shadow: a .NET file write the reader cannot see runs, and Write creates its file (shadow mode never blocks)', gitReady && dotnetResult !== undefined && dotnetResult.isError !== true && existsSync(shadowFile) && existsSync(toolFile), `git repo: ${gitReady}; ${(dotnetResult?.text ?? 'no tool result').slice(0, 80).replace(/\n/g, ' ')}`],
  ['guard shadow: one shadow record names the shell-written file, not the Write target, with the turn, the session and the three shell calls', shadowRecords.length === 1 && shadowRecords[0].mode === 'shadow' && shadowRecords[0].rule === 'file-tools-only' && JSON.stringify(shadowRecords[0].paths) === '["shadow.txt"]' && typeof shadowRecords[0].turn === 'number' && shadowRecords[0].calls?.length === 3 && shadowRecords[0].calls.some(call => call.tool === 'Bash' && call.command === dotnetWrite) && shadowRecords[0].sessionId === statusStep(shadow)?.sessionId, `${shadowRecords.length} record(s); first: ${JSON.stringify(shadowRecords[0] ?? null).slice(0, 200)}`],
  ['guard paths: on GLM a relative Write inside the workspace resolves against the session directory and runs', relativeResult !== undefined && relativeResult.isError !== true && existsSync(relativeFile), relativeResult === undefined ? `no tool result (exit ${guardPaths.status})` : relativeResult.text.slice(0, 100).replace(/\n/g, ' ')],
  ['guard paths: on GLM a relative target climbing out with .. is denied by workspace-containment, journaled, and not written', escapeResult?.isError === true && escapeResult.text.includes('That path is outside the workspace') && escapeResult.text.includes(`(resolves to "${escapedFile}")`) && !existsSync(escapedFile) && pathsViolations.length === 1 && pathsViolations[0].rule === 'workspace-containment', `${(escapeResult?.text ?? 'no tool result').slice(0, 120).replace(/\n/g, ' ')}; ${pathsViolations.length} record(s)`],
  ['guard scope: on a non-GLM route the guard stays out: a relative write and a shell write both run, nothing is journaled', plainWriteResult !== undefined && plainWriteResult.isError !== true && existsSync(join(plainGuardWs, 'rel.txt')) && plainShellResult !== undefined && plainShellResult.isError !== true && existsSync(plainShellFile) && plainGuardViolations.length === 0, `write: ${(plainWriteResult?.text ?? 'no tool result').slice(0, 60).replace(/\n/g, ' ')} | pwsh: ${(plainShellResult?.text ?? 'no tool result').slice(0, 60).replace(/\n/g, ' ')}; ${plainGuardViolations.length} record(s)`],
  ['guard scope: the non-GLM session reports the guard out of scope with the route', plainGuardHealth.guard?.status === '未生效' && plainGuardHealth.guard.reason === '非 GLM 路由 glm-probe/deepseek-probe，门禁不介入', JSON.stringify(plainGuardHealth.guard ?? null)],
  ['glm-no-dialect: with glm-prompt disabled the GLM face is the natives (pwsh, no Bash)', noDialectFirst !== undefined && names(noDialectFirst).has('pwsh') && !names(noDialectFirst).has('Bash') && !names(noDialectFirst).has('Write'), noDialectFirst === undefined ? `no request (exit ${noDialect.status})` : [...names(noDialectFirst)].filter(name => ['pwsh', 'Bash', 'write', 'Write'].includes(name)).join(', ')],
  ['glm-no-dialect: the guard still denies a pwsh shell write on GLM, journals it under the called name, and corrects in native names', noDialectResult?.isError === true && noDialectResult.text.includes('Shell file writes are not permitted') && noDialectResult.text.includes(RIGHT_PATH_NATIVE) && !existsSync(noDialectFile) && noDialectViolations.length === 1 && noDialectViolations[0].rule === 'file-tools-only' && noDialectViolations[0].tool === 'pwsh', `${(noDialectResult?.text ?? 'no tool result').split('\n')[2] ?? ''}; ${noDialectViolations.length} record(s)`],
  ['glm-no-dialect: the GLM rule declaration names the native file tools', noDialectFirst?.system.includes(GUARD_SECTION) === true && noDialectFirst.system.includes('\n- Modify files and code only with the dedicated write/edit tools.'), noDialectFirst === undefined ? 'no request' : `section at ${noDialectFirst.system.indexOf(GUARD_SECTION)}`],
  ['health: the guard names the shadow fallback: on with workspace-changes mounted, off without it', shadowHealth.guard?.status === ACTED && shadowHealth.guard.reason.endsWith('影子兜底：工作区变更记录') && glmHealth.guard?.reason.endsWith('影子兜底未启用（组合里没有 workspace-changes）') === true, `${JSON.stringify(shadowHealth.guard ?? null)} | ${JSON.stringify(glmHealth.guard ?? null)}`],
  ['workflow: the runtime subagent tools are journaled dispatch names', plainSubagentTools.length === 2 && plainSubagentTools.every(name => DISPATCH_TOOLS.includes(name)), `runtime subagent tools: ${plainSubagentTools.join(', ') || 'none'}`],
  ['health: /glm-status prints the credential line and the health table of the session, one line per bundle row with its package', glmStatusText.startsWith('glm-zcode：未登录（套餐 coding-plan）') && glmStatusText.includes(`## 行健康（会话 ${statusStep(glm)?.sessionId}）\n\n${TABLE_HEAD}`) && HEALTH_ROWS.every(row => glmHealth[row] !== undefined) && Object.keys(glmHealth).length === HEALTH_ROWS.length && grouped(glmHealth), `${Object.keys(glmHealth).length} row(s), grouped ${grouped(glmHealth)}; ${glmStatusText.split('\n')[0]}`],
  ['health: /hourness-status prints the same table as /glm-status for the session, without the credential line', plainHourness?.kind === 'success' && plainHourness.text.startsWith(`## 行健康（会话 ${statusStep(plain)?.sessionId}）\n\n${TABLE_HEAD}`) && plainHourness.text === plainStatusText.slice(plainStatusText.indexOf('\n\n') + 2) && grouped(plainHealth), `${plainHourness?.kind ?? 'not run'}; ${(plainHourness?.text ?? '').split('\n').length} line(s); same as /glm-status: ${plainHourness?.text === plainStatusText.slice(plainStatusText.indexOf('\n\n') + 2)}`],
  ['health: on the GLM route glm-prompt, guard, memory, workflow, data and glm-login report in effect; glm-compact and hourness have not acted', glmHealth['glm-prompt']?.status === ACTED && glmHealth['glm-prompt'].reason.startsWith('GLM 路由 glm-probe/glm-5.3：') && ['guard', 'memory', 'workflow', 'data', 'glm-login'].every(row => glmHealth[row]?.status === ACTED) && ['glm-compact', 'hourness'].every(row => glmHealth[row]?.status === IDLE), HEALTH_ROWS.map(row => healthLine(glmHealth, row)).join('; ')],
  ['pricing: /hourness on the GLM route prices the usage journal through the pricing service glm-login provides', glmHourness?.kind === 'success' && glmPanel.startsWith('- 全部用量记录；高峰为工作日 14:00–18:00（UTC+8）') && /^- glm-5\.3：\d+ 次 · 积分 \d+\.\d\d/m.test(glmPanel), `${glmHourness?.kind ?? 'not run'}; ${JSON.stringify(glmPanel.split('\n').slice(0, 3))}`],
  ['health: on the non-GLM route glm-prompt reports why it is not in effect', plainHealth['glm-prompt']?.status === '未生效' && plainHealth['glm-prompt'].reason.startsWith('非 GLM 路由 glm-probe/deepseek-probe'), JSON.stringify(plainHealth['glm-prompt'] ?? null)],
  ['health: after a GLM compaction glm-compact reports the mirror in effect', compactHealth['glm-compact']?.status === ACTED && compactHealth['glm-compact'].reason.startsWith('GLM 压缩请求改用 ZCode 指令'), JSON.stringify(compactHealth['glm-compact'] ?? null)],
  ['health: the reports stay out of the model-visible conversation', conversationTexts.length > 0 && conversationTexts.every(text => !text.includes('行健康') && !text.includes('glmHournessHealth')), `${conversationTexts.length} text(s) checked`],
  ['calibration limits: the step past maxSteps is rejected, the turn ends blocked and the run exits non-zero', stepLimited.steps.length === 2 && stepLimits.length === 1 && stepLimits[0].kind === 'step-limit' && stepLimited.status !== 0, `exit ${stepLimited.status}, ${stepLimited.steps.length} step(s), record: ${JSON.stringify(stepLimits)}`],
  ['calibration limits: the time limit cancels a running 60-second shell command and no later step runs', timeLimited.steps.length === 1 && timeLimits.length === 1 && timeLimits[0].kind === 'time-limit' && timeLimited.elapsedMs < 45_000 && timeLimited.status !== 0, `exit ${timeLimited.status} after ${Math.round(timeLimited.elapsedMs / 1000)} s, ${timeLimited.steps.length} step(s), record: ${JSON.stringify(timeLimits)}`],
  ['dispatch (a): a host-level row starts a background child through subagents.startActivation; the dispatch call returns at once with the reserved child id', started !== undefined && started.childId.startsWith('probe-task-') && lastToolResult(dispatchMain[1])?.isError !== true && lastToolResult(dispatchMain[1])?.text.includes(started.childId) === true && dispatchChild.length > 0, started === undefined ? `no start recorded (exit ${dispatch.status}): ${JSON.stringify(dispatchNotes.find(entry => entry.kind === 'dispatch-failed') ?? null)}` : `child ${started.childId}: ${dispatchChild.length} request(s)`],
  ['dispatch (a): the child gets the prompt, runs in the requested cwd and on the agentOptions model', childFirstUser?.text.startsWith(CHILD_PROMPT) === true && childBash?.isError !== true && childBash?.text.trim() === dispatchWs && dispatchChild.every(step => step.model === 'glm-5.3-flash') && dispatchMain.every(step => step.model === 'glm-5.3'), `prompt: ${(childFirstUser?.text ?? 'none').slice(0, 60).replace(/\n/g, ' ')}; cwd: ${(childBash?.text ?? 'no tool result').trim()}; models: ${[...new Set(dispatchChild.map(step => step.model))].join(', ')}`],
  ['dispatch (a): the parent keeps working while the child runs (its next two steps come before the child finishes, without a completion notice)', dispatchMain.length === 4 && dispatchChild.length >= 4 && dispatchMain[2].clock < dispatchChild.at(-1).clock && [1, 2].every(index => messagesOf(dispatchMain[index], 'subagent-settled').length === 0), `parent clocks ${dispatchMain.map(step => step.clock - (dispatchMain[0]?.clock ?? 0)).join(', ')} ms; child clocks ${dispatchChild.map(step => step.clock - (dispatchMain[0]?.clock ?? 0)).join(', ')} ms`],
  ['dispatch (a): the completion notice reaches the parent with the structured result; the activation result carries it too', settled.length === 1 && settled[0].text.includes(`Structured result: ${JSON.stringify(HAND_BACK)}`) && childResult?.stopReason === 'completed' && JSON.stringify(childResult.structured) === JSON.stringify(HAND_BACK), `${(settled[0]?.text ?? 'no notice').slice(-120).replace(/\n/g, ' | ')}; result: ${JSON.stringify(childResult ?? null).slice(0, 120)}`],
  ['dispatch (b): tools/pre-execute sees each child call with the child agent, whose id maps to the task; the parent\'s calls do not map', childCalls.length === 5 && childCalls.every(entry => entry.task === 'T1' && entry.agentId === started?.childId && entry.sessionId === started.childId && entry.nested === false) && JSON.stringify(childCalls.map(entry => entry.tool)) === JSON.stringify(['Bash', 'Write', 'Write', 'DeferredToolCall', 'structured_output']), childCalls.map(entry => entry.tool).join(', ') || 'no calls recorded'],
  ['dispatch (b): a write outside the task scope is denied and reaches the child as a tool error; the write inside the scope runs', scopeDenied?.isError === true && scopeDenied.text.includes(SCOPE_DENIAL) && !existsSync(outsideFile) && existsSync(insideFile) && readFileSync(insideFile, 'utf8') === 'inside\n' && dispatchNotes.filter(entry => entry.kind === 'scope-deny').length === 1, scopeDenied === undefined ? 'no tool result' : scopeDenied.text.slice(0, 100).replace(/\n/g, ' ')],
  ['dispatch (b): the child session header keeps the parent directory; the requested cwd is only the child working directory', childCalls.length > 0 && childCalls.every(entry => entry.headerCwd === repo) && childBash?.text.trim() === dispatchWs, `header cwd ${childCalls[0]?.headerCwd ?? 'none'}`],
  ['goal (c): a plugin-created goal on a second root agent gets round 1 from the driver, and the notice appended in agent/pre-step enters with it', goalCreated?.root === true && goalCreated.goal?.activation === 'armed' && roundOf(goalSteps[0], 1) && projections(goalSteps[0]).length === 1 && firstRoundOrder[0] >= 0 && firstRoundOrder[1] > firstRoundOrder[0], goalSteps[0] === undefined ? `no goal-agent request (exit ${goalRun.status})` : `sources: ${goalSteps[0].messages.map(message => message.source ?? message.role).slice(-6).join(', ')}`],
  ['goal (c): update_goal complete through DeferredToolCall is denied in tools/pre-execute and the goal stays active', gateDenied?.isError === true && gateDenied.text.includes(GOAL_GATE_DENIAL) && goalGates[0]?.decision === 'deny' && goalGates[0].goal?.phase === 'active' && goalGates[0].goal.roundsStarted === 1, gateDenied === undefined ? 'no tool result' : gateDenied.text.slice(0, 100).replace(/\n/g, ' ')],
  ['goal (c): the driver starts round 2 after the round that carried the notice; each round carries one notice; no round 3', goalSteps.length === 5 && roundOf(goalSteps[3], 2) && projections(goalSteps[3]).length === 2 && goalSteps.every(step => !roundOf(step, 3)), `${goalSteps.length} goal-agent request(s); notices per request: ${goalSteps.map(step => projections(step).length).join(', ')}`],
  ['goal (c): with the evidence present the gate allows complete in round 2; the goal ends complete and disarmed after 2 rounds', goalGates.length === 2 && goalGates[1].decision === 'allow' && goalCompleted?.isError !== true && goalCompleted?.text.includes('"phase":"complete"') === true && goalFinal?.goal?.phase === 'complete' && goalFinal.goal.roundsStarted === 2 && goalFinal.goal.activation === 'disarmed' && goalRunResult?.text.includes('"phase":"complete"') === true, JSON.stringify(goalFinal ?? null).slice(0, 160)],
  ['goal (headless): the one-shot runner exits at its agent\'s first quiescent idle, so an armed goal created in the task turn gets no round', headlessCreated?.isError !== true && headlessCreated?.text.includes('"activation":"armed"') === true && headlessGoal.steps.length === 2 && headlessGoal.steps.every(step => roundMessages(step).length === 0), `exit ${headlessGoal.status}, ${headlessGoal.steps.length} step(s); ${(headlessCreated?.text ?? 'no tool result').slice(0, 80)}`],
  ['non-glm boot: the runtime reached the probe provider', plainFirst !== undefined, `exit ${plain.status}, ${plain.steps.length} step(s)`],
  ['non-glm prompt: DSH identity untouched', plainFirst?.system.includes('powered by DeepSeek Harness') === true && !plainFirst.system.includes('You are ZCode'), ''],
  ['non-glm tools: natives present, no aliases', plainFirst !== undefined && nativeFace.every(name => plainTools.has(name)) && zcodeFace.every(name => !plainTools.has(name)), zcodeFace.filter(name => plainTools.has(name)).join(', ') || ''],
  ['non-glm tools: no search controls, no announcement', plainFirst !== undefined && searchControls.every(name => !plainTools.has(name)) && announcements(plainFirst).length === 0, ''],
]

let failed = 0
for (const [label, ok, detail] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}
console.log(`probe: ${checks.length - failed}/${checks.length} passed; run artifacts in ${runDir}`)

// Profile guard: a change to the project part of a user profile voids the
// run (the probe may have written there, or someone changed this project's
// rows meanwhile); other changes, usually the desktop's own writes, are listed.
const profileChanges = GUARDED_PROFILES.flatMap((name) => {
  const after = readShape(name)
  if (typeof after === 'string') return [{ name, text: `unreadable after the run (${after})`, project: true }]
  return compareShapes(shapesBefore.get(name), after).map(difference => ({ name, text: describeDifference(difference), project: isProjectDifference(difference) }))
})
for (const change of profileChanges.filter(item => !item.project)) console.log(`probe guard: ${change.name} profile: ${change.text} (not this project's part; not counted)`)
const voiding = profileChanges.filter(item => item.project)
if (voiding.length > 0) {
  for (const change of voiding) console.error(`probe guard: ${change.name} profile: ${change.text}`)
  console.error('probe: the project part of a user profile changed during the run; the result is void, rerun (a second occurrence is a probe defect)')
  process.exit(2)
}
process.exit(failed === 0 ? 0 : 1)
