# m2-9 集成报告（项目图节点运行控制）

逐步记录见同目录 `integration-log.md`。本报告中的截图均位于 `C:\Users\29596\Desktop\Project\GLM-Hourness\.agents\tasks\m2-9-research\l4\`，下文写作 `l4\<文件名>` 时均指该目录下的绝对路径。

## 1. main 上的最终提交

核对方式：`git -C C:\Users\29596\Desktop\Project\GLM-Hourness log --oneline` 与 `git log origin/main`。`main` = `origin/main` = `25c9a1ad6d10fed8314d7e1e6a48af3e09517ab9`，工作区干净。

m2-9 带入 main 的提交（`git merge --ff-only m2-9`，`6af6c51..a12d319` 快进，21 个文件 +987/-132）：

| 提交 | 标题 | 规模 |
|---|---|---|
| `3d9a195c98f3210d863c757087a3748034e65224` | feat(graph): run controls on task nodes, /graph-run start\|stop\|redo (m2-9) | 19 个文件，+980/-128 |
| `a12d31978454e00d49dd1fc93000f609c1fd21c2` | chore(probe): sandbox profile override for probes run from a git worktree | 3 个文件，+7/-4 |

L4 测试节点提交：

| 提交 | 标题 | 内容 |
|---|---|---|
| `25c9a1ad6d10fed8314d7e1e6a48af3e09517ab9` | chore(graph): record the m2-9 L4 desktop run on test node m2-9-l4 | `docs/graph/nodes/m2-9-l4.json`、`docs/graph/graph.svg`（2 个文件，+293/-169） |

基线顺序：`e3305a6` → m1-signing 的 `b6367d3`、`6af6c51` → m2-9 的 `3d9a195`、`a12d319` → `25c9a1a`。推送两次：`6af6c51..a12d319`、`a12d319..25c9a1a`，均无强推。worktree `.worktrees/m2-9` 与分支 `m2-9` 保留，停在 `a12d319`。

## 2. 门禁结果

共跑过四轮门禁，全部通过：

| 轮次 | 位置 / HEAD | build | preflight | npm test |
|---|---|---|---|---|
| 第一次 rebase（onto `e3305a6`） | worktree `20cdf6f` | 0 | 0 | 0 |
| 第二次 rebase（onto `6af6c51`，含 m1-signing） | worktree `3d9a195` | 0 | 0 | 0 |
| 探针修复后 | worktree `a12d319` | 0 | 0 | 0 |
| L4 前 / L4 节点提交前 | main `a12d319` / main 工作区 | 0（`l4-build.txt`） | 未单独跑 | 0（`l4-test.txt`，graph:smoke ok） |

后三轮 `npm test` 的细项（第一轮除提交数为 94 外相同）：

- check-verbatim：对已安装 ZCode bundle 397 条逐字、0 条已知偏差。
- ESLint 303 条压制、knip 22 条在基线内、jscpd 3 处克隆 / 26 行重复，与 303/22/3 基线完全相等。
- check-secrets：gitleaks 8.30.1，HEAD 上 96 个提交加暂存与未暂存改动，无泄漏。
- 37 个 spec 文件，490 个测试全过，0 失败；`tests/graph-run.spec.ts` 7/7。
- graph:smoke ok。
- preflight：13 个导出、1 个 patch，ui bundle 客户端半边已构建。

两轮 rebase 都没有冲突，也没有新增修复提交。`package.json` 的 test 脚本相对 main 只多了插在 `tests/graph-row.spec.ts` 之后的 `tests/graph-run.spec.ts`，`check-secrets.mjs` 仍紧跟 `check-lint.mjs`。

环境问题（非代码缺陷）：

- worktree 没有 `reference/`（被 gitignore），`tests/glm-startplan.spec.ts` 用例 2 报 ENOENT。处理方式是从主检出把 `reference/zcode-api/src/proxy/zcode_system.json` 这一个文件复制进 worktree（被 git 忽略，未暂存）。
- 第一轮有一次 check-verbatim 失败（SECURITY_NOTICE_OFFICIAL 与 start-plan stable section 1 的安全提示行未匹配），随后三次单独重跑和下一次完整 `npm test` 均通过，第二轮起未再出现。worktree 只能以用户打过补丁的已安装 bundle 为参照，推测是读到了该文件的另一状态，未深查。

## 3. L3 探针

- 第一次（`probe-1.txt`，run `.llm/probe-runs/2026-10-28T12-01-49-842Z`）：exit 1，89/94。原有 89 项全过，新增的 5 项 `glm-graph-run` 全部失败，报 `probe: /graph-run is not registered`，`/glm-status` 中 graph-panel 为 `missing`。
- 原因（环境）：profile `glmsandbox` 把 `dsh-glm-hourness`、`dsh-glm-hourness-ui` 链接到主检出，从 worktree 启动的探针加载的是 main 的 `dist`，而当时 main（`6af6c51`）里没有 graph-run。桌面 profile 也链接主检出，不能用 m2-9 重建 main 的 dist。
- 修复：提交 `a12d319`，`scripts/sandbox.mjs` 读取 `DSH_SANDBOX_PROFILE`（默认 `glmsandbox`），`run-probe.mjs` 头注释与 `docs/DEVELOPMENT.md` §3 写明临时 profile 流程。未改产品代码，未发现产品缺陷，因此没有新增 L2 测试。
- 临时 profile `glmsandbox-m29` 指向 worktree，跑完即删除（先 `rmdir` 掉 junction，worktree 完好，`glmsandbox` 的 junction 仍指向主检出）。`glmsandbox`、`desktop`、`headless` 未改动。
- 第二次（`probe-2.txt`，run `.llm/probe-runs/2026-10-28T12-10-44-466Z`，`DSH_SANDBOX_PROFILE=glmsandbox-m29`）：exit 0，94/94。`glm-graph-run` 五项：
  - PASS 回合中途开始：结果 `已让主 Agent 从「探针任务」开始做（它正忙，这一轮做完就接着做）`；task-1 的人批注有 `人在面板里点了「从这里开始做」`、`人在面板里点了「暂停」：停下了主 Agent`。
  - PASS 开始通知开启第 2 轮：第 2 个请求以 `glm-graph-run` 用户通知开头，含 `graph_focus {"id":"task-1"}`；第 1 个请求没有。
  - PASS graph_focus 之后的现场：`graphLive.focus` 为 `task-1`，`turnSince` 已设置，最近一次 `graph_focus` ok。
  - PASS 暂停取消回合：`已暂停「探针任务」：停下了主 Agent`，历史条目存在，会话内 3 个请求（脚本化 Bash 未执行，被取消回合使 headless exit 1）。
  - PASS /glm-status：graph-panel `生效 (命令 /graph-apply、/graph-run 已注册；现场投影 graphLive 已注册；能停子 agent)`，stderr 无 graph-panel 条目。
- `npm run calibrate` 未运行。

## 4. L4 桌面验证

准备：桌面 profile `desktop` 通过 junction 链接主检出，重启前在 main `a12d319` 上 `npm run build`（exit 0）。这是桌面版第一次加载合并后的 m1-signing 修复。测试节点 `m2-9-l4`「m2-9 L4 验证任务」，挂在 `m2-9` 下，由图 CLI 以 `llm` 身份提议并批准，再置为 doing。节点正文要求只读：不改文件，除 graph_focus 外不写图，先 graph_focus 再跑 Bash `Start-Sleep -Seconds 60`，回复一句话。会话：新建，模型 GLM-5.3-Flash（GLM (ZCode native)），`session-920b46b6-b7d5-461a-8058-31df26fe3fae`（`l4\05-reply.png`）。

### (a) 从这里开始做：通过

- 点击前详情：「现在没有 agent 在这里干活」+ 按钮「从这里开始做」（`l4\07-detail.png`）。
- 对话：命令行 `graph-run · 已让主 Agent 从「m2-9 L4 验证任务」开始做`，卡片「收到执行请求 20:26」（`l4\08-start-clicked.png`）。
- 事件：`command/run` `graph-run start m2-9-l4`（seq 24），通知拼入并 `turn/start` 第 2 轮（seq 25-26），`command/done` success（seq 28），用户消息 `[项目图] 人在面板上点了「从这里开始做」：任务 m2-9-l4…`（seq 30）。
- GLM：`graph_focus {"id":"m2-9-l4"}` ok（seq 32-33），然后 Bash `Start-Sleep -Seconds 60`（seq 38）（`l4\09-running.png`）。
- 现场：`主 Agent glm-5.3-flash 55k tokens 在跑 Bash · 33 秒 在「m2-9 L4 验证任务」`（`l4\10-live.png`）；图上「主 Agent」徽标在 m2-9-l4 节点上（`l4\13-graph.png`）；详情变为「在这里干活：主 Agent」+ 按钮「暂停」。
- 节点历史：`你 · 批注：人在面板里点了「从这里开始做」`。

### (b) 睡眠途中暂停：通过

- 点击时间 12:27:07.868Z。事件：`command/run` `graph-run stop m2-9-l4`（seq 40），暂停通知拼入（seq 41），`command/done` `已暂停「m2-9 L4 验证任务」：停下了主 Agent`（seq 42），Bash 结果 aborted，`turn/end` `{"kind":"aborted","reason":{"kind":"user"}}`（seq 46）。
- 对话：回合下显示「已停止」，工具行 `Error: tool call aborted`，命令行 `graph-run · 已暂停「m2-9 L4 验证任务」：停下了主…`（`l4\11-paused.png`、`l4\16-stop-line.png`）；trace 中 Bash 为 ABORTED（`l4\14-trace.png`）。
- 现场：`空闲，等你说话 在「m2-9 L4 验证任务」`（`l4\12-live-idle.png`）；详情回到「现在没有 agent 在这里干活」+「从这里开始做」。
- 节点历史：`你 · 批注：人在面板里点了「暂停」：停下了主 Agent`。
- 暂停通知（`不要接着做这个节点，也不要重新派发它`）在下一轮开头被读到（seq 53），GLM 回复节点保持暂停，没有接着做。

### (c) 改了验收条件后重做：通过

- 改验收条件：驱动时在输入框键入 `/graph-apply {"op":"edit",…}`，没有选中命令菜单，被当作普通消息发给模型（驱动问题，非产品缺陷）。GLM 带 `relay` 调用 `graph_edit` 完成修改，验收条件新增第二项「暂停后点重做，主 Agent 能在本节点上重新开工」。历史：`你（经对话）· 编辑：L4：改验收条件，用来验证「改了验收条件后重做」`。
- 点击前详情：「现在没有 agent 在这里干活 验收条件在上次开始之后改过」+ 按钮「从这里开始做」「改了验收条件后重做」（`l4\18-before-redo.png`）。
- 点击时间 12:43:43.370Z。事件：`command/run` `graph-run redo m2-9-l4`（seq 71），重做通知含验收条件改前改后对比与 `先调用 graph_focus {"id":"m2-9-l4"}`（seq 72），`turn/start` 第 4 轮，`command/done` `已让主 Agent 按新的验收条件重做「m2-9 L4 验证任务」`（seq 75）。
- GLM：`graph_focus` ok，`graph_show`，Bash `Start-Sleep -Seconds 60` 退出码 0，`graph_status` 置为 done 并附证据，回复一句话。运行中现场：`在想 · 第 1 步 · 16 秒 在「m2-9 L4 验证任务」`，详情显示「暂停」（`l4\19-redo.png`）。
- 节点历史：`你 · 批注：人在面板里点了「改了验收条件后重做」`。

### (d) 子 agent 上暂停：通过

- 在对话里让主 Agent 派一个子 agent：graph_focus m2-9-l4 后睡眠 120 秒。GLM 调用 `subagent`（label `L4 验证：焦点+睡眠120秒`，child `f46b8af7-54e8-40e4-ad94-a03e0ab46f18`，后台），随后结束本轮。现场：子 agent `glm-5.3-flash 39k tokens 在跑 Bash · 49 秒 在「m2-9 L4 验证任务」`（`l4\20-child-running.png`）；主 Agent 空闲时详情仍显示「暂停」。
- 点击时间 12:49:26.614Z。事件：`command/run` `graph-run stop m2-9-l4`（seq 119）；给主 Agent 的通知 `[项目图] 人在面板上暂停了任务 m2-9-l4 … 停下了子 agent L4 验证：焦点+睡眠120秒。不要接着做这个节点，也不要重新派发它…`，`graphRun.stopped` 为 `["f46b8af7-…"]`（seq 120）；`command/done` `已暂停「m2-9 L4 验证任务」：停下了子 agent L4 验证：焦点+睡眠120秒`（seq 121）；DSH 结算 `Background subagent f46b8af7-… was stopped before it finished.`（seq 122）；第 6 轮在同一步里读到两者（seq 127-128）。
- GLM（第 6 轮，无工具调用）：「收到，子 agent 已被主人的暂停停下（未跑完、无收尾消息），喵桃不重派、不接续，原地待命…」，没有重新派发。
- 现场：`✓ L4 验证：焦点+睡眠120秒 … 已停下 在「m2-9 L4 验证任务」`（`l4\21-child-paused.png`）。
- 节点历史：`你 · 批注：人在面板里点了「暂停」：停下了子 agent L4 验证：焦点+睡眠120秒`。

### 收尾

节点 `m2-9-l4` 已由 GLM 在重做那一轮置为 done（rev `7c6f47efe682`），之后用 CLI `comment` 写入 L4 结果，`npm run -s graph:render` 0，`npm test` 0，提交 `25c9a1a` 并推送。

## 5. 桌面日志与 /glm-status

- `dsh-out.txt` 12 行（更新检查、inspector 与 web URL、DeepSeek 模型列表），`dsh-err.txt` 3 行（DevTools 监听、一行 Chromium `CompositorAnimationObserver`）。两者都没有 dsh-glm-hourness 的条目。第二实例启动产生的 Chromium 缓存错误另存于 `l4\second-err.txt`。
- CDP 日志 10 分钟共 221 条（`l4\cdp-logs-1.txt`）：218 条 `WebSocket connection to 'ws://127.0.0.1:9230/ingest' failed`（inspector 插件），3 条 `Failed to load resource: net::ERR_FAILED dsh-app://app/plugins/events`。没有异常，没有提到 dsh-glm-hourness 或 glmg- 的条目。
- /glm-status（从命令菜单选取，`command/done` seq 133）：
  - glm-llm 生效（上游已应答，coding-plan）。
  - glm-login、glm-prompt、data、guard、memory、workflow 生效；graph 生效（82 个节点；焦点 m2-9-l4）。
  - glm-compact、hourness 已加载，本会话未触发。
  - graph-panel 生效（命令 /graph-apply、/graph-run 已注册；现场投影 graphLive 已注册；能停子 agent）。

