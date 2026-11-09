/**
 * What an agent proposes and how it is made ready for the human (docs/ORCHESTRATION.md
 * §16.15; design §9.3): `prepareProposal` checks the content an agent gave to `rules_propose`
 * against the state of the project, with the same checks the board makes when the human
 * agrees (`validateRule` and the rest of plan.ts), and returns the proposal as it will be
 * stored with a line of plain words saying what it does, the cautions the human is to know,
 * and, for a script, the text the human is shown whole. The proposal has no effect: the
 * person's word writes it (plan.ts `proposal-accept`).
 *
 * Six kinds (`ProposalKind`): `rule` (a rule, which may run a script), `lift`, `switch`,
 * `peak-mode`, `remove` and `repin`. A detector comes with the detector runner and is not
 * proposed yet. Pure but for the one file read a `repin` needs, which the caller gives.
 */
import { createHash } from 'node:crypto'
import { validateScriptAction, type ScriptAction, type ScriptLang } from '../loops/trigger.ts'
import { scriptDetail, scriptTextProblem, type ScriptDetail } from '../loops/script-detail.ts'
import { PEAK_LEVEL_WORDS } from '../shared/peak-mode.ts'
import { RULES_EVENT_TABLE } from './events.ts'
import { effectivePeakMode, parsePeakLevel, signalTypesOf, validateRule, type Condition, type Effect, type Proposal, type ProposalKind, type ProjectState, type Rule, type SignalType } from './model.ts'
import { isRecord } from './entries.ts'

const PROPOSAL_KINDS: readonly ProposalKind[] = ['rule', 'lift', 'switch', 'peak-mode', 'remove', 'repin']
const SCRIPT_SUFFIX: Readonly<Record<ScriptLang, string>> = { pwsh: 'ps1', node: 'mjs', python: 'py', bash: 'sh' }
const SWITCH_NAME = /^(?![rd]-)[a-z][a-z0-9-]{1,40}$/
const MOST_REMOVED = 3
const OPEN_LIMIT = 20

/** The SHA-256 of a text's UTF-8 bytes in lower-case hex: the pin of a script. */
export function sha256Of(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')
}

/** The script a rule is to run is written to `<rules dir>/scripts/<rule id>.<suffix of its language>`, relative to the project and with `/`. */
export function scriptFileFor(rulesDirFromRoot: string, ruleId: string, lang: ScriptLang): string {
  return `${rulesDirFromRoot.replaceAll('\\', '/').replace(/\/+$/, '')}/scripts/${ruleId}.${SCRIPT_SUFFIX[lang]}`
}

/** What the human is shown whole for a proposal that runs or removes something: the script and the cautions, or the list of what is removed. */
export function proposalDetail(proposal: Pick<Proposal, 'kind' | 'body' | 'script' | 'cautions'>): ScriptDetail | undefined {
  if (proposal.script !== undefined) return scriptDetail({ lang: proposal.script.lang, text: proposal.script.text, cautions: proposal.cautions })
  if (proposal.kind !== 'remove') return undefined
  const entries = proposal.body as ReadonlyArray<{ readonly id: string, readonly title: string }>
  const lines = entries.map(entry => `${entry.id} ${entry.title}`)
  return { markdown: `要删的：\n${lines.map(line => `- ${line}`).join('\n')}${proposal.cautions.length === 0 ? '' : `\n注意：${proposal.cautions.join('；')}`}`, mustShow: [...lines, ...proposal.cautions] }
}

// ----------------------------------------------------------- one line of what it does

const EVENT_WORDS: Readonly<Record<string, string>> = {
  'gate.tool-call': '调用工具之前',
  'gate.dispatch': '派活之前',
  'gate.trunk-advance': '主干前进之前',
  'rules.step': '每一步',
}

/** What the call is, as far as the filter says: the writes, the command or the tool, of the roles it names. */
function callWords(filter: Rule['filter']): string {
  const paths = (filter as { writes?: { paths?: unknown } } | undefined)?.writes?.paths
  const command = (filter as { command?: { matches?: unknown } } | undefined)?.command?.matches
  const tools = (filter as { tool?: { in?: unknown } } | undefined)?.tool?.in
  const roles = (filter as { role?: { in?: unknown } } | undefined)?.role?.in
  const who = Array.isArray(roles) ? `${roles.join('、')}的` : ''
  if (Array.isArray(paths)) return `${who}写 ${paths.join('、')} 下的文件之前`
  if (typeof command === 'string') return `${who}运行匹配 ${command} 的命令之前`
  if (Array.isArray(tools)) return `${who}调用 ${tools.join('、')} 之前`
  return `${who}${filter === undefined ? '' : '符合筛选的'}调用工具之前`
}

