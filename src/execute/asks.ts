/**
 * The matters that go to the person (M7 design 0.6 §3.7.4): the one place in
 * M7 that words a question. The harness never writes a question to the graph
 * and never lays out the chat (`d-chat-not-cards`); it hands the main agent
 * the facts and a four-line draft, and the agent may use it as written or
 * change it with what it knows. Pure functions.
 *
 * The draft's five lines follow the person's format (`d-chat-not-cards`):
 * one short line each, exactly one bold phrase per line, plain words only
 * (src/graph/plain-question.ts). `draftRefusal` runs a draft through the
 * landed checks of M3's propose record (`proposalRecordRefusal` on the
 * recommend shape — the design named this `proposalLineRefusal`, which the
 * merged M3 carries as the record check — and `plainWordsIn` on every line),
 * so a draft the harness hands over never comes back refused.
 *
 * `stopDraftOf` words the notice of a stopped review, check or acceptance
 * review from the graph alone; the `execute.stop-draft` action of the loop
 * board (src/execute/loop-link.ts) returns it as its tell (D11).
 */
import type { LoadedGraph } from '../graph/parse.ts'
import { PROPOSAL_LIMITS, codePointCount, proposalRecordRefusal, type ProposalRecord } from '../graph/proposal.ts'
import { PLAIN_LIMITS, type GraphNode } from '../graph/schema.ts'
import { plainWordsIn } from '../graph/plain-question.ts'
import { roundsOf } from './review.ts'

/** The five matters the harness words (§3.7.4's table; the last two come with the weekly report, P2). */
export type AskKind = 'review-stuck' | 'check-stuck' | 'acceptance-stuck' | 'norm-ladder' | 'floor-add'

/** A four-line draft, plus the question line the propose call shows. */
export interface Draft {
  readonly title: string
  readonly ask: string
  readonly background: string
  readonly proposal: string
  readonly doubt: string
  readonly notTaken: string
}

/** What askDraft hands over: the facts in a few lines, then the draft. */
export interface Ask {
  readonly kind: AskKind
  /** The facts, one line each: rounds, findings, the command, the log, the files. */
  readonly facts: readonly string[]
  readonly draft: Draft
}

const bold = (phrase: string): string => `**${phrase}**`
const join = (before: string, phrase: string, after: string): string => `${before}${bold(phrase)}${after}`

export interface ReviewStuckFacts {
  /** The task the review is about, its title for the draft. */
  readonly task: string
  readonly title: string
  /** The rounds since the person's latest word, and the blocking findings left. */
  readonly rounds: number
  readonly blocking: number
  /** Where the findings sit, at most three. */
  readonly files: readonly string[]
}

export interface CheckStuckFacts {
  readonly task: string
  readonly title: string
  /** Which time the check failed in a row. */
  readonly attempt: number
  /** The command that failed and where its log is. */
  readonly command: string
  readonly log: string
}

export interface AcceptanceStuckFacts {
  readonly goal: string
  readonly title: string
  /** The acceptance items the review found unmet, at most three. */
  readonly failing: readonly string[]
}

/** Which way the numbers point for a norm's level (§3.12.2). */
type LadderDirection = 'up' | 'enforce' | 'down'

export interface LadderFacts {
  readonly norm: string
  readonly title: string
  readonly direction: LadderDirection
  /** The numbers behind the direction, one line. */
  readonly counts: string
}

export interface FloorAddFacts {
  /** The paths the rework concentrated on, at most three. */
  readonly paths: readonly string[]
  /** How many of the light-or-skipped tasks came back, and how many were reviewed down. */
  readonly reworked: number
  readonly declared: number
}

/**
 * The facts and the draft of one matter (§3.7.4's table). One plan only; the
 * 「不做」 line says why the runner-up loses. A review with more than two
 * blocking findings, and an acceptance review with more than two unmet
 * items, go back to the design instead of one more round.
 */
