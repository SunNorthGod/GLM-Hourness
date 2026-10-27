const z = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')
const sessionsDir = path.join(process.env.USERPROFILE, '.dsh', 'sessions', '--C-Users-29596-Desktop-Project-GLM-Hourness--')
for (const arg of process.argv.slice(2)) {
  const dir = fs.readdirSync(sessionsDir).find(name => name.startsWith(arg))
  if (dir === undefined) { console.log('not found:', arg); continue }
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
    let event
    try { event = JSON.parse(line) } catch { continue }
    if (event.type !== 'system/message') continue
    const text = (event.data.message.content ?? []).map(block => block.text ?? '').join('\n')
    console.log('===', dir.slice(0, 20), 'system/message total chars:', text.length)
    for (const key of ['You are an AI agent powered by DeepSeek Harness', 'You are ZCode', 'IMPORTANT: Assist with', '# Harness', '# Reporting Depth', '# Session-specific guidance', '# Memory', '# Context management', 'Some tools are deferred']) {
      console.log(`  '${key}':`, text.includes(key))
    }
    console.log('  first 200 chars:', JSON.stringify(text.slice(0, 200)))
  }
}
