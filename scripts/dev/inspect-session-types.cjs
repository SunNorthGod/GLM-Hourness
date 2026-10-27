const z = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')
const sessionsDir = path.join(process.env.USERPROFILE, '.dsh', 'sessions', '--C-Users-29596-Desktop-Project-GLM-Hourness--')
const targets = process.argv.slice(2)
for (const dir of fs.readdirSync(sessionsDir)) {
  if (targets.length > 0 && !targets.some(t => dir.includes(t))) continue
  const file = path.join(sessionsDir, dir, 'session.v4.jsonl.zstd')
  if (!fs.existsSync(file)) continue
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
  const types = new Map()
  for (const line of lines) {
    try {
      const event = JSON.parse(line)
      types.set(event.type, (types.get(event.type) ?? 0) + 1)
    }
    catch {}
  }
  console.log('===', dir, 'lines:', lines.length)
  console.log([...types.entries()].map(([type, count]) => `${type}×${count}`).join(' '))
  // look for any model-visible system/prompt markers
  const raw = lines.join('\n')
  for (const key of ['You are', 'ZCode', 'system', 'identity', 'prompt']) {
    const hits = lines.filter(line => line.includes(key)).length
    console.log(`contains '${key}':`, hits, 'lines')
  }
}