function conditionWords(condition: Condition | undefined): string {
  if (condition === undefined) return ''
  if ('signal' in condition) return `「${condition.signal}」成立时`
  return '条件成立时'
}

const EFFECT_WORDS: Readonly<Record<Effect, string>> = { block: '拦下', queue: '排队，等条件解除', record: '只记下，不挡', inform: '只告知' }

function actionWords(rule: Pick<Rule, 'when' | 'action'>): string {
  const { action } = rule
  if (action.kind !== 'script') return EFFECT_WORDS[action.kind]
  const { seconds } = gateTiming(action, rule.when.events)
  const name = action.script.file.split('/').at(-1) ?? action.script.file
  return `跑脚本 ${name}：它退出 2 就拦下、3 就排队；${seconds} 秒没答或出错时${action.onError === 'block' ? '拦下' : '放行'}`
}

/** One line saying what a rule does once it is in force, in the words the human reads. */
function describeRule(rule: Pick<Rule, 'when' | 'filter' | 'condition' | 'action'>): string {
  const events = rule.when.events as readonly string[]
  const when = events.length === 1 && events[0] === 'gate.tool-call' ? callWords(rule.filter) : events.map(event => EVENT_WORDS[event] ?? event).join('或')
  const lead = [conditionWords(rule.condition), when].filter(part => part !== '').join('，')
  return `${lead}，${actionWords(rule)}`
}

// ----------------------------------------------------------------- making a proposal

export interface PrepareContext {
  readonly state: ProjectState
  /** The rules directory relative to the project root (`docs/rules`). */
  readonly rulesDirFromRoot: string
  /** The moment the proposal is made; a rule's time to live is measured from it. */
  readonly now: Date
  /** Where the proposal is put to the human. */
  readonly via: 'graph' | 'board'
  readonly proposedBy: { readonly sessionId: string, readonly agentId: string }
  /** The id for the proposal; the engine refuses a taken one and the caller draws another. */
  readonly id: string
  /** The text of a project file as the board reads it now, for `repin`; undefined when it is not there. */
  readonly readScript: (file: string) => string | undefined
}

export type Prepared =
  | { readonly ok: true, readonly proposal: Omit<Proposal, 'status' | 'at'> }
  | { readonly ok: false, readonly field: string, readonly message: string }

const invalid = (field: string, message: string): Prepared => ({ ok: false, field, message })

const FIELDS = ['kind', 'body', 'reason', 'replaces']

/** The rules of the project in force: the ids and what they run, which the limits of a new rule count. */
function activeRules(state: ProjectState): Rule[] {
  return Object.values(state.rules ?? {}).filter(rule => rule.status === 'active')
}

