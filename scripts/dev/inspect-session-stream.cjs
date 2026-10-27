const z = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')
const file = path.join(process.env.USERPROFILE, '.dsh', 'sessions', '--C-Users-29596-Desktop-Project-GLM-Hourness--', 'session-01792c0f-7e23-4a94-8cea-c9f84e67a75c', 'session.v4.jsonl.zstd')
const input = fs.createReadStream(file)
const decoder = input.pipe(z.createZstdDecompressStream ? z.createZstdDecompressStream() : z.createDecompressStream())
let raw = ''
decoder.on('data', chunk => { raw += chunk.toString('utf8') })
decoder.on('error', err => { console.error('stream error:', err.message); process.exit(1) })
decoder.on('end', () => {
  const lines = raw.trim().split('\n').filter(line => line.length > 0)
  console.log('lines:', lines.length, 'size:', raw.length)
  for (const key of ['You are ZCode', 'Reporting Depth', 'Session-specific guidance', '# Memory', 'ToolSearch', 'TodoWrite', 'memory_store', '重启', 'DeepSeek Harness Web GUI']) {
    console.log(key + ':', raw.includes(key))
  }
  const last = lines[lines.length - 1] ?? ''
  console.log('last-event:', last.slice(0, 240))
})
