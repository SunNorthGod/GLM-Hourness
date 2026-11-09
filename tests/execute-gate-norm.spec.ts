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

test('GATE_LINE_FORMS: the seven forms the takeover proposes', () => {
  assert.deepEqual([...GATE_LINE_FORMS], ['$ <command>', '$ <command> when <paths>', 'setup $ <command>', 'setup $ <command> when <paths>', 'patrol $ <command>', 'push', 'only <paths>'])
})

test('normDigest: the parsed entries in order, stable, and moved by a change', () => {
  const gate = parseGateNorm(gateNode(['`$ npm test`', '`push`']))
  const again = parseGateNorm(gateNode(['说明', '`$ npm test`', '`push`']))
  assert.equal(normDigest(gate, sha256), normDigest(again, sha256))
  const changed = parseGateNorm(gateNode(['`$ npm run test`', '`push`']))
  assert.notEqual(normDigest(gate, sha256), normDigest(changed, sha256))
  assert.match(normDigest(gate, sha256), /^[0-9a-f]{12}$/)
})
