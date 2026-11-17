# rc3-ui progress

Lane: rc3-ui. Worktree `.worktrees/rc3-ui`, branch `rc3-ui` (off main b049b3ef).
Task: restore the bundle UI on desktop 0.2.2-rc.3 (installed app updated in
place; the desktop-l4-new lane recorded the breakage, finding 4). Gates logs
`.llm/logs/r3ui-*` (main checkout). No full probe here (rc3-probe owns it).

## The primitive change (reading)

Sources read (rc.3 = installed 0.2.2-rc.3, read-only via the established
`ELECTRON_RUN_AS_NODE=1` recipe against `resources/app.asar`; files copied to
%TEMP% only, never written back):

- Installed rc.3 web frontend: `app.asar/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-Ciz7DZxv.js` — the client module table `qJ()` maps `@deepseek-ai/dsh-client-ui-primitives` to the frozen export object `DK` (323 exports).
- Installed rc.3 `dsh-client-ui-chat` src (unminified): `src/client/chat/stat-dialog.ts`, `StatsPills.tsx`, `stat-dialog.module.css`.
- Old primitive implementation: `reference/dsh-desktop-0.2.1-rc.3/dsh-web-frontend/dist/assets/index-BXV-oxvX.js` (`useAnchoredPosition:uA`, frame clamp `Ws`, dismiss `C_`).
- Our bundle: `ui/src/channel.js` (ChannelPill, dsh-glm-zcode), `ui/src/wish/WishPill.tsx` (Pill, dsh-hourness), `ui/src/primitives.d.ts`, `ui/src/hourness-client.tsx`, `ui/src/graph/tab.tsx`, `ui/src/dsh.ts`.

Findings:

1. rc.3 primitives (`DK`) no longer export `useAnchoredPosition`. The host's
   own stat dialogs moved to **CSS Anchor Positioning**: the trigger sets
   `anchorName` (React inline style), the portaled panel sets
   `positionAnchor` + `position: fixed`, and placement lives entirely in CSS
   (`anchor(top)`/`anchor(bottom)`/`anchor(left)` + `@position-try` fallback
   chain, 12px window inset, frame overlay via `--dsh-frame-overlay-top`).
   Electron 44's Chromium (rc.3) supports it natively.
2. Still exported by rc.3 primitives, contracts unchanged (implementation
   diffed against the old bundle): `useDismissOnOutsidePointer(rootRef, open,
   setOpen, panelRef)` and `writeClipboard(text)`.
3. The old `useAnchoredPosition(options)` was pure JS measurement: viewport-
   clamped placement of the panel against the anchor rect
   (`side: 'top'|'bottom'`, `align: 'start'|'end'`, `gap`, `margin`; scroll
   capture + resize + panel ResizeObserver re-measure; null while closed or
   unmeasured), plus a top clamp honoring `--dsh-frame-top-clearance` +
   `data-fullscreen` so the panel never sits under the window frame overlay.
   The rc.1-era primitive (what our bundle built against) had the same
   contract and behavior (`ui/src/primitives.d.ts` line 61 documents it from
   the ui-chat useStatDialog lineage).