export function askDraft(kind: AskKind, facts: ReviewStuckFacts | CheckStuckFacts | AcceptanceStuckFacts | LadderFacts | FloorAddFacts): Ask {
  switch (kind) {
    case 'review-stuck': {
      const input = facts as ReviewStuckFacts
      const where = input.files.length > 0 ? `（${clip(input.files.slice(0, 3).join('、'), 28)}）` : ''
      const again = input.blocking <= 2
      return {
        kind,
        facts: [`审查 ${input.task} 已 ${input.rounds} 轮没过`, `还剩 ${input.blocking} 处必须改的${where}`],
        draft: {
          title: clip(`「${input.title}」审了 ${input.rounds} 轮还没过`, PLAIN_LIMITS.title),
          ask: again ? '按剩下的几处**再修一轮**，可以吗？' : '把它**退回设计**，重新定这一块的写法，可以吗？',
          background: join('审查', `${input.rounds} 轮没过`, `，还剩 ${input.blocking} 处必须改的`),
          proposal: again
            ? join('按这 ', `${input.blocking} 处`, ' 再修一轮，还不过就停下问人')
            : join('把它退回', '设计', '，重新定这一块的写法'),
          doubt: join('要是这件活的', '要求本身不对', '，再修也没用'),
          notTaken: join('不先', '放弃这件活', '，放弃了目标会缺一块'),
        },
      }
    }
    case 'check-stuck': {
      const input = facts as CheckStuckFacts
      return {
        kind,
        facts: [`合入前的检查第 ${input.attempt} 次没过`, `命令：${input.command}`, `日志：${input.log}`],
        draft: {
          title: clip(`「${input.title}」检查三次没过`, PLAIN_LIMITS.title),
          ask: '带着失败的记录**再修一轮**，可以吗？',
          background: join('检查', `${input.attempt} 次没过`, `，卡在 ${clip(input.command, 24)}`),
          proposal: join('带上三次失败的命令与日志', '再修一轮', '，把检查跑绿'),
          doubt: join('要是检查本身有问题', '，再修也白修', '，先看检查'),
          notTaken: join('不先', '跳过检查', '，没跑过的东西不进主干'),
        },
      }
    }
    case 'acceptance-stuck': {
      const input = facts as AcceptanceStuckFacts
      const split = input.failing.length > 0 && input.failing.length <= 2
      const listed = input.failing.length > 0 ? `，没做到的：${clip(input.failing.slice(0, 2).join('；'), 30)}` : '，结论在图上'
      return {
        kind,
        facts: [`目标 ${input.goal} 的整体审查没过`, `没做到的：${input.failing.slice(0, 3).join('；') || '（审查说了，图上没写条目）'}`],
        draft: {
          title: clip(`「${input.title}」整体审查没过`, PLAIN_LIMITS.title),
          ask: split ? '把没做到的**拆成新活**再做，可以吗？' : '把它**退回设计**重新定，可以吗？',
          background: join('整体审查', '没过', listed),
          proposal: split
            ? join('把没做到的', '拆成新活', '再做，做完再整体看一遍')
            : join('把它退回', '设计', '，重新定框架'),
          doubt: join('要是缺的是同一条', '根子上的要求', '，拆开也没用'),
          notTaken: join('不先', '就这样收尾', '，没做到的不会自己消失'),
        },
      }
    }
    case 'norm-ladder': {
      const input = facts as LadderFacts
      const ways: Record<LadderDirection, [string, string]> = {
        up: ['升一级', '拦下更早'],
        enforce: ['转为真拦', '影子看了够久'],
        down: ['降一级', '近来没有用到它'],
      }
      const [move, why] = ways[input.direction]
      return {
        kind,
        facts: [`规矩「${input.title}」按数据该${move}`, input.counts],
        draft: {
          title: clip(`「${input.title}」要不要${move}`, PLAIN_LIMITS.title),
          ask: `这条规矩${bold(move)}，可以吗？`,
          background: join('这条规矩', move, input.counts === '' ? '' : `：${clip(input.counts, 28)}`),
          proposal: join(move, '', `：${why}`),
          doubt: join('要是最近的数据', '还不够说话', '，先放着'),
          notTaken: join('不', '维持不动', '，数据指了方向'),
        },
      }
    }
    case 'floor-add': {
      const input = facts as FloorAddFacts
      const paths = clip(input.paths.slice(0, 3).join('、'), 32)
      return {
        kind,
        facts: [`降档之后返工的活集中在 ${paths}`, `${input.reworked} 件返工，都是轻审或不审的`],
        draft: {
          title: clip('「必须全审的改动」要不要加一类', PLAIN_LIMITS.title),
          ask: `把 ${paths} 加进**必须全审的改动**，可以吗？`,
          background: join('降档之后的返工', '集中在', ` ${paths}`),
          proposal: join('把这类路径', '加进必须全审的改动', `：${input.reworked} 件返工里 ${Math.min(input.reworked, 2)} 件后来重做`),
          doubt: join('要是返工是别的原因', '，加类也没用', '，先看下一周'),
          notTaken: join('不先', '把这类全改成全审', '，等人点头再改'),
        },
      }
    }
  }
}

