/**
 * L3 behavior probe (docs/DEVELOPMENT.md §3, ROADMAP M1.7): boots the real
 * desktop DSH runtime headless on the glmsandbox profile with the probe
 * provider (scripts/probe/probe-llm.mjs), runs one scripted task, and checks
 * what the GLM-Hourness rows actually did to the model-visible request.
 *
 * Usage: node scripts/probe/run-probe.mjs
 * Requires the desktop install (DSH_DESKTOP_DIR overrides the location) and
 * the glmsandbox profile linked to this repository. Each run writes its dump
 * and logs under .llm/probe-runs/<timestamp>/ (gitignored).
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
const home = join(runDir, 'home')
mkdirSync(home, { recursive: true })
const dump = join(runDir, 'requests.jsonl')
writeFileSync(dump, '')

/** Scripted replies: read a known file through the ZCode-facing Read, then finish. */
const script = [
  { tool: { name: 'Read', arguments: { file_path: join(repo, 'package.json') } } },
  { text: 'done' },
]

// The overlay is generated per run with literal values: the loader validates a
// row's `name` before `!!js` expressions evaluate, so paths cannot be computed
// inside the patch. JSON strings are valid YAML scalars.
const slash = path => path.replaceAll('\\', '/')
const patch = join(runDir, 'probe.patch.yml')
writeFileSync(patch, [
  '- id: agent-default-model',
  '  config: { provider: glm-probe, model: glm-5.3 }',
  ...['memory', 'workflow', 'hourness'].flatMap(row => [`- id: glm-hourness/${row}`, `  config: { home: ${JSON.stringify(slash(home))} }`]),
  '- insert:',
  '    - id: glm-hourness-probe/llm',
  `      name: ${JSON.stringify(slash(join(repo, 'scripts', 'probe', 'probe-llm.mjs')))}`,
  '      inject: [llm]',
  `      config: { dump: ${JSON.stringify(slash(dump))}, script: ${JSON.stringify(JSON.stringify(script))} }`,
  '',
].join('\n'))

const result = spawnSync(exe, [bin, '--profile', 'glmsandbox', '--patch', patch, 'Read package.json and reply done.'], {
  cwd: repo,
  encoding: 'utf8',
  timeout: 180_000,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
writeFileSync(join(runDir, 'stdout.txt'), result.stdout ?? '')
writeFileSync(join(runDir, 'stderr.txt'), result.stderr ?? '')

const requests = readFileSync(dump, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line))
const first = requests[0]
const second = requests[1]
const toolNames = new Set((first?.tools ?? []).map(tool => tool.name))
const zcodeFace = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']
const nativeFace = ['read', 'write', 'edit', 'glob', 'grep', 'pwsh']
const readResult = second?.messages.find(message => message.role === 'tool')

const checks = [
  ['boot: the runtime reached the probe provider', first !== undefined, `exit ${result.status}, ${requests.length} request(s)`],
  ['dialect prompt: ZCode CLI prefix in the system prompt', first?.system.includes('You are ZCode, an interactive coding agent') === true, first === undefined ? 'no request' : first.system.slice(0, 80).replace(/\n/g, ' ')],
  ['dialect prompt: DSH identity replaced', first !== undefined && !first.system.includes('powered by DeepSeek Harness'), ''],
  ['dialect tools: ZCode-facing aliases present', zcodeFace.every(name => toolNames.has(name)), zcodeFace.filter(name => !toolNames.has(name)).join(', ') || 'all present'],
  ['dialect tools: covered natives hidden', nativeFace.every(name => !toolNames.has(name)), nativeFace.filter(name => toolNames.has(name)).join(', ') || 'none visible'],
  ['alias execution: Read returned the file', readResult !== undefined && readResult.isError !== true && readResult.text.includes('dsh-glm-hourness'), readResult === undefined ? 'no tool result' : readResult.text.slice(0, 80).replace(/\n/g, ' ')],
]

let failed = 0
for (const [label, ok, detail] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}
console.log(`probe: ${checks.length - failed}/${checks.length} passed; run artifacts in ${runDir}`)
process.exit(failed === 0 ? 0 : 1)
