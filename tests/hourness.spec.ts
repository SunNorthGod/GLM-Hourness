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

const homes = { projectHome: 'C:/ws/.llm', userHome: 'C:/u/glm-hourness' }

test('renderHourness folds report and panel summary from both directories, bounded to the local day', async () => {
  const files = new Map<string, string>([
    ['C:/ws/.llm/audit/decisions.jsonl', [
      JSON.stringify({ at: '2026-10-27T01:00:00+08:00', level: 'L1', kind: 'dispatch:spawn_teammate', subject: 'researcher' }),
      JSON.stringify({ at: '2026-10-26T23:00:00+08:00', level: 'L3', kind: 'model-route', subject: 'yesterday must not leak in' }),
    ].join('\n')],
    ['C:/u/glm-hourness/audit/usage.jsonl', [
      JSON.stringify({ at: '2026-10-27T02:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } }),
      JSON.stringify({ at: '2026-10-27T15:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }),
    ].join('\n')],
  ])
  const text = await renderHourness(homes, fakeFs(files), new Date('2026-10-27T20:00:00+08:00'))
  assert.ok(text.includes('# 晨报 2026-10-27'))
  assert.ok(text.includes('L1 自主 1 · L2 次日报备 0 · L3 当次申报 0')) // yesterday's L3 filtered out
  assert.ok(!text.includes('yesterday must not leak in'))
  // The panel reads the full journal on the credit basis: 0.0945 off-peak
  // (02:00, half of 0.189) plus 0.0189 in peak (Tuesday 15:00).
  assert.ok(text.includes('## 面板\n- 全部用量记录；'))
  assert.ok(text.includes('- 合计：积分 0.11 · 高峰 17% · 缓存命中 0%'))
  assert.ok(text.includes('- glm-5.3：2 次 · 积分 0.11 · 高峰 17% · 缓存命中 0%'))
  assert.ok(!text.includes('## 数据目录'))
})

test('empty journal still renders the clean report', async () => {
  const text = await renderHourness(homes, fakeFs(new Map()))
  assert.ok(text.includes('- 无'))
  assert.ok(!text.includes('## 数据目录'))
})

test('a missing directory is named in the report', async () => {
  const noUser = await renderHourness({ projectHome: 'C:/ws/.llm' }, fakeFs(new Map()))
  assert.ok(noUser.includes('## 数据目录\n- 用户级目录不可用（数据目录行 glm-hourness/data 未启用），用量流水读不到'))
  const none = await renderHourness({}, fakeFs(new Map()))
  assert.ok(none.includes('- 项目目录未配置'))
  assert.ok(none.includes('- 用户级目录不可用'))
})

type Registered = { name: string, handler: (invocation: { rawInput: string }) => Promise<{ kind: string, text: string }> }

function register(config: { home?: string }, data: unknown): { registered: Registered[], dispose: () => void } {
  const registered: Registered[] = []
  const dispose = apply({
    commands: { register: definition => { registered.push(definition as Registered); return () => {} } },
    get: name => name === 'glmHournessData' ? data : undefined,
  }, config)
  return { registered, dispose }
}

test('apply registers the /hourness command and reports from the real directories', async () => {
  const { registered, dispose } = register({ home: 'C:/definitely-empty-hourness-home' }, { userHome: 'C:/definitely-empty-hourness-user' })
  assert.equal(registered.length, 1)
  assert.equal(registered[0]!.name, 'hourness')
  const withArgs = await registered[0]!.handler({ rawInput: 'x' })
  assert.equal(withArgs.kind, 'error')
  const clean = await registered[0]!.handler({ rawInput: '' })
  assert.equal(clean.kind, 'success')
  assert.ok(clean.text.includes('# 晨报'))
  assert.ok(!clean.text.includes('## 数据目录'))
  dispose()
})

test('without a home or the data service the command still registers and names what is missing', async () => {
  const { registered, dispose } = register({}, undefined)
  const result = await registered[0]!.handler({ rawInput: '' })
  assert.equal(result.kind, 'success')
  assert.ok(result.text.includes('- 项目目录未配置'))
  assert.ok(result.text.includes('- 用户级目录不可用'))
  dispose()
})
