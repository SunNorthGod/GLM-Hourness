/**
 * L3 behavior probe (docs/DEVELOPMENT.md §3, ROADMAP M1.7): boots the real
 * desktop DSH runtime headless on the glmsandbox profile with the probe
 * provider (scripts/probe/probe-llm.mjs), runs scripted tasks, and checks
 * what the GLM-Hourness rows actually did to the model-visible request.
 *
 * Scenarios: a GLM route must get the ZCode dialect; a non-GLM route through
 * the same provider must stay untouched (no cross-route pollution).
 *
 * Usage: node scripts/probe/run-probe.mjs
 * Requires the desktop install (DSH_DESKTOP_DIR overrides the location) and
 * the glmsandbox profile linked to this repository. Each run writes its
 * overlays, request dumps and logs under .llm/probe-runs/<timestamp>/
 * (gitignored).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const desktop = process.env.DSH_DESKTOP_DIR ?? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DeepSeek Harness')
const exe = join(desktop, 'DeepSeek Harness.exe')
const bin = join(desktop, 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
if (!existsSync(exe)) {
  console.error(`probe: desktop runtime not found at ${exe} (set DSH_DESKTOP_DIR)`)
  process.exit(2)
}

const runDir = join(repo, '.llm', 'probe-runs', new Date().toISOString().replace(/[:.]/g, '-'))
const slash = path => path.replaceAll('\\', '/')

/**
 * Boot one headless task on `model` with a scripted reply sequence and return
 * the main agent's requests (the session-title request carries no tools).
 */
function runScenario(name, model, script, task) {
  const dir = join(runDir, name)
  const home = join(dir, 'home')
  mkdirSync(home, { recursive: true })
  const dump = join(dir, 'requests.jsonl')
  writeFileSync(dump, '')
  // The overlay is generated per run with literal values: the loader validates
  // a row's `name` before `!!js` expressions evaluate, so paths cannot be
  // computed inside the patch. JSON strings are valid YAML scalars.
  const patch = join(dir, 'probe.patch.yml')
  writeFileSync(patch, [
    '- id: agent-default-model',
    `  config: { provider: glm-probe, model: ${JSON.stringify(model)} }`,
    ...['memory', 'workflow', 'hourness'].flatMap(row => [`- id: glm-hourness/${row}`, `  config: { home: ${JSON.stringify(slash(home))} }`]),
    '- insert:',
    '    - id: glm-hourness-probe/llm',
    `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-llm.mjs')))}`,
    '      inject: [llm]',
    `      config: { dump: ${JSON.stringify(slash(dump))}, script: ${JSON.stringify(JSON.stringify(script))} }`,
    '',
  ].join('\n'))
  const result = spawnSync(exe, [bin, '--profile', 'glmsandbox', '--patch', patch, task], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  writeFileSync(join(dir, 'stdout.txt'), result.stdout ?? '')
  writeFileSync(join(dir, 'stderr.txt'), result.stderr ?? '')
  const requests = readFileSync(dump, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line))
  return { status: result.status, steps: requests.filter(request => request.tools.length > 0) }
}

const zcodeFace = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']
const nativeFace = ['read', 'write', 'edit', 'glob', 'grep', 'pwsh']
const names = step => new Set((step?.tools ?? []).map(tool => tool.name))

const glm = runScenario('glm', 'glm-5.3', [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { text: 'done' },
], 'Read package.json and reply done.')
const glmFirst = glm.steps[0]
const glmTools = names(glmFirst)
const readResult = glm.steps[1]?.messages.find(message => message.role === 'tool')

const plain = runScenario('non-glm', 'deepseek-probe', [{ text: 'done' }], 'Reply done.')
const plainFirst = plain.steps[0]
const plainTools = names(plainFirst)

const checks = [
  ['glm boot: the runtime reached the probe provider', glmFirst !== undefined, `exit ${glm.status}, ${glm.steps.length} step(s)`],
  ['glm prompt: ZCode CLI prefix in the system prompt', glmFirst?.system.includes('You are ZCode, an interactive coding agent') === true, glmFirst === undefined ? 'no request' : glmFirst.system.slice(0, 80).replace(/\n/g, ' ')],
  ['glm prompt: DSH identity replaced', glmFirst !== undefined && !glmFirst.system.includes('powered by DeepSeek Harness'), ''],
  ['glm tools: ZCode-facing aliases present', zcodeFace.every(name => glmTools.has(name)), zcodeFace.filter(name => !glmTools.has(name)).join(', ') || 'all present'],
  ['glm tools: covered natives hidden', nativeFace.every(name => !glmTools.has(name)), nativeFace.filter(name => glmTools.has(name)).join(', ') || 'none visible'],
  ['glm execution: Read alias returned the file', readResult !== undefined && readResult.isError !== true && readResult.text.includes('dsh-glm-hourness'), readResult === undefined ? 'no tool result' : readResult.text.slice(0, 80).replace(/\n/g, ' ')],
  ['non-glm boot: the runtime reached the probe provider', plainFirst !== undefined, `exit ${plain.status}, ${plain.steps.length} step(s)`],
  ['non-glm prompt: DSH identity untouched', plainFirst?.system.includes('powered by DeepSeek Harness') === true && !plainFirst.system.includes('You are ZCode'), ''],
  ['non-glm tools: natives present, no aliases', plainFirst !== undefined && nativeFace.every(name => plainTools.has(name)) && zcodeFace.every(name => !plainTools.has(name)), zcodeFace.filter(name => plainTools.has(name)).join(', ') || ''],
]

let failed = 0
for (const [label, ok, detail] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}
console.log(`probe: ${checks.length - failed}/${checks.length} passed; run artifacts in ${runDir}`)
process.exit(failed === 0 ? 0 : 1)