function ruleProposal(body: Record<string, unknown>, reason: string, context: PrepareContext): Prepared | { readonly rule: Record<string, unknown>, readonly script?: Proposal['script'] } {
  const action = body.action
  let script: Proposal['script'] | undefined
  let stored: Record<string, unknown> = { ...body }
  if (isRecord(action) && action.kind === 'script') {
    const { text, lang } = action
    if (typeof lang !== 'string' || !Object.hasOwn(SCRIPT_SUFFIX, lang)) return invalid('body.action.lang', `lang is one of ${Object.keys(SCRIPT_SUFFIX).join(', ')}`)
    const problem = scriptTextProblem(text)
    if (problem !== undefined) return invalid('body.action.text', problem)
    if (typeof body.id !== 'string') return invalid('body.id', 'the rule needs an id (r-<name>)')
    const extra = Object.keys(action).find(key => !['kind', 'text', 'lang', 'timeoutSeconds', 'onError'].includes(key))
    if (extra !== undefined) return invalid(`body.action.${extra}`, 'a script action is {kind, text, lang, timeoutSeconds?, onError?}')
    const file = scriptFileFor(context.rulesDirFromRoot, body.id, lang as ScriptLang)
    const sha256 = sha256Of(text as string)
    script = {
      text: text as string,
      sha256,
      file,
      lang: lang as ScriptLang,
      ...(typeof action.timeoutSeconds === 'number' ? { timeoutSeconds: action.timeoutSeconds } : {}),
      ...(action.onError === 'allow' || action.onError === 'block' ? { onError: action.onError } : {}),
    }
    stored = { ...body, action: { kind: 'script', script: { file, sha256, lang }, ...(script.timeoutSeconds === undefined ? {} : { timeoutSeconds: script.timeoutSeconds }), ...(script.onError === undefined ? {} : { onError: script.onError }) } }
  }
  if (stored.reason === undefined) stored = { ...stored, reason }
  const existing = activeRules(context.state)
  const issues = validateRule(stored, { now: context.now, signals: signalTypesOf(context.state.signals), existing })
  const issue = issues[0]
  if (issue !== undefined) return invalid(`body.${issue.path}`, issue.message)
  if (typeof stored.id === 'string' && existing.some(rule => rule.id === stored.id)) return invalid('body.id', `rule ${stored.id} is in force already: lift it first, or propose another id`)
  return { rule: stored, ...(script === undefined ? {} : { script }) }
}

/** The timeout and the failure setting the judgement gives a script rule: the event that blocks on failure wins, as in judge.ts. */
function gateTiming(action: ScriptAction, events: readonly string[]): { readonly seconds: number, readonly onError: 'allow' | 'block' } {
  const timings = events.map(event => validateScriptAction(action, { purpose: 'gate', ...(RULES_EVENT_TABLE.get(event)?.gateOnErrorDefault === undefined ? {} : { gateOnErrorDefault: RULES_EVENT_TABLE.get(event)!.gateOnErrorDefault! }) }))
  const chosen = timings.find(entry => entry.ok && entry.timing.onError === 'block') ?? timings[0]
  return chosen?.ok === true ? { seconds: chosen.timing.timeoutSeconds, onError: chosen.timing.onError ?? 'allow' } : { seconds: 0, onError: 'allow' }
}

/** What the human is to know about a script rule besides its text: where it is, the timeout, what a failure does, how often it runs, and where it runs today. */
function scriptCautions(rule: Pick<Rule, 'when' | 'filter' | 'condition' | 'action' | 'onUnknown'>, file: string): string[] {
  const { action } = rule
  if (action.kind !== 'script') return []
  const events = rule.when.events as readonly string[]
  const { seconds, onError } = gateTiming(action, events)
  const failure = onError === 'block' ? '拦下' : '放行'
  const cautions = [`脚本在 ${file}`, `超过 ${seconds} 秒算没答，按${failure}处理${action.onError === undefined ? '（默认）' : ''}`, `出错时也${failure}`]
  const filter = rule.filter as Record<string, unknown> | undefined
  const narrow = filter !== undefined && ['tool', 'command', 'writes'].some(key => filter[key] !== undefined)
  if (!narrow && events.includes('gate.tool-call')) {
    const rolesOrModels = filter !== undefined && ['role', 'model'].some(key => filter[key] !== undefined)
    cautions.push(rolesOrModels ? '符合筛选的会话的每一次工具调用之前都会跑它' : '这个项目每个会话（含主 Agent）的每一次工具调用之前都会跑它')
  }
  if (rule.onUnknown === 'apply') cautions.push('读不到信号时这条规则一直按成立处理')
  cautions.push('现在只有命令行和仓库脚本的自查会跑它，会话里的工具调用还不跑脚本，按没批准处理')
  return cautions
}

function liftProposal(body: unknown, context: PrepareContext): Prepared {
  const id = isRecord(body) ? body.id : undefined
  if (!isRecord(body) || typeof id !== 'string' || Object.keys(body).length !== 1) return invalid('body', 'body is {id}: the rule to lift')
  const rule = context.state.rules?.[id]
  if (rule === undefined || rule.status !== 'active') return invalid('body.id', id.startsWith('builtin:') ? `${id} is in code and cannot be lifted here` : `there is no rule ${id} in force`)
  return { ok: true, proposal: { id: context.id, kind: 'lift', body: { id }, describe: `解除规则 ${id}（${rule.title}）`, cautions: [], reason: '', via: context.via, proposedBy: context.proposedBy } }
}

