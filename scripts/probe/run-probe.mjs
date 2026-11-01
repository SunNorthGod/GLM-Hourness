/**
 * L3 behavior probe (docs/DEVELOPMENT.md §3, ROADMAP M1.7): boots the real
 * desktop DSH runtime headless on a generated profile with the probe
 * provider (scripts/probe/probe-llm.mjs), runs scripted tasks, and checks
 * what the GLM-Hourness rows actually did to the model-visible request.
 *
 * Scenarios: a GLM route must get the ZCode dialect; a non-GLM route through
 * the same provider must keep the DSH prompt and tools (no dialect leak),
 * while the orchestration rows, the guard among them, act on every route
 * (docs/ORCHESTRATION.md §6.2). The guard's shadow scenario runs in a scratch git repository under the run
 * directory with dsh-workspace-changes mounted through the overlay. Two
 * scenarios check the calibration run bounds (scripts/calibrate/limits.mjs).
 * The peak scenario and the non-GLM one run on the probe clock
 * (scripts/probe/probe-clock.mjs), set inside a peak window. Three
 * scenarios run the dispatch feasibility spike
 * (scripts/probe/probe-dispatch.mjs): a background child with a write
 * scope, a plugin-created goal driven through two rounds, and the headless
 * runner's exit with an armed goal. The rules board scenarios run in scratch
 * git repositories with the row enabled by the overlay: rules-peak and
 * rules-peak-hourness drive /rules peak, glm-rules and non-glm-rules run
 * calls past a rules file that blocks one command and only informs about
 * another, rules-queue and rules-handover run a call a rule queues: the
 * agent is told when the ticket clears, and the ticket of a subagent that
 * ends goes to the agent that dispatched it; rules-peak (the main agent's
 * line about the peak) and rules-peak-stop and rules-peak-stop-exit (the stop
 * level: a GLM subagent's goal is paused and resumed, and what the row does to
 * it when the host exits). The loop board scenario (loops) runs in a scratch
 * git clone that already carries a person's entry file: the board takes the
 * entry in, and loops:files-only refuses a file tool and a shell command that
 * write into the board's own files. The graph panel scenarios run the
 * bundle's /graph-apply and /graph-run handlers mid-step for the session;
 * the GLM and non-GLM scenarios run /hourness and /hourness-status at their
 * last step, after /glm-status is recorded.
 *
 * Usage: node scripts/probe/run-probe.mjs
 * Requires the desktop install (DSH_DESKTOP_DIR overrides the location).
 * The runtime boots profiles generated per run under one DSH home in the run
 * directory and linked to the checkout this script is in
 * (scripts/sandbox.mjs generateProfile, PROBE_PROFILES): probe-full lists
 * both packages and runs every scenario but two; glm-only runs on
 * probe-glm (the GLM channel package alone) and hourness-only on
 * probe-hourness (the orchestration package alone); client-modules mounts
 * the client composition service on probe-full and checks that it composes
 * both packages' client faces. These three also read each project row's
 * settings-page title in their profile. The main checkout and a
 * worktree are tested the same way and ~/.dsh/profiles is never used. Each
 * run writes the DSH home, overlays, request dumps and logs under
 * .llm/probe-runs/<timestamp>/ (gitignored).
 *
 * Guard (exit 2, no conclusion): a profile of that name already exists
 * under the real profiles directory, a profile cannot be generated, or the
 * project part of the desktop or glmsandbox profile (bundles, dependencies,
 * glm-hourness/ overrides; scripts/profile-shape.mjs) changed during the
 * run; other changes there are listed only. One of the generated names
 * appearing under the real profiles directory (DSH_HOME not honored) or a
 * change of the real usage journal fails the run (exit 1).
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { crc32, deflateSync } from 'node:zlib'
import { DISPATCH_TOOLS } from '../../packages/hourness/dist/workflow/index.js'
import { clockText } from '../../packages/hourness/dist/rules/index.js'
import { repoJson } from '../../packages/hourness/dist/rules/model.js'
import { RULES_DECLARATION } from '../../packages/hourness/dist/rules/service.js'
import { entryFileText } from '../../packages/hourness/dist/loops/model.js'
import { LOOPS_DECLARATION } from '../../packages/hourness/dist/loops/service.js'
import { PEAK_REMINDER_SOURCE, PEAK_REMINDER_TEXT } from '../../packages/glm/dist/glm-prompt/peak-reminder.js'
import { peakWindowAt } from '../../packages/glm/dist/glm-llm/credits.js'
import { userDataHome } from '../../packages/hourness/dist/shared/data-home.js'
import { HEALTH_PACKAGES, HEALTH_ROWS } from '../../packages/hourness/dist/shared/health.js'
import { GRAPH_TOOL_NAMES, MEMORY_TOOL_NAMES } from '../../packages/glm/dist/shared/tool-names.js'
import { openEngine } from '../../packages/hourness/dist/graph/engine.js'
import { holderFileOf, readHolder } from '../../packages/hourness/dist/graph/main-agent-holder.js'
import { runNote } from '../../packages/hourness/dist/graph/run.js'
import { loadGraph } from '../../packages/hourness/dist/graph/store.js'
import { compareShapes, describeDifference, isProjectDifference, profileShape } from '../profile-shape.mjs'
import { PACKAGES } from '../packages.mjs'
import { attachmentsIn, dataRows, designRows, generateProfile, initRepo, limitsRow, PROBE_PROFILES, repo, requireDesktop, sandboxCommand, slash, unlinkProfile, workspaceChangesRow } from '../sandbox.mjs'
import { GOAL_GATE_DENIAL, PROJECTION_SOURCE, SCOPE_DENIAL } from './probe-dispatch.mjs'

requireDesktop('probe')

const runDir = join(repo, '.llm', 'probe-runs', new Date().toISOString().replace(/[:.]/g, '-'))

// The run boots profiles generated under its own DSH home; the user's
// profiles directory must not gain them, and the profiles there must keep
// their project part (scripts/profile-shape.mjs).
const GENERATED_PROFILES = Object.keys(PROBE_PROFILES)
const realProfiles = join(dirname(userDataHome()), 'profiles')
const leftOver = GENERATED_PROFILES.filter(name => existsSync(join(realProfiles, name)))
if (leftOver.length > 0) {
  console.error(`probe: ${leftOver.map(name => join(realProfiles, name)).join(', ')} already exist(s); find out which run left them before deleting them`)
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
/** The generated profiles by name; every one generated is unlinked on exit, a failed run included. */
const profiles = {}
process.on('exit', () => Object.values(profiles).forEach(unlinkProfile))
for (const [name, packages] of Object.entries(PROBE_PROFILES)) {
  try {
    profiles[name] = generateProfile(join(runDir, 'dsh-root'), name, packages)
  }
  catch (error) {
    console.error(`probe: cannot generate the ${name} profile under ${runDir}: ${error instanceof Error && 'code' in error ? error.code : String(error)}`)
    process.exit(2)
  }
}
const PACKAGE_NAME = Object.fromEntries(PACKAGES.map(pkg => [pkg.key, pkg.name]))

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
 * requests are in `steps` too, under their own session id. `on` is the
 * generated profile to boot; the overlay patches only rows of the packages
 * it lists, so a single-package run has no override without a target.
 */
function runScenario(name, model, script, task, overlay = [], cwd = repo, others = [], on = profiles['probe-full']) {
  const dir = join(runDir, name)
  const home = join(dir, 'home')
  mkdirSync(home, { recursive: true })
  const dump = join(dir, 'requests.jsonl')
  writeFileSync(dump, '')
  const patch = join(dir, 'probe.patch.yml')
  const lists = key => on.packages.includes(PACKAGE_NAME[key])
  writeFileSync(patch, [
    '- id: agent-default-model',
    `  config: { provider: glm-probe, model: ${JSON.stringify(model)} }`,
    ...(lists('hourness') ? dataRows(dir) : []),
    // /glm-status reads the credential store under the glm-login home; the
    // scenario home has none, so the probe never reads the real store.
    ...(lists('glm') ? ['- id: glm-hourness/glm-login', `  config: { home: ${JSON.stringify(slash(home))} }`] : []),
    '- insert:',
    '    - id: glm-hourness-probe/llm',
    `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-llm.mjs')))}`,
    '      inject: [llm]',
    `      config: { dump: ${JSON.stringify(slash(dump))}, script: ${JSON.stringify(JSON.stringify(script))}, others: ${JSON.stringify(JSON.stringify(others))} }`,
    ...overlay,
    '',
  ].join('\n'))
  const { exe, args, env } = sandboxCommand(patch, [task], on)
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
// the workspace was denied). On GLM a relative Write resolves against the
// session directory and runs; a relative target that climbs out with `..`
// is denied. On a non-GLM route the guard judges the same way (question-14
// G3): the relative write runs, the shell write is denied in native names
// and journaled with scope other and the route.
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

// One package at a time (split design §7.3): each package installed alone
// activates without the other. glm-only boots probe-glm (the GLM channel
// package alone) on GLM-5.3 at the peak clock: the dialect is whole, the
// face has no graph or memory tools, the glm:memory section is gone, and
// /glm-status shows the orchestration package as one line not loaded.
const stderrOf = scenario => existsSync(join(runDir, scenario, 'stderr.txt')) ? readFileSync(join(runDir, scenario, 'stderr.txt'), 'utf8') : ''
// Rules board, first slice (docs/ORCHESTRATION.md §16). The row ships
// disabled; the overlay enables it in a scratch git workspace on the peak
// clock, so the project is the workspace: the rules file in the repository
// and the project's .llm/rules/ land in it. The probe provider types
// /rules peak the way the person does and reads the glmHournessPeakMode
// service after each command: the factory level, then 不做, then 无影响.
// The GLM route runs both packages, so the pricing service says it is peak
// (until 18:00 UTC+8); the orchestration package alone has no pricing
// service and so no peak to read. The main agent's own tool calls run in
// every state.
const RULES_ROW = ['- id: glm-hourness/rules', '  disabled: false']
const rulesProject = (name) => {
  const ws = join(runDir, name, 'ws')
  mkdirSync(ws, { recursive: true })
  writeFileSync(join(ws, 'README.md'), 'probe workspace\n')
  return { ws, ready: initRepo(ws) }
}
// The scenario's first step makes the session the main agent of the project
// with /wish (the design row is enabled for it), since the board tells only the
// main agent where the peak stands; the second lists the rules with rules_show
// at the shifted clock, between the factory level and 不做.
const rulesGlm = rulesProject('rules-peak')
// /wish wants the project to have a graph directory, empty is enough (the design scenarios do the same).
mkdirSync(join(rulesGlm.ws, 'docs', 'graph'), { recursive: true })
const rulesPeak = runScenario('rules-peak', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } }, line: '/wish' },
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } }, command: { name: 'rules', input: 'peak' }, peakMode: true },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'rules_show', input: {} } } },
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } }, command: { name: 'rules', input: 'peak 不做' }, peakMode: true },
  { text: 'done', status: true, command: { name: 'rules', input: 'peak 无影响' }, peakMode: true },
], 'Become the main agent, read package.json twice, list the rules, then reply done.', [...RULES_ROW, ...clockRow(PEAK_AT), ...designRows({ record: slash(join(runDir, 'rules-peak', 'design.jsonl')) })], rulesGlm.ws)
const rulesAlone = rulesProject('rules-peak-hourness')
const rulesPeakAlone = runScenario('rules-peak-hourness', 'deepseek-probe', [
  { tool: { name: 'pwsh', arguments: { command: 'Write-Output probe-rules', description: 'Print a word' } }, command: { name: 'rules', input: 'peak 不做' }, peakMode: true },
  { text: 'done', command: { name: 'hourness-status' }, peakMode: true },
], 'Print a word, then reply done.', [...RULES_ROW, ...clockRow(PEAK_AT)], rulesAlone.ws, [], profiles['probe-hourness'])

