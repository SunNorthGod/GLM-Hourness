/**
 * Skin of the /wish entry: the opening card, the button under the composer
 * and its popover. The popover follows the GLM channel pill's dialog
 * (ui/src/channel.js, the other client bundle), which mirrors DSH's own
 * statistics dialogs; the card is a surface of the same family.
 */
export const WISH_CSS = [
  '.hw-card{box-sizing:border-box;width:100%;display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,#1f1f23);font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,#b5b5b5)}',
  '.hw-line{flex-direction:row;align-items:center;flex-wrap:wrap;gap:8px 12px}',
  '.hw-title{margin:0;color:var(--dsw-alias-label-primary,#e8e8e8);font-size:15px;line-height:22px;font-weight:600}',
  '.hw-body{margin:0}',
  '.hw-buttons{display:flex;flex-direction:column;align-items:flex-start;gap:6px}',
  '.hw-actions{display:flex;flex-wrap:wrap;gap:8px}',
  '.hw-strong{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border:1px solid rgba(227,179,65,.3);border-radius:var(--dsw-radius-sm,6px);background:rgba(227,179,65,.08);color:var(--dsw-alias-state-warn-primary,#e3b341);font-size:12.5px}',
  '.hw-strong svg{width:14px;height:14px;flex:none}',
  '.hw-hint{color:var(--dsw-alias-label-tertiary,#8a8a8a);font-size:12px}',
  '.hw-fallback{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
  '.hw-note{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
  '.hw-note-ok{color:var(--dsw-alias-state-success-primary,#3fb950)}',
  '.hw-note-error{color:var(--dsw-alias-state-error-primary,#f85149)}',
  '.hw-anchor{display:inline-flex;flex:none;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}',
  '.hw-pill{display:inline-flex;align-items:center;box-sizing:border-box;max-width:100%;padding:1px 8px;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary,#8a8a8a);font:inherit;line-height:inherit;white-space:nowrap;cursor:pointer}',
  '.hw-pill:hover,.hw-pill[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-secondary,#b5b5b5)}',
  '.hw-pill-main{color:var(--dsw-alias-state-business-primary,#6aa1ff)}',
  '.hw-dialog{position:fixed;z-index:1100;box-sizing:border-box;width:max-content;min-width:min(340px,calc(100vw - 24px));max-width:min(460px,calc(100vw - 24px));display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:16px;border:0;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,#232325);backdrop-filter:var(--dsw-menu-backdrop-filter,blur(24px));box-shadow:var(--dsw-elevation-prominent,0 12px 32px rgba(0,0,0,.45));font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#b5b5b5);cursor:default}',
  '.hw-dialog:focus{outline:none}',
  '.hw-dialog p{margin:0}',
].join('\n')