function switchProposal(body: unknown, context: PrepareContext): Prepared {
  if (!isRecord(body)) return invalid('body', 'body is {name, type, description?}')
  const extra = Object.keys(body).find(key => !['name', 'type', 'description'].includes(key))
  if (extra !== undefined) return invalid(`body.${extra}`, 'body is {name, type, description?}')
  const { name, type, description } = body
  if (typeof name !== 'string' || !SWITCH_NAME.test(name) || name === 'glm-peak') return invalid('body.name', 'a switch name is lower case letters, digits and hyphens, not starting with r- or d-, and not glm-peak')
  if (context.state.signals?.[name] !== undefined) return invalid('body.name', `the project has a signal ${name} already`)
  const kind = isRecord(type) ? type.kind : undefined
  const sound = (isRecord(type) && kind === 'boolean' && Object.keys(type).length === 1)
    || (isRecord(type) && kind === 'enum' && Array.isArray(type.values) && type.values.length >= 2 && type.values.every(value => typeof value === 'string' && value !== '') && Object.keys(type).length === 2)
  if (!sound) return invalid('body.type', 'a switch is {kind: "boolean"} or {kind: "enum", values: [two or more words]}')
  if (description !== undefined && !(typeof description === 'string' && description.length >= 1 && description.length <= 200)) return invalid('body.description', 'description is a sentence of 1 to 200 characters')
  const words = (type as SignalType).kind === 'boolean' ? '开着或关着' : `取 ${((type as { values: string[] }).values).join('、')} 之一`
  return {
    ok: true,
    proposal: { id: context.id, kind: 'switch', body: { name, type, ...(description === undefined ? {} : { description }) }, describe: `新增开关「${name}」（${words}）；规则可以读它，你用 /rules on 或 off 设值`, cautions: [], reason: '', via: context.via, proposedBy: context.proposedBy },
  }
}

function peakProposal(body: unknown, context: PrepareContext): Prepared {
  const level = isRecord(body) && Object.keys(body).length === 1 && typeof body.level === 'string' ? parsePeakLevel(body.level) : undefined
  if (level === undefined) return invalid('body', `body is {level}: ${Object.keys(PEAK_LEVEL_WORDS).join(', ')}`)
  if (effectivePeakMode(context.state).level === level) return invalid('body.level', `the peak mode is ${level} now`)
  return { ok: true, proposal: { id: context.id, kind: 'peak-mode', body: { level }, describe: `高峰模式改成「${PEAK_LEVEL_WORDS[level].name}」`, cautions: [], reason: '', via: context.via, proposedBy: context.proposedBy } }
}

function removeProposal(body: unknown, context: PrepareContext): Prepared {
  if (!Array.isArray(body) || body.length < 1 || body.length > MOST_REMOVED) return invalid('body', `body is a list of 1 to ${MOST_REMOVED} entries, each {id}`)
  const entries: Array<{ readonly id: string, readonly title: string }> = []
  for (const [index, entry] of body.entries()) {
    const id = isRecord(entry) ? entry.id : undefined
    if (typeof id !== 'string') return invalid(`body[${index}]`, 'each entry is {id}')
    const rule = context.state.rules?.[id]
    if (rule === undefined) return invalid(`body[${index}].id`, `there is no rule ${id}`)
    if (entries.some(held => held.id === id)) return invalid(`body[${index}].id`, `${id} is listed twice`)
    entries.push({ id, title: rule.title })
  }
  return { ok: true, proposal: { id: context.id, kind: 'remove', body: entries, describe: `删除 ${entries.length} 条规则：${entries.map(entry => entry.title).join('、')}`, cautions: [], reason: '', via: context.via, proposedBy: context.proposedBy } }
}

