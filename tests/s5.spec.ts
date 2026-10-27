import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyStore, forget, loadStore, parseStore, remember, retrieve, saveStore, shouldStore, strengthen, strength,
  type MemoryEntry,
} from '../src/memory/store.ts'
import { isPersonaLevel, personaSection, PERSONA_LEVELS } from '../src/glm-prompt/persona.ts'
import { dialectSections } from '../src/glm-prompt/index.ts'
import { dispatchPanel, offPeakBadge, parseJsonl, usagePanel } from '../src/ui/panel.ts'
import { defaultKnowableFromGit, memoryTools, storeIo } from '../src/memory/tools.ts'

const NOW = '2026-10-27T12:00:00+08:00'
const daysAgo = (days: number) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString()

test('strength halves per half-life and review bonus caps', () => {
  const base: MemoryEntry = { id: 'a', text: 'x', tags: [], created: NOW, lastReviewed: NOW, reviews: 0 }
  assert.ok(strength({ ...base, reviews: 0 }, NOW) > 0.99)
  assert.ok(Math.abs(strength({ ...base, lastReviewed: daysAgo(14) }, NOW) - 0.5) < 0.01)
  assert.ok(strength({ ...base, lastReviewed: daysAgo(28) }, NOW) < 0.26)
  const reviewed: MemoryEntry = { ...base, lastReviewed: daysAgo(14), reviews: 10 }
  assert.ok(Math.abs(strength(reviewed, NOW) - 0.75) < 0.01) // 0.5 × (1 + 10×0.05)
  assert.ok(strength({ ...base, lastReviewed: daysAgo(400), reviews: 10 }, NOW) < 0.02) // decay still wins long-term
})

test('retrieve ranks matching entries by hit count times strength', () => {
  let store = emptyStore()
  store = remember(store, { id: 'a', text: 'user prefers 猫娘 tone', tags: ['persona'] }, NOW)
  store = remember(store, { id: 'b', text: 'build uses pnpm --ignore-scripts', tags: ['build'] }, daysAgo(30))
  const hits = retrieve(store, 'persona', NOW)
  assert.deepEqual(hits.map(entry => entry.id), ['a'])
  assert.equal(retrieve(store, 'nothing-matches-this', NOW).length, 0)
})

test('remember upserts and forget removes', () => {
  let store = emptyStore()
  store = remember(store, { id: 'a', text: 'v1', tags: [] }, NOW)
  store = remember(store, { id: 'a', text: 'v2', tags: [] }, NOW)
  assert.equal(store.entries.length, 1)
  assert.equal(store.entries[0]!.text, 'v2')
  assert.equal(store.entries[0]!.reviews, 2) // second remember counts as a review
  const forgotten = forget(store, 'a')
  assert.equal(forgotten.existed, true)
  assert.equal(forgotten.store.entries.length, 0)
  assert.equal(forget(forgotten.store, 'a').existed, false)
})

test('parseStore round-trips and rejects unknown formats', () => {
  const store = remember(emptyStore(), { id: 'x', text: 't', tags: ['a'] }, NOW)
  assert.deepEqual(parseStore(JSON.stringify(store)), store)
  assert.throws(() => parseStore('{"version":2,"entries":[]}'), /unsupported/)
  const revived = parseStore(JSON.stringify(store))
  assert.equal(revived.entries[0]!.text, 't')
})

test('storage policy: git-knowable facts are refused', () => {
  const knowable = (text: string) => text.includes('package.json')
  assert.equal(shouldStore('edit package.json scripts', knowable), false)
  assert.equal(shouldStore('user hates filler words', knowable), true)
})

function fakeFs() {
  const files = new Map<string, string>()
  return {
    files,
    fs: {
      readFile: async (path: string) => {
        if (!files.has(path)) {
          const error = new Error('ENOENT') as NodeJS.ErrnoException
          error.code = 'ENOENT'
          throw error
        }
        return files.get(path)!
      },
      writeFile: async (path: string, data: string) => { files.set(path, data) },
      rename: async (from: string, to: string) => { files.set(to, files.get(from)!); files.delete(from) },
    },
  }
}

test('store persists round-trip through the filesystem layer', async () => {
  const { files, fs } = fakeFs()
  assert.deepEqual(await loadStore(fs, 'C:/ws/.llm'), emptyStore()) // missing file starts empty
  const store = remember(emptyStore(), { id: 'a', text: 'user prefers direct answers', tags: ['persona'] }, NOW)
  await saveStore(fs, 'C:/ws/.llm', store)
  assert.equal(files.has('C:/ws/.llm/memory.json.tmp'), false) // atomic write leaves no temp behind
  const revived = await loadStore(fs, 'C:/ws/.llm')
  assert.deepEqual(revived.entries[0]!.text, 'user prefers direct answers')
  assert.equal(retrieve(revived, 'persona', NOW)[0]!.id, 'a')
})

test('a corrupted store fails loud instead of silently resetting', async () => {
  const { files, fs } = fakeFs()
  files.set('C:/ws/.llm/memory.json', '{broken json')
  await assert.rejects(() => loadStore(fs, 'C:/ws/.llm'), /broken|JSON|version/)
})

