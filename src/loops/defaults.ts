/**
 * The four entries the loop row brings itself (docs/ORCHESTRATION.md §18.5; loop
 * board design 0.6 §5.2): they are the loop row's data, shown on the page as it
 * is and not changeable (`d-defaults-readonly`). Nothing here belongs to another
 * row: the events of the first entry are M7's, the event of the other two is the
 * GLM channel's, and an entry whose event nobody declares is listed greyed
 * until someone does (src/loops/registry.ts).
 *
 * The words to the main agent are English; the first line of each message,
 * `Loop board: <id> (default of <plugin>).`, is written when the message is
 * delivered, so the texts here begin with the second line. A `{name}` is filled
 * from the payload of the event. The hand-over itself (`Contribution`) is built
 * by the row (src/loops/index.ts), whose runner executes the one harness action
 * (src/loops/peak.ts); this file is only the entries' data.
 */
import type { LoopEntryDefinition } from './model.ts'

/** Dependency files by name; a name without a slash counts in any directory. */
export const DEPENDENCY_FILES: readonly string[] = [
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'yarn.lock',
  'requirements.txt',
  'pyproject.toml',
  'poetry.lock',
  'uv.lock',
  'Pipfile.lock',
  'Cargo.toml',
  'Cargo.lock',
  'go.mod',
  'go.sum',
  'Gemfile.lock',
  'composer.lock',
]

const PEAK_BASIS = 'GLM 通道的高峰时刻与规则板的高峰模式'

/** The loop row's peak-start entry: a `self` entry the rules row does the work of; the board only lists it and records its run (design §5.2, §6.9 item 5). */
export const PEAK_START_ENTRY = 'loops.peak-start'

/** The loop row's own harness action, executed by src/loops/peak.ts (design §6.9 item 4). */
export const PEAK_END_ACTION = 'loops.peak-end'

export const LOOP_DEFAULTS: readonly LoopEntryDefinition[] = [
  {
    id: 'loops.deps-after-merge',
    title: '依赖文件变了之后：查依赖',
    why: '依赖文件一变，依赖里的新问题就可能冒出来，这一项叫主 Agent 查一遍',
    when: { kind: 'event', events: ['hourness.trunk-advanced', 'hourness.outside-advance'] },
    filter: { files: { paths: DEPENDENCY_FILES } },
    action: {
      kind: 'tell-main',
      text: 'Dependency files changed on the main branch ({from}..{to}): {files}. Run the project\'s dependency check (the patrol lines of norm-merge-gate) and report what it found. Put a major-version upgrade to the human with propose_to_human.',
      wake: true,
    },
    limits: { debounceSeconds: 30, maxPerHour: 6 },
  },
  {
    id: 'loops.remind-waiting',
    title: '有事等你太久时：再跟你说一次',
    why: '等你拍板的事拖久了容易忘，这一项隔一阵再提醒你一次',
    when: { kind: 'event', events: ['loops.waiting-on-human'], params: { olderThanHours: 24 } },
    action: {
      kind: 'tell-main',
      text: 'These have waited for the human for more than 24 hours: {items}. Remind the human once, the longest-waiting first and at most three in one reply: say each in one plain line with its title and what you need from the human. Do not open a new question for an item that already has one. Then end your turn.',
      wake: true,
    },
    limits: { debounceSeconds: 60, maxPerHour: 1 },
    quiet: { from: '22:00', to: '08:00' },
  },
  {
    id: PEAK_START_ENTRY,
    title: 'GLM 高峰开始时：按你选的高峰模式收放',
    why: '高峰里 GLM 更费积分，这一项让规则板按你选的档位收放',
    basis: PEAK_BASIS,
    when: { kind: 'event', events: ['channel.peak-changed'] },
    filter: { edge: { in: ['start'] } },
    action: { kind: 'self', does: '规则板定档位与上限，项目编排派活时照上限数', by: 'glm-hourness/rules' },
    limits: { debounceSeconds: 5, maxPerHour: 6 },
  },
  {
    id: PEAK_END_ACTION,
    title: 'GLM 高峰结束时：接上挪开的活',
    why: '高峰里挪开的活要在高峰结束时接上，这一项到点接上并叫醒主 Agent',
    basis: PEAK_BASIS,
    when: { kind: 'event', events: ['channel.peak-changed'] },
    filter: { edge: { in: ['end'] } },
    // The words to the main agent come from the result of the action, not from the entry.
    action: { kind: 'harness', action: PEAK_END_ACTION },
    limits: { debounceSeconds: 5, maxPerHour: 6 },
  },
]

/** The one harness action the loop row runs itself: what happens when a peak ends. */
export const LOOP_ACTIONS: readonly { readonly id: string, readonly title: string }[] = [
  { id: PEAK_END_ACTION, title: '高峰结束时接上挪开的活' },
]
