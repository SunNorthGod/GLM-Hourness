/**
 * GLM channel surfaces of the UI bundle's client half (ui/src/client.tsx
 * installs them next to the project graph tab).
 *
 * Two surfaces:
 *  - Settings page (`settings.section`): channel facts and command guidance.
 *  - Composer dock pill (`conversation.composer.dock`): live channel actions
 *    for the current session. The dock's props carry `sessionId`, so the pill
 *    drives the existing command surface through `ctx.remote.commands.execute`
 *    (`/glm-status`, `/glm-login`, `/glm-logout`); this reuses the Host
 *    command handlers instead of declaring a custom Remote service.
 *
 * Every command run is recorded in the receiving session's log and shown as
 * a command card, so the pill runs one only on a click, except once per app
 * run: the first open while no status is known reads it. The last status
 * read is shared by every pill (one per composer) with the time it was read.
 * The replies are read by ui/src/channel-model.ts.
 *
 * The static bundle's Client half receives only `require` (the module table),
 * not the dynamic-package `styles`/`host` builtins; styles render as a React
 * element (docs/DEVELOPMENT.md §5).
 */
import * as React from 'react'
import { createPortal } from 'react-dom'
import { Button, useDismissOnOutsidePointer, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  forgetGlmOnboarding, glmOnboardingDone, noteSessionSeen,
  parseHealth, recordGlmOnboardingDone, restOf, statusesOf, statusOf,
  writeSeenSessions,
} from './channel-model.ts'

