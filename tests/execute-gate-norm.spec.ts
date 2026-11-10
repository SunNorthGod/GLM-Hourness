import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { DEFAULT_WATCHED, GATE_LINE_FORMS, normDigest, parseGateNorm } from '../src/execute/gate-norm.ts'
import { node } from './execute-helpers.ts'

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')
const gateNode = (acceptance: readonly string[]) => node({ id: 'norm-merge-gate', type: 'norm', acceptance }, 0, 'human')

test('parseGateNorm: the command forms, the watch defaults, push and only', () => {
  const gate = parseGateNorm(gateNode([
    '`$ npm test`',
    '`$ npm run lint when src/, ui/src/`',
    '`setup $ pnpm install`',
    '`setup $ npm ci when package.json`',
    '`patrol $ npm run deps:check`',
    '`push`',
    '`only docs/graph/`',
    '说明文字，没有反引号',
    '不是写法的反引号 `随便什么`',
  ]))
  assert.deepEqual(gate.commands.map(command => [command.kind, command.command, command.when]), [
    ['check', 'npm test', undefined],
    ['check', 'npm run lint', ['src/', 'ui/src/']],
    ['setup', 'pnpm install', DEFAULT_WATCHED],
    ['setup', 'npm ci', ['package.json']],
    ['patrol', 'npm run deps:check', undefined],
  ])
  assert.equal(gate.push, true)
  assert.deepEqual(gate.only, ['docs/graph/'])
  assert.deepEqual(gate.prose.map(line => line.index), [7, 8])
})

test('parseGateNorm: an empty gate is empty, and a malformed line is prose', () => {
  assert.deepEqual(parseGateNorm(undefined), { commands: [], push: false, only: [], prose: [] })
  assert.deepEqual(parseGateNorm(gateNode([])).commands, [])
  const prose = parseGateNorm(gateNode(['`$ `', '`when src/`', '`only `']))
  assert.deepEqual(prose.commands, [])
  assert.deepEqual(prose.prose.map(line => line.index), [0, 1, 2])
})

test('GATE_LINE_FORMS: the eight forms the takeover proposes (the `changed` form arrives with the takeover row)', () => {
  assert.deepEqual([...GATE_LINE_FORMS], ['$ <command>', '$ <command> when <paths>', 'setup $ <command>', 'setup $ <command> when <paths>', 'patrol $ <command>', 'push', 'only <paths>', 'changed <format> $ <command>'])
})

test('normDigest: the parsed entries in order, stable, and moved by a change', () => {
  const gate = parseGateNorm(gateNode(['`$ npm test`', '`push`']))
  const again = parseGateNorm(gateNode(['说明', '`$ npm test`', '`push`']))
  assert.equal(normDigest(gate, sha256), normDigest(again, sha256))
  const changed = parseGateNorm(gateNode(['`$ npm run test`', '`push`']))
  assert.notEqual(normDigest(gate, sha256), normDigest(changed, sha256))
  assert.match(normDigest(gate, sha256), /^[0-9a-f]{12}$/)
})

test('parseGateNorm: a `changed` line names the format of its findings; an unknown format is prose; the digest moves with the format (takeover design 0.6 §5.6)', () => {
  const gate = parseGateNorm(gateNode(['`changed eslint-json $ node x.js {files}`', '`changed nope $ node x.js`', '`changed tsc $ node x.js when src/`']))
  assert.deepEqual(gate.commands.map(command => [command.kind, command.command, command.changed, command.when]), [
    ['check', 'node x.js {files}', 'eslint-json', undefined],
    ['check', 'node x.js', 'tsc', ['src/']],
  ])
  assert.deepEqual(gate.prose.map(line => line.text), ['`changed nope $ node x.js`'])
  const eslint = parseGateNorm(gateNode(['`changed eslint-json $ node x.js {files}`']))
  const tsc = parseGateNorm(gateNode(['`changed tsc $ node x.js {files}`']))
  assert.notEqual(normDigest(eslint, sha256), normDigest(tsc, sha256))
  const plain = parseGateNorm(gateNode(['`$ node x.js`']))
  assert.notEqual(normDigest(eslint, sha256), normDigest(plain, sha256), 'the changed form digests apart from the plain one')
})
