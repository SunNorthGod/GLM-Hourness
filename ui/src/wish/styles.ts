/**
 * Skin of the /wish entry: the opening card, the button under the composer
 * and its popover. The metrics are DSH's own surfaces (rc.3 web frontend):
 * the card sits in the composer dock like the todo panel
 * (dsh-client-ui-conversation TodoPanel.module.css, ./flow/styles.ts
 * DOCK_BOX / DOCK_MATERIAL) — centered over the composer's width, a
 * rounded panel on the menu material with the panel elevation, its
 * headline on the approval card's scale (15 px/500/24 px); the exit line
 * is the goal bar's strip shape (GoalBar.module.css, 36 px, radius-md).
 * The popover follows the GLM channel pill's dialog (ui/src/channel.js,
 * the other client bundle), which mirrors DSH's own statistics dialogs;
 * the strong-model line carries no skin of its own — the native Tag
 * (tone warning) does. Colors are DSH theme tokens, with the rc.3 dark
 * values as fallbacks.
 */
import { DOCK_BOX, DOCK_MATERIAL } from '../flow/styles.ts'

export const WISH_CSS = [
  ':is(.hw-card,.hw-anchor,.hw-dialog){--hw-ink:var(--dsw-alias-label-primary,#e8e8e8);--hw-ink2:var(--dsw-alias-label-secondary,#b5b5b5);--hw-ink3:var(--dsw-alias-label-tertiary,#8a8a8a);--hw-link:var(--dsw-alias-state-business-primary,#7aaaff);--hw-hover:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));--hw-menu:var(--dsw-specific-menu,#232325)}',
  'body:not([data-ds-dark-theme]) :is(.hw-card,.hw-anchor,.hw-dialog){--hw-ink:var(--dsw-alias-label-primary,#0f1115);--hw-ink2:var(--dsw-alias-label-secondary,#61666b);--hw-ink3:var(--dsw-alias-label-secondary,#61666b);--hw-link:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4176e6) 80%,var(--dsw-alias-label-primary,#0f1115));--hw-hover:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));--hw-menu:var(--dsw-specific-menu,#fff);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1,rgba(0,0,0,.14))}',
  '.hw-card{box-sizing:border-box;' + DOCK_BOX + ';' + DOCK_MATERIAL + ';display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:14px 16px;border:0;border-radius:var(--dsw-radius-lg,16px);font-size:13px;line-height:20px;color:var(--hw-ink2)}',
  'body:not([data-ds-dark-theme]) .hw-card{background:var(--dsw-specific-menu,#fff)}',
  '.hw-line{flex-direction:row;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px 12px;min-height:36px;padding:4px 12px;border-radius:var(--dsw-radius-md,12px)}',
  '.hw-title{margin:0;color:var(--hw-ink);font-size:15px;line-height:24px;font-weight:500}',
  '.hw-body{margin:0}',
  '.hw-buttons{display:flex;flex-direction:column;align-items:flex-start;gap:6px}',
  '.hw-actions{display:flex;flex-wrap:wrap;gap:8px}',
  '.hw-strong{gap:6px}',
  '.hw-strong svg{width:12px;height:12px;flex:none}',
  '.hw-hint{color:var(--hw-ink3);font-size:12px}',
  '.hw-fallback{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
  '.hw-note{font-size:12px;color:var(--hw-ink3)}',
  '.hw-note-ok{color:var(--dsw-alias-state-success-primary,#3fb950)}',
  '.hw-note-error{color:var(--dsw-alias-state-error-primary,#f85149)}',
  '.hw-anchor{display:inline-flex;flex:none;anchor-name:var(--hw-anchor);font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}',
  '.hw-pill{display:inline-flex;align-items:center;box-sizing:border-box;max-width:100%;padding:1px 8px;border:none;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--hw-ink3);font:inherit;line-height:inherit;white-space:nowrap;cursor:pointer}',
  '.hw-pill:hover,.hw-pill[aria-expanded="true"]{background:var(--hw-hover);color:var(--hw-ink2)}',
  '.hw-pill-main{color:var(--hw-link)}',
  // CSS anchors place the popover above the trigger (8px gap), its left edge at
  // the trigger's left and its bottom clamped into the viewport (the shipped
  // stat dialog's band; rc.3 stat-dialog.module.css). The safe alignments fall
  // back to the band's start edge when the popover would overflow the other
  // one. The primitives' measured placement hook is gone on desktop
  // 0.2.2-rc.3; the renderer Chromium (152 on rc.1 as on rc.3) supports CSS
  // anchors, so the same bundle places itself on both runtimes.
  '.hw-dialog{position:fixed;z-index:1100;position-anchor:var(--hw-anchor);box-sizing:border-box;top:max(12px,var(--dsh-frame-overlay-top,12px));bottom:calc(anchor(top) + 8px);left:anchor(left);right:12px;align-self:safe end;justify-self:safe start;width:fit-content;height:fit-content;margin:0;min-width:min(340px,calc(100vw - 24px));max-width:min(460px,calc(100vw - 24px));max-height:calc(anchor(top) - max(12px,var(--dsh-frame-overlay-top,12px)) - 8px);overflow-y:auto;display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:16px;border:0;border-radius:var(--dsw-radius-lg,16px);background:var(--hw-menu);backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));box-shadow:var(--dsw-elevation-prominent,0 0 0 .5px var(--dsw-alias-border-l3,rgba(255,255,255,.29)),0 3px 8px rgba(0,0,0,.04),0 0 20px rgba(0,0,0,.05));font-size:12px;line-height:18px;color:var(--hw-ink2);cursor:default}',
  '.hw-dialog:focus{outline:none}',
  '.hw-dialog p{margin:0}',
].join('\n')
