/**
 * The session transcript export (src/data/transcript.ts) and its row
 * (src/data/transcript-row.ts): the text format and its line bound, the
 * redaction of credential-like strings and its count, the export that
 * writes nothing when redaction throws, the place under the project's
 * git-ignored `.llm/`, the refusals, the rewrite and the 14-day cleanup, on
 * real temporary directories and real git. The session query fake returns
 * documents in the shape rc.3 `buildSessionEventSearchDocuments` produces
 * (session-query:614–631). The credential-shaped samples are assembled from
 * parts so that no line of this file is itself a token for the repository's
 * secret scan (docs/DEVELOPMENT.md §7, 2026-11-04).
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { redactSecretsCounted } from '../src/data/secret-shape.ts'
import { cleanTranscripts, exportTranscript, renderTranscript, TRANSCRIPT_KEEP_DAYS, TRANSCRIPT_LINE_MAX } from '../src/data/transcript.ts'
import { apply } from '../src/data/transcript-row.ts'
import type { SessionEventDocumentLike } from '../src/shared/dsh-min.ts'
import { healthServiceName, type RowHealthView } from '../src/shared/health.ts'
import { TRANSCRIPT_SERVICE, transcriptService } from '../src/shared/transcript.ts'
import { serviceStore } from './fake-rc3.ts'
import { makeRepo, tryGit } from './git-fixture.ts'
import { skipIfTempInsideGit } from './temp-outside-git.ts'

const AT = new Date('2026-11-05T01:02:03.000Z')
const T0 = Date.parse('2026-11-05T00:00:00.000Z')

const doc = (seq: number, type: string, text: string): SessionEventDocumentLike => ({ seq, type, time: T0 + seq * 1000, surface: 'current', text })

const DOCUMENTS = [
  doc(1, 'user/message', 'Read package.json'),
  doc(4, 'assistant/message', 'Read\n{"file_path":"C:/w/package.json"}'),
  doc(5, 'tool/call', 'read\n{"file_path":"C:/w/package.json"}'),
  doc(6, 'tool/result', '1\t{\r\n2\t  "name": "x"\r\n3\t}'),
  doc(7, 'todo/write', 'in_progress\nprobe'),
  doc(8, 'turn/end', 'aborted'),
  doc(9, 'future/event', 'kept as its type'),
]

const HEADER = [
  'Transcript of session S1, exported 2026-11-05T01:02:03.000Z when the conversation was compacted.',
  'Entries are the session\'s messages, tool calls and tool results up to that point, oldest first, as plain text; reasoning and images are left out.',
  'Each entry starts with a line "=== #<seq> <kind> <time>". Lines longer than 1000 characters continue on the next line.',
  'Strings that look like credentials (named key prefixes, Bearer values, private keys, long mixed-case tokens, 32 or more hex digits such as a full commit id) are replaced with [redacted]. Replaced in this export: 0.',
  '',
]

/** One sample of each secret class the export hides (src/data/secret-shape.ts). */
const PREFIXED = ['sk', '-'].join('') + 'live0123456789abcdefXYZ'
const AWS_ID = 'AKIA' + 'Q2W3E4R5T6Y7U8I9'
const BEARER = ['Bearer', 'Probe0123456789abcdefGHIJ'].join(' ')
const PEM_BODY = ['MIIBVwIBADAN/BgkqhkiG9w0B/AQEFAASCAUEw', 'q1w2e3r4/T5Y6U7I8o9p0/ZxCvBnMm==']
const PEM_LINES = [['-----BEGIN', 'PRIVATE KEY-----'].join(' '), ...PEM_BODY, ['-----END', 'PRIVATE KEY-----'].join(' ')]
const MIXED = ['Qw3Er5Ty7Ui9Op1As3Df', '5Gh7Jk9Lz1Xc3Vb5Nm7'].join('')
const DIGEST = '0123456789abcdef'.repeat(4)
const SAMPLES = [PREFIXED, AWS_ID, BEARER, ...PEM_LINES, MIXED, DIGEST]

