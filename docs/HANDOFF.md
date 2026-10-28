# 交接说明

版本：0.4（2026-10-28）
本文件记录环境、组件状态与已知问题，供接手者继续工作。进度与下一步只记在项目图 `docs/graph/` 上（`ORCHESTRATION.md` §2.13）：`npm run -s graph -- open` 列出进行中、可以开工与等人的事。设计以 `CHARTER.md`、`DESIGN.md`、`ORCHESTRATION.md` 为准，里程碑与验收以 `ROADMAP.md` 为准。

## 1. 项目概况

- 仓库：`C:\Users\29596\Desktop\Project\GLM-Hourness`；git，远端 Gitee 私有仓库 `NorthGod_BFDG/GLM-Hourness`，主分支 `main`。
- 目标：让 GLM 以 ZCode 训练分布住进 DeepSeek Harness（DSH），并在其上建一套编排层，把开发体系量化成由 harness 保证实施的标准（`CHARTER.md`）。
- 运行时：DSH Desktop `0.2.1-rc.3`，profile `desktop`；ZCode 基线 3.16.3。
- 安装形态：两个 bundle，均经 `plugin_manager install_bundle` 装入 profile：
  - `dsh-glm-hourness@0.2.0`：主包，9 行（2026-10-27 起工具检索并入 `glm-prompt`，原 `toolsearch` 行删除；2026-10-28 新增数据目录行 `data`）；
  - `dsh-glm-hourness-ui@0.1.0`：独立单入口 UI 包，1 行。

## 2. 仓库结构

```
src/           主包 TypeScript 源码
tests/         33 个 spec，453 用例（2026-10-28，`d4cd7e2` 之后）；tests/fake-rc3.ts 为 rc.3 运行时替身；tests/tsconfig.json 只给 ESLint 提供类型信息；tests/calibration/ 为标定测试集（两个任务，ORCHESTRATION.md §10.5）
ui/            独立 UI bundle（纯 JS，不参与 tsc）
scripts/       preflight-bundle.mjs、check-verbatim.mjs、check-lint.mjs（检查器门禁）、deps-check.mjs（依赖报告）、smoke-zcode*.mjs、sandbox.mjs（glmsandbox 启动与覆盖行，探针与标定共用）、probe/（L3 探针）、calibrate/（标定运行器与边界插件）、graph/（项目图命令行、出图与冒烟）；scripts/dev/ 为历史调试脚本，用户同意删除（项目图 m1-followups）
eslint.config.js、knip.jsonc、.jscpd.json  检查器配置；eslint-suppressions.json、knip-baseline.json、.jscpd-baseline.json 为告警基线（DEVELOPMENT.md §10）
docs/          宪章、设计、编排、路线、事实账、流程、交接；docs/graph/ 为本项目的项目图（进度的事实源）；docs/reference/ 为事实参考原文
AGENTS.md      仓库规则
cordis.patch.yml  主包 Loader patch
.llm/          不入库，项目目录：credentials.json 与 device-mid.txt（已搬到用户级目录，原件待删）、audit/（违规与决策；2026-10-28 之前的用量）、memory.json、docs/（原始资料快照与抓取脚本）、probe-runs/、calibration-runs/
~/.dsh/glm-hourness/  仓库外，用户级目录：audit/usage.jsonl、credentials.json、device-mid.txt（DESIGN.md §2.4）
reference/     不入库：审计用参考源码（zcode-api、deepseek-harness、ZCode、zcode-plugins）与桌面版运行时包导出 dsh-desktop-0.2.1-rc.3/，约 2.5 GB
dist/          不入库：tsc 产物（profile 通过 pnpm link 使用）
.agents/       不入库：编排任务状态与一次性脚本（夜间运行清单、借用审计报告 dsh-borrow-audit/report.md、缓存调查 cache-2026-10-28/、补图脚本 m2-graph/）
.worktrees/    不入库：并行线的 git 工作树（graph-engine 已合入，留下一个空目录待删）
```

## 3. 组件状态

