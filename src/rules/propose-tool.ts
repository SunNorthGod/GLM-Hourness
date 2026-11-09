/**
 * `rules_propose`, the agent's way to ask for a change of the rules (docs/ORCHESTRATION.md
 * §16.15; design §9.3): it records what the human said they want as a proposal in the
 * project's rules board and does nothing else. The proposal holds nobody until the human
 * agrees in the chat: the main agent puts it to them with `propose_to_human` (`attach`) and
 * records their words with `record_human_answer`; the board then writes it as theirs.
 * Any agent may call it; only the main agent can put it to the human, so a sub-agent
 * reports the proposal in its handoff. The tool changes no rule: only the human does.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { projectOf } from '../data/project-root.ts'
import { graphService } from '../graph/service.ts'
import type { AgentLike, ServiceLookup, ToolDefinitionLike } from '../shared/dsh-min.ts'
import { refuse } from '../shared/tool-refusal.ts'
import { callerOf } from './caller.ts'
import { openRulesBoard } from './engine.ts'
import { prepareProposal } from './proposal.ts'
import { readProject } from './repo.ts'
import { rulesPaths, type StoreIo } from './store.ts'

export interface ProposeToolDeps {
  readonly ctx: ServiceLookup
  readonly rulesDir: string
  readonly io?: StoreIo
  readonly now: () => number
}

/**
 * The two examples `rules_propose` carries in its description (design §9.3, `d-agent-examples`): a rule with an action of
 * its own, and a script that blocks, with the script, the event it receives on standard input and what its exit codes
 * mean. The domain is a small website, not the calibration exercises' expense log; everything in them is how the board
 * works already (exit 0, 2, 3; a timeout lets the call through by default; agreeing makes it so).
 */
export const RULES_PROPOSE_EXAMPLES = [
  'Example 1. The human defined the switch release-freeze last week and says "no pushes this week, the site is being redesigned":',
  '{"kind":"rule","reason":"the human said no pushes during the redesign","body":{"id":"r-no-push-freeze","title":"No push while the redesign freeze is on","scope":"project","when":{"kind":"event","events":["gate.tool-call"]},"filter":{"command":{"matches":"^\\\\s*git\\\\s+push\\\\b"}},"condition":{"signal":"release-freeze","is":true},"action":{"kind":"block"},"lifetime":{"kind":"until-lifted"}}}',
  'Example 2. zh.json lost keys last week and the page showed English; you had a sub-agent write this script. It reads the event (JSON) on stdin: {"payload":{"tool","args","command","writes","role","model","session","cwd"}}; exit 0 lets the call run, exit 2 blocks it (the reason goes on stderr), exit 3 queues it; a timeout or a crash lets the call through unless you write onError "block":',
  '{"kind":"rule","reason":"zh.json lost keys last week","body":{"id":"r-locale-keys","title":"Translation files keep the same keys","scope":"project","when":{"kind":"event","events":["gate.tool-call"]},"filter":{"writes":{"paths":["locales/"]}},"action":{"kind":"script","lang":"node","timeoutSeconds":10,"text":"import { readFileSync, existsSync } from \'node:fs\'\\nimport { basename, dirname, join } from \'node:path\'\\nconst { payload } = JSON.parse(readFileSync(0, \'utf8\'))\\nif (typeof payload.args.content !== \'string\') process.exit(0)\\nconst file = join(payload.cwd, payload.writes[0])\\nconst other = join(dirname(file), basename(file) === \'zh.json\' ? \'en.json\' : \'zh.json\')\\nif (!existsSync(other)) process.exit(0)\\nconst keys = (o) => Object.keys(o).sort().join(\',\')\\nif (keys(JSON.parse(payload.args.content)) !== keys(JSON.parse(readFileSync(other, \'utf8\')))) { process.stderr.write(\'keys differ\'); process.exit(2) }\\nprocess.exit(0)\\n"},"lifetime":{"kind":"until-lifted"}}}',
].join('\n')

const DESCRIPTION = [
  'Propose a change of the project\'s rules board: a rule, lifting a rule, a switch, the peak mode, removing rules, or approving a changed script again. It records the proposal and changes nothing: only the human can change rules.',
  'Call it when the human asks for a rule or a change. Main agent: then put the proposal to the human with propose_to_human (kind question, form recommend, attach = the "attach" in the result): one yes-or-no question with your recommendation and reason inside; it takes effect only when the human agrees and you record their words with record_human_answer. Sub-agent: report the proposal id in your handoff; the main agent puts it to the human.',
  'Arguments: kind (rule | lift | switch | peak-mode | remove | repin), body, reason (why, 1 to 400 characters), replaces (an open proposal this one replaces, after the human added to it or turned it down). body: rule = {id r-<name>, title, scope, when, filter?, condition?, action, lifetime} where action is {kind block|queue|record|inform} or {kind script, lang node|pwsh|python|bash, text, timeoutSeconds?, onError?}; lift = {id}; switch = {name, type {kind boolean} or {kind enum, values}, description?}; peak-mode = {level inform|reduce|stop}; remove = [{id}] (1 to 3); repin = {id}.',
  RULES_PROPOSE_EXAMPLES,
].join('\n')

