const z = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')
const file = path.join(process.env.USERPROFILE, '.dsh', 'sessions', '--C-Users-29596-Desktop-Project-GLM-Hourness--', 'session-01792c0f-7e23-4a94-8cea-c9f84e67a75c', 'session.v4.jsonl.zstd')
const buffer = fs.readFileSync(file)
let offset = 0
const lines = []
while (offset < buffer.length) {
  try {
    const out = z.zstdDecompressSync(buffer.subarray(offset), { maxOutputLength: 1 << 28 })
    for (const line of out.toString('utf8').trim().split('\n')) if (line.length > 0) lines.push(line)
    const nextMagic = buffer.indexOf(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), offset + 4)
    if (nextMagic === -1) break
    offset = nextMagic
  }
  catch { break }
}
console.log('lines:', lines.length)
for (const line of lines.slice(0, 6)) console.log(line.slice(0, 200))
console.log('...')
for (const line of lines.slice(-4)) console.log(line.slice(0, 240))