/** A session that met each sample once: typed by the person, sent in a command, read back from files, repeated by the model. */
const WITH_CREDENTIALS = [
  doc(1, 'user/message', `Use ${PREFIXED} for the call.`),
  doc(2, 'tool/call', `pwsh\n{"command":"curl -H 'Authorization: ${BEARER}' https://example.com/v1"}`),
  doc(3, 'tool/result', `1\tAWS_ACCESS_KEY_ID=${AWS_ID}\n2\tREGION=eu-west-1`),
  doc(4, 'tool/result', PEM_LINES.map((line, index) => `${index + 1}\t${line}`).join('\n')),
  doc(5, 'assistant/message', `The upload token is ${MIXED}; the archive digest is ${DIGEST}.`),
]

/** The entries of WITH_CREDENTIALS as the export writes them: each sample is [redacted], every other character is the document's. */
const REDACTED_ENTRIES = [
  '=== #1 user 2026-11-05T00:00:01.000Z',
  'Use [redacted] for the call.',
  '',
  '=== #2 tool call 2026-11-05T00:00:02.000Z',
  'pwsh',
  '{"command":"curl -H \'Authorization: [redacted]\' https://example.com/v1"}',
  '',
  '=== #3 tool result 2026-11-05T00:00:03.000Z',
  '1\tAWS_ACCESS_KEY_ID=[redacted]',
  '2\tREGION=eu-west-1',
  '',
  '=== #4 tool result 2026-11-05T00:00:04.000Z',
  '1\t[redacted]',
  '',
  '=== #5 assistant 2026-11-05T00:00:05.000Z',
  'The upload token is [redacted]; the archive digest is [redacted].',
  '',
  '',
]

const codePoints = (line: string): number => Array.from(line).length
const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

/** A host with the session query and agents services as the export reads them; `calls` records each filterEvents call. */
function host(options: { documents?: readonly SessionEventDocumentLike[], reject?: Error, cwd?: string, query?: false } = {}) {
  const store = serviceStore()
  const calls: Array<{ sessionId: string, filters: readonly unknown[] }> = []
  if (options.query !== false) {
    store.provide('sessionQuery', {
      filterEvents: (sessionId: string, filters: readonly unknown[]) => {
        calls.push({ sessionId, filters })
        return options.reject === undefined ? Promise.resolve(options.documents ?? DOCUMENTS) : Promise.reject(options.reject)
      },
    })
  }
  store.provide('agents', { get: (id: string) => options.cwd === undefined ? undefined : { id, session: { id, header: { id, cwd: options.cwd } } } })
  return { store, calls }
}

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

test('the export opens with the five header lines, then one entry per document in seq order with its kind', () => {
  const lines = renderTranscript('S1', DOCUMENTS, AT).text.split('\n')
  assert.deepEqual(lines.slice(0, 5), HEADER)
  assert.deepEqual(lines.filter(line => line.startsWith('=== ')), [
    '=== #1 user 2026-11-05T00:00:01.000Z',
    '=== #4 assistant 2026-11-05T00:00:04.000Z',
    '=== #5 tool call 2026-11-05T00:00:05.000Z',
    '=== #6 tool result 2026-11-05T00:00:06.000Z',
    '=== #7 todo 2026-11-05T00:00:07.000Z',
    '=== #8 turn end 2026-11-05T00:00:08.000Z',
    '=== #9 future/event 2026-11-05T00:00:09.000Z',
  ])
  // Multi-line text is kept line by line, CRLF becomes LF, an empty line closes each entry.
  const result = lines.indexOf('=== #6 tool result 2026-11-05T00:00:06.000Z')
  assert.deepEqual(lines.slice(result, result + 5), ['=== #6 tool result 2026-11-05T00:00:06.000Z', '1\t{', '2\t  "name": "x"', '3\t}', ''])
  assert.ok(!renderTranscript('S1', DOCUMENTS, AT).text.includes('\r'))
  assert.ok(renderTranscript('S1', DOCUMENTS, AT).text.endsWith('kept as its type\n\n'))
})

