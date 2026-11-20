/**
 * Styles for the 「子智能体」 right-sidebar spectator dashboard, rendered as a
 * <style> element (static client bundles do not bundle CSS modules).
 *
 * Follows DSH theme tokens (--dsw-*), meets >= 4.5:1 light-theme contrast via
 * `body:not([data-ds-dark-theme]) .glms`, stops motion under
 * `prefers-reduced-motion`, and adapts across narrow (~300 px) sidebars and
 * wide/fullscreen panes.
 */
export const SUBAGENT_LIGHT_TOKENS = {
  ink3: 'var(--dsw-alias-label-secondary,#61666b)',
  link: 'color-mix(in srgb,var(--dsw-alias-state-business-primary,#4176e6) 80%,var(--dsw-alias-label-primary,#0f1115))',
} as const

export const SUBAGENTS_CSS = `
.glms{--s-done:var(--dsw-alias-state-success-primary,#3fb950);--s-doing:var(--dsw-alias-state-warn-primary,#d29922);--s-wait:var(--dsw-alias-state-error-primary,#f85149);--s-accent:var(--dsw-alias-state-business-primary,#2f81f7);--s-link:var(--s-accent);--s-purple:#a371f7;--s-ink:var(--dsw-alias-label-primary,#e6e6e6);--s-ink2:var(--dsw-alias-label-secondary,#b5b5b5);--s-ink3:var(--dsw-alias-label-tertiary,#8a8a8a);--s-line:var(--dsw-alias-border-l2,rgba(127,127,127,.18));--s-line-strong:var(--dsw-alias-border-l1,rgba(127,127,127,.28));--s-hover:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1));--s-layer:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.06));--s-layer2:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1));
  container-type:inline-size;display:flex;flex-direction:column;height:100%;min-height:0;color:var(--s-ink);font-family:var(--dsw-font-family,inherit);font-size:13px;line-height:1.45}
body:not([data-ds-dark-theme]) .glms{--s-ink3:${SUBAGENT_LIGHT_TOKENS.ink3};--s-link:${SUBAGENT_LIGHT_TOKENS.link}}
.glms *{box-sizing:border-box}
.glms-head{flex:none;display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-bottom:1px solid var(--s-line)}
.glms-head-top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.glms-beacon{display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:13px;color:var(--s-ink);min-width:0}
.glms-beacon-dot{width:8px;height:8px;border-radius:50%;background:var(--s-ink3);flex:none}
.glms-beacon-dot.live{background:var(--s-done);animation:glms-ping 2.2s ease-out infinite}
.glms-refresh{padding:2px 8px;border:1px solid var(--s-line);border-radius:6px;background:transparent;color:var(--s-ink2);font:inherit;font-size:11.5px;cursor:pointer;flex:none}
.glms-refresh:hover{background:var(--s-hover);color:var(--s-ink)}
.glms-stats{display:flex;flex-direction:column;gap:6px}
.glms-slot-row{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--s-ink2);flex-wrap:wrap}
.glms-slot-bar{flex:1;min-width:56px;height:5px;border-radius:3px;background:var(--s-hover);overflow:hidden}
.glms-slot-fill{display:block;height:100%;border-radius:3px;background:var(--s-accent);transition:width .25s ease}
.glms-slot-fill.full{background:var(--s-doing)}
.glms-token-row{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11.5px;color:var(--s-ink3);font-variant-numeric:tabular-nums}
.glms-filters{display:flex;flex-wrap:wrap;gap:4px}
.glms-filter{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:1px solid var(--s-line);border-radius:999px;background:transparent;color:var(--s-ink2);font:inherit;font-size:11.5px;cursor:pointer;transition:background .12s,border-color .12s}
.glms-filter:hover{background:var(--s-hover)}
.glms-filter[aria-pressed="true"]{border-color:var(--s-accent);background:color-mix(in srgb,var(--s-accent) 12%,transparent);color:var(--s-ink);font-weight:500}
.glms-mode-row{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.glms-mode-label{font-size:11.5px;color:var(--s-ink3);white-space:nowrap}
.glms-mode-seg{display:inline-flex;align-items:center;padding:2px;border:1px solid var(--s-line);border-radius:8px;background:var(--s-layer);gap:2px}
.glms-mode-btn{height:22px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--s-ink2);font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s}
.glms-mode-btn:hover:not(:disabled){background:var(--s-hover);color:var(--s-ink)}
.glms-mode-btn[aria-pressed="true"]{background:color-mix(in srgb,var(--s-accent) 18%,transparent);color:var(--s-ink);font-weight:600}
.glms-mode-btn:disabled{opacity:.55;cursor:not-allowed}
.glms-mode-err{font-size:11.5px;color:var(--s-wait);overflow-wrap:anywhere}
.glms-body{flex:1;min-height:0;overflow:auto;padding:10px 12px 18px;display:flex;flex-direction:column;gap:10px;scrollbar-gutter:stable}
.glms-alerts{display:flex;flex-direction:column;gap:6px}
.glms-alert{padding:8px 10px;border:.5px solid color-mix(in srgb,var(--s-wait) 45%,var(--s-line));border-left:3px solid var(--s-wait);border-radius:var(--dsw-radius-md,10px);background:color-mix(in srgb,var(--s-wait) 7%,var(--s-layer))}
.glms-alert.warn{border-color:color-mix(in srgb,var(--s-doing) 45%,var(--s-line));border-left-color:var(--s-doing);background:color-mix(in srgb,var(--s-doing) 8%,var(--s-layer))}
.glms-alert-title{font-size:12px;font-weight:600;color:var(--s-ink);overflow-wrap:anywhere}
.glms-alert-detail{margin-top:2px;font-size:11.5px;color:var(--s-ink2);overflow-wrap:anywhere}
.glms-notice{padding:8px 10px;border:.5px solid var(--s-line);border-radius:var(--dsw-radius-md,10px);background:var(--s-layer);font-size:12px;color:var(--s-ink2)}
.glms-group{display:flex;flex-direction:column;gap:6px}
.glms-group-head{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:2px 2px 0;font-size:11.5px;font-weight:600;color:var(--s-ink3);letter-spacing:.01em}
.glms-cards{display:grid;grid-template-columns:1fr;gap:8px}
@container (min-width:620px){.glms-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
.glms-card{display:flex;flex-direction:column;gap:6px;padding:10px 11px;border:.5px solid var(--s-line-strong);border-radius:var(--dsw-radius-lg,12px);background:var(--s-layer);min-width:0}
.glms-card.nested{margin-left:14px;border-left:2px solid var(--s-line-strong)}
.glms-card.running{border-color:color-mix(in srgb,var(--s-doing) 42%,var(--s-line-strong))}
.glms-card.attention{border-color:color-mix(in srgb,var(--s-wait) 50%,var(--s-line-strong));box-shadow:inset 3px 0 0 var(--s-wait)}
.glms-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;min-width:0}
.glms-card-id{display:flex;align-items:center;gap:6px;min-width:0;flex:1}
.glms-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--s-ink3)}
.glms-dot.running{background:var(--s-doing);animation:glms-breathe 2s ease-in-out infinite}
.glms-dot.waiting-approval,.glms-dot.waiting-main,.glms-dot.error{background:var(--s-wait)}
.glms-dot.done{background:var(--s-done)}
.glms-title{font-weight:600;font-size:13px;color:var(--s-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.glms-duration{flex:none;padding:1px 6px;border-radius:6px;background:var(--s-hover);color:var(--s-ink2);font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;font-variant-numeric:tabular-nums}
.glms-badges{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.glms-pill{display:inline-flex;align-items:center;padding:1px 6px;border-radius:5px;background:var(--s-hover);color:var(--s-ink2);font-size:11px;line-height:16px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.glms-pill.role{background:color-mix(in srgb,var(--s-purple) 15%,transparent);color:color-mix(in srgb,var(--s-purple) 70%,var(--s-ink))}
.glms-pill.plan{background:color-mix(in srgb,var(--s-accent) 14%,transparent);color:var(--s-link)}
.glms-pill.warn{background:color-mix(in srgb,var(--s-wait) 14%,transparent);color:var(--s-wait)}
.glms-activity{font-size:12px;color:var(--s-ink2);overflow-wrap:anywhere}
.glms-tokens{display:flex;flex-wrap:wrap;gap:4px 8px;font-size:11px;color:var(--s-ink3);font-variant-numeric:tabular-nums}
.glms-tools{display:flex;flex-wrap:wrap;gap:4px}
.glms-tool{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:5px;background:var(--s-layer2);color:var(--s-ink2);font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10.5px;line-height:16px;max-width:100%}
.glms-tool.bad{background:color-mix(in srgb,var(--s-wait) 15%,transparent);color:var(--s-wait)}
.glms-tool-ms{color:var(--s-ink3);font-size:10px}
.glms-actions{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding-top:2px;border-top:1px solid var(--s-line)}
.glms-btn{padding:2px 6px;border:0;border-radius:5px;background:transparent;color:var(--s-link);font:inherit;font-size:11.5px;cursor:pointer}
.glms-btn:hover{background:var(--s-hover);text-decoration:underline}
.glms-inspector{margin-top:4px;padding-top:6px;border-top:1px dashed var(--s-line);display:flex;flex-direction:column;gap:6px;font-size:11.5px;color:var(--s-ink2)}
.glms-preview{padding:6px 8px;border-radius:6px;background:var(--s-layer2);white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto;font-size:11.5px;line-height:1.5}
.glms-cmds{margin:0;padding-left:14px;display:flex;flex-direction:column;gap:2px;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10.5px;color:var(--s-ink3)}
.glms-cmds li{overflow-wrap:anywhere}
.glms-empty{padding:32px 12px;text-align:center;color:var(--s-ink3);font-size:12.5px}
@keyframes glms-breathe{0%,100%{opacity:.45;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}
@keyframes glms-ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--s-done) 55%,transparent)}70%,100%{box-shadow:0 0 0 6px transparent}}
@media (prefers-reduced-motion:reduce){.glms *,.glms *::before{animation:none!important;transition:none!important}}
`