| 行 | 状态 |
| --- | --- |
| `glm-llm` | 真网冒烟通过（coding-plan，模型返回 `pong`；2026-10-28 GLM-5.3-Flash 读图一次，答对颜色）；按 rc.3 消息形状编码（工具调用块、图片块）；2026-10-28 在 `glmsandbox` 的 headless 会话里跑完标定基线（两档模型各 6 次多轮工具会话，全部完成，`ORCHESTRATION.md` §10.5.2），桌面版真实会话中尚未被使用 |
| `glm-login` | 可用；`/glm-status` 输出凭证状态与调用会话的行健康表（2026-10-28，L3 探针验证），没有 `home` 时也保留 |
| `glm-prompt` | 在 rc.3 运行时上生效，含 ZCode 3.16.3 local 工具检索；七个别名的描述与 schema 均已按 3.16.3 重建；todo 提醒按助手轮次从会话历史计数（L3 探针 35/35，2026-10-28）；2026-10-28 起 GLM 会话进入高峰时段时收到一条提醒（`ORCHESTRATION.md` §11.4，L3 探针验证）；桌面版需重启才加载 |
| `glm-compact` | 改为在 `llm/stream` 上替换压缩指令（2026-10-27），L3 探针实测压缩生效 |
| `data` | 2026-10-28 新增，默认启用：提供数据目录服务（用户级 `~/.dsh/glm-hourness/`、项目 `.llm/`）；L3 探针验证，桌面版重启后生效 |
| `guard` | 拦截与纠偏可用，只管 GLM 调用；违规落盘（项目目录 `audit/violations.jsonl`）；2026-10-28 起 `file-tools-only` 引号感知，规则声明进 GLM 系统提示词，工作区变更兜底以影子模式记录（需要 `workspace-changes`，桌面版 profile 有），L4 实测拦截与记录生效；同日 L4 之后改为只拦 GLM、相对路径按会话工作目录解析，经 L3 探针验证，桌面版重启后生效；申报未接通 |
| `memory` | 工具与用量流水可用，用量改写用户级目录（2026-10-28）；记忆几乎未被使用 |
| `workflow` | 只记录派遣类调用（2026-10-28 起含 `subagent_fork`） |
| `hourness` | `/hourness` 可用；面板 2026-10-28 改为积分口径（`ORCHESTRATION.md` §11.2、§11.3），额度类数据未实现；桌面版重启后生效 |
| `glm-hourness/ui` | 功能可用，视觉未被接受 |

行健康（2026-10-28，`DESIGN.md` §2.5）：主包 9 行都在激活时与会话中上报生效、部分生效或未生效及原因，`/glm-status` 显示；桌面版重启后生效。

装机：10 行均 `fiberPhase: active`，无激活错误（2026-10-27 删除 `toolsearch` 行之前的记录；`data` 行尚未在桌面版上加载过）。2026-10-28 用户重启桌面版做了 L4 第一轮；之后的运行时改动由 Kiro 重启桌面版自验（L4 第二轮，项目图 `m1-11`）。

门禁（2026-10-28 夜间运行收尾时，提交 `d6977ad` 之上）：`npm run build`、`npm run preflight` 通过；`npm test` 25 个 spec、258 用例通过、0 失败，逐字门禁 397 段、已知偏差 0 条，检查器门禁对照基线 ESLint 316 条、knip 34 条、jscpd 7 处克隆（75 行）；`npm run probe` 69/69（运行 `2026-10-27T23-38-41-366Z`，含派发可行性验证的 12 项）。标定基线（`npm run calibrate`，提交 `4cb8799`）：两个起步任务、两档模型各 3 次，12/12 完成（`ORCHESTRATION.md` §10.5.2）。

项目图（M2）：引擎原型经用户批准（M2.1 选 A），`graph-engine` 于 2026-10-28 合入 main（`5463662`）；同日加上决策分级与转述（`d4cd7e2`，`ORCHESTRATION.md` §2.9.1）。新行 `glm-hourness/graph`（DSH 图工具、每步投影、图文件门禁）默认禁用，启用前的验收见 `ROADMAP.md` M2 2.11。门禁（`d4cd7e2`）：33 个 spec、453 用例，检查器基线 ESLint 315 条、knip 32 条、jscpd 7 处克隆，`npm run probe` 73/73。远端分支 `origin/graph-engine` 还在，随清理删除。