/** The draft as a propose record the landed check reads; the doubt line rides with the agent's report, not the record. */
function recordOf(draft: Draft): ProposalRecord {
  return { title: draft.title, ask: draft.ask, form: 'recommend', proposal: draft.proposal, reason: draft.background, notTaken: draft.notTaken }
}

/** Cut a title to a code-point budget without cutting into the bold. */
function clip(text: string, limit: number): string {
  return codePointCount(text) <= limit ? text : `${[...text].slice(0, limit - 1).join('')}…`
}

/**
 * What the landed checks say about a draft: the record through
 * `proposalRecordRefusal` (title, ask, proposal, background as reason,
 * notTaken — one short line each), the doubt line against the same line
 * limit, and the plain-words list over every line. Undefined when the draft
 * would go out as written.
 */
export function draftRefusal(draft: Draft): { readonly message: string, readonly hint: string } | undefined {
  const refusal = proposalRecordRefusal(recordOf(draft))
  if (refusal !== undefined) return { message: refusal.message, hint: refusal.hint }
  if (codePointCount(draft.doubt) > PROPOSAL_LIMITS.line) {
    return { message: `doubt is longer than ${PROPOSAL_LIMITS.line} characters`, hint: 'the doubt is one short line' }
  }
  const words = plainWordsIn([draft.title, draft.ask, draft.background, draft.proposal, draft.doubt, draft.notTaken].join('\n'))
  if (words.length > 0) return { message: `the draft uses ${words[0]}`, hint: 'say it in the plain words the person reads' }
  return undefined
}

// ---- the stop notice (§3.7.4, `execute.stop-draft`) ----

/** What `hourness.stopped` carries: the stopped node (the review task, the task, the goal), the kind, the rounds. */
export interface StopPayload {
  readonly node: string
  readonly kind: string
  readonly rounds: number
}

const CHECK_STOP = /^检查第 (\d+) 次没过：(.*) exit (\S+) · (.*) · 停下$/
const ACCEPTANCE_STOP = /^验收审查第 (\d+) 轮：\S+ · 挡路 (\d+) · (\S+) · .* · 停下$/
const BLOCKING_LINE = /^- \[blocking\] (\S+) at (.+?): /

/** The harness comments of a node, oldest first. */
const harnessComments = (node: GraphNode): readonly string[] =>
  node.history.flatMap(entry => entry.op === 'comment' && entry.actor === 'harness' && entry.text !== undefined ? [entry.text] : [])

/** The blocking findings of one reviewer's handback comment (`<head> · <childId> · …` then one `- [blocking] <criterion> at <where>: …` line each). */
function blockingOf(node: GraphNode, head: string, childId: string): readonly { readonly criterion: string, readonly where: string }[] {
  const text = harnessComments(node).filter(comment => comment.startsWith(`${head} · ${childId} · `)).at(-1)
  return (text ?? '').split('\n').flatMap((line) => {
    const found = BLOCKING_LINE.exec(line)
    return found === null ? [] : [{ criterion: found[1], where: found[2] }]
  })
}

