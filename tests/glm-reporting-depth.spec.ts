/**
 * The glm-prompt row's reporting depth after its rename from `persona`
 * (docs/ORCHESTRATION.md §3.1; task m3-main-persona, addendum §2.7): the key
 * `reportingDepth`, the old key `persona` still read, and the text the model
 * sees unchanged. Configs go through `Config(raw)` first, as cordis does
 * before it activates a plugin, so a default the schema would fill is filled.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, Config, dialectSections, type GlmPromptConfig } from '../src/glm-prompt/index.ts'
import { readReportingDepth, REPORTING_DEPTH_SECTION, reportingDepthSection } from '../src/glm-prompt/reporting-depth.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { fakeRuntime } from './fake-rc3.ts'
import { captureWarnings } from './graph-helpers.ts'

const RENAMED = 'glm-prompt 的 persona 已改名为 reportingDepth，这次按旧键生效'
const DIFFERENT = 'persona 与 reportingDepth 不同，按 reportingDepth'
const REDUNDANT = '旧键 persona 可以删掉'

// The text of the section as the row produced it before the rename, one per depth, captured from the last commit that had src/glm-prompt/persona.ts.
const HEAD = '# Reporting Depth\nFor each user-facing reply, choose one reporting depth yourself from the task weight; do not ask the user which to use.\n- 简洁（concise）：结论与影响，一两句；岔路只在真有分叉时提。\n- 适中（balanced）：结论、影响、关键理由；岔路选项+建议。\n- 详细（detailed）：完整论证链：结论、证据层级、影响、岔路对比、风险。\n'
const BEFORE = {
  concise: `${HEAD}The user's standing preference is 简洁（concise）— start there and adjust per task: routine progress one notch terser, decision requests one notch fuller.`,
  balanced: `${HEAD}The user's standing preference is 适中（balanced）— start there and adjust per task: routine progress one notch terser, decision requests one notch fuller.`,
  detailed: `${HEAD}The user's standing preference is 详细（detailed）— start there and adjust per task: routine progress one notch terser, decision requests one notch fuller.`,
} as const

/** The description of a schema node when it is one string. */
const descriptionOf = (schema: { readonly meta: { readonly description?: unknown } } | undefined): string => typeof schema?.meta.description === 'string' ? schema.meta.description : ''

/** The row applied the way the loader does (config through `Config(raw)`), one GLM step assembled. */
async function run(raw: Record<string, unknown>): Promise<{ readonly depth: string | undefined, readonly warnings: string[], readonly activation: string, readonly session: string | undefined }> {
  const rt = fakeRuntime()
  const { warnings } = await captureWarnings(async () => {
    apply(rt.ctx, Config(raw) as GlmPromptConfig)
    await rt.create()
  })
  const assembled = await rt.assemble({ provider: 'glm-zcode', model: 'glm-5.3' })
  const view = rt.services.get(healthServiceName('glm-prompt')) as RowHealthView
  return {
    depth: assembled.sections.find(section => section.name === REPORTING_DEPTH_SECTION)?.text,
    warnings,
    activation: view.activation().reason,
    session: view.session('agent-1')?.reason,
  }
}

test('the section is named glm:reporting-depth and its text is, word for word, what the model saw before the rename, for each depth', () => {
  assert.equal(REPORTING_DEPTH_SECTION, 'glm:reporting-depth')
  for (const depth of ['concise', 'balanced', 'detailed'] as const) {
    assert.equal(reportingDepthSection(depth).text, BEFORE[depth], depth)
    assert.equal(reportingDepthSection(depth).name, 'glm:reporting-depth')
  }
  assert.equal(reportingDepthSection().text, BEFORE.balanced)
  assert.equal(dialectSections(false, 'detailed').find(section => section.name === REPORTING_DEPTH_SECTION)?.text, BEFORE.detailed)
  assert.equal(dialectSections().some(section => section.name === 'glm:persona'), false)
})

