/**
 * Skin of the flow bar. Component-local styles render as a React element
 * (the static bundle's client half gets no `styles` builtin,
 * docs/DEVELOPMENT.md §5); colors are DSH theme tokens, with the fallbacks
 * the other client surfaces of this bundle use.
 */
export const FLOW_CSS = [
  '.hf-bar{box-sizing:border-box;width:100%;display:flex;flex-direction:column;gap:4px;padding:6px 12px;border:0.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.08));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-specific-menu,#1c1c20);font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,#b5b5b5)}',
  '.hf-line{display:flex;align-items:center;gap:8px;min-width:0}',
  '.hf-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.hf-note{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-state-warn-primary,#e3b341)}',
  '.hf-note svg{width:14px;height:14px;flex:none}',
  '.hf-note-text{min-width:0;flex:auto;overflow-wrap:anywhere}',
  '.hf-dismiss{flex:none;margin-left:auto;padding:0 4px;border:none;background:transparent;color:var(--dsw-alias-state-business-primary,#6aa1ff);font:inherit;cursor:pointer}',
  '.hf-dismiss:hover{text-decoration:underline}',
].join('\n')