/** Register the settings section and the composer pill; `ctx` carries slots and remote.commands. */
export function installChannel(ctx) {
  const h = React.createElement

  const CLIPBOARD_COMMAND = '/glm-login'
  /** The model picker's peer route names for this channel. */
  const ROUTE_CODING = 'GLM · 个人套餐（Coding Plan）'
  const ROUTE_START = 'GLM · 免费套餐（Start Plan）'
  const MODELS_TEXT = 'GLM-5.3 · GLM-5.3-Flash'
  const PLAN_LABELS = {
    'coding-plan': '个人套餐（Coding Plan）',
    'start-plan': '免费套餐（Start Plan）',
  }
  const planText = plan => (plan ? PLAN_LABELS[plan] ?? plan : '—')

  // Bound in apply(); components read through this closure.
  let runCommand = null

  // The last /glm-status read in this app run, shared by every pill: { status, statuses, health, rest, at } or null.
  let statusRead = null
  const statusListeners = new Set()
  const subscribeStatus = listener => {
    statusListeners.add(listener)
    return () => { statusListeners.delete(listener) }
  }
  const readStatus = () => statusRead
  const keepStatus = reply => {
    const status = statusOf(reply)
    const parsedStatuses = statusesOf(reply)
    const statuses = Array.isArray(parsedStatuses) ? parsedStatuses : null
    const health = reply.ok ? parseHealth(reply.text) : null
    const rest = health === null ? [] : restOf(reply.text)
    statusRead = { status, statuses, health, rest, at: Date.now() }
    for (const listener of statusListeners) listener()
    // 上手完成的一半（plain-ui 1.3 §6.3）：读到已登录就记下；已开着的那次对话框照旧显示上手块，关上之后恢复原样。
    const anyLogged = statuses !== null ? statuses.some(entry => entry.logged === true) : status !== null && status.logged === true
    if (anyLogged && glmOnboardingDone(window.localStorage) === undefined) keepObDone(new Date().toISOString())
  }
  const clearStatus = () => {
    statusRead = null
    for (const listener of statusListeners) listener()
  }

  // The onboarding record, shared by the pill, the hero button and the settings page (§6.3, §6.8).
  let obDone = glmOnboardingDone(window.localStorage) ?? null
  const obListeners = new Set()
  const subscribeOb = listener => {
    obListeners.add(listener)
    return () => { obListeners.delete(listener) }
  }
  const readOb = () => obDone
  const keepObDone = at => {
    if (obDone !== null) return
    obDone = at
    recordGlmOnboardingDone(window.localStorage, at)
    for (const listener of obListeners) listener()
  }
  const forgetOb = () => {
    obDone = null
    forgetGlmOnboarding(window.localStorage)
    for (const listener of obListeners) listener()
  }

  /**
   * Render guard: a slot entry that throws during render is retired from its
   * cell (the pill would vanish). This boundary keeps a working trigger on
   * screen and surfaces the failure text instead.
   */
  class PillBoundary extends React.Component {
    constructor(props) {
      super(props)
      this.state = { error: null }
    }

    static getDerivedStateFromError(error) {
      return { error }
    }

    render() {
      if (this.state.error !== null) {
        const message = this.state.error && this.state.error.message ? this.state.error.message : String(this.state.error)
        return h('span', { className: 'glmh-anchor' },
          h('style', null, CSS),
          h('span', { className: 'glmh-pill', title: message }, h(ChannelIcon), h('span', { className: 'glmh-pill-label' }, 'GLM ⚠')))
      }
      return this.props.children
    }
  }

  // Component-local styles render as a React element: the static bundle's
  // Client half gets only `require`, not the dynamic-package `styles`
  // builtin, and React removes the <style> on unmount. Pill and dialog
  // skins mirror ui-chat's StatsPills / stat-dialog modules (same tokens).
  // Accent and danger use the theme's state tokens, like the graph panel.
  const CSS = [
    ':is(.glmh-anchor,.glmh-dialog,.glmh-panel){--glmh-ink:var(--dsw-alias-label-primary,#e8e8e8);--glmh-ink2:var(--dsw-alias-label-secondary,#b5b5b5);--glmh-ink3:var(--dsw-alias-label-tertiary,#8a8a8a);--glmh-link:var(--dsw-alias-state-business-primary,#2f81f7);--glmh-hover:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));--glmh-border:var(--dsw-alias-border-l2,rgba(255,255,255,.08));--glmh-border-strong:var(--dsw-alias-border-l1,rgba(255,255,255,.1));--glmh-menu:var(--dsw-specific-menu,#232325)}',
    'body:not([data-ds-dark-theme]) :is(.glmh-anchor,.glmh-dialog,.glmh-panel){--glmh-ink:var(--dsw-alias-label-primary,#0f1115);--glmh-ink2:var(--dsw-alias-label-secondary,#61666b);--glmh-ink3:var(--dsw-alias-label-secondary,#61666b);--glmh-link:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4176e6) 80%,var(--dsw-alias-label-primary,#0f1115));--glmh-hover:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));--glmh-border:var(--dsw-alias-border-l2,rgba(0,0,0,.1));--glmh-border-strong:var(--dsw-alias-border-l1,rgba(0,0,0,.16));--glmh-menu:var(--dsw-specific-menu,#fff)}',
    // The anchor is the dock's flex item; it keeps the three letters whole while DSH's stats shrink beside it.
    '.glmh-anchor{display:inline-flex;flex:none;anchor-name:var(--glmh-anchor);font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}',
    '.glmh-pill{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;max-width:100%;padding:1px 8px;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--glmh-ink3);font:inherit;line-height:inherit;white-space:nowrap;cursor:pointer}',
    '.glmh-pill:hover{background:var(--glmh-hover);color:var(--glmh-ink2)}',
    '.glmh-pill[aria-expanded="true"]{background:var(--glmh-hover);color:var(--glmh-ink2)}',
    '.glmh-pill svg{width:14px;height:14px;flex:none}',
    '.glmh-pill-label{flex:none;overflow:visible}',
    // CSS anchors place the dialog above the trigger (8px gap), its left edge at
    // the trigger's left and its bottom clamped into the viewport (the shipped
    // stat dialog's band; rc.3 stat-dialog.module.css). The safe alignments fall
    // back to the band's start edge when the dialog would overflow the other one.
    '.glmh-dialog{position:fixed;z-index:1100;position-anchor:var(--glmh-anchor);box-sizing:border-box;top:max(12px,var(--dsh-frame-overlay-top,12px));bottom:calc(anchor(top) + 8px);left:anchor(left);right:12px;align-self:safe end;justify-self:safe start;width:fit-content;height:fit-content;margin:0;min-width:min(340px,calc(100vw - 24px));max-width:min(460px,calc(100vw - 24px));max-height:calc(anchor(top) - max(12px,var(--dsh-frame-overlay-top,12px)) - 8px);overflow-y:auto;padding:16px;border:0;border-radius:var(--dsw-radius-lg,12px);background:var(--glmh-menu);backdrop-filter:var(--dsw-menu-backdrop-filter,blur(24px));box-shadow:var(--dsw-elevation-prominent,0 12px 32px rgba(0,0,0,.45));font-size:12px;line-height:18px;color:var(--glmh-ink2);cursor:default}',
    '.glmh-dialog.glmh-dialog-centered{top:50%;bottom:auto;left:50%;right:auto;transform:translate(-50%,-50%);align-self:auto;justify-self:auto;max-height:calc(100dvh - 24px)}',
    '.glmh-dialog:focus{outline:none}',
    '.glmh-dialog-title{display:flex;justify-content:space-between;gap:16px;margin-bottom:8px;color:var(--glmh-ink);font-weight:500}',
    '.glmh-dialog-titlelabel{display:inline-flex;align-items:center;gap:6px;min-width:0}',
    '.glmh-dialog-titlelabel svg{width:14px;height:14px;flex:none}',
    '.glmh-dialog-titlevalue{color:var(--glmh-ink);font-variant-numeric:tabular-nums}',
    '.glmh-rule{margin-bottom:10px;border-top:0.5px solid var(--glmh-border)}',
    '.glmh-details{display:grid;grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;color:var(--glmh-ink3)}',
    '.glmh-details dt,.glmh-details dd{min-width:0;margin:0}',
    '.glmh-details dd{color:var(--glmh-ink2);font-variant-numeric:tabular-nums;text-align:right;overflow-wrap:anywhere}',
    '.glmh-details dd.glmh-err{color:var(--dsw-alias-state-error-primary,#f85149)}',
    '.glmh-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:0.5px solid var(--glmh-border)}',
    '.glmh-btn{height:24px;padding:0 8px;border-radius:var(--dsw-radius-sm,6px);border:none;background:transparent;color:var(--glmh-ink2);font:inherit;font-size:12px;line-height:1;cursor:pointer}',
    '.glmh-btn:hover{background:var(--glmh-hover);color:var(--glmh-ink)}',
    '.glmh-btn:disabled{opacity:.45;cursor:default}',
    '.glmh-btn-primary,.glmh-btn-primary:hover{color:var(--glmh-link)}',
    '.glmh-btn-danger,.glmh-btn-danger:hover{color:var(--dsw-alias-state-error-primary,#f85149)}',
    '.glmh-note{margin-top:8px;color:var(--glmh-ink2)}',
    '.glmh-out{max-height:180px;overflow:auto;margin:10px 0 0;padding-top:8px;border-top:0.5px solid var(--glmh-border);white-space:pre-wrap;overflow-wrap:anywhere;color:var(--glmh-ink3)}',
    '.glmh-err{color:var(--dsw-alias-state-error-primary,#f85149)}',
    '.glmh-link{color:var(--glmh-link);text-decoration:underline;word-break:break-all}',
    /* Row health of /glm-status: one line per row, its reason under it */
    '.glmh-health{max-height:220px;overflow:auto;margin-top:10px;padding-top:8px;border-top:0.5px solid var(--glmh-border)}',
    '.glmh-health-title{margin-bottom:6px;color:var(--glmh-ink);font-weight:500}',
    '.glmh-health-row{display:flex;justify-content:space-between;gap:16px;padding-top:4px}',
    '.glmh-health-name{color:var(--glmh-ink2)}',
    '.glmh-health-state{flex:none;color:var(--glmh-ink3)}',
    '.glmh-health-state.ok{color:var(--dsw-alias-state-success-primary,#3fb950)}',
    '.glmh-health-state.part{color:var(--dsw-alias-state-warn-primary,#d29922)}',
    '.glmh-health-state.off{color:var(--dsw-alias-state-error-primary,#f85149)}',
    '.glmh-health-reason{color:var(--glmh-ink3);overflow-wrap:anywhere}',
    /* Settings page: DSH's settings scale (内置插件 heading 18px/600; row titles 14/20, descriptions 12/18), values left-aligned under their labels */
    '.glmh-panel{display:flex;flex-direction:column;gap:12px;max-width:560px}',
    '.glmh-title{margin:0;color:var(--glmh-ink);font-size:18px;font-weight:600}',
    '.glmh-desc{margin:0;color:var(--glmh-ink2);font-size:13px;line-height:20px}',
    '.glmh-card{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:14px;border:1px solid var(--glmh-border-strong);border-radius:var(--dsw-radius-lg,12px)}',
    '.glmh-row{display:flex;flex-direction:column;gap:2px}',
    '.glmh-label{color:var(--glmh-ink);font-size:14px;line-height:20px}',
    '.glmh-value{color:var(--glmh-ink2);font-size:12px;line-height:18px;overflow-wrap:anywhere}',
    '.glmh-mono{font-family:var(--dsw-font-mono,ui-monospace,monospace)}',
    '.glmh-strong{color:var(--glmh-ink);font-weight:500;font-size:14px;line-height:20px}',
    '.glmh-list{margin:0;padding-left:18px;color:var(--glmh-ink2);font-size:13px;line-height:1.7}',
    /* Onboarding block (第一次用 GLM 通道) */
    '.glmh-ob{margin-bottom:10px;padding-bottom:10px;border-bottom:0.5px solid var(--glmh-border)}',
    '.glmh-ob-title{margin-bottom:6px;color:var(--glmh-ink);font-weight:500}',
    '.glmh-ob-step{display:flex;align-items:baseline;gap:8px;padding-top:3px}',
    '.glmh-ob-tick{flex:none;width:16px;height:16px;box-sizing:border-box;border:1px solid var(--glmh-border);border-radius:50%;color:var(--glmh-ink3);font-size:11px;line-height:14px;text-align:center}',
    '.glmh-ob-tick.glmh-ob-ok{border-color:var(--dsw-alias-state-success-primary,#3fb950);color:var(--dsw-alias-state-success-primary,#3fb950)}',
    '.glmh-ob-text{min-width:0;color:var(--glmh-ink2);overflow-wrap:anywhere}',
    '.glmh-ob-hint{margin-top:6px;color:var(--glmh-ink3)}',
    '.glmh-ob-skip{margin-top:4px}',
    /* Hero option: the small「GLM · 上手」button at the workspace row's end (plain-ui 1.3 §6.3) */
    '.glmh-hero{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 10px;border:none;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.08));color:var(--glmh-ink2);font:inherit;font-size:12px;line-height:1;cursor:pointer}',
    '.glmh-hero:hover{background:var(--glmh-hover);color:var(--glmh-ink)}',
    '.glmh-hero svg{width:13px;height:13px;flex:none}',
  ].join('\n')

  /** Render command output lines, turning http(s) URLs into links. */
  function OutputLines(props) {
    const lines = String(props.text).split('\n')
    return h('div', { className: props.failed ? 'glmh-out glmh-err' : 'glmh-out' },
      lines.map((line, index) => {
        const match = /(https?:\/\/\S+)/.exec(line)
        if (match === null) return h('div', { key: index }, line)
        const url = match[1]
        return h('div', { key: index },
          line.slice(0, match.index),
          h('a', { className: 'glmh-link', href: url, target: '_blank', rel: 'noreferrer' }, url),
          line.slice(match.index + url.length))
      }))
  }

  /** 14px channel glyph (matches the dock pill icon size). */
  function ChannelIcon() {
    return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
      h('circle', { cx: 8, cy: 8, r: 5.5, stroke: 'currentColor', strokeWidth: 1.4 }),
      h('circle', { cx: 8, cy: 8, r: 1.6, fill: 'currentColor' }))
  }

  const STATE_TONES = { 生效: 'ok', 部分生效: 'part', 未生效: 'off' }

  /**
   * The「第一次用 GLM 通道」block (plain-ui 1.3 §6.3): three steps, the
   * first ticked once a status read says logged in. `logged` is what the
   * last status read said; the block's own 登录 button is the pill's usual
   * action, and 跳过 records the end just the same.
   */
  function OnboardingBlock(props) {
    const step = (index, text, done, action) => h('div', { key: index, className: 'glmh-ob-step' },
      h('span', { className: done ? 'glmh-ob-tick glmh-ob-ok' : 'glmh-ob-tick' }, done ? '✓' : `${index}`),
      h('span', { className: 'glmh-ob-text' }, text),
      action === undefined ? null : h('button', { type: 'button', className: 'glmh-btn glmh-btn-primary', disabled: props.busy, onClick: props.login }, action))
    return h('div', { className: 'glmh-ob' },
      h('div', { className: 'glmh-ob-title' }, '第一次用 GLM 通道'),
      step(1, '登录 ZCode 账号：在浏览器里授权，链接 5 分钟内有效。', props.logged, '登录'),
      step(2, `在输入框右下角的模型选择器里，选「${ROUTE_CODING}」或「${ROUTE_START}」下的模型。`, false),
      step(3, '发一句话试试。', false),
      h('div', { className: 'glmh-ob-hint' }, '登录好以后这一块自己收起；设置 → GLM-Hourness 里能再打开'),
      h('div', { className: 'glmh-ob-skip' },
        h('button', { type: 'button', className: 'glmh-btn', disabled: props.busy, onClick: props.skip }, '跳过')))
  }

  /** The health rows as a list: name and state on a line, the reason under it. */
  function HealthList(props) {
    return h('div', { className: 'glmh-health' },
      h('div', { className: 'glmh-health-title' }, '各行健康（本会话）'),
      props.rows.map(entry => h(React.Fragment, { key: entry.row },
        h('div', { className: 'glmh-health-row' },
          h('span', { className: 'glmh-health-name' }, entry.row),
          h('span', { className: `glmh-health-state ${STATE_TONES[entry.state] ?? ''}` }, entry.state)),
        h('div', { className: 'glmh-health-reason' }, entry.reason))))
  }

  /** HH:MM of a time in milliseconds. */
  function clockText(at) {
    const date = new Date(at)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  /** Bind Escape-to-close with focus return + focus-on-open for one anchored dialog. */
  function useAnchoredDialogFocus(open, setOpen, triggerRef, panelRef) {
    React.useEffect(() => {
      if (!open) return undefined
      const onKeyDown = event => {
        if (event.key !== 'Escape') return
        setOpen(false)
        if (triggerRef.current !== null) triggerRef.current.focus()
      }
      document.addEventListener('keydown', onKeyDown)
      return () => { document.removeEventListener('keydown', onKeyDown) }
    }, [open, setOpen, triggerRef])

    React.useEffect(() => {
      if (open && panelRef.current !== null) panelRef.current.focus()
    }, [open, panelRef])
  }

  /** Composer-dock pill: a trigger opening the channel dialog, portaled to the document body and placed above the trigger. */
  function ChannelPill(props) {
    const [open, setOpen] = React.useState(false)
    const [busy, setBusy] = React.useState(false)
    const [output, setOutput] = React.useState(null)
    const [note, setNote] = React.useState(null)
    const [confirmLogout, setConfirmLogout] = React.useState(false)
    const [compact, setCompact] = React.useState(false)
    const read = React.useSyncExternalStore(subscribeStatus, readStatus)
    const anchorRef = React.useRef(null)
    const triggerRef = React.useRef(null)
    const panelRef = React.useRef(null)
    const sessionId = props.sessionId
    // The anchor name this pill instance carries: the trigger names itself and
    // the portaled dialog points back at it, the way the rc.3 client's model
    // select (ModelSelect.tsx) wires its own card; the dialog's placement is
    // the anchor band in CSS below. The primitives' measured placement hook is
    // gone on desktop 0.2.2-rc.3 and the renderer Chromium (152 on rc.1 as on
    // rc.3) supports CSS anchors, so the same bundle places itself on both
    // runtimes.
    const anchorStyle = { '--glmh-anchor': `--glmh-pill-${React.useId().replaceAll(':', '')}` }
    useDismissOnOutsidePointer(anchorRef, open, setOpen, panelRef)

    // Shorten the onboarding pill label when the dock container is narrow.
    React.useEffect(() => {
      const target = anchorRef.current !== null ? anchorRef.current.parentElement : null
      if (target === null || typeof window.ResizeObserver !== 'function') return undefined
      const update = width => { setCompact(width > 0 && width < 360) }
      update(target.clientWidth)
      const observer = new window.ResizeObserver(entries => {
        const entry = entries[0]
        if (entry !== undefined) update(entry.contentRect.width)
      })
      observer.observe(target)
      return () => { observer.disconnect() }
    }, [])

    // Escape closes and gives focus back to the trigger; focus moves into the dialog on open.
    useAnchoredDialogFocus(open, setOpen, triggerRef, panelRef)

    // 登出 asks once: the first click arms it for a few seconds.
    React.useEffect(() => {
      if (!confirmLogout) return undefined
      const timer = window.setTimeout(() => { setConfirmLogout(false) }, 4000)
      return () => { window.clearTimeout(timer) }
    }, [confirmLogout])

    const run = line => {
      if (runCommand === null) { setOutput({ text: '命令通道不可用', failed: true }); return }
      setBusy(true)
      setOutput(null)
      setNote(null)
      runCommand(sessionId, line).then(
        reply => {
          setBusy(false)
          setOutput({ text: reply.text, failed: !reply.ok })
          if (line === '/glm-status') keepStatus(reply)
          // A login reply carries the authorize URL; the status is read when the human says the browser is done.
          if (line === '/glm-login' && reply.ok) setNote('授权完成后点「刷新状态」')
          if (line === '/glm-logout' && reply.ok) clearStatus()
        },
        error => { setBusy(false); setOutput({ text: String(error && error.message ? error.message : error).slice(0, 240), failed: true }) },
      )
    }

    // The only automatic run: the first open of this app run, while no pill has read the status yet.
    React.useEffect(() => {
      if (open && readStatus() === null) run('/glm-status')
    }, [open])

    const toggle = () => {
      if (!open) setObOpen(obDoneValue === null)
      setOpen(!open)
    }
    const skipOb = () => {
      keepObDone(new Date().toISOString())
      setObOpen(false)
      if (triggerRef.current !== null) triggerRef.current.focus()
    }
    const detail = (label, value, className, keySuffix) => {
      const k = keySuffix ?? label
      return [
        h('dt', { key: `d${k}` }, label),
        h('dd', { key: `v${k}`, className }, value),
      ]
    }
    // The onboarding decision freezes at open: a 登录 that completes while the dialog is open keeps the block visible with its first step ticked, until the dialog closes (plain-ui 1.3 §6.3).
    const [obOpen, setObOpen] = React.useState(null)
    const obDoneValue = React.useSyncExternalStore(subscribeOb, readOb)
    const status = read === null ? null : read.status
    const statuses = read === null ? null : read.statuses
    const stateOfEntry = entry => entry.unknown !== undefined ? '未知' : entry.logged ? '已登录' : '未登录'
    const reasonOfEntry = entry => entry.unknown ?? (entry.incomplete === undefined ? undefined : `登录不完整：${entry.incomplete}`)
    const anyLogged = statuses !== null ? statuses.some(entry => entry.logged) : status !== null && status.logged === true
    const stateText = status === null
      ? (busy ? '检查中…' : '未知')
      : statuses !== null && statuses.length > 1
        ? (anyLogged ? '已登录' : '未登录')
        : stateOfEntry(status)
    const reason = status === null ? undefined : reasonOfEntry(status)
    // Preserve quota/health lines from the shared statusRead across dialog reopens and non-status outputs.
    const outputHealth = output === null || output.failed ? null : parseHealth(output.text)
    const outputRest = outputHealth === null ? [] : restOf(output.text)
    const isStatusOutput = output !== null && !output.failed && outputHealth !== null
    const health = outputHealth ?? (read === null ? null : read.health)
    const rest = outputHealth !== null ? outputRest : (read === null ? [] : read.rest)
    const pillText = obDoneValue === null && !compact ? 'GLM · 上手' : 'GLM'

    const routeRows = () => {
      if (statuses !== null && statuses.length > 1) {
        return statuses.flatMap((entry, index) => {
          const prefix = planText(entry.plan)
          const r = reasonOfEntry(entry)
          return [
            ...detail(`${prefix}状态`, stateOfEntry(entry), undefined, `r${index}-s`),
            ...(r === undefined ? [] : detail(`${prefix}原因`, r, undefined, `r${index}-r`)),
            ...(entry.loginError ? detail(`${prefix}登录错误`, entry.loginError, 'glmh-err', `r${index}-e`) : []),
            ...(entry.key !== undefined || entry.plan !== 'start-plan' ? detail(`${prefix}Key`, entry.key ? entry.key : '—', undefined, `r${index}-k`) : []),
            ...(entry.userId ? detail(`${prefix}账号`, entry.userId, undefined, `r${index}-u`) : []),
            ...(entry.jwt ? detail(`${prefix}JWT`, `已用 ${entry.jwt} 小时`, undefined, `r${index}-j`) : []),
          ]
        })
      }
      return [
        ...detail('状态', stateText),
        ...(reason === undefined ? [] : detail('原因', reason)),
        ...(status !== null && status.loginError ? detail('上次登录错误', status.loginError, 'glmh-err') : []),
        ...detail('套餐', status !== null && status.plan ? planText(status.plan) : '—'),
        ...detail('Key', status !== null && status.key ? status.key : '—'),
        ...(status !== null && status.userId ? detail('账号', status.userId) : []),
        ...(status !== null && status.jwt ? detail('JWT', `已用 ${status.jwt} 小时`) : []),
      ]
    }

    const dialog = h('div', {
      ref: panelRef, className: 'glmh-dialog', role: 'dialog', 'aria-label': 'GLM 通道', tabIndex: -1,
      style: anchorStyle,
    },
    h('div', { className: 'glmh-dialog-title' },
      h('span', { className: 'glmh-dialog-titlelabel' }, h(ChannelIcon), 'GLM 通道'),
      h('span', { className: 'glmh-dialog-titlevalue' }, stateText),
    ),
    obOpen === true
      ? h(OnboardingBlock, { logged: anyLogged, busy, login: () => { run('/glm-login') }, skip: skipOb })
      : null,
    h('div', { className: 'glmh-rule' }),
    h('dl', { className: 'glmh-details' },
      ...routeRows(),
      ...(read === null ? [] : detail('读取于', clockText(read.at))),
      ...detail('路由', `${ROUTE_CODING} / ${ROUTE_START}`),
      ...detail('模型', MODELS_TEXT),
      ...detail('凭证', '本机加密存储'),
    ),
    output === null || isStatusOutput ? null : h(OutputLines, { text: output.text, failed: output.failed }),
    health === null && rest.length === 0 ? null : h(React.Fragment, null,
      rest.length === 0 ? null : h(OutputLines, { text: rest.join('\n'), failed: false }),
      health === null ? null : h(HealthList, { rows: health })),
    note === null ? null : h('div', { className: 'glmh-note' }, note),
    h('div', { className: 'glmh-actions' },
      h('button', { type: 'button', className: 'glmh-btn glmh-btn-primary', disabled: busy, onClick: () => run('/glm-login') }, '登录'),
      h('button', { type: 'button', className: 'glmh-btn', disabled: busy, onClick: () => run('/glm-status') }, '刷新状态'),
      h('button', {
        type: 'button', className: 'glmh-btn glmh-btn-danger', disabled: busy,
        onClick: () => { if (confirmLogout) { setConfirmLogout(false); run('/glm-logout') } else setConfirmLogout(true) },
      }, confirmLogout ? '再点一次确认登出' : '登出'),
    ))

    return h('span', { className: 'glmh-anchor', ref: anchorRef, style: anchorStyle },
      h('style', null, CSS),
      h('button', {
        ref: triggerRef, type: 'button', className: 'glmh-pill', 'aria-haspopup': 'dialog', 'aria-expanded': open ? 'true' : 'false',
        'aria-label': obDoneValue === null ? 'GLM · 上手' : 'GLM',
        title: obDoneValue === null ? 'GLM · 上手' : 'GLM',
        onClick: toggle,
      }, h(ChannelIcon), h('span', { className: 'glmh-pill-label' }, pillText)),
      open ? createPortal(dialog, document.body) : null,
    )
  }

  /** The opening screen's「GLM · 上手」(§6.3): its own dialog; no automatic /glm-status read - only the 登录 click runs a command. */
  /** noteSessionSeen plus the done write: the third distinct session ends the onboarding (§6.3). */
  function noteSessionSeenDone(storage, sessionId) {
    const { seen, done } = noteSessionSeen(storage, sessionId)
    return { seen, finished: done }
  }

  function HeroOnboarding(props) {
    const [open, setOpen] = React.useState(false)
    const [busy, setBusy] = React.useState(false)
    const [output, setOutput] = React.useState(null)
    const done = React.useSyncExternalStore(subscribeOb, readOb)
    const read = React.useSyncExternalStore(subscribeStatus, readStatus)
    const anchorRef = React.useRef(null)
    const triggerRef = React.useRef(null)
    const panelRef = React.useRef(null)
    const sessionId = props.sessionId
    useDismissOnOutsidePointer(anchorRef, open, setOpen, panelRef)
    const closeHero = () => {
      setOpen(false)
      if (triggerRef.current !== null) triggerRef.current.focus()
    }
    useAnchoredDialogFocus(open, setOpen, triggerRef, panelRef)
    // 每次出现记下这个会话；第 3 个不同的会话之后自动收起（§6.3）。
    React.useEffect(() => {
      if (done !== null) return undefined
      const { seen, finished } = noteSessionSeenDone(window.localStorage, sessionId)
      if (seen.length > 0) writeSeenSessions(window.localStorage, seen)
      if (finished) keepObDone(new Date().toISOString())
      return undefined
    }, [sessionId, done])
    if (done !== null) return null
    const run = line => {
      if (runCommand === null) { setOutput({ text: '命令通道不可用', failed: true }); return }
      setBusy(true)
      setOutput(null)
      runCommand(sessionId, line).then(
        reply => {
          setBusy(false)
          setOutput({ text: reply.text, failed: !reply.ok })
          if (reply.ok && line === '/glm-login') setOutput({ text: reply.text + '\n授权完成后回到会话，点输入框下方的 GLM 按钮看状态。', failed: false })
        },
        error => { setBusy(false); setOutput({ text: String(error && error.message ? error.message : error).slice(0, 240), failed: true }) },
      )
    }
    const logged = read !== null && (
      read.statuses !== null
        ? read.statuses.some(entry => entry.logged)
        : read.status !== null && read.status.logged === true
    )
    return h('span', { className: 'glmh-anchor', ref: anchorRef },
      h('style', null, CSS),
      h('button', {
        ref: triggerRef, type: 'button', className: 'glmh-hero',
        'aria-haspopup': 'dialog', 'aria-expanded': open ? 'true' : 'false',
        onClick: () => { setOpen(true) },
      }, h(ChannelIcon), 'GLM · 上手'),
      open ? createPortal(h('div', {
        ref: panelRef, className: 'glmh-dialog glmh-dialog-centered', role: 'dialog', 'aria-label': 'GLM · 上手', tabIndex: -1,
      },
        h('div', { className: 'glmh-dialog-title' }, h('span', { className: 'glmh-dialog-titlelabel' }, h(ChannelIcon), 'GLM · 上手')),
        h(OnboardingBlock, { logged, busy, login: () => { run('/glm-login') }, skip: () => { keepObDone(new Date().toISOString()); closeHero() } }),
        output === null ? null : h(OutputLines, { text: output.text, failed: output.failed }),
        h('div', { className: 'glmh-actions' },
          h('button', { type: 'button', className: 'glmh-btn', onClick: closeHero }, '关上')),
      ), document.body) : null,
    )
  }

  /**
   * Settings section: static facts and where to act. It has no session, and
   * commands run in one, so live status stays in the composer's GLM pill.
   */
  function Panel() {
    const [copy, setCopy] = React.useState('idle')
    React.useEffect(() => {
      if (copy !== 'copied') return undefined
      const timer = window.setTimeout(() => { setCopy('idle') }, 1500)
      return () => { window.clearTimeout(timer) }
    }, [copy])
    const copyCommand = () => { void writeClipboard(CLIPBOARD_COMMAND).then(ok => { setCopy(ok ? 'copied' : 'failed') }) }
    const isWindows = typeof navigator === 'object' && /win/i.test(navigator.platform || navigator.userAgent || '')
    const defaultCredPath = isWindows
      ? '%USERPROFILE%\\.dsh\\glm-hourness\\credentials.json'
      : '~/.dsh/glm-hourness/credentials.json'
    // A fact: its label, then its value lines under it; only a path is monospace.
    const row = (label, ...lines) => h('div', { className: 'glmh-row' },
      h('span', { className: 'glmh-label' }, label),
      ...lines.map(([text, mono], index) => h('span', { key: index, className: mono ? 'glmh-value glmh-mono' : 'glmh-value' }, text)))
    return h('div', { className: 'glmh-panel' },
      h('style', null, CSS),
      h('h2', { className: 'glmh-title' }, 'GLM-Hourness 通道'),
      h('p', { className: 'glmh-desc' }, `原生 ZCode 客户端通道，提供两条平级路由：「${ROUTE_CODING}」（项目令牌鉴权）与「${ROUTE_START}」（JWT 鉴权）。登录凭证加密保存在本机。`),
      h('div', { className: 'glmh-card' },
        row('路由与模型', [`${ROUTE_CODING}（GLM-5.3、GLM-5.3-Flash）`], [`${ROUTE_START}（GLM-5.3、GLM-5.3-Flash，优先走 Start Plan，不可用时自动回退至 Coding Plan）`]),
        row('凭证存放', [defaultCredPath, true], ['设置了 DSH_HOME 时位于 $DSH_HOME/glm-hourness/credentials.json。']),
        row('登录有效期', ['coding-plan 的项目令牌按 ZCode 方式自动续期；OAuth 登录或 start-plan 的 JWT 失效后均需重新 /glm-login。']),
      ),
      h('div', { className: 'glmh-card' },
        h('div', { className: 'glmh-strong' }, '登录与状态'),
        h('p', { className: 'glmh-desc' }, '在会话输入框下方的 GLM 按钮里登录、查看状态。也可以在会话输入框里执行命令：'),
        h('ul', { className: 'glmh-list' },
          h('li', null, '/glm-login — 打开浏览器授权，完成登录'),
          h('li', null, '/glm-status — 查看登录状态、项目 key 预览与各行健康'),
          h('li', null, '/glm-logout — 清除本机凭证'),
        ),
        h(Button, { variant: 'primary', size: 'sm', onClick: copyCommand }, copy === 'copied' ? '已复制 /glm-login' : '复制 /glm-login'),
        copy === 'failed' ? h('p', { className: 'glmh-desc glmh-err', role: 'status' }, '复制失败，请在会话输入框里手动输入 /glm-login。') : null,
      ),
      h('div', { className: 'glmh-card' },
        h('div', { className: 'glmh-strong' }, '上手'),
        h('p', { className: 'glmh-desc' }, '「GLM · 上手」的说明看过一次就不再自动出现；要再看一遍，点这里，输入框下方的按钮与开场画面的小按钮会重新出现。'),
        h(Button, { variant: 'outline', size: 'sm', onClick: () => { forgetOb() } }, '重新看上手说明'),
      ),
      h('p', { className: 'glmh-desc' }, `模型选择：在会话的模型选择器里选「${ROUTE_START}」（默认优先，自动回退）或「${ROUTE_CODING}」下的 GLM-5.3、GLM-5.3-Flash。`),
    )
  }

  /** Run one command line for a session: its text, whether it succeeded, and `missing` when no row registers the command. */
  runCommand = (sessionId, line) => ctx.remote.commands.execute(sessionId, line, []).then(result => {
    if (!result.ok) throw new Error(`命令没有执行：${result.error.message}`)
    if (result.value === undefined) return { ok: false, missing: true, text: `${line} 不可用：glm-login 行没有加载` }
    const outcome = result.value.result
    return { ok: outcome.kind === 'success', missing: false, text: outcome.text ?? (outcome.kind === 'success' ? '完成。' : '执行失败。') }
  })
  // The section label is the bundle's name as the plugin manager shows it. The settings shell picks nav icons by
  // section id (dsh-client-ui-settings-general navIcon), so a third-party section cannot bring its own.
  const disposers = [
    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section', id: 'glm-hourness-ui', order: 60, label: 'GLM-Hourness',
    }, Panel)),
    ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
      name: 'conversation.composer.dock', id: 'glm-channel', order: 150, label: 'GLM 通道',
    }, props => h(PillBoundary, null, h(ChannelPill, props)))),
    // 开场画面的小按钮（plain-ui 1.3 §6.3）：本机没有上手记录时出现；读到已登录、跳过或第 3 个会话之后记录写下，槽位返回 null，容器不再占位。
    ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
      name: 'conversation.hero.options', id: 'glm-onboarding', order: 150, label: 'GLM · 上手',
      inject: sessionId => ({ sessionId }),
    }, props => h(HeroOnboarding, props))),
  ]
  return () => {
    for (const dispose of disposers) {
      if (typeof dispose === 'function') dispose()
    }
  }
}
