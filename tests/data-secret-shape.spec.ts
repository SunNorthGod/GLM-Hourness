/**
 * Text that looks like a secret (M5 design §5.6): the three groups of fixed
 * cases (taken, refused with the class, the shapes that must not trip it),
 * the rejection texts, and `redactSecrets` agreeing with `looksSecret` on the
 * same cases. The secret-shaped samples are assembled from parts so that no
 * line of this file is itself a token for the repository's secret scan.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { findSecret, looksSecret, redactSecrets, type SecretClass } from '../src/data/secret-shape.ts'

const GHP = ['ghp', '_'].join('') + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'
const MIXED_TOKEN = ['aB3dE5gH7jK9mN1pQ3sT', '5vW7yZ9bD1fH3jL5nP7r'].join('')
const PEM = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ')
const BEARER = ['Bearer', 'abcdefghij0123456789ABCDEFGHIJ'].join(' ')
const SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const COMMIT = 'cae6ddf1a2b3c4d5e6f708192a3b4c5d6e7f8091'

test('the fixed samples have the lengths the cases name', () => {
  assert.equal(GHP.length, 40)
  assert.equal(MIXED_TOKEN.length, 40)
  assert.equal(BEARER.length - 'Bearer '.length, 30)
  assert.equal(SHA256.length, 64)
  assert.equal(COMMIT.length, 40)
})

test('taken: paths, long identifiers and plan names that the old "path means secret" check refused', () => {
  const taken = [
    'cli/packages/core/src/context/sections/memory',
    'reference/ZCode/apps/zcode-cli/packages/core/src/context/sections/memory.ts',
    'buildProviderEndpointRoutingHeaders',
    'stripTopLevelMarkdownHtmlComments',
    'coding-plan/start-plan',
    'src/shared/dsh-min.ts',
    'task-3',
    'risk-shared-desktop',
    'The harness keeps this for you; write it with memory_store.',
  ]
  for (const text of taken) assert.equal(looksSecret(text), undefined, text)
})

test('refused with the class: a named prefix, a token shape, a PEM header, a Bearer value, a long hex digest', () => {
  const refused: ReadonlyArray<readonly [string, SecretClass]> = [
    [GHP, 'prefix'],
    [`the token is ${GHP} here`, 'prefix'],
    [MIXED_TOKEN, 'token'],
    [PEM, 'pem'],
    [BEARER, 'bearer'],
    [`digest ${SHA256}`, 'hex'],
    [`call:${GHP}`, 'prefix'],
    ['AKIA' + 'ABCDEFGHIJKLMNOP', 'prefix'],
    [['github_pat', '_'].join('') + '11ABCDEFG0123456789abcdef', 'prefix'],
  ]
  for (const [text, expected] of refused) assert.equal(looksSecret(text), expected, text)
})

test('a named prefix counts at the start or after a character that cannot continue a word, not inside one', () => {
  const key = ['sk', '-'].join('') + 'abcdefghijklmnop'
  assert.equal(looksSecret(key), 'prefix')
  assert.equal(looksSecret(`(${key})`), 'prefix')
  assert.equal(looksSecret(`x_${key}`), undefined, 'after an underscore it is inside a word')
  assert.equal(looksSecret(`ri${key}`), undefined, 'inside risk-shared-... style words')
  assert.equal(looksSecret(['sk', '-'].join('') + 'short'), undefined, 'fewer than 16 characters follow')
})

test('the token class needs 32 or more characters of the token alphabet with a digit, a capital and a small letter, and is cut by "/" and "."', () => {
  // g and h are not hex digits, so these samples stay out of the hex class.
  assert.equal(looksSecret('g'.repeat(32)), undefined, 'one kind of character')
  assert.equal(looksSecret('Gh'.repeat(16)), undefined, 'no digit')
  assert.equal(looksSecret('gh1'.repeat(11)), undefined, 'no capital')
  assert.equal(looksSecret('GH1'.repeat(11)), undefined, 'no small letter')
  assert.equal(looksSecret('Gh1'.repeat(11)), 'token', '33 characters with all three kinds')
  assert.equal(looksSecret('Gh1'.repeat(10)), undefined, '30 characters')
  assert.equal(looksSecret(`${MIXED_TOKEN.slice(0, 20)}/${MIXED_TOKEN.slice(20)}`), undefined, 'cut by a slash')
  assert.equal(looksSecret(`${MIXED_TOKEN.slice(0, 20)}.${MIXED_TOKEN.slice(20)}`), undefined, 'cut by a dot')
})

test('the hex class needs 32 or more hex digits not touching another letter or digit', () => {
  assert.equal(looksSecret('a'.repeat(31)), undefined)
  assert.equal(looksSecret('a1'.repeat(16)), 'hex')
  assert.equal(looksSecret(`${'a1'.repeat(16)}g`), undefined, 'a non-hex letter follows')
  assert.equal(looksSecret(`${SHA256}.`), 'hex')
  assert.equal(looksSecret(COMMIT), 'hex', 'a full commit id is a hex digest here; the evidence check lets commit ids through')
  assert.equal(looksSecret(COMMIT.slice(0, 12)), undefined, 'a short commit id is not')
})

test('skip leaves classes out', () => {
  assert.equal(looksSecret(SHA256, ['hex']), undefined)
  assert.equal(looksSecret(MIXED_TOKEN, ['token', 'hex']), undefined)
  assert.equal(looksSecret(GHP, ['token', 'hex']), 'prefix')
})

test('the rejection text names the class and never the secret', () => {
  assert.equal(findSecret(GHP)?.message, 'looks like a secret (prefix: ghp_); remove it')
  assert.equal(findSecret(BEARER)?.message, 'looks like a secret (bearer: Bearer); remove it')
  assert.equal(findSecret(PEM)?.message, 'looks like a secret (pem: PEM header); remove it')
  assert.equal(findSecret(MIXED_TOKEN)?.message, 'looks like a secret (token shape: 32+ letters and digits mixing upper and lower case); remove it')
  assert.equal(findSecret(SHA256)?.message, 'looks like a secret (hex: 32+ hex digits); remove it, or write a short commit id instead of a full one')
  for (const text of [GHP, BEARER, MIXED_TOKEN, SHA256]) assert.ok(!findSecret(text)!.message.includes(text.slice(-12)), 'the message does not echo the secret')
  assert.equal(findSecret('plain text'), undefined)
})

test('redactSecrets hides each matching run and leaves the rest; it changes a text exactly when looksSecret finds a class', () => {
  assert.equal(redactSecrets(`a ${GHP} b`), 'a [redacted] b')
  assert.equal(redactSecrets(`${BEARER} and ${SHA256}`), '[redacted] and [redacted]')
  assert.equal(redactSecrets(`${PEM} x`), '[redacted] x')
  assert.equal(redactSecrets(`${MIXED_TOKEN} src/a.ts`), '[redacted] src/a.ts')
  assert.equal(redactSecrets(`${SHA256}`, ['hex']), SHA256, 'skip is honoured')
  const samples = [
    GHP, MIXED_TOKEN, PEM, BEARER, SHA256, COMMIT, `see ${GHP}.`,
    'cli/packages/core/src/context/sections/memory', 'buildProviderEndpointRoutingHeaders', 'coding-plan/start-plan', 'task-3', COMMIT.slice(0, 12), '', 'plain',
  ]
  for (const text of samples) assert.equal(redactSecrets(text) === text, looksSecret(text) === undefined, JSON.stringify(text))
  for (const skip of [['hex'], ['token', 'hex']] as const) {
    for (const text of samples) assert.equal(redactSecrets(text, skip) === text, looksSecret(text, skip) === undefined, `${JSON.stringify(text)} skipping ${skip.join()}`)
  }
})