// Rules board, the tool-call gate (docs/ORCHESTRATION.md §16.11). The scenario
// project is a scratch git repository whose rules file already holds a person's
// rules, as a clone does: one that blocks a command naming `rules-probe-blocked`
// and one that only informs. (A person's switch cannot be created yet: nothing
// writes a rule but the proposal path, which is not built, so the rules that
// queue are probed in rules-queue and rules-handover, under a rules file that
// names a queue rule.) The scripted agent runs the
// blocked command, writes into the board's own files with a file tool, and runs
// a command no rule names; the non-GLM run also reads the rules with
// rules_show. The calls must be refused or run as the rules say, the refusals
// must be in the project's violation journal as rules:<id>, and /glm-status
// must list the row.
const GATE_RULE_AT = '2026-10-28T06:00:00.000Z'
const gateRule = (id, title, over) => ({ id, title, scope: 'project', when: { kind: 'event', events: ['gate.tool-call'] }, action: { kind: 'block' }, lifetime: { kind: 'until-lifted' }, reason: 'probe', origin: { actor: 'human', at: GATE_RULE_AT }, status: 'active', ...over })
const GATE_RULES_FILE = repoJson({
  version: 2,
  rules: {
    'r-probe-block': gateRule('r-probe-block', 'Probe word', { filter: { command: { matches: 'rules-probe-blocked' } }, reason: 'The probe word is not allowed.' }),
    'r-probe-note': gateRule('r-probe-note', 'Probe note', { when: { kind: 'event', events: ['rules.step'] }, action: { kind: 'inform' } }),
  },
})
const rulesGateProject = (name, text = GATE_RULES_FILE) => {
  const ws = join(runDir, name, 'ws')
  const rulesFile = join(ws, 'docs', 'rules', 'rules.json')
  mkdirSync(dirname(rulesFile), { recursive: true })
  writeFileSync(join(ws, 'README.md'), 'probe workspace\n')
  writeFileSync(rulesFile, text)
  return { ws, rulesFile, ready: initRepo(ws) }
}
const glmRulesProject = rulesGateProject('glm-rules')
const glmRules = runScenario('glm-rules', 'glm-5.3', [
  { tool: { name: 'Bash', arguments: { command: 'Write-Output rules-probe-blocked', timeout: 30000 } } },
  { tool: { name: 'Write', arguments: { file_path: glmRulesProject.rulesFile, content: '{}\n' } } },
  { tool: { name: 'Bash', arguments: { command: 'Write-Output rules-probe-allowed', timeout: 30000 } } },
  { text: 'done', status: true },
], 'Run a command a rule blocks, write into the rules directory, run a command no rule names, then reply done.', RULES_ROW, glmRulesProject.ws)
const nonGlmRulesProject = rulesGateProject('non-glm-rules')
const nonGlmRulesState = join(nonGlmRulesProject.ws, '.llm', 'rules', 'state.json')
const nonGlmRules = runScenario('non-glm-rules', 'deepseek-probe', [
  { tool: { name: 'pwsh', arguments: { command: 'Write-Output rules-probe-blocked', description: 'Print the probe word' } } },
  { tool: { name: 'write', arguments: { file_path: nonGlmRulesState, content: '{}\n' } } },
  { tool: { name: 'rules_show', arguments: {} } },
  { tool: { name: 'pwsh', arguments: { command: 'Write-Output rules-probe-allowed', description: 'Print an allowed word' } } },
  { text: 'done', status: true },
], 'Run a command a rule blocks, write into the rules directory, read the rules, run a command no rule names, then reply done.', RULES_ROW, nonGlmRulesProject.ws)

// Loop board, the storage and the gate on its own files
// (docs/ORCHESTRATION.md §18.8, §18.9). The row ships disabled; the overlay
// enables it in a scratch git repository that already carries a person's entry
// file in docs/loops/ and has it committed, as a fresh clone does. The entry
// only tells the main agent, so the board takes it in without an approval
// record (loops design §9.3, impl-plan Interpretation 1). The scripted agent
// writes into that entry file with a file tool, writes the board's runtime file
// through the shell, and reads the entry file. Both writes must be refused by
// loops:files-only with its four-part text and journaled as that rule, the read
// must pass, the board must have taken the entry in and written its runtime
// files, and git must see nothing of the runtime directory.
const LOOPS_ROW = ['- id: glm-hourness/loops', '  disabled: false']
const LOOPS_ENTRY_ID = 'u-1a2b3c4d'
const LOOPS_ENTRY_TEXT = entryFileText({
  id: LOOPS_ENTRY_ID,
  title: 'Probe loop',
  why: 'Probe the loop board storage.',
  when: { kind: 'daily', time: '08:30', timeZone: 'Asia/Shanghai' },
  action: { kind: 'tell-main', text: 'Probe: the loop board asked for this line.', wake: false },
  source: { kind: 'person', at: GATE_RULE_AT, via: 'chat', relay: 'probe relay', question: 'question-1', proposal: 'lp-0a1b2c3d' },
})
const loopsProject = (name) => {
  const ws = join(runDir, name, 'ws')
  const entryFile = join(ws, 'docs', 'loops', 'entries', `${LOOPS_ENTRY_ID}.json`)
  mkdirSync(dirname(entryFile), { recursive: true })
  writeFileSync(join(ws, 'README.md'), 'probe workspace\n')
  writeFileSync(entryFile, LOOPS_ENTRY_TEXT)
  return { ws, entryFile, ready: initRepo(ws) }
}
const loopsBoard = loopsProject('loops')
const loopsShellTarget = join(loopsBoard.ws, '.llm', 'loops', 'journal.jsonl')
const loops = runScenario('loops', 'deepseek-probe', [
  { tool: { name: 'write', arguments: { file_path: loopsBoard.entryFile, content: '{}\n' } } },
  { tool: { name: 'pwsh', arguments: { command: `Set-Content -Path '${loopsShellTarget}' -Value probe`, description: 'Write the loop board runtime file through the shell' } } },
  { tool: { name: 'read', arguments: { file_path: loopsBoard.entryFile } } },
  { text: 'done', status: true },
], 'Write into the loop board entry file, write its runtime file through the shell, read the entry file, then reply done.', LOOPS_ROW, loopsBoard.ws)

const MEMORY_SECTION_LINE = 'You have a persistent memory in this workspace'
const glmOnlyDir = join(runDir, 'glm-only')
const glmOnly = runScenario('glm-only', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { text: 'done', status: true, meta: true },
], 'Read package.json, then reply done.', clockRow(PEAK_AT), repo, [], profiles['probe-glm'])
const glmOnlyFirst = glmOnly.steps[0]
const glmOnlyTools = names(glmOnlyFirst)
const glmOnlyRead = lastToolResult(glmOnly.steps[1])
// hourness-only boots probe-hourness (the orchestration package alone) on
// the non-GLM route, in a workspace with a seeded graph: graph_focus
// projects on the next request, a native write into the graph is denied by
// graph-files-only, a shell write is denied by file-tools-only (the guard
// row judges every route), the prompt declares the rules in native names,
// /hourness-status shows the GLM package as one line not loaded, and
// /hourness lists calls and tokens without the pricing service.
const hournessOnlyDir = join(runDir, 'hourness-only')
const hournessOnlyWs = join(hournessOnlyDir, 'ws')
const hournessOnlyGraph = join(hournessOnlyWs, 'docs', 'graph')
mkdirSync(hournessOnlyGraph, { recursive: true })
const hournessOnlyEngine = openEngine(hournessOnlyGraph)
for (const node of [
  { type: 'goal', title: '探针目标' },
  { type: 'task', title: '探针任务', parent: 'goal-1', acceptance: ['probe acceptance'] },
]) {
  const seeded = await hournessOnlyEngine.apply('human', { op: 'propose', reason: 'probe seed', node })
  if (!seeded.ok) throw new Error(`probe: seeding the hourness-only graph failed: ${JSON.stringify(seeded.error)}`)
}
const hournessOnlyNode = join(hournessOnlyGraph, 'nodes', 'probe-direct.json')
const hournessOnlyShell = join(hournessOnlyWs, 'shell.txt')
const hournessOnly = runScenario('hourness-only', 'deepseek-probe', [
  { tool: { name: 'graph_focus', arguments: { id: 'task-1' } } },
  { tool: { name: 'write', arguments: { file_path: hournessOnlyNode, content: '{}\n' } }, command: { name: 'hourness-status' } },
  { tool: { name: 'pwsh', arguments: { command: `Set-Content -Path '${hournessOnlyShell}' -Value probe`, description: 'Write a file through the shell' } } },
  { text: 'done', command: { name: 'hourness' }, meta: true },
], 'Set the graph focus, write two files, then reply done.', [], hournessOnlyWs, [], profiles['probe-hourness'])
const hournessOnlyFirst = hournessOnly.steps[0]
const hournessOnlyTools = names(hournessOnlyFirst)
const hournessOnlyProjection = hournessOnly.steps[1]?.messages.at(-1)
const hournessOnlyWrite = lastToolResult(hournessOnly.steps[2])
const hournessOnlyPwsh = lastToolResult(hournessOnly.steps[3])
const hournessOnlyStatus = hournessOnly.steps[1]?.command
const hournessOnlyReport = hournessOnly.steps[3]?.command

// Client composition (split design §5.6, U3): the headless template has no
// client-modules row, so the overlay mounts @deepseek-ai/dsh-client-modules
// on probe-full and enables glm-hourness/glm-ui. Its construction scans
// every loaded row and throws on a composition error; the probe provider
// reads the composed graph mid-step. Each package is its own client face
// (dsh.client in its manifest, one row named by the exact package name).
const CLIENT_PACKAGES = PACKAGES.map(pkg => pkg.name)
const clientModules = runScenario('client-modules', 'deepseek-probe', [{ text: 'done', modules: true, meta: true }], 'Reply done.', [
  '- insert:',
  '    - id: glm-hourness-probe/client-modules',
  '      name: \'@deepseek-ai/dsh-client-modules\'',
  '- id: glm-hourness/glm-ui',
  '  disabled: false',
])
const clientGraph = clientModules.steps[0]?.modules

