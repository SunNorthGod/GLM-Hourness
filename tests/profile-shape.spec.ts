import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { compareShapes, describeDifference, isProjectDifference, patchShape, profileShape } from '../scripts/profile-shape.mjs'

const SCRIPT = join(import.meta.dirname, '..', 'scripts', 'profile-shape.mjs')
/** A value no output may contain: the shape carries ids, key names, package names and digests only. */
const SECRET = 'probe-fake-value-7f3a'

const PATCH = [
  '# header comment',
  '- id: glm-hourness/glm-prompt',
  '  config:',
  '    persona: |',
  `      ${SECRET}: not a key`,
  '      second line',
  '    skills:',
  '      - name: one',
  '        level: 2',
  '      - plain item',
  '    env:',
  '      cwd: "C:/ws"',
  '  disabled: false',
  '- id: glm-hourness/memory',
  `  config: { home: ${SECRET} }`,
  '- id: agent-default-model',
  `  name: '@deepseek-ai/dsh-agent-default-model'`,
  '  config:',
  `    model: ${SECRET}`,
  '- insert:',
  '    - id: other/row',
  '      name: ./x.js',
  '- id: glm-hourness/memory',
  '  disabled: true',
  '',
].join('\n')

function profileDir(root: string, name: string, patch: string, manifest: Record<string, unknown>): string {
  const dir = join(root, 'profiles', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(dir, 'cordis.patch.yml'), patch)
  return dir
}

const MANIFEST = {
  name: 'dsh-profile-fixture',
  private: true,
  dependencies: { 'dsh-glm-hourness': `link:C:/${SECRET}` },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-glm-hourness'] }, desktopNextPlugins: { value: SECRET } },
}

test('entries start at a line beginning with "-"; header comments and [] are not entries; a repeated id and an entry without one get their own keys', () => {
  const entries = patchShape(PATCH)
  assert.deepEqual(entries.map(entry => entry.key), ['glm-hourness/glm-prompt', 'glm-hourness/memory', 'agent-default-model', '#4', 'glm-hourness/memory#2'])
  assert.equal(entries[3]?.id, undefined)
  assert.deepEqual(patchShape('# only a comment\n[]\n'), [])
  assert.deepEqual(patchShape('-\n  id: bare\n  disabled: true\n').map(entry => [entry.key, entry.keys]), [['bare', ['disabled', 'id']]])
})

test('key paths follow nesting; block scalar, inline and continuation text is never read as a key', () => {
  const [prompt, memory, model, insert] = patchShape(PATCH)
  assert.deepEqual(prompt?.keys, ['config', 'config.env', 'config.env.cwd', 'config.persona', 'config.skills', 'config.skills[].level', 'config.skills[].name', 'disabled', 'id'])
  assert.deepEqual(memory?.keys, ['config', 'id'])
  assert.deepEqual(model?.keys, ['config', 'config.model', 'id', 'name'])
  assert.deepEqual(insert?.keys, ['insert', 'insert[].id', 'insert[].name'])
  assert.ok(patchShape(PATCH).every(entry => entry.keys.every(key => !key.includes(SECRET))))
  assert.deepEqual(patchShape('- id: a\n  config: first line\n    continued: text\n').map(entry => entry.keys), [['config', 'id']])
})

test('the digest ignores trailing whitespace, blank lines, whole-line comments and paired quotes, and follows every value', () => {
  const digest = (text: string) => patchShape(text)[0]?.digest
  const base = digest('- id: a\n  config:\n    home: "C:/ws"\n')
  assert.equal(digest('- id: a   \n\n  # note\n  config:\n    home: C:/ws\n'), base)
  assert.equal(digest("- id: 'a'\n  config:\n    home: 'C:/ws'\n"), base)
  assert.notEqual(digest('- id: a\n  config:\n    home: C:/other\n'), base)
  assert.notEqual(digest('- id: a\n  config:\n    home: C:/ws # moved\n'), base) // inline comments are part of the text
})

