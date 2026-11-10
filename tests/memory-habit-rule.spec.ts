/**
 * The memory row's code rule habit-ask-first (project graph node
 * m5-habit-rule; M5 design §3.8): a habit put to the person on a question
 * card and a preference whose relay only agrees to the agent's question are
 * denied through the gate, each denial a line of the violation journal of
 * the session's project with the rule id and a correction that names
 * memory_habit; what the person says in their own words, unasked, is stored
 * as before; and a lift in the project's lift record stops the rule. On the
 * fake rc.3 host with the memory row over real temporary directories.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { hasHabitWord } from '../src/memory/habit-words.ts'
import { HABIT_ASK_FIRST, habitTalkOf } from '../src/memory/habit-rule.ts'
import { journalFile } from '../src/memory/storage.ts'
import type { DerivedMessage, ToolFinalResult } from '../src/shared/dsh-min.ts'
import { execTool } from './fake-rc3.ts'
import { withRow, type Row } from './memory-row-host.ts'
import { skipIfTempInsideGit } from './temp-outside-git.ts'

const skip = skipIfTempInsideGit()

const person = (text: string): DerivedMessage => ({ role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
const assistant = (text: string): DerivedMessage => ({ role: 'assistant', content: [{ type: 'text', text }], source: { kind: 'model' } })

const QUESTION = '以后提交说明都写成英文，好吗？'
const feedback = (relay: string, name = 'commit-in-english') => ({
  name,
  type: 'feedback',
  scope: 'all',
  description: 'Write commit messages in English',
  body: 'Commit messages stay in English.\n**Why:** the person said so.',
  relay,
})
const card = (question: string) => ({ questions: [{ id: 'q1', question, options: [{ label: '好' }, { label: '不用' }] }] })

/** The violation journal of the session's project (the memory row's project directory), waiting for `expected` lines. */
async function violations(row: Row, expected: number): Promise<Array<Record<string, unknown>>> {
  const file = join(row.project, 'audit', 'violations.jsonl')
  const read = (): Array<Record<string, unknown>> => existsSync(file)
    ? readFileSync(file, 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as Record<string, unknown>)
    : []
  for (let waited = 0; waited < 3_000 && read().length < expected; waited += 25) await new Promise(resolve => setTimeout(resolve, 25))
  await new Promise(resolve => setTimeout(resolve, 40))
  return read()
}

const textOf = (result: ToolFinalResult): string => result.content.map(block => block.text ?? '').join('\n')
const deniedByRule = (result: ToolFinalResult): boolean => result.isError && textOf(result).includes(`Rule ${HABIT_ASK_FIRST}`)

test('the habit words: Chinese by substring, English by whole word', () => {
  for (const text of ['以后都这样吗？', '要不要记住这个习惯？', 'Should I remember that?', 'From now on, tabs?']) assert.equal(hasHabitWord(text), true, text)
  for (const text of ['先跑测试吗？', 'Which branch?', 'remembered? no: rememberable']) assert.equal(hasHabitWord(text), false, text)
})

test('the talk the rule reads: the assistant message right before the person\'s latest one, when it asks something', () => {
  assert.deepEqual(habitTalkOf([person('任务'), assistant(QUESTION), person('好')]), { asked: QUESTION })
  assert.deepEqual(habitTalkOf([person('任务'), assistant('改好了。'), person('好')]), {}, 'a report that asks nothing is no question')
  assert.deepEqual(habitTalkOf([person('以后提交说明都写成英文')]), {}, 'nothing before the first message')
  assert.deepEqual(habitTalkOf([assistant(QUESTION), person('好'), { role: 'user', content: [{ type: 'text', text: 'notice' }], source: { kind: 'user', form: 'notice' } }]), { asked: QUESTION }, 'a notice is not the person')
})