## 6. GLM 通道（已加载 m1-signing 修复）

- 6 轮共 13 条助手消息，另有 2 次标题请求，全部有应答，没有上游错误。
- `~/.dsh/glm-hourness/audit/usage.jsonl` 中本会话：第 2 轮第二个请求 `cacheReadTokens` 18048，此后主会话每一步 18k–25k；第 2 轮后状态栏显示「缓存命中 66%」。
- 签名握手是否成功本次无法观察：glm-llm 行没有接上 adapter 的 `onEvent` 通知出口，fail-open 的签名/路由通知在桌面版上不显示；本次也没有抓包。
- 执行准确度：一次 `graph_edit` 缺 `rev`（`invalid: rev is required`），重试成功（rev `ecc7d89b561b`）；那次重试的 relay 前面加了 GLM 自己的话（「人在面板上暂停了任务 m2-9-l4 上的工作，并给出 …」），不是逐字转述。

## 7. 留给 L3 / L2 的部分及原因

- 「忙时重做」（先取消当前回合再发 followup）：(c) 点击时 agent 空闲，没有可取消的回合，桌面版上未走到这条路径，仅由 L2（`tests/graph-run.spec.ts`）覆盖。
- 「回合中途开始」（agent 正忙时点开始，排到本轮结束后接着做）：桌面版 (a) 点击时 agent 空闲，该路径由 L3 探针第一项覆盖（`已让主 Agent 从「探针任务」开始做（它正忙，这一轮做完就接着做）`）。
- 「开始通知只出现在新一轮的第一个请求」：桌面版无法逐请求查看，由 L3 探针第二项按请求核对。
- 签名握手结果：L4 不可见，L3 探针也未针对它设检查项，见第 8 节。

