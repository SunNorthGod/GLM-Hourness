/**
 * The client faces' placement contract after the desktop 0.2.2-rc.3 drift
 * (.agents/tasks/rc3-ui/progress.md): the host primitives package dropped
 * useAnchoredPosition, so no ui/src source may reference it again (a
 * re-import renders the GLM pill and the wish button dead on rc.3), and the
 * two anchored dialogs (the GLM channel pill's, the wish button's popover)
 * must carry the CSS-anchor pair that places them natively on both rc.1 and
 * rc.3.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const uiRoot = fileURLToPath(new URL('../ui/src/', import.meta.url))

/** Every file under ui/src, recursively. */
function uiFiles(dir: string): string[] {
  const paths: string[] = []
  for (const name of readdirSync(dir)) {
    const path = `${dir}/${name}`
    if (statSync(path).isDirectory()) paths.push(...uiFiles(path))
    else paths.push(path)
  }
  return paths
}

test('no ui/src source references the useAnchoredPosition primitive rc.3 removed', () => {
  for (const path of uiFiles(uiRoot)) {
    const text = readFileSync(path, 'utf8')
    assert.ok(!text.includes('useAnchoredPosition'), `${path} still references useAnchoredPosition`)
  }
})

test('the two anchored dialogs place themselves through CSS anchors', () => {
  const channel = readFileSync(`${uiRoot}/channel.js`, 'utf8')
  assert.ok(channel.includes('anchor-name:var(--glmh-anchor)'), 'the GLM pill anchor lost its anchor-name')
  assert.ok(channel.includes('position-anchor:var(--glmh-anchor)'), 'the GLM dialog lost its position-anchor')
  const wish = readFileSync(`${uiRoot}/wish/styles.ts`, 'utf8')
  assert.ok(wish.includes('anchor-name:var(--hw-anchor)'), 'the wish anchor lost its anchor-name')
  assert.ok(wish.includes('position-anchor:var(--hw-anchor)'), 'the wish popover lost its position-anchor')
})
