const z = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')
const sessionsDir = path.join(process.env.USERPROFILE, '.dsh', 'sessions', '--C-Users-29596-Desktop-Project-GLM-Hourness--')
const dir = 'session-5e060c8f-4775-469d-a8d9-acacd7dbc19f'
const file = path.join(sessionsDir, dir, 'session.v4.jsonl.zstd')
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
for (const line of lines) {
  if (!line.includes('You are') && !line.includes('ZCode')) continue
  let event
  try { event = JSON.parse(line) } catch { continue }
  const text = JSON.stringify(event)
  console.log('--- type:', event.type, 'seq:', event.seq)
  console.log(text.slice(0, 1200))
}
