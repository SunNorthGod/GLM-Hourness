const z = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')
const file = path.join(process.env.USERPROFILE, '.dsh', 'sessions', '--C-Users-29596-Desktop-Project-GLM-Hourness--', 'session-01792c0f-7e23-4a94-8cea-c9f84e67a75c', 'session.v4.jsonl.zstd')
const buffer = fs.readFileSync(file)
// Multi-frame zstd: feed frames sequentially until the buffer is consumed.
let offset = 0
let raw = ''
while (offset < buffer.length) {
  try {
    const out = z.zstdDecompressSync(buffer.subarray(offset), { maxOutputLength: 1 << 28 })
    raw += out.toString('utf8')
    // Advance past this frame: find how many bytes the decompressor consumed
    // by re-running with increasing slices is costly; instead rely on the
    // framing API: contentSize plus header. Simplest robust route: decompress
    // with streaming via ZstdDecompress context is unavailable, so fall back
    // to locating the next frame magic (0x28 B5 2F FD) after this one.
    const nextMagic = buffer.indexOf(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), offset + 4)
    if (nextMagic === -1) break
    offset = nextMagic
  }
  catch (error) {
    console.error('frame error at', offset, error.message)
    break
  }
}
console.log('decompressed size:', raw.length)
for (const key of ['You are ZCode', 'Reporting Depth', 'Session-specific guidance', '# Memory', 'ToolSearch', 'TodoWrite', 'memory_store', '重启']) {
  console.log(key + ':', raw.includes(key))
}
