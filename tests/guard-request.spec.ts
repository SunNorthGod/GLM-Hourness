/**
 * The request channel of m4-request-card (design §5) at L2: the
 * request_exception body's check order (§5.3) with its refusal codes, the
 * plan text's per-fact variants pinned verbatim (§5.4's table), the reply
 * reading (§5.5: only the client's own whole approval word grants, anything
 * else is named and the request stays), the grants (§5.6: matched once,
 * re-checked at use time, backed up, voided when the target moved), the
 * worker seam outsideDenial's F19 judgment and peekGrant, the lapsed scan
 * (§5.5 step 6), and the morning report's 申报 line (§5.8). The F20 example
 * goes through the parameter checks and renderPlan like a real refusal. The
 * desk's dependencies stand over an in-memory file system and a movable
 * clock; nothing here writes outside temp directories.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JsonValue } from '../src/shared/json.ts'
import { codePointCount } from '../src/graph/proposal.ts'
import { proposalLineRefusal } from '../src/graph/plan-text.ts'
import { GRANT_TTL_MS, GrantBook, RefusalBook, REQUEST_TTL_MS, REFUSAL_LIMIT, REQUEST_EXAMPLE, normalizeWords, signatureOf } from '../src/guard/request.ts'
import { QUESTION, REQUEST_ASK_MESSAGE, REQUESTS_SERVICE, REQUEST_SOURCE, createRequestDesk, requestsService } from '../src/guard/request-service.ts'
import type { GrantPreparation, RequestDesk, RequestDeskDeps, RequestDeskFs, RequestExceptionResult, RequestsService, StepInput } from '../src/guard/request-service.ts'
import { morningReport } from '../src/workflow/morning-report.ts'
import type { AgentLike, DerivedMessage, UserNotice } from '../src/shared/dsh-min.ts'
import type { GuardRecord, RequestRecord } from '../src/guard/records.ts'

/** A file the fake fs holds. */
interface FakeFile { readonly size: number, readonly mtimeMs: number, readonly content: string }

/** The desk's dependencies over an in-memory file system and a movable clock. The root carries a `.llm` directory, so projectOf reads it as a project. */
function deskOf(): {
  desk: RequestDesk
  deps: RequestDeskDeps
  root: string
  files: Map<string, FakeFile>
  records: Array<{ record: GuardRecord, cwd: string | undefined }>
  at: () => Date
  setClock: (iso: string) => void
  woken: UserNotice[]
} {
  const root = mkdtempSync(join(tmpdir(), 'guard-req-'))
  mkdirSync(join(root, '.llm'), { recursive: true })
  const files = new Map<string, FakeFile>()
  const keyed = (path: string): string => path.replaceAll('\\', '/').toLowerCase()
  const fs: RequestDeskFs = {
    stat: path => {
      const file = files.get(keyed(path))
      return file === undefined
        ? Promise.reject(Object.assign(new Error(`no ${path}`), { code: 'ENOENT' }))
        : Promise.resolve({ size: file.size, mtimeMs: file.mtimeMs })
    },
    mkdir: () => Promise.resolve(undefined),
    copyFile: (src, dest) => {
      const file = files.get(keyed(src))
      if (file === undefined) return Promise.reject(Object.assign(new Error(`no ${src}`), { code: 'ENOENT' }))
      files.set(keyed(dest), { ...file })
      return Promise.resolve()
    },
    writeFile: (path, text) => {
      files.set(keyed(path), { size: text.length, mtimeMs: 0, content: text })
      return Promise.resolve()
    },
  }
  const records: Array<{ record: GuardRecord, cwd: string | undefined }> = []
  const woken: UserNotice[] = []
  let clock = '2026-11-04T09:00:00Z'
  const deps: RequestDeskDeps = {
    refusals: new RefusalBook(),
    grants: new GrantBook(),
    now: () => new Date(clock),
    journal: (record, cwd) => { records.push({ record, cwd }) },
    dispatchRootOf: agent => agent === undefined ? undefined : agent.id,
    projectHomeOf: () => root,
    rootsOf: () => [root],
    focusTitleOf: () => Promise.resolve(undefined),
    wake: (_agent, notice) => { woken.push(notice) },
    note: () => {},
    warn: () => {},
    fs,
  }
  return { desk: createRequestDesk(deps), deps, root, files, records, at: () => new Date(clock), setClock: (iso: string) => { clock = iso }, woken }
}

/** An agent whose session history holds the messages given. */
function agentOf(messages: readonly DerivedMessage[], options: { readonly id?: string, readonly session?: string, readonly origin?: 'subagent' } = {}): AgentLike {
  const name = options.session ?? 'session-1'
  const header = { id: name, ...(options.origin === undefined ? {} : { origin: options.origin }) }
  return { id: options.id ?? 'root-1', session: { id: name, header, deriveMessages: () => messages, requestHeader: () => undefined } }
}

/** One standing scenario over an existing three-byte todo.md: the denial registered, the filing agent ready. */
function standingOf(environment: ReturnType<typeof deskOf>): { readonly target: string, readonly ref: string, readonly signature: string, readonly agent: AgentLike } {
  const target = join(environment.root, 'outside', 'todo.md')
  environment.files.set(target.replaceAll('\\', '/').toLowerCase(), { size: 3, mtimeMs: 1, content: 'abc' })
  const { ref, signature } = denyOf(environment, target)
  return { target, ref, signature, agent: agentOf([]) }
}

