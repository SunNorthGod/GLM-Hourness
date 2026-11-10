/**
 * The memory row's code rule `habit-ask-first` (project graph node
 * m5-habit-rule; M5 design §3.8): a habit the agent only guessed is put to
 * the person with memory_habit, so the question, their answer and a no are
 * on record and a no keeps the same habit unasked for 28 days. Two ways
 * around memory_habit are denied at the call:
 *
 * - a question card (`ask_user_question`) that asks about a habit to keep:
 *   its answer is a tool result, recorded nowhere, and a no on it holds only
 *   in that conversation;
 * - a `memory_store` of a preference (type user or feedback) whose `relay`
 *   only agrees to the agent: a plain yes (src/shared/answer-marks.ts
 *   `isPlainYes`), or words that mostly repeat the question the agent asked
 *   right before the person's latest message.
 *
 * What the person says in their own words, unasked, is stored directly as
 * before (the relay check of memory_store is unchanged), and so is the
 * reporting depth (§3.7: memory_habit cannot carry its `value`). A question
 * asked in plain chat cannot be seen at the call boundary; that gap is
 * written down in the design (§3.8), and the second item above keeps it
 * from storing anything.
 *
 * Installed through the guard framework's one gate (src/guard/gate.ts): it
 * denies from the day the memory row is enabled (`d-code-rules-enforce`), a
 * denial is a line of the violation journal with the rule id, and the rule
 * is lifted only the one M4 way (`d-one-lift-path`: the human tells the main
 * agent, which calls guard_lift with their words; the board's /rules lift
 * does not reach code rules yet, src/guard/lift-service.ts). The
 * catalog entry is in src/guard/catalog.ts. Only root sessions are judged:
 * a delegated child has neither memory_store nor memory_habit.
 */
import { wordsOf } from '../data/words.ts'
import { hasHabitWord } from './habit-words.ts'
import { cwdOf, installRuleGate, type GateHost, type GateRules } from '../guard/gate.ts'
import { originOf } from '../guard/origin.ts'
import type { GuardRecord } from '../guard/records.ts'
import { NATIVE_FACE, type Correction, type GuardRule, type RuleVerdict, type ToolCall } from '../guard/rules.ts'
import { isPlainYes } from '../shared/answer-marks.ts'
import { dialectNames, dialectService, dialectWarner, type DialectProblem } from '../shared/dialect.ts'
import type { DerivedMessage, ToolExecutionPayload } from '../shared/dsh-min.ts'
import type { RowHealth } from '../shared/health.ts'
import { sessionRoute } from '../shared/route.ts'
import { MEMORY_HABIT } from '../shared/tool-names.ts'
import type { JournalOutcome } from './audit.ts'

/** The rule's id: the denial's `rule`, the id guard_lift takes; the rules board lists it as `memory:habit-ask-first`. */
export const HABIT_ASK_FIRST = 'habit-ask-first'

/** The rule's line in the guard section of the system prompt (src/guard/index.ts adds it while the memory row is in effect). */
export const HABIT_RULE_DECLARATION = `Habits you only guessed from how the user works are asked with ${MEMORY_HABIT} (ask, then confirm or decline on their words), never on a question card; a preference whose relay only agrees to a question you asked is refused.`

/** The question tool of DSH (dsh-tool-ask-user), by its native name. */
const QUESTION_TOOL = 'ask_user_question'

/** The one preference memory_habit cannot record (it carries a `value`, §3.7). */
const REPORTING_DEPTH = 'reporting-depth'

/** Share of the relay's words (src/data/words.ts) found in the agent's question at which the relay counts as agreeing to it. */
const ECHO_SHARE = 0.5

const ALLOW: RuleVerdict = { kind: 'allow' }

/** What the rule reads of the session's talk: the person's latest message and the question the agent asked right before it. */
export interface HabitTalk {
  /** The text of the last assistant message before the person's latest message, when it asks something (holds a question mark). */
  readonly asked?: string
}

const textOf = (message: DerivedMessage): string =>
  (message.content ?? []).flatMap(block => block.type === 'text' && typeof block.text === 'string' ? [block.text] : []).join('\n')

/** A message the person sent: role user, source kind user, no form (notices and snapshots are not; the reading of src/guard/lift.ts). */
const isPerson = (message: DerivedMessage): boolean =>
  message.role === 'user' && typeof message.source === 'object' && message.source !== null && message.source.kind === 'user' && message.source.form === undefined

/** The talk the rule reads, from the session's request-visible history; nothing before the person's latest message is a question when the history holds none. */
export function habitTalkOf(messages: readonly DerivedMessage[]): HabitTalk {
  let person = -1
  for (let index = messages.length - 1; index >= 0; index--) {
    const candidate = messages[index]
    if (candidate !== undefined && isPerson(candidate)) {
      person = index
      break
    }
  }
  for (let index = person - 1; index >= 0; index--) {
    const message = messages[index]
    if (message === undefined || message.role !== 'assistant') continue
    const text = textOf(message)
    if (text.trim() === '') continue
    return /[?？]/u.test(text) ? { asked: text } : {}
  }
  return {}
}

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined

