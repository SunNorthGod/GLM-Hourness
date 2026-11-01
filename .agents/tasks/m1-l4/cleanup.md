# m1-cleanup 记录

日期 2026-10-29（UTC+8）。项目图任务 `m1-cleanup`，工作流 `wf_10cbbc919767c467` 第 4 步。前提：`.agents/tasks/m1-l4/l4.md` 第一行为 `L4 RESULT: PASS`（已核）。用户决定（question-12，`m1-cleanup` 2026-10-28T16:06 批注）：清理由 agent 自行决定，含 `~/.dsh` 下的条目；改 profile 前备份，删除前列出全部路径。

本文件不含任何凭证、key、secret、签名、设备 ID 的值；凭证与 deviceMid 文件只记路径与大小。

## 1. 删除前清单（2026-10-29，删除之前写入）

### 1.1 删除前的核对

| 核对 | 结果 |
| --- | --- |
| `~/.dsh/profiles/desktop/.llm/audit/usage.jsonl` 190 行是否都在 `~/.dsh/glm-hourness/audit/usage.jsonl` | 190/190 整行存在 |
| `~/.dsh/profiles/desktop/.llm/audit/decisions.jsonl` 3 行是否都在仓库 `.llm/audit/decisions.jsonl` | 3/3 整行存在 |
| `~/.dsh/profiles/desktop/.llm/memory.json` 与仓库 `.llm/memory.json` | SHA-256 相同（均 1147 字节） |
| 仓库 `.llm/audit/usage.jsonl` 890 行是否都在用户级流水 | 890/890 整行存在 |
| 仓库 `.llm/audit/usage.jsonl` 晚于 `2026-10-27T12:29:08.993Z` 的行 | 0 行（最晚一行恰为 `2026-10-27T12:29:08.993Z`，1 行，不晚于截止点） |
| 用户级凭证记录 `C:\Users\29596\.dsh\glm-hourness\credentials.json` | 存在，1374 字节，修改时间 2026-10-29T02:11:07Z（L4 第一回合迁移为版本 2，见 l4.md 第 2 项） |
| 用户级 deviceMid 文件 `C:\Users\29596\.dsh\glm-hourness\device-mid.txt` | 存在，36 字节；与仓库 `.llm/device-mid.txt` 的 SHA-256 相同（只比较摘要，未打印） |
| 代码是否还读仓库 `.llm/credentials.json` | 否：`glm-llm` 与 `glm-login` 的 `home` 默认 `<DSH home>/glm-hourness`，桌面 profile 没有覆盖 |
| `Desktop/Project/dsh-glm-dialect` 的 4 个文件是否在本仓库 git 历史 | 4/4：`git hash-object` 得到的 blob 都在仓库对象库中（`0768b86cf812`、`b4cb52fd8094`、`bdd9b98664a4`、`26094bdf7fd2`）；目录不是 git 仓库 |
| `.worktrees/graph-engine` | 空目录（0 个条目）；`git worktree list` 只有主检出 |
| `origin/graph-engine`（`5463662`） | 是 `main` 的祖先（`git merge-base --is-ancestor` 退出码 0） |
| profile 基础层里的 `llm-pi-ai` 行 | `reference/dsh-desktop-0.2.1-rc.3/dsh-base/cordis.patch.yml`:135 以零路由休眠挂载；去掉 patch 里的 `llm-pi-ai` 条目后回到零路由 |

### 1.2 profile 改动与备份

- 文件：`C:\Users\29596\.dsh\profiles\desktop\cordis.patch.yml`（改前 3021 字节，UTF-8 无 BOM，LF，SHA-256 `19A326572BCB595258FDF543D73A830B3AE426629976D00BA0D3A26E412F38D1`）。
- 备份：`C:\Users\29596\.dsh\profiles\desktop\cordis.patch.yml.bak-1793241992974`（3021 字节，摘要与原文件相同）。
- 改动：删除 `- id: llm-pi-ai`（`@deepseek-ai/dsh-llm-pi-ai`）整条，即第 47–75 行；该条只含 `providers.glm`（`baseURL: http://0.0.0.0:8317`，模型 `glm-5.3`、`glm-5.3-flash`）。其余条目不动，`agent-default-model` 保持 `deepseek-account` / `deepseek-flash` / `high`。

### 1.3 待删除路径

