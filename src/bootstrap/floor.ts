/**
 * The draft of the must-review floor, `norm-review-floor` (takeover design
 * 0.6 §5.7). Pure. The main agent proposes it as its own norm under the
 * anchor, edits it to what it reads in the project, and the person agrees
 * to it with the checklist; M7's review and trunk-advance check read it
 * (M7 §3.7.1, §3.8.4).
 *
 * Every acceptance line is one class of change in the person's words, a
 * colon, what it covers, and at its end the judgement forms of M7 §3.8.5 in
 * backticks: `files <path>, …`, `deletes`, `commands <words>, …`,
 * `outside`. A class with paths appears only when the scan found some; the
 * two general classes are always there. Paths are repository-relative with
 * no wildcard (a trailing `/` is a directory), the human part lists at most
 * six, the backticks all of them up to 40, merged into their parent
 * directories past that. The template and the rules hold nothing of any
 * one project.
 */
import { CODE_EXTENSIONS, extensionOf, type ScanResult } from './scan.ts'

const FLOOR_ID = 'norm-review-floor'
const FLOOR_TITLE = '本项目必须全审的改动'
const FLOOR_WHY = '这些改动出错代价大，主 Agent 不能把审查调浅'
export const FLOOR_BODY = '审查深浅由主 Agent 定（全审：更强的模型对照验收逐条看；轻审：只扫改动；不审：只改文档、错字一类），但改动落在下列任一类时由 harness 强制全审，按改动的文件与执行的命令判断，主 Agent 绕不过去。周报统计降档或不审的活后来返工的次数，哪一类返工多就提议加进清单，人点头才改；放松清单要人同意。'

/** The two classes every project has (§5.7, from the person's approved floor of this repository and M7 §13 ①). */
export const FLOOR_GENERAL: readonly string[] = [
  '删东西、推送这类收不回的操作：删文件或分支（清理已合入的除外）、推送、改写提交历史 `deletes` `commands git push, git branch -d, git branch -D, git update-ref -d, git filter-branch, git filter-repo`',
  '改用户配置目录或写到项目目录之外 `outside`',
]

/** The most paths in the backticks of one line, and in its human part (§5.7). */
const FILES_LIMIT = 40
const SHOWN_LIMIT = 6

/** Directories of other people's code or of build output; nothing under them is a floor path. */
const FOREIGN_DIRS = new Set(['vendor', 'third_party', 'reference', 'external', 'generated', 'dist', 'build', 'node_modules'])
/** Directories of tests and documents: a test of the guard is not the guard. */
const SIDE_DIRS = new Set(['tests', 'test', '__tests__', 'spec', 'specs', 'fixtures', 'docs', 'doc'])

const AUTH_WORDS = ['auth', 'security', 'permission', 'acl', 'guard', 'crypto', 'secret']
const DEPLOY_DIRS = new Set(['infra', 'terraform', 'k8s', 'helm'])

/** The answers that feed the draft: the repository paths of `不许碰：` (touch.ts), when the person has given them. */
interface FloorAnswers {
  readonly touch?: readonly string[]
}

interface FloorDraft {
  readonly id: typeof FLOOR_ID
  readonly title: string
  readonly why: string
  readonly body: string
  readonly acceptance: readonly string[]
}

const segmentsOf = (path: string): string[] => path.split('/')
const nameTokens = (name: string): string[] => name.toLowerCase().replace(/\.[^.]*$/, '').split(/[-_.\s]+/).filter(token => token.length > 0)

