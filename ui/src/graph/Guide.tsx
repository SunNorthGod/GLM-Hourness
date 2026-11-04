/**
 * The guide page of the panel (plain-ui 1.3 §6.4, mockup-onboarding.svg
 * right): six fixed blocks, at most four lines each, shown instead of the
 * home page on the first visit and reopenable from the footer's
 * 上手说明. The blocks' words are the design's, so the page reads as one
 * piece; the boards only contribute their one guideLine (blocks 4 and 5
 * exist only while their board is registered), and the peak sentences of
 * block 4 and the second sentence of block 6 appear only when the rules
 * board says peakApplies. The panel only looks: the page's one action is
 * 去首页, which records the visit and returns (跳过也是点它).
 */
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState, type ReactElement } from 'react'
import { GUIDE_KEY, writeStamp } from '../guide/state.ts'
import { useBoard } from './board-state.ts'
import { boards, type BoardState } from './boards.ts'
import { Part } from './common.tsx'

export interface GuideProps {
  readonly sessionId: string
  readonly onOpenBoard: (id: string) => void
  /** Record the visit and go back to the home page. */
  readonly onDone: () => void
}

/** The rules board's words when its peak mode applies to this workspace (§6.4 block 4). */
function PeakBlock({ state, onOpenBoard }: { readonly state: BoardState, readonly onOpenBoard: (id: string) => void }): ReactElement {
  return (
    <Part title="规则板">
      <div className="glmg-text">你定下的规矩都在这里，还有两道会拦住动作的门：合入前要跑的检查、必须全审的改动。插件带来的只能看。</div>
      {state.peakApplies
        ? (
            <>
              <div className="glmg-text">高峰模式：GLM 高峰时段更费积分，高峰模式有三档：无影响、少做、不做；默认是少做：高峰时少派活，练习题、对照实验、大的评审这类重活挪到高峰之后，必要的活照做。三档都不影响主 Agent：它任何时候都照常回你的话，高峰模式只管它派出去的子 agent 与重活。要改，跟主 Agent 说「高峰改成不做」，或在输入框打 /rules peak 不做。</div>
              {state.guideLine === null ? null : <div className="glmg-meta">{state.guideLine}</div>}
            </>
          )
        : null}
      <div className="glmg-actions"><button type="button" className="glmg-more" onClick={() => { onOpenBoard('rules') }}>去看规则板 ›</button></div>
    </Part>
  )
}

/** The loops board's block (§6.4 block 5); the board may have no line yet. */
function LoopsBlock({ state, onOpenBoard }: { readonly state: BoardState, readonly onOpenBoard: (id: string) => void }): ReactElement {
  return (
    <Part title="循环板">
      <div className="glmg-text">到点了或碰到某件事就自动去做的：改完文件就跑的检查、合入主干之后的完整检查、交回之后提醒派审查、晨报、周报、夜间巡检。插件带来的只能看；你可以让主 Agent 加自己的，例如服务器巡查。</div>
      {state.guideLine === null ? null : <div className="glmg-meta">{state.guideLine}</div>}
      <div className="glmg-actions"><button type="button" className="glmg-more" onClick={() => { onOpenBoard('loops') }}>去看循环板 ›</button></div>
    </Part>
  )
}

/** The 复制 /wish button of block 3 (§6.4): the result written beside it. */
function CopyWish(): ReactElement {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = (): void => {
    void writeClipboard('/wish').then(ok => { setCopied(ok ? 'copied' : 'failed') })
  }
  return (
    <div className="glmg-actions">
      <button type="button" className="glmg-more" onClick={copy}>复制 /wish</button>
      {copied === 'copied' ? <span className="glmg-meta">已复制</span> : copied === 'failed' ? <span className="glmg-meta">没有复制成功，自己在输入框打 /wish</span> : null}
    </div>
  )
}

/** The guide page's body (§6.4): the six blocks and the one button. */
export function GuidePage({ sessionId, onOpenBoard, onDone }: GuideProps): ReactElement {
  const rules = useBoard(boards().find(board => board.id === 'rules'), sessionId)
  const loops = useBoard(boards().find(board => board.id === 'loops'), sessionId)
  const done = (): void => {
    writeStamp(window.localStorage, GUIDE_KEY, new Date().toISOString())
    onDone()
  }
  return (
    <div className="glmg-view">
      <h2 className="glmg-card-title">项目图：给你看项目，细节不用你管</h2>
      <div className="glmg-meta">第一次打开时看一眼；以后在首页页脚「上手说明」里还能再看</div>
      <Part title="一眼看懂">
        <div className="glmg-text">首页告诉你离目标还差多少、接下来做什么、上次看之后变了什么。想知道为什么点「讲细点」，看够了点「说重点」；这两个按钮只改显示。</div>
      </Part>
      <Part title="你要做的只有回话">
        <div className="glmg-text">要你定的事，主 Agent 会在它的对话里问你，你说「可以」、补一句，或说「不行，因为……」；你随口说的它会先复述一遍再记下。这块面板只给你看，「需要你」一节列出在等你回话的事，点开就到主 Agent 的对话。面板上会见到的几个词：主 Agent（替你管这个项目的 agent，一个项目只有一个）、子 agent（它派出去干活的）、底账（agent 的工作记录，追问「凭什么」时看）。</div>
      </Part>
      <Part title="让主 Agent 接手">
        <div className="glmg-text">在输入框打 /wish，后面跟一句你想做的。主 Agent 先问清楚，再和你定下框架、分成哪几块、哪些方向不能变；每一块的设计给你看过、你同意了才开工，之后它自己推进到做完，只在必须问你的时候来问。</div>
        <div className="glmg-text">主 Agent 用强一点的模型；它派出去的子 agent 用什么模型由它选。</div>
        <CopyWish />
      </Part>
      {rules.available ? <PeakBlock state={rules} onOpenBoard={onOpenBoard} /> : null}
      {loops.available ? <LoopsBlock state={loops} onOpenBoard={onOpenBoard} /> : null}
      <Part title="去哪看进度">
        <div className="glmg-text">这块面板；主 Agent 对话里输入框上方的流程条；晨报和周报在主 Agent 的对话里，到点由系统提醒它写给你。每做完一块（一个模块或一个里程碑），主 Agent 用一两句告诉你；你不在时这些汇报先攒着，你回来时一起给你；整个目标做完时再给一句，带整体审查的结论。</div>
        {rules.available && rules.peakApplies ? <div className="glmg-text">额度用完时推进会停住，主 Agent 会告诉你，额度重置后自己接上，不用你开口。</div> : null}
      </Part>
      <div className="glmg-actions">
        <button type="button" className="glmg-more" onClick={done}>去首页</button>
        <span className="glmg-meta">跳过也是点它</span>
      </div>
    </div>
  )
}