// Settings page row titles (docs/DESIGN.md §2.3): in each profile, every
// project row of the listed packages shows the title of its locale files
// (a host row's locale/<row>/, the client row's package locale/), read the
// way the settings page's plugin inventory reads it, and no other project
// row is loaded.
const localeTitle = (pkg, sub) => Object.fromEntries(['en', 'zh'].map(language => [language, JSON.parse(readFileSync(join(repo, pkg.dir, 'locale', ...sub, `${language}.json`), 'utf8')).meta.title]))
const expectedTitles = keys => PACKAGES.filter(pkg => keys.includes(pkg.key)).flatMap(pkg => [...pkg.rows.map(row => [row.id, localeTitle(pkg, [row.id.replace(/^glm-hourness\//, '')])]), [pkg.client.row, localeTitle(pkg, [])]])
const titleProblems = (recorded, keys) => {
  if (!Array.isArray(recorded)) return [`no row metadata: ${JSON.stringify(recorded ?? null)}`]
  const expected = expectedTitles(keys)
  const wrong = expected.flatMap(([id, title]) => {
    const found = recorded.filter(entry => entry.id === id)
    if (found.length !== 1) return [`${id}: ${found.length} row(s)`]
    const meta = found[0].meta
    return meta?.error === undefined && meta?.title?.en === title.en && meta?.title?.zh === title.zh ? [] : [`${id} (${found[0].name}): ${JSON.stringify(meta ?? null)}`]
  })
  return [...wrong, ...recorded.filter(entry => !expected.some(([id]) => id === entry.id)).map(entry => `${entry.id}: not expected`)]
}
const titleCheck = (scenario, recorded, keys) => {
  const problems = titleProblems(recorded, keys)
  return [`${scenario}: each project row (${expectedTitles(keys).length}) shows its locale title in the settings inventory, through a package specifier`, problems.length === 0, problems.join('; ') || (Array.isArray(recorded) ? recorded.map(entry => `${entry.id} ${entry.name}`).join(', ') : '')]
}

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
// dialect service is provided. A pwsh shell write is denied, the correction
// and the rule declaration name the native tools the model sees, and the
// record is tagged other (no dialect claimed the route). With the dialect
// (scenario glm) they name Read, Write and Edit, word for word as before the
// names were mapped, and the record is tagged dialect.
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

// Rules board, waiting tickets (docs/ORCHESTRATION.md §16.12). The scenario
// projects are scratch git repositories whose rules file already holds a queue
// rule and a rule that only informs, as a clone does. rules-queue runs on the
// GLM route at the peak clock, where `glm-peak` is true: the call the rule
// names is refused with a ticket, refused again under the same ticket, the
// person lifts the rule through the real /rules handler (mid-step, as the
// human), the board tells the session once, and the call runs. rules-handover
// runs on the other route: a one-off subagent makes the call the rule names and
// ends; its ticket goes to the agent that dispatched it, which is told when
// the person lifts the rule. The board's reminder is in the request exactly
// when something changed.
const queueRule = (over = {}) => gateRule('r-probe-queue', 'Probe word, deferred', { filter: { command: { matches: 'rules-probe-queued' } }, action: { kind: 'queue' }, reason: 'The probe word waits.', ...over })
const QUEUE_NOTE = gateRule('r-probe-note', 'Probe note', { when: { kind: 'event', events: ['rules.step'] }, action: { kind: 'inform' } })
const QUEUE_RULES_FILE = repoJson({ version: 2, rules: { 'r-probe-queue': queueRule({ condition: { signal: 'glm-peak', is: true } }), 'r-probe-note': QUEUE_NOTE } })
const HANDOVER_RULES_FILE = repoJson({ version: 2, rules: { 'r-probe-queue': queueRule(), 'r-probe-note': QUEUE_NOTE } })
const QUEUED_WORD = 'Write-Output rules-probe-queued'
const queueProject = rulesGateProject('rules-queue', QUEUE_RULES_FILE)
const rulesQueue = runScenario('rules-queue', 'glm-5.3', [
  { tool: { name: 'Bash', arguments: { command: QUEUED_WORD, timeout: 30000 } } },
  { tool: { name: 'Bash', arguments: { command: QUEUED_WORD, timeout: 30000 } } },
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } }, command: { name: 'rules', input: 'lift r-probe-queue' } },
  { tool: { name: 'Bash', arguments: { command: QUEUED_WORD, timeout: 30000 } } },
  { text: 'done', status: true },
], 'Run the queued command twice, let the person lift the rule, run it again, then reply done.', [...RULES_ROW, ...clockRow(PEAK_AT)], queueProject.ws)
const handoverDir = join(runDir, 'rules-handover')
const handoverProject = rulesGateProject('rules-handover', HANDOVER_RULES_FILE)
const rulesHandover = runScenario('rules-handover', 'deepseek-probe', [
  { tool: { name: 'probe_dispatch', arguments: { task: 'T1', prompt: 'Probe task T1: run the queued command and report.', cwd: handoverProject.ws, scope: 'allowed', model: 'deepseek-probe' } } },
  { tool: { name: 'read', arguments: { file_path: join(repo, 'package.json') } } },
  { text: 'Waiting for task T1.' },
  { tool: { name: 'pwsh', arguments: { command: 'Start-Sleep -Seconds 7', description: 'Let the board look at the finished subagent' } } },
  { tool: { name: 'read', arguments: { file_path: join(repo, 'package.json') } }, command: { name: 'rules', input: 'lift r-probe-queue' } },
  { text: 'done', status: true },
], 'Dispatch task T1, wait for it, let the person lift the rule, then reply done.', [...RULES_ROW, ...dispatchRow(join(handoverDir, 'dispatch.jsonl'))], handoverProject.ws, [[
  { tool: { name: 'pwsh', arguments: { command: QUEUED_WORD, description: 'Print the queued word' } } },
  { tool: { name: 'structured_output', arguments: HAND_BACK } },
  { text: 'child done' },
]])

// Rules board, the stop level (docs/ORCHESTRATION.md §16.13). The project's rules
// file holds the person's choice 不做, and the probe clock is in the GLM peak.
// The GLM main agent runs the dispatch row's tool probe_stop_goal, which makes a
// subagent session (a header with origin subagent) on GLM with a goal: its
// first tool call is refused with a ticket and the row pauses the goal from
// inside that call; a subagent session on a model that is not GLM runs its call;
// no round starts while the peak holds; then the tool types /rules peak 无影响 as
// the person through the real handler, the goal is resumed and the subagent is
// told to carry on. rules-peak-stop-exit stops at the held goal and lets the
// host exit, to see what the row does on its way out (V13).
const STOP_RULES_FILE = repoJson({ version: 2, peakMode: { level: 'stop', at: '2026-10-28T06:00:00.000Z', origin: { actor: 'human' } } })
const STOP_COMMAND = 'Write-Output rules-probe-stop'
const stopProbe = (name, input, scripts) => {
  const project = rulesGateProject(name, STOP_RULES_FILE)
  const run = runScenario(name, 'glm-5.3', [
    { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_stop_goal', input: { objective: 'Run the probe command, then mark the goal complete.', cwd: project.ws, maxGoalRounds: 3, ...input } } } },
    { text: 'done', status: true },
  ], 'Run the stop-level goal probe, then reply done.', [...RULES_ROW, ...clockRow(PEAK_AT), ...dispatchRow(join(runDir, name, 'dispatch.jsonl'))], project.ws, scripts)
  return { project, run }
}
const stopChildScript = [
  { tool: { name: 'Bash', arguments: { command: STOP_COMMAND, timeout: 30000 } } },
  { text: 'Stopped: the ticket is reported.' },
  completeGoal,
  { text: 'Goal complete.' },
]
const { project: stopProject, run: rulesPeakStop } = stopProbe('rules-peak-stop', {}, [
  stopChildScript,
  [{ tool: { name: 'pwsh', arguments: { command: 'Write-Output rules-probe-plain', description: 'Print a word' } } }, { text: 'ok' }],
])
const { project: stopExitProject, run: rulesPeakStopExit } = stopProbe('rules-peak-stop-exit', { lift: false }, [stopChildScript.slice(0, 2)])

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
  { type: 'question', title: '探针问题', parent: 'goal-1', options: [{ key: 'A', label: '甲', gain: '快', cost: '要返工一次' }, { key: 'B', label: '乙', gain: '稳', cost: '多两天' }], recommend: 'B', crux: '这周要交付吗？', verdict: '是 → A；否 → B', weight: 'two-way' },
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

// Main agent mode (docs/ORCHESTRATION.md §3.1, ROADMAP M3 step 3): the design
// row ships disabled; the overlay (scripts/sandbox.mjs designRows) enables it,
// mounts ask_user_question, which the headless template lacks, and mounts the
// simulated human (scripts/calibrate/simulated-human.mjs), which types
// /wish for the first root session and refuses any question card, recording
// both in human.jsonl. Each scenario works in its own workspace with an empty
// docs/graph. The idle scenarios start with /wish <wish>, typed in
// agent/created: the first request is the turn that wish wakes, the second
// the headless task. The main scenarios type /wish, /wish <wish> and /wish
// off themselves, mid-step, through the commands service (the probe
// provider's `line` step), so command/run and command/done are in the log.
const DESIGN_WISH = '记一下每天花了多少钱'
const designScenario = (name, model, script, { wish, on, others } = {}) => {
  const dir = join(runDir, name)
  const ws = join(dir, 'ws')
  mkdirSync(join(ws, 'docs', 'graph'), { recursive: true })
  mkdirSync(join(ws, '.llm'), { recursive: true })
  writeFileSync(join(ws, 'README.md'), 'probe workspace\n')
  const record = join(dir, 'human.jsonl')
  const run = runScenario(name, model, script(ws), 'Reply done.', designRows({ record: slash(record), ...wish === undefined ? {} : { wish } }), ws, others ?? [], on)
  return { ...run, name, dir, ws, human: jsonl(record) }
}
const designMainScript = ({ read, write, status }) => (ws) => {
  const readme = { name: read, arguments: { file_path: join(ws, 'README.md') } }
  return [
    { tool: { name: write, arguments: { file_path: join(ws, '.llm', 'before.txt'), content: 'before\n' } } },
    { tool: readme, line: '/wish' },
    { tool: readme, ...status },
    { tool: readme, line: `/wish ${DESIGN_WISH}` },
    { tool: readme, line: '/wish off' },
    { tool: { name: write, arguments: { file_path: join(ws, '.llm', 'after.txt'), content: 'after\n' } }, ...status },
    { text: 'done' },
  ]
}
const designIdle = (status) => () => [{ text: 'ok' }, { text: 'done', ...status }]
const designGlmIdle = designScenario('glm-design-wish-idle', 'glm-5.3', designIdle({ status: true }), { wish: DESIGN_WISH })
const designPlainIdle = designScenario('non-glm-design-wish-idle', 'deepseek-probe', designIdle({ command: { name: 'hourness-status' } }), { wish: DESIGN_WISH, on: profiles['probe-hourness'] })
const designGlmMain = designScenario('glm-design-main', 'glm-5.3', designMainScript({ read: 'Read', write: 'Write', status: { status: true } }))
const designPlainMain = designScenario('non-glm-design-main', 'deepseek-probe', designMainScript({ read: 'read', write: 'write', status: { command: { name: 'hourness-status' } } }), { on: profiles['probe-hourness'] })
// One main agent per project: the main agent session (the simulated human's
// /wish) types a second root session of the same workspace into existence
// and has it type /wish, which only says where the main agent is, then
// /wish here, which moves the role: the first session gets /wish off from
// the row, its section and its tool face come back, and the record names the
// second session. Then a fork of the first session at its first finished
// command, which was /wish, so it is forked as a main agent: it is an
// ordinary session from its first request on, its projection is off once the
// row has run /wish off for it, and the record still names the second session.
const designOne = designScenario('glm-design-one-main', 'glm-5.3', ws => [
  { tool: { name: 'Read', arguments: { file_path: join(ws, 'README.md') } }, other: { line: '/wish' } },
  { tool: { name: 'Read', arguments: { file_path: join(ws, 'README.md') } }, other: { line: '/wish here' } },
  { tool: { name: 'Read', arguments: { file_path: join(ws, 'README.md') } }, fork: true },
  { tool: { name: 'Write', arguments: { file_path: join(ws, '.llm', 'x.txt'), content: 'x\n' } }, status: true },
  { text: 'done' },
], { wish: true })
const designRecord = (scenario) => readHolder(holderFileOf(join(scenario.dir, 'dsh-home', 'glm-hourness'), join(scenario.ws, 'docs', 'graph')))
const MAIN_HEAD = '# Main agent\nYou are the main agent of this project'
const sectionAt = step => step?.system.indexOf(MAIN_HEAD) ?? -1
const faceOf = step => (step?.tools ?? []).map(tool => tool.name).sort()
/** The tools the main agent's face loses: the ones that write files and the question card tool. */
const GLM_CUT = ['Write', 'Edit', 'ask_user_question']
const PLAIN_CUT = ['write', 'edit', 'ask_user_question']
const faceWithout = (step, cut) => faceOf(step).filter(name => !cut.includes(name))
const hasCut = (step, cut) => cut.every(name => faceOf(step).includes(name))

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
const projectUsage = ['glm', 'glm-flash', 'glm-todo', 'glm-compact', 'glm-shadow', 'glm-guard-paths', 'non-glm', 'non-glm-guard', 'glm-no-dialect', 'glm-peak', 'limits-steps', 'limits-time', 'glm-dispatch', 'glm-goal', 'goal-headless', 'glm-only', 'hourness-only', 'client-modules'].filter(scenario => existsSync(join(runDir, scenario, 'home', 'audit', 'usage.jsonl')))
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
const tableOf = (text) => {
  const lines = text.split('\n').filter(line => line.startsWith('| ') && line !== TABLE_HEAD && !line.startsWith('| ---'))
  return Object.fromEntries(lines.map((line) => {
    const [pkg, row, status, ...reason] = line.slice(2, -2).split(' | ')
    return [row, { package: pkg, status, reason: reason.join(' | ') }]
  }))
}
const healthOf = scenario => tableOf(statusStep(scenario)?.status ?? '')
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
// Rules board scenarios: the peak of the probe clock's Wednesday ends at 18:00 UTC+8.
const PEAK_END = '2026-10-28T10:00:00.000Z'
const rulesStderr = stderrOf('rules-peak')
const rulesRecords = jsonl(join(rulesGlm.ws, '.llm', 'rules', 'journal.jsonl'))
const rulesFilePath = join(rulesGlm.ws, 'docs', 'rules', 'rules.json')
const rulesFile = existsSync(rulesFilePath) ? JSON.parse(readFileSync(rulesFilePath, 'utf8')) : undefined
const rulesHealth = healthOf(rulesPeak)
// The orchestration package alone has no /glm-status; its table is /hourness-status.
const aloneHealth = tableOf(rulesPeakAlone.steps[1]?.command?.text ?? '')
const aloneState = rulesPeakAlone.steps[0]?.peakMode?.state
// The gate scenarios: what each run journaled in its project directory, what its steps saw, and whether the board's file is as it was.
const gateRecords = name => jsonl(join(runDir, name, 'home', 'audit', 'violations.jsonl'))
const glmRulesRecords = gateRecords('glm-rules')
const nonGlmRulesRecords = gateRecords('non-glm-rules')
const glmRulesHealth = healthOf(glmRules)
const nonGlmRulesHealth = healthOf(nonGlmRules)
// The board's reminders in one request (the session keeps them, so a request has every one sent so far), and the same for a scenario's requests in order.
const boardTexts = step => (step?.messages ?? []).filter(message => message.source === 'hourness-rules').map(message => message.text)
// The waiting-ticket scenarios: the tickets the board kept, what it journaled, and the wake messages the requests carried.
const readStateOf = (project) => { const file = join(project.ws, '.llm', 'rules', 'state.json'); return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined }
const journalOfProject = project => jsonl(join(project.ws, '.llm', 'rules', 'journal.jsonl'))
const wakeMessages = step => (step?.messages ?? []).filter(message => message.source === 'hourness-rules-wake')
const queueState = readStateOf(queueProject)
const queueRecords = gateRecords('rules-queue')
const queueJournal = journalOfProject(queueProject)
const handoverState = readStateOf(handoverProject)
const handoverNotes = dispatchRecord('rules-handover')
const handoverStarted = handoverNotes.find(entry => entry.kind === 'started')
const handoverChild = bySession(rulesHandover, handoverStarted?.childId)
const handoverMain = bySession(rulesHandover, handoverStarted?.parentId)
const handoverJournal = journalOfProject(handoverProject)
const handoverTicket = handoverState?.tickets?.['q-1']
const QUEUE_REFUSAL = /^Error: You tried to run "Write-Output rules-probe-queued"\.\nBoundary: Deferred as ticket q-1\. Rule r-probe-queue "Probe word, deferred" \(set by the human at [^)]+, until lifted\) defers it while glm-peak is on\.\nRight path: The call did not run\. Continue with other planned work; the harness sends you a message when q-1 clears, then run the same call again\. Running it again before that returns this message and does not queue it twice\.\nException: The human can let it through once \(\/rules let q-1\), or change the rule\.$/
const queueWake = /^\[rules board\] Ticket q-1 cleared: rule r-probe-queue was lifted by the human\. You may run the deferred call again: pwsh "Write-Output rules-probe-queued"\.$/
const consecutiveDiffer = texts => texts.every((text, index) => index === 0 || text !== texts[index - 1])
const rulesRecordOf = (records, rule) => records.find(record => record.rule === rule)
const stateWritten = existsSync(nonGlmRulesState) && readFileSync(nonGlmRulesState, 'utf8') === '{}\n'
// The loop board scenario: what the board wrote in the project's .llm/loops/, what it left to git, and what the run journaled.
const loopsRuntime = join(loopsBoard.ws, '.llm', 'loops')
const readJsonOf = file => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined
const loopsJournal = jsonl(join(loopsRuntime, 'journal.jsonl'))
const loopsJournalText = existsSync(join(loopsRuntime, 'journal.jsonl')) ? readFileSync(join(loopsRuntime, 'journal.jsonl'), 'utf8') : ''
const loopsView = readJsonOf(join(loopsRuntime, 'view.json'))
const loopsWritten = readJsonOf(join(loopsRuntime, 'repo-written.json'))
const loopsIgnore = existsSync(join(loopsRuntime, '.gitignore')) ? readFileSync(join(loopsRuntime, '.gitignore'), 'utf8') : ''
const loopsExclude = existsSync(join(loopsBoard.ws, '.git', 'info', 'exclude')) ? readFileSync(join(loopsBoard.ws, '.git', 'info', 'exclude'), 'utf8') : ''
const loopsGitStatus = spawnSync('git', ['status', '--porcelain'], { cwd: loopsBoard.ws, encoding: 'utf8' }).stdout ?? 'git status failed'
const loopsRecords = gateRecords('loops')
const loopsHealth = healthOf(loops)
const loopsViewEntry = (loopsView?.entries ?? []).find(entry => entry.id === LOOPS_ENTRY_ID)
const loopsAdopted = loopsJournal.filter(record => record.op === 'adopt' && record.id === LOOPS_ENTRY_ID)
// A headless host has no session controller, so the board hands out no service and runs no entry (loops design 6.1, 11.1): nothing of the runtime is written.
const loopsRanNothing = ['runner.lock', 'handover.json', 'events.jsonl', 'runs.jsonl', 'state.json'].filter(name => existsSync(join(loopsRuntime, name)))
const LOOPS_DENIAL = new RegExp(`^Error: You tried to write "[^"]+"\\.\\nBoundary: Rule loops:files-only blocks writes under the loop board's files [^\\n]+\\nRight path: .+\\nException: `)
// rules-peak: what the board told the main agent, at the wall clock of this machine (the model-facing lines write HH:MM in it).
const localHm = iso => new Date(iso).toLocaleString('sv-SE').slice(11, 16)
const PEAK_END_HM = localHm(PEAK_END)
const peakTexts = boardTexts(rulesPeak.steps[1])
const peakShown = lastToolResult(rulesPeak.steps[3])
const REDUCE_LINE = `<system-reminder>\nGLM peak: now until ${PEAK_END_HM}. Peak mode: reduce (the default; the human can change it). Run at most 1 GLM subagent at a time until ${PEAK_END_HM}. Move optional work that spends many GLM credits (calibration runs, ablations, large reviews) to after ${PEAK_END_HM}, including work you dispatch; keep necessary work going.\n</system-reminder>`
const STOP_LINE_START = `<system-reminder>\nGLM peak: now until ${PEAK_END_HM}. Peak mode set by the human: stop. `
const peakSentences = PEAK_REMINDER_TEXT.split(/(?<=[.:])\s+/).filter(sentence => sentence.length > 20)
// rules-peak-stop and -exit: the subagent's requests, what the dispatch row saw of its goal, and the ticket the board kept.
const stopNotes = dispatchRecord('rules-peak-stop')
const stopCreated = stopNotes.find(entry => entry.kind === 'stop-created')
const stopChild = bySession(rulesPeakStop, stopCreated?.agentId)
const stopPlainId = stopNotes.find(entry => entry.kind === 'stop-plain')?.agentId
const stopPlain = bySession(rulesPeakStop, stopPlainId)
const stopMain = rulesPeakStop.steps.filter(step => step.sessionId !== stopCreated?.agentId && step.sessionId !== stopPlainId)
const stopState = readStateOf(stopProject)
const stopJournal = journalOfProject(stopProject)
const stopOps = stopNotes.filter(entry => entry.kind === 'goal-changed' && entry.agentId === stopCreated?.agentId)
const stopNote = kind => stopNotes.find(entry => entry.kind === kind)
const STOP_REFUSAL = /^Error: You tried to run "Write-Output rules-probe-stop"\.\nBoundary: Deferred as ticket q-1\. GLM peak hours now until \d\d:\d\d, and the human chose "stop" for peak hours: GLM subagents do no work until then\. Your goal is paused\.\nRight path: The call did not run\. Stop and report ticket q-1 and where you stopped in your handoff; the agent that dispatched you is told at \d\d:\d\d and can dispatch the work again\. Other tool calls before then return this message\.\nException: The human can let this session work through this peak \(\/rules let q-1\), or change the peak mode \(\/rules peak\)\.$/
const STOP_WAKE = /^\[rules board\] Ticket q-1 cleared: GLM peak hours are over \(or the human changed the peak mode\)\. Your goal is resumed\. Continue your work from where you stopped; the call that was deferred was pwsh "Write-Output rules-probe-stop"\.$/
const stopExitNotes = dispatchRecord('rules-peak-stop-exit')
const stopExitState = readStateOf(stopExitProject)
const stopExitJournal = journalOfProject(stopExitProject)
const stopExitOps = stopExitNotes.filter(entry => entry.kind === 'goal-changed').map(entry => entry.operation)
// A row that unloaded took its heartbeat file with it; a runner that left without unloading it left the file.
const stopExitHosts = join(stopExitProject.ws, '.llm', 'rules', 'hosts')
const stopExitUnloaded = !existsSync(stopExitHosts) || readdirSync(stopExitHosts).length === 0
const conversationTexts = [glm, plain, compacted, shadow].flatMap(scenario => scenario.steps.flatMap(step => [step.system, ...step.messages.map(message => message.text)]))

// The single-package runs: a package with no row loaded is one line whose
// row cell is 全部 (src/shared/health.ts).
const WHOLE = '全部'
const rowsOf = key => HEALTH_PACKAGES.find(entry => entry.name === PACKAGE_NAME[key])?.rows ?? []
const onlyOneLoaded = (health, own, other) => rowsOf(own).every(row => health[row]?.package === PACKAGE_NAME[own]) && health[WHOLE]?.package === PACKAGE_NAME[other] && health[WHOLE].status === '未加载' && health[WHOLE].reason === '包未安装，或它的行全部禁用' && Object.keys(health).length === rowsOf(own).length + 1
const glmOnlyHealth = healthOf(glmOnly)
const hournessOnlyHealth = tableOf(hournessOnlyStatus?.text ?? '')
const hournessOnlyPanel = hournessOnlyReport?.text.split('## 面板\n')[1] ?? ''
const hournessOnlyViolations = jsonl(join(hournessOnlyDir, 'home', 'audit', 'violations.jsonl'))
const glmOnlyUsage = [join(glmOnlyDir, 'home', 'audit', 'usage.jsonl'), join(glmOnlyDir, 'dsh-home', 'glm-hourness', 'audit', 'usage.jsonl'), join(runDir, 'dsh-root', 'glm-hourness', 'audit', 'usage.jsonl')].filter(file => existsSync(file))
const quiet = scenario => !stderrOf(scenario).includes('skipping profile bundle') && !stderrOf(scenario).includes('dsh-glm-hourness/')


// The launcher rewrites the root config of the profile it boots
// (cordis.yml, written here as a bare []): the runs used the generated
// profiles, found through DSH_HOME, and the real profiles directory did not
// gain them.
const rewritten = Object.values(profiles).filter(item => readFileSync(join(item.dir, 'cordis.yml'), 'utf8').startsWith('# dsh profile root')).map(item => item.name)
const leaked = GENERATED_PROFILES.filter(name => existsSync(join(realProfiles, name)))

/**
 * Main agent mode (docs/ORCHESTRATION.md §3.1; scenarios glm-design-wish-idle,
 * non-glm-design-wish-idle, glm-design-main, non-glm-design-main,
 * glm-design-one-main): what the real runtime did with the identity section,
 * the tool face, the notices and the holder record.
 */
function designChecks() {
  const zcode = (step) => step?.system.indexOf('You are ZCode, an interactive agent') ?? -1
  const ascending = (...marks) => marks.every(mark => mark >= 0) && marks.every((mark, index) => index === 0 || marks[index - 1] < mark)
  const placed = (step, glmRoute) => glmRoute ? ascending(zcode(step), sectionAt(step), step.system.indexOf(GUARD_SECTION)) : ascending(sectionAt(step), step.system.indexOf(GUARD_SECTION)) && zcode(step) < 0
  const wishNotices = step => messagesOf(step, 'glm-design-wish')
  const wished = step => wishNotices(step).some(message => message.text.includes(`"${DESIGN_WISH}"`) && message.text.includes('需求：'))
  const left = step => wishNotices(step).some(message => message.text.includes('left main-agent mode with /wish off'))
  const entered = step => wishNotices(step).some(message => message.text.startsWith('The human made this session\'s agent the main agent of this project with /wish'))
  const humanQuiet = scenario => scenario.human.every(entry => entry.kind !== 'unexpected-question')
  const rowQuiet = scenario => !stderrOf(scenario.name).includes('dsh-glm-hourness/design')
  const lineOk = (step, text) => step?.line?.text === text && step.line.kind === 'success' && step.line.types[0] === 'command/run' && step.line.types.at(-1) === 'command/done' && step.line.events >= 2
  const inEffect = row => row?.status === ACTED && row.reason.startsWith('主 Agent：身份节已加上')
  const notInEffect = row => row?.status === '未生效' && row.reason === '这个会话现在不是主 Agent：用 /wish 开启'
  const rowAt = (scenario, index) => tableOf(scenario.steps[index]?.status ?? scenario.steps[index]?.command?.text ?? '').design
  const wishOk = scenario => scenario.human[0]?.kind === 'wish' && scenario.human[0].result === 'success' && scenario.human[0].text.endsWith('主 Agent 建议用强一点的模型')
  const files = (scenario, ...names) => names.map(name => existsSync(join(scenario.ws, '.llm', name)))
  const one = designOne
  const mainId = one.steps[0]?.sessionId
  const mainSteps = one.steps.filter(step => step.sessionId === mainId)
  const forkSteps = one.steps.filter(step => step.sessionId !== mainId)
  const forkNote = mainSteps[2]?.fork
  const holder = designRecord(one)
  const lacks = (step, names) => names.every(name => !faceOf(step).includes(name))
  const route = [[designGlmMain, true, GLM_CUT, 'GLM'], [designPlainMain, false, PLAIN_CUT, 'non-GLM']]
  return [
    ['design: the row ships disabled: without the overlay /glm-status and /hourness-status list it as not loaded', glmHealth.design?.status === '未加载' && plainHealth.design?.status === '未加载', `${healthLine(glmHealth, 'design')}; ${healthLine(plainHealth, 'design')}`],
    ['design idle: /wish <wish>, typed in agent/created as the person, succeeds and says to use a stronger model; the GLM and the non-GLM run both', wishOk(designGlmIdle) && wishOk(designPlainIdle), JSON.stringify([designGlmIdle.human[0]?.result, designPlainIdle.human[0]?.result])],
    ['design idle (GLM): the first request, the turn the wish woke, already has the identity section, no Write, Edit or ask_user_question, and the notice with the wish in the person\'s words', sectionAt(designGlmIdle.steps[0]) >= 0 && !GLM_CUT.some(name => faceOf(designGlmIdle.steps[0]).includes(name)) && wished(designGlmIdle.steps[0]), `section at ${sectionAt(designGlmIdle.steps[0])}; ${faceOf(designGlmIdle.steps[0]).filter(name => GLM_CUT.includes(name)).join(', ') || 'no cut tool'}; wish notice ${wished(designGlmIdle.steps[0])}`],
    ['design idle (GLM): the headless task turn has the section after the ZCode identity and before the workspace rules; /glm-status says the design row is in effect', placed(designGlmIdle.steps[1], true) && inEffect(rowAt(designGlmIdle, 1)), `${zcode(designGlmIdle.steps[1])} < ${sectionAt(designGlmIdle.steps[1])} < ${designGlmIdle.steps[1]?.system.indexOf(GUARD_SECTION)}; ${JSON.stringify(rowAt(designGlmIdle, 1) ?? null)}`],
    ['design idle (non-GLM): the first request has the section before the workspace rules, no ZCode identity, the cut tools gone, the wish notice; the task turn is in effect in /hourness-status', placed(designPlainIdle.steps[0], false) && !PLAIN_CUT.some(name => faceOf(designPlainIdle.steps[0]).includes(name)) && wished(designPlainIdle.steps[0]) && inEffect(rowAt(designPlainIdle, 1)), `${sectionAt(designPlainIdle.steps[0])} < ${designPlainIdle.steps[0]?.system.indexOf(GUARD_SECTION)}; ${JSON.stringify(rowAt(designPlainIdle, 1) ?? null)}`],
    ...route.flatMap(([scenario, glmRoute, cut, label]) => {
      const steps = scenario.steps
      const hasSection = index => sectionAt(steps[index]) >= 0
      return [
        [`design main (${label}): before /wish the first two requests have the ordinary face, with ${cut.join(', ')}, and no identity section`, [0, 1].every(index => !hasSection(index) && hasCut(steps[index], cut)), steps.slice(0, 2).map(step => `${sectionAt(step)}/${hasCut(step, cut)}`).join(' ')],
        [`design main (${label}): /wish, /wish <wish> and /wish off typed mid-step through the commands service succeed, and command/run and command/done are in the session log`, lineOk(steps[1], '/wish') && lineOk(steps[3], `/wish ${DESIGN_WISH}`) && lineOk(steps[4], '/wish off'), [1, 3, 4].map(index => `${steps[index]?.line?.kind}:${steps[index]?.line?.types?.join('>')}`).join(' | ')],
        [`design main (${label}): the request after /wish has the section${glmRoute ? ' between the ZCode identity and the workspace rules' : ' before the workspace rules'}, the first request's face without ${cut.join(', ')}, the enter notice, and the row in effect`, hasSection(2) && placed(steps[2], glmRoute) && isDeepStrictEqual(faceOf(steps[2]), faceWithout(steps[0], cut)) && entered(steps[2]) && inEffect(rowAt(scenario, 2)), `section ${sectionAt(steps[2])}; face ${faceOf(steps[2]).length} of ${faceOf(steps[0]).length}; ${JSON.stringify(rowAt(scenario, 2) ?? null)}`],
        [`design main (${label}): /wish <wish> typed while the agent runs arrives at its next step with the words and the original marker`, !wished(steps[3]) && wished(steps[4]) && hasSection(3) && hasSection(4), `${steps.map(step => wished(step) ? 1 : 0).join('')}`],
        [`design main (${label}): after /wish off the request has no section, the first request's face and the leave notice; the row is not in effect; the Write after it ran, so did the one before`, !hasSection(5) && isDeepStrictEqual(faceOf(steps[5]), faceOf(steps[0])) && left(steps[5]) && !left(steps[4]) && notInEffect(rowAt(scenario, 5)) && files(scenario, 'before.txt', 'after.txt').every(Boolean), `${sectionAt(steps[5])}; ${JSON.stringify(rowAt(scenario, 5) ?? null)}; files ${files(scenario, 'before.txt', 'after.txt').join(',')}`],
        [`design main (${label}): the row activated quietly, the record is gone after /wish off, and no question card was raised`, scenario.status === 0 && rowQuiet(scenario) && humanQuiet(scenario) && designRecord(scenario).kind === 'none', `exit ${scenario.status}; record ${designRecord(scenario).kind}`],
      ]
    }),
    ['design one main: a second root session in the same workspace, typing /wish, is told where the main agent is and how to move it; its tool face and the first session\'s are not changed by it', mainSteps[0]?.other?.kind === 'success' && mainSteps[0].other.resultText.includes('这个项目的主 Agent 在另一个会话里') && mainSteps[0].other.resultText.includes('/wish here') && sectionAt(mainSteps[1]) >= 0 && lacks(mainSteps[1], ['Write', 'Edit']), JSON.stringify(mainSteps[0]?.other ?? null).slice(0, 160)],
    ['design one main: /wish here moves the role; the first session\'s next request has no section, its tool face back (Write, Edit, ask_user_question), the notice that the main agent moved; the Write runs', mainSteps[1]?.other?.kind === 'success' && mainSteps[1].other.resultText.startsWith('主 Agent 已从另一个会话移到这里；') && mainSteps[2] !== undefined && sectionAt(mainSteps[2]) < 0 && hasCut(mainSteps[2], GLM_CUT) && wishNotices(mainSteps[2]).some(message => message.text.includes('moved to another session')) && files(one, 'x.txt')[0], `${mainSteps[1]?.other?.kind}; section ${sectionAt(mainSteps[2])}; x.txt ${files(one, 'x.txt')[0]}`],
    ['design one main: the record names the second session, not the first and not the fork; the second session logged its own two commands', holder.kind === 'held' && holder.record.sessionId.startsWith('probe-other-') && holder.record.sessionId !== mainId && holder.record.sessionId !== forkNote?.sessionId && mainSteps[0]?.other?.types.join('>') === 'command/run>command/done', `${holder.kind === 'held' ? holder.record.sessionId : holder.kind}`],
    ['design one main: a fork of the first session at its /wish is an ordinary session from its first request on: no section, the ordinary face; the row ran /wish off for it, so its projection is off; the record is unchanged; the row warned of nothing', forkNote?.kind === 'forked' && forkSteps.length === 1 && forkSteps[0].sessionId === forkNote.sessionId && sectionAt(forkSteps[0]) < 0 && hasCut(forkSteps[0], GLM_CUT) && forkNote.types.includes('command/run') && forkNote.types.includes('command/done') && isDeepStrictEqual(forkNote.hournessMainAgent, { active: false }) && rowQuiet(one) && humanQuiet(one) && one.status === 0, JSON.stringify(forkNote ?? null).slice(0, 220)],
  ]
}

const checks = [
  ['sandbox: the runtime booted each profile generated under the run directory (its cordis.yml rewritten by the launcher); the real profiles directory has none of them', rewritten.length === GENERATED_PROFILES.length && leaked.length === 0, `rewritten: ${rewritten.join(', ') || 'none'}; under ${realProfiles}: ${leaked.join(', ') || 'none'}`],
  ['glm-only: with only the GLM channel package the GLM request has the ZCode identity, the aliases and the search controls, and no graph or memory tool', glmOnlyFirst?.system.includes('You are ZCode, an interactive agent') === true && zcodeFace.every(name => glmOnlyTools.has(name)) && searchControls.every(name => glmOnlyTools.has(name)) && ![...glmOnlyTools].some(name => GRAPH_TOOL_NAMES.includes(name) || MEMORY_TOOL_NAMES.includes(name)) && glmOnlyRead?.isError !== true, glmOnlyFirst === undefined ? `no request (exit ${glmOnly.status})` : `${glmOnlyTools.size} tools; ${[...glmOnlyTools].filter(name => name.startsWith('graph_') || name.startsWith('memory_')).join(', ') || 'no graph or memory tool'}`],
  ['glm-only: the glm:memory section follows the memory tools: absent here, present in the GLM scenario on probe-full', glmOnlyFirst !== undefined && !glmOnlyFirst.system.includes(MEMORY_SECTION_LINE) && glmFirst?.system.includes(MEMORY_SECTION_LINE) === true, `glm-only ${glmOnlyFirst?.system.includes(MEMORY_SECTION_LINE) ?? 'no request'}; glm ${glmFirst?.system.includes(MEMORY_SECTION_LINE) ?? 'no request'}`],
  ['glm-only: at the peak clock the first request carries the wrapped peak reminder once', peakNotices(glmOnlyFirst).length === 1 && peakNotices(glmOnlyFirst)[0].text === PEAK_NOTICE, `${peakNotices(glmOnlyFirst).length} notice(s)`],
  ['glm-only: /glm-status lists the GLM rows and the orchestration package as one line not loaded', onlyOneLoaded(glmOnlyHealth, 'glm', 'hourness'), JSON.stringify(glmOnlyHealth[WHOLE] ?? null)],
  ['glm-only: no usage journal is written anywhere (the memory row is not installed); no skipped bundle and no row warning', glmOnlyUsage.length === 0 && quiet('glm-only'), `usage files: ${glmOnlyUsage.join(', ') || 'none'}; stderr ${stderrOf('glm-only').length} byte(s)`],
  ['glm-only: without the orchestration package the system prompt declares no workspace rules (the guard is that package\'s)', glmOnlyFirst !== undefined && !glmOnlyFirst.system.includes('# Workspace rules'), ''],
  ['hourness-only: with only the orchestration package the face has the graph, memory and native tools, no ZCode alias and no tool search', hournessOnlyFirst !== undefined && [...GRAPH_TOOL_NAMES, ...MEMORY_TOOL_NAMES, 'write', 'pwsh'].every(name => hournessOnlyTools.has(name)) && !['Write', 'Bash', 'LocalToolSearch', 'DeferredToolCall'].some(name => hournessOnlyTools.has(name)), hournessOnlyFirst === undefined ? `no request (exit ${hournessOnly.status})` : `${hournessOnlyTools.size} tools`],
  ['hourness-only: after graph_focus the next request ends with the projection notice (focus)', hournessOnlyProjection?.source === 'glm-graph-projection' && hournessOnlyProjection.projection === 'focus', JSON.stringify({ source: hournessOnlyProjection?.source, projection: hournessOnlyProjection?.projection })],
  ['hourness-only: a native write into the graph is denied by graph-files-only, a shell write by file-tools-only in native names; neither file is written and both records are tagged other', hournessOnlyWrite?.isError === true && hournessOnlyWrite.text.includes('inside the project graph') && !existsSync(hournessOnlyNode) && hournessOnlyPwsh?.isError === true && hournessOnlyPwsh.text.includes(RIGHT_PATH_NATIVE) && !existsSync(hournessOnlyShell) && hournessOnlyViolations.map(record => `${record.rule}:${record.tool}:${record.scope}`).join(',') === 'graph-files-only:write:other,file-tools-only:pwsh:other', `records: ${hournessOnlyViolations.map(record => `${record.rule}:${record.tool ?? ''}:${record.scope ?? ''}`).join(', ') || 'none'}; shell file ${existsSync(hournessOnlyShell)}`],
  ['hourness-only: the system prompt declares the workspace rules in native names, graph-files-only included', hournessOnlyFirst?.system.includes(GUARD_SECTION) === true && hournessOnlyFirst.system.includes('\n- Modify files and code only with the dedicated write/edit tools.') && hournessOnlyFirst.system.includes(GRAPH_FILES_LINE), hournessOnlyFirst === undefined ? 'no request' : `section at ${hournessOnlyFirst.system.indexOf(GUARD_SECTION)}`],
  ['hourness-only: /hourness-status lists the orchestration rows and the GLM package as one line not loaded', hournessOnlyStatus?.kind === 'success' && onlyOneLoaded(hournessOnlyHealth, 'hourness', 'glm'), `${hournessOnlyStatus?.kind ?? 'not run'}; ${JSON.stringify(hournessOnlyHealth[WHOLE] ?? null)}`],
  titleCheck('client-modules (probe-full)', clientModules.steps[0]?.meta, ['glm', 'hourness']),
  titleCheck('glm-only', glmOnly.steps[1]?.meta, ['glm']),
  titleCheck('hourness-only', hournessOnly.steps[3]?.meta, ['hourness']),
  ['client-modules: mounted on probe-full with glm-ui enabled, the service composes both packages\' client faces, each once, without an error', Array.isArray(clientGraph?.entries) && CLIENT_PACKAGES.every(name => clientGraph.entries.filter(id => id === name).length === 1) && !stderrOf('client-modules').includes('client-modules') && quiet('client-modules'), `${JSON.stringify(clientGraph ?? null)}; stderr ${stderrOf('client-modules').length} byte(s)`],
  ['hourness-only: /hourness lists calls and tokens without the pricing service; no skipped bundle and no row warning', hournessOnlyReport?.kind === 'success' && hournessOnlyPanel.startsWith('- 没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token') && /^- deepseek-probe：\d+ 次 · 未命中输入 \d+/m.test(hournessOnlyPanel) && quiet('hourness-only'), `${hournessOnlyReport?.kind ?? 'not run'}; ${JSON.stringify(hournessOnlyPanel.split('\n').slice(0, 3))}`],
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
  ['glm prompt: ZCode CLI prefix in the system prompt', glmFirst?.system.includes('You are ZCode, an interactive agent') === true, glmFirst === undefined ? 'no request' : glmFirst.system.slice(0, 80).replace(/\n/g, ' ')],
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
  ['guard: the GLM denial is tagged dialect with the route of the step (the dialect claims the agent)', glmViolations[0]?.scope === 'dialect' && glmViolations[0].route?.provider === 'glm-probe' && glmViolations[0].route.model === 'glm-5.3', JSON.stringify({ scope: glmViolations[0]?.scope, route: glmViolations[0]?.route })],
  ['guard: the GLM system prompt declares the active rules (containment and file-tools-only) after the dialect sections', glmFirst?.system.includes(GUARD_SECTION) === true && glmFirst.system.includes('\n- You may only create and modify files inside the user\'s workspace.') && glmFirst.system.includes('\n- Modify files and code only with the dedicated Write/Edit tools.') && glmFirst.system.indexOf(GUARD_SECTION) > glmFirst.system.indexOf('# Context management'), glmFirst === undefined ? 'no request' : `section at ${glmFirst.system.indexOf(GUARD_SECTION)} of ${glmFirst.system.length}`],
  ['guard: the non-GLM system prompt ends with the same rules in native names', plainFirst?.system.includes(GUARD_SECTION) === true && plainFirst.system.includes('\n- You may only create and modify files inside the user\'s workspace.') && plainFirst.system.includes('\n- Modify files and code only with the dedicated write/edit tools.') && !plainFirst.system.slice(plainFirst.system.indexOf(GUARD_SECTION)).includes('\n\n'), plainFirst === undefined ? 'no request' : `section at ${plainFirst.system.indexOf(GUARD_SECTION)} of ${plainFirst.system.length}`],
  ['guard: quoted =>, -> and >>> and a git subcommand with a quoted arrow run through Bash', arrowsResult !== undefined && arrowsResult.isError !== true && arrowsResult.text.includes('a => b -> c >>> d') && gitResult !== undefined && gitResult.isError !== true && gitResult.text.includes('init => '), `${(arrowsResult?.text ?? 'no tool result').slice(0, 60).replace(/\n/g, ' ')} | ${(gitResult?.text ?? 'no tool result').slice(0, 60).replace(/\n/g, ' ')}`],
  ['guard shadow: a .NET file write the reader cannot see runs, and Write creates its file (shadow mode never blocks)', gitReady && dotnetResult !== undefined && dotnetResult.isError !== true && existsSync(shadowFile) && existsSync(toolFile), `git repo: ${gitReady}; ${(dotnetResult?.text ?? 'no tool result').slice(0, 80).replace(/\n/g, ' ')}`],
  ['guard shadow: one shadow record names the shell-written file, not the Write target, with the turn, the session and the three shell calls', shadowRecords.length === 1 && shadowRecords[0].mode === 'shadow' && shadowRecords[0].rule === 'file-tools-only' && JSON.stringify(shadowRecords[0].paths) === '["shadow.txt"]' && typeof shadowRecords[0].turn === 'number' && shadowRecords[0].calls?.length === 3 && shadowRecords[0].calls.some(call => call.tool === 'Bash' && call.command === dotnetWrite) && shadowRecords[0].sessionId === statusStep(shadow)?.sessionId && shadowRecords[0].scope === 'dialect', `${shadowRecords.length} record(s); first: ${JSON.stringify(shadowRecords[0] ?? null).slice(0, 200)}`],
  ['guard paths: on GLM a relative Write inside the workspace resolves against the session directory and runs', relativeResult !== undefined && relativeResult.isError !== true && existsSync(relativeFile), relativeResult === undefined ? `no tool result (exit ${guardPaths.status})` : relativeResult.text.slice(0, 100).replace(/\n/g, ' ')],
  ['guard paths: on GLM a relative target climbing out with .. is denied by workspace-containment, journaled, and not written', escapeResult?.isError === true && escapeResult.text.includes('That path is outside the workspace') && escapeResult.text.includes(`(resolves to "${escapedFile}")`) && !existsSync(escapedFile) && pathsViolations.length === 1 && pathsViolations[0].rule === 'workspace-containment', `${(escapeResult?.text ?? 'no tool result').slice(0, 120).replace(/\n/g, ' ')}; ${pathsViolations.length} record(s)`],
  ['guard scope: on a non-GLM route a relative write inside the workspace runs; a shell write is denied in native names, not written, and journaled once as other with the route', plainWriteResult !== undefined && plainWriteResult.isError !== true && existsSync(join(plainGuardWs, 'rel.txt')) && plainShellResult?.isError === true && plainShellResult.text.includes('Shell file writes are not permitted') && plainShellResult.text.includes(RIGHT_PATH_NATIVE) && !existsSync(plainShellFile) && plainGuardViolations.length === 1 && plainGuardViolations[0].rule === 'file-tools-only' && plainGuardViolations[0].tool === 'pwsh' && plainGuardViolations[0].scope === 'other' && plainGuardViolations[0].route?.provider === 'glm-probe' && plainGuardViolations[0].route.model === 'deepseek-probe', `write: ${(plainWriteResult?.text ?? 'no tool result').slice(0, 60).replace(/\n/g, ' ')} | pwsh: ${(plainShellResult?.text ?? 'no tool result').split('\n')[2] ?? ''}; records: ${JSON.stringify(plainGuardViolations.map(record => [record.rule, record.tool, record.scope, record.route]))}`],
  ['guard scope: the non-GLM session reports the guard in effect', plainGuardHealth.guard?.status === ACTED && plainGuardHealth.guard.reason.startsWith('门禁生效（file-tools-only，圈禁根 '), JSON.stringify(plainGuardHealth.guard ?? null)],
  ['glm-no-dialect: with glm-prompt disabled the GLM face is the natives (pwsh, no Bash)', noDialectFirst !== undefined && names(noDialectFirst).has('pwsh') && !names(noDialectFirst).has('Bash') && !names(noDialectFirst).has('Write'), noDialectFirst === undefined ? `no request (exit ${noDialect.status})` : [...names(noDialectFirst)].filter(name => ['pwsh', 'Bash', 'write', 'Write'].includes(name)).join(', ')],
  ['glm-no-dialect: the guard still denies a pwsh shell write on GLM, journals it under the called name, and corrects in native names', noDialectResult?.isError === true && noDialectResult.text.includes('Shell file writes are not permitted') && noDialectResult.text.includes(RIGHT_PATH_NATIVE) && !existsSync(noDialectFile) && noDialectViolations.length === 1 && noDialectViolations[0].rule === 'file-tools-only' && noDialectViolations[0].tool === 'pwsh' && noDialectViolations[0].scope === 'other', `${(noDialectResult?.text ?? 'no tool result').split('\n')[2] ?? ''}; ${noDialectViolations.length} record(s), scope ${noDialectViolations[0]?.scope ?? 'none'}`],
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
  ['rules: the row ships disabled: without the overlay /glm-status lists it as not loaded', glmHealth.rules?.status === '未加载' && plainHealth.rules?.status === '未加载', `${healthLine(glmHealth, 'rules')}; ${healthLine(plainHealth, 'rules')}`],
  ['rules-peak: the row, enabled by the overlay in a scratch git workspace, boots on the GLM route, runs the five scripted steps and exits clean with nothing from it on stderr', rulesGlm.ready && rulesPeak.status === 0 && rulesPeak.steps.length === 5 && !rulesStderr.includes('dsh-glm-hourness/rules'), `exit ${rulesPeak.status}, ${rulesPeak.steps.length} step(s), git ${rulesGlm.ready}; ${rulesStderr.split('\n').find(line => line.includes('rules')) ?? 'no stderr line mentions rules'}`],
  ['rules-peak: without a choice the project is at the factory level reduce: the command says so, and in the peak the service gives the cap of one GLM subagent and the hold until 18:00', rulesPeak.steps[1]?.command?.kind === 'success' && rulesPeak.steps[1].command.text.startsWith(`高峰模式：少做（出厂默认）。现在是高峰，到 ${clockText(PEAK_END, rulesPeak.steps[1].clock)}。`) && isDeepStrictEqual(rulesPeak.steps[1].peakMode, { state: { level: 'reduce', origin: 'default', peak: true, until: PEAK_END, glmWorkerCap: 1 }, hold: { level: 'reduce', until: PEAK_END } }), JSON.stringify(rulesPeak.steps[1]?.peakMode ?? null)],
  ['rules-peak: /rules peak 不做 as the person: the reply names the level, the service gives the person\'s choice with no cap and the hold of the stop level', rulesPeak.steps[3]?.command?.kind === 'success' && rulesPeak.steps[3].command.text.startsWith('高峰模式改成了「不做」') && rulesPeak.steps[3].peakMode?.state?.level === 'stop' && rulesPeak.steps[3].peakMode.state.origin === 'human' && rulesPeak.steps[3].peakMode.state.peak === true && rulesPeak.steps[3].peakMode.state.glmWorkerCap === undefined && isDeepStrictEqual(rulesPeak.steps[3].peakMode.hold, { level: 'stop', until: PEAK_END }), JSON.stringify(rulesPeak.steps[3]?.peakMode ?? null)],
  ['rules-peak: /rules peak 无影响 leaves no cap and no hold', rulesPeak.steps[4]?.command?.kind === 'success' && rulesPeak.steps[4].peakMode?.state?.level === 'inform' && rulesPeak.steps[4].peakMode.state.peak === true && rulesPeak.steps[4].peakMode.state.glmWorkerCap === undefined && rulesPeak.steps[4].peakMode.hold === null, JSON.stringify(rulesPeak.steps[4]?.peakMode ?? null)],
  ['rules-peak: the main agent is held on no level: its Read ran under the factory level and again under 不做 in the peak', [2, 4].every(index => { const result = lastToolResult(rulesPeak.steps[index]); return result !== undefined && result.isError !== true }), [2, 4].map(index => lastToolResult(rulesPeak.steps[index])?.text?.slice(0, 40) ?? 'no result').join(' | ')],
  ['rules-peak: the choice is in the repository file and in the project\'s journal (two person\'s writes), and nothing is written in the scenario\'s user-level directory', rulesFile?.peakMode?.level === 'inform' && isDeepStrictEqual(rulesRecords.map(record => [record.op, record.actor, record.from, record.to]), [['peak-mode-set', 'human', 'reduce', 'stop'], ['peak-mode-set', 'human', 'stop', 'inform']]) && !existsSync(join(runDir, 'rules-peak', 'dsh-home', 'glm-hourness', 'rules')), `${JSON.stringify(rulesFile ?? null)}; ${rulesRecords.length} record(s)`],
  ['rules-peak: /glm-status lists the rules row in effect with the level in force at that step and the clock', rulesHealth.rules?.status === ACTED && rulesHealth.rules.package === 'dsh-hourness' && rulesHealth.rules.reason.includes('高峰模式 不做（你选的）；现在是高峰') && grouped(rulesHealth), healthLine(rulesHealth, 'rules') + ` (${rulesHealth.rules?.reason ?? ''})`],
  ['rules-peak: rules_show at the shifted clock lists the default rule with the end of the peak, and the peak line', peakShown?.isError !== true && peakShown?.text.includes('builtin:glm-peak-pricing') === true && peakShown.text.includes(`GLM peak hours until ${PEAK_END_HM}`) && peakShown.text.includes('GLM peak: now'), (peakShown?.text ?? 'no result').slice(0, 300)],
  ['rules-peak: the GLM package\'s reminder is in every request exactly once, and the board\'s reminder neither repeats its sentences nor says keep working or postpone', rulesPeak.steps.every(step => peakNotices(step).length === 1) && peakTexts.length === 1 && peakSentences.every(sentence => !peakTexts[0].includes(sentence)) && !/keep working|postpone|charged at the full credit rate/i.test(peakTexts[0] ?? ''), `${rulesPeak.steps.map(step => peakNotices(step).length).join(', ')} | ${peakTexts.join(' // ')}`],
  ['rules-peak: the main agent\'s first request after /wish starts the board\'s reminder with the peak line of the factory level: reduce, the default, one GLM subagent', peakTexts[0] === REDUCE_LINE, JSON.stringify(peakTexts)],
  ['rules-peak: the line is said once while nothing changes, and again with the new level after 不做', rulesPeak.steps.slice(1, 4).every(step => boardTexts(step).length === 1) && boardTexts(rulesPeak.steps[4]).length === 2 && boardTexts(rulesPeak.steps[4])[1].startsWith(STOP_LINE_START), rulesPeak.steps.map(step => boardTexts(step).length).join(', ')],
  ['rules-peak-hourness: with only the orchestration package there is no pricing service: the person\'s choice is kept, no peak is known, there is no cap and no hold, and the command says why', rulesPeakAlone.status === 0 && aloneState !== undefined && aloneState !== null && aloneState.level === 'stop' && aloneState.origin === 'human' && !('peak' in aloneState) && !('glmWorkerCap' in aloneState) && !('until' in aloneState) && rulesPeakAlone.steps[0].peakMode.hold === null && rulesPeakAlone.steps[0].command?.text.includes('读不到是不是高峰（没有计价服务（GLM 通道包未装，或它的 glm-login 行未启用））') === true, JSON.stringify(rulesPeakAlone.steps[0]?.peakMode ?? null)],
  ['glm-rules: the row boots on the GLM route with the rules file of the clone, runs its four steps and exits clean with nothing from it on stderr', glmRulesProject.ready && glmRules.status === 0 && glmRules.steps.length === 4 && !stderrOf('glm-rules').includes('dsh-glm-hourness/rules'), `exit ${glmRules.status}, ${glmRules.steps.length} step(s), git ${glmRulesProject.ready}; ${stderrOf('glm-rules').split('\n').find(line => line.includes('rules')) ?? 'no stderr line mentions rules'}`],
  ['glm-rules: the command the block rule names is refused with the rule\'s four-part text, so it never ran', lastToolResult(glmRules.steps[1])?.isError === true && /^Error: You tried to run "Write-Output rules-probe-blocked"\.\nBoundary: Rule r-probe-block "Probe word" \(set by the human at [^)]+, until lifted\) blocks it now\.\nRight path: .+\nException: /.test(lastToolResult(glmRules.steps[1])?.text ?? ''), lastToolResult(glmRules.steps[1])?.text?.slice(0, 160) ?? 'no result'],
  ['glm-rules: that refusal is in the violation journal as rules:r-probe-block, enforced, on the dialect route', rulesRecordOf(glmRulesRecords, 'rules:r-probe-block')?.mode === 'enforce' && rulesRecordOf(glmRulesRecords, 'rules:r-probe-block').effect === 'block' && rulesRecordOf(glmRulesRecords, 'rules:r-probe-block').scope === 'dialect' && rulesRecordOf(glmRulesRecords, 'rules:r-probe-block').tool === 'Bash', JSON.stringify(rulesRecordOf(glmRulesRecords, 'rules:r-probe-block') ?? null).slice(0, 200)],
  ['glm-rules: a file tool writing into the rules directory is refused by rules:files-only, the file is as it was and the refusal is journaled', lastToolResult(glmRules.steps[2])?.isError === true && (lastToolResult(glmRules.steps[2])?.text ?? '').includes('Rule rules:files-only') && readFileSync(glmRulesProject.rulesFile, 'utf8') === GATE_RULES_FILE && rulesRecordOf(glmRulesRecords, 'rules:files-only')?.mode === 'enforce', lastToolResult(glmRules.steps[2])?.text?.slice(0, 160) ?? 'no result'],
  ['glm-rules: a command no rule names runs', lastToolResult(glmRules.steps[3])?.isError !== true && (lastToolResult(glmRules.steps[3])?.text ?? '').includes('rules-probe-allowed'), lastToolResult(glmRules.steps[3])?.text?.slice(0, 80) ?? 'no result'],
  ['glm-rules: the first request carries the board\'s reminder of the rule that only informs, no request carries another (nothing changed), and the system prompt declares the rules board in the guard section', glmRules.steps.every(step => boardTexts(step).length === 1) && boardTexts(glmRules.steps[0])[0]?.includes('[inform, not checked] r-probe-note: "Probe note" (set by the human)') === true && !boardTexts(glmRules.steps[0])[0].includes('r-probe-block') && glmRules.steps.every(step => step.system.includes(RULES_DECLARATION)), `${glmRules.steps.map(step => boardTexts(step).length).join(', ')} board message(s) per request; declared ${glmRules.steps.filter(step => step.system.includes(RULES_DECLARATION)).length}/${glmRules.steps.length}`],
  ['glm-rules: /glm-status lists the rules row in effect with the rules of the person counted, and nothing is written in the scenario\'s user-level directory', glmRulesHealth.rules?.status === ACTED && glmRulesHealth.rules.reason.includes('2 条你设的规则生效') && !existsSync(join(runDir, 'glm-rules', 'dsh-home', 'glm-hourness', 'rules')), healthLine(glmRulesHealth, 'rules') + ` (${glmRulesHealth.rules?.reason ?? ''})`],
  ['non-glm-rules: the row boots on the non-GLM route with the rules file of the clone, runs its five steps and exits clean with nothing from it on stderr', nonGlmRulesProject.ready && nonGlmRules.status === 0 && nonGlmRules.steps.length === 5 && !stderrOf('non-glm-rules').includes('dsh-glm-hourness/rules'), `exit ${nonGlmRules.status}, ${nonGlmRules.steps.length} step(s), git ${nonGlmRulesProject.ready}; ${stderrOf('non-glm-rules').split('\n').find(line => line.includes('rules')) ?? 'no stderr line mentions rules'}`],
  ['non-glm-rules: the blocked command is refused and journaled as rules:r-probe-block on a route the dialect did not claim', lastToolResult(nonGlmRules.steps[1])?.isError === true && (lastToolResult(nonGlmRules.steps[1])?.text ?? '').includes('Rule r-probe-block "Probe word"') && rulesRecordOf(nonGlmRulesRecords, 'rules:r-probe-block')?.scope === 'other' && rulesRecordOf(nonGlmRulesRecords, 'rules:r-probe-block').tool === 'pwsh', lastToolResult(nonGlmRules.steps[1])?.text?.slice(0, 160) ?? 'no result'],
  ['non-glm-rules: a file tool writing into the project\'s .llm/rules/ is refused by rules:files-only and nothing is written', lastToolResult(nonGlmRules.steps[2])?.isError === true && (lastToolResult(nonGlmRules.steps[2])?.text ?? '').includes('Rule rules:files-only') && !stateWritten && rulesRecordOf(nonGlmRulesRecords, 'rules:files-only')?.scope === 'other', lastToolResult(nonGlmRules.steps[2])?.text?.slice(0, 160) ?? 'no result'],
  ['non-glm-rules: rules_show, in the real runtime, lists the rules in force for the caller, the signals and the peak mode', lastToolResult(nonGlmRules.steps[3])?.isError !== true && /^Rules board of ws\./.test(lastToolResult(nonGlmRules.steps[3])?.text ?? '') && /\] r-probe-block: /.test(lastToolResult(nonGlmRules.steps[3])?.text ?? '') && /\] r-probe-note: /.test(lastToolResult(nonGlmRules.steps[3])?.text ?? '') && (lastToolResult(nonGlmRules.steps[3])?.text ?? '').includes('Peak mode:'), lastToolResult(nonGlmRules.steps[3])?.text?.slice(0, 200) ?? 'no result'],
  ['non-glm-rules: a command no rule names runs, every request carries the one reminder of the rule that only informs, and /glm-status lists the row in effect', lastToolResult(nonGlmRules.steps[4])?.isError !== true && (lastToolResult(nonGlmRules.steps[4])?.text ?? '').includes('rules-probe-allowed') && nonGlmRules.steps.every(step => boardTexts(step).length === 1) && boardTexts(nonGlmRules.steps[0])[0]?.includes('r-probe-note') === true && nonGlmRulesHealth.rules?.status === ACTED && !existsSync(join(runDir, 'non-glm-rules', 'dsh-home', 'glm-hourness', 'rules')), healthLine(nonGlmRulesHealth, 'rules') + ` (${nonGlmRulesHealth.rules?.reason ?? ''})`],
  ['rules-queue: the row boots on the GLM route at the peak clock with a queue rule in the clone\'s rules file, runs its five steps and exits clean with nothing from it on stderr', queueProject.ready && rulesQueue.status === 0 && rulesQueue.steps.length === 5 && !stderrOf('rules-queue').includes('dsh-glm-hourness/rules'), `exit ${rulesQueue.status}, ${rulesQueue.steps.length} step(s), git ${queueProject.ready}; ${stderrOf('rules-queue').split('\n').find(line => line.includes('rules')) ?? 'no stderr line mentions rules'}`],
  ['rules-queue: the call the rule names is refused with the ticket number and the four parts, so it never ran; the same call again gets the same text under the same ticket', QUEUE_REFUSAL.test(lastToolResult(rulesQueue.steps[1])?.text ?? '') && lastToolResult(rulesQueue.steps[2])?.text === lastToolResult(rulesQueue.steps[1])?.text && lastToolResult(rulesQueue.steps[1]).isError === true, lastToolResult(rulesQueue.steps[1])?.text?.slice(0, 200) ?? 'no result'],
  ['rules-queue: the board kept one ticket, journaled both refusals as queue lines naming it, and opened it as the harness', isDeepStrictEqual(Object.keys(queueState?.tickets ?? {}), ['q-1']) && queueState.tickets['q-1'].tool === 'pwsh' && queueState.tickets['q-1'].rules.join() === 'r-probe-queue' && queueRecords.filter(record => record.rule === 'rules:r-probe-queue' && record.effect === 'queue' && record.mode === 'enforce' && record.ticket === 'q-1').length === 2 && queueJournal.find(record => record.op === 'ticket-open')?.actor === 'harness', JSON.stringify(queueState?.tickets ?? null).slice(0, 200)],
  ['rules-queue: the person lifts the rule through the real /rules handler mid-step, and the session is told once: the next request carries the wake message and the one before did not', rulesQueue.steps[2]?.command?.kind === 'success' && wakeMessages(rulesQueue.steps[2]).length === 0 && wakeMessages(rulesQueue.steps[3]).length === 1 && queueWake.test(wakeMessages(rulesQueue.steps[3])[0].text) && wakeMessages(rulesQueue.steps.at(-1)).length === 1, wakeMessages(rulesQueue.steps[3])[0]?.text ?? `no wake in request 4; command: ${JSON.stringify(rulesQueue.steps[2]?.command ?? null).slice(0, 120)}`],
  ['rules-queue: the call again runs, and the ticket it waited on is done', lastToolResult(rulesQueue.steps[4])?.isError !== true && (lastToolResult(rulesQueue.steps[4])?.text ?? '').includes('rules-probe-queued') && queueState?.tickets?.['q-1']?.state === 'done', `${lastToolResult(rulesQueue.steps[4])?.text?.slice(0, 80) ?? 'no result'}; ticket ${queueState?.tickets?.['q-1']?.state ?? 'missing'}`],
  ['rules-queue: the request carries the reminder exactly when something changed: the rule that informs, then with the open ticket, then with it cleared, then the rule alone again', isDeepStrictEqual(rulesQueue.steps.map(step => boardTexts(step).length), [1, 2, 2, 3, 4]) && consecutiveDiffer(boardTexts(rulesQueue.steps.at(-1))) && boardTexts(rulesQueue.steps.at(-1))[1].includes('Your open tickets: q-1 pwsh "Write-Output rules-probe-queued" (deferred since') && boardTexts(rulesQueue.steps.at(-1))[2].includes('(cleared at') && boardTexts(rulesQueue.steps.at(-1))[3] === boardTexts(rulesQueue.steps.at(-1))[0], rulesQueue.steps.map(step => boardTexts(step).length).join(', ')],
  ['rules-queue: nothing is written in the scenario\'s user-level directory', !existsSync(join(runDir, 'rules-queue', 'dsh-home', 'glm-hourness', 'rules')), ''],
  ['rules-handover: a one-off subagent makes the call the rule names, is refused with the ticket and the text for a subagent, hands back and ends', handoverProject.ready && rulesHandover.status === 0 && handoverStarted !== undefined && handoverMain.length === 6 && handoverChild.length === 2 && lastToolResult(handoverChild[1])?.isError === true && (lastToolResult(handoverChild[1])?.text ?? '').includes('Deferred as ticket q-1.') && (lastToolResult(handoverChild[1])?.text ?? '').includes('stop and report ticket q-1 in your handoff; the agent that dispatched you is told when it clears.'), `exit ${rulesHandover.status}, main ${handoverMain.length} request(s), child ${handoverChild.length}; ${lastToolResult(handoverChild[1])?.text?.slice(0, 120) ?? 'no refusal'}`],
  ['rules-handover: the ticket went to the agent that dispatched the subagent (the subagent kept in handedFrom), before the person lifted the rule', handoverTicket?.sessionId === handoverStarted?.parentId && handoverTicket?.handedFrom?.sessionId === handoverStarted?.childId && isDeepStrictEqual(handoverJournal.filter(record => record.op !== 'base').map(record => [record.op, record.actor]), [['ticket-open', 'harness'], ['ticket-handover', 'harness'], ['rule-lift', 'human'], ['ticket-update', 'harness']]), `${JSON.stringify(handoverTicket ?? null).slice(0, 200)}; ${handoverJournal.map(record => record.op).join(' > ')}; ${handoverJournal.find(record => record.op === 'ticket-handover')?.reason ?? 'no hand-over'}`],
  ['rules-handover: after the person lifts the rule the main agent is told once, with the text for a ticket handed over from a subagent that has ended', handoverMain.length === 6 && wakeMessages(handoverMain[4]).length === 0 && wakeMessages(handoverMain[5]).length === 1 && new RegExp(`^\\[rules board\\] Ticket q-1 cleared: rule r-probe-queue was lifted by the human\\. Subagent "${handoverStarted?.childId.slice(-8)}" was deferred on pwsh "Write-Output rules-probe-queued" and has ended\\. Dispatch the task again or run the call yourself; a new dispatch of the same call reuses q-1\\.$`).test(wakeMessages(handoverMain[5])[0].text) && handoverTicket?.state === 'cleared', wakeMessages(handoverMain[5])[0]?.text ?? 'no wake in the last request'],
  ['rules-handover: the main agent\'s requests carry the reminder only when it changed, and it names the ticket handed over from the subagent', handoverMain.length === 6 && boardTexts(handoverMain[0]).length === 1 && consecutiveDiffer(boardTexts(handoverMain.at(-1))) && boardTexts(handoverMain.at(-1)).some(text => text.includes('handed over from subagent') && text.includes('Do not dispatch these tasks again before their tickets clear.')), handoverMain.map(step => boardTexts(step).length).join(', ')],
  ['rules-handover: nothing is written in the scenario\'s user-level directory', !existsSync(join(runDir, 'rules-handover', 'dsh-home', 'glm-hourness', 'rules')), ''],
  ['rules-peak-stop: the stop level in a GLM peak: the GLM main agent runs the probe tool, a subagent session with a goal is made, and the run exits clean with nothing from the row on stderr', stopProject.ready && rulesPeakStop.status === 0 && stopCreated?.origin === 'subagent' && lastToolResult(stopMain.at(-1))?.isError !== true && !stderrOf('rules-peak-stop').includes('dsh-glm-hourness/rules'), `exit ${rulesPeakStop.status}, ${rulesPeakStop.steps.length} step(s), git ${stopProject.ready}; ${JSON.stringify(stopCreated ?? null)}; ${stderrOf('rules-peak-stop').split('\n').find(line => line.includes('rules')) ?? 'no stderr line mentions rules'}`],
  ['rules-peak-stop: the subagent\'s first tool call is refused with the ticket, the words of the stop level and the sentence that its goal is paused, so it never ran', stopChild.length === 4 && lastToolResult(stopChild[1])?.isError === true && STOP_REFUSAL.test(lastToolResult(stopChild[1]).text), lastToolResult(stopChild[1])?.text ?? 'no result'],
  ['rules-peak-stop: V12, the goal is paused from inside the subagent\'s own tool call: the pause came while the agent ran, the same step finished (its next request has the refusal), and the turn ended on the paused goal', isDeepStrictEqual(stopOps.slice(0, 2).map(entry => [entry.operation, entry.status]), [['create', 'idle'], ['pause', 'running']]) && stopOps[1]?.goal?.phase === 'paused' && stopNote('stop-paused')?.ok === true && stopNote('stop-paused').status === 'idle', JSON.stringify(stopOps.map(entry => [entry.operation, entry.status, entry.goal?.phase, entry.goal?.roundsStarted]))],
  ['rules-peak-stop: no new round starts while the peak holds: four seconds later the goal is still paused, the agent idle, and the round count the same', stopNote('stop-held')?.status === 'idle' && stopNote('stop-held').goal?.phase === 'paused' && stopNote('stop-held').goal.roundsStarted === stopNote('stop-paused')?.goal?.roundsStarted && stopNote('stop-held').goal.roundsStarted === 1, JSON.stringify([stopNote('stop-paused')?.goal, stopNote('stop-held')?.goal])],
  ['rules-peak-stop: a subagent session that is not on GLM runs its call and has no ticket', stopNote('stop-plain')?.ok === true && stopPlain.length === 2 && lastToolResult(stopPlain[1])?.isError !== true && (lastToolResult(stopPlain[1])?.text ?? '').includes('rules-probe-plain') && isDeepStrictEqual(Object.keys(stopState?.tickets ?? {}), ['q-1']), `${stopPlain.length} request(s); ${(lastToolResult(stopPlain[1])?.text ?? 'no result').slice(0, 60)}; tickets ${JSON.stringify(Object.keys(stopState?.tickets ?? {}))}`],
  ['rules-peak-stop: /rules peak 无影响 as the person through the real handler: the goal is active again within 30 seconds, the subagent takes its next round at once and is told to carry on in the step after it, and the main agent was never touched', stopNote('stop-lifted')?.result.kind === 'success' && stopOps.map(entry => entry.operation).slice(0, 3).join() === 'create,pause,resume' && Date.parse(stopOps[2]?.at) - Date.parse(stopNote('stop-lifted').at) < 30_000 && stopChild.length === 4 && roundOf(stopChild[2], 2) && wakeMessages(stopChild[1]).length === 0 && wakeMessages(stopChild[2]).length === 0 && wakeMessages(stopChild[3]).length === 1 && STOP_WAKE.test(wakeMessages(stopChild[3])[0].text) && stopMain.every(step => wakeMessages(step).length === 0), `${stopNote('stop-lifted')?.result.kind}; ${stopOps.map(entry => entry.operation).join()}; ${stopChild.map(step => wakeMessages(step).length).join(', ')} wake(s) per request; ${wakeMessages(stopChild[3]).map(message => message.text).join(' // ') || 'no wake in the last request'}`],
  ['rules-peak-stop: the goal ends complete after that round, and the ticket is done with the goal and revision the pause made and the time the goal was resumed', stopNote('stop-final')?.ok === true && stopNote('stop-final').goal?.phase === 'complete' && stopState?.tickets?.['q-1']?.state === 'done' && stopState.tickets['q-1'].signature === 'any:builtin:glm-peak-stop' && stopState.tickets['q-1'].sessionId === stopCreated?.agentId && stopState.tickets['q-1'].pausedGoal?.id === stopCreated?.goal?.id && stopState.tickets['q-1'].pausedGoal.revision === stopOps[1]?.goal?.revision && typeof stopState.tickets['q-1'].resumedAt === 'string', JSON.stringify(stopState?.tickets?.['q-1'] ?? null)],
  ['rules-peak-stop: the journal has the ticket opened by the harness, the level changed by the person, and the ticket closed by the harness with its goal resumed, in that order; nothing is written in the scenario\'s user-level directory', isDeepStrictEqual(stopJournal.map(record => [record.op, record.actor]).filter(([op]) => op === 'ticket-open' || op === 'peak-mode-set' || op === 'ticket-update'), [['ticket-open', 'harness'], ['peak-mode-set', 'human'], ['ticket-update', 'harness']]) && !existsSync(join(runDir, 'rules-peak-stop', 'dsh-home', 'glm-hourness', 'rules')), JSON.stringify(stopJournal.map(record => [record.op, record.actor]))],
  ['rules-peak-stop-exit: V13, the host exits with the goal paused at the stop level: the run is clean and the way out agrees with itself: a row that unloaded (its heartbeat file is gone) resumed the goal and wrote it on the ticket, a runner that left without unloading it left the goal and the ticket as the stop made them', stopExitProject.ready && rulesPeakStopExit.status === 0 && !stderrOf('rules-peak-stop-exit').includes('dsh-glm-hourness/rules') && stopExitNotes.some(entry => entry.kind === 'stop-held' && entry.goal?.phase === 'paused') && (stopExitUnloaded ? typeof stopExitState?.tickets?.['q-1']?.resumedAt === 'string' && stopExitOps.includes('resume') : stopExitState?.tickets?.['q-1']?.state === 'deferred' && stopExitState.tickets['q-1'].resumedAt === undefined && stopExitOps.join() === 'create,pause'), `unloaded ${stopExitUnloaded}; exit ${rulesPeakStopExit.status}; goal operations ${JSON.stringify(stopExitOps)}; ticket ${JSON.stringify(stopExitState?.tickets?.['q-1'] ?? null)}; journal ${JSON.stringify(stopExitJournal.map(record => [record.op, record.reason ?? null]).slice(-3))}; ${stderrOf('rules-peak-stop-exit').split('\n').find(line => line.includes('rules')) ?? 'no stderr line mentions rules'}`],
  ['loops: the row ships disabled: without the overlay /glm-status lists it as not loaded', glmHealth.loops?.status === '未加载' && plainHealth.loops?.status === '未加载', `${healthLine(glmHealth, 'loops')}; ${healthLine(plainHealth, 'loops')}`],
  ['loops: the row, enabled by the overlay in a scratch git clone that carries a person\'s entry file, boots, runs its four steps and exits clean with nothing from it on stderr', loopsBoard.ready && loops.status === 0 && loops.steps.length === 4 && !stderrOf('loops').includes('dsh-glm-hourness/loops'), `exit ${loops.status}, ${loops.steps.length} step(s), git ${loopsBoard.ready}; ${stderrOf('loops').split('\n').find(line => line.includes('loops')) ?? 'no stderr line mentions loops'}`],
  ['loops: a file tool writing into docs/loops/ is refused by loops:files-only with the four-part text, the entry file is as it was, and the refusal is journaled as enforced', lastToolResult(loops.steps[1])?.isError === true && LOOPS_DENIAL.test(lastToolResult(loops.steps[1]).text) && readFileSync(loopsBoard.entryFile, 'utf8') === LOOPS_ENTRY_TEXT && rulesRecordOf(loopsRecords, 'loops:files-only')?.mode === 'enforce', lastToolResult(loops.steps[1])?.text?.slice(0, 200) ?? 'no result'],
  ['loops: a shell command writing into the project\'s .llm/loops/ is refused by the same rule, not by file-tools-only, and the board\'s change record does not carry what it wrote', lastToolResult(loops.steps[2])?.isError === true && (lastToolResult(loops.steps[2])?.text ?? '').includes('Rule loops:files-only') && loopsJournalText !== '' && !loopsJournalText.split('\n').includes('probe') && loopsRecords.filter(record => record.rule === 'loops:files-only').length === 2, `${lastToolResult(loops.steps[2])?.text?.slice(0, 160) ?? 'no result'}; ${loopsRecords.filter(record => record.rule === 'loops:files-only').length} journal line(s)`],
  ['loops: the entry that only tells the main agent is taken in without an approval record: one adopt line by the harness, the file noted in repo-written.json, and view.json showing it as the agreed one', loopsAdopted.length === 1 && loopsAdopted[0].actor === 'harness' && loopsAdopted[0].via === 'repo' && /^[0-9a-f]{64}$/.test(loopsWritten?.[LOOPS_ENTRY_ID]?.fileSha256 ?? '') && loopsViewEntry?.source === 'person' && loopsViewEntry.state === 'ok' && (loopsView?.attention ?? ['none']).length === 0, `${loopsJournal.map(record => record.op).join(' > ') || 'no record'}; view ${JSON.stringify(loopsViewEntry ?? null)}; attention ${JSON.stringify(loopsView?.attention ?? null)}`],
  ['loops: the runtime directory stays out of git (.llm/ in the exclude file, its own .gitignore) and git status lists nothing after the board wrote', loopsIgnore === '*\n' && loopsExclude.split('\n').includes('.llm/') && loopsGitStatus === '', `ignore ${JSON.stringify(loopsIgnore)}; exclude ${JSON.stringify(loopsExclude.split('\n').filter(line => line.includes('llm')))}; status ${JSON.stringify(loopsGitStatus)}`],
  ['loops: the read of the entry file passes, /glm-status lists the row in effect, and every request declares the loop board in the guard section', lastToolResult(loops.steps[3])?.isError !== true && (lastToolResult(loops.steps[3])?.text ?? '').includes(LOOPS_ENTRY_ID) && loopsHealth.loops?.status === ACTED && loops.steps.every(step => step.system.includes(LOOPS_DECLARATION)), `${healthLine(loopsHealth, 'loops')} (${loopsHealth.loops?.reason ?? ''}); declared ${loops.steps.filter(step => step.system.includes(LOOPS_DECLARATION)).length}/${loops.steps.length}`],
  ['loops: a headless host has no session controller, so the row says it runs no entry here, hands out no service, takes no run lock and writes nothing of the runtime, while its gate and its files work', (loopsHealth.loops?.reason ?? '').includes('这个进程不跑循环板（没有会话控制器）') && loopsRanNothing.length === 0 && loops.steps.every(step => step.system.includes(LOOPS_DECLARATION)), `reason ${loopsHealth.loops?.reason ?? 'none'}; runtime files ${JSON.stringify(loopsRanNothing)}`],
  ['rules-peak-hourness: the row is in effect without the pricing service (a supported combination) and the main agent\'s tool call ran', aloneHealth.rules?.status === ACTED && aloneHealth.rules.reason.includes('读不出是不是高峰') && lastToolResult(rulesPeakAlone.steps[1])?.isError !== true && !stderrOf('rules-peak-hourness').includes('dsh-glm-hourness/rules'), `${healthLine(aloneHealth, 'rules')} (${aloneHealth.rules?.reason ?? ''})`],
  ...designChecks(),
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
