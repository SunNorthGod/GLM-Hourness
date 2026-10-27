const z = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')
const sessionsDir = path.join(process.env.USERPROFILE, '.dsh', 'sessions', '--C-Users-29596-Desktop-Project-GLM-Hourness--')
for (const dir of fs.readdirSync(sessionsDir)) {
  const file = path.join(sessionsDir, dir, 'session.v4.jsonl.zstd')
  const plain = path.join(sessionsDir, dir, 'session.v4.jsonl')
  const target = fs.existsSync(file) ? file : (fs.existsSync(plain) ? plain : undefined)
  if (target === undefined) continue
  const raw = target.endsWith('.zstd')
    ? z.zstdDecompressSync(fs.readFileSync(target)).toString('utf8')
    : fs.readFileSync(target, 'utf8')
  const lines = raw.trim().split('\n')
  let first = '', last = ''
  try { first = JSON.stringify(JSON.parse(lines[0])).slice(0, 160) } catch { first = lines[0].slice(0, 160) }
  try { last = JSON.stringify(JSON.parse(lines[lines.length - 1])).slice(0, 200) } catch { last = lines[lines.length - 1].slice(0, 200) }
  console.log('---', dir, 'lines:', lines.length, 'size:', raw.length)
  console.log('first:', first)
  console.log('last:', last)
  for (const key of ['You are ZCode', 'Reporting Depth', 'ToolSearch', '重启', '"provider":"glm"', 'modelSelection']) {
    console.log(key + ':', raw.includes(key))
  }
}