test('the schema has reportingDepth and the old persona, neither with a default, so the keys present are the keys written', () => {
  assert.equal('reportingDepth' in Config({}), false)
  assert.equal('persona' in Config({}), false)
  assert.deepEqual(Config({ persona: 'concise' }).persona, 'concise')
  assert.equal('reportingDepth' in Config({ persona: 'concise' }), false)
  assert.equal('persona' in Config({ reportingDepth: 'detailed' }), false)
  assert.throws(() => Config({ reportingDepth: 'loud' }))
  assert.throws(() => Config({ persona: 'loud' }))
  assert.match(descriptionOf(Config.dict?.reportingDepth), /缺省为 balanced/)
  assert.match(descriptionOf(Config.dict?.persona), /已改名为 reportingDepth，只为读旧配置/)
})

test('only the old key persona: it decides, once warned, and the row health says so on activation and on the GLM step', async () => {
  const result = await run({ persona: 'concise' })
  assert.equal(result.depth, BEFORE.concise)
  assert.deepEqual(result.warnings, [`dsh-glm-hourness/glm-prompt: ${RENAMED}`])
  assert.ok(result.activation.includes(RENAMED), result.activation)
  assert.ok(result.session?.includes(RENAMED), result.session)
})

test('only reportingDepth: it decides and nothing is said', async () => {
  const result = await run({ reportingDepth: 'detailed' })
  assert.equal(result.depth, BEFORE.detailed)
  assert.deepEqual(result.warnings, [])
  for (const text of [result.activation, result.session ?? '']) assert.equal(text.includes('persona'), false, text)
})

test('both keys and different: reportingDepth wins and it is warned once', async () => {
  const result = await run({ persona: 'concise', reportingDepth: 'detailed' })
  assert.equal(result.depth, BEFORE.detailed)
  assert.deepEqual(result.warnings, [`dsh-glm-hourness/glm-prompt: ${DIFFERENT}`])
  assert.ok(result.session?.includes(DIFFERENT), result.session)
})

test('both keys and the same: no warning, the row health says the old key can go', async () => {
  const result = await run({ persona: 'concise', reportingDepth: 'concise' })
  assert.equal(result.depth, BEFORE.concise)
  assert.deepEqual(result.warnings, [])
  assert.ok(result.activation.includes(REDUNDANT), result.activation)
  assert.ok(result.session?.includes(REDUNDANT), result.session)
})

test('neither key: balanced, no warning, no remark', async () => {
  const result = await run({})
  assert.equal(result.depth, BEFORE.balanced)
  assert.deepEqual(result.warnings, [])
  for (const text of [result.activation, result.session ?? '']) assert.equal(/persona|reportingDepth|旧键/.test(text), false, text)
})

test('the remark rides on a GLM step only: a step on another route says what it always said', async () => {
  const rt = fakeRuntime()
  await captureWarnings(async () => {
    apply(rt.ctx, Config({ persona: 'concise' }) as GlmPromptConfig)
    await rt.create()
  })
  await rt.assemble({ provider: 'deepseek-official', model: 'deepseek-flash' })
  const reason = (rt.services.get(healthServiceName('glm-prompt')) as RowHealthView).session('agent-1')
  assert.equal(reason?.state, 'inactive')
  assert.equal(reason?.reason.includes('旧键') || reason?.reason.includes('改名'), false, reason?.reason)
})

test('a value that is not a depth counts as not written', () => {
  assert.deepEqual(readReportingDepth({ reportingDepth: 'loud', persona: 'concise' }), { depth: 'concise', note: RENAMED, warn: true })
  assert.deepEqual(readReportingDepth({ reportingDepth: 7, persona: 'loud' }), { depth: 'balanced', note: undefined, warn: false })
  assert.deepEqual(readReportingDepth({}), { depth: 'balanced', note: undefined, warn: false })
})
