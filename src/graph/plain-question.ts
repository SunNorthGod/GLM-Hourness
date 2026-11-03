/**
 * Plain words for the human (docs/ORCHESTRATION.md §3.5; decisions
 * d-plain-questions and d-ask-three-gates): the words the person has not
 * learned and what to say instead, one worked example of each way of asking
 * and the guide that carries them into the tool description of
 * propose_to_human. The panel's wording check reads PLAIN_WORDS from here.
 * Pure text and pure functions, no Node built-ins.
 *
 * The examples are made-up matters of a library system and show the shapes
 * only: the guide says never to ask them. They go through the same checks as a
 * real question (tests/proposal.spec.ts, tests/propose-to-human.spec.ts), so a
 * change to a rule or a limit fails them.
 */
import { renderAsk, type AskForm } from './proposal.ts'

/** One word the person does not use, and what to say in its place. */
export interface PlainWord {
  /** The forms to avoid: Chinese by substring, English by whole word, case-insensitive. */
  readonly avoid: readonly string[]
  readonly say: string
}

export const PLAIN_WORDS: readonly PlainWord[] = [
  { avoid: ['验收', 'acceptance'], say: '怎样算做完' },
  { avoid: ['标定', 'calibration'], say: '练习题' },
  { avoid: ['门禁', 'gate'], say: '合入前的检查' },
  { avoid: ['投影', 'projection'], say: '每一步给 agent 的项目摘要' },
  { avoid: ['补遗', '附录', 'addendum'], say: '说清它是什么' },
]

/** The parameters of one worked example of propose_to_human (kind question). */
export interface AskExample {
  readonly title: string
  readonly text: string
  readonly proposal?: string
  readonly reason?: string
  readonly cost?: string
  readonly ways?: readonly string[]
  readonly notTaken?: string
  readonly sample?: string
}

/** One example per way of asking, in the form the tool takes them. A `choose` gives no `proposal`: the harness takes the last way. */
export const PLAIN_QUESTION_EXAMPLES: Readonly<Record<AskForm, AskExample>> = {
  recommend: {
    title: '借书要不要先交押金',
    text: '我建议借书先不收押金，因为押金要退还，管理员得多做一份对账，可以吗？代价是书丢了只能事后追责。',
    proposal: '借书先不收押金',
    reason: '押金要退还，管理员得多做一份对账',
    cost: '书丢了只能事后追责',
  },
  choose: {
    title: '逾期怎么提醒读者',
    text: '读者快到期或逾期时怎么提醒他们？我推荐站内通知加邮件，因为多数读者不会每天登录。',
    ways: ['只在借书记录页标红：读者登录后才看到，不发消息', '站内通知加邮件：到期前一天和逾期当天各发一次，没登录也收得到'],
    reason: '多数读者不会每天登录',
  },
  want: {
    title: '新书怎么上架',
    text: '新书上架时，我猜管理员是一次导入一整批（比如一个表格），而不是一本一本录，对吗？',
    proposal: '一次导入一整批（比如一个表格）',
  },
  look: {
    title: '借书页长什么样',
    text: '借书页草图在下面，看着哪里不对？',
    proposal: '借书页草图',
    sample: '[借书页] 搜索：[书名____] [搜索]\n《城市与墙》  在架    [借出]\n《边城》      已借出，6 月 12 日归还    [预约]',
  },
}

/** The words of PLAIN_WORDS that `text` uses. */
export function plainWordsIn(text: string): string[] {
  return PLAIN_WORDS.flatMap(({ avoid }) => avoid).filter(word => /^[\x20-\x7e]+$/.test(word)
    ? new RegExp(`(?<![A-Za-z0-9_])${word}(?![A-Za-z0-9_])`, 'i').test(text)
    : text.includes(word))
}

/** The plain-words list as a sentence for the main agent: the identity section and the tool description quote it. */
export const PLAIN_WORDS_GUIDE = 'Plain words for the human: 怎样算做完 (for a goal: 怎样算做成), not 验收 or acceptance; 练习题, not 标定 or calibration (fixed small projects the system runs by itself to check nothing broke); 合入前的检查, not 门禁 or gate; 每一步给 agent 的项目摘要, not 投影 or projection; never 补遗, 附录 or addendum: say what the document is.'

function fields(example: AskExample): string {
  const given: ReadonlyArray<readonly [string, string | undefined]> = [
    ['title', example.title],
    ['proposal', example.proposal],
    ['reason', example.reason],
    ['cost', example.cost],
    ['ways', example.ways?.join(' | ')],
    ['sample', example.sample === undefined ? undefined : 'the sketch'],
  ]
  return given.flatMap(([name, value]) => value === undefined ? [] : [`${name} ${value}`]).join('; ')
}

/** One example as the guide shows it: what the main agent gives, then what the human reads. */
function shown(form: AskForm): string {
  const example = PLAIN_QUESTION_EXAMPLES[form]
  const reads = renderAsk(example.text, 1, example.ways, example.sample, true)
  return `${form}: ${fields(example)}. The human reads${form === 'look' ? ' the question, then the sketch as drawn' : ''}:\n${reads}`
}

/** The examples of the four ways of asking, then the plain-words list: part of the tool description of propose_to_human. */
export const PLAIN_QUESTION_GUIDE = [
  'Examples (made-up matters for a library system; they only show the shapes, never ask them):',
  ...(['recommend', 'choose', 'want', 'look'] as const).map(shown),
  PLAIN_WORDS_GUIDE,
].join('\n')