const person = (text: string, rpcId?: string): DerivedMessage => {
  const source: Record<string, unknown> = { kind: 'user' }
  if (rpcId !== undefined) source.rpcId = rpcId
  return { role: 'user', content: [{ type: 'text', text }], source }
}

const assistant = (text: string): DerivedMessage => ({ role: 'assistant', content: [{ type: 'text', text }] })

/** A notice's text: the content blocks joined (a UserNotice carries no flat text). */
function noticeText(notice: UserNotice | undefined): string {
  return notice?.content?.map(block => block.text ?? '').join('') ?? ''
}

/** The denial the scenarios start from: a workspace-containment refusal of one write. */
function denyOf(environment: ReturnType<typeof deskOf>, target: string, args: Record<string, unknown> = { file_path: target, content: 'hello' }): { readonly ref: string, readonly signature: string } {
  return environment.desk.registerDenied({
    agent: agentOf([]),
    call: { name: 'write', arguments: args as JsonValue },
    base: environment.root,
    target,
    rule: 'workspace-containment',
    via: 'root',
  })
}

/** The requestException result narrowed to the ask shape. */
function askOf(result: RequestExceptionResult): Extract<RequestExceptionResult, { outcome: 'ask' }> {
  assert.equal(result.outcome, 'ask', JSON.stringify(result))
  return result as Extract<RequestExceptionResult, { outcome: 'ask' }>
}

const errorOf = (result: RequestExceptionResult): { code: string, message: string, hint: string } => {
  assert.equal('code' in result, true, JSON.stringify(result))
  return result as { code: string, message: string, hint: string }
}

// ------------------------------------------------------- §5.3: the check order

test('request_exception refuses by the check order: a subagent or no agent, an extra field, a bad ref, sentences over the limits', async () => {
  const environment = deskOf()
  const { ref } = denyOf(environment, join(environment.root, 'outside', 'todo.md'))
  const sub = errorOf(await environment.desk.requestException({ ref, purpose: 'p', reversibility: 'r', alternatives: 'a' }, agentOf([], { origin: 'subagent' }), environment.root))
  assert.equal(sub.code, 'forbidden')
  assert.ok(sub.hint.includes('a subagent cannot ask the human'))
  const nobody = errorOf(await environment.desk.requestException({ ref, purpose: 'p', reversibility: 'r', alternatives: 'a' }, undefined, environment.root))
  assert.equal(nobody.code, 'forbidden')
  const agent = agentOf([])
  const extra = errorOf(await environment.desk.requestException({ ref, purpose: 'p', reversibility: 'r', alternatives: 'a', why: 'x' }, agent, environment.root))
  assert.equal(extra.code, 'invalid')
  const badRef = errorOf(await environment.desk.requestException({ ref: 'R-NOPE', purpose: 'p', reversibility: 'r', alternatives: 'a' }, agent, environment.root))
  assert.equal(badRef.code, 'invalid')
  const long = errorOf(await environment.desk.requestException({ ref, purpose: '长'.repeat(81), reversibility: 'r', alternatives: 'a' }, agent, environment.root))
  assert.equal(long.code, 'invalid')
  assert.ok(long.hint.includes('one short sentence'))
  const missing = errorOf(await environment.desk.requestException({ ref, purpose: 'p', reversibility: 'r' }, agent, environment.root))
  assert.equal(missing.code, 'invalid')
  rmSync(environment.root, { recursive: true, force: true })
})

test('request_exception: the refusal must be in this process, of this dispatch chain, and younger than 2 hours (§5.3 step 3)', async () => {
  const environment = deskOf()
  const target = join(environment.root, 'outside', 'todo.md')
  const { ref } = denyOf(environment, target)
  const agent = agentOf([])
  const unknown = errorOf(await environment.desk.requestException({ ref: 'r-00000000', purpose: 'p', reversibility: 'r', alternatives: 'a' }, agent, environment.root))
  assert.equal(unknown.code, 'not_found')
  assert.ok(unknown.hint.includes('resubmit the call that was denied'))
  // Another dispatch chain's root: forbidden with the ask-in-your-reply hint.
  const { ref: other } = environment.desk.registerDenied({ agent: agentOf([], { id: 'other-root' }), call: { name: 'write', arguments: { file_path: target, content: 'x' } }, base: environment.root, target, rule: 'workspace-containment', via: 'root' })
  const alien = errorOf(await environment.desk.requestException({ ref: other, purpose: 'p', reversibility: 'r', alternatives: 'a' }, agent, environment.root))
  assert.equal(alien.code, 'forbidden')
  assert.ok(alien.hint.includes('ask the human in your reply'))
  // Older than the 2h window: expired, hint as not_found.
  environment.setClock(new Date(Date.parse('2026-11-04T09:00:00Z') + REQUEST_TTL_MS + 1).toISOString())
  const old = errorOf(await environment.desk.requestException({ ref, purpose: 'p', reversibility: 'r', alternatives: 'a' }, agent, environment.root))
  assert.equal(old.code, 'expired')
  rmSync(environment.root, { recursive: true, force: true })
})

