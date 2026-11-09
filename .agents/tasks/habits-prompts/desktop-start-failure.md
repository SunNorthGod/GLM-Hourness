# Desktop start failure under the habits-prompts land step (2026-11-06)

Read-only investigation. No process was stopped, the dialog was not clicked, nothing under `C:\Users\29596\.dsh` or the desktop userData was changed. `.llm/desktop-lock` is still held by `wf_7bd410e5bb88654f land`.

## Symptom

- Two starts of the human's desktop (`DeepSeek Harness.exe --remote-debugging-port=9333`, start part of `m1-l4/restart.ps1`), 01:28 and 02:03, both failed in phase startup:
  `Error: desktop welcome: Web authentication failed` at `connectDesktopWelcome` (app.asar `lib/main.js:8886`).
- Crash logs: `%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-2026-11-05T17-28-43-544Z-host.log`, `crash-2026-11-05T18-03-27-746Z-host.log` (identical stacks, no renderer errors).
- Captured output: `dsh-err.txt` / `dsh-out.txt` (01:28), `dsh-err-2.txt` / `dsh-out-2.txt` (02:03). stdout shows the host came up (`dsh web: http://127.0.0.1:<port>/?token=...`) before the failure. The pre-restart logs (`dsh-err-before.txt`, `dsh-out-before.txt`, start 22:11) have no such error.

## Cause

The desktop's Electron cookie jar holds one `dsh-auth-*` cookie per past Host launch, and their combined Cookie header now exceeds Node's HTTP header limit, so the Host answers 431 and the welcome connect fails.

Chain (source: `reference/deepseek-harness`, 0.2.1-rc.3, same as installed):

1. Each launch the Host listens on a random 127.0.0.1 port. `BrowserAuth.authorizeIndex` (`packages/client/connection/src/browser-auth.ts`) mints a cookie named `dsh-auth-` + sha256(authority), authority = `127.0.0.1:<port>`, `Max-Age` 30 days.
2. Cookies are not port-scoped, so every such cookie is stored under host `127.0.0.1` in `%APPDATA%\@deepseek-ai\dsh-desktop\Network\Cookies` and none is ever removed before expiry.
3. `connectDesktopWelcome` (`apps/desktop/src/welcome-backend.ts`) calls `net.fetch(authenticatedUrl, { credentials: 'include' })` through the Electron session, so all stored `127.0.0.1` cookies go out in one Cookie header. (`authenticateWebHost` in `web-document.ts` uses Node `fetch` without the jar, which is why it passes first.)
4. The Host webserver (`packages/host/webserver/src/index.ts`) uses `node:http` `createServer` with the default `maxHeaderSize` 16384. Over the limit Node answers 431; `!authenticated.ok` throws `desktop welcome: Web authentication failed`.

Evidence:

- Cookie jar (read from a temporary copy, deleted afterwards): 71 cookies for `127.0.0.1`, all `dsh-auth-*`, approx Cookie header 16188 bytes. Oldest 2026-10-26T09:36Z, newest 2026-11-05T17:28:43.459Z. Per day: 10-26 3, 10-27 17, 10-28 15, 10-29 16, 10-31 1, 11-01 2, 11-03 3, 11-04 7, 11-05 7.
- Node default `http.maxHeaderSize` on this machine: 16384. A local `node:http` server answered a 14969-byte Cookie header with 303 and a 16176-byte one with 431.
- Timing matches: at 01:28 the token request still fit, minted the 71st cookie (17:28:43.459Z, the newest), and the redirect follow-up with 71 cookies got 431. At 02:03 the first request already carried 71 cookies, got 431, and no new cookie was minted.

Ruled out:

- Leftover processes: no `DeepSeek Harness` shell process without `bin.js` at 02:12 and 02:22 (only headless probe runs of other worktrees, which use their own profiles); no `lockfile` in the userData directory; ports 9333 and 9230 not listening.
- Environment: `DSH_HOME` is unset in this shell and at user and machine scope; no `HTTP(S)_PROXY`/`NODE_OPTIONS`. System proxy is disabled (`ProxyEnable 0`; its override list covers `127.*` anyway).
- The landed code: habits-prompts changes `src/design`, `src/graph` and tests only; the failure is in the desktop shell before any plugin answers the request. "Disable third-party plugins..." would not help and rewrites the profile.