宿主接口：每个用到的 DSH 钩子、服务成员与载荷字段都已对照 rc.3 运行时包，证据见 `DESIGN.md` §2.4a 接口对照表；宿主结构类型集中在 `src/shared/dsh-min.ts` 与 `src/shared/lm-min.ts`。

派发可行性验证（2026-10-28，L3）：后台派发、子 agent 写入范围门禁、goal 驱动下的目标轮注入与完成门禁都在 rc.3 运行时上走通，只用探针覆盖层里的验证插件 `scripts/probe/probe-dispatch.mjs`，bundle 没有新行（`ORCHESTRATION.md` §2.1、§3.2，`DESIGN.md` §2.4a）。

## 4. 审计数据快照（2026-10-28）

- 用户级 `~/.dsh/glm-hourness/audit/usage.jsonl` 1080 条（2026-10-28 迁移所得，`DESIGN.md` §2.4）：`glm/glm-5.3` 796，`deepseek-account/deepseek-flash` 274，`glm/glm-5.3-flash` 10；最晚一条 2026-10-27T12:29:08.993Z。
- 迁移来源（均未改动）：仓库 `.llm/audit/usage.jsonl` 890 条；`~/.dsh/profiles/desktop/.llm/audit/usage.jsonl` 190 条，全部 `glm/glm-5.3`，时间 15:36–17:22（本地）。两者无重复。桌面版重启前，运行中的旧代码仍写仓库那份，重启后需补拷（项目图 `m1-cleanup`）。2026-10-28 07:40（UTC+8）复查：仓库那份仍是 890 条，没有晚于截止点的记录，用户级那份仍是 1080 条。
- 记忆：仓库 `.llm/memory.json` 1 条（从旧目录复制）。
- 走原生路由 `glm-zcode` 的请求：0 条。上述 GLM 请求全部经旧的 `glm` 路由。
- 违规流水：仓库 `.llm/audit/` 下还没有文件（已知拦截至少 3 次未落盘）；落盘代码随桌面版重启生效。

## 5. 已知问题

