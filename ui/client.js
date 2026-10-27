/**
 * GLM-Hourness UI panel — Client half.
 *
 * Two surfaces:
 *  - Settings page (`settings.section`): channel facts and command guidance.
 *  - Composer dock pill (`conversation.composer.dock`): live channel actions
 *    for the current session. The dock's props carry `sessionId`, so the pill
 *    drives the existing command surface through `ctx.remote.commands.execute`
 *    (`/glm-status`, `/glm-login`, `/glm-logout`); this reuses the Host
 *    command handlers instead of declaring a custom Remote service.
 *
 * The static bundle's Client half receives only `require` (the module table),
 * not the dynamic-package `styles`/`host` builtins; styles render as a React
 * element (docs/DEVELOPMENT.md §5).
 */
window.__ModuleLoader__.load({
  id: 'dsh-glm-hourness-ui',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const CLIPBOARD_COMMAND = '/glm-login'

    // Bound in apply(); components read through this closure.
    let runCommand = null

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
    const CSS = [
      '.glmh-anchor{display:inline-flex;min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}',
      '.glmh-pill{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;max-width:100%;padding:1px 8px;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary,#8a8a8a);font:inherit;line-height:inherit;white-space:nowrap;cursor:pointer}',
      '.glmh-pill:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-secondary,#b5b5b5)}',
      '.glmh-pill[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-secondary,#b5b5b5)}',
      '.glmh-pill svg{width:14px;height:14px;flex:none}',
      '.glmh-pill-label{min-width:0;overflow:hidden;text-overflow:ellipsis}',
      '.glmh-dialog{position:fixed;z-index:1100;box-sizing:border-box;width:max-content;min-width:min(340px,calc(100vw - 24px));max-width:min(460px,calc(100vw - 24px));padding:16px;border:0;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,#232325);backdrop-filter:var(--dsw-menu-backdrop-filter,blur(24px));box-shadow:var(--dsw-elevation-prominent,0 12px 32px rgba(0,0,0,.45));font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#b5b5b5);cursor:default}',
      '.glmh-dialog-title{display:flex;justify-content:space-between;gap:16px;margin-bottom:8px;color:var(--dsw-alias-label-primary,#e8e8e8);font-weight:500}',
      '.glmh-dialog-titlelabel{display:inline-flex;align-items:center;gap:6px;min-width:0}',
      '.glmh-dialog-titlelabel svg{width:14px;height:14px;flex:none}',
      '.glmh-dialog-titlevalue{color:var(--dsw-alias-label-primary,#e8e8e8);font-variant-numeric:tabular-nums}',
      '.glmh-rule{margin-bottom:10px;border-top:0.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08))}',
      '.glmh-details{display:grid;grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
      '.glmh-details dt,.glmh-details dd{min-width:0;margin:0}',
      '.glmh-details dd{color:var(--dsw-alias-label-secondary,#b5b5b5);font-variant-numeric:tabular-nums;text-align:right;overflow-wrap:anywhere}',
      '.glmh-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:0.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08))}',
      '.glmh-btn{height:24px;padding:0 8px;border-radius:var(--dsw-radius-sm,6px);border:none;background:transparent;color:var(--dsw-alias-label-secondary,#b5b5b5);font:inherit;font-size:12px;line-height:1;cursor:pointer}',
      '.glmh-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-primary,#e8e8e8)}',
      '.glmh-btn:disabled{opacity:.45;cursor:default}',
      '.glmh-btn-primary{color:var(--dsw-alias-accent,var(--dsw-alias-color-primary,#2d8fd6))}',
      '.glmh-btn-primary:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-accent,var(--dsw-alias-color-primary,#2d8fd6))}',
      '.glmh-btn-danger{color:var(--dsw-alias-danger,#e05a5a)}',
      '.glmh-btn-danger:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-danger,#e05a5a)}',
      '.glmh-out{max-height:180px;overflow:auto;margin:0;padding-top:8px;border-top:0.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;line-height:1.6;white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
      '.glmh-err{color:var(--dsw-alias-danger,#e05a5a)}',
      '.glmh-link{color:var(--dsw-alias-accent,var(--dsw-alias-color-primary,#2d8fd6));text-decoration:underline}',
      /* Settings page */
      '.glmh-panel{display:flex;flex-direction:column;gap:12px;max-width:560px}',
      '.glmh-title{font-size:var(--dsw-alias-font-size-title-md,18px);margin:0}',
      '.glmh-desc{color:var(--dsw-alias-label-tertiary,#8a8a8a);margin:0;font-size:13px;line-height:1.5}',
      '.glmh-card{display:flex;flex-direction:column;gap:8px;padding:14px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));border-radius:var(--dsw-radius-lg,12px)}',
      '.glmh-row{display:flex;justify-content:space-between;gap:16px;font-size:13px}',
      '.glmh-label{color:var(--dsw-alias-label-tertiary,#8a8a8a);flex:0 0 auto}',
      '.glmh-value{font-family:var(--dsw-font-mono,ui-monospace,monospace);word-break:break-all;text-align:right}',
      '.glmh-strong{font-weight:500;font-size:14px}',
      '.glmh-button{padding:6px 14px;border-radius:var(--dsw-radius-sm,6px);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.12));background:transparent;color:var(--dsw-alias-label-primary,#e8e8e8);cursor:pointer;align-self:flex-start;font:inherit;font-size:13px}',
      '.glmh-button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}',
      '.glmh-primary{background:var(--dsw-alias-accent,var(--dsw-alias-color-primary,#247bbf));border-color:transparent;color:#fff}',
      '.glmh-list{margin:0;padding-left:18px;font-size:13px;line-height:1.7}',
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

    /** Parse the `/glm-status` handler text (Chinese) into display fields. */
    function parseStatus(text) {
      const logged = /已登录（套餐 ([\w-]+)，Key ([\w…]+)(?:，账号 ([\w-]+))?(?:，JWT 已用 ([\d.]+) 小时)?）/.exec(text)
      if (logged !== null) return { logged: true, plan: logged[1], key: logged[2], userId: logged[3], jwt: logged[4] }
      if (/未登录/.test(text)) return { logged: false, plan: null }
      return null
    }

    /** Composer-dock pill: a trigger opening the portaled channel dialog. */
    function ChannelPill(props) {
      const [open, setOpen] = React.useState(false)
      const [pos, setPos] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [output, setOutput] = React.useState(null)
      const [failed, setFailed] = React.useState(false)
      const [status, setStatus] = React.useState(null)
      const queried = React.useRef(false)
      const anchorRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const sessionId = props.sessionId

      const place = () => {
        const anchor = anchorRef.current
        if (anchor === null) return
        const rect = anchor.getBoundingClientRect()
        const width = 320
        const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12))
        // The dialog grows upward from just above the trigger.
        const bottom = Math.min(Math.max(12, window.innerHeight - rect.top + 8), window.innerHeight - 12)
        setPos({ left, bottom })
      }

      const toggle = () => {
        if (open) { setOpen(false); return }
        place()
        setOpen(true)
      }

      // Outside pointerdown / Escape closes, matching the shipped stat dialogs.
      React.useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false) }
        const onPointerDown = (event) => {
          if (event.target instanceof Node
            && (anchorRef.current === null || !anchorRef.current.contains(event.target))
            && (panelRef.current === null || !panelRef.current.contains(event.target))) {
            setOpen(false)
          }
        }
        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('pointerdown', onPointerDown, true)
        return () => {
          document.removeEventListener('keydown', onKeyDown)
          document.removeEventListener('pointerdown', onPointerDown, true)
        }
      }, [open])

      // Poll the credential state after a login attempt so the panel updates
      // itself once the browser authorization completes.
      const pollRef = React.useRef(null)
      const stopPoll = () => {
        if (pollRef.current !== null) { clearInterval(pollRef.current); pollRef.current = null }
      }
      React.useEffect(() => () => stopPoll(), [])
      const pollStatus = () => {
        stopPoll()
        let attempts = 0
        pollRef.current = setInterval(() => {
          attempts += 1
          if (runCommand === null) { stopPoll(); return }
          runCommand(sessionId, '/glm-status').then(
            text => {
              const parsed = parseStatus(text)
              if (parsed !== null) setStatus(parsed)
              if ((parsed !== null && parsed.logged) || attempts >= 12) stopPoll()
            },
            () => { if (attempts >= 12) stopPoll() },
          )
        }, 5000)
      }

      const run = line => {
        if (runCommand === null) { setOutput('命令通道不可用'); setFailed(true); return }
        setBusy(true)
        setOutput(null)
        setFailed(false)
        runCommand(sessionId, line).then(
          text => {
            setBusy(false)
            setOutput(text)
            const parsed = parseStatus(text)
            if (parsed !== null) setStatus(parsed)
            // A login reply carries the authorize URL, not a status line.
            if (line === '/glm-login' && parsed === null) pollStatus()
          },
          error => { setBusy(false); setFailed(true); setOutput(String(error && error.message ? error.message : error).slice(0, 240)) },
        )
      }

      // First open reports the credential state once, so the dialog is not empty.
      React.useEffect(() => {
        if (open && !queried.current) {
          queried.current = true
          if (runCommand !== null) {
            runCommand(sessionId, '/glm-status').then(
              text => { const parsed = parseStatus(text); if (parsed !== null) setStatus(parsed); setOutput(text) },
              error => { setFailed(true); setOutput(String(error && error.message ? error.message : error).slice(0, 240)) },
            )
          }
        }
      }, [open, sessionId])

      const detail = (label, value) => [
        h('dt', { key: `d${label}` }, label),
        h('dd', { key: `v${label}` }, value),
      ]
      const statusText = status === null ? '检查中…' : status.logged ? '已登录' : '未登录'

      const dialog = h('div', {
        ref: panelRef, className: 'glmh-dialog', role: 'dialog', 'aria-label': 'GLM 通道',
        style: pos === null ? { visibility: 'hidden' } : { left: pos.left, bottom: pos.bottom },
      },
      h('div', { className: 'glmh-dialog-title' },
        h('span', { className: 'glmh-dialog-titlelabel' }, h(ChannelIcon), 'GLM 通道'),
        h('span', { className: 'glmh-dialog-titlevalue' }, statusText),
      ),
      h('div', { className: 'glmh-rule' }),
      h('dl', { className: 'glmh-details' },
        ...detail('状态', statusText),
        ...detail('套餐', status !== null && status.plan ? status.plan : 'coding-plan'),
        ...detail('Key', status !== null && status.key ? status.key : '—'),
        ...(status !== null && status.userId ? detail('账号', status.userId) : []),
        ...(status !== null && status.jwt ? detail('JWT', `已用 ${status.jwt} 小时`) : []),
        ...detail('模型', 'GLM-5.3 · GLM-5.3-Flash'),
        ...detail('凭证', '本机加密存储'),
      ),
      output === null ? null : h(OutputLines, { text: output, failed }),
      h('div', { className: 'glmh-actions' },
        h('button', { type: 'button', className: 'glmh-btn glmh-btn-primary', disabled: busy, onClick: () => run('/glm-login') }, '登录'),
        h('button', { type: 'button', className: 'glmh-btn', disabled: busy, onClick: () => { queried.current = true; run('/glm-status') } }, '刷新状态'),
        h('button', { type: 'button', className: 'glmh-btn glmh-btn-danger', disabled: busy, onClick: () => run('/glm-logout') }, '登出'),
      ))

      return h('span', { className: 'glmh-anchor', ref: anchorRef },
        h('style', null, CSS),
        h('button', {
          type: 'button', className: 'glmh-pill', 'aria-haspopup': 'dialog', 'aria-expanded': open ? 'true' : 'false',
          onClick: toggle,
        }, h(ChannelIcon), h('span', { className: 'glmh-pill-label' }, 'GLM')),
        open ? dialog : null,
      )
    }

    function Panel() {
      const [copied, setCopied] = React.useState(false)
      const copy = () => {
        Promise.resolve(navigator.clipboard.writeText(CLIPBOARD_COMMAND)).then(
          () => { setCopied(true); setTimeout(() => setCopied(false), 1500) },
          () => setCopied(false),
        )
      }
      const row = (label, value) => h('div', { className: 'glmh-row' },
        h('span', { className: 'glmh-label' }, label),
        h('span', { className: 'glmh-value' }, value))
      return h('div', { className: 'glmh-panel' },
        h('style', null, CSS),
        h('h2', { className: 'glmh-title' }, 'GLM Hourness 通道'),
        h('p', { className: 'glmh-desc' }, '原生 ZCode 客户端通道（coding-plan 直连）。凭证加密保存在本机，登录一次长期有效。'),
        h('div', { className: 'glmh-card' },
          row('通道', 'glm-zcode（GLM-5.3 / GLM-5.3-Flash）'),
          row('凭证存放', '%USERPROFILE%\\Desktop\\Project\\GLM-Hourness\\.llm\\credentials.json'),
          row('登录有效期', 'coding-plan key 长期有效；start-plan 档位自动续期'),
        ),
        h('div', { className: 'glmh-card' },
          h('div', { className: 'glmh-strong' }, '登录 / 状态管理'),
          h('p', { className: 'glmh-desc' }, '在会话输入框执行以下命令：'),
          h('button', { className: 'glmh-button glmh-primary', onClick: copy },
            copied ? '已复制 /glm-login' : '复制 /glm-login'),
          h('ul', { className: 'glmh-list' },
            h('li', null, '/glm-login — 打开浏览器授权，完成登录'),
            h('li', null, '/glm-status — 查看登录状态、key 预览与各行健康'),
            h('li', null, '/glm-logout — 清除本机凭证'),
          ),
        ),
        h('p', { className: 'glmh-desc' }, '模型选择：在会话的模型选择器里选 glm-zcode 路由的 GLM-5.3。'),
      )
    }

    return {
      // Mirror ui-commands' declaration exactly: the client command face needs
      // both the `remote` root and the nested `remote.commands` service.
      inject: ['slots', 'remote', 'remote.commands'],
      apply(ctx) {
        runCommand = (sessionId, line) => ctx.remote.commands.execute(sessionId, line, []).then(result => {
          if (!result.ok) throw new Error(`command failed: ${result.error.code}: ${result.error.message}`)
          if (result.value === undefined) return `未知或无法解析的命令：${line}`
          const outcome = result.value.result
          return outcome.text ?? (outcome.kind === 'success' ? '完成。' : '执行失败。')
        })
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'glm-hourness-ui', order: 60, label: 'GLM Hourness',
        }, Panel))
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock', id: 'glm-channel', order: 150, label: 'GLM 通道',
        }, props => h(PillBoundary, null, h(ChannelPill, props))))
      },
    }
  },
})
