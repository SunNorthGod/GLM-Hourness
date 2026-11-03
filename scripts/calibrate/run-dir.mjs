/**
 * Where the calibration runs live while they run (docs/ORCHESTRATION.md
 * §10.5.1; risk `risk-calib-read`): the model under test can read any path it
 * can name, and a run used to sit in `<repo>/.llm/calibration-runs/`, so a
 * run could find the repository, the other runs and the earlier results. A
 * batch now runs in the system temporary directory, one directory for the
 * batch and one for each run, none inside another, and only when the whole
 * batch is done is everything copied back to
 * `<repo>/.llm/calibration-runs/<stamp>/` and the temporary directories
 * deleted. The repository root is a parameter (the tests give a temporary
 * directory), and so is the temporary root.
 *
 * `<repo>/.llm/calibration-runs/<stamp>/pending.json` is the record of what
 * is in the temporary directory: `{root, runs: [{name, dir}]}`. It is written
 * (temporary file, then rename) before a run starts, so a crash leaves the
 * way back: `npm run calibrate -- --collect <stamp>` does the copying and the
 * clean-up. Nothing is deleted unless every file was copied and compared; only
 * paths of the record that are direct children of the temporary directory
 * with the prefix `glm-hourness-calib-` are ever deleted.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'

const BATCH_PREFIX = 'glm-hourness-calib-batch-'
const RUN_PREFIX = 'glm-hourness-calib-run-'
/** The name every directory this module deletes starts with. */
const SAFE_PREFIX = 'glm-hourness-calib-'
const PENDING = 'pending.json'
/** The name of a run: no path separators, not `.` or `..`. */
const RUN_NAME = /^[\w.-]+$/u

const targetOf = (repo, stamp) => join(repo, '.llm', 'calibration-runs', stamp)
const sameDir = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b)

/** Write `value` as JSON to `file` through a temporary file in the same directory, so the file is whole or not there. */
function writeJson(file, value) {
  const temporary = `${file}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, file)
}

/**
 * Start a batch: the directory the results are copied back to, the batch
 * directory in the temporary directory (where `results.json` is written), and
 * the record of both. `tmp` is the temporary root (the system's by default).
 */
export function openBatch(repo, stamp, tmp = tmpdir()) {
  const target = targetOf(repo, stamp)
  mkdirSync(target, { recursive: true })
  const root = mkdtempSync(join(tmp, BATCH_PREFIX))
  const batch = { repo, stamp, tmp, target, root, runs: [] }
  writeJson(join(target, PENDING), { root, runs: [] })
  return batch
}

/** A directory for one run, in the temporary directory and in no other directory of the batch; recorded before the run starts. Returns its path. */
export function openRun(batch, name) {
  if (!RUN_NAME.test(name) || name === '.' || name === '..') throw new Error(`calibrate: "${name}" is not a name for a run directory`)
  const dir = mkdtempSync(join(batch.tmp, RUN_PREFIX))
  batch.runs.push({ name, dir })
  writeJson(join(batch.target, PENDING), { root: batch.root, runs: batch.runs })
  return dir
}

/** The files of a directory tree with their sizes, by path relative to it. */
function filesOf(dir) {
  const sizes = new Map()
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const file = join(entry.parentPath ?? entry.path, entry.name)
    sizes.set(relative(dir, file), statSync(file).size)
  }
  return sizes
}

/** Why the tree at `to` is not a copy of the tree at `from`: the first file that is missing or of another size; undefined when it is one. */
function differenceOf(from, to) {
  const copied = filesOf(to)
  for (const [file, size] of filesOf(from)) {
    if (!copied.has(file)) return `${file} is missing in ${to}`
    if (copied.get(file) !== size) return `${file} has ${copied.get(file)} bytes in ${to}, ${size} in ${from}`
  }
  return undefined
}

/** A path of the record that may be deleted: a direct child of the temporary directory with the prefix of this module. */
function deletable(path, tmp) {
  return sameDir(dirname(resolve(path)), tmp) && basename(path).startsWith(SAFE_PREFIX)
}

function failed(stamp, directories, why) {
  return {
    ok: false,
    kept: directories,
    message: `拷回没有完成：临时目录 ${directories.join('、')} 保留（${why}）；修好后运行 npm run calibrate -- --collect ${stamp}`,
  }
}

/**
 * Copy the batch back and clear the temporary directories, from the record
 * only. The batch directory's entries go to `<repo>/.llm/calibration-runs/<stamp>/`,
 * each run directory to `<stamp>/<name>/`, whole (`ws/.git` included), and
 * nothing is overwritten: a name that is there already stops it before
 * anything is copied. Every file of the sources must then be in the target
 * with the same size. Only then are the temporary directories of the record
 * deleted (those that are direct children of `tmp` with the prefix, the rest
 * are named in `kept`) and the record. On a failure nothing is deleted, what
 * this call copied is taken away again, and the record stays.
 */
export function collectBatch(repo, stamp, tmp = tmpdir()) {
  const target = targetOf(repo, stamp)
  const file = join(target, PENDING)
  let pending
  try {
    pending = JSON.parse(readFileSync(file, 'utf8'))
  }
  catch (error) {
    return { ok: false, kept: [], message: `拷回没有完成：读不到 ${file}（${error instanceof Error ? error.message : String(error)}）；没有可拷回的批次，或批次名不对` }
  }
  const runs = Array.isArray(pending.runs) ? pending.runs : []
  const directories = [pending.root, ...runs.map(run => run.dir)].filter(dir => typeof dir === 'string')
  if (typeof pending.root !== 'string' || runs.some(run => typeof run?.dir !== 'string' || typeof run?.name !== 'string' || !RUN_NAME.test(run.name) || run.name === '.' || run.name === '..')) {
    return failed(stamp, directories, `${PENDING} is not a record of this module`)
  }
  const missing = directories.find(dir => !existsSync(dir))
  if (missing !== undefined) return failed(stamp, directories, `${missing} is gone`)
  const plan = [
    ...readdirSync(pending.root).map(name => ({ from: join(pending.root, name), to: join(target, name) })),
    ...runs.map(run => ({ from: run.dir, to: join(target, run.name) })),
  ]
  const taken = plan.find(step => existsSync(step.to))
  if (taken !== undefined) return failed(stamp, directories, `${taken.to} is there already`)
  const made = []
  try {
    for (const step of plan) {
      made.push(step.to)
      cpSync(step.from, step.to, { recursive: true, errorOnExist: true, force: false })
    }
    for (const step of plan) {
      if (statSync(step.from).isDirectory()) {
        const difference = differenceOf(step.from, step.to)
        if (difference !== undefined) throw new Error(difference)
      }
      else if (statSync(step.to).size !== statSync(step.from).size) throw new Error(`${step.to} is not the size of ${step.from}`)
    }
  }
  catch (error) {
    for (const path of made) rmSync(path, { recursive: true, force: true })
    return failed(stamp, directories, error instanceof Error ? error.message : String(error))
  }
  const kept = []
  for (const dir of directories) {
    if (deletable(dir, tmp)) rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
    else kept.push(dir)
  }
  rmSync(file, { force: true })
  return { ok: true, kept, message: kept.length === 0 ? '' : `没有删除这些目录（不是临时目录下以 ${SAFE_PREFIX} 开头的直接子目录）：${kept.join('、')}` }
}

/** The batch is done: copy it back and clear the temporary directories (collectBatch). */
export function closeBatch(batch) {
  return collectBatch(batch.repo, batch.stamp, batch.tmp)
}
