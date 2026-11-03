/**
 * Skin of the flow bar. Component-local styles render as a React element
 * (the static bundle's client half gets no `styles` builtin,
 * docs/DEVELOPMENT.md §5); the metrics are DSH's own composer dock strip
 * (rc.3 dsh-client-ui-goal GoalBar.module.css): the strip sits centered
 * over the composer's width, a 36 px rounded panel on the menu material
 * with the panel elevation, and the label carries the goal bar's type
 * scale (name 13 px/500/24 px, body 13 px/20 px dimmed). Colors are DSH
 * theme tokens, with the rc.3 dark values as fallbacks.
 */

/**
 * The dock geometry of the entries above the composer (rc.3 GoalBar /
 * TodoPanel): centered, in by the dock inset on each side relative to the
 * composer card. ui/src/wish/styles.ts shares these three declarations.
 */
export const DOCK_BOX = 'width:calc(100% - var(--dsh-composer-side-clearance,16px)*2 - var(--dsh-composer-dock-inset,8px)*4);max-width:calc(var(--dsh-composer-card-max-width,min(calc(100% - 16px),952px)) - var(--dsh-composer-dock-inset,8px)*4);margin:0 auto'

/** The dock material of those entries: the menu surface, its backdrop blur, the panel elevation with the hairline stroke. */
export const DOCK_MATERIAL = '--dsw-elevation-stroke-color:var(--dsw-alias-border-l1,rgba(255,255,255,.1));box-shadow:var(--dsw-elevation-panel,0 0 0 .5px var(--dsw-elevation-stroke-color),0 3px 8px rgba(0,0,0,.03),0 0 16px rgba(0,0,0,.02));background:var(--dsw-specific-menu,#1f1f23);backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%))'

export const FLOW_CSS = [
  '.hf-bar{box-sizing:border-box;' + DOCK_BOX + ';' + DOCK_MATERIAL + ';display:flex;flex-direction:column;justify-content:center;gap:4px;min-height:36px;padding:4px 12px;border:0;border-radius:var(--dsw-radius-md,12px);font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,#b5b5b5)}',
  '.hf-line{display:flex;align-items:center;gap:10px;min-width:0}',
  '.hf-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary-dimmed,#b5b5b5)}',
  '.hf-name{color:var(--dsw-alias-label-primary,#e8e8e8);font-weight:500;line-height:24px}',
  '.hf-note{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-state-warn-primary,#f59e0b);font-size:12px;line-height:18px}',
  '.hf-note svg{width:14px;height:14px;flex:none}',
  '.hf-note-text{min-width:0;flex:auto;overflow-wrap:anywhere}',
  '.hf-dismiss{flex:none;margin-left:auto;padding:0 4px;border:none;background:transparent;color:var(--dsw-alias-state-business-primary,#7aaaff);font:inherit;font-size:12px;line-height:18px;cursor:pointer}',
  '.hf-dismiss:hover{text-decoration:underline}',
].join('\n')