test('request_exception: a standing grant answers approved at once with the tool and arguments (§5.3 step 4); another ref while one waits is busy; the same ref replays the same text (§5.3 step 5)', async () => {
  const environment = deskOf()
  const { target, ref, signature, agent } = standingOf(environment)
  // The grant stands: the second request_exception answers approved without asking.
  environment.desk.books.grants.add({ ref, rule: 'workspace-containment', signature, root: agent.id, facts: { exists: true, size: 3, mtimeMs: 1 }, decidedAt: 0, expiresAt: Date.parse('2026-11-04T10:00:00Z'), words: '可以' })
  const standing = await environment.desk.requestException({ ref, purpose: 'p', reversibility: 'r', alternatives: 'a' }, agent, environment.root)
  assert.equal(standing.outcome, 'approved')
  const approved = standing as Extract<RequestExceptionResult, { outcome: 'approved' }>
  assert.deepEqual([approved.tool, approved.ref], ['write', ref])
  assert.deepEqual(approved.arguments, { file_path: target, content: 'hello' })
  assert.equal(approved.expires, '2026-11-04T10:00:00.000Z')
  // An expired standing grant falls through to a fresh ask.
  environment.setClock('2026-11-04T11:00:00Z')
  const filed = askOf(await environment.desk.requestException({ ref, purpose: '把今天的待办追加进去', reversibility: '旧文件先备份', alternatives: 'none' }, agent, environment.root))
  assert.equal(filed.text.endsWith(QUESTION), true)
  // The same ref again replays the same text and lines; a different ref is busy.
  const replay = askOf(await environment.desk.requestException({ ref, purpose: '把今天的待办追加进去', reversibility: '旧文件先备份', alternatives: 'none' }, agent, environment.root))
  assert.deepEqual([replay.text, replay.lines.title], [filed.text, filed.lines.title])
  const { ref: second } = denyOf(environment, join(environment.root, 'outside', 'other.md'))
  const busy = errorOf(await environment.desk.requestException({ ref: second, purpose: 'p', reversibility: 'r', alternatives: 'a' }, agent, environment.root))
  assert.equal(busy.code, 'busy')
  rmSync(environment.root, { recursive: true, force: true })
})

test('request_exception: a proposal since the last client message is busy (§5.3 step 5a), an unreadable target is unavailable, and a plan that cannot render degrades without registering (§5.3 step 7, F18)', async () => {
  const environment = deskOf()
  const target = join(environment.root, 'outside', 'todo.md')
  const { ref } = denyOf(environment, target)
  const agent = agentOf([
    person('上一句话', 'rpc-1'),
    { role: 'assistant', content: [{ type: 'tool-call', name: 'DeferredToolCall', arguments: JSON.stringify({ name: 'propose_to_human', arguments: '{}' }), id: 'c1' }] },
    { role: 'tool', toolCallId: 'c1', content: [{ type: 'text', text: '{"outcome":"asked"}' }] },
  ])
  const proposal = errorOf(await environment.desk.requestException({ ref, purpose: 'p', reversibility: 'r', alternatives: 'a' }, agent, environment.root))
  assert.equal(proposal.code, 'busy')
  assert.ok(proposal.hint.includes('end this reply with the proposals you showed'))
  // The target cannot be read (EACCES): unavailable with the code in the hint.
  const hostile: RequestDeskFs = {
    stat: () => Promise.reject(Object.assign(new Error('denied'), { code: 'EACCES' })),
    mkdir: () => Promise.resolve(undefined),
    copyFile: () => Promise.resolve(),
    writeFile: () => Promise.resolve(),
  }
  const second = deskOf()
  const { ref: ref2 } = denyOf(second, join(second.root, 'outside', 'todo.md'))
  const desk2 = createRequestDesk({ ...second.deps, fs: hostile })
  const unreadable = errorOf(await desk2.requestException({ ref: ref2, purpose: 'p', reversibility: 'r', alternatives: 'a' }, agentOf([]), second.root))
  assert.equal(unreadable.code, 'unavailable')
  assert.ok(unreadable.hint.includes('the target cannot be read (EACCES)'))
  // A target whose display path overflows the 80-code-point title: renderPlan
  // throws, the tool answers unavailable, nothing is registered or journaled.
  const long = join(environment.root, 'outside', `${'名'.repeat(100)}.md`)
  const { ref: ref3 } = denyOf(environment, long, { file_path: long, content: 'x' })
  const before = environment.records.length
  const unwritable = errorOf(await environment.desk.requestException({ ref: ref3, purpose: 'p', reversibility: 'r', alternatives: 'a' }, agentOf([]), environment.root))
  assert.equal(unwritable.code, 'unavailable')
  assert.equal(environment.records.length, before, 'no asked record on the degraded answer')
  rmSync(environment.root, { recursive: true, force: true })
  rmSync(second.root, { recursive: true, force: true })
})