const PARAMETERS = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['rule', 'lift', 'switch', 'peak-mode', 'remove', 'repin'] },
    body: { type: ['object', 'array'] },
    reason: { type: 'string' },
    replaces: { type: 'string' },
  },
  required: ['kind', 'body', 'reason'],
  additionalProperties: false,
}

const OUTPUT_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' }, proposal: { type: 'string' }, describe: { type: 'string' }, cautions: { type: 'array' }, attach: { type: 'string' }, message: { type: 'string' } }, required: ['ok', 'proposal', 'describe', 'cautions', 'attach', 'message'], additionalProperties: false }

const MESSAGES = {
  graph: (attach: string): string => `Put it to the human with propose_to_human (kind question, form recommend, attach ${attach}): one yes-or-no question with your recommendation and reason inside it; the recommendation says what describe says, and the cautions go in the cost, after the question. It takes effect only when the human agrees and you record their words with record_human_answer.`,
  board: (id: string): string => `The project graph is not available: tell the human this proposal as one yes-or-no question and that they can type /rules accept ${id} or /rules reject ${id}.`,
  subagent: (id: string): string => `Report proposal ${id} in your handoff; the main agent puts it to the human.`,
}

const newId = (): string => `p-${randomBytes(4).toString('hex')}`
const TRIES = 3

/** The tool, to register on the host. */
export function rulesProposeTool(deps: ProposeToolDeps): ToolDefinitionLike {
  async function propose(args: unknown, agent: AgentLike | undefined): Promise<Record<string, unknown>> {
    const caller = callerOf(deps.ctx, agent)
    const project = caller.cwd === undefined ? undefined : projectOf(caller.cwd)
    if (caller.cwd === undefined || project === undefined) refuse('invalid', 'this session has no working directory in a project: the rules board has nowhere to keep a proposal', 'work in the project the rule is for')
    const board = openRulesBoard({ projectRoot: project.root, rulesDir: deps.rulesDir, ...(deps.io === undefined ? {} : { io: deps.io }) })
    const settled = await board.settle()
    const state = settled === 'busy' ? readProject(board.paths).state : settled.state
    const via = graphService(deps.ctx)?.dirFor(caller.cwd) === undefined ? 'board' : 'graph'
    const proposedBy = { sessionId: caller.sessionId ?? 'unknown', agentId: agent?.id ?? caller.sessionId ?? 'unknown' }
    const rulesDirFromRoot = relative(project.root, rulesPaths(project.root, deps.rulesDir).rulesDir)
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const made = prepareProposal(args, {
        state,
        rulesDirFromRoot,
        now: new Date(deps.now()),
        via,
        proposedBy,
        id: newId(),
        readScript: (file) => {
          try {
            return readFileSync(join(project.root, ...file.split('/')), 'utf8')
          }
          catch {
            return undefined
          }
        },
      })
      if (!made.ok) refuse('invalid', made.message, `correct ${made.field} and call rules_propose again; nothing was recorded`, made.field)
      const written = await board.apply('llm', { op: 'propose', proposal: made.proposal })
      if (!written.ok) {
        // A taken id is drawn again; anything else is the board's refusal as it is.
        if (written.error.code === 'conflict' && written.error.message.includes('提议编号')) continue
        refuse(written.error.code, written.error.message, written.error.hint ?? 'nothing was recorded; try again in a moment if the board was busy')
      }
      const { proposal } = made
      const attach = `rules:${proposal.id}`
      const subagent = caller.role === 'subagent'
      return {
        ok: true,
        proposal: proposal.id,
        describe: proposal.describe,
        cautions: proposal.cautions,
        attach,
        message: subagent ? MESSAGES.subagent(proposal.id) : via === 'graph' ? MESSAGES.graph(attach) : MESSAGES.board(proposal.id),
      }
    }
    return refuse('busy', 'the board could not give the proposal an id', 'call rules_propose again')
  }

  return {
    name: 'rules_propose',
    description: DESCRIPTION,
    parameters: PARAMETERS,
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (args, exec) => propose(args, (exec as { agent?: AgentLike } | undefined)?.agent),
  }
}
