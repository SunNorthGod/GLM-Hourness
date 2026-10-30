// Downloads the GeneralUser GS sound bank and its licence into assets/.
// The files are not committed (assets/ is git-ignored); each download is
// checked against the git blob id GitHub publishes for it, so a truncated or
// altered file is rejected rather than rendered.
//
// GeneralUser GS (S. Christian Collins, github.com/mrbumpy409/GeneralUser-GS):
// its licence lets anyone use it without restriction for their own music
// creation, private or commercial. See assets/GeneralUser-GS-LICENSE.txt.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/'
const FILES = [
  { path: 'GeneralUser-GS.sf2', to: 'GeneralUser-GS.sf2', size: 32319396, blob: '298b552d2e9d1307e03e5c5c99d2c046aaed9ec3' },
  { path: 'documentation/LICENSE.txt', to: 'GeneralUser-GS-LICENSE.txt', size: 2317, blob: 'f8fc9c58d7574f2b0ce6cea86ff49192540bcc33' },
]

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
mkdirSync(assets, { recursive: true })

const blobId = bytes =>
  createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')

for (const file of FILES) {
  const target = join(assets, file.to)
  if (existsSync(target) && blobId(readFileSync(target)) === file.blob) {
    console.log(`get-soundbank: ${file.to} already present and verified`)
    continue
  }
  const response = await fetch(BASE + file.path)
  if (!response.ok) throw new Error(`get-soundbank: ${file.path}: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length !== file.size || blobId(bytes) !== file.blob) {
    throw new Error(`get-soundbank: ${file.path}: got ${bytes.length} bytes that do not match the published blob ${file.blob}`)
  }
  writeFileSync(target, bytes)
  console.log(`get-soundbank: wrote ${file.to} (${bytes.length} bytes, verified)`)
}
