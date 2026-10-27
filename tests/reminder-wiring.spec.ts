import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../src/glm-prompt/index.ts'
import type { AgentLike, PluginContext, PostExecuteDecision, UserNotice } from '../src/shared/dsh-min.ts'

function harness(): { ctx: PluginContext; agent: AgentLike; notices: UserNotice[] } {
  const notices: UserNotice[] = []
  const listeners = {
    created: [] as Array<(payload: { agent: AgentLike }) => Promise<void> | void>,
    preStep: [] as Array<(payload: unknown, next: () => Promise<void>) => Promise<void>>,
    postExecute: [] as Array<(exec: { name: string, arguments?: unknown, agent?: AgentLike }, result: unknown, next: () => Promise<PostExecuteDecision>) => Promise<PostExecuteDecision>>,
  }
  const ctx: PluginContext = {
    systemPrompt: { section: () => () => {}, context: () => () => {} },
    tools: { register: () => () => {}, restrict: () => () => {}, schemas: () => [], executable: () => undefined },
    on: (event, listener) => {
      if (event === 'agent/created') listeners.created.push(listener as typeof listeners.created[number])
      else if (event === 'agent/pre-step') listeners.preStep.push(listener as typeof listeners.preStep[number])
      else listeners.postExecute.push(listener as typeof listeners.postExecute[number])
      return () => {}
    },
  }
  let provider: string | undefined
  const agent: AgentLike = { id: 'a1', ctx, model: { current: () => ({ provider }) } }
  apply(ctx)
  return {
    ctx,
    agent,
    notices,
    async createAgent(nextProvider?: string) {
      provider = nextProvider
      await listeners.created[0]!({ agent })
    },
    async postExecute(name: string, args?: unknown) {
      const downstream = await listeners.postExecute[0]!({ name, arguments: args, agent }, undefined, async () => ({ kind: 'continue' }))
      for (const notice of (downstream.additionalContexts ?? []) as UserNotice[]) notices.push(notice)
    },
  }
}

test('reminder fires for a glm agent after 10 non-todo calls and rides additionalContexts', async () => {
  const h = harness()
  await h.createAgent('glm')
  for (let i = 0; i < 9; i++) await h.postExecute('Read', { file_path: 'a' })
  assert.equal(h.notices.length, 0)
  await h.postExecute('Read', { file_path: 'a' })
  assert.equal(h.notices.length, 1)
  const notice = h.notices[0]!
  assert.equal(notice.source.kind, 'glm-todo-reminder')
  assert.ok(notice.content[0]!.text.includes("hasn't been used"))
})

test('TodoWrite resets the counter and carries the todo echo', async () => {
  const h = harness()
  await h.createAgent('glm')
  for (let i = 0; i < 9; i++) await h.postExecute('Read')
  await h.postExecute('TodoWrite', { todos: [{ content: 'a', status: 'in_progress', priority: 'high' }] })
  for (let i = 0; i < 9; i++) await h.postExecute('Read')
  assert.equal(h.notices.length, 0)
  await h.postExecute('Read')
  assert.equal(h.notices.length, 1)
  assert.ok(h.notices[0]!.content[0]!.text.includes('1. [in_progress] a'))
})

test('non-glm agents never get dialect reminders', async () => {
  const h = harness()
  await h.createAgent('deepseek')
  for (let i = 0; i < 15; i++) await h.postExecute('Read')
  assert.equal(h.notices.length, 0)
})