4. Failure shape on rc.3 (l4-new finding 4): destructuring the removed export
   is silent; the call throws `useAnchoredPosition is not a function` at
   render. ChannelPill's PillBoundary degrades it to a dead `GLM ⚠` span; the
   wish pill's RenderGuard reports `hourness-ui: wish button failed to
   render`. Both dialogs (the whole popover/panel machinery) are gone.
5. Panel tabs: the rc.3 sidebar-right tab registry + slot contracts
   (`sidebarRightTabs.register`, `sidebar.right.pane.tab`, guide entries) are
   shape-identical to what we register (`ui/src/graph/tab.tsx`,
   `ui/src/loops/LoopsPage.tsx` etc.). Tab registration is not the thing that
   breaks; on rc.1 the pages were reached through the 项目图 tab (w2 record).
   The l4-new lane's "tabs do not appear" observation gets re-verified on the
   real rc.3 UI after the pill fix; if still absent, the follow-up digs with
   live console errors (this lane's scope stays the primitives adaptation
   otherwise).

## Adaptation plan (per surface) — final

CSS Anchor Positioning, mirroring the host's own rc.3 surfaces. The JS-hook
replication plan (above, in the first draft) is replaced by this: it needs
less code, no measurement flash, and works on BOTH runtimes.

Version facts: the rc.1-era desktop (0.2.2-rc.1, extracted 2026-11-13) and
0.2.1-rc.3 both ran Electron 44.7.0 / Chrome 152 (`reference/dsh-desktop-0.2.2-rc.1/README.md`,
`docs/FACTS.md` line 225); the installed 0.2.2-rc.3 ships the same Electron
44.7.0 (`resources/` version file). CSS Anchor Positioning is Chromium 128+,
so the renderer under rc.1 AND rc.3 supports it — the rc.1 host's dialogs
just had not migrated yet. Template read from the installed rc.3 host:
`dsh-client-ui-model-selection/src/client/ModelSelect.tsx` + `ModelSelect.module.css`
(a trigger + portaled fit-content card above the composer, the closest
relative of our two dialogs; `dsh-client-ui-chat`'s stat dialog for the
frame-overlay insets).

The pattern, per surface (both faces keep `useDismissOnOutsidePointer`, whose
host contract is unchanged on rc.3):

- `useId()` → `--<face>-anchor` name carried as a custom property
  (`--glmh-anchor` / `--hw-anchor`) set inline on BOTH the anchor span and
  the portaled dialog (the host's ModelSelect plumbing, useId-stripped of
  colons).
- Anchor CSS: `anchor-name: var(--<face>-anchor)` on the anchor span.
- Dialog CSS: `position: fixed; position-anchor: var(--<face>-anchor);`
  band `top: max(12px, var(--dsh-frame-overlay-top, 12px)); right: 12px;
  left: anchor(left); bottom: calc(anchor(top) + 8px);` with
  `align-self: safe end; justify-self: safe start; width/height: fit-content;`
  — the same geometry the removed primitive computed (panel above the
  trigger, 8px gap, left edges aligned, clamped into the viewport, taller
  than the band → pinned at the top), done natively. `max-height` + scroll
  guard the pathological small window.
- The `placed` gating and its focus-after-measure effect go away: the panel
  renders placed from the first frame; focus moves on open.
- `ui/src/channel.js`: drop the `useAnchoredPosition` import/call/`pos`
  styles; ChannelPill gets the anchor style; the CSS array's `.glmh-anchor`
  / `.glmh-dialog` swap to the band. HeroOnboarding's centered fixed dialog
  is untouched.
- `ui/src/wish/WishPill.tsx` + `ui/src/wish/styles.ts`: same swap for
  `.hw-anchor` / `.hw-dialog` (`--hw-anchor`).
- `ui/src/primitives.d.ts`: remove the `useAnchoredPosition` declaration;
  keep `useDismissOnOutsidePointer` / `writeClipboard` (still exported by
  rc.3); the module doc notes the rc.3 removal and the CSS-anchor route.
- L2: new `tests/ui-client-primitives.spec.ts` — the ui/src sources carry no
  `useAnchoredPosition` reference (the primitive rc.3 removed; a re-import
  would break rc.3 rendering again) and both dialog skins carry
  `anchor-name` + `position-anchor`. Registered in the test:3 list next to
  wish-entry.

## Compat posture

One build serves rc.1 and rc.3: placement is renderer CSS (Chromium 152 on
both) plus two still-exported primitives whose contracts did not change. The
bundle no longer touches the removed export at all, so the same artifacts
run on rc.1 (which still exports it, harmlessly unused) and rc.3.

## Log

- [prep] 2026-11-18 05:0x+08 — worktree `.worktrees/rc3-ui` on branch
  `rc3-ui` off b049b3ef; main checkout carries the rc3-probe lane's untracked
  task dir (not touched). Reading pass complete (see above); writing code
  next.
- [code] 2026-11-18 05:1x+08 — CSS-anchor swap landed in the worktree:
  `ui/src/channel.js`, `ui/src/wish/WishPill.tsx`, `ui/src/wish/styles.ts`,
  `ui/src/primitives.d.ts` (declaration removed, doc rewritten), new
  `tests/ui-client-primitives.spec.ts` wired into `test:3` (next to
  wish-entry). node_modules junction to the main checkout (ablation-trial
  recipe).
- [gates] 2026-11-18 05:3x+08 — build exit 0 (`.llm/logs/r3ui-build.log`),
  preflight OK (`r3ui-preflight.log`), test exit 0 (`r3ui-test.log`; 3983
  tests 0 fail; eslint 69 suppressed / knip 18 / jscpd 1 — ratchets held).
  First test run red two ways, both fixed: worktree lacked the gitignored
  fixture `.agents/tasks/m5/lessons-seed.json` (copied from the main
  checkout, not committed), and my own new spec caught the literal
  "useAnchoredPosition" surviving in the explanatory comments — comments
  reworded so the ui/src-wide zero-occurrence assertion stays absolute.
- [desktop] 2026-11-18 05:50–06:00+08 — isolated rc.3 instance (port 9355,
  marker `--glm-hourness-rc3ui`, `.llm/rc3ui/` scratch home, B10 profile
  trio, package junctions to the WORKTREE build, credentials/device-mid
  copied read-only 1374/36 B, workspace `%TEMP%\rc3ui-ws\ws-main` git init +
  one proposed goal-1 via the graph CLI, storages/workspace.json written
  with python json.dump). Findings while setting up: (1) the host REQUIRES
  the real workspace.json schema — unit {name:'workspace',version:2},
  global {initialized, defaultWorkspaceId, workspaceIds,
  archivedSessionIds, pinnedSessionIds} — a hand-written minimal shape gets
  the picker stuck on 正在加载工作区…; rewrote per the real ~/.dsh shape
  (read-only) and rebooted. (2) rc.3 welcome quirk as l4-new recorded:
  passed via 添加 API Key → 稍后配置, never CDP-closed. (3) composer text
  needs a page reload before Input.insertText sticks (l4-new's note
  confirmed). Verification (shots c0–c11 in `.llm/rc3ui/shots/`): welcome
  passed, workspace loads, wish card + GLM·上手 hero render (c2/c3), one
  flash message switches to conversation view, dock shows 「◎ GLM」 +
  「交给主 Agent」 (c6) — no ⚠ boundary states; GLM dialog opens with
  CSS-anchor placement, logged-in coding-plan status, full health list
  (c7); wish popover opens above the trigger with the full ordinary-session
  content (c8); right sidebar guide lists 项目图 (c9), the graph panel page
  renders with 实时 badge and footer jump lines (c10), the loops board page
  renders in full (c11); console clean of our-package errors. The l4-new
  "tabs do not appear" finding does NOT reproduce on the fixed build.
- [teardown] 2026-11-18 06:00+08 — Browser.close clean (no #32770, process
  count 0); credentials/device-mid copies deleted, profile junctions
  removed, dsh-home + user-data-dir + %TEMP%\rc3ui-ws wiped, desktop-lock
  released; real ~/.dsh untouched. Quota: 7 flash calls, input 18.3K
  (cache reads 87K), output 196 tokens.
- [land] pending — commits: fix(ui) + docs(handoff); rebase onto main if it
  moved, ff-merge, push origin/main + github main. Probe follow-up belongs
  to the post-drift state (rc3-probe owns the full probe on rc.3).
