import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, renderHourness } from '../src/ui/index.ts'

function fakeFs(files: Map<string, string>) {
  return { readFile: async (path: string) => {
    const content = files.get(path)
    if (content === undefined) {
      const error = new Error('ENOENT') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    }
    return content
  } }
}

test('renderHourness folds report and panel summary from the journal, bounded to the local day', async () => {
  const files = new Map<string, string>([
    ['C:/ws/.llm/audit/decisions.jsonl', [
      JSON.stringify({ at: '2026-10-27T01:00:00+08:00', level: 'L1', kind: 'dispatch:spawn_teammate', subject: 'researcher' }),
      JSON.stringify({ at: '2026-10-26T23:00:00+08:00', level: 'L3', kind: 'model-route', subject: 'yesterday must not leak in' }),
    ].join('\n')],
    ['C:/ws/.llm/audit/usage.jsonl', [
      JSON.stringify({ at: '2026-10-27T02:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } }),
      JSON.stringify({ at: '2026-10-27T15:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }),
    ].join('\n')],
  ])
  const text = await renderHourness({ home: 'C:/ws/.llm' }, fakeFs(files), new Date('2026-10-27T20:00:00+08:00'))
  assert.ok(text.includes('# 晨报 2026-10-27'))
  assert.ok(text.includes('L1 自主 1 · L2 次日报备 0 · L3 当次申报 0')) // yesterday's L3 filtered out
  assert.ok(!text.includes('yesterday must not leak in'))
  assert.ok(text.includes('## 面板'))
  assert.ok(text.includes('调用 2 · in 110 / out 55 / total 165')) // panel reads the full journal
  assert.ok(text.includes('谷时占比 谷 50%'))
})

test('empty journal still renders the clean report', async () => {
  const text = await renderHourness({ home: 'C:/ws/.llm' }, fakeFs(new Map()))
  assert.ok(text.includes('- 无'))
})

test('apply registers the /hourness command and reports from the real home', async () => {
  const registered: Array<{ name: string, handler: (invocation: { rawInput: string }) => Promise<{ kind: string, text: string }> }> = []
  const dispose = apply({
    commands: { register: definition => { registered.push(definition as typeof registered[number]); return () => {} } },
  }, { home: 'C:/definitely-empty-hourness-home' })
  assert.equal(registered.length, 1)
  assert.equal(registered[0]!.name, 'hourness')
  const withArgs = await registered[0]!.handler({ rawInput: 'x' })
  assert.equal(withArgs.kind, 'error')
  const clean = await registered[0]!.handler({ rawInput: '' })
  assert.equal(clean.kind, 'success')
  assert.ok(clean.text.includes('# 晨报'))
  dispose()
})

test('a missing home degrades to a no-op instead of failing activation', () => {
  const dispose = apply({ commands: { register: () => () => {} } }, {})
  assert.equal(typeof dispose, 'function')
  dispose()
})