1. 路由判定已收口到 `src/shared/route.ts`，`glm-prompt`（含工具检索与 todo 提醒）已改用（`DESIGN.md` §3）。todo 提醒自 2026-10-28 起按 ZCode 的助手轮次口径计数（`DESIGN.md` §5.5）。
2. 版本基线已统一为 3.16.3；`X-Title` 按用户定案（2026-10-27）保持 `cli`，桌面版 ZCode 的真实流量是 `electron`（`DESIGN.md` §4.2）。
3. guard 闭环缺申报一段（记录、告知已于 2026-10-28 接通）。`=>`、`>>>`、`->` 误判已修（2026-10-28，引号感知，`ORCHESTRATION.md` §6.5.1）；读不到的 shell 写法（.NET 调用、`cmd /c`、PowerShell 别名如 `del`）只由工作区变更兜底记录，不拦截（§6.5.2）。L4 暴露的两处已修（2026-10-28）：拦截只对 GLM 调用生效，路由取会话请求头（§6.2）；相对路径按会话工作目录解析，`..` 折叠（§6.1）。
4. 数据目录分裂：已修（2026-10-28，`DESIGN.md` §2.4）。用户级数据在 `~/.dsh/glm-hourness/`，项目数据在工作区 `.llm/`；凭证与 deviceMid 已于 2026-10-28 搬到用户级目录，仓库里的原件待删（项目图 `m1-cleanup`）。
5. 签名握手对当前凭证失败，按设计无签发送；对 1.5 倍用量的影响未验证，签名状态不可见。2026-10-28 截包：握手每次 404，且每个请求前都重试一次（`DESIGN.md` §4.3，项目图 `m1-signing`）。
6. start-plan 档只有单测，未做真机授权验证。
7. 峰谷口径：已修（2026-10-28，`ORCHESTRATION.md` §11.2）。面板按积分计，高峰为工作日 14:00–18:00（UTC+8），其余时段按 50%；5 小时窗口、周额度、预估耗尽时间要等通道取数（`DESIGN.md` §4.7）。
8. 记忆存储判据过严，路径或文件名样式的文字一律被拒（`ORCHESTRATION.md` §8.1）。
9. 方言逐字文本：七个工具别名都已按 3.16.3 重建（2026-10-28），逐字门禁已知偏差为 0；Grep 与 Bash 是本地化组合，删改及与 ZCode 的剩余差异见 `DESIGN.md` §5.4。todo 提醒正文、compact 提示词、工具检索文本已按原文重建，deferred 声明段已删除（`DESIGN.md` §5.9）。工具检索在 ZCode 默认关闭，本项目按用户定案默认开启；与 ZCode 的剩余差异见 `DESIGN.md` §5.7。
10. UI 视觉未被接受。
11. cot-translation 与 Agent Team（DSH 官方实验包，非本项目组件）已按用户同意从桌面版 profile 的 bundle 列表移除（2026-10-28，备份 `package.json.bak-1793157445556`），重启后生效。
12. 凭证加密密钥可由本机信息推导（`DESIGN.md` §4.1）。
13. 修正前写入的用量流水，原生通道请求的输入 token 均为 0（解码器缺陷已修，`DESIGN.md` §4.6a）；面板按记录形态识别这类记录，不计入积分，只报条数（2026-10-28）。真实流水里目前没有这类记录。
14. 2026-10-27 之前，`glm-prompt` 与 `toolsearch` 依赖桌面版运行时不存在的 `tools.executable()`，在桌面版上从未生效（L3 探针确认）。两者均已在 rc.3 接口上重写。桌面版重启后，GLM 会话将第一次真正看到 ZCode 方言与工具检索。
15. 2026-10-27 之前 `glm-compact` 在桌面版上从未挂载（解析不到 `@deepseek-ai/dsh-compaction-basic`），原设计还会形成第二个压缩引擎。已改为 `llm/stream` 接缝（`DESIGN.md` §5.6）。
16. 2026-10-27 之前创建的合成 notice 没有 `id` 与 `role`；同一步里有两条这样的 notice 待处理时，DSH inbox 会抛「already pending」。已修（`createUserNotice`）。
17. 原生通道的图片：已修（2026-10-28，`DESIGN.md` §4.5a）。GLM-5.3-Flash 收到 Anthropic base64 图片块（用户消息与 `tool_result` 内）；GLM-5.3 改为只声明文本，DSH 在适配器之前把图片换成文字占位，`read_image` 拒读。L3 探针与一次真网请求验证。GLM 端点的请求级图片上限未知，本通道不发卸载信号（`DESIGN.md` §9）。
18. 2026-10-28 之前原生通道的编码器按 `toolCalls` 字段读助手的工具调用，rc.3 用 `tool-call` 内容块，工具调用会被全部丢弃，任何多轮工具会话都会被上游拒绝。已修（`DESIGN.md` §4.5）；2026-10-28 的标定试跑与基线在 `glmsandbox` headless 里经原生通道跑通 14 次多轮工具会话（`ORCHESTRATION.md` §10.5），桌面版真实会话的验证随 L4。

19. 行健康只保存在主机进程内存里，桌面版重启后清空，历史状态查不到；设置页把 `/glm-status` 的整段文本（含 Markdown 表）原样显示，表格的界面呈现随 M8（`DESIGN.md` §2.5）。
20. 依赖安装：`pnpm add`、`pnpm update` 要带 `--store-dir .pnpm-store`（`node_modules` 链接自仓库内的 store）；`pnpm install --frozen-lockfile` 失败，根 `package.json` 的 `peerDependencies` 不在锁文件里，M1.9 之前即如此（`DEVELOPMENT.md` §11）。检查器基线里的存量告警（多为测试里多余的类型断言与无 `await` 的 async 回调）尚未清理，`graph-engine` 合并后再修（`ORCHESTRATION.md` §7.7）。
21. 权限预设 `workspace-write` 下，pwsh 经 Windows ACL 沙盒运行，`node --test` 派生测试子进程报 `spawn EPERM`，模型确认不了测试结果，会转而申请沙盒升级（`FACTS.md` §3）。用户桌面版的默认预设是 `danger-full-access`，目前不受影响；标定运行器按桌面版预设传 `DSH_PERMISSION_MODE`。
22. 标定起步的两个任务对两档模型都没有区分度（基线 12/12 完成），只能比积分、耗时与返工；更难的任务随 M3、M7 扩充（`ORCHESTRATION.md` §10.5.2）。
23. 派发可行性验证的发现，M7 实现时处理（`ORCHESTRATION.md` §2.1、§3.2）：子 agent 的会话头 `cwd` 是父 agent 的目录，guard 对子 agent 的包含根因而是父工作区，DSH 的文件沙盒根也是父工作区，独立工作树要建在父工作区之内；服务只按调用方传入的 `maxDepth` 限深，本包的派发工具要传；GLM 路由上 `structured_output`、`send_message`、`update_goal` 是延迟工具，要经 DeferredToolCall 调用；headless 运行器在第一次静止空闲时退出，不跑目标轮，用 goal 驱动的标定任务要另想办法撑住进程。
24. 原生通道的提示词缓存：2026-10-28 修复主因（`DESIGN.md` §4.5b）。网关按 `x-session-id` 做缓存亲和，通道此前每请求随机生成；现在按 DSH 会话固定。GLM-5.3-Flash 在会话第二步仍常只命中共用前缀，原因未明。同批补上保留式思考（历史 reasoning 带签名回传，§4.5c，命中率不变、每步未命中输入变多）与四处 ZCode 请求细节。桌面版重启后生效。