test('a habit question on a question card is denied with the rule id, journaled, and the correction names memory_habit ask; a card about something else passes the rule', { skip }, async () => {
  await withRow(async (row) => {
    const exec = execTool(row.runtime)
    const denied = await exec('ask_user_question', card('要不要记住：以后提交说明都写成英文？'))
    assert.ok(deniedByRule(denied), textOf(denied))
    assert.ok(textOf(denied).includes('Right path: Call memory_habit with action "ask"'), textOf(denied))
    const other = await exec('ask_user_question', card('先跑测试还是先改文档？'))
    assert.ok(!deniedByRule(other), textOf(other))
    const lines = await violations(row, 1)
    assert.equal(lines.length, 1)
    assert.deepEqual([lines[0]?.rule, lines[0]?.tool], [HABIT_ASK_FIRST, 'ask_user_question'])
    assert.ok(String(lines[0]?.correction).includes('memory_habit'))
  })
})

test('a preference whose relay only says yes, or repeats the agent\'s question, is denied and nothing is stored', { skip }, async () => {
  await withRow(async (row) => {
    const exec = execTool(row.runtime)
    row.runtime.history.push(person('把提交说明改一下'), assistant(QUESTION), person('好，以后提交说明都写成英文'))
    const yes = await exec('memory_store', feedback('好'))
    assert.ok(deniedByRule(yes), textOf(yes))
    assert.ok(textOf(yes).includes('which only says yes'))
    const echo = await exec('memory_store', feedback('以后提交说明都写成英文'))
    assert.ok(deniedByRule(echo), textOf(echo))
    assert.ok(textOf(echo).includes('repeats the question you asked'))
    assert.ok(!existsSync(journalFile(row.userDir)), 'nothing was stored')
    const lines = await violations(row, 2)
    assert.deepEqual(lines.map(line => [line.rule, line.tool]), [[HABIT_ASK_FIRST, 'memory_store'], [HABIT_ASK_FIRST, 'memory_store']])
  })
})

test('what the person says unasked is stored as before: a first message, and a reply that says something the agent did not ask', { skip }, async () => {
  await withRow(async (row) => {
    const exec = execTool(row.runtime)
    row.runtime.history.push(person('以后提交说明都写成英文'))
    const stated = await exec('memory_store', feedback('以后提交说明都写成英文'))
    assert.equal(stated.isError, false, textOf(stated))
    row.runtime.history.push(assistant('要先跑测试吗？'), person('跑吧。另外汇报只写结论'))
    const aside = await exec('memory_store', { ...feedback('汇报只写结论', 'reports-conclusion-only'), description: 'Reports carry only the conclusion' })
    assert.equal(aside.isError, false, textOf(aside))
    const habit = await exec('memory_habit', { action: 'ask', name: 'tabs-not-spaces', scope: 'all', description: 'Indent with tabs', body: 'Tabs.\n**Why:** guessed.', question: '以后缩进都用制表符，好吗？' })
    assert.ok(!deniedByRule(habit), 'memory_habit is the right path and meets no rule')
    assert.deepEqual(await violations(row, 0), [])
  })
})

test('a lift in the project\'s lift record stops the rule: the card and the plain yes pass it', { skip }, async () => {
  await withRow(async (row) => {
    mkdirSync(join(row.work, '.llm'), { recursive: true })
    mkdirSync(join(row.work, 'docs', 'guard'), { recursive: true })
    writeFileSync(join(row.work, 'docs', 'guard', 'lifts.jsonl'), `${JSON.stringify({ at: '2026-11-05T09:00:00Z', rule: HABIT_ASK_FIRST, action: 'lift', via: 'chat', words: '习惯那条先别拦了' })}\n`)
    const exec = execTool(row.runtime)
    row.runtime.history.push(assistant(QUESTION), person('好'))
    assert.ok(!deniedByRule(await exec('ask_user_question', card('要不要记住这个习惯？'))))
    const yes = await exec('memory_store', feedback('好'))
    assert.equal(yes.isError, false, textOf(yes))
    assert.deepEqual(await violations(row, 0), [])
  })
})