const fieldsOf = (ask: Ask): string => `${ask.draft.title} / ${ask.draft.background} / ${ask.draft.proposal} / ${ask.draft.doubt} / ${ask.draft.notTaken}`
const linesOf = (ask: Ask): string => [ask.draft.title, `背景：${ask.draft.background}`, `提议：${ask.draft.proposal}`, `疑问：${ask.draft.doubt}`, `不做：${ask.draft.notTaken}`].join(' | ')
const AFTER = 'Other work goes on. When everything left waits for the person, call await_human with the question ids.'

/**
 * The stop notice the holder reads, from the graph alone (§3.7.4, D11): a
 * review from the review task's stopped round comment and the blocking
 * places of that reviewer's 「审查交回」 comment; a check from the task's
 * 「检查第 n 次没过：… · 停下」 comment; an acceptance review from the goal's
 * stopped 「验收审查第 k 轮」 comment and the blocking items of that
 * reviewer's 「验收审查交回」 comment. Undefined when the graph holds no
 * such stop for the node.
 */
export function stopDraftOf(graph: LoadedGraph, payload: StopPayload): string | undefined {
  const node = graph.nodes.get(payload.node)
  if (node === undefined) return undefined
  if (payload.kind === 'review') {
    const reviewed = node.parent === undefined ? undefined : graph.nodes.get(node.parent)
    const round = roundsOf(node.history).filter(entry => entry.stopped).at(-1)
    if (reviewed === undefined || round === undefined) return undefined
    const where = blockingOf(node, '审查交回', round.childId).map(finding => finding.where)
    const ask = askDraft('review-stuck', { task: reviewed.id, title: reviewed.title, rounds: round.k, blocking: round.blocking, files: where.slice(0, 3) })
    return `${reviewed.id} stopped: ${round.k} review rounds, ${round.blocking} blocking findings left (${where.slice(0, 3).join(', ') || 'none named'}). Put it to the person in your next batch with propose_to_human (kind question, parent ${reviewed.id}, sources [${node.id}]); a draft that passes the checks: ${fieldsOf(ask)} — in the person's words, the four lines are: ${linesOf(ask)}. ${AFTER}`
  }
  if (payload.kind === 'check') {
    const found = harnessComments(node).map(text => CHECK_STOP.exec(text)).filter(match => match !== null).at(-1)
    if (found === undefined) return undefined
    const [, n, line, exit, log] = found
    const ask = askDraft('check-stuck', { task: node.id, title: node.title, attempt: Number(n), command: line, log })
    return `${node.id} stopped: the merge check failed ${n} times since the person's latest word (${line} exit ${exit}, log ${log}). Put it to the person in your next batch with propose_to_human (kind question, parent ${node.id}); a draft that passes the checks: ${fieldsOf(ask)}; in the person's words, the four lines are: ${linesOf(ask)}. ${AFTER}`
  }
  if (payload.kind === 'acceptance') {
    const found = harnessComments(node).map(text => ACCEPTANCE_STOP.exec(text)).filter(match => match !== null).at(-1)
    if (found === undefined) return undefined
    const [, k, blocking, childId] = found
    const failing = blockingOf(node, '验收审查交回', childId).map(finding => {
      const index = /^acceptance:(\d+)$/.exec(finding.criterion)?.[1]
      return (index === undefined ? undefined : node.acceptance?.[Number(index)]) ?? finding.criterion
    })
    const ask = askDraft('acceptance-stuck', { goal: node.id, title: node.title, failing: failing.slice(0, 3) })
    return `${node.id} stopped: ${k} acceptance review rounds, ${blocking} blocking findings left (${failing.slice(0, 3).join('; ') || 'none named'}). Put it to the person in your next batch with propose_to_human (kind question, parent ${node.id}); a draft that passes the checks: ${fieldsOf(ask)}; in the person's words, the four lines are: ${linesOf(ask)}. ${AFTER}`
  }
  return undefined
}
