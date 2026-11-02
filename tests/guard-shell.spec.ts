import assert from 'node:assert/strict'
import test from 'node:test'
import { describeWrite, shellWrites, type ShellDialect } from '../src/guard/shell.ts'
import { declarationOf, fileToolsOnly, NATIVE_FACE, renderCorrection, shellCommandOf } from '../src/guard/rules.ts'

// file-tools-only reads shell text quote-aware (docs/ORCHESTRATION.md §6.4):
// only command positions and real redirections count. The three recorded
// false denials (2026-10-27) were `=>`, `>>>` and `->` inside quoted text.

const writes = (command: string, dialect: ShellDialect = 'pwsh'): string[] => shellWrites(command, dialect).map(describeWrite)
const both = ['pwsh', 'posix'] as const

test('=>, >>> and -> inside quotes are data in both dialects', () => {
  for (const dialect of both) {
    for (const command of [
      'git commit -m "map => reduce"',
      'git commit -m \'a -> b\'',
      'node -e "console.log(1 >>> 0)"',
      'rg "=>" src',
      'rg \'->\' src',
      'echo "x >> y"',
      'Write-Output \'a => b -> c >>> d\'',
      'python -c "print(\'a\' > \'b\')"',
    ]) assert.deepEqual(writes(command, dialect), [], `${dialect}: ${command}`)
  }
})

test('=>, >>> and -> inside code bodies are data: here-strings, here-documents, comments', () => {
  assert.deepEqual(writes('@\'\nconst f = (a) => a >>> 1 // a -> b\nRemove-Item nothing\n\'@ | node -'), [])
  assert.deepEqual(writes('@"\nx => y >> z\n"@ | git commit -F -'), [])
  assert.deepEqual(writes('node - <<\'EOF\'\nconst f = a => a >>> 1 > 0\nrm -rf /\nEOF', 'posix'), [])
  assert.deepEqual(writes('git commit -F - <<-EOF\n\tfix: a -> b\n\tEOF', 'posix'), [])
  assert.deepEqual(writes('npm test # a -> b > c'), [])
  assert.deepEqual(writes('npm test <# a -> b #> --silent'), [])
  assert.deepEqual(writes('echo $(( 3 > 2 ))', 'posix'), [])
  assert.deepEqual(writes('if (( a > b )); then echo yes; fi', 'posix'), [])
})

test('the text after a here-document or here-string body is still read', () => {
  assert.deepEqual(writes('cat <<EOF > out.txt\nbody -> x\nEOF', 'posix'), ['redirection > out.txt'])
  assert.deepEqual(writes('cat <<EOF\nbody\nEOF\nrm x', 'posix'), ['rm command'])
  assert.deepEqual(writes('@\'\nbody\n\'@ | Set-Content f.txt'), ['Set-Content command'])
})

test('real redirections into files are writes', () => {
  assert.deepEqual(writes('echo x > out.txt'), ['redirection > out.txt'])
  assert.deepEqual(writes('ls >> log.txt'), ['redirection >> log.txt'])
  assert.deepEqual(writes('npm test 2> err.txt'), ['redirection 2> err.txt'])
  assert.deepEqual(writes('Get-Process *> all.txt'), ['redirection *> all.txt'])
  assert.deepEqual(writes('echo hi>out.txt'), ['redirection > out.txt'])
  // Unquoted, PowerShell reads `a->b` as `a-` redirected into b.
  assert.deepEqual(writes('echo a->b'), ['redirection > b'])
  assert.deepEqual(writes('echo x > "$(Get-Date).log"'), ['redirection > $().log'])
  assert.deepEqual(writes('echo x >| f', 'posix'), ['redirection >| f'])
  assert.deepEqual(writes('make &> build.log', 'posix'), ['redirection &> build.log'])
  assert.deepEqual(writes('make >& build.log', 'posix'), ['redirection >& build.log'])
  assert.deepEqual(writes('exec 3<> lock', 'posix'), ['redirection <> lock'])
})

test('stream merges, null sinks and input redirections are not writes', () => {
  for (const command of ['npm test 2>&1 | Out-String', 'npm test > $null', 'npm test 2>$null', 'Get-Process *>&1', 'npm ci *> $null']) {
    assert.deepEqual(writes(command), [], command)
  }
  for (const command of ['make > /dev/null 2>&1', 'cmd >&2', 'exec 3>&-', 'sort < in.txt', 'cat <<< "a > b"', 'diff <(ls a) <(ls b)']) {
    assert.deepEqual(writes(command, 'posix'), [], command)
  }
})

test('Set-Content, Out-File, Add-Content and the other write cmdlets are writes in command position', () => {
  assert.deepEqual(writes('Set-Content f.txt hi'), ['Set-Content command'])
  assert.deepEqual(writes('Get-Content a | Out-File b'), ['Out-File command'])
  assert.deepEqual(writes('Add-Content log.txt x'), ['Add-Content command'])
  assert.deepEqual(writes('$null = New-Item -ItemType Directory x'), ['New-Item command'])
  assert.deepEqual(writes('$r=Remove-Item x'), ['Remove-Item command'])
  assert.deepEqual(writes('Get-ChildItem | ForEach-Object { Remove-Item $_ }'), ['Remove-Item command'])
  assert.deepEqual(writes('if (Test-Path x) { Copy-Item x y }'), ['Copy-Item command'])
  assert.deepEqual(writes('Microsoft.PowerShell.Management\\Move-Item a b'), ['Microsoft.PowerShell.Management\\Move-Item command'])
  assert.deepEqual(writes('"$(Clear-Content f)"'), ['Clear-Content command'])
  assert.deepEqual(writes('Get-Date | Tee-Object -FilePath t.txt'), ['Tee-Object command'])
})

