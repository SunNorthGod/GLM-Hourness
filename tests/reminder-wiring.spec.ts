import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../src/glm-prompt/index.ts'
import type { UserNotice } from '../src/shared/dsh-min.ts'
import { fakeRuntime } from './fake-rc3.ts'

/** A runtime with the dialect row applied and the agent created on the given route. */
async function harness(model: string) {
  const rt = fakeRuntime()
  apply(rt.ctx)
  await rt.create()
  await rt.assemble({ model }) // rc.3: the step's route reaches the row through the assembly
  const notices: UserNotice[] = []
  return {
    rt,
    notices,
    async call(name: string, args?: unknown, parent?: unknown) {
      const decision = await rt.postExecute({ name, ...(args === undefined ? {} : { arguments: args }), ...(parent === undefined ? {} : { parent }) })
      for (const notice of (decision.additionalContexts ?? []) as UserNotice[]) notices.push(notice)
    },
  }
}

test('reminder fires on a GLM route after 10 non-todo calls and rides additionalContexts', async () => {
  const h = await harness('glm-5.3')
  for (let i = 0; i < 9; i++) await h.call('Read', { file_path: 'a' })
  assert.equal(h.notices.length, 0)
  await h.call('Read', { file_path: 'a' })
  assert.equal(h.notices.length, 1)
  assert.equal(h.notices[0]!.source.kind, 'glm-todo-reminder')
  assert.ok(h.notices[0]!.content[0]!.text.includes("hasn't been used"))
})

test('reminder notices carry the createUserMessage identity the inbox keys on', async () => {
  const h = await harness('glm-5.3')
  for (let i = 0; i < 20; i++) await h.call('Read', { file_path: 'a' })
  assert.equal(h.notices.length, 2)
  for (const notice of h.notices) {
    assert.equal(notice.role, 'user')
    assert.equal(typeof notice.id, 'string')
    assert.ok(Object.isFrozen(notice) && Object.isFrozen(notice.content[0]))
  }
  // The inbox rejects a second pending message with the same id.
  assert.notEqual(h.notices[0]!.id, h.notices[1]!.id)
})

test('TodoWrite resets the counter and carries the todo echo', async () => {
  const h = await harness('glm-5.3')
  for (let i = 0; i < 9; i++) await h.call('Read')
  await h.call('TodoWrite', { todos: [{ content: 'a', status: 'in_progress', priority: 'high' }] })
  for (let i = 0; i < 9; i++) await h.call('Read')
  assert.equal(h.notices.length, 0)
  await h.call('Read')
  assert.equal(h.notices.length, 1)
  assert.ok(h.notices[0]!.content[0]!.text.includes('1. [in_progress] a'))
})

test('non-GLM routes never get dialect reminders', async () => {
  const h = await harness('deepseek-flash')
  for (let i = 0; i < 15; i++) await h.call('Read')
  assert.equal(h.notices.length, 0)
})

test('transport sub-dispatches do not count toward the reminder', async () => {
  const h = await harness('glm-5.3')
  for (let i = 0; i < 15; i++) await h.call('read', undefined, 'run_code:1')
  assert.equal(h.notices.length, 0)
})