test('the plan text of the standard case (§5.4), verbatim, and the ask result carries title plus the four lines', async () => {
  const environment = deskOf()
  const target = join(environment.root, 'outside', 'todo.md')
  environment.files.set(target.replaceAll('\\', '/').toLowerCase(), { size: 2140, mtimeMs: Date.parse('2026-10-30T01:12:00Z'), content: '# 10-30 待办\n买牛奶' })
  const { ref } = denyOf(environment, target)
  const agent = agentOf([])
  const filed = askOf(await environment.desk.requestException({ ref, purpose: '把今天的待办追加进去', reversibility: '没有别的文件', alternatives: '写进工作区，但你要在原处看' }, agent, environment.root))
  // The title carries the resolved path; the temp root reads over 60 characters, so displayPath keeps the drive and the last two segments.
  assert.equal(filed.lines.title.startsWith('要改工作区外的文件：'), true, filed.lines.title)
  assert.ok(filed.lines.title.endsWith('outside/todo.md') && filed.lines.title.includes('…'), filed.lines.title)
  assert.deepEqual(filed.lines.background, 'agent 要**改工作区外的文件**，系统先拦下了')
  assert.deepEqual(filed.lines.proposal, '**放行这一次**，旧内容先备份，改坏了能找回')
  assert.deepEqual(filed.lines.doubt, '这个文件若**不归这件活管**，就不该放行')
  assert.deepEqual(filed.lines.notTaken, '**不放行**，文件不动，agent 换在工作区里做')
  assert.equal(codePointCount(filed.text) <= 2000, true)
  assert.ok(filed.text.includes('- agent 说的目的：「把今天的待办追加进去」'))
  assert.ok(filed.text.includes('- agent 说还会碰到：「没有别的文件」'))
  assert.ok(filed.text.includes('- agent 试过的替代：「写进工作区，但你要在原处看」'))
  assert.ok(filed.text.includes('- 文件现在：已存在，2140 字节'), filed.text)
  assert.ok(filed.text.includes('- 将写入的内容'))
  assert.ok(environment.records.some(record => (record.record as RequestRecord).outcome === 'asked'))
  assert.equal(filed.message, REQUEST_ASK_MESSAGE)
  rmSync(environment.root, { recursive: true, force: true })
})

test('the plan text variants follow the facts (§5.4\'s table): a new file, an oversized one, no project home, an edit, checker-config and scratch-only', async () => {
  const environment = deskOf()
  let filed = 0
  const outside = (name: string): string => join(environment.root, 'outside', name)
  // Each filing runs in its own session: the desk holds one open request per session.
  const file = async (rule: string, args: Record<string, unknown>, target: string, facts?: FakeFile): Promise<{ proposal: string, title: string, doubt: string, text: string }> => {
    filed += 1
    const agent = agentOf([], { id: `root-${filed}`, session: `s-${filed}` })
    const registered = environment.desk.registerDenied({ agent, call: { name: typeof args.old_string === 'string' ? 'edit' : 'write', arguments: args as JsonValue }, base: environment.root, target, rule, via: 'root' })
    if (facts !== undefined) environment.files.set(target.replaceAll('\\', '/').toLowerCase(), facts)
    const result = askOf(await environment.desk.requestException({ ref: registered.ref, purpose: 'p', reversibility: 'r', alternatives: 'a' }, agent, environment.root))
    return { proposal: result.lines.proposal, title: result.lines.title, doubt: result.lines.doubt, text: result.text }
  }
  const fresh = await file('workspace-containment', { file_path: outside('new.md'), content: 'x' }, outside('new.md'))
  assert.equal(fresh.title.startsWith('要在工作区外新建文件：') && fresh.title.endsWith('outside/new.md'), true, fresh.title)
  assert.deepEqual(fresh.proposal, '**放行这一次**，是新文件，删掉就能撤回')
  const big = await file('workspace-containment', { file_path: outside('big.md'), content: 'x' }, outside('big.md'), { size: 11 * 1024 * 1024, mtimeMs: 1, content: 'x' })
  assert.deepEqual(big.proposal, '放行这一次，但**旧内容找不回来**')
  assert.ok(big.title.startsWith('要改工作区外的文件：'))
  assert.ok(big.text.includes('大于 10 MiB，不备份'), big.text)
  // No project home: the desk reads undefined, the proposal says the old content cannot be recovered.
  const homeless = deskOf()
  const homelessTarget = join(homeless.root, 'outside', 'x.md')
  homeless.files.set(homelessTarget.replaceAll('\\', '/').toLowerCase(), { size: 5, mtimeMs: 1, content: 'hello' })
  const registered = homeless.desk.registerDenied({ agent: agentOf([], { id: 'root-h', session: 's-h' }), call: { name: 'write', arguments: { file_path: homelessTarget, content: 'x' } }, base: homeless.root, target: homelessTarget, rule: 'workspace-containment', via: 'root' })
  const withoutHome = createRequestDesk({ ...homeless.deps, projectHomeOf: () => undefined })
  const homelessAsk = askOf(await withoutHome.requestException({ ref: registered.ref, purpose: 'p', reversibility: 'r', alternatives: 'a' }, agentOf([], { id: 'root-h', session: 's-h' }), homeless.root))
  assert.deepEqual(homelessAsk.lines.proposal, '放行这一次，但**旧内容找不回来**')
  assert.ok(homelessAsk.text.includes('没有项目目录，不备份'))
  rmSync(homeless.root, { recursive: true, force: true })
  // The edit names its one place and shows the before and after.
  const edit = await file('workspace-containment', { file_path: outside('doc.md'), old_string: '旧的一行', new_string: '新的一行' }, outside('doc.md'), { size: 5, mtimeMs: 1, content: '旧的一行' })
  assert.deepEqual(edit.proposal, '**放行这一次**，改 1 处，旧内容先备份')
  assert.ok(edit.text.includes('改动前后（各前 5 行）'), edit.text)
  const checker = await file('checker-config', { file_path: outside('eslint.config.js'), content: 'x' }, outside('eslint.config.js'))
  assert.equal(checker.title.startsWith('要改检查器的配置：') && checker.title.endsWith('eslint.config.js'), true, checker.title)
  assert.deepEqual(checker.doubt, '这次改动若**让检查变松**，就不该放行')
  const scratch = await file('scratch-only', { file_path: outside('tool.py'), content: 'x' }, outside('tool.py'))
  assert.equal(scratch.title.startsWith('要在项目里新建脚本：') && scratch.title.endsWith('tool.py'), true, scratch.title)
  assert.deepEqual(scratch.doubt, '这个脚本若**只用一次**，就该放草稿区')
  rmSync(environment.root, { recursive: true, force: true })
})

