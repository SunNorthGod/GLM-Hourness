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
import { Button, useAnchoredPosition, useDismissOnOutsidePointer, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import { parseHealth, restOf, statusOf } from './channel-model.ts'

/** Register the settings section and the composer pill; `ctx` carries slots and remote.commands. */
export function installChannel(ctx) {
  const h = React.createElement

  const CLIPBOARD_COMMAND = '/glm-login'
  /** The model picker's group name of this channel (src/glm-llm/zcode.ts PROVIDER_DISPLAY_NAME). */
  const PROVIDER_NAME = 'GLM（ZCode 原生通道）'

  // Bound in apply(); components read through this closure.
  let runCommand = null

  // The last /glm-status read in this app run, shared by every pill: { status, at } or null.
  let statusRead = null
  const statusListeners = new Set()
  const subscribeStatus = listener => {
    statusListeners.add(listener)
    return () => { statusListeners.delete(listener) }
  }
  const readStatus = () => statusRead
  const keepStatus = status => {
    statusRead = { status, at: Date.now() }
    for (const listener of statusListeners) listener()
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
    // The anchor is the dock's flex item; it keeps the three letters whole while DSH's stats shrink beside it.
    '.glmh-anchor{display:inline-flex;flex:none;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}',
    '.glmh-pill{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;max-width:100%;padding:1px 8px;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary,#8a8a8a);font:inherit;line-height:inherit;white-space:nowrap;cursor:pointer}',
    '.glmh-pill:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-secondary,#b5b5b5)}',
    '.glmh-pill[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-secondary,#b5b5b5)}',
    '.glmh-pill svg{width:14px;height:14px;flex:none}',
    '.glmh-pill-label{flex:none;overflow:visible}',
    '.glmh-dialog{position:fixed;z-index:1100;box-sizing:border-box;width:max-content;min-width:min(340px,calc(100vw - 24px));max-width:min(460px,calc(100vw - 24px));padding:16px;border:0;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,#232325);backdrop-filter:var(--dsw-menu-backdrop-filter,blur(24px));box-shadow:var(--dsw-elevation-prominent,0 12px 32px rgba(0,0,0,.45));font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#b5b5b5);cursor:default}',
    '.glmh-dialog:focus{outline:none}',
    '.glmh-dialog-title{display:flex;justify-content:space-between;gap:16px;margin-bottom:8px;color:var(--dsw-alias-label-primary,#e8e8e8);font-weight:500}',
    '.glmh-dialog-titlelabel{display:inline-flex;align-items:center;gap:6px;min-width:0}',
    '.glmh-dialog-titlelabel svg{width:14px;height:14px;flex:none}',
    '.glmh-dialog-titlevalue{color:var(--dsw-alias-label-primary,#e8e8e8);font-variant-numeric:tabular-nums}',
    '.glmh-rule{margin-bottom:10px;border-top:0.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08))}',
    '.glmh-details{display:grid;grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
    '.glmh-details dt,.glmh-details dd{min-width:0;margin:0}',
    '.glmh-details dd{color:var(--dsw-alias-label-secondary,#b5b5b5);font-variant-numeric:tabular-nums;text-align:right;overflow-wrap:anywhere}',
    '.glmh-details dd.glmh-err{color:var(--dsw-alias-state-error-primary,#f85149)}',
    '.glmh-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:0.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08))}',
    '.glmh-btn{height:24px;padding:0 8px;border-radius:var(--dsw-radius-sm,6px);border:none;background:transparent;color:var(--dsw-alias-label-secondary,#b5b5b5);font:inherit;font-size:12px;line-height:1;cursor:pointer}',
    '.glmh-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-primary,#e8e8e8)}',
    '.glmh-btn:disabled{opacity:.45;cursor:default}',
    '.glmh-btn-primary,.glmh-btn-primary:hover{color:var(--dsw-alias-state-business-primary,#2f81f7)}',
    '.glmh-btn-danger,.glmh-btn-danger:hover{color:var(--dsw-alias-state-error-primary,#f85149)}',
    '.glmh-note{margin-top:8px;color:var(--dsw-alias-label-secondary,#b5b5b5)}',
    '.glmh-out{max-height:180px;overflow:auto;margin:10px 0 0;padding-top:8px;border-top:0.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
    '.glmh-err{color:var(--dsw-alias-state-error-primary,#f85149)}',
    '.glmh-link{color:var(--dsw-alias-state-business-primary,#2f81f7);text-decoration:underline;word-break:break-all}',
    /* Row health of /glm-status: one line per row, its reason under it */
    '.glmh-health{max-height:220px;overflow:auto;margin-top:10px;padding-top:8px;border-top:0.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08))}',
    '.glmh-health-title{margin-bottom:6px;color:var(--dsw-alias-label-primary,#e8e8e8);font-weight:500}',
    '.glmh-health-row{display:flex;justify-content:space-between;gap:16px;padding-top:4px}',
    '.glmh-health-name{color:var(--dsw-alias-label-secondary,#b5b5b5)}',
    '.glmh-health-state{flex:none;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
    '.glmh-health-state.ok{color:var(--dsw-alias-state-success-primary,#3fb950)}',
    '.glmh-health-state.part{color:var(--dsw-alias-state-warn-primary,#d29922)}',
    '.glmh-health-state.off{color:var(--dsw-alias-state-error-primary,#f85149)}',
    '.glmh-health-reason{color:var(--dsw-alias-label-tertiary,#8a8a8a);overflow-wrap:anywhere}',
    /* Settings page: DSH's settings scale (内置插件 heading 18px/600; row titles 14/20, descriptions 12/18), values left-aligned under their labels */
    '.glmh-panel{display:flex;flex-direction:column;gap:12px;max-width:560px}',
    '.glmh-title{margin:0;color:var(--dsw-alias-label-primary,#e8e8e8);font-size:18px;font-weight:600}',
    '.glmh-desc{margin:0;color:var(--dsw-alias-label-secondary,#b5b5b5);font-size:13px;line-height:20px}',
    '.glmh-card{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:14px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));border-radius:var(--dsw-radius-lg,12px)}',
    '.glmh-row{display:flex;flex-direction:column;gap:2px}',
    '.glmh-label{color:var(--dsw-alias-label-primary,#e8e8e8);font-size:14px;line-height:20px}',
    '.glmh-value{color:var(--dsw-alias-label-secondary,#b5b5b5);font-size:12px;line-height:18px;overflow-wrap:anywhere}',
    '.glmh-mono{font-family:var(--dsw-font-mono,ui-monospace,monospace)}',
    '.glmh-strong{color:var(--dsw-alias-label-primary,#e8e8e8);font-weight:500;font-size:14px;line-height:20px}',
    '.glmh-list{margin:0;padding-left:18px;color:var(--dsw-alias-label-secondary,#b5b5b5);font-size:13px;line-height:1.7}',
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

  /** Composer-dock pill: a trigger opening the channel dialog, portaled to the document body and placed above the trigger. */
  function ChannelPill(props) {
    const [open, setOpen] = React.useState(false)
    const [busy, setBusy] = React.useState(false)
    const [output, setOutput] = React.useState(null)
    const [note, setNote] = React.useState(null)
    const [confirmLogout, setConfirmLogout] = React.useState(false)
    const read = React.useSyncExternalStore(subscribeStatus, readStatus)
    const anchorRef = React.useRef(null)
    const triggerRef = React.useRef(null)
    const panelRef = React.useRef(null)
    const sessionId = props.sessionId
    // The measured dialog is clamped into the viewport (the shipped stat dialogs' placement and outside-close).
    const pos = useAnchoredPosition({ open, anchorRef, panelRef, side: 'top', gap: 8, margin: 12 })
    useDismissOnOutsidePointer(anchorRef, open, setOpen, panelRef)

    // Escape closes and gives focus back to the trigger.
    React.useEffect(() => {
      if (!open) return undefined
      const onKeyDown = event => {
        if (event.key !== 'Escape') return
        setOpen(false)
        if (triggerRef.current !== null) triggerRef.current.focus()
      }
      document.addEventListener('keydown', onKeyDown)
      return () => { document.removeEventListener('keydown', onKeyDown) }
    }, [open])

    // Focus moves into the dialog once it is placed (it is hidden while measured).
    const placed = pos !== null && pos !== undefined
    React.useEffect(() => {
      if (open && placed && panelRef.current !== null) panelRef.current.focus()
    }, [open, placed])

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
          if (line === '/glm-status') keepStatus(statusOf(reply))
          // A login reply carries the authorize URL; the status is read when the human says the browser is done.
          if (line === '/glm-login' && reply.ok) setNote('授权完成后点「刷新状态」')
          if (line === '/glm-logout' && reply.ok) keepStatus({ logged: false, plan: read !== null && read.status.plan ? read.status.plan : null })
        },
        error => { setBusy(false); setOutput({ text: String(error && error.message ? error.message : error).slice(0, 240), failed: true }) },
      )
    }

    // The only automatic run: the first open of this app run, while no pill has read the status yet.
    React.useEffect(() => {
      if (open && readStatus() === null) run('/glm-status')
    }, [open])

    const toggle = () => { setOpen(!open) }
    const detail = (label, value, className) => [
      h('dt', { key: `d${label}` }, label),
      h('dd', { key: `v${label}`, className }, value),
    ]
    const status = read === null ? null : read.status
    const stateText = status === null ? (busy ? '检查中…' : '未知') : status.unknown !== undefined ? '未知' : status.logged ? '已登录' : '未登录'
    const reason = status === null ? undefined : status.unknown ?? (status.incomplete === undefined ? undefined : `登录不完整：${status.incomplete}`)
    // A status reply shows as the health list; its lines that are neither a field nor a health row stay above it.
    const health = output === null || output.failed ? null : parseHealth(output.text)
    const rest = health === null ? [] : restOf(output.text)

    const dialog = h('div', {
      ref: panelRef, className: 'glmh-dialog', role: 'dialog', 'aria-label': 'GLM 通道', tabIndex: -1,
      style: placed ? pos : { visibility: 'hidden', left: 0, top: 0 },
    },
    h('div', { className: 'glmh-dialog-title' },
      h('span', { className: 'glmh-dialog-titlelabel' }, h(ChannelIcon), 'GLM 通道'),
      h('span', { className: 'glmh-dialog-titlevalue' }, stateText),
    ),
    h('div', { className: 'glmh-rule' }),
    h('dl', { className: 'glmh-details' },
      ...detail('状态', stateText),
      ...(reason === undefined ? [] : detail('原因', reason)),
      ...(status !== null && status.loginError ? detail('上次登录错误', status.loginError, 'glmh-err') : []),
      ...detail('套餐', status !== null && status.plan ? status.plan : '—'),
      ...detail('Key', status !== null && status.key ? status.key : '—'),
      ...(status !== null && status.userId ? detail('账号', status.userId) : []),
      ...(status !== null && status.jwt ? detail('JWT', `已用 ${status.jwt} 小时`) : []),
      ...(read === null ? [] : detail('读取于', clockText(read.at))),
      ...detail('模型', 'GLM-5.3 · GLM-5.3-Flash'),
      ...detail('凭证', '本机加密存储'),
    ),
    output === null ? null : health === null
      ? h(OutputLines, { text: output.text, failed: output.failed })
      : h(React.Fragment, null,
          rest.length === 0 ? null : h(OutputLines, { text: rest.join('\n'), failed: false }),
          h(HealthList, { rows: health })),
    note === null ? null : h('div', { className: 'glmh-note' }, note),
    h('div', { className: 'glmh-actions' },
      h('button', { type: 'button', className: 'glmh-btn glmh-btn-primary', disabled: busy, onClick: () => run('/glm-login') }, '登录'),
      h('button', { type: 'button', className: 'glmh-btn', disabled: busy, onClick: () => run('/glm-status') }, '刷新状态'),
      h('button', {
        type: 'button', className: 'glmh-btn glmh-btn-danger', disabled: busy,
        onClick: () => { if (confirmLogout) { setConfirmLogout(false); run('/glm-logout') } else setConfirmLogout(true) },
      }, confirmLogout ? '再点一次确认登出' : '登出'),
    ))

    return h('span', { className: 'glmh-anchor', ref: anchorRef },
      h('style', null, CSS),
      h('button', {
        ref: triggerRef, type: 'button', className: 'glmh-pill', 'aria-haspopup': 'dialog', 'aria-expanded': open ? 'true' : 'false',
        onClick: toggle,
      }, h(ChannelIcon), h('span', { className: 'glmh-pill-label' }, 'GLM')),
      open ? createPortal(dialog, document.body) : null,
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
    // A fact: its label, then its value lines under it; only a path is monospace.
    const row = (label, ...lines) => h('div', { className: 'glmh-row' },
      h('span', { className: 'glmh-label' }, label),
      ...lines.map(([text, mono], index) => h('span', { key: index, className: mono ? 'glmh-value glmh-mono' : 'glmh-value' }, text)))
    return h('div', { className: 'glmh-panel' },
      h('style', null, CSS),
      h('h2', { className: 'glmh-title' }, 'GLM-Hourness 通道'),
      h('p', { className: 'glmh-desc' }, '原生 ZCode 客户端通道（coding-plan 直连）。登录令牌加密保存在本机，请求用 ZCode 同款的项目令牌。'),
      h('div', { className: 'glmh-card' },
        row('通道', ['glm-zcode（GLM-5.3 / GLM-5.3-Flash）']),
        row('凭证存放', ['%USERPROFILE%\\.dsh\\glm-hourness\\credentials.json', true], ['设置了 DSH_HOME 时在它下面的 glm-hourness 目录里。']),
        row('登录有效期', ['coding-plan 的项目令牌按 ZCode 的方式自动续期，OAuth 登录失效后需重新 /glm-login；start-plan 档位自动续期。']),
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
      h('p', { className: 'glmh-desc' }, `模型选择：在会话的模型选择器里选「${PROVIDER_NAME}」下的 GLM-5.3 或 GLM-5.3-Flash。`),
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
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'glm-hourness-ui', order: 60, label: 'GLM-Hourness',
  }, Panel))
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock', id: 'glm-channel', order: 150, label: 'GLM 通道',
  }, props => h(PillBoundary, null, h(ChannelPill, props))))
}
