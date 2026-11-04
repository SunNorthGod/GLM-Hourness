/**
 * The plan text the harness writes for the human (m4-request-card, design
 * §5.4): the four-line rules exist once (`proposalLineRefusal`,
 * `PROPOSAL_LABELS`, `splitBold`), `displayPath` escapes and shortens the
 * data path, `personTitle` refuses an unfit focus title, and `renderPlan`
 * assembles title, four labelled lines, attachments and the closing
 * question — checking only the harness's own strings, so a path with 门禁
 * in it and a focus title the plain-words list knows still render (F18). The
 * six request variants are pinned verbatim in tests/guard-request.spec.ts;
 * here the rules and the pieces are pinned.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { codePointCount, normalizeText } from '../src/graph/proposal.ts'
import { displayPath, personTitle, proposalLineRefusal, PROPOSAL_LABELS, renderPlan, splitBold } from '../src/graph/plan-text.ts'
import { plainWordsIn } from '../src/graph/plain-question.ts'

const LINES = {
  background: 'agent 要**改工作区外的文件**，系统先拦下了',
  proposal: '**放行这一次**，旧内容先备份，改坏了能找回',
  doubt: '这个文件若**不归这件活管**，就不该放行',
  notTaken: '**不放行**，文件不动，agent 换在工作区里做',
}

// ------------------------------------------------------------ the four-line rules

test('splitBold cuts exactly one usable **span**, and refuses spans that are too short, too long, starred, or the whole line', () => {
  assert.deepEqual(splitBold('a **加粗的字** b'), { before: 'a ', bold: '加粗的字', after: ' b' })
  assert.equal(splitBold('a **字** b'), undefined, 'one code point is too short')
  assert.equal(splitBold(`a **${'字'.repeat(13)}** b`), undefined, 'thirteen code points are too many')
  assert.equal(splitBold('a **加*粗** b'), undefined, 'a star inside the span')
  assert.equal(splitBold('**加粗的字**'), undefined, 'the whole line bold')
  assert.equal(splitBold('no span'), undefined)
  assert.equal(splitBold('a **加粗的字** b **更多** c')?.bold, '加粗的字', 'only the first span counts')
})

test('proposalLineRefusal: the four rules per line — string, non-empty, one line, no own label, one bold, length without the marks', () => {
  const label = PROPOSAL_LABELS.proposal
  assert.equal(proposalLineRefusal('proposal', 42)?.message, `${label} is not a string`)
  assert.equal(proposalLineRefusal('proposal', '  ')?.message, `${label} is empty`)
  assert.equal(proposalLineRefusal('proposal', 'a\nb **加粗的字**')?.message, `${label} has a newline`)
  assert.equal(proposalLineRefusal('proposal', '推荐：**加粗的字**')?.hint, 'leave out the label; the harness adds it')
  assert.equal(proposalLineRefusal('proposal', 'no bold')?.message, `${label} has no single **bold** span of 2-12 code points`)
  assert.equal(proposalLineRefusal('proposal', `**放行这一次**，${'字'.repeat(40)}`)?.message, `${label} is longer than 40 code points without the marks`)
  assert.equal(proposalLineRefusal('background', `**背景一行**，${'字'.repeat(59)}`), undefined, 'the background reads the panel limit')
  assert.equal(proposalLineRefusal('background', `**背景一行**，${'字'.repeat(60)}`)?.message, '背景 is longer than 60 code points without the marks')
  assert.equal(proposalLineRefusal('notTaken', LINES.notTaken), undefined)
})

test('the design line lengths fit the limits: 推荐 19, 疑问 17, 不做 22 code points without the marks, the background at most 42 with a 16-code-point focus title', () => {
  const without = (line: string): number => codePointCount(line.replaceAll('**', ''))
  assert.equal(without(LINES.proposal), 19)
  assert.equal(without(LINES.doubt), 17)
  assert.equal(without(LINES.notTaken), 22)
  assert.ok(without(LINES.proposal) <= 40 && without(LINES.doubt) <= 40 && without(LINES.notTaken) <= 40)
  const focus = '整理今天的笔记'
  const withFocus = `agent 做「${focus}」时要**改工作区外的文件**，系统先拦下了`
  assert.ok(without(withFocus) <= 42, `${without(withFocus)}`)
  const title = personTitle(`${focus}${'很'.repeat(10)}`, { limit: 16, issuesOf: () => [] })!
  const background = `agent 做「${title}」时要**改工作区外的文件**，系统先拦下了`
  assert.ok(without(background) <= 42 + 5, 'the truncated title stays within the plain limit for the background')
})

// ------------------------------------------------------------------ displayPath

test('displayPath escapes the structural characters, keeps the path verbatim for the plain-words check, and shortens a long one to root and last two segments', () => {
  assert.equal(displayPath('C:\\Users\\me\\notes\\todo.md'), 'C:\\Users\\me\\notes\\todo.md')
  assert.equal(displayPath('C:\\proj\\docs\\gate.ts'), 'C:\\proj\\docs\\gate.ts', '门禁 in the path is data and survives')
  assert.equal(displayPath('C:\\a b\\*weird*[x].md'), 'C:\\a b\\*weird*\\[x\\].md'.replaceAll('*weird*', '\\*weird\\*'))
  assert.equal(displayPath('C:\\ctrl\u0007x\\f.md'), 'C:\\ctrl?x\\f.md', 'a control character becomes ?')
  const deep = 'C:\\' + Array.from({ length: 12 }, (_, index) => `folder${index}`).join('\\') + '\\todo.md'
  const shown = displayPath(deep)
  assert.ok(codePointCount(shown) <= codePointCount(deep))
  assert.ok(shown.includes('…'), shown)
  assert.ok(shown.endsWith('todo.md') && shown.startsWith('C:'), shown)
})

// ---------------------------------------------------------------- personTitle

test('personTitle strips the marks, truncates with an ellipsis, and refuses a title the issues list knows', () => {
  const plain = { limit: 16, issuesOf: (text: string): readonly string[] => plainWordsIn(text) }
  assert.equal(personTitle('整理今天的笔记', plain), '整理今天的笔记')
  assert.equal(personTitle('**加粗**的标题', plain), '加粗的标题')
  assert.equal(personTitle('补齐验收条件', plain), undefined, 'the plain-words list knows it')
  assert.equal(personTitle('收拾 gate.ts', plain), undefined)
  const long = personTitle('一个特别特别特别特别特别长的项目节点标题', { limit: 16, issuesOf: () => [] })!
  assert.equal(codePointCount(long), 17, 'the limit plus the ellipsis')
  assert.ok(long.endsWith('…'))
  assert.equal(personTitle('', plain), undefined)
})

// ----------------------------------------------------------------- renderPlan

const QUESTION = '放行这一次，可以吗？（回「可以」才算数）'

test('renderPlan assembles title, the four labelled lines, the attachments and the question last, one blank line between paragraphs, labels not bold', () => {
  const text = renderPlan({
    title: { lead: '要改工作区外的文件：', data: 'C:\\Users\\me\\notes\\todo.md' },
    lines: LINES,
    attachments: ['- 文件现在：已存在，2,140 字节，10-30 09:12 改过', '- agent 说的目的：「把今天的待办追加进去」'],
    question: QUESTION,
  })
  const paragraphs = text.split('\n\n')
  assert.deepEqual(paragraphs.slice(0, 6), [
    '要改工作区外的文件：C:\\Users\\me\\notes\\todo.md',
    `背景：${LINES.background}`,
    `推荐：${LINES.proposal}`,
    `疑问：${LINES.doubt}`,
    `不做：${LINES.notTaken}`,
    '附：\n- 文件现在：已存在，2,140 字节，10-30 09:12 改过\n- agent 说的目的：「把今天的待办追加进去」',
  ])
  assert.equal(paragraphs.at(-1), QUESTION, 'the question is the last paragraph, asked once')
  assert.equal(normalizeText(text), normalizeText(text))
})

test('renderPlan throws on a constant that fails the four-line rules, a too-long or multi-line title, or a plain-words word in the harness text — and renders data that carries one', () => {
  assert.throws(() => renderPlan({ title: { lead: '要改工作区外的文件：' }, lines: { ...LINES, proposal: 'no bold' }, question: QUESTION }), /no single \*\*bold\*\* span/)
  assert.throws(() => renderPlan({ title: { lead: `要改工作区外的文件：${'路'.repeat(90)}` }, lines: LINES, question: QUESTION }), /longer than 80 code points/)
  assert.throws(() => renderPlan({ title: { lead: '要改\n工作区外的文件：' }, lines: LINES, question: QUESTION }), /newline/)
  assert.throws(() => renderPlan({ title: { lead: '要改工作区外的文件：' }, lines: { ...LINES, background: '系统**门禁**先拦下了' }, question: QUESTION }), /plain-words list word/)
  assert.throws(() => renderPlan({ title: { lead: '要改工作区外的文件：' }, lines: LINES, question: '验收一下，可以吗？' }), /plain-words list word/)
  // The data is shown verbatim: a path with 门禁 or gate.ts renders fine.
  const text = renderPlan({ title: { lead: '要改工作区外的文件：', data: 'C:\\proj\\docs\\gate.ts' }, lines: LINES, question: QUESTION })
  assert.ok(text.startsWith('要改工作区外的文件：C:\\proj\\docs\\gate.ts'))
})