test('confirmed recall strengthens entries and re-stamps their review time', () => {
  let store = remember(emptyStore(), { id: 'a', text: 'user prefers direct answers', tags: ['persona'] }, daysAgo(30))
  assert.ok(strength(store.entries[0]!, NOW) < 0.3) // a month unreviewed is weak
  store = strengthen(store, ['a'], NOW)
  assert.equal(store.entries[0]!.reviews, 2)
  assert.equal(store.entries[0]!.lastReviewed, NOW)
  assert.ok(strength(store.entries[0]!, NOW) > 0.99) // the recall re-armed it
  assert.equal(strengthen(store, [], NOW), store) // no-op keeps identity
})

test('persona slider keeps three levels and injects as a dialect section', () => {
  assert.deepEqual(PERSONA_LEVELS.map(level => level.id), ['concise', 'balanced', 'detailed'])
  assert.equal(isPersonaLevel('balanced'), true)
  assert.equal(isPersonaLevel('loud'), false)
  const sections = dialectSections(false, 'concise', { tier: 'start-plan' })
  const persona = sections.find(section => section.name === 'glm:persona')
  assert.ok(persona!.text.includes('# Reporting Depth'))
  assert.ok(persona!.text.includes('简洁（concise）'))
  assert.ok(persona!.text.includes('start there and adjust per task'))
  assert.deepEqual(sections.map(section => section.name), ['glm:cli-prefix', 'harness:identity', 'glm:persona'])
})

const usageJsonl = [
  { at: '2026-10-27T01:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } },
  { at: '2026-10-27T02:00:00+08:00', provider: 'glm', model: 'glm-5.3', usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50 } },
  { at: '2026-10-27T14:00:00+08:00', provider: 'glm', model: 'glm-5.3-flash', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
  { at: '', provider: 'x', model: 'corrupt', usage: { inputTokens: 999, outputTokens: 0 } },
].map(record => record.at === '' ? '{broken json' : JSON.stringify(record)).join('\n')

test('usage panel totals, hourly curve, and off-peak share come from the journal', () => {
  const panel = usagePanel(usageJsonl)
  assert.equal(panel.totals.calls, 3) // corrupt line skipped
  assert.deepEqual(panel.totals, { calls: 3, inputTokens: 140, outputTokens: 75, totalTokens: 215 })
  assert.equal(panel.byModel[0]!.model, 'glm-5.3')
  assert.equal(panel.hourly[1], 1)
  assert.equal(panel.hourly[14], 1)
  assert.ok(Math.abs(panel.offPeakShare - 2 / 3) < 0.001)
  assert.equal(offPeakBadge(panel.offPeakShare), '谷 67%')
})

test('dispatch panel lists newest decisions first with a cap', () => {
  const decisions = Array.from({ length: 30 }, (_, i) => JSON.stringify({ at: `t${i}`, level: 'L1', kind: 'dispatch:spawn', subject: `agent-${i}` })).join('\n')
  const rows = dispatchPanel(decisions, 10)
  assert.equal(rows.length, 10)
  assert.equal(rows[0]!.subject, 'agent-29')
  assert.equal(rows[9]!.subject, 'agent-20')
  assert.deepEqual(parseJsonl<{ at: string }>('{bad\n'), [])
})

test('memory tools store, refuse git-knowable text, recall (strengthening), and forget', async () => {
  const { files, fs } = fakeFs()
  const io = storeIo(fs, 'C:/ws/.llm')
  const tools = memoryTools(io)
  const byName = (name: string) => {
    const tool = tools.find(candidate => candidate.name === name)
    if (tool === undefined) throw new Error(`missing tool ${name}`)
    return tool
  }
  assert.deepEqual(tools.map(tool => tool.name), ['memory_store', 'memory_query', 'memory_forget'])

  const refused = await byName('memory_store').execute({ id: 'f1', text: 'see src/memory/store.ts for details' })
  assert.equal((refused as { stored: boolean }).stored, false)
  assert.equal(files.has('C:/ws/.llm/memory.json'), false)

  const stored = await byName('memory_store').execute({ id: 'm1', text: 'the owner reviews architecture at breakfast', tags: ['routine'] })
  assert.equal((stored as { stored: boolean, reviews: number }).stored, true)
  await byName('memory_store').execute({ id: 'm1', text: 'the owner reviews architecture at breakfast', tags: ['routine'] })

  const recalled = await byName('memory_query').execute({ focus: 'routine architecture' })
  const matches = (recalled as { matches: Array<{ id: string, reviews: number }> }).matches
  assert.equal(matches[0]!.id, 'm1')
  assert.equal(matches[0]!.reviews, 3) // two stores + this confirmed recall
  const persisted = parseStore(files.get('C:/ws/.llm/memory.json')!)
  assert.equal(persisted.entries[0]!.reviews, 3) // the strengthening hit the disk

  const forgotten = await byName('memory_forget').execute({ id: 'm1' })
  assert.deepEqual(forgotten, { deleted: true })
  assert.deepEqual(await byName('memory_query').execute({ focus: 'routine' }), { matches: [] })
})

test('default git heuristic flags paths and artifact names, not habits', () => {
  assert.equal(defaultKnowableFromGit('edit src/index.ts then run pnpm test'), true)
  assert.equal(defaultKnowableFromGit('the build uses package.json scripts'), true)
  assert.equal(defaultKnowableFromGit('the owner dislikes filler words'), false)
})