## 8. 未决风险

- 签名握手无可观测出口：签名失败会 fail-open 继续请求，而通知没有接出，桌面版上失败不会被发现。需要接上 glm-llm 行的 `onEvent` 通知或做一次抓包确认，建议单开任务。
- 节点正文里的只读要求压不过运行控制通知：重做通知要求「标完成要带证据」，GLM 照做并写了 `graph_status`，违背了节点正文的「不要写图」。目前按预期行为记录；若希望节点级约束优先，需要调整重做通知的措辞。
- GLM 工具调用准确度：`graph_edit` 漏 `rev`、relay 非逐字。前者由工具校验兜住，后者会让节点历史里的「经对话」转述混入模型自己的话，影响可审计性。
- 桌面版重启后窗口隐藏：`document.visibilityState` 为 hidden、无 `MainWindowHandle`，`Page.captureScreenshot` 挂起；部分 CDP 点击后窗口会再次隐藏。L4 用再次启动 exe（单实例交接）的方式规避，影响自动化截图，不影响产品功能。
- check-verbatim 在 worktree 中出现过一次未复现的失败，原因推测为已安装 bundle 的读取状态，未深查。
- 环境：从 worktree 跑探针必须使用临时 profile（`DSH_SANDBOX_PROFILE`），否则加载的是主检出的 `dist`，会得到与代码无关的失败。

## 9. profile 默认模型已恢复

重新核对 `C:\Users\29596\.dsh\profiles\desktop\cordis.patch.yml` 中 `agent-default-model` 一条（只读该条目）：

- provider: `deepseek-account`
- model: `deepseek-flash`
- reasoningEffort: `high`

桌面版新会话的模型菜单中已选回「DeepSeek 账号」下的 DeepSeek-V4.1-Flash（`l4\24-model-restored.png`）。
