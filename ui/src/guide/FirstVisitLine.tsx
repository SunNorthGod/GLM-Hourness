/**
 * The「第一次用？」line at the bottom of M3's wish card (plain-ui 1.3
 * §6.5): shown by the same rule as the guide page's auto-show
 * (state.ts firstVisit), it opens the panel tab, where the guide page
 * then stands instead of the home. The opening screen usually cannot
 * open a sidebar tab (no session surface is mounted), so a throw becomes
 * one grey sentence that is not clickable and tells the truth: the guide
 * appears by itself the first time the panel mounts after the first
 * message. Clicking the line records nothing.
 */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState, type ReactElement } from 'react'
import type { LoadedGraph } from '../../../src/graph/parse.ts'
import { firstVisit, graphHasHumanActorHistory } from './state.ts'

export function FirstVisitLine({ graph, openTab }: { readonly graph: LoadedGraph | undefined, readonly openTab: () => void }): ReactElement | null {
  const [fallenBack, setFallenBack] = useState(false)
  if (!firstVisit(window.localStorage, graph !== undefined && graphHasHumanActorHistory(graph))) return null
  if (fallenBack) return <div className="hw-hint">发出第一句话之后，在右侧栏打开「项目图」，上手说明会自己出现</div>
  const open = (): void => {
    try {
      openTab()
    }
    catch (error) {
      console.info('glm-hourness: the panel tab cannot open from the opening screen:', error)
      setFallenBack(true)
    }
  }
  return <Button variant="ghost" size="sm" onClick={open}>第一次用？看看项目图怎么用 ›</Button>
}
