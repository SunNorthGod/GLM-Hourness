/**
 * Styles of the project graph panel, rendered as a <style> element (the
 * static bundle has no `styles` builtin, docs/DEVELOPMENT.md §5.6). Colours
 * come from the DSH theme tokens (--dsw-*), so the panel follows the
 * light and dark themes; motion is CSS only and stops under
 * prefers-reduced-motion.
 */
export const PANEL_CSS = `
.glmg{--g-done:var(--dsw-alias-state-success-primary,#3fb950);--g-doing:var(--dsw-alias-state-warn-primary,#d29922);--g-wait:var(--dsw-alias-state-error-primary,#f85149);--g-accent:var(--dsw-alias-state-business-primary,#2f81f7);--g-purple:#a371f7;--g-ink:var(--dsw-alias-label-primary,#e6e6e6);--g-ink2:var(--dsw-alias-label-secondary,#b5b5b5);--g-ink3:var(--dsw-alias-label-tertiary,#8a8a8a);--g-line:var(--dsw-alias-border-l2,rgba(127,127,127,.18));--g-line-strong:var(--dsw-alias-border-l1,rgba(127,127,127,.28));--g-hover:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1));--g-layer:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.06));
  position:relative;display:flex;flex-direction:column;height:100%;min-height:0;color:var(--g-ink);font-family:var(--dsw-font-family,inherit);font-size:13px;line-height:1.5}
.glmg *{box-sizing:border-box}
.glmg-head{display:flex;align-items:center;gap:8px;padding:10px 14px 6px;min-width:0}
.glmg-goal{flex:1;min-width:0;color:var(--g-ink3);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.glmg-live{display:inline-flex;align-items:center;gap:5px;color:var(--g-ink3);font-size:11px;white-space:nowrap}
.glmg-live i{width:6px;height:6px;border-radius:50%;background:var(--g-done);box-shadow:0 0 0 0 color-mix(in srgb,var(--g-done) 60%,transparent);animation:glmg-ping 2.4s ease-out infinite}
.glmg-live.off i{background:var(--g-ink3);animation:none}
.glmg-tabs{padding:0 12px 8px}
.glmg-count{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;margin-left:5px;padding:0 4px;border-radius:8px;background:var(--g-wait);color:#fff;font-size:10px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.glmg-count.quiet{background:var(--g-hover);color:var(--g-ink2)}
.glmg-body{position:relative;flex:1;min-height:0;overflow:auto;padding:4px 12px 16px;scrollbar-gutter:stable}
.glmg-view{animation:glmg-fade .18s ease-out}
.glmg-section{margin:14px 2px 6px;color:var(--g-ink3);font-size:11px;font-weight:600;letter-spacing:.02em}
.glmg-section:first-child{margin-top:4px}
.glmg-card{position:relative;margin:0 0 10px;padding:12px 12px 10px;border:1px solid var(--g-line);border-radius:var(--dsw-radius-lg,12px);background:var(--g-layer);animation:glmg-rise .22s cubic-bezier(.2,.8,.2,1) both}
.glmg-card.wait{border-color:color-mix(in srgb,var(--g-wait) 45%,var(--g-line));box-shadow:inset 3px 0 0 var(--g-wait)}
.glmg-card-title{margin:0 0 2px;font-size:14px;font-weight:600;line-height:1.4;color:var(--g-ink);cursor:pointer}
.glmg-card-title:hover{text-decoration:underline;text-decoration-color:var(--g-line-strong)}
.glmg-meta{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;color:var(--g-ink3);font-size:11.5px}
.glmg-text{margin:8px 0 0;color:var(--g-ink2);font-size:12.5px}
.glmg-text.clamp{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.glmg-more{margin-top:2px;padding:0;border:0;background:none;color:var(--g-accent);font:inherit;font-size:12px;cursor:pointer}
.glmg-options{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.glmg-option{display:flex;flex-direction:column;gap:2px;width:100%;padding:8px 10px;border:1px solid var(--g-line);border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--g-ink);font:inherit;text-align:left;cursor:pointer;transition:border-color .15s,background .15s,transform .15s}
.glmg-option:hover{background:var(--g-hover);border-color:var(--g-line-strong)}
.glmg-option:active{transform:scale(.99)}
.glmg-option.picked{border-color:var(--g-accent);background:color-mix(in srgb,var(--g-accent) 10%,transparent)}
.glmg-option.current{border-style:dashed;cursor:default;opacity:.7}
.glmg-option-head{display:flex;align-items:center;gap:6px;font-weight:500}
.glmg-option-key{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;background:var(--g-hover);color:var(--g-ink2);font-size:11px;font-weight:600}
.glmg-option-text{color:var(--g-ink3);font-size:12px}
.glmg-confirm{display:flex;gap:6px;align-items:center;margin-top:8px;animation:glmg-fade .15s ease-out}
.glmg-confirm input{flex:1;min-width:0}
.glmg-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.glmg-result{margin-top:8px;font-size:12px;color:var(--g-done);animation:glmg-fade .2s ease-out}
.glmg-result.bad{color:var(--g-wait)}
.glmg-leaving{animation:glmg-leave .32s cubic-bezier(.4,0,.2,1) forwards;pointer-events:none}
.glmg-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:44px 12px 24px;text-align:center;color:var(--g-ink3)}
.glmg-empty-mark{display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:50%;background:color-mix(in srgb,var(--g-done) 16%,transparent);color:var(--g-done);animation:glmg-pop .45s cubic-bezier(.2,1.4,.4,1) both}
.glmg-empty-title{color:var(--g-ink);font-size:14px;font-weight:600}
.glmg-row{display:flex;gap:10px;align-items:flex-start;padding:9px 6px;border-radius:var(--dsw-radius-md,8px);cursor:pointer;transition:background .12s}
.glmg-row:hover{background:var(--g-hover)}
.glmg-row+.glmg-row{border-top:1px solid var(--g-line)}
.glmg-row-main{flex:1;min-width:0}
.glmg-row-title{color:var(--g-ink);font-weight:500;overflow-wrap:anywhere}
.glmg-who{flex:none;margin-top:1px;padding:0 6px;border-radius:5px;font-size:11px;line-height:18px;white-space:nowrap}
.glmg-who.agent{background:color-mix(in srgb,var(--g-purple) 16%,transparent);color:var(--g-purple)}
.glmg-who.relay{background:color-mix(in srgb,var(--g-accent) 14%,transparent);color:var(--g-accent)}
.glmg-who.human{background:var(--g-hover);color:var(--g-ink2)}
.glmg-quote{margin:8px 0 0;padding:6px 10px;border-left:2px solid var(--g-accent);color:var(--g-ink2);font-size:12.5px;background:color-mix(in srgb,var(--g-accent) 6%,transparent);border-radius:0 6px 6px 0}
.glmg-progress{position:relative;height:4px;margin-top:6px;border-radius:2px;background:var(--g-hover);overflow:hidden}
.glmg-progress b{position:absolute;inset:0 auto 0 0;border-radius:2px;background:var(--g-done);transition:width .5s cubic-bezier(.2,.8,.2,1)}
.glmg-dot{flex:none;width:8px;height:8px;margin-top:6px;border-radius:50%;background:var(--g-ink3)}
.glmg-dot.doing{background:var(--g-doing);animation:glmg-breathe 2.2s ease-in-out infinite}
.glmg-dot.done{background:var(--g-done)}
.glmg-dot.wait{background:var(--g-wait)}
.glmg-dot.proposed{background:transparent;border:1.5px dashed var(--g-ink3)}
/* live agents */
.glmg-agent{display:flex;gap:10px;align-items:flex-start;padding:9px 6px}
.glmg-agent+.glmg-agent{border-top:1px solid var(--g-line)}
.glmg-agent-mark{flex:none;display:inline-flex;align-items:center;justify-content:center;width:10px;height:10px;margin-top:5px;border-radius:50%;background:var(--g-ink3);font-size:0}
.glmg-agent-mark.running{background:var(--g-doing);animation:glmg-breathe 2.2s ease-in-out infinite}
.glmg-agent-mark.done{width:16px;height:16px;margin-top:2px;background:color-mix(in srgb,var(--g-done) 18%,transparent);color:var(--g-done);font-size:10px;font-weight:700;animation:glmg-pop .45s cubic-bezier(.2,1.4,.4,1) both}
.glmg-agent-head{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px}
.glmg-agent-tokens{color:var(--g-ink3);font-size:11px;font-variant-numeric:tabular-nums}
.glmg-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
.glmg-chip{padding:0 6px;border-radius:5px;background:var(--g-hover);color:var(--g-ink2);font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;line-height:18px}
.glmg-earlier{display:block;margin:4px 6px 0}
.glmg-chip.bad{background:color-mix(in srgb,var(--g-wait) 14%,transparent);color:var(--g-wait)}
/* graph view */
.glmg-graph{position:absolute;inset:0;display:flex;flex-direction:column}
.glmg-toolbar{display:flex;align-items:center;gap:4px;padding:0 12px 6px}
.glmg-toolbar .grow{flex:1}
.glmg-filter{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border:1px solid var(--g-line);border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--g-ink2);font:inherit;font-size:12px;cursor:pointer}
.glmg-filter:hover{background:var(--g-hover)}
.glmg-canvas{position:relative;flex:1;min-height:0;overflow:hidden;cursor:grab;touch-action:none;border-top:1px solid var(--g-line)}
.glmg-canvas.dragging{cursor:grabbing}
.glmg-canvas svg{display:block;width:100%;height:100%;user-select:none}
.glmg-world{transition:transform .28s cubic-bezier(.2,.8,.2,1)}
.glmg-canvas.dragging .glmg-world{transition:none}
.glmg-node{cursor:pointer;transition:transform .42s cubic-bezier(.2,.8,.2,1),opacity .3s}
.glmg-node .shape{transition:fill .25s,stroke .25s,stroke-width .15s}
.glmg-node:hover .shape{stroke-width:2.4}
.glmg-node.selected .shape{stroke:var(--g-accent);stroke-width:2.6}
.glmg-node .halo{fill:none;stroke:var(--g-doing);stroke-width:2;opacity:0;pointer-events:none}
.glmg-node.doing .halo{animation:glmg-halo 2.4s ease-in-out infinite}
.glmg-node.waiting .halo{stroke:var(--g-wait);animation:glmg-halo 1.8s ease-in-out infinite}
.glmg-node.closed{opacity:.5}
.glmg-node text{pointer-events:none}
.glmg-edge{fill:none;transition:opacity .3s}
.glmg-badges{pointer-events:none}
.glmg-badge{transition:transform .42s cubic-bezier(.2,.8,.2,1)}
.glmg-badge .pill{fill:var(--dsw-alias-bg-base,#1d1d1f);stroke:var(--g-accent);stroke-width:1.2}
.glmg-badge text{fill:var(--g-accent)}
.glmg-badge .dot{fill:var(--g-ink3)}
.glmg-badge .ring{fill:none;stroke:var(--g-doing);stroke-width:1.5;opacity:0;transform-box:fill-box;transform-origin:center}
.glmg-badge.running .dot{fill:var(--g-doing)}
.glmg-badge.running .ring{animation:glmg-ring 1.8s ease-out infinite}
.glmg-unplaced{position:absolute;top:6px;left:10px;right:10px;display:flex;flex-wrap:wrap;gap:4px 10px;padding:3px 8px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-bg-base,#1d1d1f) 82%,transparent);color:var(--g-ink3);font-size:11px;pointer-events:none}
.glmg-unplaced span{display:inline-flex;align-items:center;gap:4px}
.glmg-unplaced i{width:6px;height:6px;border-radius:50%;background:var(--g-ink3)}
.glmg-unplaced .running i{background:var(--g-doing);animation:glmg-breathe 2.2s ease-in-out infinite}
.glmg-legend{position:absolute;left:10px;bottom:8px;display:flex;flex-wrap:wrap;gap:4px 10px;padding:4px 8px;border-radius:6px;background:color-mix(in srgb,var(--dsw-alias-bg-base,#1d1d1f) 82%,transparent);color:var(--g-ink3);font-size:11px;pointer-events:none}
.glmg-legend span{display:inline-flex;align-items:center;gap:4px}
.glmg-legend i{width:9px;height:9px;border-radius:3px}
/* node detail */
.glmg-detail{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,var(--dsw-specific-sidebar-fill,#1d1d1f));animation:glmg-slide .24s cubic-bezier(.2,.8,.2,1)}
.glmg-detail-head{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--g-line)}
.glmg-detail-body{flex:1;min-height:0;overflow:auto;padding:12px 14px 20px}
.glmg-detail h2{margin:6px 0 4px;font-size:16px;line-height:1.4;font-weight:600}
.glmg-crumbs{display:flex;flex-wrap:wrap;gap:2px 4px;color:var(--g-ink3);font-size:11.5px}
.glmg-crumbs button{padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer}
.glmg-crumbs button:hover{color:var(--g-ink)}
.glmg-list{margin:4px 0 0;padding:0;list-style:none}
.glmg-list li{display:flex;gap:8px;align-items:flex-start;padding:3px 0;color:var(--g-ink2)}
.glmg-list li::before{content:"";flex:none;width:6px;height:6px;margin-top:7px;border-radius:50%;background:var(--g-ink3)}
.glmg-list.ok li::before{background:var(--g-done)}
.glmg-history{margin-top:4px;font-size:12px;color:var(--g-ink3)}
.glmg-history div{padding:4px 0;border-top:1px dashed var(--g-line)}
.glmg-id{margin-top:18px;color:var(--g-ink3);font-size:11px}
.glmg-id code{font-family:var(--dsw-font-mono,ui-monospace,monospace)}
.glmg-comment{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.glmg-comment textarea{min-height:56px;padding:6px 8px;border:1px solid var(--g-line);border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--g-ink);font:inherit;resize:vertical}
.glmg-comment textarea:focus{outline:none;border-color:var(--g-accent)}
.glmg-notice{padding:10px 12px;border-radius:var(--dsw-radius-md,8px);background:var(--g-layer);color:var(--g-ink2);font-size:12.5px}
@keyframes glmg-fade{from{opacity:0}to{opacity:1}}
@keyframes glmg-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes glmg-slide{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
@keyframes glmg-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@keyframes glmg-leave{0%{opacity:1;transform:none;max-height:600px}60%{opacity:0;transform:translateX(24px);max-height:600px}100%{opacity:0;transform:translateX(24px);max-height:0;margin:0;padding-top:0;padding-bottom:0;border-width:0}}
@keyframes glmg-breathe{0%,100%{opacity:.45;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}
@keyframes glmg-halo{0%,100%{opacity:0}50%{opacity:.75}}
@keyframes glmg-ring{0%{opacity:.9;transform:scale(.6)}100%{opacity:0;transform:scale(1.7)}}
@keyframes glmg-ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--g-done) 55%,transparent)}70%,100%{box-shadow:0 0 0 6px transparent}}
@media (prefers-reduced-motion:reduce){.glmg *,.glmg *::before{animation:none!important;transition:none!important}}
`