/** The texts a question card shows: each question, its header, and its options' labels and descriptions. */
function cardTexts(args: Record<string, unknown> | undefined): string[] {
  const questions = Array.isArray(args?.questions) ? args.questions : []
  return questions.flatMap((item) => {
    const question = recordOf(item)
    const options = Array.isArray(question?.options) ? question.options : []
    return [question?.question, question?.header, ...options.flatMap(option => [recordOf(option)?.label, recordOf(option)?.description])]
      .filter((text): text is string => typeof text === 'string')
  })
}

/** Share of the relay's words that the agent's question holds. */
function echoShare(relay: string, asked: string): number {
  const said = wordsOf(relay)
  if (said.size === 0) return 0
  const question = wordsOf(asked)
  return [...said].filter(word => question.has(word)).length / said.size
}

const cut = (text: string, limit = 120): string => {
  const points = [...text.replace(/\s+/gu, ' ').trim()]
  return points.length <= limit ? points.join('') : `${points.slice(0, limit).join('')}…`
}

const LIFT_PATH = `Only the human can lift this rule: they tell you, and you call guard_lift ${HABIT_ASK_FIRST} with their words.`

const deny = (correction: Correction): RuleVerdict => ({ kind: 'deny', rule: HABIT_ASK_FIRST, correction })

/** The rule for one call of a root session, over what the session showed of its talk. */
export function habitAskFirst(talk: HabitTalk): GuardRule {
  return {
    id: HABIT_ASK_FIRST,
    declare: HABIT_RULE_DECLARATION,
    detect(call) {
      const args = recordOf(call.arguments)
      if (call.name === QUESTION_TOOL) {
        const hit = cardTexts(args).find(hasHabitWord)
        if (hit === undefined) return ALLOW
        return deny({
          fact: `You asked the person about a habit on a question card: "${cut(hit)}".`,
          violation: `Rule ${HABIT_ASK_FIRST}: a habit you guessed is put to the person with ${MEMORY_HABIT}, so the question, their answer and a no are on record and a no keeps the same habit unasked for 28 days; an answer on a card is recorded nowhere.`,
          rightPath: `Call ${MEMORY_HABIT} with action "ask" and show the text it returns in your reply; when the person answers, record it with action "confirm" or "decline" and their own words.`,
          exception: `If the question is not about a habit to keep, ask it in plain chat. ${LIFT_PATH}`,
        })
      }
      if (call.name !== 'memory_store' || args === undefined) return ALLOW
      if ((args.type !== 'user' && args.type !== 'feedback') || args.name === REPORTING_DEPTH || typeof args.relay !== 'string') return ALLOW
      const relay = args.relay
      const answered = isPlainYes(relay)
        ? 'which only says yes'
        : talk.asked !== undefined && echoShare(relay, talk.asked) >= ECHO_SHARE ? `which repeats the question you asked: "${cut(talk.asked)}"` : undefined
      if (answered === undefined) return ALLOW
      return deny({
        fact: `You stored the preference "${typeof args.name === 'string' ? args.name : ''}" with relay "${cut(relay)}", ${answered}.`,
        violation: `Rule ${HABIT_ASK_FIRST}: only what the person says in their own words, unasked, is stored directly; a habit they agree to after you asked goes through ${MEMORY_HABIT}, so the question, their answer and a no are on record.`,
        rightPath: `Call ${MEMORY_HABIT} with action "ask" for this habit (name, scope, description, body, question) and show its text; record their answer with action "confirm" and their words.`,
        exception: `If they stated the habit in their own words and not as an answer to your question, quote that sentence as relay. ${LIFT_PATH}`,
      })
    },
    rightPath(next: ToolCall): boolean {
      return next.name === MEMORY_HABIT
    },
  }
}

interface HabitRuleDeps {
  readonly ctx: GateHost
  /** Writes one denial into the violation journal of the session's project (the memory row's project directory); never rejects into the call. */
  readonly journal: (record: GuardRecord, cwd: string | undefined) => Promise<JournalOutcome> | void
  readonly flush?: () => Promise<void>
  readonly health?: Pick<RowHealth, 'note'>
}

/** The rule for one root call of memory_store or of the question tool; other calls and delegated children meet no rule. */
function rulesOf(deps: HabitRuleDeps, warn: DialectProblem, payload: ToolExecutionPayload, call: ToolCall): GateRules | undefined {
  if (call.name !== 'memory_store' && call.name !== QUESTION_TOOL) return undefined
  const session = payload.agent?.session
  if (session === undefined || session.header.origin === 'subagent') return undefined
  const route = sessionRoute(session)
  return {
    rules: [habitAskFirst(habitTalkOf(session.deriveMessages() as readonly DerivedMessage[]))],
    face: NATIVE_FACE,
    origin: originOf(dialectNames(dialectService(deps.ctx, warn), payload.agent, route, warn) !== undefined, route),
  }
}

/** Install the rule on `tools/pre-execute` through the gate; the disposer takes it out. Throws only when the host refuses the registration. */
export function installHabitRule(deps: HabitRuleDeps): () => void {
  const warn = dialectWarner('memory')
  return installRuleGate(deps.ctx, {
    row: 'memory',
    prepend: false,
    rules: (payload, call) => rulesOf(deps, warn, payload, call),
    journal: (record, payload) => deps.journal(record, cwdOf(payload)),
    ...(deps.flush === undefined ? {} : { flush: deps.flush }),
    ...(deps.health === undefined ? {} : { health: deps.health }),
  })
}
