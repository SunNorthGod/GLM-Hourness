// Dry-parse the desktop profile patch with the upstream loader and report
// the composed rows (no plugin loading, no side effects).
import { loadOverlayPatches } from '../../deepseek-harness/packages/boot/app-boot/src/index.ts'

const patches = loadOverlayPatches('dsh', 'C:/Users/29596/.dsh/profiles/desktop/cordis.patch.yml')
for (const patch of patches) {
  if (patch.insert === undefined) continue
  for (const row of patch.insert) {
    console.log(`row: ${row.name as string}`)
  }
}
console.log('parsed ok:', patches.length, 'patches')