test('profileShape reads the bundle list, the dependency names and the other manifest keys with digests', () => {
  const root = mkdtempSync(join(tmpdir(), 'profile-shape-'))
  try {
    const shape = profileShape(profileDir(root, 'fixture', PATCH, MANIFEST))
    assert.deepEqual(shape.bundles, ['@deepseek-ai/dsh-base', 'dsh-glm-hourness'])
    assert.deepEqual(shape.dependencies.map(item => item.name), ['dsh-glm-hourness'])
    assert.deepEqual(shape.manifest.map(item => item.name), ['name', 'private', 'dsh.desktopNextPlugins'])
    assert.equal(shape.entries.length, 5)
    assert.ok(!JSON.stringify(shape).includes(SECRET))
    rmSync(join(root, 'profiles', 'fixture', 'cordis.patch.yml'))
    assert.deepEqual(profileShape(join(root, 'profiles', 'fixture')).entries, [])
    assert.throws(() => profileShape(join(root, 'profiles', 'absent')))
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('compareShapes reports each class of difference, and only bundles, dependencies and glm-hourness/ overrides count as the project part', () => {
  const before = { bundles: ['a', 'b', 'c'], dependencies: [{ name: 'p', digest: '1' }, { name: 'q', digest: '2' }], manifest: [{ name: 'dsh.desktopNextPlugins', digest: '1' }], entries: patchShape(PATCH) }
  assert.deepEqual(compareShapes(before, before), [])
  const changedPatch = PATCH
    .replace('  disabled: false', '  disabled: true') // digest
    .replace('  config: { home', '  disabled: false\n  config: { home') // keys
    .replace('- id: agent-default-model', '- id: agent-default-model-2') // removed + added
  const after = {
    bundles: ['b', 'a', 'd'],
    dependencies: [{ name: 'q', digest: '3' }, { name: 'r', digest: '4' }],
    manifest: [{ name: 'dsh.desktopNextPlugins', digest: '2' }, { name: 'dsh.desktopNextOnboarding', digest: '1' }],
    entries: patchShape(changedPatch),
  }
  const differences = compareShapes(before, after).map(describeDifference)
  assert.deepEqual(differences.sort(), [
    'bundles added d',
    'bundles order',
    'bundles removed c',
    'dependencies added r',
    'dependencies changed q',
    'dependencies removed p',
    'manifest added dsh.desktopNextOnboarding',
    'manifest changed dsh.desktopNextPlugins',
    'patch added agent-default-model-2',
    'patch digest glm-hourness/glm-prompt',
    'patch keys glm-hourness/memory',
    'patch removed agent-default-model',
  ])
  assert.deepEqual(compareShapes(before, { ...before, bundles: ['c', 'b', 'a'] }).map(describeDifference), ['bundles order'])
  const project = compareShapes(before, after).filter(isProjectDifference).map(describeDifference).sort()
  assert.deepEqual(project, ['bundles added d', 'bundles order', 'bundles removed c', 'dependencies added r', 'dependencies changed q', 'dependencies removed p', 'patch digest glm-hourness/glm-prompt', 'patch keys glm-hourness/memory'])
})

test('the command line snapshots and compares without printing or storing a value; exit 0, 1 and 2', () => {
  const root = mkdtempSync(join(tmpdir(), 'profile-shape-'))
  try {
    const dir = profileDir(root, 'fixture', PATCH, MANIFEST)
    const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, DSH_HOME: root } })
    const snapshot = join(root, 'out', 'shape.json')
    const written = run('snapshot', 'fixture', snapshot)
    assert.equal(written.status, 0, written.stderr)
    const same = run('compare', 'fixture', snapshot)
    assert.equal(same.status, 0, same.stderr)
    writeFileSync(join(dir, 'cordis.patch.yml'), PATCH.replace(`    model: ${SECRET}`, `    model: ${SECRET}-2`))
    const changed = run('compare', 'fixture', snapshot)
    assert.equal(changed.status, 1)
    assert.match(changed.stdout, /fixture: patch digest agent-default-model\n/)
    for (const result of [written, same, changed]) assert.ok(!`${result.stdout}${result.stderr}`.includes(SECRET))
    assert.ok(!readFileSync(snapshot, 'utf8').includes(SECRET))
    writeFileSync(join(dir, 'package.json'), `{ "name": "${SECRET}" `) // broken JSON: the parse message would quote it
    const broken = run('compare', 'fixture', snapshot)
    assert.equal(broken.status, 2)
    assert.ok(!`${broken.stdout}${broken.stderr}`.includes(SECRET))
    profileDir(root, 'fixture', PATCH, MANIFEST)
    assert.equal(run('snapshot', '../desktop', snapshot).status, 2)
    assert.equal(run('snapshot', 'absent', snapshot).status, 2)
    assert.equal(run('compare', 'fixture', join(root, 'missing.json')).status, 2)
    assert.equal(run('snapshot', 'fixture').status, 2)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