| # | 路径 | 类型与大小 |
| --- | --- | --- |
| 1 | `C:\Users\29596\.dsh\profiles\desktop\package.json.bak-1793157445556` | 文件，1225 字节 |
| 2 | `C:\Users\29596\.dsh\profiles\desktop\cordis.patch.yml.bak-1793093243213` | 文件，2513 字节 |
| 3 | `C:\Users\29596\.dsh\profiles\desktop\cordis.patch.yml.bak-1793101338423` | 文件，2955 字节 |
| 4 | `C:\Users\29596\.dsh\profiles\desktop\.llm\` | 目录：`memory.json` 1147 字节、`audit\decisions.jsonl` 328 字节、`audit\usage.jsonl` 41822 字节 |
| 5 | `C:\Users\29596\Desktop\Project\dsh-glm-dialect\` | 目录：`docs\00-charter.md` 4075、`docs\01-zcode-capabilities-reference.md` 37725、`docs\02-dsh-zcode-divergence.md` 15909、`docs\02-zcode-tool-schemas.md` 8884 字节 |
| 6 | `C:\Users\29596\Desktop\Project\GLM-Hourness\.llm\credentials.json` | 文件，998 字节（版本 1 记录） |
| 7 | `C:\Users\29596\Desktop\Project\GLM-Hourness\.llm\device-mid.txt` | 文件，36 字节 |
| 8 | `C:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\graph-engine\` | 空目录 |
| 9 | 远端分支 `origin/graph-engine`（Gitee `NorthGod_BFDG/GLM-Hourness`，`refs/heads/graph-engine` = `5463662`） | 远端引用 |

保留：本次新建的备份 `cordis.patch.yml.bak-1793241992974`；`.worktrees\` 目录本身（并行线工作树的约定位置）。

### 1.4 用量补拷

- 来源：仓库 `.llm/audit/usage.jsonl`，890 行。
- 目标：`C:\Users\29596\.dsh\glm-hourness\audit\usage.jsonl`，补拷前 1177 行。
- 晚于 `2026-10-27T12:29:08.993Z` 的行：0 行，按整行去重后需补拷 0 行；预期补拷后仍为 1177 行。

## 2. 执行结果（2026-10-29，删除之后写入）

### 2.1 profile 改动

- 02:47:07Z 写入 `C:\Users\29596\.dsh\profiles\desktop\cordis.patch.yml`：107 行 → 78 行，删除 29 行、新增 0 行（`Compare-Object` 对照备份）；3021 → 2273 字节，SHA-256 `BDB2B388C5A39595EB533DF54C4E7C3DDF7BB41CD2D20619A0BBDD7772535872`；仍为 UTF-8 无 BOM、LF、以换行结尾；文件里不再有 `8317` 与 `llm-pi-ai`。
- 备份：`C:\Users\29596\.dsh\profiles\desktop\cordis.patch.yml.bak-1793241992974`（3021 字节，SHA-256 `19A326572BCB595258FDF543D73A830B3AE426629976D00BA0D3A26E412F38D1`）。还原：把备份复制回 `cordis.patch.yml` 后重启桌面版。
- `agent-default-model` 改后与重启后都是 `provider: deepseek-account`、`model: deepseek-flash`、`reasoningEffort: high`；重启后文件的大小、修改时间与摘要不变（02:51Z 复核）。

### 2.2 删除

1.3 节第 1–8 项逐项 `Remove-Item -LiteralPath`，删除后 `Test-Path` 均为 `False`，没有报错。删除后 profile 目录只剩 `.plugin-manager\`、`node_modules\`、`cordis.patch.yml`、`cordis.patch.yml.bak-1793241992974`、`cordis.yml`、`desktop-next.cordis.patch.json`、`desktop-next.runtime.patch.json`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`；`.worktrees\` 为空目录。

第 9 项：`git push origin --delete graph-engine`（`GCM_INTERACTIVE=never`、`GIT_TERMINAL_PROMPT=0`）退出码 0，远端回报 `- [deleted] graph-engine`；`git fetch --prune origin` 后 `git ls-remote origin graph-engine` 为空，`git branch -a` 只剩 `main`、`origin/main`、`origin/HEAD`。`origin/main` 仍为 `e4de013`，未改动。

### 2.3 用量补拷

补拷 0 行（没有晚于截止点的行）。目标文件补拷后 1177 行，去重后 1177 行，272169 字节，修改时间仍为 2026-10-29T02:21:07Z（L4 最后一条用量），本步没有写它。

### 2.4 用户级凭证与 deviceMid

删除仓库副本之后：`C:\Users\29596\.dsh\glm-hourness\credentials.json` 1374 字节、修改时间 2026-10-29T02:11:07Z；`C:\Users\29596\.dsh\glm-hourness\device-mid.txt` 36 字节。两者都未被本步改动，内容未读。

### 2.5 重启验收（m1-cleanup 验收第 2 条）

- 02:48 以 `.agents/tasks/m8-doing-layout/restart.ps1` 重启（`--remote-debugging-port=9333`，宿主输出写在 `.agents/tasks/m2-panel/dsh-out.txt`、`dsh-err.txt`）。新实例主进程 134916 创建于 02:48:09.82Z，GPU、utility、renderer（50152）与宿主 node 进程（137848）随后创建。
- crash log：重启过程中出现 `crash-2026-10-29T02-48-08-796Z-renderer.log`（`Desktop renderer exited: crashed`，`shell pid: 72776`，renderer 控制台为空）。它属于被关闭的旧实例：写入时间比新主进程的创建早 1.0 秒，pid 72776 不在新实例的进程树里，时间与脚本 `Stop-Process -Force` 的位置吻合（`CloseMainWindow` 之后约 3 秒）。L4 结束时窗口 `visibilityState` 为 `hidden`，推断 `CloseMainWindow` 没有让旧窗口正常退出，强杀时旧主进程先记下了 renderer 退出〔推断〕。2026-10-28T15:57:06Z 的 renderer crash log 内容同形。新实例启动之后（02:48:09.82Z 起，到 02:51:31Z）没有新的 crash log。
- 宿主 stdout：更新检查、inspector 地址、web 地址（含令牌，不外传）、`[llm-deepseek-account] model listing … loaded 2 model(s)`；stderr：`DevTools listening on ws://127.0.0.1:9333/…`。两者都没有 `glm-hourness` 字样。
- 页面控制台（CDP 回放，`cleanup-cdp-logs-boot.txt`、`cleanup-cdp-logs-settled.txt`、`cleanup-cdp-logs-end.txt`；最后一份 43 行）：全部是 inspector 插件连 `ws://127.0.0.1:9230/ingest` 失败的已知噪声；没有异常，没有 HTTP ≥ 400，没有 `did not activate` 或 `import failed`，ingest 行之外没有提到 `glm-hourness` 或 `glmg-` 的条目。
- 模型菜单（`shots/cleanup-02-model-menu.png`、`shots/cleanup-03-model-submenu.png`）：分组为「DeepSeek 账号」（DeepSeek-V4.1-Flash 已选、DeepSeek-V4-Pro）与「GLM (ZCode native)」（GLM-5.3、GLM-5.3-Flash），原 pi-ai 的「Zcode本机反代」分组不再出现。菜单经 Escape 关闭，没有选择任何模型；输入框仍显示 `DeepSeek-V4.1-Flash 1017 High`。
- 重启后截图：`shots/cleanup-01-after-restart.png`。
- 结束状态：DSH 运行中（主进程 134916），CDP 端口 9333 应答（`Chrome/152.0.7977.130`）。页面仍报告 `document.visibilityState` 为 `hidden`，截图可取。

结论：验收第 1 条「列出的文件与目录都不存在」与第 2 条「桌面端重启后无新错误」均满足。

## 3. 文档

提交 `593a6be`（docs: record the m1-cleanup results in HANDOFF and DESIGN (m1-cleanup)），已推送 `origin/main`（非强推；`git ls-remote --heads origin` 只剩 `refs/heads/main` = `593a6be`）。`DESIGN.md` §1、§2.4、§4.1 与 `HANDOFF.md` 0.6 的 §2–§6 不再把上述条目写成待删。门禁在该提交的树上各跑一次：`npm run build` 退出码 0，`npm run preflight` 退出码 0，`npm test` 退出码 0（39 个 spec 文件，556 通过，0 失败；逐字 443 段、已知偏差 0；ESLint 250 / knip 21 / jscpd 2 处 16 行，与基线相同；gitleaks 无发现；graph:smoke ok）。日志：`cleanup-build.log`、`cleanup-preflight.log`、`cleanup-test.log`。`docs/graph/` 未改。
