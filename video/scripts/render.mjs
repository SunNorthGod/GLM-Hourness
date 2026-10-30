// Renders a composition to out/<id>.mp4 after regenerating the music.
// Chrome is pointed at a project-local temp directory: on this machine the
// headless browser could not create its cache under the system %TEMP%, and
// the render then died partway with "write EOF".
//
// Usage: node scripts/render.mjs [compositionId]   (default: Sample)

import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const id = process.argv[2] ?? 'Sample'
const tmp = join(root, '.tmp')
mkdirSync(tmp, { recursive: true })
const env = { ...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp }

const steps = [
  [process.execPath, [join(root, 'scripts', 'make-music.mjs')]],
  [process.platform === 'win32' ? 'npx.cmd' : 'npx', ['remotion', 'render', id, join('out', `${id}.mp4`)]],
]
for (const [cmd, args] of steps) {
  const result = spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