// ------------------------------------------------------------ §5.5: the reply

test('the reply reading: the client message 可以 approves after the text was the last thing shown, grants once within 30 minutes', async () => {
  const environment = deskOf()
  const { target, ref, signature, agent } = standingOf(environment)
  const filed = askOf(await environment.desk.requestException({ ref, purpose: 'p', reversibility: 'r', alternatives: 'a' }, agent, environment.root))
  const step = (admitted: readonly DerivedMessage[], history: readonly DerivedMessage[], stepNumber = 1): StepInput => ({ admitted, history, step: stepNumber, session: agent.session as never, agent })
  // The human had not just read the text (the last assistant message carries a tool call): not-shown, the request stays.
  const notShown = await environment.desk.readReply(step([person('可以', 'rpc-2')], [assistant('前言'), { role: 'assistant', content: [{ type: 'tool-call', name: 'write', id: 'c9', arguments: '{}' }] }]))
  assert.ok(noticeText(notShown).includes('was not approved'))
  assert.equal(environment.desk.books.grants.get(ref), undefined)
  // The approval: whole word, client message, right after the text.
  const approved = await environment.desk.readReply(step([person('可以', 'rpc-4')], [assistant(`想好了。\n\n${filed.text}`)]))
  assert.ok(noticeText(approved).includes(`The human approved request ${ref}`), noticeText(approved))
  assert.ok(noticeText(approved).includes('Make exactly this call once before'))
  assert.ok(noticeText(approved).includes(JSON.stringify({ tool: 'write', arguments: { file_path: target, content: 'hello' } })))
  const grant = environment.desk.books.grants.get(ref)
  assert.ok(grant !== undefined && grant.signature === signature)
  assert.equal(Math.abs(grant.expiresAt - grant.decidedAt - GRANT_TTL_MS) < 5, true)
  const record = environment.records.at(-1)?.record as RequestRecord
  assert.deepEqual([record.kind, record.ref, record.outcome, record.by, record.via, record.words], ['request', ref, 'approved', 'human', 'chat', '可以'])
  // The request is settled: a second reply reads nothing.
  assert.equal(await environment.desk.readReply(step([person('可以', 'rpc-5')], [])), undefined)
  // A fresh request whose answer is not a whole yes or no: unclear, the confirmation sentence becomes the tail.
  const second = await fileOf(environment, target)
  const unclear = await environment.desk.readReply({ admitted: [person('可以，顺便把 b 也改了', 'rpc-3')], history: [assistant(second.text)], step: 1, session: second.agent.session as never, agent: second.agent })
  assert.ok(noticeText(unclear).includes('not a plain yes or no'))
  assert.ok(environment.records.filter(record => (record.record as RequestRecord).outcome === 'unclear').length === 1)
  rmSync(environment.root, { recursive: true, force: true })
})

/** A fresh denial and filing of one request over the same target, each in its own session. */
let filedCount = 0
async function fileOf(environment: ReturnType<typeof deskOf>, target: string): Promise<{ ref: string, text: string, agent: AgentLike }> {
  filedCount += 1
  const agent = agentOf([], { id: `root-${filedCount}`, session: `s-${filedCount}` })
  environment.files.set(target.replaceAll('\\', '/').toLowerCase(), { size: 3, mtimeMs: 1, content: 'abc' })
  const { ref } = environment.desk.registerDenied({ agent, call: { name: 'write', arguments: { file_path: target, content: 'hello' } }, base: environment.root, target, rule: 'workspace-containment', via: 'root' })
  const filed = askOf(await environment.desk.requestException({ ref, purpose: 'p', reversibility: 'r', alternatives: 'a' }, agent, environment.root))
  return { ref, text: filed.text, agent }
}