function repinProposal(body: unknown, context: PrepareContext): Prepared {
  const id = isRecord(body) && Object.keys(body).length === 1 ? body.id : undefined
  if (typeof id !== 'string') return invalid('body', 'body is {id}: the rule whose script the human has to read again')
  const rule = context.state.rules?.[id]
  if (rule === undefined || rule.status !== 'active' || rule.action.kind !== 'script') return invalid('body.id', `rule ${id} is not in force with a script`)
  const ref = rule.action.script
  const text = context.readScript(ref.file)
  if (text === undefined) return invalid('body.id', `the script file ${ref.file} is not in the project`)
  const problem = scriptTextProblem(text)
  if (problem !== undefined) return invalid('body.id', problem)
  const sha256 = sha256Of(text)
  const pin = context.state.scripts?.[id]
  if (sha256 === ref.sha256 && pin?.approvedAt !== undefined && pin.sha256 === sha256) return invalid('body.id', `the script of ${id} is the one the human approved: there is nothing to approve again`)
  const script = { text, sha256, file: ref.file, lang: ref.lang, ...(rule.action.timeoutSeconds === undefined ? {} : { timeoutSeconds: rule.action.timeoutSeconds }), ...(rule.action.onError === undefined ? {} : { onError: rule.action.onError }) }
  return {
    ok: true,
    proposal: { id: context.id, kind: 'repin', body: { id }, script, describe: `让规则 ${id} 跑你现在看到的这一份脚本（${ref.file}）`, cautions: scriptCautions(rule, ref.file), reason: '', via: context.via, proposedBy: context.proposedBy },
  }
}

/**
 * Check what an agent gave `rules_propose` and make the proposal of it. `input` is `{kind, body, reason, replaces?}`;
 * the checks name the field to correct. A `rule` is validated whole (`validateRule`) with its script's file and hash
 * filled in; what is proposed does nothing until the person agrees.
 */
export function prepareProposal(input: unknown, context: PrepareContext): Prepared {
  if (!isRecord(input)) return invalid('input', 'rules_propose takes {kind, body, reason, replaces?}')
  const extra = Object.keys(input).find(key => !FIELDS.includes(key))
  if (extra !== undefined) {
    return invalid(extra, ['summary', 'background', 'crux', 'skip', 'set', 'why', 'ifSet', 'ifSkip', 'counter'].includes(extra)
      ? 'put the question in propose_to_human with attach; rules_propose takes only the content of the proposal'
      : `${extra} is not a field of rules_propose: {kind, body, reason, replaces?}`)
  }
  const { kind, body, reason, replaces } = input
  if (typeof kind !== 'string' || !(PROPOSAL_KINDS as readonly string[]).includes(kind)) {
    return invalid('kind', kind === 'detector' ? 'detector proposals come with the detector runner and cannot be made yet' : `kind is one of ${PROPOSAL_KINDS.join(', ')}`)
  }
  if (typeof reason !== 'string' || reason.trim() === '' || [...reason].length > 400) return invalid('reason', 'reason is why you propose it, 1 to 400 characters')
  if (replaces !== undefined) {
    if (typeof replaces !== 'string' || context.state.proposals?.[replaces]?.status !== 'open') return invalid('replaces', 'replaces is the id of an open proposal')
  }
  const open = Object.values(context.state.proposals ?? {}).filter(proposal => proposal.status === 'open').length
  if (open >= OPEN_LIMIT && replaces === undefined) return invalid('input', `${open} proposals are open: the human has not decided them; do not add more`)

  let made: Prepared
  if (kind === 'rule') {
    if (!isRecord(body)) return invalid('body', 'body is the rule: {id, title, scope, when, filter?, condition?, action, lifetime}')
    const prepared = ruleProposal(body, reason, context)
    if ('ok' in prepared) return prepared
    const rule = prepared.rule as unknown as Rule
    made = {
      ok: true,
      proposal: {
        id: context.id,
        kind: 'rule',
        body: prepared.rule,
        ...(prepared.script === undefined ? {} : { script: prepared.script }),
        describe: describeRule(rule),
        cautions: prepared.script === undefined ? (rule.onUnknown === 'apply' ? ['读不到信号时这条规则一直按成立处理'] : []) : scriptCautions(rule, prepared.script.file),
        reason: '',
        via: context.via,
        proposedBy: context.proposedBy,
      },
    }
  }
  else if (kind === 'lift') made = liftProposal(body, context)
  else if (kind === 'switch') made = switchProposal(body, context)
  else if (kind === 'peak-mode') made = peakProposal(body, context)
  else if (kind === 'remove') made = removeProposal(body, context)
  else made = repinProposal(body, context)
  if (!made.ok) return made
  return { ok: true, proposal: { ...made.proposal, reason, ...(replaces === undefined ? {} : { replaces }) } }
}
