### 借用组件核实清单（L3 / L4）

2026-10-28 对照 rc.3 运行时包的只读核查（结论见 `ORCHESTRATION.md` §2.1、§3、§4.5、§5、§13、§14 与 `FACTS.md` §3）留下的真机核实项，按依赖顺序排列。L3 在 `glmsandbox` 上用探针做（`DEVELOPMENT.md` §3），L4 要在桌面版真实会话里看界面。同日的定案（不用队友角色与角色 preset，不用 Agent Team）让其中几项不再需要，保留编号备查。4、4b、12 三项由派发可行性验证一并做完（2026-10-28，L3）：探针 provider 按会话分别为主 Agent、子 agent 与第二个根 agent 脚本化应答，探针覆盖层里的验证插件 `scripts/probe/probe-dispatch.mjs` 做派发、写入范围门禁、goal 创建、目标轮注入与完成门禁，三个新场景 `glm-dispatch`、`glm-goal`、`goal-headless` 共 12 项检查全部通过。结论与证据写在 `DESIGN.md` §2.4a（派发与驱动循环表）、`ORCHESTRATION.md` §2.1、§3.2 与 `FACTS.md` §3；其中会影响 M7 实现的发现：子 agent 的会话头 `cwd` 是父目录（独立工作树要建在父工作区之内，写入范围按任务映射判定）；GLM 路由上 `structured_output`、`send_message`、`update_goal` 是延迟工具；headless 运行器不跑目标轮。

| # | 核实项 | 层 | 依赖它的条目 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 启用 `agent-team-profile` 后根会话的工具面：是否同时有 `subagent`、`subagent_fork` 与 Team 九个工具，`send_message` 是否为 Team 版本 | L3 | 无（不用 Agent Team） | 不再需要 |
| 2 | 宿主层插件调用 `ctx.agentPresets.serviceFor(agent, 'planMode')` 能否拿到控制器，`set(agent, true)` 是否生效 | L3 | M3.3、M3.6 | 待核实 |
| 3 | bundle 插入的 preset：子行以包名子路径引用本包模块能否解析和激活，persona 与 `tool-fs` 的 `write: false` 是否生效，能否在设置与新会话中选到 | L3 / L4 | 无（不用角色 preset） | 不再需要 |
| 4 | 本包的宿主插件经 `subagents.startActivation` 启动后台子 agent，带 prompt、cwd、agentOptions、outputSchema；父 agent 的步继续；完成通知带结构化结果回到父 agent。原项「preset 内的 `tool-subagent` 派出角色 preset 子 agent」按定案改为这一项 | L3 | M7 后台派发 | L3 已核实（2026-10-28，探针 `glm-dispatch`）；桌面版组合随 L4 |
| 4b | `tools/pre-execute` 看到子 agent 的工具调用，`exec.agent` 能映射回派发它的任务；范围外的写入被拒，拒绝以工具错误回到子 agent | L3 | M7 写入范围门禁 | L3 已核实（2026-10-28，探针 `glm-dispatch`） |
| 5 | 第三方右侧栏标签页：`sidebarRightTabs.register`（带 `extension`）、正文槽与 guide 入口是否出现；`dsh.client.inject` 列出 sidebar-right 后加载顺序是否正确 | L4 | M8 | 待核实 |
| 6 | 第三方客户端调用 `ctx.sidebarRight.openTab('browser', { params: { url: 'http://127.0.0.1:<端口>/' } })`，webview 能否打开本机查看器并正常交互（含实时推送） | L4 | M8 查看器第一步 | 待核实 |
| 7 | 自己标签页里的 `<iframe>` 指向回环地址在 Desktop 是否被拦 | L4 | M8 | 待核实 |
| 8 | 第三方客户端 inject `remote.workspaceFiles` 后 `read`、`list`、`changes` 是否可用 | L4 | M8 原生标签页 | 待核实 |
| 9 | 第三方宿主插件注册的会话投影能否经 `faceOf(key)` 到达客户端 | L3（宿主侧注册）/ L4 | M8 | 待核实 |
| 10 | 第三方以 `pwsh`、`write` 为键注册 `tool.call.toolview` 的行为（覆盖、优先级、报错） | L4 | M8 guard 卡片 | 待核实 |
| 11 | 匹配 `tool/result` 的第三方聊天节点定义能否渲染在工具行之后 | L4 | M8 guard 卡片 | 待核实 |
| 12 | 在 `agent/pre-step` 给目标轮追加的 notice 是否破坏 `goal-round-driver` 的预约校验；`update_goal` 的 `complete` 能否在 `tools/pre-execute` 拦下 | L3 | M2.3 目标轮投影、M7 完成门禁 | L3 已核实（2026-10-28，探针 `glm-goal`）：不破坏，能拦下；桌面版组合随 L4 |
| 13 | guard 在 `tools/pre-execute` 里调用 `userQuestions.ask` 与 `approval.request` 时卡片是否出现、取消时信号是否正确；`conversation.approval.detail` 子槽能否由第三方占用 | L4 | M3.5 | 待核实 |
| 14 | `tool-ask-user` 改为 `mode: timed` 后，pending 与晚到答复的完整路径 | L4 | M3.4、M3.5（若用 timed 卡） | 待核实 |
| 15 | 用命令通道做 UI 写回时会话日志的增长量，以及确认命令运行不进模型请求 | L3（不进模型）/ L4（UI 写回） | M3.5 异步卡回写、M8 | 待核实 |
| 16 | 主 Agent 身份文本与 `glm-prompt` 方言改写的叠加结果。原项「`glm-prompt` 与 preset persona 的叠加」按定案改为这一项 | L3 | M3.1 | 待核实 |
| 17 | schedule 投递到冷会话时，恢复出的 agent 的工具面与本包各行是否齐全 | L4 | M7 巡检、M6 排期 | 待核实 |