test('the reply reading: declined, closed after three unclear replies, not-client, still waits on the first step only, and the clock expiry', async () => {
  const environment = deskOf()
  const target = join(environment.root, 'outside', 'todo.md')
  const step = (filing: { readonly agent: AgentLike }, admitted: readonly DerivedMessage[], history: readonly DerivedMessage[], stepNumber = 1): StepInput => ({ admitted, history, step: stepNumber, session: filing.agent.session as never, agent: filing.agent })
  // Declined.
  const first = await fileOf(environment, target)
  const declined = await environment.desk.readReply(step(first, [person('不行', 'rpc-1')], [assistant(first.text)]))
  assert.ok(noticeText(declined).includes('The human declined request'))
  assert.ok(environment.records.some(record => (record.record as RequestRecord).outcome === 'declined'))
  // Unclear twice (the confirmation sentence becomes the tail), the third closes.
  const second = await fileOf(environment, target)
  const confirm = await environment.desk.readReply(step(second, [person('嗯……', 'rpc-2')], [assistant(second.text)]))
  assert.ok(noticeText(confirm).includes('放行这一次写 todo.md，可以吗'), noticeText(confirm))
  const tail = /unchanged: (.+)$/m.exec(noticeText(confirm))?.[1] ?? ''
  assert.ok(noticeText(await environment.desk.readReply(step(second, [person('再说吧', 'rpc-3')], [assistant(tail)]))).includes('not a plain yes or no'))
  const closed = await environment.desk.readReply(step(second, [person('嗯', 'rpc-4')], [assistant(tail)]))
  assert.ok(noticeText(closed).includes('was closed'))
  assert.ok(environment.records.some(record => (record.record as RequestRecord).outcome === 'closed'))
  // Not from the client (a headless task's message): named, the request stays.
  const third = await fileOf(environment, target)
  const notClient = await environment.desk.readReply(step(third, [person('可以')], [assistant(third.text)]))
  assert.ok(noticeText(notClient).includes('did not come through the DSH client'))
  assert.ok(environment.records.some(record => (record.record as RequestRecord).outcome === 'not-client'))
  // Still waits on the turn's first step; a later step says nothing.
  const fourth = await fileOf(environment, target)
  const still = await environment.desk.readReply(step(fourth, [], [assistant(fourth.text)], 1))
  assert.ok(noticeText(still).includes('still waits for the human'))
  assert.equal(await environment.desk.readReply(step(fourth, [], [assistant(fourth.text)], 2)), undefined)
  // The clock expiry, with the closing wake to the filing agent.
  environment.setClock(new Date(Date.parse('2026-11-04T09:00:00Z') + REQUEST_TTL_MS + 1).toISOString())
  const expired = await environment.desk.readReply(step(fourth, [], [assistant(fourth.text)]))
  assert.ok(noticeText(expired).includes('expired: the human did not answer within 2 hours'))
  assert.equal(environment.woken.length, 1)
  assert.equal(environment.woken[0]?.source.kind, REQUEST_SOURCE)
  assert.ok(environment.records.some(record => (record.record as RequestRecord).outcome === 'expired'))
  rmSync(environment.root, { recursive: true, force: true })
})

test('lapseOrphans names the asks of a restart that no closing notice settled, once per agent (§5.5 step 6, F15)', () => {
  const environment = deskOf()
  const askResult = { role: 'tool', content: [{ type: 'text', text: '{"outcome":"ask","ref":"r-1a2b3c4d","text":"…"}' }] } as unknown as DerivedMessage
  const settled = { role: 'user', source: { kind: REQUEST_SOURCE, request: { ref: 'r-1a2b3c4d', outcome: 'approved' } } } as unknown as DerivedMessage
  const settledAgent = agentOf([askResult, settled])
  assert.equal(environment.desk.lapseOrphans(settledAgent, [askResult, settled]), undefined, 'the ask with a closing notice is not lapsed')
  const orphanHistory = [{ role: 'tool', content: [{ type: 'text', text: '{"outcome":"ask","ref":"r-9z8y7x6w"}' }] } as unknown as DerivedMessage]
  const orphanAgent = agentOf(orphanHistory)
  const lapsed = environment.desk.lapseOrphans(orphanAgent, orphanHistory)
  assert.ok(noticeText(lapsed).includes('Request r-9z8y7x6w lapsed'))
  assert.equal((lapsed?.source.request as { outcome: string }).outcome, 'lapsed')
  assert.equal(environment.desk.lapseOrphans(orphanAgent, []), undefined, 'the scan runs once per agent')
  rmSync(environment.root, { recursive: true, force: true })
})

// ------------------------------------------------------------ §5.6: the grants

test('prepareGrant: the facts re-check voids a moved target, an unchanged target is backed up once, the backup path rides on the grant', async () => {
  const environment = deskOf()
  const agent = agentOf([])
  const target = join(environment.root, 'outside', 'todo.md')
  environment.files.set(target.replaceAll('\\', '/').toLowerCase(), { size: 2140, mtimeMs: 1000, content: 'a'.repeat(2140) })
  const { ref, signature } = denyOf(environment, target)
  const grant = { ref, rule: 'workspace-containment', signature, root: agent.id, facts: { exists: true, size: 2140, mtimeMs: 1000 }, decidedAt: 0, expiresAt: Date.now() + GRANT_TTL_MS, words: '可以' }
  environment.desk.books.grants.add(grant)
  const call = { name: 'write', arguments: { file_path: target, content: 'hello' } }
  const ready = await environment.desk.prepareGrant(call, environment.root, grant, environment.root)
  assert.deepEqual(ready, { kind: 'ready' } satisfies GrantPreparation)
  const backup = [...environment.files.keys()].find(key => key.endsWith(`/${ref}.before`))
  assert.ok(backup !== undefined, [...environment.files.keys()].join('、'))
  assert.deepEqual(environment.files.get(backup), { size: 2140, mtimeMs: 1000, content: 'a'.repeat(2140) })
  assert.ok(grant.backupPath !== undefined)
  // The target moved after the approval: void with what changed.
  environment.files.set(target.replaceAll('\\', '/').toLowerCase(), { size: 2141, mtimeMs: 1000, content: `${'a'.repeat(2140)}b` })
  const voided = await environment.desk.prepareGrant(call, environment.root, grant, environment.root)
  assert.deepEqual(voided, { kind: 'void', reason: 'its size changed' } satisfies GrantPreparation)
  assert.equal(environment.desk.books.grants.get(ref), undefined)
  rmSync(environment.root, { recursive: true, force: true })
})

