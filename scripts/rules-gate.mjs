/**
 * The self-check a repository script makes before it starts (M6 design
 * §7.2 item 2; docs/ORCHESTRATION.md §11.4, §16.10): `gateOnRules` asks the
 * rules board's `checkCall` whether the script's command may run now, the
 * way the tool-call gate asks for an agent's call. The calibration runs and
 * the authorized real-network smoke call it first thing; each says how it
 * spends GLM credit (`glmSpend`), and the peak level and the project's rules
 * decide.
 *
 * - Allowed (exit code 0 of the check): the script goes on, nothing is written.
 * - Blocked (4): the refusal on the standard error, one line per hit rule in
 *   the project's violation journal, then exit 4.
 * - Deferred (5): the refusal, a line naming the rules and `--wait`, the
 *   journal lines, then exit 5. With `--wait` (taken out of process.argv, so
 *   the script's own parser never sees it) the check is made again one second
 *   after the GLM peak ends when the verdict read the peak, else every 60
 *   seconds, for up to 8 hours.
 *
 * The gate holds no rule of its own and runs nothing: a script a rule names
 * is the board's to run. It records no judgement either; that record is the
 * board's own, one per check. A rules board that cannot be loaded or fails
 * lets the script start, with one line on the standard error. The journal
 * line is a trace, not a gate: when it cannot be written the verdict stands
 * and one line says so.
 *
 * Needs the build output (`npm run build`): the board, the pricing helper,
 * the journal and the project root come from packages/hourness/dist/.
 */
import { existsSync } from 'node:fs'
import { appendFile, mkdir } from 'node:fs/promises'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(REPO, 'packages', 'hourness', 'dist')
/** How long `--wait` waits in all (the bound the board puts on `waitedMs`). */
const WAIT_LIMIT_MS = 8 * 60 * 60 * 1000
/** The pause between two checks when the verdict does not name the end of the peak. */
const RECHECK_MS = 60_000
/** How long after the end of the peak the next check comes. */
const AFTER_PEAK_MS = 1_000
/** An npm script name the command text may carry (`npm_lifecycle_event`). */
const NPM_SCRIPT = /^[a-z0-9:_-]{1,64}$/
const SPENDS = ['optional', 'necessary']

const messageOf = error => (error instanceof Error ? error.message : String(error))
/** A reason as one line of at most 80 characters. */
const clip = text => text.replace(/\s+/g, ' ').slice(0, 80)
/** `HH:MM` of an ISO moment on the wall clock of this machine, as the board's own words write it. */
const clockOf = iso => {
  const at = Date.parse(iso)
  return new Date(at - new Date(at).getTimezoneOffset() * 60_000).toISOString().slice(11, 16)
}

/** One line on the standard error, resolved once it is written: the process may exit right after. */
const say = line => new Promise((done) => {
  process.stderr.write(`${line}\n`, () => done())
})

/** Take every `--wait` out of the arguments; whether there was one. */
function takeWait(argv) {
  let found = false
  for (let index = argv.indexOf('--wait', 2); index !== -1; index = argv.indexOf('--wait', 2)) {
    argv.splice(index, 1)
    found = true
  }
  return found
}

/** The command the board judges: the npm script that started this one, else `node <script>` relative to the repository, with the arguments. */
function commandOf(root) {
  const script = process.env.npm_lifecycle_event
  const head = script !== undefined && NPM_SCRIPT.test(script)
    ? `npm run ${script}`
    : `node ${relative(root, process.argv[1] ?? '').replaceAll('\\', '/')}`
  return [head, ...process.argv.slice(2)].join(' ')
}

/** `checkCall` and `nextPeakChange` from the build output, or why they cannot be had. */
async function boardOf(checkModule, pricingModule) {
  try {
    const [check, pricing] = await Promise.all([import(pathToFileURL(resolve(checkModule)).href), import(pathToFileURL(resolve(pricingModule)).href)])
    if (typeof check.checkCall !== 'function') return { problem: `${basename(checkModule)} has no checkCall` }
    if (typeof pricing.nextPeakChange !== 'function') return { problem: `${basename(pricingModule)} has no nextPeakChange` }
    return { checkCall: check.checkCall, nextPeakChange: pricing.nextPeakChange }
  }
  catch (error) {
    return { problem: messageOf(error) }
  }
}

/** What the gate tells the board about the GLM peak at `at`: the value, and while it is peak its end; or why there is none. */
function peakOf(peakAt, nextPeakChange, at) {
  try {
    const value = peakAt(at)
    if (typeof value !== 'boolean') return { problem: `peakAt gave ${typeof value}, not true or false` }
    const end = value ? nextPeakChange(peakAt, at) : undefined
    return { given: { signals: { 'glm-peak': value }, ...(end === undefined ? {} : { peakUntil: new Date(end).toISOString() }) } }
  }
  catch (error) {
    return { problem: messageOf(error) }
  }
}

/** The end of the peak a deferral names: only when the verdict read `glm-peak` as true, and then it is the end the gate gave. */
const endOf = (result, peak) => (result.signals.some(signal => signal.name === 'glm-peak' && signal.value === true) ? peak.given?.peakUntil : undefined)

