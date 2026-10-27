import { apply } from '../src/glm-prompt/index.ts'
const listeners = {}
const ctx = {
  systemPrompt: { section: () => () => {}, context: () => () => {} },
  tools: { register: (def, o) => { console.log('register', def.name); return () => {} }, restrict: (f) => { console.log('restrict', JSON.stringify(f)); return () => {} }, schemas: () => [], executable: () => undefined },
  on: (event, listener) => { listeners[event] = listener; return () => {} },
}
apply(ctx)
const agentCtx = {
  systemPrompt: { section: () => () => {}, context: () => () => {} },
  tools: { register: () => () => {}, restrict: (f) => { console.log('scoped restrict', JSON.stringify(f)); return () => {} }, schemas: () => [], executable: () => undefined },
  on: (event, listener) => { console.log('scoped on:', event); listeners['scoped:' + event] = listener; return () => {} },
}
let provider
const agent = { id: 'a1', ctx: agentCtx, model: { current: () => ({ provider }) } }
provider = undefined
console.log('--- created (unbound)')
await listeners['agent/created']({ agent })
console.log('--- pre-step scoped (glm)')
await listeners['scoped:agent/pre-step']({ modelSelection: { provider: 'glm', model: 'glm-5.3' } }, async () => { console.log('next called') })
