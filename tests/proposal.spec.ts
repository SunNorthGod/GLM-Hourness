/**
 * The pure rules of how the main agent asks (src/graph/proposal.ts; docs/
 * ORCHESTRATION.md §3.2–§3.5, decision d-ask-three-gates): the sentence that
 * is kept as the question, the hard limits of the text, the record of a
 * question by way of asking, the record inside the text, and the layout the
 * harness gives the ways and the original text.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { PLAIN_QUESTION_EXAMPLES, plainWordsIn } from '../src/graph/plain-question.ts'
import { ASK_FORMS, PAGE_LIMITS, PROPOSAL_FIELDS, PROPOSAL_LIMITS, TALK_LIMITS, askOf, askTextRefusal, codePointCount, normalizeText, pageRefusal, proposalRecordRefusal, proposalTitleRefusal, renderAsk, textCoversRecord } from '../src/graph/proposal.ts'
import { PLAIN_LIMITS } from '../src/graph/schema.ts'
import { exampleRecord } from './proposal-examples.ts'

test('the numbers live in one place: four ways of asking, the limits of the text by way, three questions a reply', () => {
  assert.deepEqual([...ASK_FORMS], ['recommend', 'choose', 'want', 'look'])
  assert.deepEqual([...PROPOSAL_FIELDS], ['ask', 'proposal', 'reason', 'cost', 'ways', 'notTaken'])
  assert.deepEqual(TALK_LIMITS.text, { recommend: 160, choose: 120, want: 120, look: 120 })
  assert.deepEqual(PROPOSAL_LIMITS, { line: 60, way: 50, minWays: 2, maxWays: 3, conclusion: 120, perReply: 3 })
  assert.equal(PLAIN_LIMITS.title, 40)
})

test('codePointCount counts a character outside the BMP once; normalizeText is NFKC with white space as one space', () => {
  assert.equal(codePointCount('𠮷a'), 2)
  assert.equal(normalizeText('  Ａ　　B\n c '), 'A B c')
})

test('askOf: the text up to and with the first question mark, either width; the whole trimmed text when there is none', () => {
  assert.equal(askOf('我建议借书先不收押金，可以吗？代价是书丢了只能事后追责。'), '我建议借书先不收押金，可以吗？')
  assert.equal(askOf('我建议借书先不收押金。理由是押金要退还。可以吗？'), '我建议借书先不收押金。理由是押金要退还。可以吗？', 'the whole stretch to the mark, not the last sentence')
  assert.equal(askOf(' ok? yes '), 'ok?')
  assert.equal(askOf(' 没有问号 '), '没有问号')
})

test('askTextRefusal: one line, not empty, exactly one question mark, within the limit of the way of asking', () => {
  for (const form of ASK_FORMS) {
    assert.equal(askTextRefusal(form, PLAIN_QUESTION_EXAMPLES[form].text), undefined, form)
    assert.match(askTextRefusal(form, undefined)?.message ?? '', /non-empty/)
    assert.match(askTextRefusal(form, '   ')?.message ?? '', /non-empty/)
    assert.match(askTextRefusal(form, '一行\n二行？')?.message ?? '', /one line/)
    assert.match(askTextRefusal(form, '没有问号。')?.message ?? '', /exactly one question mark, it has 0/)
    assert.match(askTextRefusal(form, '一个吗？两个吗？')?.message ?? '', /it has 2/)
    assert.match(askTextRefusal(form, '全角？半角?')?.message ?? '', /it has 2/, 'both widths count')
    const limit = TALK_LIMITS.text[form]
    assert.equal(askTextRefusal(form, `${'字'.repeat(limit - 1)}？`), undefined, `${form}: exactly at the limit`)
    assert.match(askTextRefusal(form, `${'字'.repeat(limit)}？`)?.message ?? '', new RegExp(`longer than ${limit}`), form)
  }
  assert.equal(TALK_LIMITS.text.recommend, 160)
  assert.equal(askTextRefusal('recommend', `${'字'.repeat(130)}？`), undefined, 'recommend has room that choose has not')
  assert.notEqual(askTextRefusal('choose', `${'字'.repeat(130)}？`), undefined)
})

test('askTextRefusal says which sentence to shorten: the question, or what comes after it', () => {
  const question = askTextRefusal('want', `${'字'.repeat(130)}？`)
  assert.match(question?.hint ?? '', /^shorten the sentence that ends with the question mark/)
  const after = askTextRefusal('want', `问吗？${'字'.repeat(130)}`)
  assert.match(after?.hint ?? '', /^shorten the sentence after the question mark/)
})

test('textCoversRecord: recommend and want keep the recommendation in the question, the cost and the reason of choose may be anywhere', () => {
  const record = { proposal: '借书先不收押金', reason: '押金要退还', cost: '书丢了只能事后追责' }
  const good = '我建议借书先不收押金，因为押金要退还，可以吗？代价是书丢了只能事后追责。'
  assert.equal(textCoversRecord(good, record, 'recommend'), undefined)
  // The reason after the question mark is the failure the rule exists for: the stored question would carry no reason.
  assert.deepEqual(textCoversRecord('我建议借书先不收押金，可以吗？理由是押金要退还。', record, 'recommend'), { field: 'reason', within: 'ask' })
  assert.deepEqual(textCoversRecord('我建议，因为押金要退还，可以吗？', record, 'recommend'), { field: 'proposal', within: 'ask' })
  assert.deepEqual(textCoversRecord('我建议借书先不收押金，因为押金要退还，可以吗？', record, 'recommend'), { field: 'cost', within: 'text' })
  assert.equal(textCoversRecord('我建议借书先不收押金。理由是押金要退还。可以吗？代价是书丢了只能事后追责。', record, 'recommend'), undefined, 'the question runs from the start to the mark')
  assert.equal(textCoversRecord('我建议借书　先不收押金 ，因为押金要退还，可以吗？代价是书丢了只能事后追责。', { ...record, proposal: '借书 先不收押金' }, 'recommend'), undefined, 'compared after NFKC and with one space')
  assert.equal(textCoversRecord('哪条路？我推荐站内通知加邮件，因为多数读者不会每天登录。', { reason: '多数读者不会每天登录' }, 'choose'), undefined, 'the reason of choose may follow the mark')
  assert.deepEqual(textCoversRecord('哪条路？', { reason: '多数读者不会每天登录' }, 'choose'), { field: 'reason', within: 'text' })
  assert.equal(textCoversRecord('我猜你要导入一整批，对吗？', { proposal: '导入一整批' }, 'want'), undefined)
  assert.deepEqual(textCoversRecord('是这样吗？导入一整批。', { proposal: '导入一整批' }, 'want'), { field: 'proposal', within: 'ask' })
  assert.equal(textCoversRecord('草图在下面，哪里不对？', { proposal: '草图' }, 'look'), undefined)
  assert.deepEqual(textCoversRecord('哪里不对？', { proposal: '草图' }, 'look'), { field: 'proposal', within: 'text' })
})

test('renderAsk: the number and the text; the ways as a numbered list set apart, the last marked; the original text after a blank line, fenced for a sketch', () => {
  assert.equal(renderAsk('先不收押金，可以吗？', 1), '① 先不收押金，可以吗？')
  assert.equal(renderAsk(' 好吗？ ', 3), '③ 好吗？')
  assert.equal(renderAsk('哪条路？', 2, ['甲', '乙', '丙']), '② 哪条路？\n\n1. 甲\n2. 乙\n3. 丙（推荐）')
  assert.equal(renderAsk('这样吗？', 1, undefined, '原文'), '① 这样吗？\n\n原文')
  assert.equal(renderAsk('哪里不对？', 1, undefined, '[页]\n  [钮]', true), '① 哪里不对？\n\n```\n[页]\n  [钮]\n```')
  assert.equal(renderAsk('哪里不对？', 1, undefined, '含 ``` 的草图', true), '① 哪里不对？\n\n````\n含 ``` 的草图\n````', 'the fence is longer than any run in the text')
  assert.deepEqual(plainWordsIn(renderAsk('哪条路？', 1, ['甲', '乙'])), [], 'the words the harness adds are plain')
})

test('proposalTitleRefusal: one line, not empty, at most 40 characters', () => {
  assert.equal(proposalTitleRefusal('借书要不要先交押金'), undefined)
  assert.equal(proposalTitleRefusal('字'.repeat(PLAIN_LIMITS.title)), undefined)
  for (const bad of [undefined, 7, '', '  ', '一\n二', '字'.repeat(PLAIN_LIMITS.title + 1)]) assert.notEqual(proposalTitleRefusal(bad), undefined, String(bad))
})

test('proposalRecordRefusal: every example passes; each rule names the field to correct', () => {
  for (const form of ASK_FORMS) assert.equal(proposalRecordRefusal(exampleRecord(form) as Parameters<typeof proposalRecordRefusal>[0]), undefined, form)
  const field = (form: (typeof ASK_FORMS)[number], patch: Record<string, unknown>): string | undefined =>
    proposalRecordRefusal({ ...exampleRecord(form), ...patch })?.field
  assert.equal(field('recommend', { title: '' }), 'title')
  assert.equal(field('recommend', { form: 'sing' }), 'form')
  assert.equal(field('recommend', { ask: '没有问号。' }), 'ask')
  assert.equal(field('recommend', { ask: '问吗？还问吗？' }), 'ask')
  assert.equal(field('recommend', { ask: '问吗？尾巴' }), 'ask', 'the question ends with the mark')
  assert.equal(field('recommend', { ask: `${'字'.repeat(TALK_LIMITS.text.recommend)}？` }), 'ask')
  assert.equal(field('recommend', { proposal: '' }), 'proposal')
  assert.equal(field('recommend', { proposal: '字'.repeat(PROPOSAL_LIMITS.line + 1) }), 'proposal')
  assert.equal(field('recommend', { reason: undefined }), 'reason', 'recommend needs its reason')
  assert.equal(field('choose', { reason: undefined }), 'reason', 'choose needs its reason')
  assert.equal(field('recommend', { cost: undefined, notTaken: undefined }), undefined, 'cost and notTaken are optional')
  assert.equal(field('recommend', { ways: ['甲', '乙'] }), 'ways', 'recommend has no ways')
  assert.equal(field('choose', { cost: '代价' }), 'cost', 'choose has no cost')
  assert.equal(field('want', { reason: '理由' }), 'reason')
  assert.equal(field('want', { notTaken: '没选的' }), 'notTaken')
  assert.equal(field('look', { cost: '代价' }), 'cost')
  assert.equal(field('choose', { ways: undefined }), 'ways')
  assert.equal(field('choose', { ways: ['只有一条'], proposal: '只有一条' }), 'ways')
  assert.equal(field('choose', { ways: ['甲', '乙', '丙', '丁'], proposal: '丁' }), 'ways')
  assert.equal(field('choose', { ways: ['甲', '乙', '丙'], proposal: '丙' }), undefined, 'three ways')
  assert.equal(field('choose', { ways: ['甲', '甲'], proposal: '甲' }), 'ways', 'all different')
  assert.equal(field('choose', { ways: ['甲吗？', '乙'], proposal: '乙' }), 'ways', 'a way is not a question')
  assert.equal(field('choose', { ways: ['甲', '字'.repeat(PROPOSAL_LIMITS.way + 1)], proposal: '字'.repeat(PROPOSAL_LIMITS.way + 1) }), 'ways')
  assert.equal(field('choose', { proposal: '甲' }), 'proposal', 'the proposal of choose is its last way')
  for (const filler of ['无', '没有', '暂无', '不适用', 'N/A', 'none', '——']) {
    assert.equal(field('recommend', { cost: filler }), 'cost', filler)
    assert.equal(field('recommend', { notTaken: filler }), 'notTaken', filler)
  }
})

test('pageRefusal: a page is not empty, within the limit, and has each text it must name word for word, compared as texts are; the first missing one is named', () => {
  const wanted = [{ text: '记账', label: 'the module "记账"' }, { text: '数据只存在本机', label: 'the direction "数据只存在本机"' }]
  assert.equal(PAGE_LIMITS.max, 2000)
  assert.equal(pageRefusal('记账这一块。你定过：数据只存在本机。', wanted), undefined)
  assert.equal(pageRefusal('记账\n\n数据只  存在本机', [{ text: '数据只 存在本机', label: 'x' }]), undefined, 'white space is one space')
  assert.equal(pageRefusal('ＡＢＣ　DEF', [{ text: 'ABC DEF', label: 'x' }]), undefined, 'full-width forms are the same as half-width ones (NFKC)')
  assert.equal(pageRefusal('', wanted)?.message, 'page must not be empty')
  assert.equal(pageRefusal(' \n ', wanted)?.message, 'page must not be empty')
  assert.equal(pageRefusal('字'.repeat(PAGE_LIMITS.max), [])?.message, undefined, 'exactly the limit is within it')
  assert.match(pageRefusal('字'.repeat(PAGE_LIMITS.max + 1), [])?.message ?? '', /longer than 2000 characters/)
  assert.equal(pageRefusal('😀'.repeat(PAGE_LIMITS.max), []), undefined, 'a character outside the BMP counts once')
  const missing = pageRefusal('只有记账。', wanted)
  assert.equal(missing?.message, 'page does not have the direction "数据只存在本机"')
  assert.equal(missing?.hint, 'the page must name the direction "数据只存在本机" word for word: 数据只存在本机')
  assert.match(pageRefusal('数据只存在本机', wanted)?.message ?? '', /the module "记账"/, 'the first of them that is missing')
})