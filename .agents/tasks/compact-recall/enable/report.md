# transcript-enable：transcript 行出厂启用（2026-11-07）

项目图节点 `compact-recall`。原由 Kiro 工作流 `wf_e67d1f1c90ebd359` 运行，code 步被上游 503 打断后由 Cursor agent 接手。结论：行已出厂启用并合入 main（`23739f1a`），人的桌面版核对通过，没有改回禁用的提交。

## 改动

- `ac6413cf` feat: ship the transcript row enabled (compact-recall)：`packages/hourness/cordis.patch.yml` 去掉 `disabled: true` 并改写行注释；L2 `tests/data-transcript.spec.ts` 钉住出厂启用与 `config: {}`；探针 `glm-compact` 在覆盖层里禁用这一行（保留「禁用时检查点没有原文路径一句」的核对），`glm-compact-transcript` 仍钉为启用并指向场景 `home`，新增「不带覆盖层的启动场景两条路由都列出 transcript 行『已加载，本会话未触发』」一项；`locale/transcript` 的说明改为「默认启用」；`DESIGN.md` 行表、§2.4（新增「启用与已知边界」一条，记人的原话与 L4 观察 1 的形状判法边界）、§5.6、§5.8 第 21 项，`DEVELOPMENT.md` §3 探针一段，`HANDOFF.md` transcript 一行，`packages/hourness/README.md` 行表（加 transcript 行，删掉「带 disabled 的行出厂关闭」一句，本包已没有这样的行）。
- `1cc4cbdf` docs: 评审记录 `review.md` 第 2 轮。
- `23739f1a` 合入 origin/main（只有 `docs/graph`）的合并提交，即快进后的 main。

接手时工作树里的半成品（8 个文件）按 `bad85a49` 的清单核对：patch 行、注释、L2、探针覆盖层、DESIGN/DEVELOPMENT/HANDOFF 保留；改了探针新增的一项（原先判「不是未加载」，评审第 1 轮前改成判「生效」是错的，最后定为判「已加载，本会话未触发」加激活说明前缀）与两处文档的同一说法；补了 locale 两个文件、README 行表、L2 对 `config: {}` 的断言。ORCHESTRATION.md 没有提到这一行的默认状态，不改。

## 评审

独立评审（子 agent，只读）：第 1 轮 CHANGES_REQUESTED，挡路两条：探针新项期待「生效」而启用未触发的行显示「已加载，本会话未触发」（`src/shared/health.ts` 的 `collectHealth`）；locale 说明仍写「默认关闭」。两条都改，第 2 轮 APPROVED。记录在 `review.md`。

## 门禁

| 轮 | 树 | build | preflight | npm test | probe |
| --- | --- | --- | --- | --- | --- |
| 1 | `54a40775` + 半成品与首轮修改 | 0 | 0 | 0，3279/3279 | 1，434/438 |
| 2 | `e4680b5b` + 评审后的改动 | 0 | 0 | 0，3279/3279 | 0，438/438 |
| 3 | 合入 `db160034`（任务文稿、`.gitignore`、图） | 0 | 0 | 0，3279/3279 | 不跑（无运行时文件） |
| 4 | 合并提交 `23739f1a`（合入 `0ce50ab8`，只有图） | 0 | 0 | 0，3279/3279 | 不跑（无运行时文件） |

棘轮每轮都是 eslint 73、knip 18、jscpd 1 处克隆，没有上升；gitleaks 每轮无发现。探针在 `.llm/probe-lock-2` 下跑（`probe-lock` 当时由 ablation 的标定占着），跑完删锁。

第 1 轮探针的 4 项失败：一项是上面评审第 1 条；另三项（`guard: quoted =>…`、`design main (GLM)`、`design main (non-GLM)`）报 `error: missing config key GIT_CONFIG_KEY_0`。原因是 Cursor agent 的 shell 导出 `GIT_CONFIG_COUNT=1`、`GIT_CONFIG_KEY_0`、`GIT_CONFIG_VALUE_0`，DSH 给工具 shell 的环境去掉了名字带 KEY 的变量，留下的 `GIT_CONFIG_COUNT` 让 git 报错，与本改动无关。第 2 轮在探针的 shell 里删掉这三个变量后 438/438。

## 合入

- 主检出 `main`，`git status --porcelain --untracked-files=no` 合入前、build 前后都为空；`git merge --ff-only transcript-enable`：`0ce50ab8..23739f1a`。
- 主检出 `npm run build` 退出 0；两包 `build-info.json` 的 `commit` 都是 `23739f1`，等于 `git rev-parse --short=7 HEAD`（`dirty: true` 来自未跟踪的任务文稿）。
- `git push origin main`、`git push github main`：都是 `0ce50ab8..23739f1a`，一次成功。
- 关桌面版：合入前（02:28、02:35 两次）人的桌面版没有在运行（没有桌面壳的主进程，userData 没有 `lockfile`，9333 无应答），没有发 `Browser.close`。当时在跑的两个 `DeepSeek Harness.exe` 主进程都是经 `bin.js` 跑的无头运行时：ablation 的标定（profile 的包指向 `.worktrees/ablation`）与 bootstrap 的探针，都不加载主检出的产物。

## 重启桌面版