/** A path the floor may name: repository-relative, no wildcard, no `..`, nothing that would break the backtick list (§3.8.5's `files` form). */
function floorable(path: string): boolean {
  if (path.length === 0 || /[*?[\\,`]/.test(path) || /^[A-Za-z]:/.test(path) || path.startsWith('/') || path !== path.trim()) return false
  return segmentsOf(path.endsWith('/') ? path.slice(0, -1) : path).every(segment => segment.length > 0 && segment !== '.' && segment !== '..')
}

/** Whether a tracked path lies outside other people's code, tests and documents. */
function ownCode(path: string): boolean {
  const dirs = segmentsOf(path).slice(0, -1)
  return !dirs.some(dir => FOREIGN_DIRS.has(dir.toLowerCase()) || SIDE_DIRS.has(dir.toLowerCase()))
}

/**
 * The paths of tracked files and their directories that a word list marks:
 * the shallowest directory whose name has a token starting with one of the
 * words, and code files whose own name does (outside such a directory).
 */
function byNameWords(files: readonly string[], words: readonly string[]): string[] {
  const marks = (name: string): boolean => nameTokens(name).some(token => words.some(word => token.startsWith(word)))
  const out = new Set<string>()
  for (const path of files.filter(ownCode)) {
    const segments = segmentsOf(path)
    const dirIndex = segments.slice(0, -1).findIndex(marks)
    if (dirIndex >= 0) out.add(`${segments.slice(0, dirIndex + 1).join('/')}/`)
    else if (CODE_EXTENSIONS.has(extensionOf(path)) && marks(segments.at(-1) ?? '')) out.add(path)
  }
  return [...out]
}

function dataFormatPaths(files: readonly string[]): string[] {
  const out = new Set<string>()
  for (const path of files.filter(ownCode)) {
    const segments = segmentsOf(path)
    const migrations = segments.slice(0, -1).findIndex(dir => /^migrations?$/i.test(dir))
    const name = segments.at(-1) ?? ''
    if (migrations >= 0) out.add(`${segments.slice(0, migrations + 1).join('/')}/`)
    else if (/^schema\./i.test(name) || /^openapi\./i.test(name) || /\.(?:proto|sql)$/i.test(name)) out.add(path)
  }
  return [...out]
}

function deployPaths(scan: ScanResult, files: readonly string[]): string[] {
  const out = new Set<string>(scan.sources.ci)
  for (const path of files.filter(ownCode)) {
    const segments = segmentsOf(path)
    const dirIndex = segments.slice(0, -1).findIndex(dir => DEPLOY_DIRS.has(dir.toLowerCase()) || /^deploy/i.test(dir))
    const name = segments.at(-1) ?? ''
    if (dirIndex >= 0) out.add(`${segments.slice(0, dirIndex + 1).join('/')}/`)
    else if (/^dockerfile/i.test(name) || /^deploy/i.test(name)) out.add(path)
  }
  return [...out]
}

/** Paths without the ones a listed directory already covers, sorted. */
function withoutCovered(paths: readonly string[]): string[] {
  const unique = [...new Set(paths)].filter(floorable)
  const dirs = unique.filter(path => path.endsWith('/'))
  return unique.filter(path => !dirs.some(dir => dir !== path && path.startsWith(dir))).sort()
}

/** At most `FILES_LIMIT` paths: while there are more, the deepest parent shared by two or more of them takes their place (§5.7). */
export function mergeToLimit(paths: readonly string[], limit = FILES_LIMIT): string[] {
  let current = withoutCovered(paths)
  while (current.length > limit) {
    const parentOf = (path: string): string => {
      const segments = segmentsOf(path.endsWith('/') ? path.slice(0, -1) : path)
      return segments.length <= 1 ? '' : `${segments.slice(0, -1).join('/')}/`
    }
    const groups = new Map<string, number>()
    for (const path of current) {
      const parent = parentOf(path)
      if (parent.length > 0) groups.set(parent, (groups.get(parent) ?? 0) + 1)
    }
    const shared = [...groups.entries()].filter(([, count]) => count >= 2)
    if (shared.length === 0) return current.slice(0, limit)
    shared.sort(([a, countA], [b, countB]) => segmentsOf(b).length - segmentsOf(a).length || countB - countA || a.localeCompare(b))
    const [parent] = shared[0] ?? ['']
    current = withoutCovered([...current.filter(path => parentOf(path) !== parent), parent])
  }
  return current
}

/** One class line: the class, the paths in words (six at most), and the `files` form with all of them. */
function filesLine(label: string, paths: readonly string[]): string | undefined {
  const merged = mergeToLimit(paths)
  if (merged.length === 0) return undefined
  const shown = merged.slice(0, SHOWN_LIMIT).join('、')
  const more = merged.length > SHOWN_LIMIT ? ` 等 ${merged.length - SHOWN_LIMIT} 处` : ''
  return `${label}：${shown}${more} \`files ${merged.join(', ')}\``
}

/** Repository paths from `不许碰：` as floor paths: `dir/**` and `dir/*` read as the directory, other wildcards are left to the rule. */
function touchFloorPaths(touch: readonly string[]): string[] {
  return touch.map(path => path.replace(/\/\*\*?$/, '/')).filter(floorable)
}

/** The floor draft for one scan and its tracked file list (§5.7). */
export function floorDraft(scan: ScanResult, files: readonly string[], answers: FloorAnswers = {}): FloorDraft {
  const lines = [
    filesLine('改到拦截与权限', byNameWords(files, AUTH_WORDS)),
    filesLine('改到数据格式与迁移', dataFormatPaths(files)),
    filesLine('改到发布与部署', deployPaths(scan, files)),
    filesLine('改到依赖与构建', scan.sources.manifests),
    filesLine('改到不许碰的地方', touchFloorPaths(answers.touch ?? [])),
  ].filter((line): line is string => line !== undefined)
  return { id: FLOOR_ID, title: FLOOR_TITLE, why: FLOOR_WHY, body: FLOOR_BODY, acceptance: [...lines, ...FLOOR_GENERAL] }
}

/** `floor.md`: the draft for the main agent to read (English around it, the node's own words in Chinese), one acceptance line per `- ` item. */
export function floorMarkdown(draft: FloorDraft): string {
  return [
    `# Draft of ${draft.id}`,
    '',
    `Propose this norm under the anchor as your own (llm), with id ${draft.id}. Edit the lines to what you read in the project, add the classes the scan cannot see, and keep the backtick forms at the end of every line: they are what the harness judges by (M7 §3.8.5).`,
    '',
    `title: ${draft.title}`,
    `why: ${draft.why}`,
    '',
    'body:',
    draft.body,
    '',
    'acceptance:',
    ...draft.acceptance.map(line => `- ${line}`),
    '',
  ].join('\n')
}
