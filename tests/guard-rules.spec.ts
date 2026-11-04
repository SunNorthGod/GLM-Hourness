/**
 * The hand-written incident table (m4-gate G1, design §3.7): every rule has
 * the spellings that must be denied next to the near-misses that must pass.
 * The seeds are the repo's own incidents: the three redirection misjudgments
 * of 2026-10-27 and the four records of 2026-10-28 and 2026-10-29 still in
 * the project's violation journal (docs/DEVELOPMENT.md §7; spellings copied
 * from the records' corrections), plus the shapes each rule exists for. Of
 * the 2026-10-28 containment pair the absolute write stays a denial; the
 * relative one was the false denial of that day (docs/DEVELOPMENT.md §7:
 * an in-workspace relative write judged outside) and sits on the pass side
 * since the resolution fix, as tests/guard-audit.spec.ts pins through the
 * gate.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { fileToolsOnly, workspaceContainment, type RuleVerdict, type ToolCall } from '../src/guard/rules.ts'

const VERDICT_OF = (rule: { detect(call: ToolCall): RuleVerdict }, name: string, args: unknown): string => String(rule.detect({ name, arguments: args } as ToolCall).kind)

/** One denial row: the call, the rule that must deny it, and the fact line the model reads. The names are the DSH natives the rows judge (ORCHESTRATION.md §6.1); the journal's own records keep the model's spellings (Write, Bash). */
const DENIED: ReadonlyArray<{ readonly rule: string, readonly name: string, readonly args: unknown, readonly fact: string }> = [
  // The 2026-10-28 containment denial that stays one (the journal's own record).
  { rule: 'workspace-containment', name: 'write', args: { file_path: 'C:\\Users\\Public\\l4-outside.txt', content: 'x' }, fact: 'You tried to write "C:\\Users\\Public\\l4-outside.txt".' },
  // The 2026-10-29 file-tools-only denials, GLM face and DeepSeek face alike.
  { rule: 'file-tools-only', name: 'pwsh', args: { command: 'Set-Content -Path .agents/tasks/split/l4-scratch/glm-shell.txt -Value l4' }, fact: 'You tried to modify files through the shell: "Set-Content -Path .agents/tasks/split/l4-scratch/glm-shell.txt -Value l4"' },
  { rule: 'file-tools-only', name: 'pwsh', args: { command: 'Set-Content -Path .agents/tasks/split/l4-scratch/ds-shell.txt -Value l4' }, fact: 'You tried to modify files through the shell: "Set-Content -Path .agents/tasks/split/l4-scratch/ds-shell.txt -Value l4"' },
  // The shapes each rule exists for: redirections, changing commands, and the terminal's text field.
  { rule: 'file-tools-only', name: 'pwsh', args: { command: 'echo hi > out.txt' }, fact: '(redirection > out.txt)' },
  { rule: 'file-tools-only', name: 'pwsh', args: { command: 'Remove-Item build/cache.bin' }, fact: '(Remove-Item command)' },
  { rule: 'file-tools-only', name: 'terminal_send', args: { sessionId: 't1', text: 'Set-Content f.txt hi' }, fact: '(Set-Content command)' },
]

/** One pass row: a call a rule must leave alone, with the near-miss it guards against. */
const ALLOWED: ReadonlyArray<{ readonly name: string, readonly args: unknown, readonly why: string }> = [
  // The three misjudgments of 2026-10-27: arrows inside quoted text are not redirections.
  { name: 'pwsh', args: { command: 'echo "map => reduce"' }, why: 'quoted => is text' },
  { name: 'pwsh', args: { command: 'node -e "x >>> 1"' }, why: 'quoted >>> is text' },
  { name: 'pwsh', args: { command: 'sed "s/a -> b//" notes.md' }, why: 'quoted -> is text' },
  { name: 'pwsh', args: { command: 'Write-Output "docs/graph => nodes"' }, why: 'quoted => in a path-like string' },
  // Git subcommands are never writes (d-main-agent-shell); builds and tests run.
  { name: 'pwsh', args: { command: 'git commit -m "map => reduce, a -> b, x >>> 1"' }, why: 'git commit' },
  { name: 'pwsh', args: { command: 'git rm --cached notes.tmp' }, why: 'git rm' },
  { name: 'pwsh', args: { command: 'npm test' }, why: 'a build command' },
  { name: 'pwsh', args: { command: 'Get-Content notes.md' }, why: 'a read' },
  { name: 'pwsh', args: { command: 'echo rm' }, why: 'rm in argument position' },
  // Reads and in-workspace writes pass the rules that are not about them.
  { name: 'write', args: { file_path: 'src/a.ts', content: 'x' }, why: 'a file tool inside the roots' },
  // The 2026-10-28 false denial (the journal's own record): the relative target resolves inside the workspace.
  { name: 'write', args: { file_path: '.llm/l4-dsh/calc.mjs', content: 'x' }, why: 'the 2026-10-28 relative write resolves inside the roots' },
]