test('without anything credential-like the entries are the documents\' text as it is and the header counts 0', () => {
  const rendered = renderTranscript('S1', DOCUMENTS, AT)
  assert.equal(rendered.redacted, 0)
  const body = rendered.text.split('\n').slice(HEADER.length)
  assert.ok(!body.some(line => line.includes('[redacted]')), 'no entry line is replaced')
  // Each entry is its title line, the document's text line by line (CRLF as LF), an empty line.
  const entries = body.join('\n').split(/^=== #\d+ [^\n]*\n/m).slice(1)
  assert.deepEqual(entries, DOCUMENTS.map(document => `${document.text.replace(/\r\n/g, '\n')}\n\n`))
})

test('each credential-like sample of a session becomes [redacted], the rest of every entry is unchanged, and the header counts the six replacements', () => {
  const rendered = renderTranscript('S1', WITH_CREDENTIALS, AT)
  const lines = rendered.text.split('\n')
  assert.equal(rendered.redacted, 6, 'one per sample; the PEM block from its header to its END line is one')
  assert.equal(lines[3], HEADER[3]?.replace('Replaced in this export: 0.', 'Replaced in this export: 6.'))
  assert.deepEqual(lines.slice(HEADER.length), REDACTED_ENTRIES)
  for (const sample of SAMPLES) assert.ok(!rendered.text.includes(sample), `a sample is left in the export: ${sample.slice(0, 6)}…`)
  // The count is the sum of the per-document counts of the shared redaction.
  assert.equal(WITH_CREDENTIALS.reduce((sum, document) => sum + redactSecretsCounted(document.text).replaced, 0), 6)
})

test('when redaction throws nothing is written: the export is skipped with the reason, and the row health is degraded naming it', async () => {
  // Node 22's regular-expression engine overflows its backtrack stack on one run of tens of millions of token characters.
  const huge = 'a'.repeat(32_000_000)
  assert.throws(() => redactSecretsCounted(huge), RangeError, 'the precondition: this input makes the shared redaction throw')
  const home = tempDir('transcript-redact-fail-')
  try {
    const documents = [...WITH_CREDENTIALS, doc(6, 'tool/result', huge)]
    const result = await exportTranscript(host({ documents }).store, home, 'S1', AT)
    assert.ok(result.kind === 'skipped' && result.reason.startsWith('遮掉像凭证的字符串失败，不写明文：'), JSON.stringify(result).slice(0, 200))
    assert.equal(existsSync(join(home, 'transcripts')), false)
    const { store } = host({ documents })
    const dispose = apply(store, { home })
    const answer = await transcriptService(store)?.exportBeforeCompaction('S1')
    assert.equal(answer?.kind, 'skipped')
    const view = store.get(healthServiceName('transcript')) as RowHealthView
    assert.equal(view.session('S1')?.state, 'degraded')
    assert.ok(view.session('S1')?.reason.startsWith('压缩摘要不带原文路径：遮掉像凭证的字符串失败'), view.session('S1')?.reason)
    assert.equal(existsSync(join(home, 'transcripts')), false)
    dispose()
  }
  finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('a long line continues on the next lines in pieces of at most 1000 code points, a surrogate pair never split', () => {
  // g and h are not hex digits and one kind of letter is no token shape, so redaction leaves these runs alone.
  const long = 'x'.repeat(2500)
  const astral = `${'g'.repeat(TRANSCRIPT_LINE_MAX - 1)}\u{1F600}${'h'.repeat(500)}`
  const text = renderTranscript('S1', [doc(1, 'tool/result', `${long}\n${astral}`)], AT).text
  const lines = text.split('\n')
  const at = lines.indexOf('=== #1 tool result 2026-11-05T00:00:01.000Z') + 1
  assert.deepEqual(lines.slice(at, at + 3).map(codePoints), [1000, 1000, 500])
  assert.equal(lines.slice(at, at + 3).join(''), long)
  assert.equal(lines[at + 3], `${'g'.repeat(TRANSCRIPT_LINE_MAX - 1)}\u{1F600}`)
  assert.equal(lines[at + 4], 'h'.repeat(500))
  for (const line of lines) {
    assert.ok(codePoints(line) <= TRANSCRIPT_LINE_MAX, `a line of ${codePoints(line)} code points`)
    assert.ok(!loneSurrogate.test(line), 'a lone surrogate')
  }
})

test('in a git repository the export lands in the project\'s .llm/transcripts/<id>.txt, which git ignores', async () => {
  const repo = makeRepo()
  repo.commit({ 'README.md': 'x\n' }, 'first')
  mkdirSync(join(repo.dir, 'sub'))
  const { store, calls } = host({ cwd: join(repo.dir, 'sub') })
  const result = await exportTranscript(store, undefined, 'S1', AT)
  const expected = resolve(repo.dir, '.llm', 'transcripts', 'S1.txt')
  assert.deepEqual(result, { kind: 'written', path: expected, entries: DOCUMENTS.length, redacted: 0, cleanup: { removed: 0, failed: 0 } })
  assert.deepEqual(calls, [{ sessionId: 'S1', filters: [] }])
  assert.equal(readFileSync(expected, 'utf8'), renderTranscript('S1', DOCUMENTS, AT).text)
  assert.equal(tryGit(repo.dir, 'check-ignore', '-q', '.llm/transcripts/S1.txt').code, 0)
  assert.equal(tryGit(repo.dir, 'status', '--porcelain').out, '')
})

test('a tracked negation that keeps .llm/ visible to git stops the export: nothing is written', async () => {
  const repo = makeRepo()
  repo.commit({ '.gitignore': '!/.llm/\n' }, 'first')
  const { store, calls } = host({ cwd: repo.dir })
  const result = await exportTranscript(store, undefined, 'S1', AT)
  assert.equal(result.kind, 'skipped')
  assert.ok(result.kind === 'skipped' && result.reason.includes('.gitignore'), JSON.stringify(result))
  assert.equal(existsSync(join(repo.dir, '.llm', 'transcripts')), false)
  assert.deepEqual(calls, [])
})

test('a session outside any project has nowhere to write: skipped', { skip: skipIfTempInsideGit() }, async () => {
  const dir = tempDir('transcript-nogit-')
  try {
    const { store } = host({ cwd: dir })
    const result = await exportTranscript(store, undefined, 'S1', AT)
    assert.equal(result.kind, 'skipped')
    assert.equal(existsSync(join(dir, '.llm')), false)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an id that is not a plain file name, a missing session query and a failing one each give skipped, and the call resolves', async () => {
  const home = tempDir('transcript-refuse-')
  try {
    for (const id of ['../S1', 'a/b', 'a\\b', '', 'x'.repeat(129)]) {
      const { store, calls } = host()
      const result = await exportTranscript(store, home, id, AT)
      assert.equal(result.kind, 'skipped', id)
      assert.deepEqual(calls, [], id)
    }
    const absent = await exportTranscript(host({ query: false }).store, home, 'S1', AT)
    assert.ok(absent.kind === 'skipped' && absent.reason.includes('sessionQuery'), JSON.stringify(absent))
    const failing = await exportTranscript(host({ reject: new Error('log unreadable') }).store, home, 'S1', AT)
    assert.ok(failing.kind === 'skipped' && failing.reason.includes('log unreadable'), JSON.stringify(failing))
    assert.equal(existsSync(join(home, 'transcripts')), false)
  }
  finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('a later export of the same session rewrites its file with the longer log', async () => {
  const home = tempDir('transcript-rewrite-')
  try {
    await exportTranscript(host({ documents: DOCUMENTS.slice(0, 2) }).store, home, 'S1', AT)
    const later = new Date(AT.getTime() + 60_000)
    const result = await exportTranscript(host({ documents: DOCUMENTS }).store, home, 'S1', later)
    assert.equal(result.kind === 'written' && result.path, join(resolve(home), 'transcripts', 'S1.txt'))
    assert.equal(readFileSync(join(home, 'transcripts', 'S1.txt'), 'utf8'), renderTranscript('S1', DOCUMENTS, later).text)
  }
  finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('cleanup deletes other sessions\' exports older than 14 days and nothing else', async () => {
  const home = tempDir('transcript-clean-')
  try {
    const dir = join(home, 'transcripts')
    mkdirSync(dir)
    const day = 86_400_000
    const aged = (name: string, days: number): void => {
      writeFileSync(join(dir, name), 'old\n')
      const at = new Date(AT.getTime() - days * day)
      utimesSync(join(dir, name), at, at)
    }
    aged('old-session.txt', TRANSCRIPT_KEEP_DAYS + 1)
    aged('recent-session.txt', TRANSCRIPT_KEEP_DAYS - 1)
    aged('notes.md', 30)
    aged('S1.txt', 30)
    const result = await exportTranscript(host().store, home, 'S1', AT)
    assert.equal(result.kind === 'written' && JSON.stringify(result.cleanup), JSON.stringify({ removed: 1, failed: 0 }))
    assert.equal(existsSync(join(dir, 'old-session.txt')), false)
    for (const kept of ['recent-session.txt', 'notes.md', 'S1.txt']) assert.ok(existsSync(join(dir, kept)), kept)
    // The file just written is kept whatever its age.
    aged('S1.txt', 30)
    assert.deepEqual(await cleanTranscripts(dir, 'S1.txt', AT.getTime()), { removed: 0, failed: 0 })
    assert.ok(existsSync(join(dir, 'S1.txt')))
  }
  finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('the row provides glmHournessTranscript, reports each export in its health, and withdraws it on dispose', async () => {
  const home = tempDir('transcript-row-')
  try {
    const { store } = host()
    const dispose = apply(store, { home })
    const service = transcriptService(store)
    assert.ok(service !== undefined)
    const written = await service.exportBeforeCompaction('S1')
    assert.deepEqual(written, { kind: 'written', path: join(resolve(home), 'transcripts', 'S1.txt'), entries: DOCUMENTS.length })
    const view = store.get(healthServiceName('transcript')) as RowHealthView
    assert.equal(view.activation().state, 'active')
    assert.equal(view.session('S1')?.state, 'active')
    assert.ok(view.session('S1')?.reason.includes(join(resolve(home), 'transcripts', 'S1.txt')))
    assert.ok(view.session('S1')?.reason.includes('遮掉 0 处像凭证的字符串'), view.session('S1')?.reason)
    const skipped = await service.exportBeforeCompaction('../S2')
    assert.equal(skipped.kind, 'skipped')
    assert.equal(view.session('../S2')?.state, 'degraded')
    dispose()
    assert.equal(store.get(TRANSCRIPT_SERVICE), undefined)
    assert.equal(store.get(healthServiceName('transcript')), undefined)
  }
  finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('the row health of a session whose export replaced credential-like strings names the count, and the written file holds none of them', async () => {
  const home = tempDir('transcript-row-redact-')
  try {
    const { store } = host({ documents: WITH_CREDENTIALS })
    const dispose = apply(store, { home })
    const written = await transcriptService(store)?.exportBeforeCompaction('S1')
    assert.equal(written?.kind, 'written')
    const view = store.get(healthServiceName('transcript')) as RowHealthView
    assert.equal(view.session('S1')?.state, 'active')
    assert.ok(view.session('S1')?.reason.includes('遮掉 6 处像凭证的字符串'), view.session('S1')?.reason)
    const text = readFileSync(join(home, 'transcripts', 'S1.txt'), 'utf8')
    for (const sample of SAMPLES) assert.ok(!text.includes(sample), `a sample is left in the file: ${sample.slice(0, 6)}…`)
    dispose()
  }
  finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('without provide the row activates all the same, warns once and provides nothing', () => {
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message: string) => { warnings.push(message) }
  try {
    const dispose = apply({ get: () => undefined }, {})
    dispose()
  }
  finally {
    console.warn = warn
  }
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0]?.includes(TRANSCRIPT_SERVICE))
})

test('the row ships enabled in the orchestration patch (no disabled key) with an empty config', () => {
  const patch = readFileSync(new URL('../packages/hourness/cordis.patch.yml', import.meta.url), 'utf8')
  const start = patch.indexOf('    - id: glm-hourness/transcript')
  assert.ok(start >= 0)
  const next = patch.indexOf('\n    - id:', start + 1)
  const block = patch.slice(start, next < 0 ? undefined : next)
  assert.match(block, /^ {6}name: dsh-hourness\/transcript$/m)
  assert.doesNotMatch(block, /^ {6}disabled:/m, 'enabled on the person\'s word (2026-11-06) after the L3 scenario glm-compact-transcript and the desktop L4 on an isolated instance passed')
  assert.match(block, /^ {6}config: \{\}$/m, 'a shipped home would take the exports out of the project .llm that the row makes git-ignored first')
})
