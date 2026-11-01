/**
 * The peak mode contract of the shared library (docs/ORCHESTRATION.md §16):
 * the state a reader gets, the hold, the reader of the service, the words,
 * and the minute the peak changes. Pure functions; the service itself is
 * tested through the row (tests/rules-row.spec.ts).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { creditPricing } from '../src/glm-llm/credits.ts'
import { PEAK_LEVEL_WORDS, PEAK_MODE_SERVICE, PEAK_REDUCE_GLM_WORKERS, peakHoldOf, peakModeIntro, peakModeService, peakModeState, type PeakLevel, type PeakModeService } from '../src/shared/peak-mode.ts'
import { pluginLabel } from '../src/shared/plugin-labels.ts'
import { nextPeakChange } from '../src/shared/pricing.ts'
import { serviceStore } from './fake-rc3.ts'

const LEVELS: readonly PeakLevel[] = ['inform', 'reduce', 'stop']
const UNTIL = '2026-10-28T10:00:00.000Z'

test('the cap on concurrent GLM subagents is 1, and the state carries it only in a peak under reduce', () => {
  assert.equal(PEAK_REDUCE_GLM_WORKERS, 1)
  for (const level of LEVELS) {
    for (const peak of [true, false, undefined]) {
      const state = peakModeState({ level, origin: 'default', peak, until: UNTIL })
      const cap = peak === true && level === 'reduce' ? PEAK_REDUCE_GLM_WORKERS : undefined
      assert.equal(state.glmWorkerCap, cap, `${level} / peak ${String(peak)}`)
      assert.equal('glmWorkerCap' in state, cap !== undefined, `${level} / peak ${String(peak)}: the field is absent, not undefined`)
    }
  }
})

test('the state keeps what it was given: the level, where it comes from, when it was chosen, the clock', () => {
  assert.deepEqual(peakModeState({ level: 'stop', origin: 'human', at: '2026-10-30T01:00:00.000Z', peak: false, until: UNTIL }), { level: 'stop', origin: 'human', at: '2026-10-30T01:00:00.000Z', peak: false, until: UNTIL })
  assert.deepEqual(peakModeState({ level: 'reduce', origin: 'default', peak: undefined }), { level: 'reduce', origin: 'default', peak: undefined })
})

test('the hold: only in a peak with a known end, only on reduce and stop, and level and end agree with the state', () => {
  for (const level of LEVELS) {
    const state = peakModeState({ level, origin: 'default', peak: true, until: UNTIL })
    const hold = peakHoldOf(state)
    if (level === 'inform') assert.equal(hold, undefined)
    else assert.deepEqual(hold, { level, until: state.until })
    assert.equal(peakHoldOf(peakModeState({ level, origin: 'default', peak: false, until: UNTIL })), undefined, `${level}: not a peak`)
    assert.equal(peakHoldOf(peakModeState({ level, origin: 'default', peak: undefined })), undefined, `${level}: peak unknown`)
    assert.equal(peakHoldOf(peakModeState({ level, origin: 'default', peak: true })), undefined, `${level}: the end is unknown`)
  }
})

test('the reader: absent reads as none without a report; a wrong shape reads as none with one; a wider service still reads', () => {
  const problems: string[] = []
  const problem = (message: string): void => { problems.push(message) }
  const store = serviceStore()
  assert.equal(peakModeService(store, problem), undefined)
  assert.equal(peakModeService({}, problem), undefined) // a context without get
  assert.deepEqual(problems, [])
  store.provide(PEAK_MODE_SERVICE, { stateFor: () => undefined, stateForProject: () => undefined })
  assert.equal(peakModeService(store, problem), undefined)
  assert.equal(problems.length, 1)
  assert.match(problems[0] ?? '', new RegExp(`^${PEAK_MODE_SERVICE} has the wrong shape`))
  const wrongType = serviceStore()
  wrongType.provide(PEAK_MODE_SERVICE, { stateFor: () => undefined, stateForProject: () => undefined, peakHoldFor: 'later' })
  assert.equal(peakModeService(wrongType, problem), undefined)
  assert.equal(problems.length, 2)
  const wider: PeakModeService & { readonly extra: () => number } = { stateFor: () => undefined, stateForProject: () => undefined, peakHoldFor: () => undefined, extra: () => 1 }
  const widerStore = serviceStore()
  widerStore.provide(PEAK_MODE_SERVICE, wider)
  assert.equal(peakModeService(widerStore, problem), wider)
  assert.equal(problems.length, 2)
})

test('the words: all three levels have a name and a consequence, and the intro names them, the default, the main agent and the command', () => {
  assert.deepEqual(Object.keys(PEAK_LEVEL_WORDS).sort(), [...LEVELS].sort())
  assert.deepEqual(LEVELS.map(level => PEAK_LEVEL_WORDS[level].name), ['无影响', '少做', '不做'])
  for (const hours of [undefined, '工作日 14:00–18:00（UTC+8）']) {
    const intro = peakModeIntro(hours)
    for (const level of LEVELS) assert.ok(intro.includes(PEAK_LEVEL_WORDS[level].name), `${level}: ${intro}`)
    assert.ok(intro.includes('默认是**少做**'), intro)
    assert.ok(intro.includes('/rules peak'), intro)
    assert.ok(intro.includes('主 Agent 不受影响'), intro)
    assert.equal(intro.includes('工作日 14:00–18:00'), hours !== undefined, intro)
  }
})

test('the number of GLM subagents the text of 少做 promises is the constant that is enforced', () => {
  // A literal in the sentence would leave it wrong the day the constant changes; the sentence has to carry the constant's number.
  assert.equal(/至多 (\d+) 个 GLM 子 agent/.exec(PEAK_LEVEL_WORDS.reduce.half)?.[1], String(PEAK_REDUCE_GLM_WORKERS))
  assert.ok(peakModeIntro().includes(`${PEAK_LEVEL_WORDS.reduce.name}：高峰里同时至多 ${PEAK_REDUCE_GLM_WORKERS} 个 GLM 子 agent`), peakModeIntro())
  for (const level of ['inform', 'stop'] as const) assert.equal(/\d/.test(PEAK_LEVEL_WORDS[level].half), false, `${level}: no number in the sentence`)
})

test('nextPeakChange names the first whole minute the GLM plan changes between peak and off-peak', () => {
  const at = (iso: string): number => Date.parse(iso)
  const iso = (ms: number | undefined): string | undefined => ms === undefined ? undefined : new Date(ms).toISOString()
  const peak = (ms: number): boolean => creditPricing.peak(ms)
  // 2026-10-28 is a Wednesday; the peak is 14:00-18:00 UTC+8.
  assert.equal(iso(nextPeakChange(peak, at('2026-10-28T13:30:00+08:00'))), iso(at('2026-10-28T14:00:00+08:00')))
  assert.equal(iso(nextPeakChange(peak, at('2026-10-28T15:00:00+08:00'))), iso(at('2026-10-28T18:00:00+08:00')))
  assert.equal(iso(nextPeakChange(peak, at('2026-10-28T15:00:30.500+08:00'))), iso(at('2026-10-28T18:00:00+08:00')), 'seconds do not move the minute')
  assert.equal(iso(nextPeakChange(peak, at('2026-10-28T14:00:00+08:00'))), iso(at('2026-10-28T18:00:00+08:00')), 'on the first peak minute the peak ends at 18:00')
  assert.equal(iso(nextPeakChange(peak, at('2026-10-28T18:30:00+08:00'))), iso(at('2026-10-29T14:00:00+08:00')))
  assert.equal(iso(nextPeakChange(peak, at('2026-10-30T18:30:00+08:00'))), iso(at('2026-11-02T14:00:00+08:00')), 'Friday evening: the next peak is Monday')
  assert.equal(nextPeakChange(() => true, at('2026-10-28T15:00:00+08:00')), undefined, 'a plan that is always peak does not change')
  assert.equal(nextPeakChange(ms => ms < at('2026-10-28T15:00:30+08:00'), at('2026-10-28T15:00:00+08:00'), 120_000), at('2026-10-28T15:01:00+08:00'))
  assert.equal(nextPeakChange(ms => ms < at('2026-10-28T16:00:00+08:00'), at('2026-10-28T15:00:00+08:00'), 600_000), undefined, 'a change beyond the horizon is not found')
})

test('pluginLabel names the two packages as the plugin manager shows them and any other name as itself', () => {
  assert.equal(pluginLabel('dsh-hourness'), '项目编排')
  assert.equal(pluginLabel('dsh-glm-zcode'), 'GLM 通道')
  assert.equal(pluginLabel('dsh-something-else'), 'dsh-something-else')
  for (const inherited of ['constructor', 'toString', '__proto__']) assert.equal(pluginLabel(inherited), inherited, 'a name every object has is not a package')
})