test('the incident table: every seed spelling is denied by its rule, with the fact line the journal kept', () => {
  const containment = workspaceContainment(['C:\\ws'])
  const targets: ReadonlyArray<{ rule: string, detect: (call: ToolCall) => RuleVerdict }> = [
    { rule: 'workspace-containment', detect: call => containment.detect(call) },
    { rule: 'file-tools-only', detect: call => fileToolsOnly.detect(call) },
  ]
  for (const seed of DENIED) {
    const target = targets.find(candidate => candidate.rule === seed.rule)
    assert.ok(target !== undefined, seed.rule)
    const verdict = target.detect({ name: seed.name, arguments: seed.args } as ToolCall)
    assert.equal(verdict.kind, 'deny', `${seed.rule} on ${JSON.stringify(seed.args)}`)
    assert.ok(verdict.kind === 'deny' && verdict.correction.fact.includes(seed.fact), verdict.kind === 'deny' ? verdict.correction.fact : '')
    assert.ok(verdict.kind === 'deny' && verdict.rule === seed.rule)
  }
})

test('the incident table: every near-miss passes', () => {
  const containment = workspaceContainment(['C:\\ws'])
  for (const seed of ALLOWED) {
    for (const target of [containment, fileToolsOnly]) {
      assert.equal(target.detect({ name: seed.name, arguments: seed.args } as ToolCall).kind, 'allow', `${seed.why} (${seed.name} ${JSON.stringify(seed.args)})`)
    }
  }
})

test('file-tools-only names the build-and-git exception, word for word, through the face', () => {
  const verdict = fileToolsOnly.detect({ name: 'pwsh', arguments: { command: 'Set-Content f.txt x' } })
  assert.ok(verdict.kind === 'deny')
  const expected = 'Build, test and git commands that write files as a side effect are allowed; only redirections and file-changing commands are denied. If this command writes no file, say so in your reply: the denial is recorded for review.'
  assert.equal(verdict.kind === 'deny' && verdict.correction.exception, expected)
})

test('workspace containment keeps its exception wording in G1 (it changes with the request card, G4)', () => {
  const containment = workspaceContainment(['C:\\ws'])
  const verdict = containment.detect({ name: 'write', arguments: { file_path: 'C:\\Windows\\x.dll' } })
  assert.ok(verdict.kind === 'deny' && verdict.correction.exception.startsWith('If the task really needs to write outside the workspace, tell the human'))
})

test('a relative target resolves against the base, and the roots still decide (they do not move with cd, ORCHESTRATION.md §6.1)', () => {
  const containment = workspaceContainment(['C:\\ws'], 'C:\\ws\\pkg')
  assert.equal(VERDICT_OF(containment, 'write', { file_path: 'src/a.ts' }), 'allow')
  assert.equal(VERDICT_OF(containment, 'write', { file_path: '../elsewhere/a.ts' }), 'allow', 'C:\\ws\\elsewhere is inside the roots; the base only decides what the spelling names')
  const verdict = containment.detect({ name: 'write', arguments: { file_path: '../../../elsewhere/a.ts' } })
  assert.ok(verdict.kind === 'deny' && verdict.correction.fact.includes('You tried to write "../../../elsewhere/a.ts" (resolves to'), verdict.kind === 'deny' ? verdict.correction.fact : '')
})