- `.llm/desktop-lock` 02:29:50 建，持有者 `transcript-enable desktop (Cursor agent taking over wf_e67d1f1c90ebd359; land + desktop check)`，每 5 分钟核对后续写，02:44:13 停续写后删锁。
- 启动前 userData `Network\Cookies` 副本里 `127.0.0.1` 的 `dsh-auth-%` cookie 12 个，不到 50，没有删、没有改。
- 02:38:15 用人的 userData（不带 `--user-data-dir`，不设 `DSH_HOME`）带 `--remote-debugging-port=9333` 启动。启动环境去掉了 agent shell 带的变量（`CURSOR_*`、`VSCODE_*`、`GIT_CONFIG_*`、`CHROME_CRASHPAD_PIPE_NAME` 等），PATH 按机器与用户两级的值重建，否则桌面版里的 git 会和探针一样报 `GIT_CONFIG_KEY_0`。
- 宿主 stderr 只有 DevTools 监听一行；stdout 是更新检查（发现 0.2.2-rc.1，没有安装）、inspector、web 端口与 DeepSeek 模型列表。`%APPDATA%\@deepseek-ai\dsh-desktop\logs` 没有新的崩溃记录（最新仍是 2026-11-06 02:03 那份）。`~/.dsh/logs` 自 2026-10-26 起没有再写。
- 人的 profile 没有改：`~/.dsh/profiles/desktop/cordis.patch.yml` SHA256 `610FB115…`、`package.json` `CF7D775A…`，与 compact-recall L4 记录的相同；里面没有 `glm-hourness/transcript` 的覆盖，行按出厂默认加载。

## 桌面核对（只经 CDP）

临时会话：02:38:54 在侧栏「在“GLM-Hourness”中新建会话」建 `session-c2833df3-7d28-4bcc-a060-3006ca303c85`（工作区 GLM-Hourness，模型 GLM-5.3-Flash）。每次往输入框打字或按键前核对当前会话 id 以 `session-c2833df3` 开头、工作区标签是 GLM-Hourness。没有往人的会话里输入。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `/glm-status` 里 transcript 行已加载 | 通过 | 02:39:09、02:40:27 两次 `/glm-status`，会话日志的 `command/done` 都写 `dsh-hourness · transcript · 已加载，本会话未触发 · 已加载；GLM 压缩时把会话导出到项目 .llm/transcripts/，像凭证的字符串遮掉，别的会话的导出 14 天后清掉`。启用而还没动作的行就显示这一态，「生效」要在本会话里发生一次 GLM 压缩之后才出现（探针 `glm-compact-transcript` 核对过「生效」与导出条数） |
| 插件页 | 通过 | 「Hourness 编排层」共 15 个组件、15 个运行中；「会话原文 · glm-hourness/transcript · 运行中」，说明以「默认启用。」结尾 |
| 核对过程不触发压缩 | 通过 | 临时会话的日志只有会话头、权限、沙盒、审批四条与两对 `command/run`、`command/done`，没有模型请求；主检出没有 `.llm/transcripts/` 目录 |
| 控制台没有新错误 | 通过 | CDP 02:38:48–02:43:28 收到 1424 条（含 `Runtime.enable` 补发的启动期消息）：1423 条是 inspector 的 `ws://127.0.0.1:9230/ingest` 连接失败（记在合并的客户端包地址下，地址里列着所有包的 `client.js`），1 条是 `dsh-app://app/plugins/events` 的 `net::ERR_FAILED`（`FACTS.md` §3）；没有异常，没有别的错误或警告 |
| 宿主日志与崩溃记录 | 通过 | 见上一节 |
| `m5-index-truncation-alarm` 验收第 2 条的桌面一半 | 通过 | 面板「指标」页「记录范围」一组有「记忆索引截掉与查询落空」一行：「索引截掉 0 次，查询落空 0 次 / 索引截掉 0 次，查询落空 0 次」 |

`compact-recall` 节点没有验收清单；正文的各项（摘要末尾的 ZCode 原句、文件在项目 `.llm/transcripts/` 且不进 git、14 天清理、模型用 Read 分页读、不另造工具、不读别的会话）在本树的探针 `glm-compact-transcript` 七项（438/438 之中）与 2026-11-06 隔离实例 L4 的八项（`../l4.md`）里核对过；`compact-recall-redact` 的验收（导出里像凭证的片段换成 `[redacted]`、遮掉失败不写）由同一场景的假凭证一项核对。本步在人的桌面版上看的是行出厂启用之后加载正常、两包没有新错误。

截图（只拍全窗，经 `Page.bringToFront` 把窗口提到前面后拍）与原始记录在任务目录 `desktop/` 下，不入库：`shot-glm-status.png`、`shot-glm-status-typed.png`、`shot-metrics-coverage.png`、`glm-status.txt`（`/glm-status` 全文，含账号信息）、`plugins.json`、`metrics-page.json`、`console-summary.json`、`cdp-log.jsonl`、`actions.jsonl`、`desktop-out.txt`、`desktop-err.txt`。

## 观察（不挡路）

1. 同一张 `/glm-status` 里 `metrics` 行「部分生效」：「拒收 1 条；自查有发现：17 个进程没有正常退出；拒收 1 条」，「拒收 1 条」在说明里出现两次。与本改动无关，交指标那条线看是不是说明拼重了。
2. `data` 行「部分生效」（profile 没配 `projectHome`）与 `glm-prompt` 的旧键 `persona` 提示，都是已知的旧配置。
3. agent shell 的 `GIT_CONFIG_*` 会经子进程带进探针与桌面版；文档里还没有这条，可以记进 `DEVELOPMENT.md` §7 或让探针运行器启动运行时前删掉这三个变量，另起一件事做。

## 留下的

- 桌面版在运行（9333），停在临时会话上，右侧栏开着「项目图 › 指标」。侧栏 GLM-Hourness 下多一个「新会话」（`session-c2833df3-…`），只有两次 `/glm-status`。
- 分支 `transcript-enable` 与工作树 `.worktrees/transcript-enable` 保留，没有删。