## Proposed fix (needs approval: it edits the desktop's userData, not `~/.dsh`)

With no desktop shell running:

1. Back up `%APPDATA%\@deepseek-ai\dsh-desktop\Network\Cookies` (and `Cookies-journal`) into this directory.
2. Delete the rows `host_key = '127.0.0.1' AND name LIKE 'dsh-auth-%'` from that database. These only authenticate dead Host ports; the next launch mints a fresh one. API keys and the DeepSeek login live in the DSH home credentials, not in these cookies.
3. Start, with `DSH_HOME` unset:

```powershell
Start-Process -FilePath (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\DeepSeek Harness.exe') -ArgumentList '--remote-debugging-port=9333' -RedirectStandardOutput 'C:\Users\29596\Desktop\Project\GLM-Hourness\.agents\tasks\habits-prompts\dsh-out-3.txt' -RedirectStandardError 'C:\Users\29596\Desktop\Project\GLM-Hourness\.agents\tasks\habits-prompts\dsh-err-3.txt'
```

4. Compare `dsh-err-3.txt` with `dsh-err-before.txt` and check `logs/` for a new crash report.

Alternative without touching the database: none at the desktop side; the cookies expire 30 days after each launch, so the jar stays over the limit for weeks.

The problem recurs after roughly 70 launches within 30 days. Worth recording in FACTS.md and reporting upstream (per-port cookie names in a port-blind jar, sent by `net.fetch` with `credentials: 'include'`, against the 16 KB header limit).

## Fix applied (2026-11-06 02:30, approved by the human)

Approval relayed by the orchestrator, the human's words: 「你随便清就行了。我已经说了dsh你随便搞，凭据啥的也无所谓，只要别碰我鼠标键盘就行」.

- Precondition at 02:29-02:30: no desktop shell process (only headless `bin.js` probe runs of other worktrees), no `lockfile` in userData, 9333 not answering.
- Backup: `.agents/tasks/habits-prompts/cookies-backup-2026-11-06/Cookies` (53248 bytes) and `Cookies-journal` (0 bytes), copied before the edit.
- Deleted rows `host_key = '127.0.0.1' AND name LIKE 'dsh-auth-%'`: 71 (before: 71 matching, 71 rows for that host; after: 0). No other rows touched. No cookie value was printed.
- Start at 02:31:3x with `DSH_HOME` unset (command as proposed above; a first attempt at 02:31:32 failed in PowerShell argument binding before any process started, then started correctly).

## Result after the start

- No new crash report: newest in `logs/` is still `crash-2026-11-05T18-03-27-746Z-host.log`.
- `dsh-err-3.txt` has only the DevTools line, the same shape as `dsh-err-before.txt`.
- `dsh-out-3.txt`: updater "Found version 0.2.2-rc.1" (not installed), inspector line, `[llm-deepseek-account] model listing ... loaded 2 model(s)`; no `dsh web` failure.
- 9333 answers; page target `dsh-app://app/` titled "DeepSeek Harness", main window in the workspace (no welcome window, no error dialog).
- Plugins page, read over CDP (Runtime.evaluate only, no input to sessions):
  - dsh-glm-zcode: 共 5 个 · 5 运行中.
  - dsh-hourness: 共 15 个 · 13 运行中 · 2 已停用; the two stopped rows are `lessons` and `transcript` (shown 已关闭, disabled in the profile); every enabled row is 运行中.
- Renderer console during the checks: 35 entries, all known, 0 other errors, 0 naming our packages.
- Loaded build: `packages/*/dist/build-info.json` commit 3cc7408 (dirty flag true: the main checkout had other lanes' uncommitted files at build time). Main HEAD is 086e54e; `git diff 3cc7408 HEAD` outside `docs/graph` is empty, so the loaded code equals main HEAD's code and contains the habits-prompts merge 5b42f28 (its new text is present in dist). The main checkout was not rebuilt now because it again carries another lane's uncommitted source changes (`src/design/propose.ts`, `ui/src/loops/LoopsPage.tsx`, `knip.js`, `package.json`).
- `.llm/desktop-lock` released after these checks.