test('GrantBook: matched once — in use hides it, release gives it back, consume spends it; expired grants are dropped by find', () => {
  const grants = new GrantBook()
  const entry = { ref: 'r-1a2b3c4d', rule: 'workspace-containment', signature: 'sig', root: 'root', facts: { exists: false }, decidedAt: Date.now(), expiresAt: Date.now() + GRANT_TTL_MS, words: '可以' }
  grants.add(entry)
  assert.equal(grants.find('sig', 'root')?.ref, 'r-1a2b3c4d')
  grants.markInUse('r-1a2b3c4d')
  assert.equal(grants.find('sig', 'root'), undefined, 'a parallel identical call does not also pass')
  grants.release('r-1a2b3c4d')
  assert.equal(grants.find('sig', 'root')?.ref, 'r-1a2b3c4d')
  assert.equal(grants.find('sig', 'other-root'), undefined, 'grants match by dispatch root')
  grants.consume('r-1a2b3c4d')
  assert.equal(grants.find('sig', 'root'), undefined)
  assert.equal(grants.get('r-1a2b3c4d'), undefined)
  grants.add({ ...entry, ref: 'r-11111111', expiresAt: Date.now() - 1 })
  assert.equal(grants.find('sig', 'root'), undefined, 'the expired grant is dropped')
  assert.equal(grants.get('r-11111111'), undefined)
})

test('signatureOf: the resolved target is part of the signature, one changed character is another call', () => {
  const base = 'C:/work/app'
  const same = signatureOf('write', { file_path: 'notes/todo.md', content: 'a' }, base)
  assert.equal(signatureOf('write', { file_path: 'C:/work/app/notes/todo.md', content: 'a' }, undefined), same, 'relative and absolute spellings of one target')
  assert.notEqual(signatureOf('write', { file_path: 'notes/todo.md', content: 'b' }, base), same)
  assert.notEqual(signatureOf('edit', { file_path: 'notes/todo.md', content: 'a' }, base), same)
})

test('RefusalBook keeps at most 64 refusals, the oldest out', () => {
  const refusals = new RefusalBook()
  const entry = (ref: string): Parameters<RefusalBook['add']>[0] => ({ ref, rule: 'workspace-containment', tool: 'write', args: {}, signature: 's', target: 't', at: 0, agentId: undefined, sessionId: undefined, dispatchRoot: 'root', via: 'root' })
  for (let index = 0; index < REFUSAL_LIMIT; index++) refusals.add(entry(`r-${`${index}`.padStart(8, '0')}`))
  assert.ok(refusals.get('r-00000000') !== undefined)
  refusals.add(entry('r-99999999'))
  assert.equal(refusals.get('r-00000000'), undefined, 'the oldest left first')
  assert.ok(refusals.get('r-99999999') !== undefined)
})

// ------------------------------------------------- §5.9: the worker seam (F19)

test('outsideDenial registers only a target outside the project, and peekGrant reads a matching grant without spending it', () => {
  const environment = deskOf()
  const agent = agentOf([], { id: 'worker-1' })
  const inside = join(environment.root, 'src', 'a.ts')
  assert.equal(environment.desk.service.outsideDenial({ agent, tool: 'write', args: { file_path: inside, content: 'x' }, base: environment.root }), undefined, 'a target in the project is not asked about')
  const outside = join(environment.root, '..', 'stray', 'note.md')
  const denial = environment.desk.service.outsideDenial({ agent, tool: 'write', args: { file_path: outside, content: 'x' }, base: environment.root })
  assert.ok(denial !== undefined, 'a target outside the project gets a ref')
  assert.match(denial.ref, /^r-[0-9a-z]{8}$/)
  assert.ok(denial.exception.includes('ask_main') && denial.exception.includes(denial.ref))
  assert.equal(environment.desk.service.outsideDenial({ agent, tool: 'write', args: { command: 'x' }, base: environment.root }), undefined, 'a call without a target argument')
  assert.equal(environment.desk.service.openRequests('session-1').length, 0)
  // peekGrant: true while a matching grant stands, false without one, and the grant stays.
  assert.equal(environment.desk.service.peekGrant({ agent, tool: 'write', args: { file_path: outside, content: 'x' }, base: environment.root }), false)
  const refusal = environment.desk.books.refusals.get(denial.ref)
  assert.ok(refusal !== undefined && refusal.via === 'worker' && refusal.rule === 'workspace-containment')
  environment.desk.books.grants.add({ ref: denial.ref, rule: refusal.rule, signature: refusal.signature, root: agent.id, facts: { exists: false }, decidedAt: Date.now(), expiresAt: Date.now() + GRANT_TTL_MS, words: '可以' })
  assert.equal(environment.desk.service.peekGrant({ agent, tool: 'write', args: { file_path: outside, content: 'x' }, base: environment.root }), true)
  assert.equal(environment.desk.books.grants.find(refusal.signature, agent.id)?.ref, denial.ref, 'peeking does not spend')
  rmSync(environment.root, { recursive: true, force: true })
})