/** Append records to the project's violation journal (src/memory/audit.ts), making git ignore `.llm/` first when it is not there yet. */
async function appendRecords(root, records, appendLine) {
  const [{ auditJournal, auditPaths, fsAppender }, { ensureIgnored, projectOf }] = await Promise.all([
    import(pathToFileURL(join(DIST, 'memory', 'audit.js')).href),
    import(pathToFileURL(join(DIST, 'data', 'project-root.js')).href),
  ])
  const project = projectOf(root)
  if (project === undefined) throw new Error(`${root} is in no git repository and has no .llm`)
  const home = join(project.root, '.llm')
  if (!existsSync(home)) await ensureIgnored(project.root, '.llm')
  const journal = auditJournal(appendLine ?? fsAppender({ mkdir, appendFile }), auditPaths({ projectHome: home }))
  for (const record of records) await journal.violation(record)
}

/**
 * Ask the rules board whether this script may start. `glmSpend` and `peakAt`
 * are the call site's; the rest is for tests: the clock, the sleep, the build
 * output of the board and of the pricing helper, the repository root (default
 * the parent of scripts/) and the appender of the violation journal. Returns
 * when the script may start; ends the process with 4 or 5 when it may not.
 */
export async function gateOnRules(options) {
  const { glmSpend, peakAt } = options
  if (!SPENDS.includes(glmSpend)) throw new TypeError(`gateOnRules: glmSpend is ${SPENDS.join(' or ')}`)
  if (typeof peakAt !== 'function') throw new TypeError('gateOnRules: peakAt is a function of the moment')
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? (ms => new Promise(done => setTimeout(done, ms)))
  const root = resolve(options.projectRoot ?? REPO)
  const wait = takeWait(process.argv)
  const command = commandOf(root)
  const board = await boardOf(options.checkModule ?? join(DIST, 'rules', 'check.js'), options.pricingModule ?? join(DIST, 'shared', 'pricing.js'))
  if ('problem' in board) {
    await say(`rules gate: rules board not available (${clip(board.problem)}); starting without the check`)
    return
  }

  const journaled = new Set()
  let journalFailed = false
  let peakTold = false
  /** The journal lines of the hit rules this run has not written for this effect yet. */
  const journal = async (result, hits) => {
    const fresh = hits.filter(hit => !journaled.has(`${hit.id}\u0000${result.effect}`))
    if (fresh.length === 0) return
    for (const hit of fresh) journaled.add(`${hit.id}\u0000${result.effect}`)
    const at = new Date(now()).toISOString()
    const signals = Object.fromEntries(result.signals.filter(signal => signal.value !== undefined).map(signal => [signal.name, signal.value]))
    const records = fresh.map(hit => ({ at, rule: `rules:${hit.id}`, mode: 'enforce', effect: result.effect, tool: 'pwsh', command, peakMode: result.peakMode, signals, correction: result.text ?? '' }))
    try {
      await appendRecords(root, records, options.appendLine)
    }
    catch (error) {
      if (journalFailed) return
      journalFailed = true
      await say(`rules gate: violation journal not written (${clip(messageOf(error))})`)
    }
  }
  /** Once a run: the gate could not say whether it is peak, and what the board read instead. */
  const tellPeak = async (peak, result) => {
    if (peak.problem === undefined || peakTold) return
    peakTold = true
    const unknown = result.signals.find(signal => signal.name === 'glm-peak' && signal.value === undefined)?.unknown
    await say(`rules gate: glm-peak not computed here (${clip(peak.problem)})${unknown === undefined ? '' : `; ${unknown}`}`)
  }

  const first = now()
  for (let checks = 0; ; checks += 1) {
    const at = now()
    const waited = Math.min(Math.round(at - first), WAIT_LIMIT_MS)
    const peak = peakOf(peakAt, board.nextPeakChange, at)
    let result
    try {
      result = await board.checkCall({ tool: 'pwsh', args: { command } }, { project: root, glmSpend, ...peak.given, ...(checks === 0 ? {} : { waitedMs: waited }) })
    }
    catch (error) {
      const code = error instanceof Error && error.name === 'RulesCheckError' && typeof error.code === 'string' ? error.code : 'error'
      await say(`rules gate: rules board not available (${code}: ${clip(messageOf(error))}); starting without the check`)
      return
    }
    if (result.exitCode === 0) {
      await tellPeak(peak, result)
      return
    }
    const hits = result.rules.filter(rule => rule.effect === result.effect && rule.when !== 'false')
    const until = endOf(result, peak)
    const final = result.exitCode === 4 || !wait || waited >= WAIT_LIMIT_MS
    if (final || checks === 0) {
      if (result.text !== undefined) await say(result.text)
      if (result.exitCode === 5 && final) await say(`rules gate: ${hits.map(hit => hit.id).join(', ')} queues this run${until === undefined ? '' : `; GLM peak ends at ${clockOf(until)}`}. Rerun with --wait to wait.`)
      if (result.exitCode === 5 && !final) await say(until === undefined ? 'rules gate: re-checking every 60 s for up to 8 h' : `rules gate: waiting until ${clockOf(until)}`)
    }
    await tellPeak(peak, result)
    await journal(result, hits)
    if (final) process.exit(result.exitCode)
    const pause = until === undefined ? RECHECK_MS : Date.parse(until) + AFTER_PEAK_MS - at
    await sleep(Math.min(pause, WAIT_LIMIT_MS - waited))
  }
}
