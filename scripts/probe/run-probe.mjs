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
 * it when the host exits). glm-rules, non-glm-rules, rules-peak and rules-peak-hourness
 * also record the rules page's data the row wrote (`rulesView`) and read it with
 * the panel's parser (the rules-page checks). The loop board scenario (loops) runs in a scratch
 * git clone that already carries a person's entry file: the board takes the
 * entry in, loops:files-only refuses a file tool and a shell command that
 * write into the board's own files, and both of the row's gates are installed
 * (the three calls loops:schedule-tools judges cannot be made in a headless
 * host, which mounts no schedule service). The environment-notice scenario
 * (env-notice) runs in a git workspace whose graph has an approved tool node
 * under env, with the env row enabled by the overlay: the first request ends
 * with the wrapped environment notice, the next does not repeat it, and the
 * project's .llm/ is git-ignored through .git/info/exclude. The
 * env-check-command scenario mounts probe-env.mjs in place of the loop board
 * (the loop row pinned off): the env row's service reads a check line of the
 * graph's tool node back, the row hands the board env.files-edited and emits
 * it once per step that wrote a file. The env-checks scenario runs M4's own
 * check after each edit through the shared executor: the finding on the
 * changed line, the line of zeros after the fix, the file names as they are,
 * the entry with its five own rules and one run record per delivery. The
 * env-checks-timeout scenario proposes a tool node under env through
 * graph_propose (the result carries the timeout sentence of its check line,
 * the workspace's timing journal the estimate with the session); after the
 * human approves it, env-checks-timeout-run edits a file twice: the first run
 * stops at its 5 s limit, the second ends inside the next one, 15 s, and the
 * journal holds every line in between. In env-checks-ceiling a check held at
 * its ceiling is one line in the root agent's environment notice, which
 * check_limit takes away by raising the ceiling, and a dispatched subagent
 * never hears of it. The loop board's peak scenario
 * (loops-peak) runs on the GLM route at the probe clock inside a peak, with
 * the loop row and the rules row (少做) enabled and no contribution listing
 * execute.resume-drive: the scripted agent becomes the main agent with /wish,
 * works, shifts the clock past the peak's end with the probe clock's tool and
 * idles over a pending background child, and the board's next beat wakes it
 * once with the end-of-peak reminder; loops-peak-restart opens the same
 * project again across the same boundary, whose key is consumed, so no second
 * reminder goes out. The graph panel scenarios run the
 * bundle's /graph-run handler mid-step for the session;
 * the GLM and non-GLM scenarios run /hourness and /hourness-status at their
 * last step, after /glm-status is recorded. The GLM scenario's /hourness step
 * also records what the status hub's collector reads for the session: the
 * checks hold the 面板 and 额度 sections to those entries word for word, the
 * agent audience to no person entry, and the metrics row to the one
 * metrics/load entry (status hub design 0.3 §11 L3). Every scenario also mounts the
 * probe net log (scripts/probe/probe-net.mjs), which records the origin and
 * path of each request the host process sends; the quota checks read it
 * (no request to /api/monitor anywhere) together with the quota output of the
 * three package combinations and the request bodies (no quota text in them).
 * The memory scenarios
 * (glm-memory, non-glm-memory, glm-memory-compact, glm-worker-memory,
 * glm-memory-depth) write memories from the first root agent, start a second
 * root agent in the same workspace (the provider's `spawn` step) and check
 * its index, the index after a compaction, a child's tool face, the reporting
 * depth each session's prompt names and the real journals left unchanged.
 * The lessons scenarios (glm-lessons, non-glm-lessons) enable the lessons row
 * with the overlay and start from a lesson and a candidate left in the project
 * journal: the notices to the main agent, lessons_merge and lessons_query, the
 * person's words for a delete, /lessons, and propose through the overlay tool.
 * The metrics scenarios (metrics, non-glm-metrics) enable the metrics row
 * with the overlay in a scratch git workspace whose rules file holds the
 * person's stop level on the probe clock: the row writes while the peak mode
 * holds and never reads it, the read of a fake-token file stays one plain
 * tool event, the project keeps the journal next to its manifest and key
 * while the user-level directory gains nothing, and the loop board's
 * service receives the row's daily self-check entry.
 * metrics-concurrent appends 5000 events from each of two one-shot processes
 * through the library entry and both writer sequences come out complete.
 * The failure scenarios (glm-lessons-failure, non-glm-lessons-failure) start
 * from a lesson with an error fragment and run a failing command in the main
 * agent and in a dispatched child: the reminder after the tool result, the
 * hits, and the reminder that a lesson keeps coming back.
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
 * run writes the DSH home, overlays, request dumps and logs into a directory
 * of its own under the system temporary directory
 * (glm-hourness-probe-<timestamp>-*, scripts/sandbox.mjs openRunDir), outside
 * the repository tree, where freshly written files are briefly held by
 * another process (docs/FACTS.md §3). A run that passes deletes it; any other
 * exit keeps it and prints its path.
 *
 * Guard (exit 2, no conclusion): a profile of that name already exists
 * under the real profiles directory, a profile cannot be generated, or the
 * project part of the desktop or glmsandbox profile (bundles, dependencies,
 * glm-hourness/ overrides; scripts/profile-shape.mjs) changed during the
 * run; other changes there are listed only. One of the generated names
 * appearing under the real profiles directory (DSH_HOME not honored) or a
 * change of the real usage journal fails the run (exit 1).
 */
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { crc32, deflateSync } from 'node:zlib'
import { DISPATCH_TOOLS } from '../../packages/hourness/dist/workflow/index.js'
import { openRulesBoard } from '../../packages/hourness/dist/rules/engine.js'
import { clockText } from '../../packages/hourness/dist/rules/index.js'
import { repoJson } from '../../packages/hourness/dist/rules/model.js'
import { RULES_DECLARATION } from '../../packages/hourness/dist/rules/service.js'
import { parseRulesView } from '../../packages/hourness/dist/rules/view.js'
import { entryFileText } from '../../packages/hourness/dist/loops/model.js'
import { LOOP_NOTICE_SOURCE } from '../../packages/hourness/dist/loops/deliver.js'
import { LOOPS_DECLARATION } from '../../packages/hourness/dist/loops/service.js'
import { NO_BOARD_LINE, SCRATCH_LINE } from '../../packages/hourness/dist/env/notice.js'
import { checksOwnRules } from '../../packages/hourness/dist/env/loop-entry.js'
import { PEAK_REMINDER_SOURCE, PEAK_REMINDER_TEXT, peakReminderText } from '../../packages/glm/dist/glm-prompt/peak-reminder.js'
import { IDENTITY_OPENING_PLAIN, IDENTITY_OPENING_WITH_STYLE } from '../../packages/glm/dist/glm-prompt/verbatim.js'
import { transcriptNote } from '../../packages/glm/dist/glm-prompt/zcode-compact-text.js'
import { PERSONA_SCOPE } from '../../packages/hourness/dist/design/persona.js'
import { peakWindowAt } from '../../packages/glm/dist/glm-llm/credits.js'
import { GLM_LOOP_DEFAULTS } from '../../packages/glm/dist/glm-llm/loop-defaults.js'
import { userDataHome } from '../../packages/hourness/dist/shared/data-home.js'
import { HEALTH_PACKAGES, HEALTH_ROWS } from '../../packages/hourness/dist/shared/health.js'
import { DESIGN_TOOL_NAMES, GRAPH_TOOL_NAMES, LEARNING_TOOL_NAMES, LESSONS_TOOL_NAMES, MEMORY_TOOL_NAMES } from '../../packages/glm/dist/shared/tool-names.js'
import { openEngine } from '../../packages/hourness/dist/graph/engine.js'
import { PLAIN_QUESTION_EXAMPLES } from '../../packages/hourness/dist/graph/plain-question.js'
import { askOf, fenced, renderAsk } from '../../packages/hourness/dist/graph/proposal.js'
import { holderFileOf, readHolder } from '../../packages/hourness/dist/graph/main-agent-holder.js'
import { runNote } from '../../packages/hourness/dist/graph/run.js'
import { projectDirOf } from '../../packages/hourness/dist/data/project-root.js'
import { loadGraph } from '../../packages/hourness/dist/graph/store.js'
import { FAILURE_SOURCE } from '../../packages/hourness/dist/lessons/failure.js'
import { GUARD_CORRECTION_SOURCE, GUARD_LIFT_LINE } from '../../packages/hourness/dist/guard/index.js'
import { PENDING_SOURCE as LESSONS_PENDING_SOURCE, RECUR_SOURCE as LESSONS_RECUR_SOURCE } from '../../packages/hourness/dist/lessons/notices.js'
import { INDEX_SOURCE as MEMORY_INDEX_SOURCE } from '../../packages/hourness/dist/memory/index.js'
import { compareShapes, describeDifference, isProjectDifference, profileShape } from '../profile-shape.mjs'
import { checkLog, readLog } from '../../packages/hourness/dist/metrics/read.js'
import { METRICS_FILES_ONLY } from '../../packages/hourness/dist/metrics/rules.js'
import { keyOf } from '../../packages/hourness/dist/guard/records.js'
import { PACKAGES } from '../packages.mjs'
import { attachmentsIn, dataRows, designRows, generateProfile, initRepo, limitsRow, openRunDir, PROBE_PROFILES, removeRunDir, repo, requireDesktop, sandboxCommand, scenarioWorkspace, slash, unlinkProfile, workspaceChangesRow } from '../sandbox.mjs'
import { GOAL_GATE_DENIAL, PROJECTION_SOURCE, SCOPE_DENIAL } from './probe-dispatch.mjs'
import { CANARY } from './probe-net.mjs'

requireDesktop('probe')

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
const runDir = openRunDir(new Date().toISOString().replace(/[:.]/g, '-'))
/** The generated profiles by name; every one generated is unlinked on exit, a failed run included. */
const profiles = {}
process.on('exit', (code) => {
  Object.values(profiles).forEach(unlinkProfile)
  if (code !== 0 && existsSync(runDir)) console.error(`probe: run artifacts kept in ${runDir}`)
})
for (const [name, packages] of Object.entries(PROBE_PROFILES)) {
  try {
    profiles[name] = generateProfile(join(runDir, 'dsh-root'), name, packages)
  }
  catch (error) {
    console.error(`probe: cannot generate the ${name} profile under ${runDir}: ${error instanceof Error && 'code' in error ? error.code : String(error)}`)
    process.exit(2)
  }
}
// The host's workspace instructions (dsh-agent-instructions) read $DSH_HOME/AGENTS.md. The
// scenario glm-compact-instructions boots probe-full under a DSH home of its own that holds
// one, so no other scenario's requests gain it; it stays out of `profiles`, whose count the
// sandbox check compares with the generated names.
const instructionsHome = join(runDir, 'dsh-root-instructions')
let instructionsProfile
try {
  instructionsProfile = generateProfile(instructionsHome, 'probe-full', PROBE_PROFILES['probe-full'])
}
catch (error) {
  console.error(`probe: cannot generate the instructions profile under ${instructionsHome}: ${error instanceof Error && 'code' in error ? error.code : String(error)}`)
  process.exit(2)
}
process.on('exit', () => unlinkProfile(instructionsProfile))
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
// Memory and lessons put their journals in the project directory of the
// session and in the user-level directory; the scenarios point both at their
// own directory (scripts/sandbox.mjs dataRows), so the real ones, the
// user-level memory journal and the journals in the `.llm` of the project
// this checkout belongs to (a work tree's is the main checkout's), must not
// change, and the user-level directory must not get a lessons directory.
const mainProjectDir = projectDirOf(repo)
const realMemoryFiles = [join(userDataHome(), 'memory', 'memory.jsonl'), ...(mainProjectDir === undefined ? [] : ['memory.jsonl', 'lessons.jsonl', 'memory.json'].map(file => join(mainProjectDir, file)))]
const fileStamp = file => existsSync(file) ? (({ size, mtimeMs }) => `${size}/${mtimeMs}`)(statSync(file)) : 'absent'
const realMemoryBefore = realMemoryFiles.map(fileStamp)

/**
 * The first line of the project journal of every scenario: the record of a
 * learning digest reminder sent a moment ago. The sessions of a scenario run
 * in this repository, so the main agent reads its project graph, whose
 * history holds real corrections of the person; without the record a
 * reminder would be in the requests of every scenario and change with the
 * repository. `memoryJournalOf` leaves the record out of what it counts; the
 * reminder has its own specs on the fake host (tests/memory-learning.spec.ts).
 */
const learnSeed = seq => `${JSON.stringify({ v: 1, seq, at: new Date().toISOString(), actor: 'harness', op: 'learn-notified', id: '*', data: { keys: ['edit:task.body'] } })}\n`

/** Every scenario booted in this run, in order: the net log and the request dump of each are read by the quota checks. */
const scenarioNames = []
/** A scenario's net log (scripts/probe/probe-net.mjs). */
const netLogOf = name => join(runDir, name, 'net.jsonl')

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
 * `cwd` is where the sessions work: a scenario that names none (or this
 * checkout) works in its scenario directory, and every one works in a git
 * repository of its own (scripts/sandbox.mjs scenarioWorkspace); the result's
 * `cwd` is that directory.
 */
function runScenario(name, model, script, task, overlay = [], cwd = repo, others = [], on = profiles['probe-full']) {
  scenarioNames.push(name)
  const dir = join(runDir, name)
  const home = join(dir, 'home')
  mkdirSync(home, { recursive: true })
  if (!existsSync(join(home, 'memory.jsonl'))) writeFileSync(join(home, 'memory.jsonl'), learnSeed(1))
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
    // The net log goes into every scenario: the checks on requests need all of them.
    '    - id: glm-hourness-probe/net',
    `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-net.mjs')))}`,
    `      config: { record: ${JSON.stringify(slash(netLogOf(name)))} }`,
    ...overlay,
    '',
  ].join('\n'))
  const { exe, args, env } = sandboxCommand(patch, [task], on)
  // Every scenario's sessions run in a repository of its own, so no row keeps project state in this checkout's project.
  const workspace = scenarioWorkspace(dir, cwd)
  // rc.3's workspace-write sandbox lets writes through under the workspace and the runtime's os.tmpdir();
  // the run directory is under the system temporary directory, so the runtime gets a temporary directory
  // of the scenario's own and a target elsewhere in the run directory stays outside both. It sits beside
  // the scenario directories, not in one: the Windows ACL sandbox refuses a temp root inside the workspace,
  // and a scenario that names no directory works in its scenario directory.
  const temp = join(runDir, 'runtime-tmp', name)
  mkdirSync(temp, { recursive: true })
  const started = Date.now()
  const result = spawnSync(exe, args, { cwd: workspace, encoding: 'utf8', timeout: 180_000, env: { ...env, TEMP: temp, TMP: temp } })
  const elapsedMs = Date.now() - started
  writeFileSync(join(dir, 'stdout.txt'), result.stdout ?? '')
  writeFileSync(join(dir, 'stderr.txt'), result.stderr ?? '')
  const requests = readFileSync(dump, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line))
  return {
    status: result.status,
    elapsedMs,
    cwd: workspace,
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
// The scenario directory is the workspace, with the scratch files and a copy
// of package.json for Grep to find under its display path.
const glmDir = join(runDir, 'glm')
mkdirSync(glmDir, { recursive: true })
cpSync(join(repo, 'package.json'), join(glmDir, 'package.json'))
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
  { tool: { name: 'Grep', arguments: { 'pattern': 'DSH-GLM-HOURNESS', 'path': join(glmDir, 'package.json'), 'output_mode': 'content', '-i': true } } },
  { tool: { name: 'Bash', arguments: { command: 'Write-Output probe-bash', timeout: 30000 } } },
  { tool: { name: 'Read', arguments: { file_path: png } } },
  { tool: { name: 'Bash', arguments: { command: `Set-Content -Path '${blocked}' -Value probe` } } },
  // The health table is recorded before /hourness runs, so the hourness row is still idle in it.
  // `hub` records what the status hub's collector reads for the session after /hourness ran.
  { text: 'done', status: true, command: { name: 'hourness' }, hub: true },
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
// GLM compaction with the transcript row enabled through the overlay (it
// ships disabled): the checkpoint ends with ZCode's transcript sentence
// naming the plaintext export under the scenario home, and the model reads
// that file with Read ({transcript}, scripts/probe/probe-llm.mjs). The task
// text carries two fake credentials (a Bearer value, a named-prefix key),
// assembled from parts so that no line of this file is a token for the
// secret scan; the export must carry neither (src/data/transcript.ts).
const transcriptHome = join(runDir, 'glm-compact-transcript', 'home')
const TRANSCRIPT_FAKES = [['Bearer', 'probe0123456789ABCDEFGHIJ'].join(' '), ['sk', '-'].join('') + 'probe0123456789abcdefgh']
const TRANSCRIPT_FAKES_LINE = 'Probe credentials: [redacted] and [redacted].'
const compactTranscript = runScenario('glm-compact-transcript', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { tool: { name: 'Read', arguments: { file_path: '{transcript}' } } },
  { text: 'done', status: true },
], `Read package.json, read the transcript the summary names, then reply done. Probe credentials: ${TRANSCRIPT_FAKES.join(' and ')}.`, [
  '- id: compaction-basic',
  '  config: { thresholdRatio: 0.02, retainTokens: 0 }',
  '- id: glm-hourness/transcript',
  '  disabled: false',
  `  config: { home: ${JSON.stringify(slash(transcriptHome))} }`,
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
const clockRow = (at, shiftWith) => [
  '- insert:',
  '    - id: glm-hourness-probe/clock',
  `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-clock.mjs')))}`,
  `      config: { at: ${JSON.stringify(at)}${shiftWith === undefined ? '' : `, shiftWith: ${JSON.stringify(shiftWith)}`} }`,
]
// The tool a scenario's clock row registers when the scenario moves the clock mid-run (rules-peak-wake, loops-peak).
const SHIFT_TOOL = 'probe_shift_clock'
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
const wrapReminder = text => `<system-reminder>\n${text}\n</system-reminder>`
// PEAK_NOTICE is the fallback body for a session with no readable peak mode:
// in this run only glm-only sees it (the GLM channel package alone). The two
// package scenarios have the rules row (shipped enabled), so the reminder is
// worded by the project's level: REDUCE_NOTICE at the factory level with the
// rules board's cap of one GLM subagent, STOP_NOTICE at the person's stop.
const PEAK_NOTICE = wrapReminder(PEAK_REMINDER_TEXT)
const REDUCE_NOTICE = wrapReminder(peakReminderText({ level: 'reduce', origin: 'default', glmWorkerCap: 1 }))
const STOP_NOTICE = wrapReminder(peakReminderText({ level: 'stop', origin: 'human' }))
const FORBIDDEN_REMINDER_WORDS = ['information only', 'keep working', 'pause', 'postpone', 'defers the tool calls', 'tells you when to continue']

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
// enabled; the overlay pins it on in a scratch git workspace on the peak
// clock, so the project is the workspace: the rules file in the repository
// and the project's .llm/rules/ land in it. The probe provider types
// /rules peak the way the person does and reads the glmHournessPeakMode
// service after each command: the factory level, then 不做, then 无影响.
// The GLM route runs both packages, so the pricing service says it is peak
// (until 18:00 UTC+8); the orchestration package alone has no pricing
// service and so no peak to read. The main agent's own tool calls run in
// every state. The GLM package words its peak reminder by the level
// (docs/ORCHESTRATION.md §11.4): rules-peak sends the factory level's text on
// the first request and keeps that one notice through the two changes;
// rules-stop-notice sets the level to 不做 as the person through the rules
// engine before the run and reads the stop text on the first request, with
// the main agent's Read executed.
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
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } }, command: { name: 'rules', input: 'peak 不做' }, peakMode: true, rulesView: true },
  { text: 'done', status: true, command: { name: 'rules', input: 'peak 无影响' }, peakMode: true },
], 'Become the main agent, read package.json twice, list the rules, then reply done.', [...RULES_ROW, ...clockRow(PEAK_AT), ...designRows({ record: slash(join(runDir, 'rules-peak', 'design.jsonl')) })], rulesGlm.ws)
const rulesAlone = rulesProject('rules-peak-hourness')
const rulesPeakAlone = runScenario('rules-peak-hourness', 'deepseek-probe', [
  { tool: { name: 'pwsh', arguments: { command: 'Write-Output probe-rules', description: 'Print a word' } }, command: { name: 'rules', input: 'peak 不做' }, peakMode: true },
  { text: 'done', command: { name: 'hourness-status' }, peakMode: true, rulesView: true },
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
  // /rules show changes nothing; the row writes the rules page's data after it, which the step records.
  { text: 'done', status: true, command: { name: 'rules', input: 'show' }, rulesView: true },
], 'Run a command a rule blocks, write into the rules directory, run a command no rule names, then reply done.', RULES_ROW, glmRulesProject.ws)
const nonGlmRulesProject = rulesGateProject('non-glm-rules')
const nonGlmRulesState = join(nonGlmRulesProject.ws, '.llm', 'rules', 'state.json')
const nonGlmRules = runScenario('non-glm-rules', 'deepseek-probe', [
  { tool: { name: 'pwsh', arguments: { command: 'Write-Output rules-probe-blocked', description: 'Print the probe word' } } },
  { tool: { name: 'write', arguments: { file_path: nonGlmRulesState, content: '{}\n' } } },
  { tool: { name: 'rules_show', arguments: {} } },
  { tool: { name: 'pwsh', arguments: { command: 'Write-Output rules-probe-allowed', description: 'Print an allowed word' } } },
  { text: 'done', status: true, command: { name: 'rules', input: 'show' }, rulesView: true },
], 'Run a command a rule blocks, write into the rules directory, read the rules, run a command no rule names, then reply done.', RULES_ROW, nonGlmRulesProject.ws)

// Loop board, the storage and the gate on its own files
// (docs/ORCHESTRATION.md §18.8, §18.9). The row ships enabled; the overlay
// pins it on in a scratch git repository that already carries a person's entry
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

const MEMORY_SECTION_LINE = 'You have a persistent memory that the harness keeps for you'
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

// Environment notice (M4 design §7.2, scenario env-notice): the env row
// (shipped enabled since m4-checks B6; the overlay still pins it on), a git workspace whose graph carries an approved
// tool node under env. The first request ends with the wrapped environment
// notice — the tool line, the no-checks line, the scratch line — the next
// request does not repeat it, and the project's .llm/ is git-ignored (the
// exclude line the row appended) before the notice goes out.
const envNoticeDir = join(runDir, 'env-notice')
const envNoticeWs = join(envNoticeDir, 'ws')
const envNoticeGraph = join(envNoticeWs, 'docs', 'graph')
mkdirSync(envNoticeGraph, { recursive: true })
writeFileSync(join(envNoticeWs, 'a.txt'), 'probe\n')
if (!initRepo(envNoticeWs)) throw new Error('probe: git init for env-notice failed')
const envNoticeEngine = openEngine(envNoticeGraph)
for (const node of [
  { type: 'goal', title: '探针目标' },
  { id: 'env', type: 'feature', title: '环境', parent: 'goal-1' },
  { id: 'tool-1', type: 'tool', title: 'ESLint', parent: 'env', body: '用法：npm run lint' },
]) {
  const seeded = await envNoticeEngine.apply('human', { op: 'propose', reason: 'probe seed', node })
  if (!seeded.ok) throw new Error(`probe: seeding the env-notice graph failed: ${JSON.stringify(seeded.error)}`)
  // A human proposal under an approved parent lands approved; a waiting one is approved here.
  if (seeded.node?.status === 'proposed' && !(await envNoticeEngine.apply('human', { op: 'status', id: seeded.id, rev: seeded.rev, to: 'approved', reason: 'probe' })).ok) {
    throw new Error(`probe: approving the env-notice node ${seeded.id} failed`)
  }
}
const envNoticeRun = runScenario('env-notice', 'deepseek-probe', [
  { tool: { name: 'read', arguments: { file_path: join(envNoticeWs, 'a.txt') } } },
  { text: 'done' },
], 'Read a.txt, then reply done.', [
  '- id: glm-hourness/env',
  '  disabled: false',
], envNoticeWs, [], profiles['probe-hourness'])
const envNoticeFirst = (envNoticeRun.steps[0]?.messages ?? []).find(message => message.source === 'hourness-env')
const envNoticeRepeat = (envNoticeRun.steps[1]?.messages ?? []).filter(message => message.source === 'hourness-env').length
const envNoticeLast = envNoticeRun.steps[1]?.messages.at(-1)
const envExclude = existsSync(join(envNoticeWs, '.git', 'info', 'exclude')) ? readFileSync(join(envNoticeWs, '.git', 'info', 'exclude'), 'utf8') : ''
const envIgnored = spawnSync('git', ['-C', envNoticeWs, 'check-ignore', '-q', '.llm/scratch/x'], { stdio: 'ignore' }).status

/** The probe-env overlay: the env row on, the loop row pinned off, the stand-in loop board logging to `out`. */
const envBoardOverlay = out => [
  '- id: glm-hourness/env',
  '  disabled: false',
  '- id: glm-hourness/loops',
  '  disabled: true',
  '- insert:',
  '    - id: glm-hourness-probe/env',
  `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-env.mjs')))}`,
  '      inject: [tools]',
  `      config: { out: ${JSON.stringify(slash(out))} }`,
]
const readEnvLog = log => existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line)) : []
const checksNoticesIn = step => (step?.messages ?? []).filter(message => message.source === 'hourness-checks')
/** The checks notice each request added: a request carries the whole history, so a notice is new where the count grows. */
const newChecksNotices = run => run.steps.map((step, index) => checksNoticesIn(step).length > (index === 0 ? 0 : checksNoticesIn(run.steps[index - 1]).length) ? checksNoticesIn(step).at(-1) : undefined)

// The env row and the loop board (M4 design §6.1.2, §6.2, §14.1 env-checks,
// the part without when; scenario env-check-command): the env row and the
// graph row on, the loop row pinned off, and the probe-env overlay standing
// in for the loop board (the headless runtime has no session controller, so
// the real board provides no service). A tool node's check line without
// `when` reads back through glmHournessEnv as it stands on the node and is
// not M4's own; each step after a file write emits env.files-edited with
// the file relative to the checkout root; the row hands the board the event,
// and no checks reminder appears (M4 does not run a line without `when`).
const envCheckDir = join(runDir, 'env-check-command')
const envCheckWs = join(envCheckDir, 'ws')
const envCheckGraph = join(envCheckWs, 'docs', 'graph')
const envCheckLog = join(envCheckDir, 'env.jsonl')
mkdirSync(envCheckGraph, { recursive: true })
writeFileSync(join(envCheckWs, 'README.md'), 'probe workspace\n')
if (!initRepo(envCheckWs)) throw new Error('probe: git init for env-check-command failed')
const envCheckEngine = openEngine(envCheckGraph)
for (const node of [
  { type: 'goal', title: '探针目标' },
  { id: 'env', type: 'feature', title: '环境', parent: 'goal-1' },
  { id: 'tool-1', type: 'tool', title: 'Lint', parent: 'env', body: '用法：node lint.mjs', acceptance: ['`check lint lines $ node lint.mjs {files}`'] },
]) {
  const seeded = await envCheckEngine.apply('human', { op: 'propose', reason: 'probe seed', node })
  if (!seeded.ok) throw new Error(`probe: seeding the env-check-command graph failed: ${JSON.stringify(seeded.error)}`)
  if (seeded.node?.status === 'proposed' && !(await envCheckEngine.apply('human', { op: 'status', id: seeded.id, rev: seeded.rev, to: 'approved', reason: 'probe' })).ok) {
    throw new Error(`probe: approving the env-check-command node ${seeded.id} failed`)
  }
}
const envCheckRun = runScenario('env-check-command', 'deepseek-probe', [
  { tool: { name: 'probe_check_command', arguments: { tool: 'tool-1' } } },
  { tool: { name: 'write', arguments: { file_path: join(envCheckWs, 'a.txt'), content: 'a\n' } } },
  { tool: { name: 'write', arguments: { file_path: join(envCheckWs, '-c.txt'), content: 'c\n' } } },
  { text: 'done' },
], 'Read the check command, write two files, then reply done.', envBoardOverlay(envCheckLog), envCheckWs, [], profiles['probe-hourness'])
const envCheckRecords = readEnvLog(envCheckLog)
const envCheckCommand = envCheckRecords.find(record => record.kind === 'check-command')
const envCheckContribute = envCheckRecords.find(record => record.kind === 'contribute' && record.source?.row === 'glm-hourness/env')
const envCheckEmits = envCheckRecords.filter(record => record.kind === 'emit' && record.event?.event === 'env.files-edited').map(record => record.event)
const sameDir = (a, b) => typeof a === 'string' && slash(a).toLowerCase().replace(/\/+$/, '') === slash(b).toLowerCase().replace(/\/+$/, '')
const envCheckReminders = envCheckRun.steps.reduce((count, step) => count + step.messages.filter(message => message.source === 'hourness-checks').length, 0)

// M4's own checker (M4 design §6.2-§6.5, §6.8, §14.1 env-checks): the env
// row on with the probe-env stand-in for the loop board, a git workspace
// whose graph has an approved tool node with a check line with `when`. The
// checks run through the shared executor after each edit: a TODO is one
// finding on a changed line with its log, the fix is one line of zeros, a
// step without edits and edits without findings after zeros say nothing,
// lint.mjs receives `b$(echo x).txt` as it is and `-c.txt` as `./-c.txt`, the
// row hands the board env.checks-after-edit with its five own rules and
// records one run per delivery.
const envChecksDir = join(runDir, 'env-checks')
const envChecksWs = join(envChecksDir, 'ws')
const envChecksGraph = join(envChecksWs, 'docs', 'graph')
const envChecksLog = join(envChecksDir, 'env.jsonl')
mkdirSync(envChecksGraph, { recursive: true })
writeFileSync(join(envChecksWs, 'README.md'), 'probe workspace\n')
writeFileSync(join(envChecksWs, 'lint.mjs'), [
  "import { appendFileSync, readFileSync } from 'node:fs'",
  'const files = process.argv.slice(2)',
  "appendFileSync('args.jsonl', JSON.stringify(files) + '\\n')",
  "for (const file of files) readFileSync(file, 'utf8').split('\\n').forEach((line, index) => { if (line.includes('TODO')) console.log(`${file}:${index + 1}:1: todo found`) })",
  '',
].join('\n'))
if (!initRepo(envChecksWs)) throw new Error('probe: git init for env-checks failed')
const envChecksEngine = openEngine(envChecksGraph)
for (const node of [
  { type: 'goal', title: '探针目标' },
  { id: 'env', type: 'feature', title: '环境', parent: 'goal-1' },
  { id: 'tool-1', type: 'tool', title: 'Lint', parent: 'env', body: '用法：node lint.mjs', acceptance: ['`check lint lines $ node lint.mjs {files}` when *.txt'] },
]) {
  const seeded = await envChecksEngine.apply('human', { op: 'propose', reason: 'probe seed', node })
  if (!seeded.ok) throw new Error(`probe: seeding the env-checks graph failed: ${JSON.stringify(seeded.error)}`)
  if (seeded.node?.status === 'proposed' && !(await envChecksEngine.apply('human', { op: 'status', id: seeded.id, rev: seeded.rev, to: 'approved', reason: 'probe' })).ok) {
    throw new Error(`probe: approving the env-checks node ${seeded.id} failed`)
  }
}
const envChecksRun = runScenario('env-checks', 'deepseek-probe', [
  { tool: { name: 'write', arguments: { file_path: join(envChecksWs, 'a.txt'), content: 'one\nTODO two\n' } } },
  { tool: { name: 'edit', arguments: { file_path: join(envChecksWs, 'a.txt'), old_string: 'TODO two', new_string: 'two' } } },
  { tool: { name: 'read', arguments: { file_path: join(envChecksWs, 'a.txt') } } },
  { tool: { name: 'write', arguments: { file_path: join(envChecksWs, 'b$(echo x).txt'), content: 'clean\n' } } },
  { tool: { name: 'write', arguments: { file_path: join(envChecksWs, '-c.txt'), content: 'clean\n' } } },
  { text: 'done' },
], 'Write, fix and read a file, write two more, then reply done.', envBoardOverlay(envChecksLog), envChecksWs, [], profiles['probe-hourness'])
const envChecksRecords = readEnvLog(envChecksLog)
const envChecksNotices = newChecksNotices(envChecksRun)
const envChecksFound = envChecksNotices[1]?.text ?? ''
const envChecksLogPath = /\nFull output: (\S+)\n/.exec(envChecksFound)?.[1]
const envChecksArgs = existsSync(join(envChecksWs, 'args.jsonl')) ? readFileSync(join(envChecksWs, 'args.jsonl'), 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line)) : []
const envChecksContribute = envChecksRecords.find(record => record.kind === 'contribute' && record.source?.row === 'glm-hourness/env')
const envChecksRuns = envChecksRecords.filter(record => record.kind === 'run').map(record => record.run)
const envChecksEmits = envChecksRecords.filter(record => record.kind === 'emit' && record.event?.event === 'env.files-edited').map(record => record.event)
const envChecksEnvNotice = (envChecksRun.steps[0]?.messages ?? []).find(message => message.source === 'hourness-env')

// The timeout the human sees when approving a tool node (M4 design §6.3.1
// item 3, §14.1 env-checks-timeout, the first part): the graph row on, a git
// workspace whose graph has the env feature. The scripted agent proposes a
// tool node under env with a check line estimated at 1 s; the result carries
// the sentence of its timeout, and the workspace's timing journal has the
// estimate with this session and the history entry the engine wrote.
const ENV_TIMEOUT_LINE = '`check slow lines 1s $ node slow.mjs {files}` when *.txt'
const envTimeoutWs = join(runDir, 'env-checks-timeout', 'ws')
const envTimeoutGraph = join(envTimeoutWs, 'docs', 'graph')
const envTimeoutJournal = join(envTimeoutWs, '.llm', 'env-checks', 'timing.jsonl')
mkdirSync(envTimeoutGraph, { recursive: true })
writeFileSync(join(envTimeoutWs, 'README.md'), 'probe workspace\n')
if (!initRepo(envTimeoutWs)) throw new Error('probe: git init for env-checks-timeout failed')
const envTimeoutEngine = openEngine(envTimeoutGraph)
for (const node of [
  { type: 'goal', title: '探针目标' },
  { id: 'env', type: 'feature', title: '环境', parent: 'goal-1' },
]) {
  const seeded = await envTimeoutEngine.apply('human', { op: 'propose', reason: 'probe seed', node })
  if (!seeded.ok) throw new Error(`probe: seeding the env-checks-timeout graph failed: ${JSON.stringify(seeded.error)}`)
  if (seeded.node?.status === 'proposed' && !(await envTimeoutEngine.apply('human', { op: 'status', id: seeded.id, rev: seeded.rev, to: 'approved', reason: 'probe' })).ok) {
    throw new Error(`probe: approving the env-checks-timeout node ${seeded.id} failed`)
  }
}
const envTimeoutRun = runScenario('env-checks-timeout', 'deepseek-probe', [
  { tool: { name: 'graph_propose', arguments: { node: { id: 'tool-1', type: 'tool', title: 'Slow', parent: 'env', acceptance: [ENV_TIMEOUT_LINE] }, reason: 'probe: a check that runs after edits' } } },
  { text: 'done' },
], 'Propose a tool node with a check line, then reply done.', [], envTimeoutWs, [], profiles['probe-hourness'])
const envTimeoutText = envTimeoutRun.steps[1]?.messages.filter(message => message.role === 'tool').at(-1)?.text ?? ''
const envTimeoutResult = (() => { try { return JSON.parse(envTimeoutText) } catch { return undefined } })()
const envTimeoutLines = existsSync(envTimeoutJournal) ? readFileSync(envTimeoutJournal, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line)) : []
const envTimeoutProposed = (await loadGraph(envTimeoutGraph)).nodes.get('tool-1')?.history.at(-1)

// The second part (M4 design §6.3.1, §14.1 env-checks-timeout): the human
// approves the node the first part proposed, and a new session with the env
// row and the probe-env board edits a .txt twice; slow.mjs sleeps 7 s. The
// first run is stopped at 5 s (three times the estimate of 1 s, raised to the
// floor) and the notice names the next limit, 15 s; the second run ends by
// itself inside it. The timing journal holds, in order, the estimate of the
// first part, the value from it (with that session and the llm), the
// timeout, the censored run, the harness's 15 s value and the 7 s run.
const envTimeoutApproved = await envTimeoutEngine.apply('human', { op: 'approve', id: 'tool-1', rev: (await loadGraph(envTimeoutGraph)).revisions.get('tool-1'), reason: 'probe: the human approves the check' })
if (!envTimeoutApproved.ok) throw new Error(`probe: approving the env-checks-timeout tool node failed: ${JSON.stringify(envTimeoutApproved.error)}`)
writeFileSync(join(envTimeoutWs, 'slow.mjs'), "setTimeout(() => { console.log('slow done') }, 7000)\n")
const envTimeoutRunLog = join(runDir, 'env-checks-timeout-run', 'env.jsonl')
const envTimeoutRun2 = runScenario('env-checks-timeout-run', 'deepseek-probe', [
  { tool: { name: 'write', arguments: { file_path: join(envTimeoutWs, 't.txt'), content: 'a\n' } } },
  { tool: { name: 'edit', arguments: { file_path: join(envTimeoutWs, 't.txt'), old_string: 'a', new_string: 'bb' } } },
  { text: 'done' },
], 'Write a file and edit it, then reply done.', envBoardOverlay(envTimeoutRunLog), envTimeoutWs, [], profiles['probe-hourness'])
const envTimeoutNotices = newChecksNotices(envTimeoutRun2)
const envTimeoutStopped = envTimeoutNotices[1]?.text ?? ''
const envTimeoutJournal2 = existsSync(envTimeoutJournal) ? readFileSync(envTimeoutJournal, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line)) : []
const envTimeoutRuns = readEnvLog(envTimeoutRunLog).filter(record => record.kind === 'run').map(record => record.run)
const envTimeoutKinds = envTimeoutJournal2.map(line => line.kind)
const [, envTimeoutFirstValue, envTimeoutStop, envTimeoutCensored, envTimeoutHarness, envTimeoutFinished] = envTimeoutJournal2

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

// The third part (M4 design §6.3.1 items 6 and 「调高上限」, §14.1
// env-checks-timeout; scenario env-checks-ceiling): an approved tool node
// whose check line estimates 25 s (three times is 75 s, over the 60 s
// ceiling) for a check that is quick. After the write the value is held at
// 60 s with capped 75 s; the root agent's next environment notice has the
// held-at-its-ceiling line with the full key, and check_limit is in its tool
// face. It raises the ceiling to 120 s with a reason (limits.jsonl gets the
// line, the held line goes from the next notice), then dispatches a subagent
// through probe-dispatch.mjs, whose environment notice has the checks line
// and no held line.
const envCeilingDir = join(runDir, 'env-checks-ceiling')
const envCeilingWs = join(envCeilingDir, 'ws')
const envCeilingGraph = join(envCeilingWs, 'docs', 'graph')
const envCeilingLog = join(envCeilingDir, 'env.jsonl')
const envCeilingLimits = join(envCeilingWs, '.llm', 'env-checks', 'limits.jsonl')
const ENV_CEILING_HELD = 'Check full is held at its ceiling of 60 s: three times your estimate (25 s) would be 75 s. Raising this check\'s ceiling is your decision and needs no approval from the human: call check_limit with check "tool-1/full", seconds (61 to 600) and a reason. Making the check cheaper or narrower means changing its check line, which is a tool-node change and needs the human\'s approval as usual.'
const ENV_CEILING_REASON = '整个项目要跑一分多钟'
mkdirSync(join(envCeilingWs, 'allowed'), { recursive: true })
mkdirSync(envCeilingGraph, { recursive: true })
writeFileSync(join(envCeilingWs, 'README.md'), 'probe workspace\n')
writeFileSync(join(envCeilingWs, 'fast.mjs'), '\n')
if (!initRepo(envCeilingWs)) throw new Error('probe: git init for env-checks-ceiling failed')
const envCeilingEngine = openEngine(envCeilingGraph)
for (const node of [
  { type: 'goal', title: '探针目标' },
  { id: 'env', type: 'feature', title: '环境', parent: 'goal-1' },
  { id: 'tool-1', type: 'tool', title: 'Full', parent: 'env', body: '用法：node fast.mjs', acceptance: ['`check full lines 25s $ node fast.mjs {files}` when *.txt'] },
]) {
  const seeded = await envCeilingEngine.apply('human', { op: 'propose', reason: 'probe seed', node })
  if (!seeded.ok) throw new Error(`probe: seeding the env-checks-ceiling graph failed: ${JSON.stringify(seeded.error)}`)
  if (seeded.node?.status === 'proposed' && !(await envCeilingEngine.apply('human', { op: 'status', id: seeded.id, rev: seeded.rev, to: 'approved', reason: 'probe' })).ok) {
    throw new Error(`probe: approving the env-checks-ceiling node ${seeded.id} failed`)
  }
}
const envCeilingRun = runScenario('env-checks-ceiling', 'deepseek-probe', [
  { tool: { name: 'write', arguments: { file_path: join(envCeilingWs, 't.txt'), content: 'a\n' } } },
  { tool: { name: 'read', arguments: { file_path: join(envCeilingWs, 't.txt') } } },
  { tool: { name: 'check_limit', arguments: { check: 'tool-1/full', seconds: 120, reason: ENV_CEILING_REASON } } },
  { tool: { name: 'probe_dispatch', arguments: { task: 'T1', prompt: 'Probe task T1: report.', cwd: envCeilingWs, scope: 'allowed', model: 'deepseek-probe' } } },
  { text: 'Waiting for task T1.' },
  { text: 'done' },
], 'Write a file, read it, raise the check\'s ceiling, dispatch task T1, then reply done.', [...envBoardOverlay(envCeilingLog), ...dispatchRow(join(envCeilingDir, 'dispatch.jsonl'))], envCeilingWs, [[
  { tool: { name: 'structured_output', arguments: HAND_BACK } },
  { text: 'child done' },
]], profiles['probe-hourness'])
const envCeilingStarted = dispatchRecord('env-checks-ceiling').find(entry => entry.kind === 'started')
const envCeilingMain = bySession(envCeilingRun, envCeilingStarted?.parentId)
const envCeilingChild = bySession(envCeilingRun, envCeilingStarted?.childId)
const envNoticesOf = steps => steps.flatMap(step => step.messages.filter(message => message.source === 'hourness-env').map(message => message.text))
const envCeilingMainNotices = [...new Set(envNoticesOf(envCeilingMain))]
const envCeilingChildNotices = envNoticesOf(envCeilingChild)
const envCeilingLimitResult = (() => { try { return JSON.parse(lastToolResult(envCeilingMain[3])?.text ?? '') } catch { return undefined } })()
const envCeilingLimitLines = existsSync(envCeilingLimits) ? readFileSync(envCeilingLimits, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line)) : []
const envCeilingJournal = jsonl(join(envCeilingWs, '.llm', 'env-checks', 'timing.jsonl'))

// Rules board, a rule of the person across the end of a peak (M6 S3, M6
// design §16 S3, §7.3, docs/ORCHESTRATION.md §16.12). The clone's rules file
// holds the first rule of M6 design §7.3, which queues the GLM credit runs
// while glm-peak is true, at the factory level on the GLM route. The clock
// row starts at 15:00 and the first step shifts it to Wednesday 17:59:30
// UTC+8 (a start that close to 18:00 would leave a slow boot no slack):
// `npm run calibrate` is queued, and the refusal and the per-step reminder
// say the peak ends at 18:00; the next call sleeps across 18:00 while the
// row's 5-second pass judges the ticket again and steers the running agent
// with the wake that says when the peak ended. The workspace has its own
// package.json whose calibrate script only prints a word, so npm, which
// looks upward for the nearest one, never finds the repository's real
// calibration script.
const OFFPEAK_CREDIT_RUNS = gateRule('r-offpeak-credit-runs', '高峰时积分重活排到高峰结束以后', {
  filter: { command: { matches: String.raw`^\s*npm\s+run\s+(calibrate|smoke:authorized)\b|^\s*node\s+scripts[\\/](calibrate[\\/]run-calibrate|smoke-zcode-authorized)\.mjs\b` } },
  condition: { signal: 'glm-peak', is: true },
  action: { kind: 'queue' },
  reason: '（人写）高峰时 GLM 按全价计积分，练习题、对照实验与真网冒烟等到高峰结束',
})
const PEAK_WAKE_RULES_FILE = repoJson({ version: 2, rules: { [OFFPEAK_CREDIT_RUNS.id]: OFFPEAK_CREDIT_RUNS } })
const PEAK_WAKE_CALIBRATE_WORD = 'probe-calibrate-ran'
const PEAK_WAKE_SHIFT = '2026-10-28T09:59:30.000Z'
const wakeProject = rulesGateProject('rules-peak-wake', PEAK_WAKE_RULES_FILE)
writeFileSync(join(wakeProject.ws, 'package.json'), `${JSON.stringify({ name: 'probe-ws', private: true, scripts: { calibrate: `node -e "console.log('${PEAK_WAKE_CALIBRATE_WORD}')"` } }, null, 2)}\n`)
const rulesPeakWake = runScenario('rules-peak-wake', 'glm-5.3', [
  { tool: { name: 'DeferredToolCall', arguments: { name: SHIFT_TOOL, input: { at: PEAK_WAKE_SHIFT } } } },
  { tool: { name: 'Bash', arguments: { command: 'npm run calibrate', timeout: 30000 } } },
  { tool: { name: 'Bash', arguments: { command: 'Start-Sleep -Seconds 45', timeout: 120000 } } },
  { text: 'done', status: true },
], 'Shift the clock to just before the peak ends, run the calibration, wait past the end of the peak, then reply done.', [...RULES_ROW, ...clockRow(PEAK_AT, SHIFT_TOOL)], wakeProject.ws)

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

// The stop level set before the run by the person through the real board, on a
// plain session (no goal): the service's snapshot per step and the wording of
// the GLM package's reminder, which the stop level words (docs/ORCHESTRATION.md §11.4).
const rulesStopNoticeProject = rulesProject('rules-stop-notice')
const rulesStopNoticeSet = rulesStopNoticeProject.ready ? await openRulesBoard({ projectRoot: rulesStopNoticeProject.ws }).apply('human', { op: 'peak-mode-set', level: 'stop' }) : undefined
const rulesStopNotice = runScenario('rules-stop-notice', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } }, peakMode: true },
  { text: 'done', peakMode: true },
], 'Read package.json, then reply done.', [...RULES_ROW, ...clockRow(PEAK_AT)], rulesStopNoticeProject.ws)

// Loop board, the end of a peak (docs/ORCHESTRATION.md §18.12, loops design
// §6.9). The scenario project is a scratch git repository whose rules file
// holds the person's 少做 choice; the loop row is enabled on the GLM route at
// the probe clock, inside the peak, and no contribution lists
// execute.resume-drive (the headless host has no execution row). The scripted
// agent becomes the main agent with /wish and works (the board's step note
// writes the walk record), lets the board's first beat read the peak, shifts
// the clock past the peak's end with the probe clock's tool, dispatches a
// background child that sleeps, and idles (the headless runner exits at a
// quiescent idle, and the child keeps the idle from being one): the board's
// second beat sees the edge, the table finds nobody to resume, and the idle
// main agent that worked in this peak is woken once with the board's
// reminder. The restart boot opens the same project five minutes before the
// same peak's end, crosses into and out of the same peak again: the end
// edge's key was consumed by the first boot, the re-emitted event is a
// duplicate, and no second reminder goes out.
const LOOPS_PEAK_END = '2026-10-28T10:00:00.000Z'
// The same moment as a number: the step clock is a number, and a number compared with the string would coerce it to NaN (the check below reads this one).
const LOOPS_PEAK_END_MS = Date.parse(LOOPS_PEAK_END)
// The headless runtime mounts no session controller, which is what lets the loop board's running half activate; the probe row stands in for it.
const SESSIONS_ROW = [
  '- insert:',
  '    - id: glm-hourness-probe/sessions',
  `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-sessions.mjs')))}`,
  '      inject: [agents]',
]
const REDUCE_RULES_FILE = repoJson({ version: 2, peakMode: { level: 'reduce', at: GATE_RULE_AT, origin: { actor: 'human' } } })
const loopsPeakProject = rulesGateProject('loops-peak', REDUCE_RULES_FILE)
mkdirSync(join(loopsPeakProject.ws, 'docs', 'graph'), { recursive: true })
const loopsPeak = runScenario('loops-peak', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } }, line: '/wish' },
  { tool: { name: 'Bash', arguments: { command: 'Start-Sleep -Seconds 62', timeout: 120000 } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: SHIFT_TOOL, input: { at: '2026-10-28T10:05:00.000Z' } } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_dispatch', input: { task: 'T1', prompt: 'Probe task T1: wait for the peak to end, then report.', cwd: loopsPeakProject.ws, scope: 'allowed', model: 'deepseek-probe' } } } },
  { text: 'Waiting for the peak to end.' },
  { text: 'done', status: true },
], 'Become the main agent, read package.json, wait, shift the clock past the peak, dispatch a waiting task, then reply done when the board tells you the peak ended.', [...RULES_ROW, ...LOOPS_ROW, ...SESSIONS_ROW, ...clockRow(PEAK_AT, SHIFT_TOOL), ...dispatchRow(join(runDir, 'loops-peak', 'dispatch.jsonl')), ...designRows({ record: slash(join(runDir, 'loops-peak', 'design.jsonl')) })], loopsPeakProject.ws, [[
  { tool: { name: 'Bash', arguments: { command: 'Start-Sleep -Seconds 30' } } },
  { tool: { name: 'structured_output', arguments: { summary: 'waited out the peak', files: [] } } },
  { text: 'child done' },
]])
const loopNotices = step => (step?.messages ?? []).filter(message => message.role === 'user' && message.source === LOOP_NOTICE_SOURCE)
const loopsPeakNoticeSteps = loopsPeak.steps.filter(step => loopNotices(step).length > 0)
const loopsPeakRuns = () => {
  const dir = join(loopsPeakProject.ws, '.llm', 'metrics')
  return existsSync(dir)
    ? readdirSync(dir).filter(name => /^events-.+\.jsonl$/.test(name)).flatMap(name => jsonl(join(dir, name))).map(line => ({ ...line.body, kind: line.k }))
    : []
}
const loopsPeakRestart = runScenario('loops-peak-restart', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { tool: { name: 'Bash', arguments: { command: 'Start-Sleep -Seconds 62', timeout: 120000 } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: SHIFT_TOOL, input: { at: '2026-10-28T10:00:30.000Z' } } } },
  { tool: { name: 'Bash', arguments: { command: 'Start-Sleep -Seconds 62', timeout: 120000 } } },
  { text: 'done', status: true },
], 'Read package.json, wait, shift the clock past the peak, wait again, then reply done.', [...RULES_ROW, ...LOOPS_ROW, ...SESSIONS_ROW, ...clockRow('2026-10-28T09:55:00.000Z', SHIFT_TOOL)], loopsPeakProject.ws)
const loopsPeakRestartNoticeSteps = loopsPeakRestart.steps.filter(step => loopNotices(step).length > 0)

// The headless runner exits at the first quiescent idle of its own agent: an
// armed goal created in the task turn gets no round before exit (the reason
// the goal scenario drives a second root agent from inside a tool call).
const headlessGoal = runScenario('goal-headless', 'glm-5.3', [
  { tool: { name: 'DeferredToolCall', arguments: { name: 'create_goal', input: { objective: 'Probe objective.', max_goal_rounds: 2 } } } },
  { text: 'Goal created.' },
  { text: 'round reply' },
], 'Create a goal for the probe objective.')
const headlessCreated = lastToolResult(headlessGoal.steps[1])

// Graph panel row (docs/ORCHESTRATION.md §2.10, §13): the overlay enables
// glm-hourness/graph-panel and disables the graph row, so the face check
// sees what the panel row alone adds. The panel writes nothing since
// plain-ui (d-ui-look-not-operate): the scenario boots the row alone and
// reads the live view; /graph-run has its own scenario (glm-graph-run).
const panelDir = join(runDir, 'glm-graph-panel')
const panelWs = join(panelDir, 'ws')
mkdirSync(panelWs, { recursive: true })
const graphPanel = runScenario('glm-graph-panel', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { text: 'done', live: true },
], 'Read package.json, then reply done.', [...PANEL_ROW, '- id: glm-hourness/graph', '  disabled: true'], panelWs)
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
const graphRow = (dir, home) => ['- id: glm-hourness/graph', '  disabled: false', `  config: { dir: ${JSON.stringify(slash(dir))}, home: ${JSON.stringify(slash(home))} }`]
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
  { tool: { name: 'graph_propose', arguments: { node: { type: 'task', title: 'M3 探针的小步', parent: focusTask?.id }, reason: 'probe: a title the writing check warns about' } } },
  { text: 'done', status: true },
], 'Work on the project graph, then reply done.', [...graphRow(graphCopy, join(graphRowDir, 'home')), ...workspaceChangesRow('glm-hourness-probe/workspace-changes')], graphWs)
const graphSteps = graphRun.steps
const graphResult = index => lastToolResult(graphSteps[index])
const graphNotices = step => (step?.messages ?? []).filter(message => message.role === 'user' && message.source === 'glm-graph-projection')
const graphProposeTitle = (graphSteps[0]?.tools ?? []).find(tool => tool.name === 'graph_propose')?.parameters.properties?.node?.properties?.title?.description ?? ''
const graphProposeWarnings = (() => {
  try {
    return JSON.parse(graphResult(11)?.text ?? '{}').warnings ?? []
  }
  catch {
    return []
  }
})()
const copyAfter = await loadGraph(graphCopy)
const graphViolations = jsonl(join(graphRowDir, 'home', 'audit', 'violations.jsonl'))
const graphStderr = existsSync(join(graphRowDir, 'stderr.txt')) ? readFileSync(join(graphRowDir, 'stderr.txt'), 'utf8') : ''

// The follow-up recorder (m4-gate G2, design §3.3, §14.1) over a copy of the
// repository graph: the verbatim retry settles the first graph denial as
// repeat, the shell write the graph row never sees settles the second as
// other, and the write-tool call after the shell denial is file-tools-only's
// right path and settles it as right-path. Three denials and three follow-ups
// in one journal, the graph row's and the guard row's gates settling through
// the one module-level recorder (§3.3).
const followupDir = join(runDir, 'guard-followup')
const followupWs = join(followupDir, 'ws')
const followupGraph = join(followupWs, 'docs', 'graph')
mkdirSync(join(followupGraph, 'nodes'), { recursive: true })
cpSync(join(repoGraph, 'nodes'), join(followupGraph, 'nodes'), { recursive: true })
const followupNodeFile = join(followupGraph, 'nodes', 'probe-followup.json')
const followupFile = join(followupWs, 'x.txt')
const followupWrite = { tool: { name: 'Write', arguments: { file_path: followupNodeFile, content: '{}\n' } } }
const guardFollowup = runScenario('guard-followup', 'glm-5.3', [
  followupWrite,
  followupWrite,
  { tool: { name: 'Bash', arguments: { command: `Set-Content -Path '${followupFile}' -Value 1` } } },
  { tool: { name: 'Write', arguments: { file_path: followupFile, content: '1\n' } } },
  { text: 'done', status: true },
], 'Write a graph node file twice, then write a file through the shell, then write x.txt with the write tool, and reply done.', [...graphRow(followupGraph, join(followupDir, 'home'))], followupWs)
const graphFace = step => (step?.tools ?? []).filter(tool => GRAPH_TOOL_NAMES.includes(tool.name))

// The three rules of §4 (m4-gate G3, design §14.1 `guard-new-rules`, GLM and
// native faces): reading the fake credential file is not judged and leaves no
// record; the bare suppression, the checker-config edit and the root-level
// script are denied by their rules, the last two with a request ref in the
// correction. The temp repo holds no project graph, so checker-config's
// env-config half is unknown and only the builtin list judges (which covers
// tsconfig.json).
const newRulesDir = join(runDir, 'guard-new-rules')
const newRulesWs = join(newRulesDir, 'ws')
mkdirSync(newRulesWs, { recursive: true })
writeFileSync(join(newRulesWs, 'tsconfig.json'), '{\n  "compilerOptions": {}\n}\n')
const newRulesGitReady = initRepo(newRulesWs)
const newRulesCredentials = join(newRulesDir, 'dsh-home', 'glm-hourness', 'credentials.json')
mkdirSync(dirname(newRulesCredentials), { recursive: true })
writeFileSync(newRulesCredentials, '{"token": "probe-credential-shape-only"}\n')
const newRulesScript = zcode => [
  { tool: { name: zcode ? 'Read' : 'read', arguments: { file_path: newRulesCredentials } } },
  { tool: { name: zcode ? 'Write' : 'write', arguments: { file_path: join(newRulesWs, 'bare.ts'), content: '// eslint-disable-next-line\nexport const bare = 1\n' } } },
  { tool: { name: zcode ? 'Edit' : 'edit', arguments: { file_path: join(newRulesWs, 'tsconfig.json'), old_string: '"compilerOptions"', new_string: '"compilerOptions": {\n    "strict": false' } } },
  { tool: { name: zcode ? 'Write' : 'write', arguments: { file_path: join(newRulesWs, 'fix.py'), content: 'print(1)\n' } } },
  { text: 'done', status: true },
]
const newRulesTask = 'Read the credentials file once; create a TypeScript file with an ESLint suppression; loosen tsconfig.json; create fix.py at the root; reply done.'
const guardNewRules = runScenario('guard-new-rules', 'glm-5.3', newRulesScript(true), newRulesTask, [], newRulesWs)
const guardNewRulesPlain = runScenario('guard-new-rules-plain', 'deepseek-probe', newRulesScript(false), newRulesTask, [], newRulesWs)
const newRulesResult = (scenario, index) => lastToolResult(scenario.steps[index])
const newRulesViolations = scenario => jsonl(join(runDir, scenario, 'home', 'audit', 'violations.jsonl'))

// The lift path (m4-gate G3, design §14.1 `guard-lift`): the probe-lift
// overlay plays the human (first turn end) and the rules board (second), the
// worktree exists before the session starts. The lift writes the record into
// docs/guard/lifts.jsonl, the record itself and its worktree copy are
// off-limits, the restore puts the rule back.
const liftDir = join(runDir, 'guard-lift')
const liftWs = join(liftDir, 'ws')
mkdirSync(liftWs, { recursive: true })
writeFileSync(join(liftWs, 'README.md'), 'probe workspace\n')
const liftGitReady = initRepo(liftWs)
const liftWorktree = join(liftDir, 'wt')
const liftWorktreeReady = liftGitReady && spawnSync('git', ['-c', 'user.name=glm-hourness', 'worktree', 'add', '--quiet', slash(liftWorktree)], { cwd: liftWs, encoding: 'utf8' }).status === 0
const liftFix = join(liftWs, 'fix.py')
const liftFix2 = join(liftWs, 'fix2.py')
const liftRecordMain = join(liftWs, 'docs', 'guard', 'lifts.jsonl')
const liftRecordWorktree = join(liftWorktree, 'docs', 'guard', 'lifts.jsonl')
const liftLog = join(liftDir, 'lift.jsonl')
const LIFT_HUMAN_WORDS = '新建脚本那条先别拦了。另外记得周五开会。'
const liftRow = [
  '- insert:',
  '    - id: glm-hourness-probe/lift',
  `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-lift.mjs')))}`,
  '      inject: [tools]',
  `      config: { out: ${JSON.stringify(slash(liftLog))}, cwd: ${JSON.stringify(slash(liftWs))}, rule: 'guard:scratch-only', restore: true }`,
]
const guardLiftRun = runScenario('guard-lift', 'glm-5.3', [
  { tool: { name: 'Write', arguments: { file_path: liftFix, content: 'print(1)\n' } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_say', input: { text: LIFT_HUMAN_WORDS, rpcId: 'probe-lift-1' } } } },
  { text: 'The script rule blocked me; I asked the human.' },
  { tool: { name: 'LocalToolSearch', arguments: { query: 'select:guard_lift', max_results: 5 } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'guard_lift', input: { rule: 'scratch-only', words: '新建脚本那条先别拦了', action: 'lift' } } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'guard_lift', input: { rule: 'workspace-containment', words: '把圈禁也一起撤了吧' } } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'guard_lift', input: { rule: 'workspace-containment', words: '另外记得周五开会' } } } },
  { tool: { name: 'Write', arguments: { file_path: liftFix, content: 'print(1)\n' } } },
  { tool: { name: 'Write', arguments: { file_path: liftRecordMain, content: '{}\n' } } },
  { tool: { name: 'Write', arguments: { file_path: liftRecordWorktree, content: '{}\n' } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_restore', input: { rule: 'guard:scratch-only' } } } },
  { text: 'The human lifted the rule; the script ran; then the board put it back.' },
  { tool: { name: 'Write', arguments: { file_path: liftFix2, content: 'print(2)\n' } } },
  { text: 'done', status: true },
], 'Create fix.py at the root. When the human allows it, lift the rule with guard_lift and retry; never edit the lift record yourself. Then try another script.', liftRow, liftWs)
const liftResult = index => lastToolResult(guardLiftRun.steps[index])
const liftViolations = jsonl(join(liftDir, 'home', 'audit', 'violations.jsonl'))
const liftLogEntries = jsonl(liftLog)

// The post-hoc correction (m4-gate G3, design §14.1 `guard-fallback`): the
// .NET write the reader cannot see runs in turn 1; the probe companion
// queues the human's words mid-turn, so the turn ends, the workspace summary
// lands as one late denial, and the correction reaches the first step of
// turn 2 (the queued message opens it) and no later step.
const fallbackDir = join(runDir, 'guard-fallback')
const fallbackWs = join(fallbackDir, 'ws')
mkdirSync(fallbackWs, { recursive: true })
writeFileSync(join(fallbackWs, 'README.md'), 'probe workspace\n')
const fallbackGitReady = initRepo(fallbackWs)
const fallbackFile = join(fallbackWs, 'fallback.txt')
const fallbackWrite = `[System.IO.File]::WriteAllText('${slash(fallbackFile)}', 'probe')`
const fallbackRow = [
  '- insert:',
  '    - id: glm-hourness-probe/lift',
  `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-lift.mjs')))}`,
  '      inject: [tools]',
  `      config: { out: ${JSON.stringify(slash(join(fallbackDir, 'lift.jsonl')))} }`,
]
const guardFallbackRun = runScenario('guard-fallback', 'glm-5.3', [
  { tool: { name: 'Bash', arguments: { command: fallbackWrite } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_say', input: { text: '（人：知道了，继续。）' } } } },
  { text: 'The shell wrote the file; moving on.' },
  { tool: { name: 'Read', arguments: { file_path: join(fallbackWs, 'README.md') } } },
  { text: 'done', status: true },
], 'Write a file through the shell, then carry on and reply done.', [...workspaceChangesRow('glm-hourness-probe/workspace-changes'), ...fallbackRow], fallbackWs)
const fallbackViolations = jsonl(join(fallbackDir, 'home', 'audit', 'violations.jsonl'))

// The request channel (m4-request-card G4, design §14.1 `guard-request`): the
// probe companion queues the human's words mid-turn (probe_say; an rpcId makes
// them the DSH client's own), the scripted reply ends with the plan text
// (`echoToolText`, reading it out of the ask result), and `{ref}` in the
// scripted arguments is the reference the conversation last named. The
// identical write runs once on the grant and is denied after; the old content
// sits in the project's requests/ directory. The GLM face files through
// DeferredToolCall; the native face calls request_exception directly.
const probeRow = out => [
  '- insert:',
  '    - id: glm-hourness-probe/lift',
  `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-lift.mjs')))}`,
  '      inject: [tools]',
  `      config: { out: ${JSON.stringify(slash(out))} }`,
]
const REQUEST_PURPOSE = '把探针的待办追加到工作区外的待办文件'
const REQUEST_REVERSIBILITY = '旧内容先备份，改坏了能找回'
const requestExceptionCall = zcode => zcode
  ? { tool: { name: 'DeferredToolCall', arguments: { name: 'request_exception', input: { ref: '{ref}', purpose: REQUEST_PURPOSE, reversibility: REQUEST_REVERSIBILITY, alternatives: 'none' } } } }
  : { tool: { name: 'request_exception', arguments: { ref: '{ref}', purpose: REQUEST_PURPOSE, reversibility: REQUEST_REVERSIBILITY, alternatives: 'none' } } }
const probeSay = (zcode, text, rpcId) => zcode
  ? { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_say', input: { text, ...(rpcId === undefined ? {} : { rpcId }) } } } }
  : { tool: { name: 'probe_say', arguments: { text, ...(rpcId === undefined ? {} : { rpcId }) } } }
const writeOf = (target, zcode) => ({ tool: { name: zcode ? 'Write' : 'write', arguments: { file_path: target, content: 'probe content\n' } } })
const requestDir = join(runDir, 'guard-request')
const requestWs = join(requestDir, 'ws')
mkdirSync(requestWs, { recursive: true })
writeFileSync(join(requestWs, 'README.md'), 'probe workspace\n')
const requestGitReady = initRepo(requestWs)
const requestTarget = join(requestDir, 'outside', 'todo.md')
mkdirSync(dirname(requestTarget), { recursive: true })
writeFileSync(requestTarget, 'old content\n')
const requestTask = `Overwrite ${slash(requestTarget)} with the write tool and follow the harness's instructions; put its text at the very end of your reply; once the human answers, make the identical write twice more, then reply done.`
const requestScript = zcode => [
  writeOf(requestTarget, zcode),
  requestExceptionCall(zcode),
  probeSay(zcode, '可以', 'probe-request-1'),
  { echoToolText: true },
  writeOf(requestTarget, zcode),
  writeOf(requestTarget, zcode),
  { text: 'done', status: true },
]
const guardRequest = runScenario('guard-request', 'glm-5.3', requestScript(true), requestTask, probeRow(join(requestDir, 'lift.jsonl')), requestWs)
const guardRequestPlain = runScenario('guard-request-plain', 'deepseek-probe', requestScript(false), requestTask, probeRow(join(requestDir, 'plain-lift.jsonl')), requestWs)
const requestViolations = jsonl(join(requestDir, 'home', 'audit', 'violations.jsonl'))
const requestAsked = requestViolations.find(record => record.kind === 'request' && record.outcome === 'asked')

// The refusal paths (design §14.1 `guard-request-refuse`): a headless 可以
// cannot approve (not-client), 可以吗 reads unclear and the confirmation
// sentence becomes the tail, the approval after it grants once, and a reply
// that says one thing more after the plan text is not-shown — the request
// stays, the write is denied.
const refuseDir = join(runDir, 'guard-request-refuse')
const refuseWs = join(refuseDir, 'ws')
mkdirSync(refuseWs, { recursive: true })
writeFileSync(join(refuseWs, 'README.md'), 'probe workspace\n')
const refuseGitReady = initRepo(refuseWs)
const refuseTarget = join(refuseDir, 'outside', 'todo.md')
mkdirSync(dirname(refuseTarget), { recursive: true })
writeFileSync(refuseTarget, 'old content\n')
const REFUSE_CONFIRM = '放行这一次写 todo.md，可以吗？（回「可以」才算数）'
const guardRequestRefuse = runScenario('guard-request-refuse', 'glm-5.3', [
  writeOf(refuseTarget, true),
  requestExceptionCall(true),
  probeSay(true, '可以'),
  { echoToolText: true },
  probeSay(true, '可以吗', 'probe-refuse-2'),
  { echoToolText: true },
  probeSay(true, '可以', 'probe-refuse-3'),
  { text: `收到。${REFUSE_CONFIRM}` },
  writeOf(refuseTarget, true),
  writeOf(refuseTarget, true),
  requestExceptionCall(true),
  probeSay(true, '可以', 'probe-refuse-5'),
  { echoToolText: '另外提醒一句。' },
  writeOf(refuseTarget, true),
  { text: 'done', status: true },
], `Overwrite ${slash(refuseTarget)} with the write tool and follow the harness's instructions; put its text at the very end of your replies; once an approval lands, make the identical write once more, then file the request again; after the next answer try the write once more; reply done.`, probeRow(join(refuseDir, 'lift.jsonl')), refuseWs)
const refuseViolations = jsonl(join(refuseDir, 'home', 'audit', 'violations.jsonl'))
const refuseNotice = (index, marker) => (guardRequestRefuse.steps[index]?.messages ?? []).some(message => message.source === 'hourness-request' && typeof message.text === 'string' && message.text.includes(marker))

// The goal round (design §14.1 `guard-request-goal`, F14): the goal agent is
// a second root agent with a live goal, so a round's first step without a
// human message carries the still-waits reminder, and the approval pairs with
// its ask result (F15).
const requestGoalDir = join(runDir, 'guard-request-goal')
const requestGoalWs = join(requestGoalDir, 'ws')
mkdirSync(requestGoalWs, { recursive: true })
writeFileSync(join(requestGoalWs, 'README.md'), 'probe workspace\n')
const requestGoalGitReady = initRepo(requestGoalWs)
const requestGoalTarget = join(requestGoalDir, 'outside', 'todo.md')
mkdirSync(dirname(requestGoalTarget), { recursive: true })
writeFileSync(requestGoalTarget, 'old content\n')
const guardRequestGoal = runScenario('guard-request-goal', 'glm-5.3', [
  { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_goal_run', input: { objective: 'Overwrite the outside todo file through the harness\'s request channel, then mark the goal complete.', cwd: requestGoalWs, evidence: 'README.md', maxGoalRounds: 6 } } } },
  { text: 'done', status: true },
], 'Run the goal probe, then reply done.', [...dispatchRow(join(requestGoalDir, 'dispatch.jsonl')), ...probeRow(join(requestGoalDir, 'lift.jsonl'))], requestGoalWs, [[
  writeOf(requestGoalTarget, true),
  requestExceptionCall(true),
  { echoToolText: true },
  probeSay(true, '可以', 'probe-request-goal-1'),
  { echoToolText: true },
  writeOf(requestGoalTarget, true),
  { text: 'The write ran on the human approval.' },
  completeGoal,
  { text: 'Goal complete.', status: true },
]])
const requestGoalSteps = bySession(guardRequestGoal, dispatchRecord('guard-request-goal').find(entry => entry.kind === 'goal-created')?.agentId)
const requestGoalNotices = step => (step?.messages ?? []).filter(message => message.source === 'hourness-request')
const requestGoalStill = requestGoalSteps.some(step => requestGoalNotices(step).some(notice => typeof notice.text === 'string' && notice.text.includes('still waits')))
const requestGoalApproval = requestGoalSteps.map(step => requestGoalNotices(step).find(notice => typeof notice.text === 'string' && notice.text.includes('The human approved request'))).find(notice => notice !== undefined)
const requestGoalAsked = requestGoalSteps.some(step => (step?.messages ?? []).some(message => message.role === 'tool' && typeof message.text === 'string' && message.text.includes('"outcome":"ask"')))
const requestGoalViolations = jsonl(join(requestGoalDir, 'home', 'audit', 'violations.jsonl'))

const plainGraph = runScenario('non-glm-graph', 'deepseek-probe', [
  { tool: { name: 'graph_open', arguments: {} } },
  { text: 'done' },
], 'List the open work, then reply done.', graphRow(graphCopy, join(runDir, 'non-glm-graph', 'home')), graphWs)
const plainGraphOpen = lastToolResult(plainGraph.steps[1])

// The first step writes a node file and is denied by graph-files-only, so the
// re-anchoring after each later compaction lists that rule with its count
// (ORCHESTRATION.md §2.5 重锚附带).
const compactGraph = runScenario('glm-graph-compact', 'glm-5.3', [
  { tool: { name: 'Write', arguments: { file_path: join(graphCopy, 'nodes', 'probe-compact.json'), content: '{}\n' } } },
  { tool: { name: 'graph_focus', arguments: { id: focusTask?.id } } },
  { tool: { name: 'Read', arguments: { file_path: join(graphWs, 'README.md') } } },
  { tool: { name: 'Read', arguments: { file_path: join(graphWs, 'README.md') } } },
  { text: 'done' },
], 'Write a node file, set the focus, read the README twice, then reply done.', [...graphRow(graphCopy, join(runDir, 'glm-graph-compact', 'home')), '- id: compaction-basic', '  config: { thresholdRatio: 0.02, retainTokens: 0 }'], graphWs)
/** Requests that carry a compaction checkpoint, and the projection reasons that follow it in each. */
const reanchored = compactGraph.steps.flatMap((step) => {
  const at = step.messages.findLastIndex(message => message.source === 'compact-checkpoint')
  return at < 0 ? [] : [step.messages.slice(at + 1).filter(message => message.source === 'glm-graph-projection').map(message => message.projection)]
})
/** The first re-anchoring notice, the scenario's denials, and the non-goals of the focus's goal in the copy. */
const firstReanchor = compactGraph.steps.flatMap(step => step.messages).find(message => message.source === 'glm-graph-projection' && message.projection === 'compaction')
const compactViolations = jsonl(join(runDir, 'glm-graph-compact', 'home', 'audit', 'violations.jsonl'))
const DENIED_HEAD = 'Calls the harness denied in this session, by rule (rule id: times).'
const focusGoal = (() => {
  let node = copyBefore.nodes.get(focusTask?.id ?? '')
  while (node !== undefined && node.type !== 'goal') node = node.parent === undefined ? undefined : copyBefore.nodes.get(node.parent)
  return node
})()
/** The approved, live norm nodes below the focus's goal in the copy, as the re-anchoring lists them (src/graph/reanchor.ts goalNorms). */
const focusNorms = (() => {
  if (focusGoal === undefined) return []
  const under = node => {
    for (let at = node; at !== undefined; at = at.parent === undefined ? undefined : copyBefore.nodes.get(at.parent)) {
      if (at.status === 'dropped' || at.status === 'superseded') return false
      if (at.id === focusGoal.id) return at !== node
    }
    return false
  }
  return [...copyBefore.nodes.values()].filter(node => node.type === 'norm' && ['approved', 'doing', 'done'].includes(node.status) && under(node)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
})()
const NORMS_HEAD = 'Norms in effect under goal'

// Host workspace instructions after a compaction (docs/FACTS.md §3; habits
// report §2.2, H2): dsh-agent-instructions puts $DSH_HOME/AGENTS.md and the
// project's AGENTS.md into the first request as one baseline message. The
// scenario boots under a DSH home holding a user-level AGENTS.md, works in a
// repository holding a project AGENTS.md, compacts at every step boundary,
// and dispatches a subagent; the checks read whether the baseline comes back
// after each checkpoint and whether the child's first request carries it.
const instructionsDir = join(runDir, 'glm-compact-instructions')
const instructionsWs = join(instructionsDir, 'ws')
const USER_MARK = 'PROBE-USER-INSTRUCTIONS-MARK'
const PROJECT_MARK = 'PROBE-PROJECT-INSTRUCTIONS-MARK'
mkdirSync(instructionsWs, { recursive: true })
writeFileSync(join(instructionsHome, 'AGENTS.md'), `# probe user instructions\n\n${USER_MARK}\n`)
writeFileSync(join(instructionsWs, 'AGENTS.md'), `# probe project instructions\n\n${PROJECT_MARK}\n`)
writeFileSync(join(instructionsWs, 'README.md'), 'probe workspace\n')
const compactInstructions = runScenario('glm-compact-instructions', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(instructionsWs, 'README.md') } } },
  { tool: { name: 'Read', arguments: { file_path: join(instructionsWs, 'README.md') } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_dispatch', input: { task: 'I1', prompt: 'Probe task I1: reply done.', cwd: instructionsWs, scope: '.', model: 'glm-5.3' } } } },
  { tool: { name: 'Bash', arguments: { command: 'Start-Sleep -Seconds 3', description: 'probe: let the subagent run' } } },
  { text: 'done' },
], 'Read the README twice, dispatch task I1, wait, then reply done.', [...dispatchRow(join(instructionsDir, 'dispatch.jsonl')), '- id: compaction-basic', '  config: { thresholdRatio: 0.02, retainTokens: 0 }'], instructionsWs, [[{ text: 'child done' }]], instructionsProfile)
const instructionsChildId = dispatchRecord('glm-compact-instructions').find(entry => entry.kind === 'started')?.childId
const instructionsMain = compactInstructions.steps.filter(step => step.sessionId !== instructionsChildId)
const instructionsChild = bySession(compactInstructions, instructionsChildId)
/** The workspace instruction messages of a request after its last compaction checkpoint (all of them when it has none). */
const instructionsAfterCheckpoint = (step) => {
  const at = step?.messages.findLastIndex(message => message.source === 'compact-checkpoint') ?? -1
  return (step?.messages ?? []).slice(at + 1).filter(message => message.source === 'agent-instructions')
}
const bothMarks = messages => messages.some(message => message.text.includes(USER_MARK) && message.text.includes(PROJECT_MARK))
const instructionsCheckpointed = instructionsMain.filter(step => step.messages.some(message => message.source === 'compact-checkpoint'))

const graphGoalDir = join(runDir, 'glm-graph-goal')
const graphGoalWs = join(graphGoalDir, 'ws')
mkdirSync(graphGoalWs, { recursive: true })
writeFileSync(join(graphGoalWs, 'evidence.txt'), 'evidence\n')
const graphGoal = runScenario('glm-graph-goal', 'glm-5.3', [
  { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_goal_run', input: { objective: 'Set the graph focus, then mark the goal complete in the next round.', cwd: graphGoalWs, evidence: 'evidence.txt', maxGoalRounds: 2 } } } },
  { text: 'done' },
], 'Run the goal probe, then reply done.', [...dispatchRow(join(graphGoalDir, 'dispatch.jsonl')), ...graphRow(graphCopy, join(graphGoalDir, 'home'))], repo, [[
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
], 'Reply done.', [...PANEL_ROW, ...graphRow(controlGraph, join(runDir, 'glm-graph-run', 'home'))], controlWs)
const controlSteps = bySession(graphControl, graphControl.steps[0]?.sessionId)
const controlCommands = controlSteps.flatMap(step => step.command === undefined ? [] : [step.command])
const controlHistory = ((await loadGraph(controlGraph)).nodes.get('task-1')?.history ?? []).filter(entry => entry.actor === 'human' && entry.op === 'comment').map(entry => entry.text)
const controlStart = (controlSteps[1]?.messages ?? []).find(message => message.role === 'user' && message.source === 'glm-graph-run')
const controlStderr = existsSync(join(controlDir, 'stderr.txt')) ? readFileSync(join(controlDir, 'stderr.txt'), 'utf8') : ''
const repoGraphAfter = (await loadGraph(repoGraph)).revision

// Memory (docs/ORCHESTRATION.md §8, M5 design §10.1). The data row points the
// project directory of every session at <scenario>/home and the user-level
// directory at <scenario>/dsh-home/glm-hourness (scripts/sandbox.mjs
// dataRows). The first root agent writes four memories (a preference about
// the person, a project fact with its source, a reference with text the old
// path test refused, the reporting depth); the probe provider then starts a
// second root agent in the same workspace, which must see them in its index.
const MEMORY_FEEDBACK = { name: 'lead-with-the-answer', type: 'feedback', scope: 'all', description: 'Start every reply with the answer; keep jargon out', body: 'Open with the answer in one sentence, then the reasons.\n**Why:** the user reads replies on a phone.', relay: 'Start with the answer, and keep jargon out.' }
const MEMORY_FACT = { name: 'signing-rules-differ', type: 'project', description: 'coding-plan and start-plan sign requests differently', body: 'The two tiers sign differently.\n**Why:** a request signed the wrong way is refused.', source: ['package.json'] }
const MEMORY_REFERENCE = { name: 'host-surface-notes', type: 'reference', description: 'where the host surface is written down', body: 'See coding-plan/start-plan and src/shared/dsh-min.ts.' }
const MEMORY_DEPTH = { name: 'reporting-depth', type: 'user', description: 'Wants short reports', body: 'Keep reports short.\n**Why:** reads them on a phone.', value: 'concise', relay: 'From now on just the key points.' }
const MEMORY_NAMES = [MEMORY_FEEDBACK, MEMORY_FACT, MEMORY_REFERENCE, MEMORY_DEPTH].map(entry => entry.name)
// The task is the session's person message: the preference relays of these
// scenarios quote it, and since H1 the harness checks the words against the
// person's latest message.
const MEMORY_TASK = 'Store four memories. 先记住这两句话：Start with the answer, and keep jargon out. 还有：From now on just the key points. Then reply done.'
const memoryScript = () => [
  ...[MEMORY_FEEDBACK, MEMORY_FACT, MEMORY_REFERENCE, MEMORY_DEPTH].map(entry => ({ tool: { name: 'memory_store', arguments: entry } })),
  { text: 'done', status: true, spawn: { text: 'Start the second session.' } },
]
const memoryOthers = read => [[{ tool: { name: read, arguments: { file_path: join(repo, 'package.json') } } }, { text: 'second done' }]]
// The project fact's source is a file of the project, and the scenario directory is the project.
for (const scenario of ['glm-memory', 'non-glm-memory']) {
  mkdirSync(join(runDir, scenario), { recursive: true })
  cpSync(join(repo, 'package.json'), join(runDir, scenario, 'package.json'))
}
const memoryGlm = runScenario('glm-memory', 'glm-5.3', memoryScript(), MEMORY_TASK, [], repo, memoryOthers('Read'))
const memoryPlain = runScenario('non-glm-memory', 'deepseek-probe', memoryScript(), MEMORY_TASK, [], repo, memoryOthers('read'))
const memoryIndexes = step => (step?.messages ?? []).filter(message => message.role === 'user' && message.source === MEMORY_INDEX_SOURCE)
const memoryFace = step => (step?.tools ?? []).filter(tool => MEMORY_TOOL_NAMES.includes(tool.name))
const learningFace = step => (step?.tools ?? []).filter(tool => LEARNING_TOOL_NAMES.includes(tool.name))
/** The steps of the root agent that wrote the memories, and those of the one the probe provider started after it (the id is in the last request of the first). */
const memorySessions = (scenario) => {
  const second = scenario.steps.at(-1)?.spawn?.sessionId
  return { first: scenario.steps.filter(step => step.sessionId !== second), second: bySession(scenario, second) }
}
/** The records of a memory journal of a scenario, without the learning digest record every scenario starts with (learnSeed). */
const memoryJournalOf = (scenario, scope) => jsonl(join(runDir, scenario, ...(scope === 'all' ? ['dsh-home', 'glm-hourness', 'memory'] : ['home']), 'memory.jsonl')).filter(record => record.op !== 'learn-notified')
/** A norm of the project already in the project journal when the scenario starts (written the way the person's /memory would). */
const seedProjectMemory = (scenario) => {
  const home = join(runDir, scenario, 'home')
  mkdirSync(home, { recursive: true })
  const data = { name: 'seeded-norm', scope: 'project', type: 'feedback', description: 'A norm of this project', body: 'Keep commits small.\n**Why:** reviews stay short.' }
  writeFileSync(join(home, 'memory.jsonl'), `${learnSeed(1)}${JSON.stringify({ v: 1, seq: 2, at: '2026-10-31T00:00:00.000Z', actor: 'human', op: 'store', id: 'project:seeded-norm', data })}\n`)
}

// Reporting depth (M5 design §3.7, m5-5): the glm:reporting-depth section names the
// depth the person set, read once when a session starts. The first root agent
// stores `concise` and starts a second, which forgets it in its first step
// and starts a third. Each prompt names the depth its session found and
// stays the same through the session: the configured `balanced` for the
// first, `concise` for the second, `balanced` again for the third.
const DEPTH_FORGET = { name: 'reporting-depth', reason: 'The person asked for the default again.', relay: 'Back to the default depth, please.' }
// The task and the second session's message are the person's messages the
// relays of the store and the forget quote (checked since H1).
const DEPTH_TASK = 'Store the reporting depth. 记住我这句话：From now on just the key points. Then reply done.'
const DEPTH_FORGET_TASK = '忘了它，我这句话是：Back to the default depth, please.'
const memoryDepth = runScenario('glm-memory-depth', 'glm-5.3', [
  { tool: { name: 'memory_store', arguments: MEMORY_DEPTH } },
  { text: 'done', spawn: { text: 'Start the second session.' } },
], DEPTH_TASK, [], repo, [
  [{ tool: { name: 'memory_forget', arguments: DEPTH_FORGET } }, { text: 'second done', status: true, spawn: { text: DEPTH_FORGET_TASK } }],
  [{ text: 'third done' }],
])
const depthSessions = (() => {
  const second = memoryDepth.steps.at(-1)?.spawn?.sessionId
  const third = memoryDepth.steps.find(step => step.sessionId === second && step.spawn !== undefined)?.spawn?.sessionId
  return { first: memoryDepth.steps.filter(step => step.sessionId !== second && step.sessionId !== third), second: bySession(memoryDepth, second), third: bySession(memoryDepth, third) }
})()
/** The depth id the standing-preference sentence of the request's prompt names. */
const depthOf = step => /The user's standing preference is [^（]+（(\w+)）/.exec(step?.system ?? '')?.[1]

// The habit questions (M5 design §3.8, m5-4 items 4 to 8): the task is the
// person's message, so a preference quoting it is stored checked; the agent
// asks one habit question (deferred on the GLM route), the probe sends the
// person's reply into the same session (`tell`), the confirm records the
// habit with their words, and a relay that only an earlier message had is
// refused. The user-level journal holds store, ask, store and nothing else.
const HABIT_ASK = { name: 'commit-in-english', scope: 'all', description: 'Write commit messages in English', body: 'Commit messages stay in English.\n**Why:** the person asked for it.\n**How to apply:** write the subject and the body in English.', question: '以后提交说明都写成英文，好吗？', learnedFrom: ['edit:goal.stage'] }
const HABIT_TASK = '试一下习惯先问再记；先记住我这句话：汇报只写结论。'
const memoryHabit = runScenario('glm-memory-habit', 'glm-5.3', [
  { tool: { name: 'memory_store', arguments: { name: 'reports-conclusion-only', type: 'feedback', scope: 'all', description: 'Reports carry only the conclusion', body: 'The conclusion first, the rest on demand.\n**Why:** the person said so.', relay: '汇报只写结论' } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'memory_habit', input: { action: 'ask', ...HABIT_ASK } } } },
  { tell: '好，都写成英文吧' },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'memory_habit', input: { action: 'confirm', name: 'commit-in-english', words: ['好，都写成英文吧'] } } } },
  { tool: { name: 'memory_store', arguments: { name: 'from-the-task', type: 'feedback', scope: 'all', description: 'Quoting an earlier message', body: 'This must be refused.\n**Why:** the words are not in the latest message.', relay: '汇报只写结论' } } },
  { text: 'done', status: true },
], HABIT_TASK, [], repo)

// Compaction: the session starts with a memory in the project, so its first
// request has the index; the compaction removes it from the visible history
// and the next request has it once more, and then no more.
seedProjectMemory('glm-memory-compact')
const memoryCompact = runScenario('glm-memory-compact', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { text: 'done', status: true },
], 'Read package.json three times, then reply done.', ['- id: compaction-basic', '  config: { thresholdRatio: 0.02, retainTokens: 0 }'])
const memoryCheckpointAt = step => step.messages.findLastIndex(message => message.source === 'compact-checkpoint')
const memoryAfterCheckpoint = memoryCompact.steps.filter(step => memoryCheckpointAt(step) >= 0)

// A delegated child gets no memory tools and no index, and is refused when it
// calls the tools by name; the main agent of the same project has the index.
seedProjectMemory('glm-worker-memory')
const workerDir = join(runDir, 'glm-worker-memory')
const workerWs = join(workerDir, 'ws')
mkdirSync(join(workerWs, 'allowed'), { recursive: true })
const memoryWorker = runScenario('glm-worker-memory', 'glm-5.3', [
  { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_dispatch', input: { task: 'T1', prompt: 'Probe task T1: try the memory tools and report.', cwd: workerWs, scope: 'allowed', model: 'glm-5.3-flash' } } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'learning_signals', input: {} } } },
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { text: 'Waiting for task T1.' },
  { text: 'done', status: true },
], 'Dispatch task T1, then reply done.', dispatchRow(join(workerDir, 'dispatch.jsonl')), repo, [[
  { tool: { name: 'memory_store', arguments: MEMORY_FEEDBACK } },
  { tool: { name: 'memory_query', arguments: { focus: 'commits' } } },
  { tool: { name: 'memory_forget', arguments: { name: 'seeded-norm', reason: 'try', scope: 'project' } } },
  { tool: { name: 'learning_signals', arguments: {} } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'structured_output', input: HAND_BACK } } },
  { text: 'child done' },
]])
const workerChildId = dispatchRecord('glm-worker-memory').find(entry => entry.kind === 'started')?.childId
const workerChild = bySession(memoryWorker, workerChildId)
const workerMain = memoryWorker.steps.filter(step => step.sessionId !== workerChildId)

// Lessons (docs/ORCHESTRATION.md §8.6, M5 design §10.1). The row ships
// disabled; the overlay enables it. The project journal of the scenario
// (<scenario>/home/lessons.jsonl, scripts/sandbox.mjs dataRows) starts with a
// lesson and a candidate the way an earlier session would have left them. The
// main agent merges the candidate, hands a second one to the lessons service
// through the overlay tool probe_propose (what the dispatch of work does with
// a worker's handback), queries, deletes and restores the lesson with the
// person's words, is refused when it tries without them, and the person
// deletes and restores it with /lessons.
const LESSONS_ROW = ['- id: glm-hourness/lessons', '  disabled: false']
const SEED_LESSON = 'L-0a1b2c'
const SEED_CANDIDATE = 'C-aaaaaa'
// Times are relative to the run: a candidate open for more than 30 days expires at the first notice step.
const hoursAgo = hours => new Date(Date.now() - hours * 3_600_000).toISOString()
const seedLessons = (scenario) => {
  const home = join(runDir, scenario, 'home')
  mkdirSync(home, { recursive: true })
  const lines = [
    { v: 1, seq: 1, at: hoursAgo(26), actor: 'llm', op: 'new', id: SEED_LESSON, reason: 'seed from the probe', evidence: ['docs/HANDOFF.md §6'], data: { situation: { files: ['probe/**'], tools: [], commands: ['probe-run'], errors: ['probe-lesson-fragment-1'] }, pitfall: 'The probe command fails with probe-lesson-fragment-1 while the sandbox is busy.', fix: 'Wait for the other run to finish, then run it again.' } },
    { v: 1, seq: 2, at: hoursAgo(25), actor: 'harness', op: 'propose', id: SEED_CANDIDATE, evidence: ['task:task-seed', 'session:session-seed'], data: { situation: { files: [], tools: [], commands: ['probe-merge'], errors: ['probe-candidate-fragment-1'] }, pitfall: 'The merge probe candidate fails with probe-candidate-fragment-1.', fix: 'Merge the candidate with lessons_merge.' } },
  ]
  writeFileSync(join(home, 'lessons.jsonl'), `${lines.map(line => JSON.stringify(line)).join('\n')}\n`)
}
const PROBE_COMMIT = 'b'.repeat(40)
const PROBE_CANDIDATE = { problem: 'The proposed probe candidate fails with probe-propose-fragment-1.', fix: 'Drop it or merge it.', files: [], commands: ['probe-propose'], tools: ['Bash'], errors: ['probe-propose-fragment-1'] }
const LESSONS_QUERY = { text: 'probe command sandbox busy' }
/** The script of the main agent: on GLM the tools that are deferred there go through DeferredToolCall. */
const lessonsScript = (glmRoute) => {
  const deferred = (name, input) => ({ tool: glmRoute ? { name: 'DeferredToolCall', arguments: { name, input } } : { name, arguments: input } })
  const query = { tool: { name: 'lessons_query', arguments: LESSONS_QUERY } }
  return [
    deferred('lessons_merge', { action: 'new', reason: 'worth keeping', candidate: SEED_CANDIDATE }),
    deferred('probe_propose', { candidate: PROBE_CANDIDATE, task: 'task-9', childId: 'session-probe-child', commit: PROBE_COMMIT }),
    query,
    deferred('lessons_merge', { action: 'delete', lesson: SEED_LESSON, reason: 'the person asked', relay: 'Delete that lesson.' }),
    query,
    deferred('lessons_merge', { action: 'restore', lesson: SEED_LESSON, reason: 'the person asked', relay: 'Bring it back.' }),
    query,
    deferred('lessons_merge', { action: 'delete', lesson: SEED_LESSON, reason: 'no words quoted' }),
    { ...query, command: { name: 'lessons', input: `delete ${SEED_LESSON}` } },
    { ...query, command: { name: 'lessons', input: `restore ${SEED_LESSON}` } },
    { text: 'done', status: true },
  ]
}
seedLessons('glm-lessons')
const lessonsGlm = runScenario('glm-lessons', 'glm-5.3', lessonsScript(true), 'Merge the candidate lesson, then reply done.', [...LESSONS_ROW, ...dispatchRow(join(runDir, 'glm-lessons', 'dispatch.jsonl'))])
seedLessons('non-glm-lessons')
const lessonsPlain = runScenario('non-glm-lessons', 'deepseek-probe', lessonsScript(false), 'Merge the candidate lesson, then reply done.', [...LESSONS_ROW, ...dispatchRow(join(runDir, 'non-glm-lessons', 'dispatch.jsonl'))])
const lessonsNotices = step => (step?.messages ?? []).filter(message => message.role === 'user' && message.source === LESSONS_PENDING_SOURCE)
const lessonsFace = step => (step?.tools ?? []).filter(tool => LESSONS_TOOL_NAMES.includes(tool.name))
const lessonsJournalOf = scenario => jsonl(join(runDir, scenario, 'home', 'lessons.jsonl'))

// Failure matching (docs/ORCHESTRATION.md §8.6, M5 design §4.4, assumptions U1
// and U2). The project journal starts with a lesson whose error fragment the
// command below prints, and with one hit from an earlier session. The main
// agent runs the failing command, a command that runs through, and the
// failing one again, then dispatches a child that runs the failing command
// too. The reminder must follow the tool result of the failed call in the next
// request, of the main agent and of the child (the listener is on
// tools/post-execute of the host); a command that ran through and the same
// failure again bring nothing; the main agent's session and the child's are
// recorded as hits, which with the earlier session make three, and the main
// agent is told once that the lesson keeps coming back.
const FAILURE_LESSON = 'L-0f1e2d'
const FAILURE_FRAGMENT = 'probe-failure-fragment-1'
const FAILURE_COMMAND = `[Console]::Error.WriteLine('${FAILURE_FRAGMENT}: simulated failure'); exit 3`
const seedFailureLesson = (scenario) => {
  const home = join(runDir, scenario, 'home')
  mkdirSync(home, { recursive: true })
  const lines = [
    { v: 1, seq: 1, at: hoursAgo(3), actor: 'llm', op: 'new', id: FAILURE_LESSON, reason: 'seed from the probe', evidence: ['docs/HANDOFF.md §6'], data: { situation: { files: [], tools: [], commands: [], errors: [FAILURE_FRAGMENT] }, pitfall: 'The failure probe command fails with probe-failure-fragment-1.', fix: 'Run it again once the cause is fixed.' } },
    { v: 1, seq: 2, at: hoursAgo(2), actor: 'harness', op: 'hit', id: FAILURE_LESSON, by: { session: 'session-seed', tool: 'pwsh' } },
  ]
  writeFileSync(join(home, 'lessons.jsonl'), `${lines.map(line => JSON.stringify(line)).join('\n')}\n`)
}
/** The scripts of the main agent and of its child: on GLM the shell is Bash and the tools that are deferred there go through DeferredToolCall. */
const failureScripts = (glmRoute, ws) => {
  const shell = command => ({ tool: glmRoute ? { name: 'Bash', arguments: { command } } : { name: 'pwsh', arguments: { command, description: 'Run the probe command' } } })
  const call = (name, input) => ({ tool: glmRoute ? { name: 'DeferredToolCall', arguments: { name, input } } : { name, arguments: input } })
  return {
    main: [
      shell(FAILURE_COMMAND),
      shell('Write-Output probe-ran-through'),
      shell(FAILURE_COMMAND),
      call('probe_dispatch', { task: 'T1', prompt: 'Probe task T1: run the failing command and report.', cwd: ws, scope: 'allowed', model: glmRoute ? 'glm-5.3-flash' : 'deepseek-probe' }),
      { tool: { name: glmRoute ? 'Read' : 'read', arguments: { file_path: join(repo, 'package.json') } } },
      { text: 'Waiting for task T1.' },
      { text: 'done', status: true },
    ],
    child: [shell(FAILURE_COMMAND), call('structured_output', HAND_BACK), { text: 'child done' }],
  }
}
const runFailure = (name, model, glmRoute) => {
  seedFailureLesson(name)
  const ws = join(runDir, name, 'ws')
  mkdirSync(join(ws, 'allowed'), { recursive: true })
  const scripts = failureScripts(glmRoute, ws)
  return runScenario(name, model, scripts.main, 'Run the failing command, a command that runs through, the failing one again, dispatch task T1, then reply done.', [...LESSONS_ROW, ...dispatchRow(join(runDir, name, 'dispatch.jsonl'))], repo, [scripts.child])
}
const failureGlm = runFailure('glm-lessons-failure', 'glm-5.3', true)
const failurePlain = runFailure('non-glm-lessons-failure', 'deepseek-probe', false)
// Main agent mode (docs/ORCHESTRATION.md §3.1, ROADMAP M3 step 3): the design
// row ships enabled since the m3 merge (step 12b); the overlay
// (scripts/sandbox.mjs designRows) still mounts ask_user_question, which the
// headless template lacks, and mounts the
// simulated human (scripts/calibrate/simulated-human.mjs), which types
// /wish for the first root session and refuses any question card, recording
// both in human.jsonl. Each scenario works in its own workspace with an empty
// docs/graph. The idle scenarios start with /wish <wish>, typed in
// agent/created: the first request is the turn that wish wakes, the second
// the headless task. The main scenarios type /wish, /wish <wish> and /wish
// off themselves, mid-step, through the commands service (the probe
// provider's `line` step), so command/run and command/done are in the log.
const DESIGN_WISH = '记一下每天花了多少钱'
const designScenario = (name, model, script, { wish, on, others, git, extra, human, persona } = {}) => {
  const dir = join(runDir, name)
  const ws = join(dir, 'ws')
  mkdirSync(join(ws, 'docs', 'graph'), { recursive: true })
  mkdirSync(join(ws, '.llm'), { recursive: true })
  writeFileSync(join(ws, 'README.md'), 'probe workspace\n')
  // A scenario that runs git commands has a repository with README.md committed and then edited by a line, the work a checkout would lose.
  if (git === true) {
    const inWs = (...args) => spawnSync('git', ['-c', 'user.name=probe', '-c', 'user.email=probe@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: ws, encoding: 'utf8' })
    for (const args of [['init', '-q', '-b', 'main'], ['add', 'README.md'], ['commit', '-q', '-m', 'probe workspace']]) if (inWs(...args).status !== 0) throw new Error(`probe: git ${args[0]} failed in ${ws}`)
    writeFileSync(join(ws, 'README.md'), 'probe workspace\nedited by the person\n')
  }
  const record = join(dir, 'human.jsonl')
  const run = runScenario(name, model, script(ws), 'Reply done.', [...designRows({ record: slash(record), ...wish === undefined ? {} : { wish }, ...human }, persona === undefined ? undefined : { persona }), ...extra ?? []], ws, others ?? [], on)
  return { ...run, name, dir, ws, human: jsonl(record) }
}
const designMainScript = ({ read, write, shell, ask, status }) => (ws) => {
  const readme = { name: read, arguments: { file_path: join(ws, 'README.md') } }
  return [
    { tool: { name: write, arguments: { file_path: join(ws, '.llm', 'before.txt'), content: 'before\n' } } },
    { tool: readme, line: '/wish' },
    { tool: readme, ...status },
    { tool: readme, line: `/wish ${DESIGN_WISH}` },
    { tool: readme, line: '/wish off' },
    { tool: { name: write, arguments: { file_path: join(ws, '.llm', 'after.txt'), content: 'after\n' } }, ...status },
    // The main agent again: the tools it has lost and the question card are refused by name (the runtime executes by name), a shell write too; git runs, and the checkout that would lose the person's edit leaves a snapshot and a notice.
    { tool: readme, line: '/wish' },
    { tool: { name: write, arguments: { file_path: join(ws, '.llm', 'denied.txt'), content: 'no\n' } } },
    { tool: { name: shell, arguments: { command: `Set-Content -Path '${join(ws, '.llm', 'denied2.txt')}' -Value no`, description: 'probe: write a file through the shell' } } },
    { tool: { name: shell, arguments: { command: 'git status', description: 'probe: git status' } } },
    { tool: { name: shell, arguments: { command: 'git checkout -- README.md', description: 'probe: git checkout' } } },
    { tool: { name: ask, arguments: { questions: [] } } },
    { text: 'done', line: '/wish off' },
  ]
}
const designIdle = (status) => () => [{ text: 'ok' }, { text: 'done', ...status }]
const designGlmIdle = designScenario('glm-design-wish-idle', 'glm-5.3', designIdle({ status: true }), { wish: DESIGN_WISH })
const designPlainIdle = designScenario('non-glm-design-wish-idle', 'deepseek-probe', designIdle({ command: { name: 'hourness-status' } }), { wish: DESIGN_WISH, on: profiles['probe-hourness'] })
const designGlmMain = designScenario('glm-design-main', 'glm-5.3', designMainScript({ read: 'Read', write: 'Write', shell: 'Bash', ask: 'ask_user_question', status: { status: true } }), { git: true })
const designPlainMain = designScenario('non-glm-design-main', 'deepseek-probe', designMainScript({ read: 'read', write: 'write', shell: 'pwsh', ask: 'ask_user_question', status: { command: { name: 'hourness-status' } } }), { on: profiles['probe-hourness'], git: true })
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
// Stage reminders and design-before-release (docs/ORCHESTRATION.md §3.5, §6.1; M3 step 5).
// The graph of the workspace is seeded before the run. The main agent
// (the simulated human's /wish) dispatches subagents through the dispatch
// spike's probe_dispatch, which starts a real child session through
// subagents.startActivation; each child tries one Write, and the main agent
// waits for it with a shell sleep before it moves on, so the judgment of a
// child's write happens at the focus the scenario means.
const stageWs = name => join(runDir, name, 'ws')
async function stageGraph(name, seeds) {
  const graph = join(stageWs(name), 'docs', 'graph')
  mkdirSync(graph, { recursive: true })
  const engine = openEngine(graph)
  for (const [actor, node] of seeds) {
    const seeded = await engine.apply(actor, { op: 'propose', reason: 'probe seed', node })
    if (!seeded.ok) throw new Error(`probe: seeding the stage graph of ${name} failed: ${JSON.stringify(seeded.error)}`)
  }
  return graph
}
const stageDispatch = (name, task, file) => ({ tool: { name: 'DeferredToolCall', arguments: { name: 'probe_dispatch', input: { task, prompt: `Write ${file}, then reply done.`, cwd: stageWs(name), scope: '.', model: 'glm-5.3' } } } })
const stageWait = { tool: { name: 'Bash', arguments: { command: 'Start-Sleep -Seconds 3', description: 'probe: let the subagent run' } } }
const stageChild = (name, file) => [{ tool: { name: 'Write', arguments: { file_path: join(stageWs(name), file), content: 'x\n' } } }, { text: 'child done' }]
const stageFocus = id => ({ tool: { name: 'graph_focus', arguments: { id } } })
const stageRead = name => ({ tool: { name: 'Read', arguments: { file_path: join(stageWs(name), 'README.md') } } })
const STAGE_BODY = '需求：记一下每天花了多少钱'

// An interview: the goal is the main agent's own proposal. Request 1 has no focus, so the first child's write is refused for want of a goal; the second child is dispatched at stage interview; the main agent's edit of the goal body is answered by the reminder again.
const STAGE = 'glm-design-stage'
const stageGraphPath = await stageGraph(STAGE, [['llm', { type: 'goal', title: '记账小工具', stage: 'interview', body: STAGE_BODY }]])
const stageRev = (await loadGraph(stageGraphPath)).revisions.get('goal-1')
const designStage = designScenario(STAGE, 'glm-5.3', () => [
  stageDispatch(STAGE, 'S1', 'sub-1.txt'),
  stageWait,
  stageFocus('goal-1'),
  stageRead(STAGE),
  stageDispatch(STAGE, 'S2', 'sub-2.txt'),
  stageWait,
  { tool: { name: 'graph_edit', arguments: { id: 'goal-1', rev: stageRev, set: { body: `${STAGE_BODY}\n问题：月底不知道钱花在哪` }, reason: 'probe: the interview answered the problem' } } },
  stageRead(STAGE),
  { text: 'done' },
], { wish: true, extra: dispatchRow(join(runDir, STAGE, 'dispatch.jsonl')), others: [stageChild(STAGE, 'sub-1.txt'), stageChild(STAGE, 'sub-2.txt')] })

// The same goal after a compaction: the reminder is added again, once the checkpoint is in the history.
const STAGE_COMPACT = 'glm-design-stage-compact'
await stageGraph(STAGE_COMPACT, [['llm', { type: 'goal', title: '记账小工具', stage: 'interview', body: STAGE_BODY }]])
const designStageCompact = designScenario(STAGE_COMPACT, 'glm-5.3', () => [
  stageFocus('goal-1'),
  stageRead(STAGE_COMPACT),
  stageRead(STAGE_COMPACT),
  { text: 'done' },
], { wish: true, extra: ['- id: compaction-basic', '  config: { thresholdRatio: 0.02, retainTokens: 0 }'] })

// A released goal split into two modules, one released and one in design: the focus decides which subagent may write.
const STAGE_MODULES = 'glm-design-released'
await stageGraph(STAGE_MODULES, [
  ['human', { type: 'goal', title: '记账小工具', stage: 'release' }],
  ['human', { type: 'feature', id: 'module-a', title: '记一笔', parent: 'goal-1', stage: 'release' }],
  ['human', { type: 'feature', id: 'module-b', title: '月底报表', parent: 'goal-1', stage: 'design' }],
  ['human', { type: 'task', id: 'task-a', title: '写记账命令', parent: 'module-a' }],
  ['human', { type: 'task', id: 'task-b', title: '写报表命令', parent: 'module-b' }],
])
const designReleased = designScenario(STAGE_MODULES, 'glm-5.3', () => [
  stageFocus('goal-1'),
  stageDispatch(STAGE_MODULES, 'R1', 'released-1.txt'),
  stageWait,
  stageFocus('task-b'),
  stageDispatch(STAGE_MODULES, 'R2', 'released-2.txt'),
  stageWait,
  stageFocus('task-a'),
  stageDispatch(STAGE_MODULES, 'R3', 'released-3.txt'),
  stageWait,
  { text: 'done' },
], { wish: true, extra: dispatchRow(join(runDir, STAGE_MODULES, 'dispatch.jsonl')), others: [stageChild(STAGE_MODULES, 'released-1.txt'), stageChild(STAGE_MODULES, 'released-2.txt'), stageChild(STAGE_MODULES, 'released-3.txt')] })

// Putting a matter to the human and recording the answer (docs/ORCHESTRATION.md §3.1, §6.9; M3 step 6). The graph has the human's own goal-1 in interview.
// The main agent focuses it, puts one recommend question with propose_to_human and shows its text, which ends the turn; the simulated human answers once
// (`replies.question`, `maxReplies: 1`, so it is silent afterwards) with a message of the user. The next request records the agreement with the human's
// words, then an invented quote (refused), a question with an option table (refused by the options rule), and a subagent that sends `relay` with an
// edit of the goal's stage (refused by the relay rule; the row says so, and the main agent is told).
const QUESTION = 'glm-design-question'
const QUESTION_EXAMPLE = PLAIN_QUESTION_EXAMPLES.recommend
const QUESTION_SHOWN = renderAsk(QUESTION_EXAMPLE.text, 1)
const QUESTION_ANSWER = '可以，就按推荐的来'
const questionGraphPath = await stageGraph(QUESTION, [['human', { type: 'goal', title: '记账小工具', stage: 'interview', body: STAGE_BODY }]])
const questionRev = (await loadGraph(questionGraphPath)).revisions.get('goal-1')
const questionTable = { type: 'question', title: '放哪', parent: 'goal-1', options: [{ key: 'B', label: '侧栏', gain: '与会话并排', cost: '窄，表格要竖排' }, { key: 'A', label: '网页', gain: '宽，表格放得下', cost: '离开 IDE' }], recommend: 'A', crux: '你常在 IDE 里看图吗？', verdict: '是 → B；否 → A', weight: 'two-way' }
const designQuestion = designScenario(QUESTION, 'glm-5.3', () => [
  stageFocus('goal-1'),
  { tool: { name: 'propose_to_human', arguments: { kind: 'question', form: 'recommend', text: QUESTION_EXAMPLE.text, title: QUESTION_EXAMPLE.title, proposal: QUESTION_EXAMPLE.proposal, reason: QUESTION_EXAMPLE.reason, cost: QUESTION_EXAMPLE.cost } } },
  { text: QUESTION_SHOWN },
  { tool: { name: 'record_human_answer', arguments: { kind: 'question', question: 'question-1', answer: 'agree', words: [QUESTION_ANSWER], recordedAs: QUESTION_EXAMPLE.proposal } } },
  { tool: { name: 'record_human_answer', arguments: { kind: 'question', question: 'question-1', answer: 'agree', words: ['我编的一句话'], recordedAs: '改成收押金' } } },
  { tool: { name: 'graph_propose', arguments: { node: questionTable, reason: 'probe: a table for the human' } } },
  stageDispatch(QUESTION, 'Q1', 'unused.txt'),
  stageWait,
  { text: 'done', status: true, command: { name: 'hourness' } },
], {
  wish: true,
  human: { replies: { question: [QUESTION_ANSWER] }, maxReplies: 1 },
  extra: dispatchRow(join(runDir, QUESTION, 'dispatch.jsonl')),
  others: [[{ tool: { name: 'graph_edit', arguments: { id: 'goal-1', rev: questionRev, set: { stage: 'release' }, reason: 'probe: the child moves the goal on', relay: '可以，放行' } } }, { text: 'child done' }]],
})

// The interview as a conversation, from the first answer to the confirmed requirement (docs/ORCHESTRATION.md §3.1, §6.9; M3 step 8). The simulated human has the
// answers and the replies of the calibration task interview-expense-log (tests/calibration/interview-expense-log/task.json), so that task's setting is run here
// once with a scripted model: the main agent's own goal-1 waits in the interview; the model asks, the human answers one of the nine items of the requirement
// card by rule 4, and the next request writes the answer to the graph (`{rev:goal-1}` is the revision at that moment). The requirement is put to the human
// too early (gate_unmet, nothing shown), then the fork (a recommend question, rule 3) is put and recorded, an edit that sets the stage of the goal to design
// is refused, and once the card is whole the requirement is put (a confirm), the human nods and record_human_answer confirms it: the goal is approved and in
// design, each write with the nod as relay. Last, a second root session of the project, woken by a message of the person, tries to set the goal to release
// with words it made up: the stage rule refuses, and the main agent is told. `maxReplies` is 9: the seven answers, the question and the nod. The answer to
// who uses it (interview step 2b, user graph design 0.4.1 §5.1) is that the goal has no end user, so the requirement put to the human carries that one line
// as its user page, under the question.
const INTERVIEW = 'glm-design-interview'
const INTERVIEW_TASK = JSON.parse(readFileSync(join(repo, 'tests', 'calibration', 'interview-expense-log', 'task.json'), 'utf8')).human
const INTERVIEW_ANSWERS = INTERVIEW_TASK.answers
const INTERVIEW_LINES = { need: `需求：${INTERVIEW_ANSWERS.need}`, problem: `问题：${INTERVIEW_ANSWERS.problem}`, audience: `给谁：${INTERVIEW_ANSWERS.audience}`, flows: `用户流程：无，${INTERVIEW_ANSWERS.flows}`, constraints: `约束：${INTERVIEW_ANSWERS.constraints}` }
const INTERVIEW_QUESTION = { title: '记账的存放方式', text: '我推荐把账存在本机的一个文件里，因为你说数据只放本机，这样可以吗？', proposal: '把账存在本机的一个文件里', reason: '你说数据只放本机' }
const INTERVIEW_NOD = INTERVIEW_TASK.replies.question[0]
const INTERVIEW_CONFIRM = '需求就按上面这样定，可以吗？'
const INTERVIEW_PAGE = `这个目标没有终端用户：${INTERVIEW_ANSWERS.flows}`
const INTERVIEW_SHOWN = `${renderAsk(INTERVIEW_CONFIRM, 1)}\n\n${fenced(INTERVIEW_PAGE)}`
const INTERVIEW_AGREE = INTERVIEW_TASK.replies.confirm[0]
const interviewEdit = set => ({ tool: { name: 'graph_edit', arguments: { id: 'goal-1', rev: '{rev:goal-1}', set, reason: 'probe: the human answered' } } })
const confirmArgs = { kind: 'confirm', goal: 'goal-1', text: INTERVIEW_CONFIRM }
const interviewSteps = [
  ['focus', stageFocus('goal-1')],
  ['ask-need', { text: '你想要什么？' }],
  ['write-need', interviewEdit({ body: INTERVIEW_LINES.need })],
  ['ask-problem', { text: '做成以后，你的日子会有什么不一样？' }],
  ['write-problem', interviewEdit({ body: [INTERVIEW_LINES.need, INTERVIEW_LINES.problem, INTERVIEW_LINES.audience].join('\n') })],
  ['ask-flows', { text: '谁会用它，他们进来先做什么？' }],
  ['write-flows', interviewEdit({ body: [INTERVIEW_LINES.need, INTERVIEW_LINES.problem, INTERVIEW_LINES.audience, INTERVIEW_LINES.flows].join('\n') })],
  ['ask-acceptance', { text: '你会怎么检查它真的做成了？' }],
  ['write-acceptance', interviewEdit({ acceptance: [INTERVIEW_ANSWERS.acceptance] })],
  ['ask-non-goals', { text: '有没有你明确不想要的？' }],
  ['write-non-goals', interviewEdit({ nonGoals: [INTERVIEW_ANSWERS['non-goals']] })],
  ['ask-constraints', { text: '有没有不能改、不能花、不能冒的险？' }],
  ['write-constraints', interviewEdit({ body: Object.values(INTERVIEW_LINES).join('\n') })],
  ['confirm-early', { tool: { name: 'propose_to_human', arguments: confirmArgs } }],
  ['ask-risks', { text: '假如最后没做成，最可能是因为什么？' }],
  ['write-risk', { tool: { name: 'graph_propose', arguments: { node: { type: 'risk', title: '懒得每天记', parent: 'goal-1' }, reason: 'probe: the human answered' } } }],
  ['put-question', { tool: { name: 'propose_to_human', arguments: { kind: 'question', form: 'recommend', ...INTERVIEW_QUESTION } } }],
  ['show-question', { text: renderAsk(INTERVIEW_QUESTION.text, 1) }],
  ['record-question', { tool: { name: 'record_human_answer', arguments: { kind: 'question', question: 'question-1', answer: 'agree', words: [INTERVIEW_NOD], recordedAs: INTERVIEW_QUESTION.proposal } } }],
  ['edit-stage', { tool: { name: 'graph_edit', arguments: { id: 'goal-1', rev: '{rev:goal-1}', set: { stage: 'design' }, reason: 'probe: the model moves the goal on by itself' } } }],
  ['put-requirement', { tool: { name: 'propose_to_human', arguments: confirmArgs } }],
  ['show-requirement', { text: INTERVIEW_SHOWN }],
  ['record-requirement', { tool: { name: 'record_human_answer', arguments: { kind: 'confirm', goal: 'goal-1', answer: 'agree', words: [INTERVIEW_AGREE], recordedAs: '需求按上面这样定' } } }],
  ['wake-other', { tool: { name: 'Read', arguments: { file_path: join(stageWs(INTERVIEW), 'README.md') } }, other: { line: '/wish', say: '把这个目标放行吧' } }],
  ['wait-other', stageWait],
  ['done', { text: 'done', status: true }],
]
const interviewAt = name => interviewSteps.findIndex(([step]) => step === name)
await stageGraph(INTERVIEW, [['llm', { type: 'goal', title: '记账小工具', stage: 'interview' }]])
const interviewOther = [{ tool: { name: 'graph_edit', arguments: { id: 'goal-1', rev: '{rev:goal-1}', set: { stage: 'release' }, reason: 'probe: another session moves the goal on', relay: '可以，放行' } } }, { text: 'other done' }]
const designInterview = designScenario(INTERVIEW, 'glm-5.3', () => interviewSteps.map(([, step]) => step), {
  wish: true,
  human: { ...INTERVIEW_TASK, maxReplies: 9 },
  others: [interviewOther],
})

// The release of a design as a conversation, goal not split into modules (docs/ORCHESTRATION.md §3.1, §4.5, §6.9; M3 step 9). The graph has the human's goal-1 in
// design with one design decision and one task, the main agent's own proposals; the decision has an empty "查过的现成方案：" followed by a line "如果失败：", which is
// not a column, so the release is refused as gate_unmet for the missing column. The model fixes it, puts the release (propose_to_human, kind release) and shows
// the text; the simulated human adds something (replies.release, first sentence); record_human_answer (add) notes it on the goal and moves nothing; the model
// changes the design and puts it again, the person says it can go; record_human_answer (agree) approves what they were shown and releases the goal, each write
// with their words. A subagent dispatched after that writes its file: the goal is released.
const RELEASE = 'glm-design-release'
const RELEASE_TEXT = '照上面的方案放行，可以吗？'
const RELEASE_ADD = '补充：月底的汇总按金额从大到小排'
const RELEASE_GO = '可以，放行'
const RELEASE_BODY = '理由：一个人用，不要服务端\n架构：本地 JSON 文件\n查过的现成方案：ledger-cli 太重'
await stageGraph(RELEASE, [
  ['human', { type: 'goal', title: '记账小工具', stage: 'design', body: STAGE_BODY, acceptance: ['月底能看到按类别的合计'], nonGoals: ['不做手机版'] }],
  ['llm', { type: 'decision', id: 'decision-1', title: '用本地文件存账', parent: 'goal-1', body: '理由：一个人用，不要服务端\n架构：本地 JSON 文件\n查过的现成方案：\n如果失败：文件被改坏', acceptance: ['月底出一张分类表'], nonGoals: ['不做同步'] }],
  ['llm', { type: 'task', id: 'task-1', title: '写记账命令', parent: 'goal-1', acceptance: ['记一条能读回'], edges: [{ type: 'source', to: 'decision-1' }] }],
])
const releaseCall = args => ({ tool: { name: 'propose_to_human', arguments: { kind: 'release', goal: 'goal-1', text: RELEASE_TEXT, ...args } } })
const recordRelease = args => ({ tool: { name: 'record_human_answer', arguments: { kind: 'release', goal: 'goal-1', ...args } } })
const releaseShown = renderAsk(RELEASE_TEXT, 1)
const designRelease = designScenario(RELEASE, 'glm-5.3', () => [
  stageFocus('goal-1'),
  releaseCall({}),
  { tool: { name: 'graph_edit', arguments: { id: 'decision-1', rev: '{rev:decision-1}', set: { body: `${RELEASE_BODY}\n如果失败：文件被改坏` }, reason: 'probe: the column is filled' } } },
  releaseCall({}),
  { text: releaseShown },
  recordRelease({ answer: 'add', words: [RELEASE_ADD], recordedAs: '汇总按金额从大到小排' }),
  { tool: { name: 'graph_edit', arguments: { id: 'task-1', rev: '{rev:task-1}', set: { acceptance: ['记一条能读回', '汇总按金额从大到小排'] }, reason: 'probe: the supplement is in the plan' } } },
  releaseCall({}),
  { text: releaseShown },
  recordRelease({ answer: 'agree', words: [RELEASE_GO], recordedAs: '照这个方案放行' }),
  stageDispatch(RELEASE, 'D1', 'released.txt'),
  stageWait,
  { text: 'done', status: true },
], {
  wish: true,
  human: { replies: { release: [RELEASE_ADD, RELEASE_GO] }, maxReplies: 2 },
  extra: dispatchRow(join(runDir, RELEASE, 'dispatch.jsonl')),
  others: [stageChild(RELEASE, 'released.txt')],
})

// The two-level release of a goal split into modules (docs/ORCHESTRATION.md §4.9; M3 step 9). The graph has the human's goal-1 in design with the framework decision,
// the list of directions and two module candidates with the design of each below it, all the main agent's proposals. Nothing under a module is built before
// its release: a subagent's write is refused while the goal is in design and while the module is. The framework is released with a page (the first page
// lacks a module, which is refused), the candidates become modules in design; module-a is released with a page, after the person adds something to it; a write
// for module-a runs, one for module-b is refused with the module named. The words of the person are not taken for a release that was not put to them; the main
// agent sends module-a back to design on its own word, a subagent that does the same is refused and the main agent is told.
const MODULES = 'glm-design-modules'
const MODULES_NAMES = { framework: '用本地文件存账', a: '记账', b: '月底汇总', directions: ['数据只存在本机', '先记账再汇总'] }
const MODULES_PAGE = `框架：${MODULES_NAMES.framework}。\n模块：${MODULES_NAMES.a}、${MODULES_NAMES.b}。\n你定过的方向：${MODULES_NAMES.directions.join('；')}。`
const MODULES_PAGE_A = `你会看到什么：${MODULES_NAMES.a}这一块做完以后的样子。\n它自己会做的：照图上的任务做。\n什么时候问你：碰到要你定的事。\n替你定了的方向：${MODULES_NAMES.directions[0]}。`
const MODULES_PAGE_B = `你会看到什么：${MODULES_NAMES.b}这一块做完以后的样子。\n它自己会做的：照图上的任务做。\n什么时候问你：碰到要你定的事。\n替你定了的方向：${MODULES_NAMES.directions[1]}。`
const MODULES_ADD = '补充：先做记录再做汇总'
const MODULES_FIVE = { body: '理由：一个人用，不要服务端\n架构：本地 JSON 文件\n查过的现成方案：ledger-cli 太重', acceptance: ['月底出一张分类表'], nonGoals: ['不做同步'] }
await stageGraph(MODULES, [
  ['human', { type: 'goal', title: '记账小工具', stage: 'design', body: STAGE_BODY, acceptance: ['月底能看到按类别的合计'], nonGoals: ['不做手机版'] }],
  ['llm', { type: 'decision', id: 'decision-fw', title: MODULES_NAMES.framework, parent: 'goal-1', ...MODULES_FIVE }],
  ['llm', { type: 'norm', id: 'norm-directions', title: '方向清单', parent: 'goal-1', acceptance: MODULES_NAMES.directions }],
  ...[['a', MODULES_NAMES.a], ['b', MODULES_NAMES.b]].flatMap(([key, title]) => [
    ['llm', { type: 'feature', id: `module-${key}`, title, parent: 'goal-1', edges: [{ type: 'source', to: 'decision-fw' }] }],
    ['llm', { type: 'decision', id: `decision-${key}`, title: `${title}怎么做`, parent: `module-${key}`, ...MODULES_FIVE }],
    ['llm', { type: 'task', id: `task-${key}`, title: `写${title}`, parent: `module-${key}`, acceptance: ['能用'], edges: [{ type: 'source', to: `decision-${key}` }] }],
  ]),
])
const modulesSteps = [
  ['focus-a', stageFocus('task-a')],
  ['dispatch-1', stageDispatch(MODULES, 'M1', 'modules-1.txt')],
  ['wait-1', stageWait],
  ['page-short', releaseCall({ page: MODULES_PAGE.replace(MODULES_NAMES.b, '') })],
  ['put-framework', releaseCall({ page: MODULES_PAGE })],
  ['show-framework', { text: renderAsk(RELEASE_TEXT, 1, undefined, MODULES_PAGE, false) }],
  ['record-framework', recordRelease({ answer: 'agree', words: [RELEASE_GO], recordedAs: '框架、模块和方向放行' })],
  ['dispatch-2', stageDispatch(MODULES, 'M2', 'modules-2.txt')],
  ['wait-2', stageWait],
  ['put-a', releaseCall({ module: 'module-a', page: MODULES_PAGE_A })],
  ['show-a', { text: renderAsk(RELEASE_TEXT, 1, undefined, MODULES_PAGE_A, false) }],
  ['record-a-add', recordRelease({ module: 'module-a', answer: 'add', words: [MODULES_ADD], recordedAs: '先记录后汇总' })],
  ['revise-a', { tool: { name: 'graph_edit', arguments: { id: 'task-a', rev: '{rev:task-a}', set: { acceptance: ['能用', '先记录后汇总'] }, reason: 'probe: the supplement is in the plan' } } }],
  ['put-a-again', releaseCall({ module: 'module-a', page: MODULES_PAGE_A })],
  ['show-a-again', { text: renderAsk(RELEASE_TEXT, 1, undefined, MODULES_PAGE_A, false) }],
  ['record-a', recordRelease({ module: 'module-a', answer: 'agree', words: ['可以，放行这个模块'], recordedAs: '放行记账' })],
  ['dispatch-3', stageDispatch(MODULES, 'M3', 'modules-3.txt')],
  ['wait-3', stageWait],
  ['focus-b', stageFocus('task-b')],
  ['dispatch-4', stageDispatch(MODULES, 'M4', 'modules-4.txt')],
  ['wait-4', stageWait],
  ['record-b-unshown', recordRelease({ module: 'module-b', answer: 'agree', words: ['可以，放行这个模块'], recordedAs: '放行月底汇总' })],
  ['put-b', releaseCall({ module: 'module-b', page: MODULES_PAGE_B })],
  ['record-b-invented', recordRelease({ module: 'module-b', answer: 'agree', words: ['我编的一句话'], recordedAs: '放行月底汇总' })],
  ['record-b-borrowed', recordRelease({ module: 'module-b', answer: 'agree', words: ['可以，放行这个模块'], recordedAs: '放行月底汇总' })],
  ['dispatch-5', stageDispatch(MODULES, 'M5', 'unused.txt')],
  ['wait-5', stageWait],
  ['send-back', { tool: { name: 'graph_edit', arguments: { id: 'module-a', rev: '{rev:module-a}', set: { stage: 'design' }, reason: 'probe: the direction of the module has to change' } } }],
  ['done', { text: 'done', status: true }],
]
const modulesAt = name => modulesSteps.findIndex(([step]) => step === name)
const modulesChild = [{ tool: { name: 'graph_edit', arguments: { id: 'module-a', rev: '{rev:module-a}', set: { stage: 'design' }, reason: 'probe: the child sends the module back' } } }, { text: 'child done' }]
const designModules = designScenario(MODULES, 'glm-5.3', () => modulesSteps.map(([, step]) => step), {
  wish: true,
  human: { replies: { release: [RELEASE_GO], module: [MODULES_ADD, '可以，放行这个模块'] }, maxReplies: 3 },
  extra: dispatchRow(join(runDir, MODULES, 'dispatch.jsonl')),
  others: [stageChild(MODULES, 'modules-1.txt'), stageChild(MODULES, 'modules-2.txt'), stageChild(MODULES, 'modules-3.txt'), stageChild(MODULES, 'modules-4.txt'), modulesChild],
})
// The person's persona for the main agent (docs/ORCHESTRATION.md §3.1; task m3-main-persona): the overlay gives the design row a persona with a mark in
// its text. On the GLM route the main agent's system prompt opens its identity with the sentence of an active output style and carries the persona in
// front of the context management section; the subagent the main agent dispatches (a real child session, as in glm-dispatch) has neither. On another
// route the section is there and the DSH identity is untouched. Neither scenario seeds a graph: nothing here depends on one.
const PERSONA = 'glm-design-persona'
const PERSONA_PLAIN = 'non-glm-design-persona'
const PERSONA_SETTING = { name: 'PM', text: 'End every reply to the human with 「（PM-MARK）」.' }
const designPersona = designScenario(PERSONA, 'glm-5.3', () => [
  { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_dispatch', input: { task: 'P1', prompt: 'Reply done.', cwd: stageWs(PERSONA), scope: '.', model: 'glm-5.3' } } } },
  stageWait,
  { text: 'done', status: true },
], { wish: true, persona: PERSONA_SETTING, extra: dispatchRow(join(runDir, PERSONA, 'dispatch.jsonl')), others: [[{ text: 'child done' }]] })
const designPersonaPlain = designScenario(PERSONA_PLAIN, 'deepseek-probe', () => [{ text: 'done', command: { name: 'hourness-status' } }], { wish: true, persona: PERSONA_SETTING, on: profiles['probe-hourness'] })
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
// The transcript scenario: the first checkpoint, the path its sentence names, the exported file, and the tool result of the scripted Read of it.
const TRANSCRIPT_MARK = 'read the full transcript at: '
const checkpointsOf = scenario => scenario.steps.flatMap(step => step.messages.filter(message => message.source === 'compact-checkpoint'))
const transcriptCheckpoint = checkpointsOf(compactTranscript)[0]
const transcriptPath = transcriptCheckpoint?.text.includes(TRANSCRIPT_MARK) === true ? transcriptCheckpoint.text.slice(transcriptCheckpoint.text.lastIndexOf(TRANSCRIPT_MARK) + TRANSCRIPT_MARK.length).split('\n')[0] : undefined
const transcriptSession = compactTranscript.steps[0]?.sessionId
const transcriptText = transcriptPath !== undefined && existsSync(transcriptPath) ? readFileSync(transcriptPath, 'utf8') : ''
const transcriptLines = transcriptText.split('\n')
const transcriptLong = transcriptLines.filter(line => Array.from(line).length > 1000)
const transcriptSplit = transcriptLines.some(line => Array.from(line).length === 1000 && line.includes('"test:1"'))
const transcriptRead = [...compactTranscript.steps, ...compactTranscript.compactions].flatMap(request => request.messages).find(message => message.role === 'tool' && message.text.includes('Transcript of session'))
// The fake credentials of the task text reach the session's first request; the export carries neither, reads them as [redacted] and counts its replacements in the header.
const transcriptFakesAsked = compactTranscript.steps[0]?.messages.some(message => message.role === 'user' && TRANSCRIPT_FAKES.every(fake => message.text.includes(fake))) === true
const transcriptFakesLeft = TRANSCRIPT_FAKES.filter(fake => transcriptText.includes(fake)).length
const transcriptReplaced = transcriptLines.slice(0, 5).map(line => /Replaced in this export: (\d+)\.$/.exec(line)?.[1]).find(count => count !== undefined)

// The memory row journals one usage record per model call from the
// llm/stream request fields (rc.3 GenerateOptions: provider, model,
// sessionId, purpose) into the user-level directory the data row provides
// (<DSH home>/glm-hourness, the scenario's dsh-home); the guard journals
// each denial into the project directory it reads from the data service.
const usageOf = scenario => jsonl(join(runDir, scenario, 'dsh-home', 'glm-hourness', 'audit', 'usage.jsonl'))
const glmUsage = usageOf('glm').filter(record => record.purpose === undefined)
const compactUsage = usageOf('glm-compact').filter(record => record.purpose === 'compaction')
const projectUsage = ['glm', 'glm-flash', 'glm-todo', 'glm-compact', 'glm-shadow', 'glm-guard-paths', 'non-glm', 'non-glm-guard', 'glm-no-dialect', 'glm-peak', 'limits-steps', 'limits-time', 'glm-dispatch', 'glm-goal', 'goal-headless', 'glm-only', 'hourness-only', 'client-modules', 'glm-memory', 'non-glm-memory', 'glm-memory-compact', 'glm-worker-memory', 'glm-memory-depth', 'glm-memory-habit', 'glm-lessons', 'non-glm-lessons', 'glm-lessons-failure', 'non-glm-lessons-failure'].filter(scenario => existsSync(join(runDir, scenario, 'home', 'audit', 'usage.jsonl')))
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
const followupViolations = jsonl(join(followupDir, 'home', 'audit', 'violations.jsonl'))
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
// The rules page's data (docs/ORCHESTRATION.md §16.14): the view.json a step recorded, read with the parser the panel uses.
const pageOfStep = step => (typeof step?.rulesView === 'string' ? parseRulesView(step.rulesView) : undefined)
const glmRulesPage = pageOfStep(glmRules.steps[3])
const nonGlmRulesPage = pageOfStep(nonGlmRules.steps[4])
const peakStopPage = pageOfStep(rulesPeak.steps[3])
const hournessOnlyPage = pageOfStep(rulesPeakAlone.steps[1])
const pageCode = (page, id) => page?.code.find(entry => entry.id === id)
const pageItem = (page, id) => page?.items.find(item => item.id === id)
const pageLook = page => (page === undefined ? 'no view.json, or not a view' : `items ${page.items.map(item => item.id).join(', ')}; peak ${JSON.stringify(page.peak).slice(0, 120)}`)
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
// rules-queue and rules-peak: what the board tells a model, at the wall clock of this machine (the model-facing lines write HH:MM in it).
const localHm = iso => new Date(iso).toLocaleString('sv-SE').slice(11, 16)
const PEAK_END_HM = localHm(PEAK_END)
const QUEUE_REFUSAL = new RegExp(String.raw`^Error: You tried to run "Write-Output rules-probe-queued"\.\nBoundary: Deferred as ticket q-1\. Rule r-probe-queue "Probe word, deferred" \(set by the human at [^)]+, until lifted\) defers it while glm-peak is true until ${PEAK_END_HM}\.\nRight path: The call did not run\. Continue with other planned work; the harness sends you a message when q-1 clears, then run the same call again\. Running it again before that returns this message and does not queue it twice\.\nException: The human can let it through once \(\/rules let q-1\), or change the rule\.$`)
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
const loopsRanNothing = ['runner.lock', 'handover.json', 'events.jsonl', 'state.json'].filter(name => existsSync(join(loopsRuntime, name)))
const LOOPS_DENIAL = new RegExp(`^Error: You tried to write "[^"]+"\\.\\nBoundary: Rule loops:files-only blocks writes under the loop board's files [^\\n]+\\nRight path: .+\\nException: `)
const peakTexts = boardTexts(rulesPeak.steps[1])
const peakShown = lastToolResult(rulesPeak.steps[3])
const REDUCE_LINE = `<system-reminder>\nGLM peak: now until ${PEAK_END_HM}. Peak mode: reduce (the default; the human can change it). Run at most 1 GLM subagent at a time until ${PEAK_END_HM}. Move optional work that spends many GLM credits (calibration runs, ablations, large reviews) to after ${PEAK_END_HM}, including work you dispatch; keep necessary work going.\n</system-reminder>`
const STOP_LINE_START = `<system-reminder>\nGLM peak: now until ${PEAK_END_HM}. Peak mode set by the human: stop. `
const peakSentences = PEAK_REMINDER_TEXT.split(/(?<=[.:])\s+/).filter(sentence => sentence.length > 20)
// rules-peak at the factory level, 15:00, the main agent's request after /wish: the GLM package's reminder and the board's, read together (M6 design §1.4 item 13, S3).
const reduceRequest = rulesPeak.steps[1]
const reduceReminders = peakNotices(reduceRequest)
const reduceBoard = boardTexts(reduceRequest)
// rules-peak-wake: the refusal, the reminder before 18:00, the wake after it, and the ticket the board kept.
const wakeRefusal = lastToolResult(rulesPeakWake.steps[2])
const wakeTicketItem = boardTexts(rulesPeakWake.steps[2]).find(text => text.includes('q-1 pwsh "npm run calibrate" (deferred since '))
const PEAK_WAKE_TEXT = `[rules board] Ticket q-1 cleared: glm-peak ended at ${PEAK_END_HM}. You may run the deferred call again: pwsh "npm run calibrate".`
const peakWakeTicket = readStateOf(wakeProject)?.tickets?.['q-1']
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

// Quota and requests (docs/ORCHESTRATION.md §11.3, M6 acceptance 18 and 19).
// The glm-login home of every scenario holds no credential, so the quota
// reader has nothing to send: the net logs (scripts/probe/probe-net.mjs)
// show no request to /api/monitor, /glm-status and /hourness say not logged
// in, and no model request carries the quota section.
const netLog = name => jsonl(netLogOf(name))
const isCanary = entry => entry.origin === CANARY.origin && entry.path === CANARY.path
const scenariosWithoutCanary = scenarioNames.filter(name => !netLog(name).some(isCanary))
const recordedRequests = scenarioNames.reduce((count, name) => count + netLog(name).length, 0)
const monitorRequests = scenarioNames.flatMap(name => netLog(name).filter(entry => entry.path.startsWith('/api/monitor')).map(entry => `${name}: ${entry.origin}${entry.path}`))
const NOT_LOGGED_IN_LINE = '额度：未登录 GLM（/glm-login）'
const PEAK_LINE = /^高峰：(高峰中(，到 .+)?|不是高峰(；下一个高峰 .+)?)（GLM 积分套餐）$/
const PEAK_LINE_ANYWHERE = /^(- )?高峰：/m
/** What `quotaLines` starts its lines with (src/shared/quota.ts): the quota section's text in a request body. */
const QUOTA_TEXT_MARKERS = ['额度：', '额度（服务端读数', '额度已用完（服务端']
const LOOP_ENTRY_IDS = GLM_LOOP_DEFAULTS.map(entry => entry.id)
/** The non-empty lines under `## <heading>` of a report, up to the next heading. */
const sectionOf = (text, heading) => (text.split(`\n## ${heading}\n`)[1] ?? '').split('\n## ')[0].split('\n').filter(line => line.length > 0)
// /glm-status: credential line, then the peak line and quota section, then the health table.
const [glmOnlyCredential = '', glmOnlyQuota = '', glmOnlyTable = ''] = (statusStep(glmOnly)?.status ?? '').split('\n\n')
const hournessOnlyText = hournessOnlyReport?.text ?? ''
const glmQuotaSection = sectionOf(glmHourness?.text ?? '', '额度')
// The status hub in the real runtime (status hub design 0.3 §11 L3): what the
// collector read for the glm session right after its /hourness ran, at the
// agent and the all audience (the provider's `hub` step).
const glmHub = statusStep(glm)?.hub
const glmHubItem = id => glmHub?.agent?.items.find(item => item.id === id)
const glmHubLines = item => item === undefined ? undefined : [item.text, ...(item.detail ?? [])]
const glmHubPanel = sectionOf(glmHourness?.text ?? '', '面板')
const glmHubUsage = glmHubLines(glmHubItem('glm/usage'))
const glmHubQuota = glmHubLines(glmHubItem('glm/quota'))
const glmHubPeak = glmHubItem('rules/peak')
const glmHubMetrics = sectionOf(glmHourness?.text ?? '', '指标（流水，今天）')
// The fact groups /hourness's metrics section prints, as FACT_GROUP_TITLES in
// src/workflow/morning-report.ts lists them (§7.3 of the metrics design: no
// scores, no burden numbers, no coverage group in the conversation).
const HOURNESS_FACT_HEADINGS = ['### 任务', '### 拦截', '### 撤下', '### 超时', '### 额度停住', '### 汇报']
const quotaTextBodies = scenarioNames.flatMap(name => jsonl(join(runDir, name, 'requests.jsonl')).map(request => ({ name, body: JSON.stringify({ system: request.system, tools: request.tools, messages: request.messages }) })))
const quotaTextHits = quotaTextBodies.filter(({ body }) => QUOTA_TEXT_MARKERS.some(marker => body.includes(marker))).map(({ name }) => name)
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
/** The refs under refs/hourness/snapshots/ of a scenario's workspace, and the README.md the first of them holds in its stash. */
function snapshotsOf(scenario) {
  const listed = spawnSync('git', ['for-each-ref', '--format=%(refname)', 'refs/hourness/snapshots'], { cwd: scenario.ws, encoding: 'utf8' })
  return listed.stdout.split('\n').filter(line => line !== '')
}
const lfOf = text => (text ?? '').replaceAll('\r\n', '\n')
function snapshotEditOf(scenario) {
  const line = jsonl(join(scenario.ws, '.llm', 'snapshots.jsonl')).at(0)
  return line?.stash === undefined ? undefined : spawnSync('git', ['show', `${line.stash}:README.md`], { cwd: scenario.ws, encoding: 'utf8' }).stdout
}
/** The stage reminders in a request, as the dump keeps them: the facts and the text. */
const stageNotices = step => messagesOf(step, 'glm-design-stage')
/** What the dispatched children of a scenario did: the child ids in dispatch order and each one's Write result (the second request of the child). */
function stageChildren(name, scenario) {
  const ids = dispatchRecord(name).filter(entry => entry.kind === 'started').map(entry => entry.childId)
  return ids.map(id => ({ id, result: lastToolResult(bySession(scenario, id)[1]) }))
}
function stageChecks() {
  const requests = designStage.steps.filter(step => step.sessionId === designStage.steps[0]?.sessionId)
  const counts = requests.map(step => stageNotices(step).length)
  const facts = (step, index) => stageNotices(step)[index]?.designStage
  const children = stageChildren(STAGE, designStage)
  const ws = stageWs(STAGE)
  const violations = jsonl(join(runDir, STAGE, 'home', 'audit', 'violations.jsonl')).filter(record => record.rule === 'design-before-release')
  const stageQuiet = scenario => !stderrOf(scenario).includes('dsh-glm-hourness/design')
  const compacted = designStageCompact.steps.filter(step => step.sessionId === designStageCompact.steps[0]?.sessionId)
  const after = compacted.flatMap((step) => {
    const at = step.messages.findLastIndex(message => message.source === 'compact-checkpoint')
    return at < 0 ? [] : [stageNotices({ messages: step.messages.slice(at + 1) }).map(message => message.designStage.reason)]
  })
  const released = designReleased.steps.filter(step => step.sessionId === designReleased.steps[0]?.sessionId)
  const releasedChildren = stageChildren(STAGE_MODULES, designReleased)
  const releasedViolations = jsonl(join(runDir, STAGE_MODULES, 'home', 'audit', 'violations.jsonl')).filter(record => record.rule === 'design-before-release')
  const lastNotice = step => stageNotices(step).at(-1)
  const wsFile = (name, file) => existsSync(join(stageWs(name), file))
  return [
    ['design stage: the first request carries the reminder for no goal in focus (no goal, stage none, reason goal) and tells the main agent to propose the goal and focus it', requests.length === 9 && counts[0] === 1 && facts(requests[0], 0)?.goal === '' && facts(requests[0], 0).stage === 'none' && facts(requests[0], 0).reason === 'goal' && stageNotices(requests[0])[0].text.includes('no goal is in your focus yet') && stageNotices(requests[0])[0].text.includes('graph_focus'), `${requests.length} requests; counts ${counts.join(',')}; ${JSON.stringify(facts(requests[0], 0) ?? null)}`],
    ['design stage: a reminder that has not changed is not repeated: one notice in requests 1 to 3, one more at request 4 (graph_focus), none at 5 to 7, one more at request 8 (the edit)', isDeepStrictEqual(counts, [1, 1, 1, 2, 2, 2, 2, 3, 3]), counts.join(',')],
    ['design stage: after graph_focus the reminder is about goal-1 at stage interview (reason goal), counts the requirement card, and asks the next question in the human\'s words', facts(requests[3], 1)?.goal === 'goal-1' && facts(requests[3], 1).stage === 'interview' && facts(requests[3], 1).reason === 'goal' && stageNotices(requests[3])[1].text.includes('Requirement card: 1 of 9 filled.') && stageNotices(requests[3])[1].text.includes('Next: ask 「做成以后，你的日子会有什么不一样」, then ') && stageNotices(requests[3])[1].text.includes('Interview the human in plain chat'), JSON.stringify(facts(requests[3], 1) ?? null)],
    ['design stage: the main agent\'s edit of the goal body gets the reminder again (reason changed) with the card one item fuller, and no banned question tool is named in any reminder', facts(requests[7], 2)?.reason === 'changed' && stageNotices(requests[7])[2].text.includes('Requirement card: 2 of 9 filled.') && requests.every(step => stageNotices(step).every(message => !['ask_user_question', 'decision_card', 'design_review', 'ask_human'].some(word => message.text.includes(word)))), JSON.stringify(facts(requests[7], 2) ?? null)],
    ['design-before-release: the first subagent (no goal in focus) is refused, with the main agent\'s four-part correction; the second (goal at stage interview) too; neither file exists', children.length === 2 && children.every(child => child.result?.isError === true) && children[0].result.text.includes('has no open goal in focus') && children[1].result.text.includes('at stage interview (goal goal-1): nothing is built before the human releases the design.') && children.every(child => child.result.text.includes('Exception: If a write is needed to answer a design question (a spike)')) && !existsSync(join(ws, 'sub-1.txt')) && !existsSync(join(ws, 'sub-2.txt')), children.map(child => `${child.result?.isError}:${(child.result?.text ?? '').slice(0, 60)}`).join(' | ')],
    ['design-before-release: both refusals are in the violation journal under the rule, by the children', violations.length === 2 && violations.every(record => children.some(child => child.id === record.agentId)), JSON.stringify(violations.map(record => [record.rule, record.agentId]))],
    ['design stage: the row activated quietly and no question card was raised', designStage.status === 0 && stageQuiet(designStage.name) && designStage.human.every(entry => entry.kind !== 'unexpected-question'), `exit ${designStage.status}; ${quiet(designStage.name)}`],
    ['design stage (compact): after a compaction the first request with the checkpoint carries the reminder again, reason compaction', after.length > 0 && after.some(reasons => reasons.includes('compaction')) && designStageCompact.status === 0, `${designStageCompact.compactions.length} compaction(s); after checkpoints: ${JSON.stringify(after)}`],
    ['design released: the goal level of a released goal split into modules lists both modules, one released and one in design; the module in design is described in its own reminder, the released one says so', stageNotices(released[1])[1]?.text.includes('The framework, the module list and the directions are released.') === true && stageNotices(released[1])[1].text.includes('- 记一笔（module-a）：已放行') && stageNotices(released[1])[1].text.includes('- 月底报表（module-b）：设计中') && lastNotice(released[4])?.text.includes('module module-b "月底报表", which is in design') === true && lastNotice(released[7])?.text.includes('This module is released.') === true, released.map(step => stageNotices(step).length).join(',')],
    ['design-before-release: at the goal level of the released goal the first child writes; at a task of the module in design the second is refused with the module named; at a task of the released module the third writes', releasedChildren.length === 3 && releasedChildren[0].result?.isError !== true && wsFile(STAGE_MODULES, 'released-1.txt') && releasedChildren[1].result?.isError === true && releasedChildren[1].result.text.includes('module module-b (月底报表) of goal goal-1, and the human has not released that module yet') && releasedChildren[1].result.text.includes('(kind release, module module-b)') && !wsFile(STAGE_MODULES, 'released-2.txt') && releasedChildren[2].result?.isError !== true && wsFile(STAGE_MODULES, 'released-3.txt') && releasedViolations.length === 1, releasedChildren.map(child => `${child.result?.isError}:${(child.result?.text ?? '').slice(0, 50)}`).join(' | ')],
  ]
}
function questionChecks() {
  const main = designQuestion.steps.filter(step => step.sessionId === designQuestion.steps[0]?.sessionId)
  const nodeOf = id => JSON.parse(readFileSync(join(stageWs(QUESTION), 'docs', 'graph', 'nodes', `${id}.json`), 'utf8'))
  const shownResult = (() => { try { return JSON.parse(lastToolResult(main[2])?.text ?? '') } catch { return undefined } })()
  const decided = (() => { try { return JSON.parse(lastToolResult(main[4])?.text ?? '') } catch { return undefined } })()
  const question = nodeOf('question-1')
  const violations = jsonl(join(runDir, QUESTION, 'home', 'audit', 'violations.jsonl'))
  const replies = designQuestion.human.filter(entry => entry.kind === 'reply')
  const childId = dispatchRecord(QUESTION).find(entry => entry.kind === 'started')?.childId
  const childResult = childId === undefined ? undefined : lastToolResult(bySession(designQuestion, childId)[1])
  const rowOf = step => tableOf(step?.status ?? '').design
  const description = main[0]?.tools.find(tool => tool.name === 'propose_to_human')?.description ?? ''
  const userMessages = messagesOf(main[3], 'user')
  const decide = question.history.at(-1)
  const asked = question.history.find(entry => entry.op === 'propose')
  const report = main[8]?.command
  const asks = report?.text.split('## 等你定的事\n')[1]?.split('\n\n')[0] ?? ''
  return [
    ['design question: the main agent\'s first request has propose_to_human with the shapes of a question and the worked examples in full (recommend, choose, want, look, the plain-words list at the end), and record_human_answer', main.length === 9 && ['recommend:', 'choose:', 'want:', 'look:', 'made-up matters'].every(part => description.includes(part)) && description.endsWith('say what the document is.') && faceOf(main[0]).includes('record_human_answer'), `${main.length} requests; description ${description.length} chars`],
    ['design question: propose_to_human returns text word for word as renderAsk lays out the example, and question-1 waits for the human as a recommend proposal whose question is the text up to its question mark', shownResult?.text === QUESTION_SHOWN && shownResult.question === 'question-1' && shownResult.number === 1 && shownResult.form === 'recommend' && question.status === 'done' && question.form === 'recommend' && question.ask === askOf(QUESTION_EXAMPLE.text) && question.proposal === QUESTION_EXAMPLE.proposal && question.reason === QUESTION_EXAMPLE.reason && asked?.to === 'approved' && asked.reason.startsWith('主 Agent 在对话里把这件事交给人（propose_to_human '), JSON.stringify(shownResult ?? null).slice(0, 200)],
    ['design question: the turn ended with the text, the simulated human replied once by rule 3 (a recommend question, number 1), and the next request carries the reply as a message of the user', replies.length === 1 && replies[0].rule === 3 && replies[0].text === QUESTION_ANSWER && isDeepStrictEqual(replies[0].shown, [{ kind: 'question', number: 1, form: 'recommend' }]) && userMessages.some(message => message.text.includes(QUESTION_ANSWER)), JSON.stringify(replies)],
    ['design question: record_human_answer with the human\'s words decides the question: the outcome is decided, the conclusion is what the main agent recorded and the decision carries the words as relay and the mark of the agreement', decided?.outcome === 'decided' && decide?.op === 'decide' && decide.relay === QUESTION_ANSWER && decide.conclusion === QUESTION_EXAMPLE.proposal && decide.reason.startsWith('人在对话里同意（record_human_answer ') && question.conclusion === QUESTION_EXAMPLE.proposal, JSON.stringify(decided ?? null)],
    ['design question: an invented quote is refused as invalid on words and the question stays as it was', lastToolResult(main[5])?.isError === true && lastToolResult(main[5]).text.includes('"field":"words"') && question.history.length === 2 && question.conclusion === QUESTION_EXAMPLE.proposal, (lastToolResult(main[5])?.text ?? '').slice(0, 160)],
    ['design question: a question with an option table proposed through graph_propose is refused by main-agent-graph-options with the right path, and no such question is on the graph', lastToolResult(main[6])?.isError === true && lastToolResult(main[6]).text.includes('You tried to put an option table for the human on the graph for "放哪".') && lastToolResult(main[6]).text.includes('Put the matter with propose_to_human') && !existsSync(join(stageWs(QUESTION), 'docs', 'graph', 'nodes', 'question-2.json')) && violations.some(record => record.rule === 'main-agent-graph-options'), (lastToolResult(main[6])?.text ?? '').slice(0, 160)],
    ['design question: a subagent that sends relay with an edit of the goal is refused by main-agent-graph-relay, the goal does not move, the violation names the subagent session, the main agent gets the glm-design-bypass notice, and the design row says it is partly in effect', childResult?.isError === true && childResult.text.includes('Subagents do not relay the human\'s words.') && nodeOf('goal-1').stage === 'interview' && violations.some(record => record.rule === 'main-agent-graph-relay' && record.agentId === childId && record.session?.kind === 'subagent') && messagesOf(main[8], 'glm-design-bypass').length === 1 && rowOf(main[8])?.status === '部分生效', `${childResult?.isError}:${(childResult?.text ?? '').slice(0, 80)}; notices ${messagesOf(main[8], 'glm-design-bypass').length}; ${JSON.stringify(rowOf(main[8]) ?? null)}`],
    ['design question: /hourness at the last step reads the graph of the session through the graph row: nothing waits for the person, the one decision of the day is the person\'s in the chat, and the report has no grading', report?.kind === 'success' && asks.startsWith('- 等你定的 0 件\n- agent 自己要定的 0 件\n- 本期拍板 1 次：你 0 · 你在对话里说 1 · agent 0\n') && /^- 派遣类调用 \d+ 次$/m.test(asks) && !/L[123]/.test(report.text), `${report?.kind ?? 'not run'}; ${JSON.stringify(asks)}`],
    ['design question: the run ended with exit 0, the simulated human said nothing more, no question card was raised, and the row printed nothing to stderr', designQuestion.status === 0 && designQuestion.human.filter(entry => entry.kind === 'silent').length >= 1 && designQuestion.human.every(entry => entry.kind !== 'unexpected-question') && !stderrOf(QUESTION).includes('dsh-glm-hourness/design'), `exit ${designQuestion.status}; ${JSON.stringify(designQuestion.human.map(entry => entry.kind))}`],
  ]
}

function interviewChecks() {
  const main = designInterview.steps.filter(step => step.sessionId === designInterview.steps[0]?.sessionId)
  const otherId = designInterview.steps.find(step => step.sessionId !== main[0]?.sessionId)?.sessionId
  const second = otherId === undefined ? [] : bySession(designInterview, otherId)
  // A node the run did not write reads as an empty one, so the checks fail one by one instead of the whole probe stopping.
  const nodeOf = (id) => {
    try {
      return JSON.parse(readFileSync(join(stageWs(INTERVIEW), 'docs', 'graph', 'nodes', `${id}.json`), 'utf8'))
    }
    catch {
      return { history: [] }
    }
  }
  // The result of the tool call a scripted step made is in the next request.
  const resultOf = name => lastToolResult(main[interviewAt(name) + 1])
  const jsonOf = name => { try { return JSON.parse(resultOf(name)?.text ?? '') } catch { return undefined } }
  const goal = nodeOf('goal-1')
  const question = nodeOf('question-1')
  const replies = designInterview.human.filter(entry => entry.kind === 'reply')
  const violations = jsonl(join(runDir, INTERVIEW, 'home', 'audit', 'violations.jsonl'))
  const early = resultOf('confirm-early')
  const refusedEdit = resultOf('edit-stage')
  const [edit, approve] = goal.history.slice(-2)
  const callOf = entry => /^人在对话里同意（record_human_answer (probe-call-[\w-]+)）$/.exec(entry?.reason ?? '')?.[1]
  const items = ['need', 'problem', 'flows', 'acceptance', 'non-goals', 'constraints', 'risks']
  const last = main.at(-1)
  const noticeTexts = messagesOf(last, 'glm-design-bypass').map(message => message.text)
  return [
    ['design interview: the scripted model made one request for each step of the interview and the simulated human, woken by /wish, did not raise a question card', main.length === interviewSteps.length && designInterview.human[0]?.kind === 'wish' && designInterview.human[0].result === 'success', `${main.length} of ${interviewSteps.length} requests; ${designInterview.human[0]?.kind}/${designInterview.human[0]?.result}`],
    ['design interview: the person answers the seven items of the card in the order the card asks (rule 4, with the words of the calibration task; who uses it right after the problem, step 2b) while nothing is shown to them, then the question (rule 3, a recommend) and the requirement (rule 3, a confirm) with the nod of the task; nine replies and no more', replies.length === 9 && replies.slice(0, 7).every(reply => reply.rule === 4 && reply.shown.length === 0) && isDeepStrictEqual(replies.slice(0, 7).map(reply => reply.text), items.map(key => INTERVIEW_ANSWERS[key])) && replies[7].rule === 3 && replies[7].text === INTERVIEW_NOD && isDeepStrictEqual(replies[7].shown, [{ kind: 'question', number: 1, form: 'recommend' }]) && replies[8].rule === 3 && replies[8].text === INTERVIEW_AGREE && isDeepStrictEqual(replies[8].shown, [{ kind: 'confirm', number: 1 }]), JSON.stringify(replies.map(reply => [reply.rule, reply.text])).slice(0, 300)],
    ['design interview: every answer is on the graph once the next request has written it: the five labelled lines of the card in the goal (the line that it has no end user among them), its acceptance and non-goals, and a risk under it', goal.body === Object.values(INTERVIEW_LINES).join('\n') && isDeepStrictEqual(goal.acceptance, [INTERVIEW_ANSWERS.acceptance]) && isDeepStrictEqual(goal.nonGoals, [INTERVIEW_ANSWERS['non-goals']]) && nodeOf('risk-1').parent === 'goal-1', `${goal.body.split('\n').length} body lines; ${goal.acceptance?.length}/${goal.nonGoals?.length}`],
    ['design interview: the requirement put to the human before the card is whole is refused as gate_unmet, naming the risk and the fork still missing and where to write them, and nothing was shown to the human', early?.isError === true && early.text.includes('"code":"gate_unmet"') && early.text.includes('missing: 风险（最可能出岔子的地方）、岔路（人拍板的选择）"') && early.text.includes('interview step 6') && early.text.includes('interview step 7'), (early?.text ?? '').slice(0, 200)],
    ['design interview: the fork is put as a recommend question and the text comes back as the sentence the model wrote, and the human\'s nod decided it: the decision carries the nod as relay and the mark of the agreement', jsonOf('put-question')?.text === renderAsk(INTERVIEW_QUESTION.text, 1) && jsonOf('put-question').question === 'question-1' && jsonOf('record-question')?.outcome === 'decided' && question.status === 'done' && question.conclusion === INTERVIEW_QUESTION.proposal && question.history.at(-1)?.relay === INTERVIEW_NOD && question.history.at(-1).reason.startsWith('人在对话里同意（record_human_answer '), JSON.stringify(jsonOf('record-question') ?? null)],
    ['design interview: the model\'s own edit that sets the stage of the goal to design is refused by main-agent-graph-stage with the main agent\'s correction; the refusal is in the violation journal with the goal, the stage it was in and the one it was sent to, and the goal did not move', refusedEdit?.isError === true && refusedEdit.text.includes('You tried to set the stage of "记账小工具" to design while it is in interview.') && refusedEdit.text.includes('Put it to the human with propose_to_human (kind confirm or release) and record their answer with record_human_answer') && violations.some(record => record.rule === 'main-agent-graph-stage' && record.sessionId === main[0]?.sessionId && record.goal === 'goal-1' && record.stageFrom === 'interview' && record.stageTo === 'design' && record.session === undefined) && goal.history.every(entry => entry.changes?.stage?.to !== 'design' || entry.relay !== undefined), (refusedEdit?.text ?? '').slice(0, 160)],
    ['design interview: with the card whole the requirement is put as a confirm: the text is the model\'s sentence under its number with the line that the goal has no end user under it (its user page, also in the result), with no question or way of asking, and nothing is on the graph for it', jsonOf('put-requirement')?.kind === 'confirm' && jsonOf('put-requirement').goal === 'goal-1' && jsonOf('put-requirement').text === INTERVIEW_SHOWN && isDeepStrictEqual(jsonOf('put-requirement').userPage, { stable: INTERVIEW_PAGE, state: '' }) && jsonOf('put-requirement').number === 1 && jsonOf('put-requirement').question === undefined && jsonOf('put-requirement').form === undefined && !existsSync(join(stageWs(INTERVIEW), 'docs', 'graph', 'nodes', 'question-2.json')), JSON.stringify(jsonOf('put-requirement') ?? null).slice(0, 200)],
    ['design interview: record_human_answer confirms it: the goal is approved and in design, and the stage change and the approval (in that order, so that a stop between them leaves a proposal still in the interview) are two writes of one call, each with the nod as relay, the mark of the agreement and the id of the call', jsonOf('record-requirement')?.outcome === 'confirmed' && jsonOf('record-requirement').stage === 'design' && goal.status === 'approved' && goal.stage === 'design' && approve?.op === 'approve' && edit?.op === 'edit' && isDeepStrictEqual(edit.changes, { stage: { from: 'interview', to: 'design' } }) && approve.relay === INTERVIEW_AGREE && edit.relay === INTERVIEW_AGREE && callOf(approve) !== undefined && callOf(approve) === callOf(edit), JSON.stringify([jsonOf('record-requirement'), approve?.reason, edit?.reason]).slice(0, 260)],
    ['design interview: another root session of the project, woken by a message of the person, tries to set the goal to release with words it made up: the stage rule refuses it as an ordinary session with the correction for a session that is not the main agent, the goal stays in design, the journal names the session, and nothing else of it is allowed', second.length === 2 && lastToolResult(second[1])?.isError === true && lastToolResult(second[1]).text.includes('Only the main agent moves a goal forward, by recording the human\'s agreement to its proposal.') && lastToolResult(second[1]).text.includes('The human agrees in the main agent\'s conversation; /wish in this session shows where it is.') && goal.stage === 'design' && violations.some(record => record.rule === 'main-agent-graph-stage' && record.agentId === otherId && record.session?.kind === 'ordinary' && record.stageFrom === 'design' && record.stageTo === 'release'), `${second.length} requests; ${(lastToolResult(second[1])?.text ?? '').slice(0, 120)}`],
    ['design interview: the main agent is told once, in its next request, that another session wanted to move the goal on without the person (the notice names the rule), and the design row says it is partly in effect', noticeTexts.length === 1 && noticeTexts[0].startsWith('[拦下] 另一个会话「') && noticeTexts[0].includes('想不经人的同意把「记账小工具」推到 release') && noticeTexts[0].includes('main-agent-graph-stage') && tableOf(last?.status ?? '').design?.status === '部分生效', `${noticeTexts.length} notice(s): ${noticeTexts[0] ?? ''}; ${JSON.stringify(tableOf(last?.status ?? '').design ?? null)}`],
    ['design interview: the run ended with exit 0, the person said nothing after the nod, and the row printed nothing to stderr', designInterview.status === 0 && designInterview.human.filter(entry => entry.kind === 'reply').length === 9 && designInterview.human.every(entry => entry.kind !== 'unexpected-question') && !stderrOf(INTERVIEW).includes('dsh-glm-hourness/design'), `exit ${designInterview.status}; ${JSON.stringify(designInterview.human.map(entry => entry.kind))}`],
  ]
}

function releaseChecks() {
  const main = designRelease.steps.filter(step => step.sessionId === designRelease.steps[0]?.sessionId)
  const nodeOf = (id) => {
    try {
      return JSON.parse(readFileSync(join(stageWs(RELEASE), 'docs', 'graph', 'nodes', `${id}.json`), 'utf8'))
    }
    catch {
      return { history: [] }
    }
  }
  // The result of the tool call a scripted step made is in the next request.
  const resultOf = index => lastToolResult(main[index + 1])
  const jsonOf = index => { try { return JSON.parse(resultOf(index)?.text ?? '') } catch { return undefined } }
  const goal = nodeOf('goal-1')
  const replies = designRelease.human.filter(entry => entry.kind === 'reply')
  const unmet = resultOf(1)
  const first = jsonOf(3)
  const added = jsonOf(5)
  const released = jsonOf(9)
  const child = stageChildren(RELEASE, designRelease)[0]
  const violations = jsonl(join(runDir, RELEASE, 'home', 'audit', 'violations.jsonl'))
  const note = goal.history.find(entry => entry.op === 'comment')
  const stageWrite = goal.history.findLast(entry => entry.changes?.stage?.to === 'release')
  const approvals = ['decision-1', 'task-1'].map(id => nodeOf(id).history.at(-1))
  return [
    ['design release: the scripted model made one request for each step and the design row activated quietly', main.length === 13 && designRelease.status === 0 && !stderrOf(RELEASE).includes('dsh-glm-hourness/design'), `${main.length} requests; exit ${designRelease.status}`],
    ['design release: the release put before the design is complete is refused as gate_unmet naming the column that is missing as the person reads it, and nothing is shown: an empty "查过的现成方案：" followed by a line "如果失败：" is an empty column', unmet?.isError === true && unmet.text.includes('"code":"gate_unmet"') && unmet.text.includes('架构（含查过的现成方案）') && !unmet.text.includes('"tool":"propose_to_human"'), (unmet?.text ?? '').slice(0, 200)],
    ['design release: with the column filled and the line "如果失败：" still there, the release is put: the text is the model\'s sentence under its number, and the set it will approve is the decision and the task with their revisions', first?.kind === 'release' && first.goal === 'goal-1' && first.number === 1 && first.text === releaseShown && isDeepStrictEqual(first.releaseSet?.map(entry => entry.id), ['decision-1', 'task-1']) && first.releaseSet.every(entry => /^[0-9a-f]+$/.test(entry.rev)) && nodeOf('decision-1').body.includes('如果失败：'), JSON.stringify(first ?? null).slice(0, 220)],
    ['design release: the person is spoken to twice, by rule 3, both times about a release (number 1): first they add something, then they say it can go', replies.length === 2 && replies.every(reply => reply.rule === 3 && isDeepStrictEqual(reply.shown, [{ kind: 'release', number: 1 }])) && replies[0].text === RELEASE_ADD && replies[1].text === RELEASE_GO, JSON.stringify(replies.map(reply => [reply.rule, reply.text]))],
    ['design release: record_human_answer (add) notes their words on the goal and moves nothing: the note begins with the mark of an addition, the design is still proposals, and the goal is still in design when the note is written', added?.outcome === 'added' && note?.text?.startsWith('人在对话里补充：「补充：月底的汇总按金额从大到小排」') === true && goal.history.indexOf(note) < goal.history.indexOf(stageWrite) && added.stage === undefined, JSON.stringify(added ?? null)],
    ['design release: after the design is changed the release is put again and the person says it can go; record_human_answer (agree) releases the goal: the outcome is released, and the decision and the task are approved with their words as relay and the mark of the agreement', released?.outcome === 'released' && released.stage === 'release' && isDeepStrictEqual(released.approved, ['decision-1', 'task-1']) && approvals.every(entry => entry?.op === 'approve' && entry.relay === RELEASE_GO && /^人在对话里同意（record_human_answer [\w-]+）$/.test(entry.reason ?? '')), JSON.stringify(released ?? null)],
    ['design release: the goal is at stage release; the write that moved it names the person\'s words and the call, and its change is design to release', goal.status === 'approved' && goal.stage === 'release' && stageWrite?.relay === RELEASE_GO && isDeepStrictEqual(stageWrite.changes, { stage: { from: 'design', to: 'release' } }) && /^人在对话里同意（record_human_answer [\w-]+）$/.test(stageWrite.reason ?? ''), JSON.stringify(stageWrite ?? null)],
    ['design release: the subagent dispatched after the release writes its file, and no write of a subagent was refused', child?.result?.isError !== true && existsSync(join(stageWs(RELEASE), 'released.txt')) && violations.every(record => record.rule !== 'design-before-release'), `${child?.result?.isError}:${(child?.result?.text ?? '').slice(0, 60)}; ${violations.length} violation(s)`],
    ['design release: the simulated human raised no question card', designRelease.human.every(entry => entry.kind !== 'unexpected-question'), JSON.stringify(designRelease.human.map(entry => entry.kind))],
  ]
}

function modulesChecks() {
  const main = designModules.steps.filter(step => step.sessionId === designModules.steps[0]?.sessionId)
  const nodeOf = (id) => {
    try {
      return JSON.parse(readFileSync(join(stageWs(MODULES), 'docs', 'graph', 'nodes', `${id}.json`), 'utf8'))
    }
    catch {
      return { history: [] }
    }
  }
  const resultOf = name => lastToolResult(main[modulesAt(name) + 1])
  const jsonOf = name => { try { return JSON.parse(resultOf(name)?.text ?? '') } catch { return undefined } }
  const errorOf = name => { try { return JSON.parse((resultOf(name)?.text ?? '').replace(/^Error: /, '')) } catch { return undefined } }
  const replies = designModules.human.filter(entry => entry.kind === 'reply')
  const children = stageChildren(MODULES, designModules)
  const violations = jsonl(join(runDir, MODULES, 'home', 'audit', 'violations.jsonl'))
  const wsFile = file => existsSync(join(stageWs(MODULES), file))
  const [goal, moduleA, moduleB] = ['goal-1', 'module-a', 'module-b'].map(nodeOf)
  const digest = entry => / · 一页放行稿 [0-9a-f]{8}$/.test(entry?.reason ?? '')
  const mark = entry => /^人在对话里同意（record_human_answer [\w-]+）/.test(entry?.reason ?? '')
  const framework = jsonOf('record-framework')
  const putFramework = jsonOf('put-framework')
  const putA = jsonOf('put-a')
  const recordedA = jsonOf('record-a')
  const bypass = messagesOf(main.at(-1), 'glm-design-bypass').map(message => message.text)
  const stageRows = violations.filter(record => record.rule === 'design-before-release')
  const stageOf = id => nodeOf(id).stage
  const writeOf = (node, to) => node.history.findLast(entry => entry.changes?.stage?.to === to)
  const unshown = errorOf('record-b-unshown')
  const invented = errorOf('record-b-invented')
  const borrowed = errorOf('record-b-borrowed')
  const sendBack = nodeOf('module-a').history.at(-1)
  return [
    ['design modules: the scripted model made one request for each step, the design row activated quietly, and the person was spoken to three times (the framework, then module-a twice) and no more', main.length === modulesSteps.length && designModules.status === 0 && !stderrOf(MODULES).includes('dsh-glm-hourness/design') && replies.length === 3 && replies[0].text === RELEASE_GO && isDeepStrictEqual(replies[0].shown, [{ kind: 'release', number: 1 }]) && replies[1].text === MODULES_ADD && isDeepStrictEqual(replies[1].shown, [{ kind: 'release', number: 1, module: 'module-a' }]) && replies[2].text === '可以，放行这个模块', `${main.length} of ${modulesSteps.length} requests; exit ${designModules.status}; ${JSON.stringify(replies.map(reply => [reply.rule, reply.text]))}`],
    ['design modules: while the goal is in design a subagent dispatched with the focus on a task of module-a is refused for the goal; its file does not exist', children[0]?.result?.isError === true && children[0].result.text.includes('of a design loop at stage design (goal goal-1)') && !wsFile('modules-1.txt'), (children[0]?.result?.text ?? '').slice(0, 120)],
    ['design modules: the page of the framework release that lacks a module is refused as invalid on page and names it; with it the release is put: the set is the framework decision, the directions and the two candidates, and the text is the model\'s sentence with the page after it', errorOf('page-short')?.code === 'invalid' && errorOf('page-short').field === 'page' && errorOf('page-short').message.includes(`the module "${MODULES_NAMES.b}"`) && putFramework?.kind === 'release' && putFramework.module === undefined && isDeepStrictEqual(putFramework.releaseSet?.map(entry => entry.id), ['decision-fw', 'norm-directions', 'module-a', 'module-b']) && putFramework.text === renderAsk(RELEASE_TEXT, 1, undefined, MODULES_PAGE, false), JSON.stringify(errorOf('page-short') ?? null).slice(0, 200)],
    ['design modules: record_human_answer releases the framework: both candidates are modules in design, the framework and the directions are approved, the goal is at release, and the designs below the modules are still proposals; each module got its stage design while it was a proposal, then its approval, with the person\'s words', framework?.outcome === 'released' && isDeepStrictEqual(framework.modules, ['module-a', 'module-b']) && ['module-a', 'module-b'].every(id => nodeOf(id).status === 'approved' && stageOf(id) === 'design' && isDeepStrictEqual(nodeOf(id).history.slice(0, 3).map(entry => entry.op), ['propose', 'edit', 'approve']) && nodeOf(id).history.slice(1, 3).every(entry => entry.relay === RELEASE_GO && mark(entry))) && ['decision-fw', 'norm-directions'].every(id => nodeOf(id).status === 'approved') && ['decision-b', 'task-b'].every(id => nodeOf(id).status === 'proposed') && ['decision-a', 'task-a'].every(id => nodeOf(id).history.find(entry => entry.op === 'approve')?.at >= moduleA.history[2].at) && goal.stage === 'release' && digest(writeOf(goal, 'release')) && writeOf(goal, 'release').relay === RELEASE_GO, JSON.stringify(framework ?? null).slice(0, 200)],
    ['design modules: with the goal released and module-a still in design the subagent is refused again, with the module named and the way to release it; its file does not exist', children[1]?.result?.isError === true && children[1].result.text.includes('module module-a (记账) of goal goal-1, and the human has not released that module yet') && children[1].result.text.includes('(kind release, module module-a)') && !wsFile('modules-2.txt'), (children[1]?.result?.text ?? '').slice(0, 160)],
    ['design modules: the release of module-a is put with its page (the set is the design below it), the person adds something, record_human_answer (add) notes it on the module and the module stays in design', putA?.kind === 'release' && putA.module === 'module-a' && isDeepStrictEqual(putA.releaseSet?.map(entry => entry.id), ['decision-a', 'task-a']) && jsonOf('record-a-add')?.outcome === 'added' && moduleA.history.some(entry => entry.op === 'comment' && entry.text?.startsWith('人在对话里补充：「补充：先做记录再做汇总」')), JSON.stringify(putA ?? null).slice(0, 200)],
    ['design modules: after the supplement is in the plan and the module put again, the person releases it: record_human_answer releases module-a: its design is approved with their words, its stage is release, and the write names the digest of the page; module-b, its design, the directions and the goal are as they were', recordedA?.outcome === 'released' && recordedA.module === 'module-a' && isDeepStrictEqual(recordedA.approved, ['decision-a', 'task-a']) && ['decision-a', 'task-a'].every(id => nodeOf(id).history.at(-1)?.relay === '可以，放行这个模块') && moduleA.history.findLast(entry => entry.changes?.stage?.to === 'release')?.relay === '可以，放行这个模块' && digest(moduleA.history.findLast(entry => entry.changes?.stage?.to === 'release')) && moduleB.stage === 'design' && ['decision-b', 'task-b'].every(id => nodeOf(id).status === 'proposed') && goal.history.filter(entry => entry.changes?.stage?.to === 'release').length === 1, JSON.stringify(recordedA ?? null).slice(0, 200)],
    ['design modules: a subagent writes for released module-a and its file is there; with the focus on module-b the next one is refused with that module named and its file is not; three refusals in all by the rule, none for module-a', children[2]?.result?.isError !== true && wsFile('modules-3.txt') && children[3]?.result?.isError === true && children[3].result.text.includes('module module-b (月底汇总) of goal goal-1, and the human has not released that module yet') && !wsFile('modules-4.txt') && stageRows.length === 3, `${children[2]?.result?.isError}/${children[3]?.result?.isError}; ${stageRows.length} refusals`],
    ['design modules: the release of module-b that was never put to the person is not_shown; once it is put, words the model made up and words the person said about module-a before are invalid on words; module-b stays in design with its design proposed', unshown?.code === 'not_shown' && unshown.field === 'module' && invented?.code === 'invalid' && invented.field === 'words' && borrowed?.code === 'invalid' && borrowed.field === 'words' && moduleB.status === 'approved' && moduleB.stage === 'design' && ['decision-b', 'task-b'].every(id => nodeOf(id).status === 'proposed'), `${unshown?.code}/${invented?.code}/${borrowed?.code}`],
    ['design modules: a subagent that sends module-a back to design is refused by main-agent-graph-stage with the main agent\'s decision named, journaled as a subagent, and the main agent is told once; the row says it is partly in effect', children[4]?.result?.isError === true && children[4].result.text.includes('Only the main agent sends a module back to design.') && children[4].result.text.includes('Report back to the main agent.') && violations.some(record => record.rule === 'main-agent-graph-stage' && record.agentId === children[4].id && record.session?.kind === 'subagent' && record.node === 'module-a' && record.stageFrom === 'release' && record.stageTo === 'design') && bypass.length === 1 && bypass[0].includes('退回设计') && tableOf(main.at(-1)?.status ?? '').design?.status === '部分生效', `${(children[4]?.result?.text ?? '').slice(0, 100)}; ${bypass.length} notice(s)`],
    ['design modules: the main agent sends module-a back to design on its own word: the edit goes through, the module is in design, and the write is the llm\'s, without the person\'s words, with the change release to design and a reason that is not the mark of an agreement', resultOf('send-back')?.isError !== true && moduleA.stage === 'design' && sendBack?.actor === 'llm' && sendBack.relay === undefined && isDeepStrictEqual(sendBack.changes, { stage: { from: 'release', to: 'design' } }) && !mark(sendBack), `${(resultOf('send-back')?.text ?? '').slice(0, 80)}; ${JSON.stringify(sendBack ?? null).slice(0, 160)}`],
    ['design modules: no question card was raised', designModules.human.every(entry => entry.kind !== 'unexpected-question'), JSON.stringify(designModules.human.map(entry => entry.kind))],
  ]
}
/** A /glm-status or /hourness-status line of the design row for a main agent session that has nothing wrong with it. */
const inEffectRow = row => row?.status === ACTED && row.reason.startsWith('主 Agent：身份节已加上')
function personaChecks() {
  const SECTION = `# Output Style: PM\n${PERSONA_SETTING.text}\n\n${PERSONA_SCOPE}`
  const main = designPersona.steps.filter(step => step.sessionId === designPersona.steps[0]?.sessionId)
  const childId = dispatchRecord(PERSONA).find(entry => entry.kind === 'started')?.childId
  const child = childId === undefined ? [] : bySession(designPersona, childId)
  const at = (step, text) => step?.system.indexOf(text) ?? -1
  const ascending = (...marks) => marks.every(mark => mark >= 0) && marks.every((mark, index) => index === 0 || marks[index - 1] < mark)
  const reminded = steps => steps.some(step => step.system.includes('output style is active') || step.messages.some(message => message.text.includes('output style is active')))
  const rowAt = (scenario, text) => tableOf(text ?? '').design
  const glmLast = main.at(-1)
  const plain = designPersonaPlain.steps[0]
  return [
    ['design persona (GLM): the main agent\'s request has the identity opening of an active output style after the ZCode prefix, and the persona section (heading, the person\'s text, the scope sentence) after the reporting depth and ahead of the context management, the main agent section and the workspace rules', main.length === 3 && ascending(at(main[0], 'You are ZCode, an interactive agent'), at(main[0], IDENTITY_OPENING_WITH_STYLE), at(main[0], '# Reporting Depth'), at(main[0], SECTION), at(main[0], '# Context management'), sectionAt(main[0]), at(main[0], GUARD_SECTION)) && at(main[0], IDENTITY_OPENING_PLAIN) < 0, `${main.length} requests; ${[at(main[0], IDENTITY_OPENING_WITH_STYLE), at(main[0], '# Reporting Depth'), at(main[0], SECTION), at(main[0], '# Context management'), sectionAt(main[0]), at(main[0], GUARD_SECTION)].join(' < ')}`],
    ['design persona (GLM): the persona is in the system prompt of every request of the main agent, not only the first (the dialect and the design row agree on it at every step)', main.length > 0 && main.every(step => step.system.includes(SECTION) && step.system.includes(IDENTITY_OPENING_WITH_STYLE)), main.map(step => step.system.includes(SECTION) ? 1 : 0).join('')],
    ['design persona (GLM): the dispatched subagent is a real child session whose request has neither the persona section nor its mark nor the main agent section; its identity opens with the plain sentence', childId !== undefined && child.length > 0 && child.every(step => !step.system.includes('# Output Style') && !step.system.includes('PM-MARK') && sectionAt(step) < 0 && step.system.includes(IDENTITY_OPENING_PLAIN) && !step.system.includes(IDENTITY_OPENING_WITH_STYLE) && step.system.includes('You are ZCode, an interactive agent')), `child ${childId ?? 'not started'}; ${child.length} request(s); ${child.map(step => step.system.includes('# Output Style') ? 'has the section' : 'none').join(',')}`],
    ['design persona (GLM): no reminder that the style is active is sent in the system prompt or the messages of any request, the main agent\'s or the child\'s', !reminded(main) && !reminded(child), `main ${reminded(main)}, child ${reminded(child)}`],
    ['design persona (GLM): the design row is in effect for the main agent with the persona set, and ran quietly; the person was never asked through a card', inEffectRow(rowAt(designPersona, glmLast?.status)) && designPersona.status === 0 && !stderrOf(PERSONA).includes('dsh-glm-hourness/design') && designPersona.human.every(entry => entry.kind !== 'unexpected-question'), `${JSON.stringify(rowAt(designPersona, glmLast?.status) ?? null)}; exit ${designPersona.status}`],
    ['design persona (non-GLM): the main agent\'s request has the persona section ahead of the main agent section and the workspace rules, the DSH identity untouched, and no ZCode identity or output style opening', plain !== undefined && ascending(at(plain, SECTION), sectionAt(plain), at(plain, GUARD_SECTION)) && plain.system.includes('powered by DeepSeek Harness') && !plain.system.includes('You are ZCode') && !plain.system.includes(IDENTITY_OPENING_WITH_STYLE) && !plain.system.includes(IDENTITY_OPENING_PLAIN) && !reminded(designPersonaPlain.steps), `${plain === undefined ? 'no request' : [at(plain, SECTION), sectionAt(plain), at(plain, GUARD_SECTION)].join(' < ')}`],
    ['design persona (non-GLM): the row is in effect in /hourness-status and ran quietly', inEffectRow(rowAt(designPersonaPlain, designPersonaPlain.steps[0]?.command?.text)) && designPersonaPlain.status === 0 && !stderrOf(PERSONA_PLAIN).includes('dsh-glm-hourness/design'), `${JSON.stringify(rowAt(designPersonaPlain, designPersonaPlain.steps[0]?.command?.text) ?? null)}; exit ${designPersonaPlain.status}`],
  ]
}
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
    ['design: the row ships enabled since the m3 merge (step 12b): without the overlay /glm-status and /hourness-status list it loaded but not triggered in this session', glmHealth.design?.status === '已加载，本会话未触发' && plainHealth.design?.status === '已加载，本会话未触发', `${healthLine(glmHealth, 'design')}; ${healthLine(plainHealth, 'design')}`],
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
        [`design main (${label}): the request after /wish has the section${glmRoute ? ' between the ZCode identity and the workspace rules' : ' before the workspace rules'}, the first request's face without ${cut.join(', ')} and with propose_to_human and record_human_answer (the ordinary faces before and after have neither), the enter notice, and the row in effect`, hasSection(2) && placed(steps[2], glmRoute) && isDeepStrictEqual(faceOf(steps[2]), [...faceWithout(steps[0], cut), ...DESIGN_TOOL_NAMES].sort()) && DESIGN_TOOL_NAMES.every(name => !faceOf(steps[0]).includes(name) && !faceOf(steps[5]).includes(name)) && entered(steps[2]) && inEffect(rowAt(scenario, 2)), `section ${sectionAt(steps[2])}; face ${faceOf(steps[2]).length} of ${faceOf(steps[0]).length}; ${JSON.stringify(rowAt(scenario, 2) ?? null)}`],
        [`design main (${label}): /wish <wish> typed while the agent runs arrives at its next step with the words and the original marker`, !wished(steps[3]) && wished(steps[4]) && hasSection(3) && hasSection(4), `${steps.map(step => wished(step) ? 1 : 0).join('')}`],
        [`design main (${label}): after /wish off the request has no section, the first request's face and the leave notice; the row is not in effect; the Write after it ran, so did the one before`, !hasSection(5) && isDeepStrictEqual(faceOf(steps[5]), faceOf(steps[0])) && left(steps[5]) && !left(steps[4]) && notInEffect(rowAt(scenario, 5)) && files(scenario, 'before.txt', 'after.txt').every(Boolean), `${sectionAt(steps[5])}; ${JSON.stringify(rowAt(scenario, 5) ?? null)}; files ${files(scenario, 'before.txt', 'after.txt').join(',')}`],
        [`design main (${label}): the main agent again: a Write and a shell write are refused by name with the main agent's correction, and neither file exists`, [8, 9].every(index => lastToolResult(steps[index])?.isError === true) && lastToolResult(steps[8]).text.includes('Boundary: You are the main agent of this session (/wish)') && lastToolResult(steps[8]).text.includes('You tried to write') && lastToolResult(steps[9]).text.includes('You tried to change files through the shell') && files(scenario, 'denied.txt', 'denied2.txt').every(present => !present), `${[8, 9].map(index => `${lastToolResult(steps[index])?.isError}:${(lastToolResult(steps[index])?.text ?? '').slice(0, 50)}`).join(' | ')}; files ${files(scenario, 'denied.txt', 'denied2.txt').join(',')}`],
        [`design main (${label}): git status runs without a snapshot or a notice; git checkout -- README.md runs, the next request has the git snapshot notice with the way back, one ref is under refs/hourness/snapshots/, and the edit is in the snapshot`, lastToolResult(steps[10])?.isError !== true && messagesOf(steps[10], 'glm-git-snapshot').length === 0 && lastToolResult(steps[11])?.isError !== true && messagesOf(steps[11], 'glm-git-snapshot').length === 1 && messagesOf(steps[11], 'glm-git-snapshot')[0].text.startsWith('[git 快照] 执行「git checkout -- README.md」之前存了快照 ') && snapshotsOf(scenario).length === 1 && lfOf(readFileSync(join(scenario.ws, 'README.md'), 'utf8')) === 'probe workspace\n' && lfOf(snapshotEditOf(scenario)) === 'probe workspace\nedited by the person\n', `${lastToolResult(steps[10])?.isError}/${messagesOf(steps[10], 'glm-git-snapshot').length}; ${lastToolResult(steps[11])?.isError}/${messagesOf(steps[11], 'glm-git-snapshot').length}; refs ${snapshotsOf(scenario).length}`],
        [`design main (${label}): ask_user_question called by name is refused with the main agent's ask correction, and both refusals and the shell write are in the violation journal`, lastToolResult(steps[12])?.isError === true && lastToolResult(steps[12]).text.includes('You called ask_user_question.') && lastToolResult(steps[12]).text.includes('Exception: none') && jsonl(join(scenario.dir, 'home', 'audit', 'violations.jsonl')).map(record => record.rule).join(',') === 'main-agent-no-write,main-agent-no-write,main-agent-ask', jsonl(join(scenario.dir, 'home', 'audit', 'violations.jsonl')).map(record => record.rule).join(',')],
        [`design main (${label}): the row activated quietly, the record is gone after /wish off, and no question card was raised`, scenario.status === 0 && rowQuiet(scenario) && humanQuiet(scenario) && designRecord(scenario).kind === 'none', `exit ${scenario.status}; record ${designRecord(scenario).kind}`],
      ]
    }),
    ['design one main: a second root session in the same workspace, typing /wish, is told where the main agent is and how to move it; its tool face and the first session\'s are not changed by it', mainSteps[0]?.other?.kind === 'success' && mainSteps[0].other.resultText.includes('这个项目的主 Agent 在另一个会话里') && mainSteps[0].other.resultText.includes('/wish here') && sectionAt(mainSteps[1]) >= 0 && lacks(mainSteps[1], ['Write', 'Edit']), JSON.stringify(mainSteps[0]?.other ?? null).slice(0, 160)],
    ['design one main: /wish here moves the role; the first session\'s next request has no section, its tool face back (Write, Edit, ask_user_question), the notice that the main agent moved; the Write runs', mainSteps[1]?.other?.kind === 'success' && mainSteps[1].other.resultText.startsWith('主 Agent 已从另一个会话移到这里；') && mainSteps[2] !== undefined && sectionAt(mainSteps[2]) < 0 && hasCut(mainSteps[2], GLM_CUT) && wishNotices(mainSteps[2]).some(message => message.text.includes('moved to another session')) && files(one, 'x.txt')[0], `${mainSteps[1]?.other?.kind}; section ${sectionAt(mainSteps[2])}; x.txt ${files(one, 'x.txt')[0]}`],
    ['design one main: the record names the second session, not the first and not the fork; the second session logged its own two commands', holder.kind === 'held' && holder.record.sessionId.startsWith('probe-other-') && holder.record.sessionId !== mainId && holder.record.sessionId !== forkNote?.sessionId && mainSteps[0]?.other?.types.join('>') === 'command/run>command/done', `${holder.kind === 'held' ? holder.record.sessionId : holder.kind}`],
    ...stageChecks(),
    ...questionChecks(),
    ...interviewChecks(),
  ...releaseChecks(),
  ...modulesChecks(),
  ...personaChecks(),
    ['design one main: a fork of the first session at its /wish is an ordinary session from its first request on: no section, the ordinary face; the row ran /wish off for it, so its projection is off; the record is unchanged; the row warned of nothing', forkNote?.kind === 'forked' && forkSteps.length === 1 && forkSteps[0].sessionId === forkNote.sessionId && sectionAt(forkSteps[0]) < 0 && hasCut(forkSteps[0], GLM_CUT) && forkNote.types.includes('command/run') && forkNote.types.includes('command/done') && isDeepStrictEqual(forkNote.hournessMainAgent, { active: false }) && rowQuiet(one) && humanQuiet(one) && one.status === 0, JSON.stringify(forkNote ?? null).slice(0, 220)],
  ]
}

/**
 * Memory (docs/ORCHESTRATION.md §8; scenarios glm-memory, non-glm-memory,
 * glm-memory-compact, glm-worker-memory, glm-memory-depth): what the real
 * runtime did with the memory tools, the index notice, the child's tool face,
 * the reporting depth of each session's prompt and the journals.
 */
function memoryChecks() {
  const results = run => run.first.slice(1, 5).map(lastToolResult)
  const lines = (journal, op) => journal.filter(record => record.op === op)
  const indexTexts = step => memoryIndexes(step).map(message => message.text)
  const counts = steps => steps.map(step => memoryIndexes(step).length)
  const route = [[memoryGlm, 'glm-memory', true, 'GLM'], [memoryPlain, 'non-glm-memory', false, 'non-GLM']]
  const afterFirstUser = step => step !== undefined && step.messages.findIndex(message => message.source === MEMORY_INDEX_SOURCE) > step.messages.findIndex(message => message.role === 'user' && message.source === 'user')
  const roleRefusal = step => lastToolResult(step)?.isError === true && lastToolResult(step).text.includes('"code":"role"') && lastToolResult(step).text.includes('handback')
  const compactFirst = memoryCompact.steps[0]

  /** The habit scenario: the requests of its one session, what the model saw of each tool call, and the user-level journal. */
  const habitRun = bySession(memoryHabit, memoryHabit.steps[0]?.sessionId)
  const said = (run, at, piece) => (run[at]?.messages ?? []).some(message => message.text.includes(piece))
  const habitJournal = memoryJournalOf('glm-memory-habit', 'all')
  const habitChecks = [
    ['memory habit: the preference quoting the task (the person\'s latest message in the session) is stored with the words checked', habitJournal[0]?.op === 'store' && habitJournal[0]?.data.relayChecked === true && habitJournal[0]?.relay === '汇报只写结论' && habitRun.length === 6, `journal ${habitJournal.map(record => record.op).join(', ') || 'none'}; requests ${habitRun.length} (exit ${memoryHabit.status})`],
    ['memory habit: the ask is recorded with its question and its result reached the model as the circled text with the content on a second line', habitJournal[1]?.op === 'ask' && habitJournal[1]?.data.question === HABIT_ASK.question && isDeepStrictEqual(habitJournal[1]?.data.learnedFrom, ['edit:goal.stage']) && said(habitRun, 2, '① 以后提交说明都写成英文，好吗？') && said(habitRun, 2, `要记的：${HABIT_ASK.description}`), (habitRun[2]?.messages ?? []).map(message => message.text).find(text => text.includes('要记的：'))?.slice(0, 120) ?? 'the ask result did not reach the model'],
    ['memory habit: the person\'s reply (`tell`) woke the session and the confirm stored what was asked, with their words as the relay, checked, and the question named', habitJournal[2]?.op === 'store' && habitJournal[2]?.data.ask === HABIT_ASK.question && habitJournal[2]?.relay === '好，都写成英文吧' && habitJournal[2]?.data.relayChecked === true && said(habitRun, 4, '"confirmed":true'), habitJournal[2] === undefined ? 'no confirm store' : (habitRun[4]?.messages ?? []).map(message => message.text).find(text => text.includes('confirmed'))?.slice(0, 120) ?? 'the confirm result did not reach the model'],
    ['memory habit: a relay that only an earlier message had is refused as relay_not_said and nothing more was written', habitJournal.length === 3 && said(habitRun, 5, 'relay_not_said'), habitJournal.length === 3 ? (habitRun[5]?.messages ?? []).map(message => message.text).find(text => text.includes('relay_not_said'))?.slice(0, 120) ?? 'the refusal did not reach the model' : `journal ${habitJournal.map(record => record.op).join(', ')}`],
    ['memory habit: the memory row reports itself in effect, and the run warned of nothing', healthOf(memoryHabit).memory?.status === ACTED && quiet('glm-memory-habit'), `${healthLine(healthOf(memoryHabit), 'memory')}; stderr ${stderrOf('glm-memory-habit').length} byte(s)`],
  ]
  return [
    ...route.flatMap(([scenario, name, glmRoute, label]) => {
      const run = memorySessions(scenario)
      const user = memoryJournalOf(name, 'all')
      const project = memoryJournalOf(name, 'project')
      return [
        [`memory (${label}): the four memory_store calls are stored, the person's two go to the user-level journal as llm records with their words, checked against the person's latest message, the project's two to the project journal`, results(run).length === 4 && results(run).every(result => result?.isError !== true && result.text.includes('"stored":true')) && isDeepStrictEqual(lines(user, 'store').map(record => record.data.name), ['lead-with-the-answer', 'reporting-depth']) && lines(user, 'store').every(record => record.actor === 'llm' && typeof record.relay === 'string' && record.data.relayChecked === true) && isDeepStrictEqual(lines(project, 'store').map(record => record.data.name), ['signing-rules-differ', 'host-surface-notes']) && user.length === 2 && project.length === 2, `${results(run).map(result => (result?.text ?? 'none').slice(0, 40)).join(' | ')}; user ${user.length} record(s), project ${project.length}`],
        [`memory (${label}): the first root agent has no index while the memory is empty, one from the step after its first write, and the index is not repeated`, run.first.length === 5 && isDeepStrictEqual(counts(run.first), [0, 1, 1, 1, 1]), `index notices per request: ${counts(run.first).join(', ')}`],
        [`memory (${label}): the second root agent of the workspace has the index in its first request after the first user message, with the four memories, once, and not repeated in its next request`, run.second.length === 2 && afterFirstUser(run.second[0]) && isDeepStrictEqual(counts(run.second), [1, 1]) && MEMORY_NAMES.every(entry => indexTexts(run.second[0])[0]?.includes(`- ${entry} (`) === true), run.second.length === 0 ? `no second session (exit ${scenario.status}): ${JSON.stringify(scenario.steps.at(-1)?.spawn ?? null)}` : `index notices per request: ${counts(run.second).join(', ')}; ${(indexTexts(run.second[0])[0] ?? 'none').replace(/\n/g, ' | ').slice(0, 160)}`],
        [`memory (${label}): each root agent's system prompt is the same at every step`, new Set(run.first.map(step => step.system)).size === 1 && new Set(run.second.map(step => step.system)).size === 1, `${new Set(run.first.map(step => step.system)).size} and ${new Set(run.second.map(step => step.system)).size} distinct prompt(s)`],
        [`memory (${label}): the three memory tools are in the face of the root agent, resident, and the glm:memory section is ${glmRoute ? 'in' : 'not in'} the prompt`, memoryFace(run.first[0]).length === 3 && memoryFace(run.first[0]).every(tool => tool.deferLoading !== true) && run.first[0].system.includes(MEMORY_SECTION_LINE) === glmRoute, `${memoryFace(run.first[0]).map(tool => tool.name).join(', ')}; section ${run.first[0]?.system.includes(MEMORY_SECTION_LINE)}`],
        [`memory (${label}): the learning tool ${glmRoute ? 'is deferred on the GLM route: it is not in the face and tool search reaches it' : 'is in the face of the root agent'}`, glmRoute ? learningFace(run.first[0]).length === 0 : learningFace(run.first[0]).length === LEARNING_TOOL_NAMES.length && learningFace(run.first[0]).every(tool => tool.deferLoading !== true && LEARNING_TOOL_NAMES.includes(tool.name)), `${learningFace(run.first[0]).map(tool => tool.name).join(', ') || 'none'} in the face`],
        [`memory (${label}): the row reports itself in effect and says the session has the index; the configured home is said to be ignored`, healthOf(scenario).memory?.status === ACTED && healthOf(scenario).memory.reason.includes('本会话已带索引') && healthOf(scenario).memory.reason.includes('行配置 home 已不再使用（M5）'), JSON.stringify(healthOf(scenario).memory ?? null)],
      ]
    }),
    ['memory compaction: the first request has the index; after the compaction checkpoint the index comes once more, after the checkpoint, and is not repeated', memoryCompact.compactions.length > 0 && memoryIndexes(compactFirst).length === 1 && memoryAfterCheckpoint.length > 0 && memoryAfterCheckpoint.every(step => memoryIndexes(step).length === 1 && step.messages.findIndex(message => message.source === MEMORY_INDEX_SOURCE) > memoryCheckpointAt(step)), `${memoryCompact.compactions.length} compaction(s); index notices per request: ${counts(memoryCompact.steps).join(', ')}; requests with a checkpoint: ${memoryAfterCheckpoint.length}`],
    ['memory depth: the session that stores concise in its first step names the configured depth (balanced) in every request, with the same prompt each time', depthSessions.first.length === 2 && depthSessions.first.every(step => depthOf(step) === 'balanced') && new Set(depthSessions.first.map(step => step.system)).size === 1, `depths of the first session: ${depthSessions.first.map(depthOf).join(', ') || 'no request'} (exit ${memoryDepth.status})`],
    ['memory depth: the session started after the store names concise from its first request on, and forgetting the preference in its first step leaves its prompt as it was', depthSessions.second.length === 2 && depthSessions.second.every(step => depthOf(step) === 'concise') && new Set(depthSessions.second.map(step => step.system)).size === 1 && lastToolResult(depthSessions.second[1])?.isError !== true && lastToolResult(depthSessions.second[1])?.text.includes('"forgotten":true') === true, depthSessions.second.length === 0 ? 'no second session' : `depths of the second session: ${depthSessions.second.map(depthOf).join(', ')}; ${(lastToolResult(depthSessions.second[1])?.text ?? 'none').slice(0, 80)}`],
    ['memory depth: the session started after the forget names the configured depth again; the user-level journal holds the store and the forget', depthSessions.third.length === 1 && depthOf(depthSessions.third[0]) === 'balanced' && isDeepStrictEqual(memoryJournalOf('glm-memory-depth', 'all').map(record => record.op), ['store', 'forget']), `depth of the third session: ${depthSessions.third.map(depthOf).join(', ') || 'no request'}; journal ${memoryJournalOf('glm-memory-depth', 'all').map(record => record.op).join(', ')}`],
    ['memory depth: the glm-prompt and memory rows report themselves in effect for the second session, and the run warned of nothing', healthOf(memoryDepth)['glm-prompt']?.status === ACTED && healthOf(memoryDepth).memory?.status === ACTED && quiet('glm-memory-depth'), `${healthLine(healthOf(memoryDepth), 'glm-prompt')}; ${healthLine(healthOf(memoryDepth), 'memory')}; stderr ${stderrOf('glm-memory-depth').length} byte(s)`],
    ['memory worker: the child has no memory tool and no learning tool in its request, no glm:memory section and no index; the main agent of the project has the index and the section', workerChild.length > 0 && workerChild.every(step => memoryFace(step).length === 0 && learningFace(step).length === 0 && !step.system.includes(MEMORY_SECTION_LINE) && memoryIndexes(step).length === 0) && memoryIndexes(workerMain[0]).length === 1 && indexTexts(workerMain[0])[0]?.includes('- seeded-norm (feedback)') === true && workerMain[0].system.includes(MEMORY_SECTION_LINE), workerChild.length === 0 ? `no child request (exit ${memoryWorker.status})` : `child: ${workerChild.length} request(s), ${memoryFace(workerChild[0]).length} memory tool(s); main index notices ${counts(workerMain).join(', ')}`],
    ['memory worker: the child calling memory_store, memory_query, memory_forget and learning_signals by name is refused with role and the way to hand back, and the journals are as they were', [1, 2, 3, 4].every(index => roleRefusal(workerChild[index])) && memoryJournalOf('glm-worker-memory', 'project').length === 1 && memoryJournalOf('glm-worker-memory', 'all').length === 0, [1, 2, 3, 4].map(index => (lastToolResult(workerChild[index])?.text ?? 'none').slice(0, 60)).join(' | ')],
    ['memory worker: the main agent reaches learning_signals through tool search and gets the digest (the groups of the window and whether the graph could be read), and the project journal has only the seeded norm', lastToolResult(workerMain[2])?.isError !== true && lastToolResult(workerMain[2])?.text.includes('"groups":[') === true && /"graph":"(ok|unavailable)"/.test(lastToolResult(workerMain[2])?.text ?? '') && memoryJournalOf('glm-worker-memory', 'project').length === 1, (lastToolResult(workerMain[2])?.text ?? 'no result').slice(0, 120)],
    ...habitChecks,
    ['memory: the probe leaves the real user-level memory journal and the journals of the project this checkout belongs to as they were, and the user-level directory has no lessons directory', isDeepStrictEqual(realMemoryFiles.map(fileStamp), realMemoryBefore) && !existsSync(join(userDataHome(), 'lessons')), `${realMemoryBefore.join(' ')} -> ${realMemoryFiles.map(fileStamp).join(' ')}`],
  ]
}

/**
 * Lessons (docs/ORCHESTRATION.md §8.6; scenarios glm-lessons,
 * non-glm-lessons): what the real runtime did with the lessons row once the
 * overlay enabled it: the candidate notices, the two tools and their
 * permissions, `/lessons`, the face of the main agent and the journal.
 */
function lessonsChecks() {
  const route = [[lessonsGlm, 'glm-lessons', true, 'GLM'], [lessonsPlain, 'non-glm-lessons', false, 'non-GLM']]
  return route.flatMap(([scenario, name, glmRoute, label]) => {
    const result = index => lastToolResult(scenario.steps[index])
    const text = index => result(index)?.text ?? 'none'
    const journal = lessonsJournalOf(name)
    const shows = (index, id) => result(index)?.isError !== true && text(index).includes(`"id":"${id}"`)
    const commandAt = index => scenario.steps[index]?.command
    const face = lessonsFace(scenario.steps[0])
    return [
      [`lessons (${label}): the candidate the session started with is listed once, the second one handed to the service is listed once more, and merging does not bring the first back`, scenario.steps.length === 11 && isDeepStrictEqual(scenario.steps.map(step => lessonsNotices(step).length), [1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2]) && lessonsNotices(scenario.steps[0])[0].text.includes(SEED_CANDIDATE) && lessonsNotices(scenario.steps[2]).at(-1).text.includes('(1)'), scenario.steps.length === 0 ? `no request (exit ${scenario.status})` : `notices per request: ${scenario.steps.map(step => lessonsNotices(step).length).join(', ')}`],
      [`lessons (${label}): lessons_merge makes the candidate a lesson as the agent; the service keeps the candidate of a handback with the task, the worker's session and the full commit as its evidence`, result(1)?.isError !== true && text(1).includes('"action":"new"') && text(1).includes(`"candidate":"${SEED_CANDIDATE}"`) && text(2).includes('"status":"candidate"') && isDeepStrictEqual(journal.map(record => `${record.op}:${record.actor}`).slice(0, 4), ['new:llm', 'propose:harness', 'new:llm', 'propose:harness']) && isDeepStrictEqual(journal[3].evidence, ['task:task-9', 'session:session-probe-child', `commit:${PROBE_COMMIT}`]), `${text(1).slice(0, 80)} | ${text(2).slice(0, 60)}; ${journal.map(record => record.op).join(', ')}`],
      [`lessons (${label}): lessons_query finds the lesson and lists the open candidate as unreviewed`, shows(3, SEED_LESSON) && text(3).includes('"unreviewed":true'), text(3).slice(0, 200)],
      [`lessons (${label}): with the person's words the lesson is deleted and restored, and a delete without them is refused with user_only`, text(4).includes('"status":"deleted"') && !shows(5, SEED_LESSON) && text(6).includes('"status":"active"') && shows(7, SEED_LESSON) && result(8)?.isError === true && text(8).includes('user_only') && isDeepStrictEqual(journal.slice(4, 6).map(record => [record.op, record.actor, record.relay]), [['delete', 'llm', 'Delete that lesson.'], ['restore', 'llm', 'Bring it back.']]), `${text(4).slice(0, 60)} | ${text(8).slice(0, 100)}`],
      [`lessons (${label}): /lessons delete and /lessons restore act as the person: the lesson is gone from the next query and back after the next`, commandAt(8)?.kind === 'success' && commandAt(8).text.startsWith('已删除') && commandAt(9)?.kind === 'success' && commandAt(9).text.startsWith('已找回') && !shows(9, SEED_LESSON) && shows(10, SEED_LESSON) && isDeepStrictEqual(journal.slice(6, 8).map(record => [record.op, record.actor, record.by?.commandId]), [['delete', 'human', 'probe-lessons'], ['restore', 'human', 'probe-lessons']]) && journal.length === 8, `${JSON.stringify(commandAt(8) ?? null).slice(0, 100)} | ${JSON.stringify(commandAt(9) ?? null).slice(0, 100)}; ${journal.length} record(s)`],
      [`lessons (${label}): the face of the main agent has lessons_query${glmRoute ? ', resident, and lessons_merge only deferred' : ' and lessons_merge'}`, glmRoute ? face.some(tool => tool.name === 'lessons_query' && tool.deferLoading !== true) && !face.some(tool => tool.name === 'lessons_merge' && tool.deferLoading !== true) : LESSONS_TOOL_NAMES.every(tool => face.some(entry => entry.name === tool && entry.deferLoading !== true)), `${face.map(tool => `${tool.name}${tool.deferLoading === true ? ' (deferred)' : ''}`).join(', ') || 'none'}`],
      [`lessons (${label}): the row reports itself loaded with the project's counts, and the run warned of nothing`, healthOf(scenario).lessons?.status !== '未加载' && healthOf(scenario).lessons?.reason.includes('生效经验') === true && quiet(name), `${healthLine(healthOf(scenario), 'lessons')}; ${healthOf(scenario).lessons?.reason.slice(0, 120) ?? ''}; stderr ${stderrOf(name).length} byte(s)`],
    ]
  })
}

/**
 * Lessons after a failed call (docs/ORCHESTRATION.md §8.6; scenarios
 * glm-lessons-failure, non-glm-lessons-failure): what the real runtime did
 * with the listener on tools/post-execute: where the reminder sits in the
 * next request (U2), whether a child's call is seen (U1), what was recorded.
 */
function lessonsFailureChecks() {
  const route = [[failureGlm, 'glm-lessons-failure', 'GLM'], [failurePlain, 'non-glm-lessons-failure', 'non-GLM']]
  return route.flatMap(([scenario, name, label]) => {
    const started = dispatchRecord(name).find(entry => entry.kind === 'started')
    const main = bySession(scenario, started?.parentId)
    const child = bySession(scenario, started?.childId)
    const told = step => messagesOf(step, FAILURE_SOURCE)
    const recurNotices = step => messagesOf(step, LESSONS_RECUR_SOURCE)
    // The reminder sits right after a tool result in the request.
    const afterResult = step => step !== undefined && step.messages.some((message, index) => message.source === FAILURE_SOURCE && step.messages[index - 1]?.role === 'tool')
    const journal = lessonsJournalOf(name)
    const hits = journal.filter(record => record.op === 'hit')
    const recurred = journal.filter(record => record.op === 'recur-notified')
    return [
      [`lessons failure (${label}): the request after the failing command carries one reminder right after its tool result, naming the lesson and the fragment, and the result still shows the failure`, main.length >= 6 && told(main[0]).length === 0 && told(main[1]).length === 1 && afterResult(main[1]) && told(main[1])[0].text.includes(FAILURE_LESSON) && told(main[1])[0].text.includes(FAILURE_FRAGMENT) && told(main[1])[0].text.includes('advice, not a rule') && lastToolResult(main[1])?.isError !== true && lastToolResult(main[1]).text.includes(FAILURE_FRAGMENT), main.length === 0 ? `no main request (exit ${scenario.status})` : `reminders per request: ${main.map(step => told(step).length).join(', ')}; ${(told(main[1])[0]?.text ?? 'none').replace(/\n/g, ' | ').slice(0, 200)}`],
      [`lessons failure (${label}): a command that ran through brings no reminder, and the same failure again brings no second one`, main.length >= 6 && lastToolResult(main[2])?.text.includes('probe-ran-through') === true && told(main[2]).length === 1 && told(main[3]).length === 1 && lastToolResult(main[3])?.isError !== true, main.length === 0 ? 'no main request' : `reminders per request: ${main.map(step => told(step).length).join(', ')}`],
      [`lessons failure (${label}): the child's failing command gets its reminder right after its tool result as well, and its call was not changed`, child.length >= 2 && told(child[0]).length === 0 && told(child[1]).length === 1 && afterResult(child[1]) && told(child[1])[0].text.includes(FAILURE_LESSON) && lastToolResult(child[1])?.isError !== true && lastToolResult(child[1]).text.includes(FAILURE_FRAGMENT), child.length === 0 ? `no child request (exit ${scenario.status})` : `child reminders per request: ${child.map(step => told(step).length).join(', ')}; ${(lastToolResult(child[1])?.text ?? 'no tool result').slice(0, 80).replace(/\n/g, ' ')}`],
      [`lessons failure (${label}): the main agent's session and the child's are recorded as hits by the harness with the native tool name, one each, and with the earlier session they make three`, hits.length === 3 && isDeepStrictEqual(new Set(hits.map(record => record.by?.session)), new Set(['session-seed', started?.parentId, started?.childId])) && hits.slice(1).every(record => record.actor === 'harness' && record.id === FAILURE_LESSON && record.by.tool === 'pwsh' && record.by.agent === record.by.session && typeof record.by.callId === 'string'), hits.map(record => JSON.stringify(record.by)).join(' | ') || 'no hit'],
      [`lessons failure (${label}): the lesson that matched in three sessions is brought up to the main agent once, after its record; the child is not told`, recurred.length === 1 && recurred[0].id === FAILURE_LESSON && recurred[0].data?.sessions === 3 && recurNotices(main.at(-1)).length === 1 && recurNotices(main.at(-1))[0].text.includes(FAILURE_LESSON) && child.every(step => recurNotices(step).length === 0), `${recurred.length} record(s); reminders per request: ${main.map(step => recurNotices(step).length).join(', ') || 'none'}`],
      [`lessons failure (${label}): the row reports itself loaded, and the run warned of nothing`, healthOf(scenario).lessons?.status !== '未加载' && quiet(name), `${healthLine(healthOf(scenario), 'lessons')}; ${healthOf(scenario).lessons?.reason.slice(0, 120) ?? ''}; stderr ${stderrOf(name).length} byte(s)`],
    ]
  })
}

// Metrics journal (docs/ORCHESTRATION.md §10.6; metrics design §12 step 2).
// The row ships disabled; both runs enable it with the overlay, in scratch git
// workspaces where the person has set the stop level through the real board
// (the same setup the rules-stop-notice scenario proves words the reminder;
// the probe clock sits inside the peak): the row must write while the peak
// mode is at 停 and must never have read it. The scripted turn reads a file
// holding a fake token (d-credentials-readable: one plain tool event, nothing
// else), asks one DSH native question (headless mounts no answerer, so the
// answer ends no-provider), writes with the file tool, writes through the
// shell (the guard denies that on every route), and reads again. The
// probe-sessions overlay gives the loop board its session controller, so the
// board's service is there and the row hands its daily self-check entry over;
// /glm-status and /hourness-status read the row's line in the health table.
const METRICS_ROW_ENABLED = ['- id: glm-hourness/metrics', '  disabled: false']
const ASK_USER_ROW = ['- insert:', '    - id: glm-hourness-probe/ask-user', "      name: '@deepseek-ai/dsh-tool-ask-user'"]
const metricsProject = rulesGateProject('metrics')
mkdirSync(join(metricsProject.ws, 'docs', 'graph'), { recursive: true })
const metricsStopSet = metricsProject.ready ? await openRulesBoard({ projectRoot: metricsProject.ws }).apply('human', { op: 'peak-mode-set', level: 'stop' }) : undefined
const metricsPlainProject = rulesGateProject('non-glm-metrics')
const metricsTokenDir = join(runDir, 'metrics', 'dsh-home', 'credentials')
mkdirSync(metricsTokenDir, { recursive: true })
const metricsTokenFile = join(metricsTokenDir, 'tokens.json')
const METRICS_TOKEN = 'DSH-PROBE-FAKE-TOKEN-0123456789abcdef'
writeFileSync(metricsTokenFile, `${JSON.stringify({ token: METRICS_TOKEN })}\n`)
const metricsScript = (project, write, shell) => [
  { tool: { name: 'Read', arguments: { file_path: metricsTokenFile } } },
  { tool: { name: 'ask_user_question', arguments: { questions: [{ id: 'q-probe', question: '探针要选哪一项？', options: [{ label: 'A' }, { label: 'B' }] }] } } },
  { tool: { name: write, arguments: { file_path: join(project.ws, 'scratch.txt'), content: 'probe\n' } } },
  { tool: { name: shell, arguments: shell === 'Bash' ? { command: `Set-Content -Path '${join(project.ws, 'blocked.txt')}' -Value probe`, timeout: 30000 } : { command: `Set-Content -Path '${join(project.ws, 'plain.txt')}' -Value probe`, description: 'probe: write a file through the shell' } } },
  { tool: { name: 'Read', arguments: { file_path: join(project.ws, 'README.md') } } },
  { text: 'done', status: true, line: '/hourness-status' },
]
const METRICS_TASK = 'Read a file, ask one question, write a file, write one through the shell, read again, then reply done.'
const metricsGlm = runScenario('metrics', 'glm-5.3', metricsScript(metricsProject, 'Write', 'Bash'), METRICS_TASK, [...METRICS_ROW_ENABLED, ...clockRow(PEAK_AT), ...SESSIONS_ROW, ...ASK_USER_ROW], metricsProject.ws)
const metricsPlain = runScenario('non-glm-metrics', 'deepseek-probe', metricsScript(metricsPlainProject, 'write', 'pwsh'), METRICS_TASK, [...METRICS_ROW_ENABLED, ...clockRow(PEAK_AT), ...SESSIONS_ROW, ...ASK_USER_ROW], metricsPlainProject.ws)

// Acceptance 12: two processes append 5000 events each to one journal at the
// same time, through the library entry a one-shot process uses (§5.2), and
// both journals come out complete.
const concurrentDir = join(runDir, 'metrics-concurrent', 'ws')
mkdirSync(concurrentDir, { recursive: true })
if (spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: concurrentDir }).status !== 0) throw new Error('probe: metrics-concurrent git init failed')
const concurrentScript = join(runDir, 'metrics-concurrent', 'append.mjs')
// A file URL: the run directory is under the temporary directory, which need not share a drive with the checkout.
const concurrentLibrary = pathToFileURL(join(repo, 'packages', 'hourness', 'dist', 'metrics', 'library.js')).href
writeFileSync(concurrentScript, `import { appendEvents } from ${JSON.stringify(concurrentLibrary)}
const events = Array.from({ length: 5000 }, (_, i) => ({ k: 'count', by: 'guard', body: { what: \`w-\${process.pid}-\${i}\`, value: i } }))
const result = await appendEvents(process.argv[2], events)
console.log(JSON.stringify({ written: result.written, rejected: result.rejected, error: result.error ?? null }))
`)
const runAppend = () => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [concurrentScript, slash(concurrentDir)])
  let out = ''
  child.stdout.on('data', chunk => { out += chunk })
  child.stderr.on('data', chunk => { out += chunk })
  child.on('close', () => {
    try { resolve(JSON.parse(out.trim().split('\n').at(-1))) }
    catch { reject(new Error(`append child failed: ${out.slice(0, 300)}`)) }
  })
})
const concurrentResults = await Promise.all([runAppend(), runAppend()])
const concurrentJournal = await readLog(concurrentDir)
const concurrentFindings = await checkLog(concurrentDir)

// The two runs' journals, read with the row's own reader.
const metricsGlmJournal = await readLog(metricsProject.ws)
const metricsPlainJournal = await readLog(metricsPlainProject.ws)

/**
 * The checks both runs must satisfy (acceptance 1, 2's tool half, 4's
 * question half, 18, 19, 23): one llm per request with the route and the
 * usage, the steps in order, one said, the question pair, the tool events
 * with their outcome and hashes, the files where they belong and nowhere
 * else, and the health line that says what the row did.
 */
function metricsChecks(label, run, journal, project, options) {
  const main = run.steps[0]?.sessionId
  const own = journal.events.filter(event => event.sid === main)
  const llm = own.filter(event => event.k === 'llm')
  const tool = own.filter(event => event.k === 'tool')
  const said = own.filter(event => event.k === 'said')
  const asks = own.filter(event => event.k === 'ask')
  const answers = own.filter(event => event.k === 'answer')
  const commands = own.filter(event => event.k === 'command')
  const turns = own.filter(event => event.k === 'turn')
  const sessions = own.filter(event => event.k === 'session')
  const ofKind = (events, name) => events.find(event => event.body?.name === name)
  const shellOut = ofKind(tool, options.shell)?.body?.out
  const tokenRead = ofKind(tool, 'Read')
  const health = healthOf(run)
  const userHome = join(runDir, label, 'dsh-home')
  const userMetrics = existsSync(userHome) ? readdirSync(userHome).filter(entry => entry.startsWith('metrics')) : []
  const llmDir = join(project.ws, '.llm')
  const metricsNames = readdirSync(llmDir).filter(entry => entry.startsWith('metrics')).sort()
  const journalText = JSON.stringify(journal.events)
  const calls = llm.filter(event => event.body.purpose === undefined)
  const purposes = llm.filter(event => event.body.purpose !== undefined)
  const finCounts = calls.reduce((counts, event) => { counts[event.body.fin] = (counts[event.body.fin] ?? 0) + 1; return counts }, {})
  return [
    [`${label}: the run exits clean and the row says nothing on stderr`, run.status === 0 && !stderrOf(label).includes('dsh-glm-hourness/metrics'), `exit ${run.status}; ${stderrOf(label).split('\n').find(line => line.includes('metrics')) ?? 'no stderr line mentions metrics'}`],
    [`${label}: one llm event per request with the route, the usage and the duration, plus the one purpose call (the session title)`, calls.length === run.steps.length && purposes.length === 1 && [...calls, ...purposes].every(event => event.body.provider === options.provider && event.body.model === options.model && (event.body.ms ?? -1) >= 0 && (event.body.input ?? -1) >= 0 && (event.body.output ?? -1) >= 0), `${calls.length} calls + ${purposes.length} purpose (${purposes[0]?.body?.purpose ?? 'none'}) of ${run.steps.length} request(s); routes ${[...new Set(llm.map(event => `${event.body.provider}/${event.body.model}`))].join(', ')}`],
    [`${label}: the steps line up with the scripted turns, and the reply ends stop`, isDeepStrictEqual(calls.map(event => event.body.step), calls.map((_event, index) => index + 1)) && calls.every(event => event.body.turn === 1) && finCounts.stop === 1 && finCounts['tool-calls'] === run.steps.length - 1, `steps ${JSON.stringify(calls.map(event => event.body.step))}; fin ${JSON.stringify(finCounts)}`],
    [`${label}: one said for the task message, counted not read`, said.length === 1 && (said[0]?.body?.units ?? 0) > 0 && said[0]?.body?.source === 'user' && (said[0]?.body?.attachments ?? -1) === 0, JSON.stringify(said[0]?.body ?? null)],
    [`${label}: the native question is one ask and one answer with the same q, ending no-provider`, asks.length === 1 && answers.length === 1 && asks[0]?.body?.q === answers[0]?.body?.q && asks[0]?.body?.qs === 1 && asks[0]?.body?.opts === 2 && answers[0]?.body?.end === 'no-provider' && answers[0]?.body?.pick === undefined, `ask ${JSON.stringify(asks[0]?.body ?? null)}; answer ${JSON.stringify({ q: answers[0]?.body?.q, end: answers[0]?.body?.end })}`],
    [`${label}: one tool event per scripted call, with the outcome the route decides`, tool.length === 5 && tool.every(event => (event.body?.call ?? '').length > 0) && shellOut === options.shellOut && ofKind(tool, 'ask_user_question')?.body?.cat === 'question' && tokenRead?.body?.cat === 'read' && tokenRead?.body?.out === 'ok' && /^[0-9a-f]{12}$/.test(tokenRead?.body?.target ?? ''), `tool ${tool.map(event => `${event.body?.name}:${event.body?.out}`).join(', ')}`],
    [`${label}: the file write is hashed under the project key, the shell names its first word`, /^[0-9a-f]{12}$/.test(ofKind(tool, options.write)?.body?.target ?? '') && ofKind(tool, options.shell)?.body?.cmd === 'set-content', `targets ${JSON.stringify(tool.map(event => event.body?.target))}; cmd ${ofKind(tool, options.shell)?.body?.cmd}`],
    [`${label}: the read of the fake-token file is one plain tool event; no journal line carries the token or the file name (acceptance 23)`, !journalText.includes(METRICS_TOKEN) && !journalText.includes('tokens.json'), `token hits ${journalText.includes(METRICS_TOKEN)}, name hits ${journalText.includes('tokens.json')}, rule events ${own.filter(event => event.k === 'rule').length}`],
    [`${label}: the turn opened and closed, the command ran and settled, and one session opened`, turns.length === 2 && turns.every(event => event.body.turn === 1) && turns[0]?.body?.phase === 'start' && turns[1]?.body?.phase === 'end' && commands.length === 2 && commands[0]?.body?.phase === 'run' && commands[1]?.body?.phase === 'done' && sessions.length === 1, `turns ${turns.length}; commands ${commands.map(event => event.body?.phase).join(',')}; sessions ${sessions.length}`],
    [`${label}: the health table lists the row as in effect, writing and with nothing to report (acceptance 20's hand-off)`, health.metrics !== undefined && health.metrics.status === '生效' && health.metrics.reason.includes('指标记入') && health.metrics.reason.includes('自查条目已交给循环板') && !health.metrics.reason.includes('无项目') && !health.metrics.reason.includes('拒收') && !health.metrics.reason.includes('接缝没装上'), healthLine(health, 'metrics') + ` (${health.metrics?.reason ?? ''})`],
    [`${label}: the project keeps metrics/, the manifest and the key; the user-level directory gains no metrics file (acceptance 18)`, isDeepStrictEqual(metricsNames, ['metrics', 'metrics-key', 'metrics-manifest.jsonl']) && userMetrics.length === 0, `${JSON.stringify(metricsNames)}; user-level ${JSON.stringify(userMetrics)}`],
    ...(options.route === 'glm' ? [[`${label}: the stop level held (the person set it through the board) and the row wrote anyway (acceptance 19)`, metricsStopSet?.ok === true && run.steps.length > 0 && peakNotices(run.steps[0]).length === 1 && peakNotices(run.steps[0])[0]?.text === STOP_NOTICE && calls.length === run.steps.length, `set ${metricsStopSet?.ok === true}; notice ${(peakNotices(run.steps[0])[0]?.text ?? 'none').slice(0, 60).replace(/\n/g, ' ')}; calls ${calls.length}`]] : []),
  ]
}
const metricsCheckList = [
  ...metricsChecks('metrics', metricsGlm, metricsGlmJournal, metricsProject, { provider: 'glm-probe', model: 'glm-5.3', write: 'Write', shell: 'Bash', shellOut: 'denied', route: 'glm' }),
  ...metricsChecks('non-glm-metrics', metricsPlain, metricsPlainJournal, metricsPlainProject, { provider: 'glm-probe', model: 'deepseek-probe', write: 'write', shell: 'pwsh', shellOut: 'denied', route: 'plain' }),
]
const metricsConcurrentChecks = [
  ['metrics-concurrent: both one-shot processes wrote their 5000 events and left nothing rejected (the writer counts its own start and stop in `written`)', concurrentResults.every(result => result.written === 5002 && result.rejected === 0 && result.error === null), JSON.stringify(concurrentResults)],
  ['metrics-concurrent: all 10004 lines parse (10000 events plus the start and stop of both writers), every writer sequence is complete, the chain recomputes and no writer is lost (acceptance 12)', concurrentJournal.problems.length === 0 && concurrentJournal.events.length === 10_004 && concurrentFindings.missing.length === 0 && concurrentFindings.chainBreaks.length === 0 && concurrentFindings.duplicates === 0 && concurrentFindings.noStop.length === 0 && concurrentFindings.unreadable.length === 0, `events ${concurrentJournal.events.length}; problems ${JSON.stringify(concurrentJournal.problems)}; writers ${concurrentJournal.events.filter(event => event.k === 'start').length} start / ${concurrentJournal.events.filter(event => event.k === 'stop').length} stop; findings missing ${concurrentFindings.missing.length} chain ${concurrentFindings.chainBreaks.length} noStop ${concurrentFindings.noStop.length}`],
]

// The journal's own rule on the real host (metrics design §12 step 7's L3,
// acceptance 22's M4 half; docs/ORCHESTRATION.md §10.6): in a scratch git
// workspace the scripted GLM turn writes a note into .llm/metrics/ with the
// file tool and clears the journal through `cmd /d /s /c`, the way Node
// starts cmd; metrics-files-only refuses both (what cmd runs is judged as
// text), each refusal one violation line and one `rule` event pointing at
// it. The probe-lift overlay plays the human; the next turn lifts the rule
// with guard_lift on those words (one `lift` event), and the same note is
// written.
const metricsRuleDir = join(runDir, 'metrics-rule')
const metricsRuleWs = join(metricsRuleDir, 'ws')
mkdirSync(metricsRuleWs, { recursive: true })
writeFileSync(join(metricsRuleWs, 'README.md'), 'probe workspace\n')
const metricsRuleGitReady = initRepo(metricsRuleWs)
const metricsRuleNote = join(metricsRuleWs, '.llm', 'metrics', 'probe-note.txt')
const METRICS_RULE_WORDS = '指标那条先别拦了'
const metricsRuleRow = [
  '- insert:',
  '    - id: glm-hourness-probe/lift',
  `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-lift.mjs')))}`,
  '      inject: [tools]',
  `      config: { out: ${JSON.stringify(slash(join(metricsRuleDir, 'lift.jsonl')))} }`,
]
const metricsRuleRun = runScenario('metrics-rule', 'glm-5.3', [
  { tool: { name: 'Write', arguments: { file_path: metricsRuleNote, content: 'probe\n' } } },
  { tool: { name: 'Bash', arguments: { command: 'cmd /d /s /c "rd /s /q .llm\\metrics"', timeout: 30000 } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'probe_say', input: { text: METRICS_RULE_WORDS, rpcId: 'probe-metrics-lift' } } } },
  { text: 'The metrics rule blocked me; I asked the human.' },
  { tool: { name: 'LocalToolSearch', arguments: { query: 'select:guard_lift', max_results: 5 } } },
  { tool: { name: 'DeferredToolCall', arguments: { name: 'guard_lift', input: { rule: METRICS_FILES_ONLY, words: METRICS_RULE_WORDS } } } },
  { tool: { name: 'Write', arguments: { file_path: metricsRuleNote, content: 'probe\n' } } },
  { text: 'done', status: true },
], 'Write a note into the metrics journal directory, then clear the journal through cmd. When the human allows it, lift the rule with guard_lift and write the note again.', [...METRICS_ROW_ENABLED, ...metricsRuleRow], metricsRuleWs)
const metricsRuleResult = index => lastToolResult(metricsRuleRun.steps[index])
// The metrics row writes its denials into the project's own violation journal; the overlay's data rows move only
// the other rows' journals under home/, so the guard row's follow-ups of these denials are there.
const metricsRuleDenials = jsonl(join(metricsRuleWs, '.llm', 'audit', 'violations.jsonl')).filter(record => record.kind === undefined && record.rule === METRICS_FILES_ONLY)
const metricsRuleJournal = await readLog(metricsRuleWs)
const metricsRuleEvents = metricsRuleJournal.events.filter(event => event.k === 'rule' && event.body.rule === METRICS_FILES_ONLY)
const metricsRuleLifts = metricsRuleJournal.events.filter(event => event.k === 'lift')
const metricsRuleBlocked = result => result?.isError === true && result.text.includes(`Rule ${METRICS_FILES_ONLY} blocks`)
const metricsRuleStderr = stderrOf('metrics-rule')
const metricsRuleChecks = [
  ['metrics-rule: the run in its scratch git workspace exits clean with nothing from the metrics or guard rows on stderr', metricsRuleGitReady && metricsRuleRun.status === 0 && metricsRuleRun.steps.length === 8 && !metricsRuleStderr.includes('dsh-glm-hourness/metrics') && !metricsRuleStderr.includes('dsh-glm-hourness/guard'), `exit ${metricsRuleRun.status}, git ${metricsRuleGitReady}, ${metricsRuleRun.steps.length} step(s); ${metricsRuleStderr.split('\n').find(line => line.includes('dsh-glm-hourness/')) ?? 'no stderr line from the packages'}`],
  ['metrics-rule: the file write into .llm/metrics/ and the journal delete through cmd /d /s /c are both refused by metrics-files-only, and the journal directory is still there', metricsRuleBlocked(metricsRuleResult(1)) && metricsRuleBlocked(metricsRuleResult(2)) && existsSync(join(metricsRuleWs, '.llm', 'metrics')), `write ${(metricsRuleResult(1)?.text ?? 'no result').slice(0, 70).replace(/\n/g, ' ')}; cmd ${(metricsRuleResult(2)?.text ?? 'no result').slice(0, 70).replace(/\n/g, ' ')}`],
  ['metrics-rule: each refusal is one violation line and one rule event by guard with effect deny whose ref is that line\'s key', metricsRuleDenials.length === 2 && metricsRuleEvents.length === 2 && metricsRuleEvents.every(event => event.by === 'guard' && event.body.effect === 'deny') && isDeepStrictEqual(new Set(metricsRuleEvents.map(event => event.body.ref)), new Set(metricsRuleDenials.map(record => keyOf(record)))), `${metricsRuleDenials.length} line(s), ${metricsRuleEvents.length} rule event(s); refs ${JSON.stringify(metricsRuleEvents.map(event => event.body.ref))}`],
  ['metrics-rule: guard_lift lifts the rule on the human\'s words, one lift event via chat counts them, and the same note is then written with no third refusal', metricsRuleResult(6)?.isError !== true && metricsRuleResult(6)?.text.includes('"outcome":"lifted"') === true && metricsRuleLifts.length === 1 && isDeepStrictEqual(metricsRuleLifts[0]?.body, { rule: METRICS_FILES_ONLY, action: 'lift', via: 'chat', units: [...METRICS_RULE_WORDS].length }) && metricsRuleResult(7)?.isError !== true && existsSync(metricsRuleNote) && metricsRuleEvents.length === 2, `lift ${(metricsRuleResult(6)?.text ?? 'no result').slice(0, 70).replace(/\n/g, ' ')}; lift events ${JSON.stringify(metricsRuleLifts.map(event => event.body))}; note ${existsSync(metricsRuleNote)}`],
]

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
  ['hourness-only: a native write into the graph is denied by graph-files-only, a shell write by file-tools-only in native names; neither file is written and both denial records are tagged other (the follow-up records the recorder adds carry a kind)', hournessOnlyWrite?.isError === true && hournessOnlyWrite.text.includes('inside the project graph') && !existsSync(hournessOnlyNode) && hournessOnlyPwsh?.isError === true && hournessOnlyPwsh.text.includes(RIGHT_PATH_NATIVE) && !existsSync(hournessOnlyShell) && hournessOnlyViolations.filter(record => record.kind === undefined).map(record => `${record.rule}:${record.tool}:${record.scope}`).join(',') === 'graph-files-only:write:other,file-tools-only:pwsh:other', `records: ${hournessOnlyViolations.map(record => `${record.kind ?? 'denial'}:${record.rule}:${record.tool ?? ''}:${record.scope ?? ''}`).join(', ') || 'none'}; shell file ${existsSync(hournessOnlyShell)}`],
  ['hourness-only: the system prompt declares the workspace rules in native names, graph-files-only included', hournessOnlyFirst?.system.includes(GUARD_SECTION) === true && hournessOnlyFirst.system.includes('\n- Modify files and code only with the dedicated write/edit tools.') && hournessOnlyFirst.system.includes(GRAPH_FILES_LINE), hournessOnlyFirst === undefined ? 'no request' : `section at ${hournessOnlyFirst.system.indexOf(GUARD_SECTION)}`],
  ['hourness-only: /hourness-status lists the orchestration rows and the GLM package as one line not loaded', hournessOnlyStatus?.kind === 'success' && onlyOneLoaded(hournessOnlyHealth, 'hourness', 'glm'), `${hournessOnlyStatus?.kind ?? 'not run'}; ${JSON.stringify(hournessOnlyHealth[WHOLE] ?? null)}`],
  ['env-notice: the first request carries the wrapped environment notice — the tool line, the checks line of a headless host (no loop board), the scratch line', envNoticeFirst !== undefined && typeof envNoticeFirst.text === 'string' && envNoticeFirst.text.startsWith('<system-reminder>\nProject tools (graph node env). Use these before writing your own.\n- ESLint [tool-1]: npm run lint\n') && envNoticeFirst.text.includes(NO_BOARD_LINE) && envNoticeFirst.text.includes(SCRATCH_LINE) && envNoticeFirst.text.endsWith('\n</system-reminder>'), envNoticeFirst === undefined ? 'no notice in request 1' : envNoticeFirst.text.slice(0, 140).replace(/\n/g, ' | ')],
  ['env-notice: the second request does not repeat the notice (the first one persists in the session)', envNoticeRun.steps.length === 2 && envNoticeRepeat === 1 && envNoticeLast?.source !== 'hourness-env', `hourness-env messages in request 2: ${envNoticeRepeat}; last: ${JSON.stringify({ source: envNoticeLast?.source, text: String(envNoticeLast?.text ?? '').slice(0, 60) })}`],
  ['env-check-command: glmHournessEnv reads the check line without when as it stands on the approved node, and it is not M4\'s own', envCheckCommand?.service === true && isDeepStrictEqual(envCheckCommand.command, { tool: 'tool-1', check: 'lint', title: 'Lint：lint', argv: ['node', 'lint.mjs', '{files}'], format: 'lines', own: false }), `exit ${envCheckRun.status}; ${JSON.stringify(envCheckCommand ?? null)}`],
  ['env-check-command: the env row hands the board the event env.files-edited', envCheckContribute !== undefined && envCheckContribute.source.plugin === 'dsh-hourness' && isDeepStrictEqual(envCheckContribute.events, ['env.files-edited']), JSON.stringify(envCheckContribute ?? null)],
  ['env-check-command: each step after a write emits env.files-edited once, the file relative to the checkout root, keyed files-edited:<session>:<turn>-<step>', envCheckRun.steps.length === 4 && envCheckEmits.length === 2 && isDeepStrictEqual(envCheckEmits.map(event => event.payload?.files), [['a.txt'], ['-c.txt']]) && envCheckEmits.every(event => sameDir(event.payload?.root, envCheckWs) && event.payload?.truncated === false && sameDir(event.cwd, envCheckWs) && typeof event.session === 'string' && new RegExp(`^files-edited:${event.session}:\\d+-\\d+$`).test(event.key)) && new Set(envCheckEmits.map(event => event.key)).size === 2, `${envCheckRun.steps.length} requests; ${JSON.stringify(envCheckEmits.map(event => ({ key: event.key, files: event.payload?.files, root: event.payload?.root })))}`],
  ['env-check-command: no checks reminder is injected (M4 does not run a check line without when)', envCheckRun.steps.length > 0 && envCheckReminders === 0, `hourness-checks messages: ${envCheckReminders}`],
  ['env-checks-timeout: graph_propose of a tool node under env returns the sentence of its timeout for the check line', envTimeoutResult?.ok === true && isDeepStrictEqual(envTimeoutResult.timeouts, [{ check: 'slow', text: '超时 5 秒（估 1 秒，乘 3 不足 5 秒）' }]), `exit ${envTimeoutRun.status}; ${JSON.stringify(envTimeoutResult?.timeouts ?? envTimeoutText.slice(0, 200))}`],
  ['env-checks-timeout: the workspace timing journal has one estimate with this session, the llm and the time of the propose the engine wrote', envTimeoutLines.length === 1 && envTimeoutLines[0].kind === 'estimate' && envTimeoutLines[0].check === 'tool-1/slow' && envTimeoutLines[0].estimateS === 1 && envTimeoutLines[0].node === 'tool-1' && envTimeoutLines[0].actor === 'llm' && typeof envTimeoutLines[0].session === 'string' && envTimeoutLines[0].session === envTimeoutRun.steps[0]?.sessionId && envTimeoutProposed?.op === 'propose' && envTimeoutLines[0].historyAt === envTimeoutProposed.at && /^[0-9a-f]{8}$/.test(envTimeoutLines[0].argv), `${JSON.stringify(envTimeoutLines)}; session ${envTimeoutRun.steps[0]?.sessionId}; history ${JSON.stringify(envTimeoutProposed ?? null)}`],
  ['env-checks: the environment notice names the check that runs after edits (the board is on)', envChecksEnvNotice?.text?.includes('\nChecks run after each edit (listed on the loop board): lint on *.txt.\n') === true, String(envChecksEnvNotice?.text ?? 'no notice').slice(0, 240).replace(/\n/g, ' | ')],
  ['env-checks: the second request carries the checks notice — one finding on the changed line, the log whose first line is the argument vector, the fix line', envChecksFound.startsWith('<system-reminder>\nChecks after your edits: lint 1 finding.\na.txt:2:1 lint todo found [changed]\nFull output: ') && envChecksFound.endsWith('\nFix the findings on changed lines before you finish; new warnings fail the merge gate.\n</system-reminder>') && envChecksLogPath !== undefined && existsSync(join(envChecksWs, envChecksLogPath)) && readFileSync(join(envChecksWs, envChecksLogPath), 'utf8').startsWith('$ node lint.mjs a.txt · program '), `exit ${envChecksRun.status}; ${envChecksFound.slice(0, 300).replace(/\n/g, ' | ')}`],
  ['env-checks: the fix is one line of zeros in the third request; the step without edits and the clean edits after zeros carry none', envChecksRun.steps.length === 6 && envChecksNotices[0] === undefined && envChecksNotices[2]?.text === '<system-reminder>\nChecks after your edits: lint 0.\n</system-reminder>' && envChecksNotices.slice(3).every(notice => notice === undefined), JSON.stringify(envChecksNotices.map(notice => notice?.text ?? null))],
  ['env-checks: lint.mjs receives each file as one argument, b$(echo x).txt as it is and -c.txt as ./-c.txt, and nothing ran the $(…)', isDeepStrictEqual(envChecksArgs, [['a.txt'], ['a.txt'], ['b$(echo x).txt'], ['./-c.txt']]) && !existsSync(join(envChecksWs, 'x')), JSON.stringify(envChecksArgs)],
  ['env-checks: the env row hands the board env.checks-after-edit with its five own rules and records one run per delivery', envChecksContribute !== undefined && isDeepStrictEqual(envChecksContribute.entries, [{ id: 'env.checks-after-edit', ownRules: checksOwnRules() }]) && isDeepStrictEqual(envChecksRuns.map(run => [run.entry, run.outcome]), [['env.checks-after-edit', 'reported'], ['env.checks-after-edit', 'ran'], ['env.checks-after-edit', 'ran'], ['env.checks-after-edit', 'ran']]), JSON.stringify({ entries: envChecksContribute?.entries ?? null, runs: envChecksRuns })],
  ['env-checks: each step with an edit emits env.files-edited once, the files relative to the checkout root', isDeepStrictEqual(envChecksEmits.map(event => event.payload?.files), [['a.txt'], ['a.txt'], ['b$(echo x).txt'], ['-c.txt']]) && envChecksEmits.every(event => sameDir(event.payload?.root, envChecksWs) && new RegExp(`^files-edited:${event.session}:\\d+-\\d+$`).test(event.key)), JSON.stringify(envChecksEmits.map(event => ({ key: event.key, files: event.payload?.files })))],
  ['env-checks-timeout: the first run is stopped at 5 s; the notice names the floor, the log and the next limit of 15 s', /^<system-reminder>\nslow did not finish: stopped after 5\.\d s \(limit 5 s, the floor: three times its estimate of 1 s is less; log \S+\)\. It runs again after your next edit, with a limit of 15 s\.\n<\/system-reminder>$/.test(envTimeoutStopped), `exit ${envTimeoutRun2.status}; ${envTimeoutStopped.slice(0, 300)}`],
  ['env-checks-timeout: the journal holds the estimate, the value from it (that session, the llm), the timeout, the censored run, the harness\'s 15 s and the finished run', isDeepStrictEqual(envTimeoutKinds, ['estimate', 'value', 'timeout', 'run', 'value', 'run']) && envTimeoutFirstValue?.limitMs === 5000 && envTimeoutFirstValue.source?.by === 'estimate' && envTimeoutFirstValue.source.actor === 'llm' && envTimeoutFirstValue.source.session === envTimeoutRun.steps[0]?.sessionId && envTimeoutFirstValue.source.at === envTimeoutProposed?.at && envTimeoutStop?.limitMs === 5000 && envTimeoutStop.elapsedMs >= 5000 && envTimeoutCensored?.ms === 5000 && envTimeoutCensored.censored === true && envTimeoutHarness?.limitMs === 15000 && envTimeoutHarness.previousMs === 5000 && envTimeoutHarness.source?.by === 'harness' && envTimeoutHarness.source.runs.includes(5000) && envTimeoutFinished?.kind === 'run' && envTimeoutFinished.ms >= 6500 && envTimeoutFinished.ms < 15000 && envTimeoutFinished.censored === undefined, JSON.stringify(envTimeoutJournal2)],
  ['env-checks-timeout: the board records the timeout as failed with its limit and time, then the run that finished', envTimeoutRuns.length === 2 && envTimeoutRuns[0]?.outcome === 'failed' && /^slow: timeout 5s\/5\.\ds$/.test(envTimeoutRuns[0]?.reason ?? '') && envTimeoutRuns[1]?.outcome === 'ran', JSON.stringify(envTimeoutRuns)],
  ['env-checks-ceiling: an estimate of 25 s is held at the 60 s ceiling: the value line records the 75 s wanted', envCeilingRun.status === 0 && envCeilingJournal[0]?.kind === 'value' && envCeilingJournal[0].limitMs === 60000 && envCeilingJournal[0].capped?.wantedMs === 75000 && envCeilingJournal[0].cap?.by === 'default', `exit ${envCeilingRun.status}; ${JSON.stringify(envCeilingJournal.slice(0, 2))}`],
  ['env-checks-ceiling: the root agent\'s environment notice gets the held-at-its-ceiling line with the full key, and check_limit is in its tool face', envCeilingMainNotices.some(text => text.split('\n').includes(ENV_CEILING_HELD)) && names(envCeilingMain[0]).has('check_limit'), envCeilingMainNotices.map(text => text.slice(0, 400).replace(/\n/g, ' | ')).join(' || ')],
  ['env-checks-ceiling: check_limit raises the ceiling to 120 s and limits.jsonl has the raise with the reason and the session; the next notice has no held line', envCeilingLimitResult?.outcome === 'raised' && envCeilingLimitResult.capS === 120 && envCeilingLimitResult.previousCapS === 60 && envCeilingLimitLines.length === 1 && envCeilingLimitLines[0].action === 'raise' && envCeilingLimitLines[0].check === 'tool-1/full' && envCeilingLimitLines[0].reason === ENV_CEILING_REASON && envCeilingLimitLines[0].session === envCeilingStarted?.parentId && !(envNoticesOf(envCeilingMain.slice(-1)).at(-1) ?? '').includes('held at its ceiling'), `${JSON.stringify(envCeilingLimitResult ?? lastToolResult(envCeilingMain[3])?.text ?? null)}; ${JSON.stringify(envCeilingLimitLines)}`],
  ['env-checks-ceiling: a subagent\'s environment notice has the checks line and no held line', envCeilingStarted !== undefined && envCeilingChild.length > 0 && envCeilingChildNotices.length > 0 && envCeilingChildNotices.every(text => text.includes('Checks run after each edit (listed on the loop board): full on *.txt.') && !text.includes('held at its ceiling')), `${envCeilingChild.length} child request(s); ${envCeilingChildNotices.map(text => text.slice(0, 300).replace(/\n/g, ' | ')).join(' || ')}`],
  ['env-notice: the row appended .llm/ to the clone\'s .git/info/exclude and check-ignore verifies it', envIgnored === 0 && envExclude.split('\n').filter(line => line.trim() === '.llm/').length === 1, `check-ignore exit ${envIgnored}; exclude lines: ${envExclude.split('\n').filter(line => line.trim() === '.llm/').length}`],
  titleCheck('client-modules (probe-full)', clientModules.steps[0]?.meta, ['glm', 'hourness']),
  titleCheck('glm-only', glmOnly.steps[1]?.meta, ['glm']),
  titleCheck('hourness-only', hournessOnly.steps[3]?.meta, ['hourness']),
  ['client-modules: mounted on probe-full with glm-ui enabled, the service composes both packages\' client faces, each once, without an error', Array.isArray(clientGraph?.entries) && CLIENT_PACKAGES.every(name => clientGraph.entries.filter(id => id === name).length === 1) && !stderrOf('client-modules').includes('client-modules') && quiet('client-modules'), `${JSON.stringify(clientGraph ?? null)}; stderr ${stderrOf('client-modules').length} byte(s)`],
  ['hourness-only: /hourness lists calls and tokens without the pricing service; no skipped bundle and no row warning', hournessOnlyReport?.kind === 'success' && hournessOnlyPanel.startsWith('- 没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token') && /^- deepseek-probe：\d+ 次 · 未命中输入 \d+/m.test(hournessOnlyPanel) && quiet('hourness-only'), `${hournessOnlyReport?.kind ?? 'not run'}; ${JSON.stringify(hournessOnlyPanel.split('\n').slice(0, 3))}`],
  [`net: the recorder was live in the host process of every scenario (${scenarioNames.length}): each net log holds the recorder's own request to ${CANARY.origin}${CANARY.path}`, scenarioNames.length > 0 && scenariosWithoutCanary.length === 0, scenariosWithoutCanary.length === 0 ? `${recordedRequests} request(s) recorded in all` : `no canary in: ${scenariosWithoutCanary.join(', ')}`],
  ['net: no scenario sent a request to /api/monitor (the glm-login home of the probe holds no credential, so the quota reader sends nothing)', scenariosWithoutCanary.length === 0 && monitorRequests.length === 0, monitorRequests.join(', ') || `none among ${recordedRequests} recorded request(s)`],
  ['glm-only: /glm-status has the peak line and the line saying not logged in between the credential line and the health table', glmOnlyCredential.startsWith('glm-zcode：未登录（套餐 coding-plan）') && PEAK_LINE.test(glmOnlyQuota.split('\n')[0] ?? '') && glmOnlyQuota.split('\n').slice(1).join('\n') === NOT_LOGGED_IN_LINE && glmOnlyTable.startsWith('## 行健康'), JSON.stringify(glmOnlyQuota)],
  ['hourness-only: /hourness lists tokens and has no peak line, no quota section, no GLM loop-board entry and no warning', hournessOnlyReport?.kind === 'success' && hournessOnlyPanel.startsWith('- 没有计价服务') && /^- deepseek-probe：\d+ 次 · 未命中输入 \d+/m.test(hournessOnlyPanel) && !PEAK_LINE_ANYWHERE.test(hournessOnlyText) && !hournessOnlyText.includes('## 额度\n') && QUOTA_TEXT_MARKERS.every(marker => !hournessOnlyText.includes(marker)) && LOOP_ENTRY_IDS.every(id => !hournessOnlyText.includes(id)) && !hournessOnlyText.includes('[GLM]') && quiet('hourness-only'), `${hournessOnlyReport?.kind ?? 'not run'}; headings ${hournessOnlyText.split('\n').filter(line => line.startsWith('## ')).join(' | ')}`],
  ['both packages: /hourness ends in the quota section and it says not logged in', glmHourness?.kind === 'success' && isDeepStrictEqual(glmQuotaSection, [NOT_LOGGED_IN_LINE]), JSON.stringify(glmQuotaSection)],
  [`quota: none of the ${quotaTextBodies.length} model requests of the ${scenarioNames.length} scenarios (system prompt, tools, messages) contains the quota section text`, quotaTextBodies.length > 0 && quotaTextHits.length === 0, quotaTextHits.length === 0 ? `markers ${QUOTA_TEXT_MARKERS.join(' ')}` : `in: ${[...new Set(quotaTextHits)].join(', ')}`],
  ['glm boot: the runtime reached the probe provider', glmFirst !== undefined, `exit ${glm.status}, ${glm.steps.length} step(s)`],
  ['graph live: the session view has the model, the steps of the open turn and the finished Read, nothing running, no focus', panelLive?.model === 'glm-5.3' && panelLive.steps >= 2 && typeof panelLive.turnSince === 'number' && panelLive.tool === null && panelLive.focus === null && liveCalls(panelLive).includes('Read:ok'), JSON.stringify(panelLive)],
  ['graph live: the dispatch parent\'s subagentCatalog names the child; the child view has its own model, the scope-denied Write as an error, and token usage', parentCatalog?.some(entry => entry.id === started?.childId) === true && childLive?.model === 'glm-5.3-flash' && liveCalls(childLive).includes('Write:error') && liveCalls(childLive).includes('Write:ok') && childRead?.tokenUsage !== null, `catalog ${JSON.stringify(parentCatalog)}; child ${childLive?.model ?? 'none'} ${liveCalls(childLive).join(', ')}; tokens ${tokens(childRead?.tokenUsage)} ${JSON.stringify(childRead?.tokenUsage ?? null)}`],
  ['graph row: the copy has a doing leaf task and an approved one; the workspace is a git repository', doingTask !== undefined && focusTask !== undefined && graphGitReady, `doing ${doingTask?.id ?? 'none'}, focus ${focusTask?.id ?? 'none'}, git ${graphGitReady}`],
  ['graph row: activates without warnings; rc.3 takes all 13 graph tools, resident in the GLM face (not deferred)', graphSteps.length > 0 && !graphStderr.includes('dsh-glm-hourness/graph:') && graphFace(graphSteps[0]).length === GRAPH_TOOL_NAMES.length && graphFace(graphSteps[0]).every(tool => tool.deferLoading !== true), `${graphFace(graphSteps[0]).length} graph tool(s); stderr mentions the row: ${graphStderr.includes('dsh-glm-hourness/graph:')}`],
  ['graph row: on a non-GLM route the graph tools are in the face and graph_open answers', GRAPH_TOOL_NAMES.every(name => names(plainGraph.steps[0]).has(name)) && plainGraphOpen?.isError !== true && plainGraphOpen?.text.includes('"items"') === true, `exit ${plainGraph.status}; ${plainGraphOpen?.text.slice(0, 80) ?? 'no result'}`],
  ['graph row: graph_show returns the projection; graph_status done without evidence gets evidence_required', graphResult(1)?.isError !== true && graphResult(1)?.text.includes('"projection"') === true && graphResult(2)?.isError === true && graphResult(2)?.text.includes('evidence_required') === true, `${graphResult(1)?.text.slice(0, 60) ?? 'none'} | ${graphResult(2)?.text.slice(0, 120) ?? 'none'}`],
  ['graph row: the graph_propose schema carries the writing rules and the plain words on title (plain-ui 1.3 §5.3)', graphProposeTitle.includes('title and why are read by the human') && graphProposeTitle.includes('验收 or acceptance -> 怎样算做完'), graphProposeTitle.slice(0, 160) || 'no description'],
  ['graph row: a proposal titled with M3 is written in the first phase and comes back with a code warning', graphResult(11)?.isError !== true && graphProposeWarnings.some(line => line.startsWith('code in node.title')), `${graphResult(11)?.text.slice(0, 200) ?? 'none'}`],
  ['graph row: graph_comment leaves an llm history entry in the copy; the repository graph is unchanged', graphResult(3)?.isError !== true && copyAfter.nodes.get(doingTask?.id ?? '')?.history.at(-1)?.actor === 'llm' && copyAfter.nodes.get(doingTask?.id ?? '')?.history.at(-1)?.text === 'probe comment' && repoGraphBefore === repoGraphAfter, `repo graph ${repoGraphBefore} -> ${repoGraphAfter}`],
  ['graph row: after graph_focus the next request ends with the projection notice (focus); unchanged steps add none; a title edit adds one (changed)', graphNotices(graphSteps[4]).length === 1 && graphSteps[4]?.messages.at(-1)?.source === 'glm-graph-projection' && graphNotices(graphSteps[4])[0]?.projection === 'focus' && graphNotices(graphSteps[5]).length === 1 && graphNotices(graphSteps[6]).length === 1 && graphNotices(graphSteps[7]).length === 2 && graphSteps[7]?.messages.at(-1)?.projection === 'changed' && graphSteps[7]?.messages.at(-1)?.text.includes('probe title') === true, `notices per request: ${graphSteps.map(step => graphNotices(step).map(notice => notice.projection).join('+') || '0').join(', ')}`],
  ['graph row: after a compaction checkpoint the first request carries the projection again (compaction)', reanchored.some(reasons => reasons.includes('compaction')), `${compactGraph.compactions.length} compaction(s); after checkpoints: ${JSON.stringify(reanchored)}`],
  ['graph row: the re-anchoring after the compaction lists graph-files-only with the session\'s denial count from the journal, and the non-goals of the focus\'s goal', (() => {
    const denied = compactViolations.filter(record => record.kind === undefined && record.rule === 'graph-files-only')
    const text = firstReanchor?.text ?? ''
    const nonGoals = focusGoal?.nonGoals ?? []
    return denied.length === 1 && text.includes(DENIED_HEAD) && text.includes(`\n- graph-files-only: ${denied.length}\n`) && (nonGoals.length === 0 || (text.includes(`Non-goals of goal ${focusGoal.id},`) && nonGoals.every(line => text.includes(`\n- ${line}\n`))))
  })(), `journal denials ${compactViolations.filter(record => record.kind === undefined).map(record => record.rule).join(',') || 'none'}; goal ${focusGoal?.id ?? 'none'} with ${focusGoal?.nonGoals?.length ?? 0} non-goal(s); notice tail: ${JSON.stringify((firstReanchor?.text ?? 'no compaction notice').slice(-400))}`],
  ['graph row: a projection that is not a re-anchoring carries no denied rules, also one added after the session\'s graph-files-only denials (the last request\'s changed notice)', (() => {
    const all = graphNotices(graphSteps.at(-1))
    const added = all.length - graphNotices(graphSteps[8]).length
    return all.length > 0 && added > 0 && all.every(notice => notice.projection !== 'compaction' && !notice.text.includes(DENIED_HEAD))
  })(), `notices in the last request: ${graphNotices(graphSteps.at(-1)).map(notice => `${notice.projection}${notice.text.includes(DENIED_HEAD) ? '(denied rules)' : ''}`).join(', ') || 'none'}; after the first denial: ${graphNotices(graphSteps.at(-1)).length - graphNotices(graphSteps[8]).length}`],
  ['graph row: the re-anchoring after the compaction lists the approved norm nodes under the focus\'s goal, one per line (id: title); no other projection lists them', (() => {
    const text = firstReanchor?.text ?? ''
    const listed = focusNorms.length === 0
      ? !text.includes(NORMS_HEAD)
      : text.includes(`\n${NORMS_HEAD} ${focusGoal.id},`) && focusNorms.every(norm => text.includes(`\n- ${norm.id}: ${norm.title}\n`))
    const others = [...graphSteps, ...compactGraph.steps].flatMap(step => graphNotices(step)).filter(notice => notice.projection !== 'compaction')
    return firstReanchor !== undefined && listed && others.length > 0 && others.every(notice => !notice.text.includes(NORMS_HEAD))
  })(), `goal ${focusGoal?.id ?? 'none'} with ${focusNorms.length} norm(s): ${focusNorms.map(norm => norm.id).join(', ') || 'none'}; other projections with norms: ${[...graphSteps, ...compactGraph.steps].flatMap(step => graphNotices(step)).filter(notice => notice.projection !== 'compaction' && notice.text.includes(NORMS_HEAD)).length}`],
  ['host instructions: the first request carries the workspace baseline (agent-instructions) with the user-level $DSH_HOME/AGENTS.md and the project AGENTS.md', bothMarks(instructionsAfterCheckpoint(instructionsMain[0])), `exit ${compactInstructions.status}; first request sources: ${(instructionsMain[0]?.messages ?? []).map(message => message.source).join(',')}`],
  ['host instructions: after every compaction checkpoint the next request carries the baseline again with both files', instructionsCheckpointed.length > 0 && instructionsCheckpointed.every(step => bothMarks(instructionsAfterCheckpoint(step))), `${compactInstructions.compactions.length} compaction(s); baseline messages after the checkpoint per request: ${instructionsCheckpointed.map(step => `${instructionsAfterCheckpoint(step).length}${bothMarks(instructionsAfterCheckpoint(step)) ? '' : '(marks missing)'}`).join(', ') || 'no checkpointed request'}`],
  ['host instructions: the dispatched subagent\'s first request carries the baseline with both files', instructionsChildId !== undefined && bothMarks(instructionsAfterCheckpoint(instructionsChild[0])), `child ${instructionsChildId ?? 'not started'}; ${instructionsChild.length} child request(s); first request sources: ${(instructionsChild[0]?.messages ?? []).map(message => message.source).join(',')}`],
  ['graph row: a goal round carries the projection (goal-round)', graphNotices(graphRoundTwo).some(notice => notice.projection === 'goal-round'), graphRoundTwo === undefined ? `no round 2 request (${graphGoalSteps.length} goal-agent request(s), exit ${graphGoal.status})` : graphNotices(graphRoundTwo).map(notice => notice.projection).join(', ')],
  ['graph row: Write and Bash into the copy\'s node files are denied by graph-files-only and journaled; a write elsewhere runs (the recorder\'s follow-up records carry a kind)', [8, 9].every(index => graphResult(index)?.isError === true && graphResult(index)?.text.includes('inside the project graph') === true) && graphResult(10)?.isError !== true && !existsSync(graphNodeFile) && existsSync(graphNotes) && graphViolations.filter(record => record.rule === 'graph-files-only' && record.kind === undefined).map(record => record.tool).join(',') === 'Write,Bash', `records: ${graphViolations.map(record => `${record.kind ?? 'denial'}${record.rule.startsWith('graph-files-only') ? '' : `(${record.rule})`}${record.mode === 'shadow' ? '(shadow)' : ''}:${record.tool ?? ''}`).join(', ')}`],
  ['graph row: the workspace-change fallback runs and counts the graph tool writes as known (no late record names a node file)', healthOf(graphRun).guard?.reason.includes('事后纠正启用：工作区变更记录') === true && graphViolations.filter(record => record.mode === 'late').every(record => record.paths.every(path => !path.startsWith('docs/graph/'))), JSON.stringify(graphViolations.filter(record => record.mode === 'late').map(record => record.paths))],
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
  ['glm execution: Glob lists both scratch files newest first with ZCode display paths', globResult !== undefined && globResult.isError !== true && globResult.text === 'scratch.txt\nunread.txt', globResult === undefined ? 'no tool result' : globResult.text.slice(0, 160).replace(/\n/g, ' | ')],
  ['glm execution: Grep -i in content mode returns the package name line', grepResult !== undefined && grepResult.isError !== true && grepResult.text === 'package.json:2:  "name": "dsh-glm-hourness",', grepResult === undefined ? 'no tool result' : grepResult.text.slice(0, 100).replace(/\n/g, ' | ')],
  ['glm execution: Bash ran the command through pwsh without a description', bashResult !== undefined && bashResult.isError !== true && bashResult.text.includes('probe-bash'), bashResult === undefined ? 'no tool result' : bashResult.text.slice(0, 100).replace(/\n/g, ' | ')],
  ['glm image: Read keeps the ZCode image line on both models (ZCode does not condition it on image input)', glmTool('Read')?.description.includes(READ_IMAGE_LINE) === true && (flash.steps[0]?.tools ?? []).find(tool => tool.name === 'Read')?.description.includes(READ_IMAGE_LINE) === true, `flash steps: ${flash.steps.length}`],
  ['glm image: on text-only GLM-5.3 read_image refuses the PNG and no image reaches the request', imageRefusal?.isError === true && imageRefusal.text.includes('does not declare image input') && imageFree(glm.steps), imageRefusal === undefined ? 'no tool result' : imageRefusal.text.slice(0, 120).replace(/\n/g, ' ')],
  ['glm-flash image: Read returns the read_image envelope with one image block', flashRead !== undefined && flashRead.isError !== true && flashRead.images === 1 && flashRead.text.includes('<type>image</type>'), flashRead === undefined ? `no tool result (exit ${flash.status})` : `${flashRead.images ?? 0} image(s): ${flashRead.text.slice(0, 80).replace(/\n/g, ' ')}`],
  ['glm-flash wire: the glm-zcode encoder sends the PNG inside tool_result as a base64 image block', flashWire?.images?.length === 1 && flashWire.images[0].where === 'tool_result' && flashWire.images[0].mediaType === 'image/png' && flashWire.images[0].png === true && flashWire.images[0].base64Length > 0, JSON.stringify(flashWire ?? null)],
  ['glm todo: a scripted turn carries two parallel tool calls', todoParallel?.length === 2, `steps: ${todo.steps.length}, calls in the first Read turn: ${todoParallel?.join(', ') ?? 'none'}`],
  ['glm todo: the reminder fires once, before the twelfth request (10 assistant turns after TodoWrite)', todo.steps.length === 12 && todoReminderSteps.length === 1 && todoReminderSteps[0] === 12, `reminder in request(s): ${todoReminderSteps.join(', ') || 'none'} of ${todo.steps.length}`],
  ['glm todo: the reminder is the wrapped ZCode text with the todo echo, after the last tool results', todoNotice !== undefined && todoNotice.text.startsWith("<system-reminder>\nThe TodoWrite tool hasn't been used recently.") && todoNotice.text.endsWith('[1. [in_progress] probe todo]\n</system-reminder>') && todoNoticeIndex > todoLastResult, todoNotice === undefined ? 'no notice' : `${todoNotice.text.slice(-60).replace(/\n/g, ' ')} (at ${todoNoticeIndex}, last tool result at ${todoLastResult})`],
  ['glm peak: with the probe clock at Wednesday 15:00 UTC+8 the first GLM request carries the wrapped peak reminder once, worded by the factory level with the cap of one GLM subagent', peakWindowAt(peak.steps[0]?.clock) === '2026-10-28' && peakFirst.length === 1 && peakFirst[0].text === REDUCE_NOTICE, peak.steps[0] === undefined ? `no request (exit ${peak.status})` : `clock ${new Date(peak.steps[0].clock).toISOString()}, ${peakFirst.length} notice(s): ${(peakFirst[0]?.text ?? '').slice(0, 60).replace(/\n/g, ' ')}`],
  ['glm peak: the reminder persists in the session and is not repeated on later steps', peak.steps.length === 3 && peakNotices(peak.steps.at(-1)).length === 1 && peakCountsMatch(peak), `notices per request: ${peak.steps.map(step => peakNotices(step).length).join(', ')}`],
  ['glm peak (real clock): the GLM scenario carries a reminder exactly for the peak windows its requests fell in', peakCountsMatch(glm), `windows: ${[...new Set(glm.steps.map(step => peakWindowAt(step.clock) ?? 'off-peak'))].join(', ')}; notices per request: ${glm.steps.map(step => peakNotices(step).length).join(', ')}`],
  ['non-glm peak: a non-GLM session in peak hours gets no peak reminder', plainFirst !== undefined && peakWindowAt(plainFirst.clock) === '2026-10-28' && peakNotices(plainFirst).length === 0, plainFirst === undefined ? 'no request' : `clock ${new Date(plainFirst.clock).toISOString()}, ${peakNotices(plainFirst).length} notice(s)`],
  ['glm compact: the summarization request ends with the ZCode compact prompt', compactInstruction?.role === 'user' && compactInstruction.text.startsWith('CRITICAL: Respond with TEXT ONLY.'), compactRequest === undefined ? `no compaction request (exit ${compacted.status})` : compactInstruction?.text.slice(0, 60).replace(/\n/g, ' ')],
  ['glm compact: the checkpoint carries the formatted summary', checkpoint !== undefined && checkpoint.text.includes('Summary:\nprobe summary') && !checkpoint.text.includes('<analysis>'), checkpoint === undefined ? 'no checkpoint in the next request' : checkpoint.text.slice(0, 80).replace(/\n/g, ' ')],
  ['glm compact transcript: with the transcript row enabled the checkpoint\'s summary ends with the ZCode 3.17.1 transcript sentence, right before the closing frame', transcriptPath !== undefined && transcriptCheckpoint.text.includes(`Summary:\nprobe summary${transcriptNote(transcriptPath)}\n</compacted-summary>`), transcriptCheckpoint === undefined ? `no checkpoint (exit ${compactTranscript.status}, ${compactTranscript.compactions.length} compaction(s))` : transcriptCheckpoint.text.slice(-300).replace(/\n/g, ' ')],
  ['glm compact transcript: the sentence names <scenario home>/transcripts/<session id>.txt, which starts with the header line for that session', transcriptPath !== undefined && resolve(transcriptPath) === resolve(transcriptHome, 'transcripts', `${transcriptSession}.txt`) && resolve(transcriptPath).startsWith(`${resolve(transcriptHome, 'transcripts')}${sep}`) && transcriptLines[0]?.startsWith(`Transcript of session ${transcriptSession}, exported `) === true, `${transcriptPath ?? 'no path'}; ${transcriptLines[0]?.slice(0, 120) ?? ''}`],
  ['glm compact transcript: the model\'s Read of the named file returns the export (a recorded request carries that tool result)', transcriptRead !== undefined && transcriptRead.isError !== true, transcriptRead === undefined ? `no tool result with the export text in ${compactTranscript.steps.length} step(s) and ${compactTranscript.compactions.length} compaction(s)` : transcriptRead.text.slice(0, 160).replace(/\n/g, ' | ')],
  ['glm compact transcript: no line of the export is longer than 1000 code points, and the long test:1 line of package.json is split', transcriptText.length > 0 && transcriptLong.length === 0 && transcriptSplit, `${transcriptLines.length} line(s); ${transcriptLong.length} over 1000; split test:1 line ${transcriptSplit}`],
  ['glm compact transcript: the two fake credentials of the task reach the session but not the export, which reads them as [redacted] and counts its replacements in the header; /glm-status gives the same count', transcriptFakesAsked && transcriptFakesLeft === 0 && transcriptText.includes(TRANSCRIPT_FAKES_LINE) && Number(transcriptReplaced) >= TRANSCRIPT_FAKES.length && healthOf(compactTranscript).transcript?.reason.includes(`遮掉 ${transcriptReplaced} 处`) === true, `in the first request: ${transcriptFakesAsked}; left in the export: ${transcriptFakesLeft} of ${TRANSCRIPT_FAKES.length}; redacted task line: ${transcriptText.includes(TRANSCRIPT_FAKES_LINE)}; header count: ${transcriptReplaced ?? 'none'}`],
  ['glm compact transcript: in glm-compact (transcript row disabled, the shipped default) no checkpoint names a transcript', checkpointsOf(compacted).length > 0 && checkpointsOf(compacted).every(message => !message.text.includes(TRANSCRIPT_MARK)), `${checkpointsOf(compacted).length} checkpoint(s)`],
  ['glm compact transcript: /glm-status of the session lists the transcript row in effect with the export it wrote', healthOf(compactTranscript).transcript?.status === ACTED && healthOf(compactTranscript).transcript.reason.startsWith('压缩前导出'), JSON.stringify(healthOf(compactTranscript).transcript ?? null)],
  ['memory usage: one record per GLM step with the request provider, model and session id', glmUsage.length === glm.steps.length && glmUsage.every(record => record.provider === 'glm-probe' && record.model === 'glm-5.3' && typeof record.sessionId === 'string' && record.sessionId.length > 0), `${glmUsage.length} record(s) for ${glm.steps.length} step(s); first: ${JSON.stringify(glmUsage[0] ?? null).slice(0, 120)}`],
  ['memory usage: the compaction call is recorded with purpose compaction', compactUsage.length === compacted.compactions.length && compactUsage.length > 0, `${compactUsage.length} compaction record(s) for ${compacted.compactions.length} request(s)`],
  ...memoryChecks(),
  ...lessonsChecks(),
  ...lessonsFailureChecks(),
  ['data: usage lands only in the user-level directory, never in a project directory or the real one', projectUsage.length === 0 && realUsageBefore === realUsageAfter, `project usage files: ${projectUsage.join(', ') || 'none'}; real ${realUsage}: ${realUsageBefore} -> ${realUsageAfter}`],
  ['guard: a shell write is denied with the four-part correction naming the ZCode tools, and the file is not created', blockedResult?.isError === true && blockedResult.text.includes('Shell file writes are not permitted') && blockedResult.text.includes(RIGHT_PATH_ZCODE) && !existsSync(blocked), blockedResult === undefined ? 'no tool result' : blockedResult.text.slice(0, 100).replace(/\n/g, ' ')],
  ['guard: the denial is journaled in the scenario project directory with rule, tool and the calling agent ids, and the turn end after the reply settles one follow-up as none (m4-gate G2)', glmViolations.length === 2 && glmViolations[0].rule === 'file-tools-only' && glmViolations[0].tool === 'Bash' && typeof glmViolations[0].agentId === 'string' && glmViolations[0].agentId.length > 0 && glmViolations[0].sessionId === glmUsage[0]?.sessionId && glmViolations[1].kind === 'followup' && glmViolations[1].outcome === 'none' && glmViolations[1].rule === 'file-tools-only' && typeof glmViolations[1].denial === 'string' && glmViolations[1].denial.length === 12, `${glmViolations.length} record(s); first: ${JSON.stringify(glmViolations[0] ?? null).slice(0, 140)}`],
  ['guard: the GLM denial is tagged dialect with the route of the step (the dialect claims the agent)', glmViolations[0]?.scope === 'dialect' && glmViolations[0].route?.provider === 'glm-probe' && glmViolations[0].route.model === 'glm-5.3', JSON.stringify({ scope: glmViolations[0]?.scope, route: glmViolations[0]?.route })],
  ['guard: the GLM system prompt declares the active rules (containment and file-tools-only) after the dialect sections', glmFirst?.system.includes(GUARD_SECTION) === true && glmFirst.system.includes('\n- You may only create and modify files inside the user\'s workspace.') && glmFirst.system.includes('\n- Modify files and code only with the dedicated Write/Edit tools.') && glmFirst.system.indexOf(GUARD_SECTION) > glmFirst.system.indexOf('# Context management'), glmFirst === undefined ? 'no request' : `section at ${glmFirst.system.indexOf(GUARD_SECTION)} of ${glmFirst.system.length}`],
  ['guard: the non-GLM system prompt ends with the same rules in native names', plainFirst?.system.includes(GUARD_SECTION) === true && plainFirst.system.includes('\n- You may only create and modify files inside the user\'s workspace.') && plainFirst.system.includes('\n- Modify files and code only with the dedicated write/edit tools.') && !plainFirst.system.slice(plainFirst.system.indexOf(GUARD_SECTION)).includes('\n\n'), plainFirst === undefined ? 'no request' : `section at ${plainFirst.system.indexOf(GUARD_SECTION)} of ${plainFirst.system.length}`],
  ['guard: quoted =>, -> and >>> and a git subcommand with a quoted arrow run through Bash', arrowsResult !== undefined && arrowsResult.isError !== true && arrowsResult.text.includes('a => b -> c >>> d') && gitResult !== undefined && gitResult.isError !== true && gitResult.text.includes('init => '), `${(arrowsResult?.text ?? 'no tool result').slice(0, 60).replace(/\n/g, ' ')} | ${(gitResult?.text ?? 'no tool result').slice(0, 60).replace(/\n/g, ' ')}`],
  ['guard fallback: a .NET file write the reader cannot see runs, and Write creates its file (the fallback never blocks)', gitReady && dotnetResult !== undefined && dotnetResult.isError !== true && existsSync(shadowFile) && existsSync(toolFile), `git repo: ${gitReady}; ${(dotnetResult?.text ?? 'no tool result').slice(0, 80).replace(/\n/g, ' ')}`],
  ['guard fallback: one late denial names the shell-written file, not the Write target, with the turn, the session and the three shell calls', shadowRecords.length === 1 && shadowRecords[0].mode === 'late' && shadowRecords[0].via === 'turn-end' && shadowRecords[0].rule === 'file-tools-only' && JSON.stringify(shadowRecords[0].paths) === '["shadow.txt"]' && typeof shadowRecords[0].turn === 'number' && shadowRecords[0].calls?.length === 3 && shadowRecords[0].calls.some(call => call.tool === 'Bash' && call.command === dotnetWrite) && shadowRecords[0].sessionId === statusStep(shadow)?.sessionId && shadowRecords[0].scope === 'dialect', `${shadowRecords.length} record(s); first: ${JSON.stringify(shadowRecords[0] ?? null).slice(0, 200)}`],
  ['guard paths: on GLM a relative Write inside the workspace resolves against the session directory and runs', relativeResult !== undefined && relativeResult.isError !== true && existsSync(relativeFile), relativeResult === undefined ? `no tool result (exit ${guardPaths.status})` : relativeResult.text.slice(0, 100).replace(/\n/g, ' ')],
  ['guard paths: on GLM a relative target climbing out with .. is denied by workspace-containment, journaled, not written, and the turn end settles its follow-up as none', escapeResult?.isError === true && escapeResult.text.includes('That path is outside the workspace') && escapeResult.text.includes(`(resolves to "${escapedFile}")`) && !existsSync(escapedFile) && pathsViolations.length === 2 && pathsViolations[0].rule === 'workspace-containment' && pathsViolations[1].kind === 'followup' && pathsViolations[1].outcome === 'none', `${(escapeResult?.text ?? 'no tool result').slice(0, 120).replace(/\n/g, ' ')}; ${pathsViolations.length} record(s)`],
  ['guard scope: on a non-GLM route a relative write inside the workspace runs; a shell write is denied in native names, not written, journaled once as other with the route, and the turn end settles its follow-up as none (m4-gate G2)', plainWriteResult !== undefined && plainWriteResult.isError !== true && existsSync(join(plainGuardWs, 'rel.txt')) && plainShellResult?.isError === true && plainShellResult.text.includes('Shell file writes are not permitted') && plainShellResult.text.includes(RIGHT_PATH_NATIVE) && !existsSync(plainShellFile) && plainGuardViolations.length === 2 && plainGuardViolations[0].rule === 'file-tools-only' && plainGuardViolations[0].tool === 'pwsh' && plainGuardViolations[0].scope === 'other' && plainGuardViolations[0].route?.provider === 'glm-probe' && plainGuardViolations[0].route.model === 'deepseek-probe' && plainGuardViolations[1].kind === 'followup' && plainGuardViolations[1].outcome === 'none' && plainGuardViolations[1].scope === 'other', `write: ${(plainWriteResult?.text ?? 'no tool result').slice(0, 60).replace(/\n/g, ' ')} | pwsh: ${(plainShellResult?.text ?? 'no tool result').split('\n')[2] ?? ''}; records: ${JSON.stringify(plainGuardViolations.map(record => [record.kind ?? 'denial', record.rule, record.tool, record.scope, record.route]))}`],
  ['guard scope: the non-GLM session reports the guard in effect', plainGuardHealth.guard?.status === ACTED && plainGuardHealth.guard.reason.startsWith('门禁生效（file-tools-only，圈禁根 '), JSON.stringify(plainGuardHealth.guard ?? null)],
  // The follow-ups settle causally and cite their denial's record key, but the denial lines themselves
  // reach the journal through the denying row's own journal instance, so the file order across rows
  // (guard row versus graph row) is not pinned — only the follow-up sequence and the denial counts are.
  ['guard followup: the graph row and the guard row share one follow-up recorder — the verbatim retry settles the first graph denial as repeat, the shell write the graph row never sees settles the second as other, the write-tool call after the shell denial is file-tools-only\'s right path, the node file stays unwritten and x.txt is written (m4-gate G2, design §14.1)', guardFollowup.status === 0 && followupViolations.length === 6 && followupViolations.filter(record => record.kind === 'followup').map(record => `${record.rule}:${record.outcome}`).join(',') === 'graph-files-only:repeat,graph-files-only:other,file-tools-only:right-path' && followupViolations.filter(record => record.kind === undefined && record.rule === 'graph-files-only').length === 2 && followupViolations.some(record => record.kind === undefined && record.rule === 'file-tools-only' && record.tool === 'Bash') && !existsSync(followupNodeFile) && existsSync(followupFile), `exit ${guardFollowup.status}; records: ${JSON.stringify(followupViolations.map(record => [record.kind ?? 'denial', record.rule, record.outcome ?? record.tool]))}`],
  ['guard new rules (GLM): the credential read is not judged, the three writes are denied by their rules and nothing lands', guardNewRules.status === 0 && newRulesGitReady && newRulesResult(guardNewRules, 1)?.isError !== true && [2, 3, 4].every(index => newRulesResult(guardNewRules, index)?.isError === true) && newRulesResult(guardNewRules, 2).text.includes('without a reason') && newRulesResult(guardNewRules, 3).text.includes('request_exception with ref "r-') && newRulesResult(guardNewRules, 4).text.includes('request_exception with ref "r-') && newRulesResult(guardNewRules, 4).text.includes('.llm/scratch') && !existsSync(join(newRulesWs, 'bare.ts')) && !existsSync(join(newRulesWs, 'fix.py')) && readFileSync(join(newRulesWs, 'tsconfig.json'), 'utf8') === '{\n  "compilerOptions": {}\n}\n' && existsSync(newRulesCredentials), `exit ${guardNewRules.status}; ${(newRulesResult(guardNewRules, 2)?.text ?? 'no result').slice(0, 110).replace(/\n/g, ' ')}`],
  ['guard new rules (GLM): the journal holds only the three rules\' rejections (the judge keeps every rejecting rule per call, so the bare suppression carries a scratch-only rejection beside its denial), all dialect', newRulesViolations('guard-new-rules').length >= 3 && [...new Set(newRulesViolations('guard-new-rules').map(record => record.rule))].sort().join(',') === 'checker-config,scratch-only,suppression-reason' && newRulesViolations('guard-new-rules').every(record => record.scope === 'dialect') && ['suppression-reason', 'checker-config', 'scratch-only'].every(rule => newRulesViolations('guard-new-rules').some(record => record.rule === rule)), JSON.stringify(newRulesViolations('guard-new-rules').map(record => [record.rule, record.scope, record.tool]))],
  ['guard new rules (GLM): the declaration lists the three rules alongside the older two', guardNewRules.steps[0]?.system.includes(GUARD_SECTION) === true && ['- New suppressions carry a reason and a graph node id on the same line.', '- Checker configuration and baselines change only through the request channel.', '- New one-off scripts go in .llm/scratch/.', '- You may only create and modify files inside the user\'s workspace.'].every(line => guardNewRules.steps[0].system.includes(line)), guardNewRules.steps[0] === undefined ? 'no request' : `section at ${guardNewRules.steps[0].system.indexOf(GUARD_SECTION)}`],
  ['guard new rules (native): the same three denials on a non-GLM route, scoped other, corrections in native names', guardNewRulesPlain.status === 0 && [2, 3, 4].every(index => newRulesResult(guardNewRulesPlain, index)?.isError === true) && newRulesViolations('guard-new-rules-plain').length >= 3 && [...new Set(newRulesViolations('guard-new-rules-plain').map(record => record.rule))].sort().join(',') === 'checker-config,scratch-only,suppression-reason' && newRulesViolations('guard-new-rules-plain').every(record => record.scope === 'other') && newRulesResult(guardNewRulesPlain, 3).text.includes('request_exception with ref "r-') && newRulesResult(guardNewRulesPlain, 4).text.includes('.llm/scratch'), `exit ${guardNewRulesPlain.status}; ${JSON.stringify(newRulesViolations('guard-new-rules-plain').map(record => [record.rule, record.scope]))}`],
  ['guard lift: the overlay plays the human and the board; guard_lift lifts, the retry runs, the record copies are denied in both checkouts, the restore re-arms the rule (m4-gate G3, design §14.1)', guardLiftRun.status === 0 && liftGitReady && liftWorktreeReady && liftResult(5)?.isError !== true && liftResult(5)?.text.includes('"outcome":"lifted"') === true && liftResult(6)?.isError === true && liftResult(6)?.text.includes('"code":"not_said"') === true && liftResult(7)?.isError === true && liftResult(7)?.text.includes('"code":"not_said"') === true && liftResult(8)?.isError !== true && existsSync(liftFix) && liftResult(9)?.isError === true && liftResult(9)?.text.includes('lift record') === true && liftResult(10)?.isError === true && !existsSync(liftRecordWorktree) && liftResult(13)?.isError === true && liftResult(13)?.text.includes('.llm/scratch') === true && !existsSync(liftFix2), `exit ${guardLiftRun.status}; wt ${liftWorktreeReady}; lift ${(liftResult(5)?.text ?? 'no result').slice(0, 60).replace(/\n/g, ' ')}; not_said ${liftResult(6)?.text.includes('"code":"not_said"') === true}, ${liftResult(7)?.text.includes('"code":"not_said"') === true}`],
  ['guard lift: the journal carries both lifts and the denials (the judge keeps every rejecting rule: the worktree copy carries a containment rejection beside its lift-files-only one, and each denial settles as a follow-up; the file order of a denial and its follow-up is not pinned across journal instances)', liftViolations.length === 11 && liftViolations.filter(record => record.kind === 'lift').map(record => `${record.via}:${record.words}`).join('|') === 'chat:新建脚本那条先别拦了|board:/rules lift guard:scratch-only' && liftViolations.filter(record => record.kind === undefined && record.rule === 'lift-files-only').length === 2 && liftViolations.filter(record => record.kind === undefined && record.rule === 'lift-files-only').every(record => record.tool === 'Write') && liftViolations.filter(record => record.kind === undefined && record.rule === 'scratch-only').length === 2 && liftViolations.some(record => record.kind === undefined && record.rule === 'workspace-containment') && liftViolations.every(record => ['scratch-only', 'lift-files-only', 'workspace-containment'].includes(record.rule)), JSON.stringify(liftViolations.map(record => [record.kind ?? 'denial', record.rule, record.via ?? record.tool]))],
  ['guard lift: the record file has the chat line and the board line; the overlay log has the say and the restore', readFileSync(liftRecordMain, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line)).map(line => `${line.via}:${line.words}`).join('|') === 'chat:新建脚本那条先别拦了|board:/rules lift guard:scratch-only' && liftLogEntries.map(entry => entry.kind).join(',') === 'said,restore' && liftLogEntries.find(entry => entry.kind === 'restore')?.result?.ok === true && liftLogEntries.find(entry => entry.kind === 'restore')?.result.outcome === 'restored', `${liftLogEntries.length} log line(s): ${JSON.stringify(liftLogEntries.map(entry => [entry.kind, entry.result?.outcome ?? entry.result?.code ?? null]))}`],
  ['guard lift: the declaration loses the lifted rule after the lift and regains it after the restore, and the head names guard_lift for the root agent', guardLiftRun.steps[0]?.system.includes(GUARD_LIFT_LINE) === true && guardLiftRun.steps[0].system.includes('- New one-off scripts go in .llm/scratch/.') && guardLiftRun.steps.slice(5, 11).every(step => !step.system.includes('- New one-off scripts go in .llm/scratch/.')) && guardLiftRun.steps.slice(11).every(step => step.system.includes('- New one-off scripts go in .llm/scratch/.')), `head ${guardLiftRun.steps[0]?.system.includes(GUARD_LIFT_LINE) === true}; lifted-out at ${guardLiftRun.steps[5]?.system.includes('- New one-off scripts go in .llm/scratch/.') === true}; back at ${guardLiftRun.steps[11]?.system.includes('- New one-off scripts go in .llm/scratch/.') === true}`],
  ['guard fallback: the invisible shell write runs in turn 1 and lands as one late denial with the file and the call (m4-gate G3, design §14.1)', guardFallbackRun.status === 0 && fallbackGitReady && existsSync(fallbackFile) && fallbackViolations.length === 1 && fallbackViolations[0].mode === 'late' && fallbackViolations[0].via === 'turn-end' && fallbackViolations[0].rule === 'file-tools-only' && JSON.stringify(fallbackViolations[0].paths) === '["fallback.txt"]' && fallbackViolations[0].calls?.length === 1 && fallbackViolations[0].calls[0].command === fallbackWrite && fallbackViolations[0].scope === 'dialect', `exit ${guardFallbackRun.status}; ${JSON.stringify(fallbackViolations.map(record => [record.mode, record.via, record.paths]))}`],
  ['guard fallback: the first step of turn 2 carries the hourness-guard correction naming the file, and no second one is added on the next step (the delivered notice stays in history)', guardFallbackRun.steps[3]?.messages.filter(message => message.source === GUARD_CORRECTION_SOURCE && message.text.includes('fallback.txt')).length === 1 && guardFallbackRun.steps[4]?.messages.filter(message => message.source === GUARD_CORRECTION_SOURCE).length === 1, `turn-2 first request notices: ${JSON.stringify(guardFallbackRun.steps[3]?.messages.filter(message => message.source === GUARD_CORRECTION_SOURCE).map(message => message.text.slice(0, 90))) ?? 'no request'}`],
  ['guard request (GLM): the denial carries the ref and the request tool with its four fields; the ask result answers with the plan text and the end-of-reply instruction', guardRequest.status === 0 && requestGitReady && lastToolResult(guardRequest.steps[1])?.isError === true && lastToolResult(guardRequest.steps[1]).text.includes('call request_exception {"ref": "r-') && lastToolResult(guardRequest.steps[1]).text.includes('"purpose":') && lastToolResult(guardRequest.steps[2])?.isError !== true && lastToolResult(guardRequest.steps[2]).text.includes('"outcome":"ask"') && lastToolResult(guardRequest.steps[2]).text.includes('放行这一次，可以吗？（回「可以」才算数）') && lastToolResult(guardRequest.steps[2]).text.includes('Put `text` at the very end of your reply'), `exit ${guardRequest.status}; denial ${(lastToolResult(guardRequest.steps[1])?.text ?? 'none').slice(0, 70).replace(/\n/g, ' ')}; ask ${(lastToolResult(guardRequest.steps[2])?.text ?? 'none').slice(0, 60).replace(/\n/g, ' ')}`],
  ['guard request (GLM): the plan text the reply echoed carries the title, the four labelled lines, the 附 attachments and the question last; the goal-focus half-sentence is absent without a focus', guardRequest.steps[4]?.messages.filter(message => message.role === 'assistant').at(-1)?.text.includes('背景：agent 要**改工作区外的文件**，系统先拦下了') === true && guardRequest.steps[4]?.messages.filter(message => message.role === 'assistant').at(-1)?.text.includes('推荐：**放行这一次**，旧内容先备份，改坏了能找回') === true && guardRequest.steps[4]?.messages.filter(message => message.role === 'assistant').at(-1)?.text.includes('不做：**不放行**，文件不动，agent 换在工作区里做') === true && guardRequest.steps[4]?.messages.filter(message => message.role === 'assistant').at(-1)?.text.includes('- 将写入的内容') === true, `${(guardRequest.steps[4]?.messages.filter(message => message.role === 'assistant').at(-1)?.text ?? 'no reply').slice(0, 160).replace(/\n/g, ' | ')}`],
  ['guard request (GLM): the human 可以 approves at the next turn\'s first step; the note carries the tool and the arguments; the granted write runs past the gate and stops at rc.3\'s own workspace-write sandbox, the old content is backed up under requests/, and the third write is denied by containment with a fresh ref', guardRequest.steps[4]?.messages.some(message => message.source === 'hourness-request' && typeof message.text === 'string' && message.text.includes(`The human approved request ${requestAsked?.ref ?? ''}`) && message.text.includes(JSON.stringify({ tool: 'write', arguments: { file_path: requestTarget, content: 'probe content\n' } }))) === true && guardRequest.steps.some(step => lastToolResult(step)?.text.includes('sandbox') === true) && lastToolResult(guardRequest.steps.at(-1))?.text.includes('sandbox') === false && requestAsked !== undefined && existsSync(join(requestDir, 'home', 'requests', `${requestAsked.ref}.before`)) && readFileSync(join(requestDir, 'home', 'requests', `${requestAsked.ref}.before`), 'utf8') === 'old content\n' && lastToolResult(guardRequest.steps.at(-1))?.isError === true && lastToolResult(guardRequest.steps.at(-1)).text.includes('You tried to write') === true && lastToolResult(guardRequest.steps.at(-1)).text.includes(`"ref": "${requestAsked?.ref ?? ''}"`) === false, `write#2 ${(lastToolResult(guardRequest.steps[4])?.text ?? '').includes('sandbox') ? 'stopped by sandbox' : (lastToolResult(guardRequest.steps[4])?.text ?? 'none').slice(0, 50)}; write#3 containment ${lastToolResult(guardRequest.steps[6])?.text.includes('You tried to write') === true}; backup ${requestAsked === undefined ? 'no asked ref' : existsSync(join(requestDir, 'home', 'requests', `${requestAsked.ref}.before`))}`],
  ['guard request (GLM): the journal holds denial → followup right-path → asked → approved (with the human\'s words) → grant → denial, the ref riding on the requestable denials', requestViolations.length >= 6 && requestViolations.some(record => record.kind === undefined && record.rule === 'workspace-containment' && typeof record.ref === 'string') && requestViolations.some(record => record.kind === 'followup' && record.outcome === 'right-path') && requestViolations.filter(record => record.kind === 'request').map(record => record.outcome).join(',') === 'asked,approved' && requestViolations.some(record => record.kind === 'request' && record.outcome === 'approved' && record.by === 'human' && record.via === 'chat' && record.words === '可以') && requestViolations.some(record => record.kind === 'grant') && requestViolations.filter(record => record.kind === undefined && record.rule === 'workspace-containment').length === 2, `${requestViolations.length} record(s): ${JSON.stringify(requestViolations.map(record => [record.kind ?? 'denial', record.rule ?? '', record.outcome ?? '']))}`],
  ['guard request (native): the same channel without the GLM face — request_exception and probe_say called directly, the granted write passes the gate and stops at rc.3\'s sandbox, the third is denied by containment', guardRequestPlain.status === 0 && lastToolResult(guardRequestPlain.steps[2])?.isError !== true && lastToolResult(guardRequestPlain.steps[2]).text.includes('"outcome":"ask"') && lastToolResult(guardRequestPlain.steps[5])?.text.includes('sandbox') === true && lastToolResult(guardRequestPlain.steps[6])?.isError === true && lastToolResult(guardRequestPlain.steps[6]).text.includes('You tried to write') === true && jsonl(join(runDir, 'guard-request-plain', 'home', 'audit', 'violations.jsonl')).some(record => record.kind === 'request' && record.outcome === 'approved'), `exit ${guardRequestPlain.status}; ask ${(lastToolResult(guardRequestPlain.steps[2])?.text ?? 'none').slice(0, 50).replace(/\n/g, ' ')}; write#2 ${(lastToolResult(guardRequestPlain.steps[5])?.text ?? '').includes('sandbox') ? 'stopped by sandbox' : 'other'}`],
  ['guard request refuse: a headless 可以 reads not-client, 可以吗 reads unclear with the confirmation sentence as the new tail, the approval after it grants (its write stops at rc.3\'s sandbox), and a reply with one sentence more is not-shown with the write denied by containment', guardRequestRefuse.status === 0 && refuseGitReady && refuseNotice(5, 'did not come through the DSH client') && refuseNotice(7, 'not a plain yes or no') && refuseNotice(7, REFUSE_CONFIRM) && refuseNotice(9, 'The human approved request') && refuseNotice(14, 'was not approved') && lastToolResult(guardRequestRefuse.steps[9])?.text.includes('sandbox') === true && lastToolResult(guardRequestRefuse.steps[14])?.isError === true && lastToolResult(guardRequestRefuse.steps[14]).text.includes('You tried to write') === true && refuseViolations.filter(record => record.kind === 'request').map(record => record.outcome).join(',') === 'asked,not-client,unclear,approved,asked,not-shown', `exit ${guardRequestRefuse.status}; outcomes ${JSON.stringify(refuseViolations.filter(record => record.kind === 'request').map(record => record.outcome))}; write#4 containment ${lastToolResult(guardRequestRefuse.steps[14])?.text.includes('You tried to write') === true}`],
  ['guard request goal: the goal agent files with a live goal, a round\'s first step without the human carries still waits, and the approval pairs with its ask result and a spent grant in the journal', guardRequestGoal.status === 0 && requestGoalGitReady && requestGoalAsked && requestGoalStill && requestGoalApproval !== undefined && requestGoalSteps.length >= 4 && requestGoalViolations.some(record => record.kind === 'request' && record.outcome === 'approved') && requestGoalViolations.some(record => record.kind === 'grant') && requestGoalViolations.some(record => record.kind === undefined && record.rule === 'workspace-containment' && typeof record.ref === 'string'), `exit ${guardRequestGoal.status}; still ${requestGoalStill}; approval ${requestGoalApproval === undefined ? 'none' : requestGoalApproval.text.slice(0, 50)}; rounds ${requestGoalSteps.length}`],
  ['glm-no-dialect: with glm-prompt disabled the GLM face is the natives (pwsh, no Bash)', noDialectFirst !== undefined && names(noDialectFirst).has('pwsh') && !names(noDialectFirst).has('Bash') && !names(noDialectFirst).has('Write'), noDialectFirst === undefined ? `no request (exit ${noDialect.status})` : [...names(noDialectFirst)].filter(name => ['pwsh', 'Bash', 'write', 'Write'].includes(name)).join(', ')],
  ['glm-no-dialect: the guard still denies a pwsh shell write on GLM, journals it under the called name, corrects in native names, and the turn end settles its follow-up as none', noDialectResult?.isError === true && noDialectResult.text.includes('Shell file writes are not permitted') && noDialectResult.text.includes(RIGHT_PATH_NATIVE) && !existsSync(noDialectFile) && noDialectViolations.length === 2 && noDialectViolations[0].rule === 'file-tools-only' && noDialectViolations[0].tool === 'pwsh' && noDialectViolations[0].scope === 'other' && noDialectViolations[1].kind === 'followup' && noDialectViolations[1].outcome === 'none', `${(noDialectResult?.text ?? 'no tool result').split('\n')[2] ?? ''}; ${noDialectViolations.length} record(s), scope ${noDialectViolations[0]?.scope ?? 'none'}`],
  ['glm-no-dialect: the GLM rule declaration names the native file tools', noDialectFirst?.system.includes(GUARD_SECTION) === true && noDialectFirst.system.includes('\n- Modify files and code only with the dedicated write/edit tools.'), noDialectFirst === undefined ? 'no request' : `section at ${noDialectFirst.system.indexOf(GUARD_SECTION)}`],
  ['health: the guard names the shadow fallback: on with workspace-changes mounted, off without it', shadowHealth.guard?.status === ACTED && shadowHealth.guard.reason.endsWith('事后纠正启用：工作区变更记录') && glmHealth.guard?.reason.endsWith('事后纠正未启用（组合里没有 workspace-changes）') === true, `${JSON.stringify(shadowHealth.guard ?? null)} | ${JSON.stringify(glmHealth.guard ?? null)}`],
  ['workflow: the runtime subagent tools are journaled dispatch names', plainSubagentTools.length === 2 && plainSubagentTools.every(name => DISPATCH_TOOLS.includes(name)), `runtime subagent tools: ${plainSubagentTools.join(', ') || 'none'}`],
  ['health: /glm-status prints the credential line and the health table of the session, one line per bundle row with its package', glmStatusText.startsWith('glm-zcode：未登录（套餐 coding-plan）') && glmStatusText.includes(`## 行健康（会话 ${statusStep(glm)?.sessionId}）\n\n${TABLE_HEAD}`) && HEALTH_ROWS.every(row => glmHealth[row] !== undefined) && Object.keys(glmHealth).length === HEALTH_ROWS.length && grouped(glmHealth), `${Object.keys(glmHealth).length} row(s), grouped ${grouped(glmHealth)}; ${glmStatusText.split('\n')[0]}`],
  ['health: /hourness-status prints the same table as /glm-status for the session, without the credential line', plainHourness?.kind === 'success' && plainHourness.text.startsWith(`## 行健康（会话 ${statusStep(plain)?.sessionId}）\n\n${TABLE_HEAD}`) && plainHourness.text === plainStatusText.slice(plainStatusText.indexOf('## 行健康')) && grouped(plainHealth), `${plainHourness?.kind ?? 'not run'}; ${(plainHourness?.text ?? '').split('\n').length} line(s); same as /glm-status: ${plainHourness?.text === plainStatusText.slice(plainStatusText.indexOf('\n\n') + 2)}`],
  ['health: on the GLM route glm-prompt, guard, memory, workflow, data and glm-login report in effect; glm-compact and hourness have not acted', glmHealth['glm-prompt']?.status === ACTED && glmHealth['glm-prompt'].reason.startsWith('GLM 路由 glm-probe/glm-5.3：') && ['guard', 'memory', 'workflow', 'data', 'glm-login'].every(row => glmHealth[row]?.status === ACTED) && ['glm-compact', 'hourness'].every(row => glmHealth[row]?.status === IDLE), HEALTH_ROWS.map(row => healthLine(glmHealth, row)).join('; ')],
  ['pricing: /hourness on the GLM route prices the usage journal through the pricing service glm-login provides', glmHourness?.kind === 'success' && glmPanel.startsWith('- 高峰：') && glmPanel.split('\n')[1]?.startsWith('- 全部用量记录；高峰为工作日 14:00–18:00（UTC+8）') === true && /^- glm-5\.3：\d+ 次 · 积分 \d+\.\d\d/m.test(glmPanel), `${glmHourness?.kind ?? 'not run'}; ${JSON.stringify(glmPanel.split('\n').slice(0, 3))}`],
  ['status hub: the collector reads the real runtime\'s rows without a failure, and the agent audience carries no person entry', glmHub?.agent !== undefined && glmHub.agent.rows.length > 0 && glmHub.agent.rows.every(row => row.outcome !== 'error') && glmHub.agent.items.every(item => item.audience === 'agent') && isDeepStrictEqual(glmHub.agent.items.map(item => item.id), glmHub.all.items.filter(item => item.audience === 'agent').map(item => item.id)), glmHub === undefined ? 'no hub recorded' : glmHub.error ?? `read: ${glmHub.agent.rows.filter(row => row.outcome === 'ok').map(row => row.row).join(', ')}; failed: ${glmHub.agent.rows.filter(row => row.outcome === 'error').map(row => `${row.row} (${row.reason})`).join(', ') || 'none'}; agent: ${glmHub.agent.items.map(item => item.id).join(', ')}; all: ${glmHub.all.items.length}`],
  ['status hub: /hourness 面板 is the entries (the peak line first, the usage entry\'s text and detail last) and 额度 is the quota entry', glmHourness?.kind === 'success' && glmHubPeak !== undefined && glmHubPanel[0] === glmHubPeak.text && glmHubUsage !== undefined && isDeepStrictEqual(glmHubPanel.slice(-glmHubUsage.length), glmHubUsage) && glmHubQuota !== undefined && isDeepStrictEqual(glmQuotaSection, glmHubQuota), `peak ${JSON.stringify(glmHubPeak?.text ?? null)}; usage ${JSON.stringify(glmHubUsage ?? null)}; quota ${JSON.stringify(glmHubQuota ?? null)}; 面板 ${JSON.stringify(glmHubPanel)}`],
  ['status hub: one rules/peak entry for the session (the hourness row\'s half yields to the rules row)', glmHub?.all !== undefined && glmHub.all.items.filter(item => item.id === 'rules/peak').length === 1, glmHub?.all === undefined ? 'no hub recorded' : `${glmHub.all.items.filter(item => item.id === 'rules/peak').length} rules/peak entr(ies)`],
  ['status hub: no metrics ratio on the agent path: the metrics row hands only metrics/load, and /hourness\'s metrics section heads only the fact groups', glmHub?.all !== undefined && glmHub.all.items.filter(item => item.owner === 'metrics').every(item => item.id === 'metrics/load') && glmHubMetrics.length > 0 && glmHubMetrics.filter(line => line.startsWith('### ')).every(line => HOURNESS_FACT_HEADINGS.includes(line)), `metrics entries: ${glmHub?.all?.items.filter(item => item.owner === 'metrics').map(item => item.id).join(', ') || 'none'}; headings: ${glmHubMetrics.filter(line => line.startsWith('### ')).join(', ') || (glmHubMetrics.length === 0 ? 'no section' : 'none')}`],
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
  ['dispatch (b): the child session header keeps the parent directory; the requested cwd is only the child working directory', childCalls.length > 0 && childCalls.every(entry => entry.headerCwd === dispatch.cwd) && childBash?.text.trim() === dispatchWs, `header cwd ${childCalls[0]?.headerCwd ?? 'none'}`],
  ['goal (c): a plugin-created goal on a second root agent gets round 1 from the driver, and the notice appended in agent/pre-step enters with it', goalCreated?.root === true && goalCreated.goal?.activation === 'armed' && roundOf(goalSteps[0], 1) && projections(goalSteps[0]).length === 1 && firstRoundOrder[0] >= 0 && firstRoundOrder[1] > firstRoundOrder[0], goalSteps[0] === undefined ? `no goal-agent request (exit ${goalRun.status})` : `sources: ${goalSteps[0].messages.map(message => message.source ?? message.role).slice(-6).join(', ')}`],
  ['goal (c): update_goal complete through DeferredToolCall is denied in tools/pre-execute and the goal stays active', gateDenied?.isError === true && gateDenied.text.includes(GOAL_GATE_DENIAL) && goalGates[0]?.decision === 'deny' && goalGates[0].goal?.phase === 'active' && goalGates[0].goal.roundsStarted === 1, gateDenied === undefined ? 'no tool result' : gateDenied.text.slice(0, 100).replace(/\n/g, ' ')],
  ['goal (c): the driver starts round 2 after the round that carried the notice; each round carries one notice; no round 3', goalSteps.length === 5 && roundOf(goalSteps[3], 2) && projections(goalSteps[3]).length === 2 && goalSteps.every(step => !roundOf(step, 3)), `${goalSteps.length} goal-agent request(s); notices per request: ${goalSteps.map(step => projections(step).length).join(', ')}`],
  ['goal (c): with the evidence present the gate allows complete in round 2; the goal ends complete and disarmed after 2 rounds', goalGates.length === 2 && goalGates[1].decision === 'allow' && goalCompleted?.isError !== true && goalCompleted?.text.includes('"phase":"complete"') === true && goalFinal?.goal?.phase === 'complete' && goalFinal.goal.roundsStarted === 2 && goalFinal.goal.activation === 'disarmed' && goalRunResult?.text.includes('"phase":"complete"') === true, JSON.stringify(goalFinal ?? null).slice(0, 160)],
  ['goal (headless): the one-shot runner exits at its agent\'s first quiescent idle, so an armed goal created in the task turn gets no round', headlessCreated?.isError !== true && headlessCreated?.text.includes('"activation":"armed"') === true && headlessGoal.steps.length === 2 && headlessGoal.steps.every(step => roundMessages(step).length === 0), `exit ${headlessGoal.status}, ${headlessGoal.steps.length} step(s); ${(headlessCreated?.text ?? 'no tool result').slice(0, 80)}`],
  ['rules: the row ships enabled since the rules-loops merge: the boot scenarios list it in effect on both routes', glmHealth.rules?.status === ACTED && plainHealth.rules?.status === ACTED, `${healthLine(glmHealth, 'rules')}; ${healthLine(plainHealth, 'rules')}`],
  ['rules-peak: the row, enabled by the overlay in a scratch git workspace, boots on the GLM route, runs the five scripted steps and exits clean with nothing from it on stderr', rulesGlm.ready && rulesPeak.status === 0 && rulesPeak.steps.length === 5 && !rulesStderr.includes('dsh-glm-hourness/rules'), `exit ${rulesPeak.status}, ${rulesPeak.steps.length} step(s), git ${rulesGlm.ready}; ${rulesStderr.split('\n').find(line => line.includes('rules')) ?? 'no stderr line mentions rules'}`],
  ['rules-peak: without a choice the project is at the factory level reduce: the command says so, and in the peak the service gives the cap of one GLM subagent and the hold until 18:00', rulesPeak.steps[1]?.command?.kind === 'success' && rulesPeak.steps[1].command.text.startsWith(`高峰模式：少做（出厂默认）。现在是高峰，到 ${clockText(PEAK_END, rulesPeak.steps[1].clock)}。`) && isDeepStrictEqual(rulesPeak.steps[1].peakMode, { state: { level: 'reduce', origin: 'default', peak: true, until: PEAK_END, glmWorkerCap: 1 }, hold: { level: 'reduce', until: PEAK_END } }), JSON.stringify(rulesPeak.steps[1]?.peakMode ?? null)],
  ['rules-peak: /rules peak 不做 as the person: the reply names the level, the service gives the person\'s choice with no cap and the hold of the stop level', rulesPeak.steps[3]?.command?.kind === 'success' && rulesPeak.steps[3].command.text.startsWith('高峰模式改成了「不做」') && rulesPeak.steps[3].peakMode?.state?.level === 'stop' && rulesPeak.steps[3].peakMode.state.origin === 'human' && rulesPeak.steps[3].peakMode.state.peak === true && rulesPeak.steps[3].peakMode.state.glmWorkerCap === undefined && isDeepStrictEqual(rulesPeak.steps[3].peakMode.hold, { level: 'stop', until: PEAK_END }), JSON.stringify(rulesPeak.steps[3]?.peakMode ?? null)],
  ['rules-page: rules-peak: after /rules peak 不做 the page data says the stop level, chosen by the person, and that it is peak now (the probe clock\'s Wednesday 15:00)', peakStopPage?.peak.level === 'stop' && peakStopPage.peak.origin === 'human' && peakStopPage.peak.now === true && peakStopPage.peak.applies === true, pageLook(peakStopPage)],
  ['rules-peak: /rules peak 无影响 leaves no cap and no hold', rulesPeak.steps[4]?.command?.kind === 'success' && rulesPeak.steps[4].peakMode?.state?.level === 'inform' && rulesPeak.steps[4].peakMode.state.peak === true && rulesPeak.steps[4].peakMode.state.glmWorkerCap === undefined && rulesPeak.steps[4].peakMode.hold === null, JSON.stringify(rulesPeak.steps[4]?.peakMode ?? null)],
  ['rules-peak: the main agent is held on no level: its Read ran under the factory level and again under 不做 in the peak', [2, 4].every(index => { const result = lastToolResult(rulesPeak.steps[index]); return result !== undefined && result.isError !== true }), [2, 4].map(index => lastToolResult(rulesPeak.steps[index])?.text?.slice(0, 40) ?? 'no result').join(' | ')],
  ['rules-peak: the choice is in the repository file and in the project\'s journal (two person\'s writes), and nothing is written in the scenario\'s user-level directory', rulesFile?.peakMode?.level === 'inform' && isDeepStrictEqual(rulesRecords.map(record => [record.op, record.actor, record.from, record.to]), [['peak-mode-set', 'human', 'reduce', 'stop'], ['peak-mode-set', 'human', 'stop', 'inform']]) && !existsSync(join(runDir, 'rules-peak', 'dsh-home', 'glm-hourness', 'rules')), `${JSON.stringify(rulesFile ?? null)}; ${rulesRecords.length} record(s)`],
  ['rules-peak: /glm-status lists the rules row in effect with the level in force at that step and the clock', rulesHealth.rules?.status === ACTED && rulesHealth.rules.package === 'dsh-hourness' && rulesHealth.rules.reason.includes('高峰模式 不做（你选的）；现在是高峰') && grouped(rulesHealth), healthLine(rulesHealth, 'rules') + ` (${rulesHealth.rules?.reason ?? ''})`],
  ['rules-peak: rules_show at the shifted clock lists the default rule with the end of the peak, and the peak line', peakShown?.isError !== true && peakShown?.text.includes('builtin:glm-peak-pricing') === true && peakShown.text.includes(`GLM peak hours until ${PEAK_END_HM}`) && peakShown.text.includes('GLM peak: now'), (peakShown?.text ?? 'no result').slice(0, 300)],
  ['rules-peak: the GLM package\'s reminder is in every request exactly once, and the board\'s reminder neither repeats its sentences nor says keep working or postpone', rulesPeak.steps.every(step => peakNotices(step).length === 1) && peakTexts.length === 1 && peakSentences.every(sentence => !peakTexts[0].includes(sentence)) && !/keep working|postpone|charged at the full credit rate/i.test(peakTexts[0] ?? ''), `${rulesPeak.steps.map(step => peakNotices(step).length).join(', ')} | ${peakTexts.join(' // ')}`],
  ['rules-peak: the main agent\'s first request after /wish starts the board\'s reminder with the peak line of the factory level: reduce, the default, one GLM subagent', peakTexts[0] === REDUCE_LINE, JSON.stringify(peakTexts)],
  ['rules-peak: the line is said once while nothing changes, and again with the new level after 不做', rulesPeak.steps.slice(1, 4).every(step => boardTexts(step).length === 1) && boardTexts(rulesPeak.steps[4]).length === 2 && boardTexts(rulesPeak.steps[4])[1].startsWith(STOP_LINE_START), rulesPeak.steps.map(step => boardTexts(step).length).join(', ')],
  ['rules-peak: the first GLM request carries exactly one peak reminder, worded by the factory level with the cap of one GLM subagent, and the two level changes leave that one notice as it was', REDUCE_NOTICE.includes('at most 1 GLM subagent') && rulesPeak.steps.length === 5 && rulesPeak.steps.every(step => peakNotices(step).length === 1 && peakNotices(step)[0].text === REDUCE_NOTICE), `${rulesPeak.steps.map(step => peakNotices(step).length).join('/')} notice(s): ${(peakNotices(rulesPeak.steps[0])[0]?.text ?? '').slice(0, 100).replace(/\n/g, ' ')}`],
  ['rules-peak: at the factory level at 15:00 the main agent\'s request after /wish carries both notices, and they do not contradict each other: the GLM package\'s is the reduce text without information only, keep working or postpone; the board\'s says neither keep working nor postpone and repeats no sentence of PEAK_REMINDER_TEXT', reduceReminders.length === 1 && reduceReminders[0].text === REDUCE_NOTICE && !/information only|keep working|postpone/i.test(reduceReminders[0].text) && reduceBoard.length >= 1 && reduceBoard.every(text => !/keep working|postpone/i.test(text) && peakSentences.every(sentence => !text.includes(sentence))), `${reduceReminders.length} reminder(s), ${reduceBoard.length} board notice(s): ${(reduceReminders[0]?.text ?? '').slice(0, 80).replace(/\n/g, ' ')} // ${(reduceBoard[0] ?? '').slice(0, 80).replace(/\n/g, ' ')}`],
  ['rules-stop-notice: with the level set to 不做 by the person before the run, the row boots on the GLM route, runs both scripted steps and exits clean with nothing from the packages on stderr', rulesStopNoticeProject.ready && rulesStopNoticeSet?.ok === true && rulesStopNotice.status === 0 && rulesStopNotice.steps.length === 2 && quiet('rules-stop-notice'), `exit ${rulesStopNotice.status}, ${rulesStopNotice.steps.length} step(s), git ${rulesStopNoticeProject.ready}, write ${rulesStopNoticeSet?.ok === true ? 'ok' : JSON.stringify(rulesStopNoticeSet ?? null)}`],
  ['rules-stop-notice: at the first request the service gives the person\'s stop in the peak, with no cap and the hold of the stop level', rulesStopNotice.steps[0]?.peakMode?.state?.level === 'stop' && rulesStopNotice.steps[0].peakMode.state.origin === 'human' && rulesStopNotice.steps[0].peakMode.state.peak === true && rulesStopNotice.steps[0].peakMode.state.glmWorkerCap === undefined && isDeepStrictEqual(rulesStopNotice.steps[0].peakMode.hold, { level: 'stop', until: PEAK_END }), JSON.stringify(rulesStopNotice.steps[0]?.peakMode ?? null)],
  ['rules-stop-notice: the first GLM request carries exactly one peak reminder with the stop text, and the next request carries that one again', rulesStopNotice.steps.length === 2 && rulesStopNotice.steps.every(step => peakNotices(step).length === 1 && peakNotices(step)[0].text === STOP_NOTICE), `${rulesStopNotice.steps.map(step => peakNotices(step).length).join('/')} notice(s): ${(peakNotices(rulesStopNotice.steps[0])[0]?.text ?? '').slice(0, 100).replace(/\n/g, ' ')}`],
  ['rules-stop-notice: the stop text says the main agent is not held, and has none of the words that would tell it to stop, wait or hold its answers', STOP_NOTICE.includes('The main agent is not held on any level: it keeps answering the human and working.') && STOP_NOTICE.endsWith('Do not switch models or plans unless the user asks.\n</system-reminder>') && FORBIDDEN_REMINDER_WORDS.every(word => !STOP_NOTICE.includes(word) && !REDUCE_NOTICE.includes(word)), FORBIDDEN_REMINDER_WORDS.filter(word => STOP_NOTICE.includes(word) || REDUCE_NOTICE.includes(word)).join(', ') || 'none present'],
  ['rules-stop-notice: the main agent is held on no level: its Read ran under 不做 in the peak and the reply was produced', lastToolResult(rulesStopNotice.steps[1]) !== undefined && lastToolResult(rulesStopNotice.steps[1]).isError !== true && rulesStopNotice.status === 0, lastToolResult(rulesStopNotice.steps[1])?.text?.slice(0, 40) ?? 'no result'],
  ['rules-peak-hourness: with only the orchestration package there is no pricing service: the person\'s choice is kept, no peak is known, there is no cap and no hold, and the command says why', rulesPeakAlone.status === 0 && aloneState !== undefined && aloneState !== null && aloneState.level === 'stop' && aloneState.origin === 'human' && !('peak' in aloneState) && !('glmWorkerCap' in aloneState) && !('until' in aloneState) && rulesPeakAlone.steps[0].peakMode.hold === null && rulesPeakAlone.steps[0].command?.text.includes('读不到是不是高峰（没有计价服务（GLM 通道包未装，或它的 glm-login 行未启用））') === true, JSON.stringify(rulesPeakAlone.steps[0]?.peakMode ?? null)],
  ['rules-page: rules-peak-hourness: without the GLM package the page data says the peak hours do not apply, has no rules/peak item, and keeps the level the person chose', hournessOnlyPage?.peak.applies === false && hournessOnlyPage.peak.now === undefined && pageItem(hournessOnlyPage, 'rules/peak') === undefined && hournessOnlyPage.peak.level === 'stop' && hournessOnlyPage.peak.origin === 'human', pageLook(hournessOnlyPage)],
  ['glm-rules: the row boots on the GLM route with the rules file of the clone, runs its four steps and exits clean with nothing from it on stderr', glmRulesProject.ready && glmRules.status === 0 && glmRules.steps.length === 4 && !stderrOf('glm-rules').includes('dsh-glm-hourness/rules'), `exit ${glmRules.status}, ${glmRules.steps.length} step(s), git ${glmRulesProject.ready}; ${stderrOf('glm-rules').split('\n').find(line => line.includes('rules')) ?? 'no stderr line mentions rules'}`],
  ['glm-rules: the command the block rule names is refused with the rule\'s four-part text, so it never ran', lastToolResult(glmRules.steps[1])?.isError === true && /^Error: You tried to run "Write-Output rules-probe-blocked"\.\nBoundary: Rule r-probe-block "Probe word" \(set by the human at [^)]+, until lifted\) blocks it now\.\nRight path: .+\nException: /.test(lastToolResult(glmRules.steps[1])?.text ?? ''), lastToolResult(glmRules.steps[1])?.text?.slice(0, 160) ?? 'no result'],
  ['glm-rules: that refusal is in the violation journal as rules:r-probe-block, enforced, on the dialect route', rulesRecordOf(glmRulesRecords, 'rules:r-probe-block')?.mode === 'enforce' && rulesRecordOf(glmRulesRecords, 'rules:r-probe-block').effect === 'block' && rulesRecordOf(glmRulesRecords, 'rules:r-probe-block').scope === 'dialect' && rulesRecordOf(glmRulesRecords, 'rules:r-probe-block').tool === 'Bash', JSON.stringify(rulesRecordOf(glmRulesRecords, 'rules:r-probe-block') ?? null).slice(0, 200)],
  ['glm-rules: a file tool writing into the rules directory is refused by rules:files-only, the file is as it was and the refusal is journaled', lastToolResult(glmRules.steps[2])?.isError === true && (lastToolResult(glmRules.steps[2])?.text ?? '').includes('Rule rules:files-only') && readFileSync(glmRulesProject.rulesFile, 'utf8') === GATE_RULES_FILE && rulesRecordOf(glmRulesRecords, 'rules:files-only')?.mode === 'enforce', lastToolResult(glmRules.steps[2])?.text?.slice(0, 160) ?? 'no result'],
  ['glm-rules: a command no rule names runs', lastToolResult(glmRules.steps[3])?.isError !== true && (lastToolResult(glmRules.steps[3])?.text ?? '').includes('rules-probe-allowed'), lastToolResult(glmRules.steps[3])?.text?.slice(0, 80) ?? 'no result'],
  ['glm-rules: the first request carries the board\'s reminder of the rule that only informs, no request carries another (nothing changed), and the system prompt declares the rules board in the guard section', glmRules.steps.every(step => boardTexts(step).length === 1) && boardTexts(glmRules.steps[0])[0]?.includes('[inform, not checked] r-probe-note: "Probe note" (set by the human)') === true && !boardTexts(glmRules.steps[0])[0].includes('r-probe-block') && glmRules.steps.every(step => step.system.includes(RULES_DECLARATION)), `${glmRules.steps.map(step => boardTexts(step).length).join(', ')} board message(s) per request; declared ${glmRules.steps.filter(step => step.system.includes(RULES_DECLARATION)).length}/${glmRules.steps.length}`],
  ['glm-rules: /glm-status lists the rules row in effect with the rules of the person counted, and nothing is written in the scenario\'s user-level directory', glmRulesHealth.rules?.status === ACTED && glmRulesHealth.rules.reason.includes('2 条你设的规则生效') && !existsSync(join(runDir, 'glm-rules', 'dsh-home', 'glm-hourness', 'rules')), healthLine(glmRulesHealth, 'rules') + ` (${glmRulesHealth.rules?.reason ?? ''})`],
  ['rules-page: glm-rules: the workspace\'s .llm/rules/view.json is there and parses with the panel\'s reader', glmRulesPage !== undefined, typeof glmRules.steps[3]?.rulesView === 'string' ? glmRules.steps[3].rulesView.slice(0, 120) : String(glmRules.steps[3]?.rulesView ?? 'not recorded')],
  ['rules-page: glm-rules: rules:files-only has a denial in the last 7 days, and the newest of its last five is that rule', (pageCode(glmRulesPage, 'rules:files-only')?.denials7d ?? 0) >= 1 && pageCode(glmRulesPage, 'rules:files-only')?.last[0]?.rule === 'rules:files-only', JSON.stringify(pageCode(glmRulesPage, 'rules:files-only') ?? null).slice(0, 200)],
  ['rules-page: glm-rules: the person\'s rule r-probe-block has one blocked call in 7 days and none only noted', glmRulesPage?.rules.find(rule => rule.id === 'r-probe-block')?.enforce7d === 1 && glmRulesPage.rules.find(rule => rule.id === 'r-probe-block')?.record7d === 0, JSON.stringify(glmRulesPage?.rules.map(rule => [rule.id, rule.enforce7d, rule.record7d]) ?? null)],
  ['rules-page: glm-rules: the items hold rules/denials and rules/lifts, and the text of rules/peak is the first line of the 面板 section of the same run\'s /hourness', pageItem(glmRulesPage, 'rules/denials') !== undefined && pageItem(glmRulesPage, 'rules/lifts') !== undefined && glmPanel !== '' && pageItem(glmRulesPage, 'rules/peak')?.text === glmPanel.split('\n')[0], `${pageLook(glmRulesPage)} | ${pageItem(glmRulesPage, 'rules/peak')?.text ?? 'no rules/peak'} | ${glmPanel.split('\n')[0]}`],
  ['non-glm-rules: the row boots on the non-GLM route with the rules file of the clone, runs its five steps and exits clean with nothing from it on stderr', nonGlmRulesProject.ready && nonGlmRules.status === 0 && nonGlmRules.steps.length === 5 && !stderrOf('non-glm-rules').includes('dsh-glm-hourness/rules'), `exit ${nonGlmRules.status}, ${nonGlmRules.steps.length} step(s), git ${nonGlmRulesProject.ready}; ${stderrOf('non-glm-rules').split('\n').find(line => line.includes('rules')) ?? 'no stderr line mentions rules'}`],
  ['non-glm-rules: the blocked command is refused and journaled as rules:r-probe-block on a route the dialect did not claim', lastToolResult(nonGlmRules.steps[1])?.isError === true && (lastToolResult(nonGlmRules.steps[1])?.text ?? '').includes('Rule r-probe-block "Probe word"') && rulesRecordOf(nonGlmRulesRecords, 'rules:r-probe-block')?.scope === 'other' && rulesRecordOf(nonGlmRulesRecords, 'rules:r-probe-block').tool === 'pwsh', lastToolResult(nonGlmRules.steps[1])?.text?.slice(0, 160) ?? 'no result'],
  ['non-glm-rules: a file tool writing into the project\'s .llm/rules/ is refused by rules:files-only and nothing is written', lastToolResult(nonGlmRules.steps[2])?.isError === true && (lastToolResult(nonGlmRules.steps[2])?.text ?? '').includes('Rule rules:files-only') && !stateWritten && rulesRecordOf(nonGlmRulesRecords, 'rules:files-only')?.scope === 'other', lastToolResult(nonGlmRules.steps[2])?.text?.slice(0, 160) ?? 'no result'],
  ['non-glm-rules: rules_show, in the real runtime, lists the rules in force for the caller, the signals and the peak mode', lastToolResult(nonGlmRules.steps[3])?.isError !== true && /^Rules board of ws\./.test(lastToolResult(nonGlmRules.steps[3])?.text ?? '') && /\] r-probe-block: /.test(lastToolResult(nonGlmRules.steps[3])?.text ?? '') && /\] r-probe-note: /.test(lastToolResult(nonGlmRules.steps[3])?.text ?? '') && (lastToolResult(nonGlmRules.steps[3])?.text ?? '').includes('Peak mode:'), lastToolResult(nonGlmRules.steps[3])?.text?.slice(0, 200) ?? 'no result'],
  ['non-glm-rules: a command no rule names runs, every request carries the one reminder of the rule that only informs, and /glm-status lists the row in effect', lastToolResult(nonGlmRules.steps[4])?.isError !== true && (lastToolResult(nonGlmRules.steps[4])?.text ?? '').includes('rules-probe-allowed') && nonGlmRules.steps.every(step => boardTexts(step).length === 1) && boardTexts(nonGlmRules.steps[0])[0]?.includes('r-probe-note') === true && nonGlmRulesHealth.rules?.status === ACTED && !existsSync(join(runDir, 'non-glm-rules', 'dsh-home', 'glm-hourness', 'rules')), healthLine(nonGlmRulesHealth, 'rules') + ` (${nonGlmRulesHealth.rules?.reason ?? ''})`],
  ['rules-page: non-glm-rules: on the non-GLM route the page data parses, counts the refusal of r-probe-block (scope other) as its one blocked call, and rules:files-only as a denial', nonGlmRulesPage?.rules.find(rule => rule.id === 'r-probe-block')?.enforce7d === 1 && (pageCode(nonGlmRulesPage, 'rules:files-only')?.denials7d ?? 0) >= 1, `${pageLook(nonGlmRulesPage)} | ${JSON.stringify(nonGlmRulesPage?.rules.map(rule => [rule.id, rule.enforce7d]) ?? null)}`],
  ['rules-queue: the row boots on the GLM route at the peak clock with a queue rule in the clone\'s rules file, runs its five steps and exits clean with nothing from it on stderr', queueProject.ready && rulesQueue.status === 0 && rulesQueue.steps.length === 5 && !stderrOf('rules-queue').includes('dsh-glm-hourness/rules'), `exit ${rulesQueue.status}, ${rulesQueue.steps.length} step(s), git ${queueProject.ready}; ${stderrOf('rules-queue').split('\n').find(line => line.includes('rules')) ?? 'no stderr line mentions rules'}`],
  ['rules-queue: the call the rule names is refused with the ticket number and the four parts, so it never ran; the same call again gets the same text under the same ticket', QUEUE_REFUSAL.test(lastToolResult(rulesQueue.steps[1])?.text ?? '') && lastToolResult(rulesQueue.steps[2])?.text === lastToolResult(rulesQueue.steps[1])?.text && lastToolResult(rulesQueue.steps[1]).isError === true, lastToolResult(rulesQueue.steps[1])?.text?.slice(0, 200) ?? 'no result'],
  ['rules-queue: the board kept one ticket, journaled both refusals as queue lines naming it, and opened it as the harness', isDeepStrictEqual(Object.keys(queueState?.tickets ?? {}), ['q-1']) && queueState.tickets['q-1'].tool === 'pwsh' && queueState.tickets['q-1'].rules.join() === 'r-probe-queue' && queueRecords.filter(record => record.rule === 'rules:r-probe-queue' && record.effect === 'queue' && record.mode === 'enforce' && record.ticket === 'q-1').length === 2 && queueJournal.find(record => record.op === 'ticket-open')?.actor === 'harness', JSON.stringify(queueState?.tickets ?? null).slice(0, 200)],
  ['rules-queue: the person lifts the rule through the real /rules handler mid-step, and the session is told once: the next request carries the wake message and the one before did not', rulesQueue.steps[2]?.command?.kind === 'success' && wakeMessages(rulesQueue.steps[2]).length === 0 && wakeMessages(rulesQueue.steps[3]).length === 1 && queueWake.test(wakeMessages(rulesQueue.steps[3])[0].text) && wakeMessages(rulesQueue.steps.at(-1)).length === 1, wakeMessages(rulesQueue.steps[3])[0]?.text ?? `no wake in request 4; command: ${JSON.stringify(rulesQueue.steps[2]?.command ?? null).slice(0, 120)}`],
  ['rules-queue: the call again runs, and the ticket it waited on is done', lastToolResult(rulesQueue.steps[4])?.isError !== true && (lastToolResult(rulesQueue.steps[4])?.text ?? '').includes('rules-probe-queued') && queueState?.tickets?.['q-1']?.state === 'done', `${lastToolResult(rulesQueue.steps[4])?.text?.slice(0, 80) ?? 'no result'}; ticket ${queueState?.tickets?.['q-1']?.state ?? 'missing'}`],
  ['rules-queue: the request carries the reminder exactly when something changed: the rule that informs, then with the open ticket, then with it cleared, then the rule alone again', isDeepStrictEqual(rulesQueue.steps.map(step => boardTexts(step).length), [1, 2, 2, 3, 4]) && consecutiveDiffer(boardTexts(rulesQueue.steps.at(-1))) && boardTexts(rulesQueue.steps.at(-1))[1].includes('Your open tickets: q-1 pwsh "Write-Output rules-probe-queued" (deferred since') && boardTexts(rulesQueue.steps.at(-1))[2].includes('(cleared at') && boardTexts(rulesQueue.steps.at(-1))[3] === boardTexts(rulesQueue.steps.at(-1))[0], rulesQueue.steps.map(step => boardTexts(step).length).join(', ')],
  ['rules-queue: nothing is written in the scenario\'s user-level directory', !existsSync(join(runDir, 'rules-queue', 'dsh-home', 'glm-hourness', 'rules')), ''],
  ['rules-peak-wake: the row boots on the GLM route with the first rule of M6 design 7.3 in the clone\'s rules file, runs its four steps and exits clean with nothing from it on stderr', wakeProject.ready && rulesPeakWake.status === 0 && rulesPeakWake.steps.length === 4 && !stderrOf('rules-peak-wake').includes('dsh-glm-hourness/rules'), `exit ${rulesPeakWake.status}, ${rulesPeakWake.steps.length} step(s), git ${wakeProject.ready}; ${stderrOf('rules-peak-wake').split('\n').find(line => line.includes('rules')) ?? 'no stderr line mentions rules'}`],
  ['rules-peak-wake: after the shift to 17:59:30, npm run calibrate is refused before 18:00 with ticket q-1 and the end of the peak, so the calibrate script never ran', wakeRefusal?.isError === true && wakeRefusal.text.startsWith('Error: You tried to run "npm run calibrate".') && wakeRefusal.text.includes('Deferred as ticket q-1.') && wakeRefusal.text.includes(`defers it while glm-peak is true until ${PEAK_END_HM}.`) && !wakeRefusal.text.includes(PEAK_WAKE_CALIBRATE_WORD) && rulesPeakWake.steps[1]?.clock >= Date.parse(PEAK_WAKE_SHIFT) && rulesPeakWake.steps[2]?.clock < LOOPS_PEAK_END_MS, `clocks ${rulesPeakWake.steps.map(step => Number.isFinite(step.clock) ? new Date(step.clock).toISOString() : 'none').join(', ')}; ${wakeRefusal?.text?.slice(0, 240) ?? 'no result'}`],
  ['rules-peak-wake: the request after the refusal carries the board\'s reminder with the open ticket and the end of the peak', wakeTicketItem?.includes(`, until ${PEAK_END_HM})`) === true, JSON.stringify(boardTexts(rulesPeakWake.steps[2]))],
  ['rules-peak-wake: after 18:00 the re-judgement clears the ticket and the running agent is told once, with the time the peak ended', wakeMessages(rulesPeakWake.steps[2]).length === 0 && wakeMessages(rulesPeakWake.steps[3]).length === 1 && wakeMessages(rulesPeakWake.steps[3])[0].text === PEAK_WAKE_TEXT && rulesPeakWake.steps[3]?.clock >= LOOPS_PEAK_END_MS && peakWakeTicket?.state === 'cleared' && peakWakeTicket.rules.join() === OFFPEAK_CREDIT_RUNS.id, `${wakeMessages(rulesPeakWake.steps[3])[0]?.text ?? 'no wake in request 4'}; ticket ${JSON.stringify(peakWakeTicket ?? null).slice(0, 160)}`],
  ['rules-peak-wake: nothing is written in the scenario\'s user-level directory', !existsSync(join(runDir, 'rules-peak-wake', 'dsh-home', 'glm-hourness', 'rules')), ''],
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
  ['loops: the row ships enabled since the rules-loops merge: the boot scenarios list it in effect on both routes', glmHealth.loops?.status === ACTED && plainHealth.loops?.status === ACTED, `${healthLine(glmHealth, 'loops')}; ${healthLine(plainHealth, 'loops')}`],
  ['loops: the row, enabled by the overlay in a scratch git clone that carries a person\'s entry file, boots, runs its four steps and exits clean with nothing from it on stderr', loopsBoard.ready && loops.status === 0 && loops.steps.length === 4 && !stderrOf('loops').includes('dsh-glm-hourness/loops'), `exit ${loops.status}, ${loops.steps.length} step(s), git ${loopsBoard.ready}; ${stderrOf('loops').split('\n').find(line => line.includes('loops')) ?? 'no stderr line mentions loops'}`],
  ['loops: a file tool writing into docs/loops/ is refused by loops:files-only with the four-part text, the entry file is as it was, and the refusal is journaled as a plain denial (the gate\'s records carry no mode, G1)', lastToolResult(loops.steps[1])?.isError === true && LOOPS_DENIAL.test(lastToolResult(loops.steps[1]).text) && readFileSync(loopsBoard.entryFile, 'utf8') === LOOPS_ENTRY_TEXT && rulesRecordOf(loopsRecords, 'loops:files-only') !== undefined && rulesRecordOf(loopsRecords, 'loops:files-only')?.mode === undefined, lastToolResult(loops.steps[1])?.text?.slice(0, 200) ?? 'no result'],
  ['loops: a shell command writing into the project\'s .llm/loops/ is refused by the same rule, not by file-tools-only, and the board\'s change record does not carry what it wrote (the recorder\'s follow-up records carry a kind)', lastToolResult(loops.steps[2])?.isError === true && (lastToolResult(loops.steps[2])?.text ?? '').includes('Rule loops:files-only') && loopsJournalText !== '' && !loopsJournalText.split('\n').includes('probe') && loopsRecords.filter(record => record.rule === 'loops:files-only' && record.kind === undefined).length === 2, `${lastToolResult(loops.steps[2])?.text?.slice(0, 160) ?? 'no result'}; ${loopsRecords.filter(record => record.rule === 'loops:files-only').length} journal line(s) for the rule`],
  ['loops: the entry that only tells the main agent is taken in without an approval record: one adopt line by the harness, the file noted in repo-written.json, and view.json showing it as the agreed one', loopsAdopted.length === 1 && loopsAdopted[0].actor === 'harness' && loopsAdopted[0].via === 'repo' && /^[0-9a-f]{64}$/.test(loopsWritten?.[LOOPS_ENTRY_ID]?.fileSha256 ?? '') && loopsViewEntry?.source === 'person' && loopsViewEntry.state === 'ok' && (loopsView?.attention ?? ['none']).length === 0, `${loopsJournal.map(record => record.op).join(' > ') || 'no record'}; view ${JSON.stringify(loopsViewEntry ?? null)}; attention ${JSON.stringify(loopsView?.attention ?? null)}`],
  ['loops: the runtime directory stays out of git (.llm/ in the exclude file, its own .gitignore) and git status lists nothing after the board wrote', loopsIgnore === '*\n' && loopsExclude.split('\n').includes('.llm/') && loopsGitStatus === '', `ignore ${JSON.stringify(loopsIgnore)}; exclude ${JSON.stringify(loopsExclude.split('\n').filter(line => line.includes('llm')))}; status ${JSON.stringify(loopsGitStatus)}`],
  ['loops: the read of the entry file passes, /glm-status lists the row in effect, and every request declares the loop board in the guard section', lastToolResult(loops.steps[3])?.isError !== true && (lastToolResult(loops.steps[3])?.text ?? '').includes(LOOPS_ENTRY_ID) && loopsHealth.loops?.status === ACTED && loops.steps.every(step => step.system.includes(LOOPS_DECLARATION)), `${healthLine(loopsHealth, 'loops')} (${loopsHealth.loops?.reason ?? ''}); declared ${loops.steps.filter(step => step.system.includes(LOOPS_DECLARATION)).length}/${loops.steps.length}`],
  ['loops: a headless host has no session controller, so the row says it runs no entry here, hands out no service, takes no run lock and writes nothing of the runtime, while its gate and its files work', (loopsHealth.loops?.reason ?? '').includes('这个进程不跑循环板（没有会话控制器）') && loopsRanNothing.length === 0 && loops.steps.every(step => step.system.includes(LOOPS_DECLARATION)), `reason ${loopsHealth.loops?.reason ?? 'none'}; runtime files ${JSON.stringify(loopsRanNothing)}`],
  // Both gates of the row are installed on the real runtime from the day the row is enabled (d-code-rules-enforce). The three calls loops:schedule-tools judges cannot be made here: the headless template mounts neither dsh-schedule nor the session controller, so the reminder tools are not registered (loops design §10.2 V1; L2 covers the three in tests/loops-guard.spec.ts).
  ['loops: the row installs both of its gates and says so, and no reminder of the board can exist in a host without the schedule service', (loopsHealth.loops?.reason ?? '').includes('loops:files-only 与 loops:schedule-tools 已装上') && !(loopsHealth.loops?.reason ?? '').includes('定时服务'), `reason ${loopsHealth.loops?.reason ?? 'none'}`],
  ['loops-peak: the boot reached the provider and ran its steps clean', loopsPeak.steps.length >= 5 && loopsPeak.status === 0 && !stderrOf('loops-peak').includes('dsh-glm-hourness/loops'), `exit ${loopsPeak.status}, ${loopsPeak.steps.length} step(s); ${stderrOf('loops-peak').split('\n').find(line => line.includes('loops')) ?? 'no stderr line mentions loops'}`],
  ['loops-peak: after the shifted clock crossed the peak\'s end, the board waked the idle main agent that worked in the peak once — one delivered run, whose reminder the woken request carries (a followup persists, so the turn the child\'s completion woke still carries it) and says the words of the table\'s row 10', loopsPeakRuns().filter(record => record.kind === 'loop-done' && record.entry === 'loops.peak-end' && record.outcome === 'delivered').length === 1 && loopsPeakNoticeSteps.length >= 1 && loopNotices(loopsPeakNoticeSteps[0])[0].text.includes('Work you moved to after peak can start now.') && loopsPeakNoticeSteps[0].clock > LOOPS_PEAK_END_MS, `${loopsPeakNoticeSteps.length} step(s) with the reminder at ${JSON.stringify(loopsPeakNoticeSteps.map(step => step.clock))}; runs ${JSON.stringify(loopsPeakRuns().filter(record => record.entry === 'loops.peak-end').map(record => [record.kind, record.outcome]))}`],
  ['loops-peak restart: the re-emitted end edge of the same peak is a duplicate, so no second reminder goes out after the restart, and the journal still carries the one delivered run', loopsPeakRestartNoticeSteps.length === 0 && loopsPeakRuns().some(record => record.kind === 'loop-duplicate' && record.key === `peak-changed:end:${LOOPS_PEAK_END}`) && loopsPeakRuns().filter(record => record.kind === 'loop-done' && record.entry === 'loops.peak-end').length === 1, `${loopsPeakRestartNoticeSteps.length} step(s) with a notice; duplicates ${loopsPeakRuns().filter(record => record.kind === 'loop-duplicate').length}; runs ${JSON.stringify(loopsPeakRuns().filter(record => record.entry === 'loops.peak-end').map(record => [record.kind, record.outcome]))}`],
  ['rules-peak-hourness: the row is in effect without the pricing service (a supported combination) and the main agent\'s tool call ran', aloneHealth.rules?.status === ACTED && aloneHealth.rules.reason.includes('读不出是不是高峰') && lastToolResult(rulesPeakAlone.steps[1])?.isError !== true && !stderrOf('rules-peak-hourness').includes('dsh-glm-hourness/rules'), `${healthLine(aloneHealth, 'rules')} (${aloneHealth.rules?.reason ?? ''})`],
  ...metricsCheckList,
  ...metricsConcurrentChecks,
  ...metricsRuleChecks,
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
console.log(`probe: ${checks.length - failed}/${checks.length} passed`)

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
if (failed > 0) process.exit(1)
// A run that passed leaves nothing behind; a directory that cannot be deleted is named and the result stands.
try {
  removeRunDir(runDir)
}
catch (error) {
  console.warn(`probe: the run directory was not deleted (${error instanceof Error ? error.message : String(error)}): ${runDir}`)
}
process.exit(0)