test('POSIX write commands are writes in command position, through prefixes, wrappers and substitutions', () => {
  assert.deepEqual(writes('rm -rf dist', 'posix'), ['rm command'])
  assert.deepEqual(writes('FOO=1 sudo rm x', 'posix'), ['rm command'])
  assert.deepEqual(writes('/bin/rm x', 'posix'), ['/bin/rm command'])
  assert.deepEqual(writes('ls | xargs -0 rm', 'posix'), ['rm command'])
  assert.deepEqual(writes('find . -name \'*.o\' -exec rm {} \\;', 'posix'), ['rm command'])
  assert.deepEqual(writes('if true; then mv a b; fi', 'posix'), ['mv command'])
  assert.deepEqual(writes('{ touch a; }', 'posix'), ['touch command'])
  assert.deepEqual(writes('echo $(cp a b)', 'posix'), ['cp command'])
  assert.deepEqual(writes('echo `touch f`', 'posix'), ['touch command'])
  assert.deepEqual(writes('make | tee out.txt', 'posix'), ['tee command'])
  assert.deepEqual(writes('sed -i \'s/a/b/\' f', 'posix'), ['sed -i command'])
  assert.deepEqual(writes('sed -n -i.bak \'s/a/b/\' f', 'posix'), ['sed -i.bak command'])
  assert.deepEqual(writes('sed --in-place \'s/a/b/\' f', 'posix'), ['sed --in-place command'])
  assert.deepEqual(writes('sed -n \'s/a/b/p\' f', 'posix'), [])
})

test('git subcommands and words in argument position are never write commands', () => {
  for (const dialect of both) {
    for (const command of [
      'git rm a.txt',
      'git mv a b',
      'git -C repo rm x',
      'git checkout -- src/a.ts',
      'git clean -fd',
      'git log --format=">%h %s"',
      'git commit -m "rm -> mv"',
      'echo rm',
      'Write-Output Set-Content',
      'npm run cp',
      'grep -r "rm -rf" .',
      'node server.js &',
    ]) assert.deepEqual(writes(command, dialect), [], `${dialect}: ${command}`)
  }
})

test('the script of an inner shell is read as commands', () => {
  assert.deepEqual(writes('pwsh -NoProfile -Command "Set-Content a b"'), ['Set-Content command'])
  assert.deepEqual(writes('powershell -c "echo x > y"'), ['redirection > y'])
  assert.deepEqual(writes('bash -lc \'touch f\'', 'posix'), ['touch command'])
  assert.deepEqual(writes('bash -c "git commit -m \'a -> b\'"', 'posix'), [])
})

test('file-tools-only: the denial names the write; the shell tools and their argument follow rc.3', () => {
  // Rules see DSH native names (the rows map the ZCode Bash alias to pwsh first, src/shared/dialect.ts).
  const verdict = fileToolsOnly.detect({ name: 'pwsh', arguments: { command: 'echo x > out.txt' } }, NATIVE_FACE)
  assert.equal(verdict.kind, 'deny')
  if (verdict.kind === 'deny') assert.ok(renderCorrection(verdict.correction).startsWith('You tried to modify files through the shell: "echo x > out.txt" (redirection > out.txt).\nBoundary: Shell file writes are not permitted'))
  assert.equal(fileToolsOnly.detect({ name: 'pwsh', arguments: { command: 'git commit -m "a -> b"' } }, NATIVE_FACE).kind, 'allow')
  assert.equal(fileToolsOnly.detect({ name: 'Bash', arguments: { command: 'Set-Content f x' } }, NATIVE_FACE).kind, 'allow') // an alias name unmapped is no shell tool
  assert.equal(fileToolsOnly.detect({ name: 'pwsh', arguments: { command: 'Set-Content f x' } }, NATIVE_FACE).kind, 'deny')
  assert.equal(fileToolsOnly.detect({ name: 'bash', arguments: { command: 'touch f' } }, NATIVE_FACE).kind, 'deny')
  // dsh-tool-terminal: terminal_send carries `text`; the backend may run bash or pwsh, so both readings apply.
  assert.deepEqual(shellCommandOf({ name: 'terminal_send', arguments: { sessionId: 't1', text: 'ls' } }), { command: 'ls', dialects: ['pwsh', 'posix'] })
  assert.equal(shellCommandOf({ name: 'terminal_send', arguments: { sessionId: 't1', command: 'ls' } }), undefined)
  assert.equal(fileToolsOnly.detect({ name: 'terminal_send', arguments: { sessionId: 't1', text: 'touch f' } }, NATIVE_FACE).kind, 'deny')
  assert.equal(fileToolsOnly.detect({ name: 'Read', arguments: { command: 'rm x' } }, NATIVE_FACE).kind, 'allow')
})

test('file-tools-only declares the boundary it enforces, naming the file tools as the model sees them', () => {
  const faces = new Map([['read', 'Read'], ['write', 'Write'], ['edit', 'Edit']])
  const zcode = (native: string) => faces.get(native) ?? native
  const declared = declarationOf(fileToolsOnly, zcode)
  for (const term of ['Write/Edit', '`>`', '`>>`', 'Set-Content', 'Out-File', 'Add-Content', 'Remove-Item', 'rm', 'rmdir', 'sed -i']) {
    assert.ok(declared.includes(term), term)
  }
  assert.ok(declarationOf(fileToolsOnly, NATIVE_FACE).startsWith('Modify files and code only with the dedicated write/edit tools.'))
  const verdict = fileToolsOnly.detect({ name: 'pwsh', arguments: { command: 'Set-Content f x' } }, zcode)
  assert.equal(verdict.kind === 'deny' ? verdict.correction.rightPath : undefined, 'Read the target with Read, then apply the change with Write or Edit.')
})
