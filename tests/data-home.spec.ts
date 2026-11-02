import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { projectHomeFor } from '../src/data/project-home.ts'
import { apply, dataServiceFor } from '../src/data/index.ts'
import { credentialHome, DATA_SERVICE, dataHomes, dataService, expandHomePath, resolveDshHome, userDataHome } from '../src/shared/data-home.ts'
import { serviceStore } from './fake-rc3.ts'

const HOME = resolve('/users/me')

test('the DSH home resolves explicit path, then a non-blank $DSH_HOME, then ~/.dsh (rc.3 dsh-home-paths resolveDshHome)', () => {
  assert.equal(resolveDshHome('/explicit/home', { DSH_HOME: '/env/home' }, HOME), resolve('/explicit/home'))
  assert.equal(resolveDshHome(undefined, { DSH_HOME: '/env/home' }, HOME), resolve('/env/home'))
  assert.equal(resolveDshHome(undefined, { DSH_HOME: '   ' }, HOME), join(HOME, '.dsh')) // blank override is unset
  assert.equal(resolveDshHome(undefined, {}, HOME), join(HOME, '.dsh'))
  assert.equal(resolveDshHome('~/elsewhere', {}, HOME), join(HOME, 'elsewhere'))
  assert.equal(resolveDshHome(undefined, { DSH_HOME: '~\\env' }, HOME), join(HOME, 'env'))
})

test('tilde expansion covers ~, ~/ and ~\\ only', () => {
  assert.equal(expandHomePath('~', HOME), HOME)
  assert.equal(expandHomePath('~/a', HOME), join(HOME, 'a'))
  assert.equal(expandHomePath('~\\a', HOME), join(HOME, 'a'))
  assert.equal(expandHomePath('~a', HOME), '~a')
})

test('the user-level directory is <DSH home>/glm-hourness', () => {
  assert.equal(userDataHome(undefined, {}, HOME), join(HOME, '.dsh', 'glm-hourness'))
  assert.equal(userDataHome('/scratch/dsh-home', {}, HOME), join(resolve('/scratch/dsh-home'), 'glm-hourness'))
})

test('the credential directory is a non-empty row home, else the user-level directory (no data service needed)', () => {
  assert.equal(credentialHome('C:/ws/.llm', { DSH_HOME: '/env/home' }), 'C:/ws/.llm')
  assert.equal(credentialHome(undefined, { DSH_HOME: '/env/home' }), join(resolve('/env/home'), 'glm-hourness'))
  assert.equal(credentialHome('', { DSH_HOME: '/env/home' }), join(resolve('/env/home'), 'glm-hourness'))
})

test('the data row provides both directories as the glmHournessData service and withdraws it on dispose', () => {
  const store = serviceStore()
  const dispose = apply(store, { dshHome: '/scratch/dsh-home', projectHome: 'C:/ws/.llm' })
  assert.deepEqual(dataService(store), { userHome: join(resolve('/scratch/dsh-home'), 'glm-hourness'), projectHome: 'C:/ws/.llm' })
  assert.ok(Object.isFrozen(store.services.get(DATA_SERVICE)))
  dispose()
  assert.equal(dataService(store), undefined)
})

test('without projectHome the service carries only the user directory; an empty dshHome counts as unset', () => {
  const service = dataServiceFor({ dshHome: '', projectHome: '' })
  assert.deepEqual(Object.keys(service), ['userHome'])
  assert.equal(service.userHome, userDataHome())
})

test('a failing provide degrades to a no-op instead of failing activation', () => {
  const store = serviceStore()
  apply(store, { dshHome: '/a' })
  const dispose = apply(store, { dshHome: '/b' }) // second provider of the same name
  assert.equal(typeof dispose, 'function')
  dispose()
  assert.equal(dataService(store)?.userHome, join(resolve('/a'), 'glm-hourness'))
})

test('row directories: an explicit row home wins for the project directory; the user directory comes from the service only', () => {
  const store = serviceStore()
  assert.deepEqual(dataHomes(store, undefined), {}) // no service, no home
  assert.deepEqual(dataHomes(store, 'C:/row/.llm'), { projectHome: 'C:/row/.llm' })
  apply(store, { dshHome: '/scratch', projectHome: 'C:/svc/.llm' })
  const userHome = join(resolve('/scratch'), 'glm-hourness')
  assert.deepEqual(dataHomes(store, undefined), { userHome, projectHome: 'C:/svc/.llm' })
  assert.deepEqual(dataHomes(store, ''), { userHome, projectHome: 'C:/svc/.llm' })
  assert.deepEqual(dataHomes(store, 'C:/row/.llm'), { userHome, projectHome: 'C:/row/.llm' })
  assert.deepEqual(dataHomes({}, 'C:/row/.llm'), { projectHome: 'C:/row/.llm' }) // a context without ctx.get
})

test('a malformed service value is ignored', () => {
  assert.equal(dataService({ get: () => ({ userHome: 42 }) }), undefined)
  assert.equal(dataService({ get: () => 'C:/x' }), undefined)
})

// The project home of one session (m4-gate G1, design §2.4): the row's own
// `home` first, then the `.llm` of the project the working directory is in,
// then the data service's project directory.

test('projectHomeFor: the row home wins, then the project of the working directory, then the data service', () => {
  const root = mkdtempSync(join(tmpdir(), 'proj-home-'))
  try {
    mkdirSync(join(root, '.llm'), { recursive: true }) // a directory with a .llm counts as a project outside git
    const store = serviceStore()
    store.provide(DATA_SERVICE, { userHome: '/u', projectHome: 'C:/svc/.llm' })
    const flat = `${root.replace(/[\\/]+$/, '')}/.llm`
    assert.equal(projectHomeFor(store, 'C:/row/.llm', root), 'C:/row/.llm')
    assert.equal(projectHomeFor(store, '', root), flat)
    assert.equal(projectHomeFor(store, undefined, root), flat)
    assert.equal(projectHomeFor(store, undefined, undefined), 'C:/svc/.llm')
    assert.equal(projectHomeFor(store, undefined, ''), 'C:/svc/.llm')
    const outside = mkdtempSync(join(tmpdir(), 'proj-home-none-'))
    try {
      assert.equal(projectHomeFor(store, undefined, outside), 'C:/svc/.llm', 'no project to name: the service decides')
    }
    finally {
      rmSync(outside, { recursive: true, force: true })
    }
    assert.equal(projectHomeFor({ get: () => undefined }, undefined, root), flat, 'no service at all')
    assert.equal(projectHomeFor({ get: () => undefined }, undefined, undefined), undefined)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