test('requestsService reads the row\'s service through ctx, and undefined when absent or malformed', () => {
  const service = { outsideDenial: () => undefined, peekGrant: () => false, openRequests: () => [] } satisfies RequestsService
  const ctx = { get: (name: string): unknown => name === REQUESTS_SERVICE ? service : undefined }
  assert.equal(requestsService(ctx) === service, true)
  const problems: string[] = []
  assert.equal(requestsService({ get: () => undefined }, message => { problems.push(message) }), undefined)
  assert.equal(requestsService({ get: () => ({ peekGrant: 'no' }) }, message => { problems.push(message) }), undefined)
  assert.deepEqual(problems, [`service "${REQUESTS_SERVICE}" has the wrong shape`])
})

// ------------------------------------------------------- §5.3 F20: the example

test('the F20 example passes the parameter checks and renders a qualified plan text with a real refusal', async () => {
  const call = JSON.parse(REQUEST_EXAMPLE.replace(/^request_exception /, '')) as { ref: string, purpose: string, reversibility: string, alternatives: string }
  assert.match(call.ref, /^r-[0-9a-z]{8}$/)
  assert.ok(codePointCount(call.purpose) <= 80 && codePointCount(call.reversibility) <= 60 && codePointCount(call.alternatives) <= 60)
  const environment = deskOf()
  const target = join(environment.root, 'outside', 'playlist.json')
  environment.files.set(target.replaceAll('\\', '/').toLowerCase(), { size: 400, mtimeMs: Date.parse('2026-10-30T01:12:00Z'), content: '{"tracks":[]}' })
  const { ref } = denyOf(environment, target, { file_path: target, content: '{"tracks":["新歌"]}' })
  const agent = agentOf([])
  const filed = askOf(await environment.desk.requestException({ ...call, ref }, agent, environment.root))
  // The example's three sentences ride into the 附 quotes verbatim.
  assert.ok(filed.text.includes('「把今天新添的曲目追加到播放器读的歌单文件」'))
  assert.ok(filed.text.includes('「旧文件先备份，改坏了能找回；不碰别的文件」'))
  assert.ok(filed.text.includes('「试过写在工作区里，但播放器只读它自己的目录」'))
  // The title and the four lines the result carried are all qualified lines (§5.4's rules).
  for (const field of ['background', 'proposal', 'doubt', 'notTaken'] as const) {
    assert.equal(proposalLineRefusal(field, filed.lines[field]), undefined, `${field}: ${filed.lines[field]}`)
  }
  assert.ok(filed.lines.title.length > 0 && !filed.lines.title.includes('\n') && codePointCount(filed.lines.title) <= 80)
  rmSync(environment.root, { recursive: true, force: true })
})

// ------------------------------------------------------------- §5.8: the report

test('the morning report counts the period\'s filings by outcome, with the grants beside them (§5.8)', () => {
  const request = (ref: string, outcome: RequestRecord['outcome']): RequestRecord => ({ kind: 'request', at: '2026-11-04T06:00:00Z', rule: 'workspace-containment', tool: 'write', ref, outcome })
  const violations: Array<Record<string, unknown>> = [
    { ...request('r-1a2b3c4d', 'asked'), target: 'C:/x' },
    { ...request('r-1a2b3c4d', 'approved'), words: '可以' },
    { kind: 'grant', at: '2026-11-04T06:01:00Z', rule: 'workspace-containment', tool: 'write', ref: 'r-1a2b3c4d', signature: 's', call: { tool: 'write' } },
    { ...request('r-2b3c4d5e', 'asked') },
    { ...request('r-2b3c4d5e', 'declined'), words: '不行' },
    { kind: 'grant-void', at: '2026-11-04T06:02:00Z', rule: 'workspace-containment', tool: 'write', ref: 'r-1a2b3c4d', reason: 'its size changed' },
    { ...request('r-3c4d5e6f', 'asked') },
    { ...request('r-3c4d5e6f', 'expired') },
    { ...request('r-4d5e6f7a', 'asked') },
    { ...request('r-4d5e6f7a', 'closed') },
    { rule: 'scratch-only', tool: 'write', correction: 'x' },
  ]
  const report = morningReport({
    period: 'p',
    decisions: [],
    violations: violations as never[],
    usage: [],
    asks: { waiting: { count: 0 }, agentOwn: 0, decided: { person: 0, inChat: 0, agent: 0 } },
    offsetMinutes: 480,
  })
  assert.ok(report.includes('- 申报 4 次：放行 1（已用 1、作废 1）、不放行 1、没答 2'), report)
  const quiet = morningReport({
    period: 'p',
    decisions: [],
    violations: [{ rule: 'scratch-only', tool: 'write', correction: 'x' } as never],
    usage: [],
    asks: { waiting: { count: 0 }, agentOwn: 0, decided: { person: 0, inChat: 0, agent: 0 } },
    offsetMinutes: 480,
  })
  assert.ok(!quiet.includes('申报'), quiet)
})

test('normalizeWords folds the punctuation and quotes the reply reading strips (§5.5 step 4)', () => {
  assert.equal(normalizeWords('  可以。 '), '可以')
  assert.equal(normalizeWords('「行」！'), '行')
  assert.equal(normalizeWords('OK'), 'ok')
  assert.equal(normalizeWords('好的'), '好的')
})
