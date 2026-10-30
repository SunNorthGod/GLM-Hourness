// Renders a composition to out/<id>[-<preset>].mp4 after regenerating its music.
// Scenes are laid out at their base size (Sample 1920x1080, Short 1080x1920);
// a preset only scales the output, so text and shapes stay sharp and the code
// does not change.
//
// Each composition has its own music pipeline: Sample uses the oscillator
// score from make-music.mjs; Short uses the sampled score from make-score.mjs,
// which needs the GeneralUser GS sound bank fetched by get-soundbank.mjs.
//
// Chrome is pointed at a project-local temp directory: on this machine the
// headless browser could not create its cache under the system %TEMP%, and
// the render then died partway with "write EOF".
//
// Usage: node scripts/render.mjs [compositionId] [1080p|2k|4k]   (defaults: Sample, 1080p)

import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PRESETS = {
  '1080p': { scale: '1', suffix: '' }, // Sample 1920x1080, Short 1080x1920
  '2k': { scale: String(4 / 3), suffix: '-2k' }, // Sample 2560x1440, Short 1440x2560
  '4k': { scale: '2', suffix: '-4k' }, // Sample 3840x2160, Short 2160x3840
}

const MUSIC = {
  Sample: ['make-music.mjs'],
  Short: ['get-soundbank.mjs', 'make-score.mjs'],
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const id = process.argv[2] ?? 'Sample'
const presetName = process.argv[3] ?? '1080p'
const preset = PRESETS[presetName]
if (!preset) {
  console.error(`render: unknown preset ${presetName}; use one of ${Object.keys(PRESETS).join(', ')}`)
  process.exit(2)
}
const music = MUSIC[id]
if (!music) {
  console.error(`render: no music pipeline for ${id}; known: ${Object.keys(MUSIC).join(', ')}`)
  process.exit(2)
}

const tmp = join(root, '.tmp')
mkdirSync(tmp, { recursive: true })
const env = { ...process.env, TEMP: tmp, TMP: tmp, TMPDIR: tmp }
const output = join('out', `${id}${preset.suffix}.mp4`)

// Only npx needs a shell on Windows (it is a .cmd file). Node itself is
// started directly: through a shell its path, under "C:\Program Files",
// would be split at the space.
const windows = process.platform === 'win32'
const steps = [
  ...music.map((script) => ({ cmd: process.execPath, args: [join(root, 'scripts', script)], shell: false })),
  { cmd: windows ? 'npx.cmd' : 'npx', args: ['remotion', 'render', id, output, `--scale=${preset.scale}`], shell: windows },
]
for (const { cmd, args, shell } of steps) {
  const result = spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit', shell })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log(`render: wrote ${output}`)