反向代理已从项目范围移除（`DESIGN.md` §1）；profile 中指向 8317 的 pi-ai `glm` 路由属于用户配置，用户 2026-10-28 把清理交给 agent，L4 第二轮通过后删除（项目图 `m1-cleanup`，改前备份）。

## 6. 环境事实

- 凭证：`~/.dsh/glm-hourness/credentials.json` 与 `device-mid.txt`（AES-256-GCM；`GLM_HOURNESS_CREDENTIAL_SECRET` 可覆盖密钥）。`glm-llm`、`glm-login` 不配 `home` 时默认读这里（`DESIGN.md` §2.4）。仓库 `.llm/` 里的原件保留到桌面版重启验证之后再删（项目图 `m1-cleanup`）。
- 数据目录：用户级 `~/.dsh/glm-hourness/`（`$DSH_HOME` 可改根目录），项目 `.llm/`；由 `data` 行的服务提供（`DESIGN.md` §2.4）。
- 模型：`glm-zcode` 路由提供 GLM-5.3、GLM-5.3-Flash。
- 沙盒：profile `glmsandbox`，命令见 `DEVELOPMENT.md` §3；探针（`npm run probe`，离线）与标定（`npm run calibrate`，真实请求、消耗积分）共用，不要同时运行。沙盒模板的权限模式由 `DSH_PERMISSION_MODE` 决定（缺省 `workspace-write`），桌面版 profile 的默认预设是 `danger-full-access`。
- profile 目录中仍留有备份 `cordis.patch.yml.bak-1793101338423`（2026-10-27 启动崩溃后的恢复来源）。
- 桌面版输入框的模型菜单换模型时，DSH 会把选中的模型写进 profile 的 `agent-default-model`，作为新会话的默认模型（2026-10-28 L4 实测）。用桌面版做验证时换过模型，结束后经同一菜单换回，并核对这一项。2026-10-28 `m2-8` 的 L4 验证把它从 `deepseek-account` / `deepseek-flash` / `high` 改成了 `glm-zcode` / `glm-5.3-flash` / `high`，验证后已换回，profile 其余内容未动。
- Windows PowerShell 5.1 的 `Get-Content`、`Set-Content` 不带 `-Encoding` 时按系统 ANSI 代码页读写，UTF-8 文件往返一次，非 ASCII 字符就坏了（2026-10-28 损坏过 `src/shared/dsh-min.ts` 的 en dash，已修复）。改文件用编辑工具或 Node 脚本；经 CDP 往页面送含中文的表达式或文本，用 `.agents/tasks/m2-panel/cdp.mjs` 的 `evalfile`、`typefile`。
- 旧工作名文件夹 `Desktop\Project\dsh-glm-dialect` 的文档已迁入本仓库，可由用户删除。

## 7. 下一步

只看项目图（`npm run -s graph -- open`，或桌面版右侧栏的「项目图」）：进行中、可以开工与等人的事都在上面，节点批注里有接着做的要点。
