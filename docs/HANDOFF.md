# 交接说明

版本：0.6（2026-10-29）
本文件记录环境、组件状态与已知问题，供接手者继续工作。进度与下一步只记在项目图 `docs/graph/` 上（`ORCHESTRATION.md` §2.13）：`npm run -s graph -- open` 列出进行中、可以开工与等人的事。设计以 `CHARTER.md`、`DESIGN.md`、`ORCHESTRATION.md` 为准，里程碑与验收以 `ROADMAP.md` 为准。

本版的状态截至代码 `a9f12e1`（m1-parity 合入点）、2026-10-29 的批次 L4（项目图 `m1-11`，记录在不入库的 `.agents/tasks/m1-l4/l4.md`）与同日 L4 之后的清理（项目图 `m1-cleanup`，记录在 `.agents/tasks/m1-l4/cleanup.md`）。

## 1. 项目概况

- 仓库：`C:\Users\29596\Desktop\Project\GLM-Hourness`；git，远端 Gitee 私有仓库 `NorthGod_BFDG/GLM-Hourness`，主分支 `main`。
- 目标：让 GLM 以 ZCode 训练分布住进 DeepSeek Harness（DSH），并在其上建一套编排层，把开发体系量化成由 harness 保证实施的标准（`CHARTER.md`）。
- 运行时：DSH Desktop `0.2.1-rc.3`，profile `desktop`；ZCode 基线 3.17.1（2026-10-30 起，此前为 3.16.3；跟进见项目图 `zcode-3171-follow`）。
- 安装形态（split 第 5、6 步起，`DESIGN.md` §2.3）：仓库产出两个 bundle，各带自己的客户端面，profile 里是指向检出的链接，加载 `packages/*/dist` 与 `packages/*/ui/client.js`。行名都经包命名（宿主行 `<包名>/<行>`，客户端行是精确包名），设置页「内置插件」给每行显示 `locale/` 里的标题（m8-row-titles，桌面版截图核对随批次 L4）：
  - `dsh-glm-zcode@0.3.0`（`packages/glm`）：GLM 通道包，4 个宿主行（`glm-llm`、`glm-login`、`glm-prompt`、`glm-compact`）加客户端行 `glm-ui`（包自己的客户端面，GLM 按钮与设置页，默认启用：split 合入后的桌面版验收第一轮通过后启用，2026-10-29）；
  - `dsh-hourness@0.3.0`（`packages/hourness`）：编排层包，9 个宿主行（`data`、`guard`、`memory`、`workflow`、`hourness`、`graph`、`graph-panel`、`rules`、`design`）加客户端行 `ui`（包自己的客户端面，项目图面板）。
  - 根 `package.json`（`dsh-glm-hourness`）只是开发工作区，不再是 bundle。
  - profile 切换（split 合入时段，2026-10-29）：`glmsandbox` 20:43:14、桌面版 20:43:33（UTC+8）各自只改了 `package.json` 的 `dsh.profile.bundles` 与 `dependencies`。桌面版的 bundles 第 3 项 `dsh-glm-hourness` 原位换成 `dsh-glm-zcode`、`dsh-hourness`，删去末项 `dsh-glm-hourness-ui`，共 13 项：`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`dsh-glm-zcode`、`dsh-hourness` 与 9 个 experimental bundle（次序不变）；`glmsandbox` 的 bundles 为 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-headless`、`dsh-glm-zcode`、`dsh-hourness`。两边的 dependencies 都只有 `dsh-glm-zcode`、`dsh-hourness`，`link:` 指向主检出的 `packages/glm`、`packages/hourness`；`cordis.patch.yml` 没有改，本项目五条覆盖项按行 id 匹配。备份留在各自的 profile 目录：`desktop/package.json.bak-1793277813423`、`desktop/pnpm-lock.yaml.bak-1793277813423`、`glmsandbox/package.json.bak-1793277794809`、`glmsandbox/pnpm-lock.yaml.bak-1793277794809`，`split` 关闭之前不删，之后删不删由人定。
- 拉取改变包布局的提交之后（split 起每次都按这一条做）：先关桌面版，再 `npm run build`，再启动。运行中的桌面版在下一次 profile 写入时就按磁盘上的布局重组（`DEVELOPMENT.md` §1.1）。

## 2. 仓库结构

```
src/           两个包的 TypeScript 源码（源码不搬家；哪个目录属于哪个包见 scripts/packages.mjs，src/shared/ 是公共库）
packages/      两个宿主包：glm/（dsh-glm-zcode）与 hourness/（dsh-hourness），各有 package.json、cordis.patch.yml、tsconfig.json、locale/、icon.svg；构建产物 dist/ 不入库
tests/         39 个 spec，556 用例（2026-10-29，`a9f12e1`）；tests/fake-rc3.ts 为 rc.3 运行时替身；tests/tsconfig.json 只给 ESLint 提供类型信息；tests/calibration/ 为标定测试集（两个任务，ORCHESTRATION.md §10.5）
ui/            客户端源码 ui/src 与它的 tsconfig.json，不是包；两个包的客户端面在 packages/*/ui/（宿主半 index.js、构建出的 client.js 不入库），哪个源码文件属于哪个包见 scripts/packages.mjs
scripts/       packages.mjs（目录表：两个包的名字、目录、源码目录与行，DEVELOPMENT.md §10）、clean-dist.mjs（构建前删各包的 dist/）、preflight-bundle.mjs、check-verbatim.mjs、check-lint.mjs（检查器门禁）、check-secrets.mjs（密钥扫描）、deps-check.mjs（依赖报告）、smoke-zcode*.mjs、sandbox.mjs（启动参数、探针生成的 profile 与覆盖行，探针与标定共用）、profile-shape.mjs（profile 结构的只读快照与比对）、probe/（L3 探针）、calibrate/（标定运行器与边界插件）、graph/（项目图命令行、出图与冒烟）
eslint.config.js、knip.js（入口按目录表生成）、tsconfig.knip.json、.jscpd.json  检查器配置；eslint-suppressions.json、knip-baseline.json、.jscpd-baseline.json 为告警基线（DEVELOPMENT.md §10）
docs/          宪章、设计、编排、路线、事实账、流程、交接；docs/graph/ 为本项目的项目图（进度的事实源）；docs/reference/ 为事实参考原文；docs/rules/ 为规则板导出的人定部分（`rules` 行启用、人选过高峰模式档位之后才出现）
video/         宣传视频：独立的 Remotion 项目（自带 package.json 与检查），全部用代码渲染、配乐从零合成；不进两个包的构建与检查，根目录 ESLint 忽略它；现有 24 秒样片 Sample（video/README.md）
AGENTS.md      仓库规则
package.json   开发工作区根（dsh-glm-hourness，private，不是 bundle）：脚本、开发依赖与 peerDependencies
.llm/          不入库，项目目录：rules/（规则板的流水与快照，`rules` 行启用后才有）、audit/（违规与决策；旧的用量副本与 dialect-init 流水已于 2026-10-29 删除）、memory.json、docs/（原始资料快照与抓取脚本）、probe-runs/、calibration-runs/；旧的 credentials.json 与 device-mid.txt 已于 2026-10-29 删除（m1-cleanup）
~/.dsh/glm-hourness/  仓库外，用户级目录：audit/usage.jsonl、credentials.json（2026-10-29 起为版本 2）、device-mid.txt（m1-parity 起不再使用，DESIGN.md §2.4）
reference/     不入库：审计用参考源码（zcode-api、deepseek-harness、ZCode、zcode-plugins）、ZCode 发布包副本 zcode-3.16.3/ 与 zcode-3.17.1/（逐字门禁只读后者）与桌面版运行时包导出 dsh-desktop-0.2.1-rc.3/，约 2.5 GB
.agents/       不入库：编排任务状态与一次性脚本（如 m1-parity 集成报告 zcode-parity/、批次 L4 记录 m1-l4/、借用审计报告 dsh-borrow-audit/report.md、缓存调查 cache-2026-10-28/）
.worktrees/    不入库：并行线的 git 工作树。目前没有登记的工作树，目录为空（graph-engine 留下的空目录已于 2026-10-29 删除）
```

## 3. 组件状态

| 行 | 状态 |
| --- | --- |
| `glm-llm` | coding-plan 请求中本包能控制的部分与 ZCode 3.17.1 代码级一致：m1-parity（2026-10-29 合入，`a9f12e1`）按 3.16.3 对齐，2026-10-30 跟到 3.17.1（版本号、归因头 `x-zcode-session-features`、项目令牌请求失败的细分错误码；其余代码两版逐字节一致，项目图 `zcode-3171-follow`，3.17.1 的沙盒真实请求与 L4 由这个节点跑）。对齐的内容：项目令牌鉴权、拿不到即失败，凭证记录版本 2（首次读取迁移并去掉 secret），`X-Title` electron，ZCode 的 User-Agent、头序与归因头，ZCode 的设备 ID（缺失时按 ZCode 的做法写回 `~/.zcode`），请求体与 `max_tokens`；DSH 控制的差异与本包的近似见 `DESIGN.md` §4.8。沙盒真实网络运行（2026-10-29）10 个请求全部 200，5 个模型请求都签名，鉴权形式、头名顺序与大小写、请求体与 3.16.3 一致（`DESIGN.md` §4.3）。桌面版批次 L4（2026-10-29）通过：GLM-5.3-Flash 主会话 6 个回合、委派子会话、会话标题与一次手动压缩都正常完成，真实凭证迁移一次。此前：真网冒烟、GLM-5.3-Flash 读图（2026-10-28）、`glmsandbox` 标定基线（两档模型各 6 次多轮工具会话，`ORCHESTRATION.md` §10.5.2） |
| `glm-login` | 可用；`/glm-status` 输出凭证状态与调用会话的行健康表；缺 OAuth 令牌或账号 id 的登录显示为未登录并带 ZCode 的原因（m1-parity） |
| `glm-prompt` | 在 rc.3 运行时上生效，含 ZCode local 工具检索；系统提示词各节与七个别名的描述、schema 按 3.17.1（2026-10-30 跟进，coding-plan 新增 Dynamic Behavior 节，项目图 `zcode-3171-follow`；此前按 3.16.3 重建）；todo 提醒按助手轮次从会话历史计数；GLM 会话进入高峰时段时收到一条提醒（`ORCHESTRATION.md` §11.4）。2026-10-29 L4（3.16.3 文本）：主会话与子会话的系统提示含 `You are ZCode, an interactive coding agent`，不含 `powered by DeepSeek Harness`；3.17.1 文本（CLI 前缀 `You are ZCode, an interactive agent`）的 L3 探针与 L4 由 `zcode-3171-follow` 跑 |
| `glm-compact` | 在 `llm/stream` 上替换压缩指令（2026-10-27），L3 探针实测压缩生效；2026-10-29 桌面版对空闲会话手动 `/compact` 一次，92.6 秒完成（26 条历史），压缩后的回合正常 |
| `data` | 默认启用：数据目录服务（用户级 `~/.dsh/glm-hourness/`、项目 `.llm/`）；L3 探针验证，桌面版上生效 |
| `guard` | 拦截与纠偏可用，所有路由、所有模型都拦（2026-10-29 split 第 7 步按 `question-14` G3 改，此前只管 GLM 调用；`ORCHESTRATION.md` §6.2）；违规落盘（项目目录 `audit/violations.jsonl`，记录带来源 `scope` 与 `route`）；`file-tools-only` 引号感知，规则声明进每条路由的系统提示词，工作区变更兜底在回合结束时记录、拦不住，它改成什么由 M4 定（`ORCHESTRATION.md` §6.5.2；需要 `workspace-changes`，桌面版 profile 有），2026-10-28 L4 实测拦截与记录生效；相对路径按会话工作目录解析（2026-10-28，L3 探针验证）。非 GLM 路由上的拦截只经 L2 与 L3 探针验证，L4 在 split 合入时做。2026-10-29 `/glm-status` 显示生效，L4 是只读任务，没有触发拦截；申报未接通 |
| `memory` | 工具与用量流水可用，用量写用户级目录；记忆几乎未被使用 |
| `workflow` | 只记录派遣类调用（含 `subagent_fork`）；2026-10-29 L4 记下 `subagent` 与 `send_message` 两条 |
| `hourness` | `/hourness` 可用：晨报与积分口径的面板（`ORCHESTRATION.md` §11.2、§11.3），2026-10-29 L4 输出正常；额度类数据未实现 |
| `graph` | 默认启用（2026-10-28 经 L3、L4，`DEVELOPMENT.md` §12）：项目图工具、每步投影、图文件门禁；2026-10-29 L4 只读调用 `graph_show` 正常 |
| `graph-panel` | 默认启用：`/graph-apply`、`/graph-run` 与现场投影 `graphLive`；2026-10-29 L4 现场区显示主 Agent 正在跑的工具，子 agent 完成后显示已停下 |
| `rules` | 规则板最小一片（`ORCHESTRATION.md` §16，2026-10-30，自举前先做的一片，项目图 `rules`、`d-rules-peak-slice`）：每个项目的高峰模式档位（无影响、少做、不做，默认少做），人用 `/rules peak` 改；服务 `glmHournessPeakMode`（`stateFor`、`stateForProject`、`peakHoldFor`，少做档的高峰里带 `glmWorkerCap: 1`）。档位存在仓库 `docs/rules/rules.json`，流水与快照在项目 `.llm/rules/`，不写用户级目录；第一次写 `.llm/rules/` 前把 `.llm/` 追加进该项目的 `.git/info/exclude`（任何项目一样，不重复）。存下来的状态、流水记录的摘要和 `rules.json` 里，为空的集合不出现（整块规则板添集合不用迁移）。项目根算法（`projectOf`、`gitDirOf`、`ensureIgnored`）与写锁在 `src/data/project-root.ts`、`src/data/lock.ts`，不是规则板专用的，M7 的门禁锁（E3，`ORCHESTRATION.md` §17.6）已经复用它们，M5 以后复用。恢复之后降级的几种消息（存档被改、流水被截短、有没生效的记录）末尾写出路：删掉 `.llm/rules/`。**默认禁用**；L2 与 L3 探针（场景 `rules-peak`、`rules-peak-hourness`）通过，桌面版没有跑过。现在不拦任何调用、没有排队与暂停；派活（M7）还没有读 `glmWorkerCap`，所以上限只是服务里的一个数。没做的部分与整块规则板的接法见 `ORCHESTRATION.md` §16.6 |
| `design` | 主 Agent 模式（M3 第 3 步，项目图 `m3-1`，`ORCHESTRATION.md` §3.1、§3.5）：`/wish`（开启、`here`、`off`）、会话投影 `hournessMainAgent`、每个项目一份持有者记录（用户级目录 `main-agent/`，一个项目一个主 Agent）、身份节 `hourness:main-agent`、主 Agent 的工具面（去掉写文件的工具与 `ask_user_question`，`str_replace_editor` 只留 `view`）。**默认禁用**；L2（`tests/design-mode.spec.ts`、`main-agent-holder.spec.ts`、`plain-question.spec.ts`、`guard-sections.spec.ts`）与 L3 探针（场景 `glm-design-wish-idle`、`non-glm-design-wish-idle`、`glm-design-main`、`non-glm-design-main`、`glm-design-one-main`，含 fork 一步）通过，桌面版没有跑过。现在还不是边界：guard 的 `main-agent-no-write` 与 `main-agent-ask`（第 4 步）、`propose_to_human` 与 `record_human_answer`（第 6 步）都没有，身份节第二部分点名的两个工具还不存在，所以这一行不能单独启用。`src/graph/proposal.ts` 只有 `renderProposal`，是第 6 步的起点 |
| `glm-hourness/ui` | 功能可用：设置页、输入框「GLM 通道」按钮、右侧栏「项目图」页签（正在做、图）；2026-10-29 L4 挂载与渲染正常；视觉未被整体接受，全部 UI 的审查在项目图 `m8-ui-audit` |

M6 额度契约（Q1，项目图 `m6-quota-contract`，分支 `m6-glm-upkeep`，未合入 main）：公共库新增 `src/shared/quota.ts`（额度视图的类型与 `formatMoment`、`peakLine`、`quotaLines`、`quotaLowOf`、`quotaLowLine`、`loginLine`）和 `src/shared/channel-loop.ts`（通道交给循环板的默认条目类型与 `loopDefaultsOf`）；计价服务加三个可选成员 `peakHours`、`quota`、`loopDefaults`，读取函数 `peakHoursOf`、`quotaOf` 在 `src/shared/pricing.ts`。契约与纯函数（`peakHours` 随 R1、`quota` 与 `loopDefaults` 随 Q2 由 GLM 包提供，编排层包还没有读 `quota` 与 `loopDefaults`）；`tests/quota.spec.ts` 已进 `npm test` 列表。

M6 额度读取与登录状态（Q0、Q2，项目图 `m6-host-export`、`m6-quota-read`，分支 `m6-glm-upkeep`，未合入 main）：`glm-login` 行提供的计价服务带 `quota`（`src/glm-llm/quota.ts`：向 `bigmodel.cn/api/monitor/usage/quota/limit` 发 GET，头恰好 `authorization` 与 `x-request-id`，60 秒复用、没有定时器，读数与预估在 `<用户级目录>/audit/quota.jsonl`）和 `loopDefaults`（四条默认条目），行配置多一个 `plan`（须与 `glm-llm` 行相同），`/glm-status` 在凭证行之后写高峰行与额度一段；适配器在 429 的 1308 等与登录被拒时写同一份流水，状态按登录令牌的指纹判。3.17.1 安装包的 host 文件已只读导出到 `reference/zcode-3.17.1/host/`。指标事件不在其中（`m6-metrics-events`，等指标服务的设计）。真机读取与桌面版核对在 `m6-l4`。
M6 高峰提醒按档位（R1，项目图 `m6-reminder-text`，分支 `m6-glm-upkeep`，未合入 main）：GLM 包的高峰提醒按规则行服务 `glmHournessPeakMode` 交出的档位措辞（少做、不做各一段，无影响与读不到档位用 M6.1 原文），不叫主 Agent 停下；`credits.ts` 导出 `PEAK_HOURS` 与 `PEAK_END_LABEL`，`creditPricing` 带 `peakHours`；`ORCHESTRATION.md` §11.4 整节改写；探针 `rules-peak` 加正文检查、新场景 `rules-peak-stop`。合入顺序：先于规则行去掉补丁里的 `disabled: true`，与整块规则板的 R4 先后不限。

行健康（`DESIGN.md` §2.5）：13 个宿主行（下面 2026-10-29 L4 的数字是规则板行加入之前的 11 个）都在激活时与会话中上报生效、部分生效或未生效及原因，`/glm-status` 显示。2026-10-29 L4 的第二次 `/glm-status`：11 行全部生效，glm-llm 的原因是「上游已应答（套餐 coding-plan）」，没有设备 ID 的附注；第一次（还没运行 `/hourness`、没调用图工具）hourness 与 graph 为「已加载，本会话未触发」，其余 9 行生效。

装机：2026-10-29 10:02（UTC+8）agent 重启桌面版，加载主检出 `0f9f284`（代码与 `a9f12e1` 相同）。没有新的 crash log，宿主 stdout 与 stderr 里没有本包的输出；页面控制台只有已知的三类噪声，都不来自本包：inspector 插件连 `ws://127.0.0.1:9230/ingest` 失败、`dsh-app://app/plugins/events` 的 `ERR_FAILED`、旧会话的 `changes.summary` 404。10:48 清理之后再重启一次（`m1-cleanup`）：新实例没有 crash log，控制台只有 ingest 噪声，宿主输出里没有本包；重启时被强制结束的旧实例留下一份 renderer crash log（见 §6 桌面版自验）。

门禁（2026-10-29，主检出 `0f9f284`，代码与 `a9f12e1` 相同）：`npm run build`、`npm run preflight` 通过；`npm test` 39 个 spec 文件、556 用例通过、0 失败，逐字门禁 443 段、已知偏差 0 条，检查器门禁对照基线 ESLint 250 条压制、knip 21 条、jscpd 2 处克隆（16 行），gitleaks 无发现。`npm run probe` 94/94（`a9f12e1`，worktree 上用临时 profile 运行，探针期望没有改动）。zcode-3171 分支（2026-10-30）：逐字门禁只对照 `reference/zcode-3.17.1/zcode.cjs`，489 段、292 行受检、已知偏差 0；`npm test` 661 用例通过。标定基线（`npm run calibrate`，提交 `4cb8799`）：两个起步任务、两档模型各 3 次，12/12 完成（`ORCHESTRATION.md` §10.5.2）。

项目图（M2）：引擎经用户批准（M2.1 选 A），`graph-engine` 于 2026-10-28 合入 main（`5463662`）；同日加上决策分级与转述（`d4cd7e2`，`ORCHESTRATION.md` §2.9.1）。图行 `glm-hourness/graph` 与面板行 `graph-panel` 经 L3、L4 后默认启用。远端分支 `origin/graph-engine`（`5463662`，是 `main` 的祖先）已于 2026-10-29 删除（项目图 `m1-cleanup`）。

宿主接口：每个用到的 DSH 钩子、服务成员与载荷字段都已对照 rc.3 运行时包，证据见 `DESIGN.md` §2.4a 接口对照表；宿主结构类型集中在 `src/shared/dsh-min.ts` 与 `src/shared/lm-min.ts`。

派发可行性验证（2026-10-28，L3）：后台派发、子 agent 写入范围门禁、goal 驱动下的目标轮注入与完成门禁都在 rc.3 运行时上走通，只用探针覆盖层里的验证插件 `scripts/probe/probe-dispatch.mjs`，bundle 没有新行（`ORCHESTRATION.md` §2.1、§3.2，`DESIGN.md` §2.4a）。

## 4. 审计数据快照（2026-10-29，批次 L4 之后）

- 用户级 `~/.dsh/glm-hourness/audit/usage.jsonl` 371 条，最晚一条 2026-10-29T02:21:07Z：原生通道 `glm-zcode/glm-5.3` 19、`glm-zcode/glm-5.3-flash` 62；`deepseek-account/deepseek-flash` 290。旧的 pi-ai `glm` 路由（8317 反代）留下的 806 条已于 2026-10-29 按用户要求删除；改前备份在积分面板经最终走查核对之后同日删除（`DESIGN.md` §2.4）。
- 迁移来源：仓库 `.llm/audit/usage.jsonl` 890 条在 2026-10-29 清理时补拷 0 条，随后与 `.llm/audit/dialect-init.jsonl` 一起删除；旧目录 `~/.dsh/profiles/desktop/.llm/` 的 190 条用量、3 条决策与记忆文件核对都已在新位置后，已于 2026-10-29 删除（`m1-cleanup`）。
- 违规流水：仓库 `.llm/audit/violations.jsonl` 2 条，最晚 2026-10-28T02:52Z；2026-10-29 L4 没有新增。
- 决策流水：仓库 `.llm/audit/decisions.jsonl` 15 条，最晚两条是 2026-10-29 L4 的 `dispatch:subagent` 与 `dispatch:send_message`。
- 记忆：仓库 `.llm/memory.json` 1 条（从旧目录复制，之后没有写入）。

## 5. 已知问题

1. 路由判定已收口到 `src/shared/route.ts`，`glm-prompt`（含工具检索与 todo 提醒）已改用（`DESIGN.md` §3）。todo 提醒自 2026-10-28 起按 ZCode 的助手轮次口径计数（`DESIGN.md` §5.5）。
2. 版本基线已统一为 3.17.1（2026-10-30，此前为 3.16.3）；`X-Title` 按用户定案（2026-10-28，项目图 `question-8`）改为桌面版的 `Z Code@electron`，模型请求与配置请求相同（`DESIGN.md` §4.2）。
3. guard 闭环缺申报一段（记录、告知已于 2026-10-28 接通）。`=>`、`>>>`、`->` 误判已修（2026-10-28，引号感知，`ORCHESTRATION.md` §6.5.1）；读不到的 shell 写法（.NET 调用、`cmd /c`、PowerShell 别名如 `del`）只由工作区变更兜底在回合结束时记录，拦不住（§6.5.2）。L4 暴露的相对路径问题已修（2026-10-28）：相对路径按会话工作目录解析，`..` 折叠（§6.1）。拦截范围 2026-10-29 改为所有路由（`question-14` G3，§6.2）；file-tools-only 在其他模型上的误伤率还没有数据，晨报把其他路由的记录另行计数。
4. 数据目录分裂：已修（2026-10-28，`DESIGN.md` §2.4）。用户级数据在 `~/.dsh/glm-hourness/`，项目数据在工作区 `.llm/`；凭证与 deviceMid 已于 2026-10-28 搬到用户级目录。仓库里的原件（`.llm/credentials.json` 是仍含 API Key secret 的版本 1 记录，另有 `.llm/device-mid.txt`）已于 2026-10-29 删除（项目图 `m1-cleanup`）。
5. 签名握手地址错：已修并实测（2026-10-28，`b6367d3`、`6af6c51`，`DESIGN.md` §4.3，项目图 `m1-signing`）。适配器曾把路由后的 `zcode.z.ai` URL 交给签名层，握手每次 404，且每个请求前都重试一次；原先「握手对当前凭证失败」的归因不成立。现在握手发往 provider origin `https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`，失败后该（origin, 凭证）60 秒内不再握手，start-plan 不签名。60 秒冷却、两次 VERIFY 后的永久旁路、凭证不可解析等情况下放行，是对 3.16.3 的三处偏离（`DESIGN.md` §4.8）。m1-parity 之后的沙盒真实网络运行（2026-10-29，`a9f12e1`）：握手 200，5 个模型请求都签名、都 200，两个鉴权头与签名都用项目令牌，没有 VERIFY 拒绝。桌面版两次以签名代码重启（2026-10-28、2026-10-29），glm-llm 都生效。仍未决：签名对 1.5 倍套餐扣减的影响未知（用量流水不含套餐扣减）；签名运行的响应头延迟偏高（单样本，未归因）；桌面版上签名是否成功看不到，生产构造没有接 `onEvent`，签名状态不可见；start-plan 只做了离线验证（第 6 项）。
6. start-plan 档只有单测，未做真机授权验证。
7. 峰谷口径：已修（2026-10-28，`ORCHESTRATION.md` §11.2）。面板按积分计，高峰为工作日 14:00–18:00（UTC+8），其余时段按 50%；5 小时窗口、周额度、预估耗尽时间要等通道取数（`DESIGN.md` §4.7）。
8. 记忆存储判据过严，路径或文件名样式的文字一律被拒（`ORCHESTRATION.md` §8.1）。
9. 方言逐字文本：七个工具别名都已按 ZCode 原文重建（2026-10-28 按 3.16.3，2026-10-30 跟到 3.17.1），逐字门禁只对照 `reference/zcode-3.17.1/zcode.cjs`，已知偏差为 0；Grep 与 Bash 是本地化组合，删改及与 ZCode 的剩余差异见 `DESIGN.md` §5.4（Bash 不发 3.17.1 的「Command output … not reliably to the user」一行，DSH 上不成立）。todo 提醒正文、compact 提示词、工具检索文本已按原文重建，deferred 声明段已删除（`DESIGN.md` §5.9）。工具检索在 ZCode 默认关闭，本项目按用户定案默认开启；与 ZCode 的剩余差异见 `DESIGN.md` §5.7。
10. UI 视觉未被整体接受；全部 UI 的审查在项目图 `m8-ui-audit`。
11. cot-translation 与 Agent Team（DSH 官方实验包，非本项目组件）已按用户同意从桌面版 profile 的 bundle 列表移除（2026-10-28；当时的备份 `package.json.bak-1793157445556` 已于 2026-10-29 随 `m1-cleanup` 删除）；2026-10-29 profile 的 bundle 列表里已没有这两个包。
12. 凭证加密密钥可由本机信息推导（`DESIGN.md` §4.1）。
13. 修正前写入的用量流水，原生通道请求的输入 token 均为 0（解码器缺陷已修，`DESIGN.md` §4.6a）；面板按记录形态识别这类记录，不计入积分，只报条数（2026-10-28）。真实流水里目前没有这类记录。
14. 2026-10-27 之前，`glm-prompt` 与 `toolsearch` 依赖桌面版运行时不存在的 `tools.executable()`，在桌面版上从未生效（L3 探针确认）。两者均已在 rc.3 接口上重写；2026-10-28 起桌面版 GLM 会话的系统提示是 ZCode 方言（L4 实测，2026-10-29 再次确认）。
15. 2026-10-27 之前 `glm-compact` 在桌面版上从未挂载（解析不到 `@deepseek-ai/dsh-compaction-basic`），原设计还会形成第二个压缩引擎。已改为 `llm/stream` 接缝（`DESIGN.md` §5.6）。
16. 2026-10-27 之前创建的合成 notice 没有 `id` 与 `role`；同一步里有两条这样的 notice 待处理时，DSH inbox 会抛「already pending」。已修（`createUserNotice`）。
17. 原生通道的图片：已修（2026-10-28，`DESIGN.md` §4.5a）。GLM-5.3-Flash 收到 Anthropic base64 图片块（用户消息与 `tool_result` 内）；GLM-5.3 改为只声明文本，DSH 在适配器之前把图片换成文字占位，`read_image` 拒读。L3 探针与一次真网请求验证。GLM 端点的请求级图片上限未知，本通道不发卸载信号（`DESIGN.md` §9）。
18. 2026-10-28 之前原生通道的编码器按 `toolCalls` 字段读助手的工具调用，rc.3 用 `tool-call` 内容块，工具调用会被全部丢弃，任何多轮工具会话都会被上游拒绝。已修（`DESIGN.md` §4.5）；`glmsandbox` headless 的标定经原生通道跑通 14 次多轮工具会话（`ORCHESTRATION.md` §10.5）；桌面版真实会话：2026-10-28 L4（GLM-5.3 多轮工具调用）与 2026-10-29 批次 L4（GLM-5.3-Flash，并行 Glob 与 Read、Grep、委派子会话）都正常。
19. 行健康只保存在主机进程内存里，桌面版重启后清空，历史状态查不到；输入框下的 GLM 按钮把 `/glm-status` 的表按行列出，对话里的命令卡片仍原样显示 Markdown，卡片视图随 M8（`DESIGN.md` §2.5）。
20. 依赖安装：`pnpm add`、`pnpm update` 要带 `--store-dir .pnpm-store`（`node_modules` 链接自仓库内的 store）；`pnpm install --frozen-lockfile` 失败，根 `package.json` 的 `peerDependencies` 不在锁文件里，M1.9 之前即如此（`DEVELOPMENT.md` §11）。检查器基线里的存量告警（多为测试里多余的类型断言与无 `await` 的 async 回调）尚未清理，2026-10-29 为 ESLint 250 条压制、knip 21 条、jscpd 2 处，按棘轮只减不增（`DEVELOPMENT.md` §10，`ORCHESTRATION.md` §7.7）。
21. 权限预设 `workspace-write` 下，pwsh 经 Windows ACL 沙盒运行，`node --test` 派生测试子进程报 `spawn EPERM`，模型确认不了测试结果，会转而申请沙盒升级（`FACTS.md` §3）。用户桌面版的默认预设是 `danger-full-access`，目前不受影响；标定运行器按桌面版预设传 `DSH_PERMISSION_MODE`。
22. 标定起步的两个任务对两档模型都没有区分度（基线 12/12 完成），只能比积分、耗时与返工；更难的任务随 M3、M7 扩充（`ORCHESTRATION.md` §10.5.2）。
23. 派发可行性验证的发现，M7 实现时处理（`ORCHESTRATION.md` §2.1、§3.2）：子 agent 的会话头 `cwd` 是父 agent 的目录，guard 对子 agent 的包含根因而是父工作区，DSH 的文件沙盒根也是父工作区，独立工作树要建在父工作区之内；服务只按调用方传入的 `maxDepth` 限深，本包的派发工具要传；GLM 路由上 `structured_output`、`send_message`、`update_goal` 是延迟工具，要经 DeferredToolCall 调用；headless 运行器在第一次静止空闲时退出，不跑目标轮，用 goal 驱动的标定任务要另想办法撑住进程。
24. 原生通道的提示词缓存：2026-10-28 修复主因（`DESIGN.md` §4.5b）。网关按 `x-session-id` 做缓存亲和，通道此前每请求随机生成；现在按 DSH 会话固定。GLM-5.3-Flash 在会话第二步仍常只命中共用前缀，原因未明。同批补上保留式思考（历史 reasoning 带签名回传，§4.5c，命中率不变、每步未命中输入变多）与四处 ZCode 请求细节。2026-10-29 桌面 L4 会话（GLM-5.3-Flash，单次运行）第二步命中（输入 483、缓存读 18112），之后各主步缓存读 18560–21120，压缩后第一步为 0（前缀变了）。
25. 空闲会话手动压缩的 `x-query-id`：DSH 的 `/compact` 与压力压缩发出同样形状的请求，本包沿用上一回合的 query id；3.16.3 的 `/compact` 是独立输入，有自己的 query id。只差这一个压缩请求（`DESIGN.md` §4.5b、§4.8；m1-parity 评审第 3 轮的非阻断发现）。
26. 批次 L4 没有在桌面版上看到、只由 L2 覆盖的 m1-parity 路径：委派子会话的 `subagent` 头值与父会话的 trace id（没有截包）；拿不到项目令牌时失败即停的界面呈现（不破坏真实登录）；deviceMid 缺失时的写回（本机状态文件已有 deviceMid）；项目令牌被拒后的刷新重发。没有测过：两个进程同时写同一个凭证文件（`DESIGN.md` §4.1）。
27. User-Agent 的运行时段随宿主：DSH 桌面运行时上是 `runtime/node.js/24`，ZCode 桌面版自己的 agent 进程取什么值没有核（`DESIGN.md` §4.2）。

反向代理已从项目范围移除（`DESIGN.md` §1）；profile 中指向 8317 的 pi-ai `glm` 路由属于用户配置，用户 2026-10-28 把清理交给 agent。批次 L4 于 2026-10-29 通过后，这条路由已于同日从 profile 删除（项目图 `m1-cleanup`），含这条路由的改前备份也按用户要求删除；重启后模型菜单只有「DeepSeek 账号」与「GLM (ZCode native)」两组（本包这一组随后改名为「GLM（ZCode 原生通道）」，`m8-ui-audit` V-02）。

## 6. 环境事实

- 凭证：`~/.dsh/glm-hourness/credentials.json`（AES-256-GCM；`GLM_HOURNESS_CREDENTIAL_SECRET` 可覆盖密钥）。记录为版本 2，只存登录令牌与项目 key 定位：2026-10-29 桌面版以 m1-parity 代码重启后，第一个 GLM 请求把旧的版本 1 记录迁移过来，去掉了 API Key 与 secret，并定位到已有的 `zcode-api-key`（`DESIGN.md` §4.1）。现在可以用新代码读这个目录；桌面版运行时另起进程写同一个文件没有测过。仓库 `.llm/` 里的原件已于 2026-10-29 删除（项目图 `m1-cleanup`）。`glm-llm`、`glm-login` 不配 `home` 时默认读用户级目录（`DESIGN.md` §2.4）。
- 设备 ID：请求发送的 deviceMid 取 ZCode 的 `~/.zcode/v2/telemetry-state.json`，没有时按 3.16.3 生成并在锁内写回（`DESIGN.md` §4.5b）。本机状态文件已有 deviceMid，本包不写它：2026-10-29 L4 前后大小与修改时间不变，没有出现锁文件。`~/.dsh/glm-hourness/device-mid.txt` 自 m1-parity 起不再使用，作为用户数据保留。
- 数据目录：用户级 `~/.dsh/glm-hourness/`（`$DSH_HOME` 可改根目录），项目 `.llm/`；由 `data` 行的服务提供（`DESIGN.md` §2.4）。
- 模型：`glm-zcode` 路由提供 GLM-5.3、GLM-5.3-Flash。
- 运行时：桌面版的宿主进程是 `DeepSeek Harness.exe` 的 Electron node 模式（Node v24.21.0，`navigator.userAgent` `Node.js/24`），沙盒、探针与标定也经它运行（`DEVELOPMENT.md` §3）；本机 `node` 是 v22.20.0，单测与 `--experimental-strip-types` 的脚本跑在它上面。两者的 User-Agent 运行时段分别是 `runtime/node.js/24` 与 `runtime/node.js/22`（`DESIGN.md` §4.2）。
- 沙盒：命令见 `DEVELOPMENT.md` §3。探针（`npm run probe`，离线）每次在运行目录下生成 DSH home 与 profile `probe-full`，测探针脚本所在的检出（主检出或 worktree）；标定（`npm run calibrate`，真实请求、消耗积分）用 profile `glmsandbox`（链接主检出）。两者不要同时运行。沙盒模板的权限模式由 `DSH_PERMISSION_MODE` 决定（缺省 `workspace-write`），桌面版 profile 的默认预设是 `danger-full-access`。
- profile 目录：旧备份（`cordis.patch.yml.bak-1793093243213`、`cordis.patch.yml.bak-1793101338423`、`package.json.bak-1793157445556`）与旧数据目录 `.llm/` 已于 2026-10-29 删除（`m1-cleanup`）。删除 8317 路由之前的备份 `cordis.patch.yml.bak-1793241992974` 只比现行 patch 多这条路由，同日按用户要求删除；profile 目录里不再有备份。
- 桌面版输入框的模型菜单换模型时，DSH 会把选中的模型写进 profile 的 `agent-default-model`，作为新会话的默认模型（2026-10-28 L4 实测）。用桌面版做验证时换过模型，结束后经同一菜单换回，并核对这一项。最近一次：2026-10-29 批次 L4 把它从 `deepseek-account` / `deepseek-flash` / `high` 换成 `glm-zcode` / `glm-5.3-flash` / `high`，验证后已换回，profile 其余内容未动。
- 桌面版自验（L4）：以 `.agents/tasks/m1-l4/restart.ps1`（与 `m8-doing-layout/restart.ps1` 同步骤）带 `--remote-debugging-port=9333` 重启，经 DevTools 协议输入提示词、截图、读控制台；会话日志在 `~/.dsh/sessions/<工作区>/` 下只读读取，输出前遮盖凭证类字段。宿主 stdout 含本机 web 地址的令牌，不外传。2026-10-29 运行结束时页面报告 `document.visibilityState` 为 `hidden`，原因未查，截图仍可取；同日清理后的重启里页面仍是 `hidden`。重启时 `CloseMainWindow` 没能让旧实例正常退出的话，脚本的 `Stop-Process -Force` 会让旧实例留下一份 `Desktop renderer exited: crashed` 的 renderer crash log（2026-10-29T02:48:08Z 那份写于新主进程创建前 1 秒，`shell pid` 不在新进程树里；`CloseMainWindow` 未生效的原因是推断）。判断重启后有没有新错误，以新主进程的创建时间为界。
- Windows PowerShell 5.1 的 `Get-Content`、`Set-Content` 不带 `-Encoding` 时按系统 ANSI 代码页读写，UTF-8 文件往返一次，非 ASCII 字符就坏了（2026-10-28 损坏过 `src/shared/dsh-min.ts` 的 en dash，已修复）。改文件用编辑工具或 Node 脚本；经 CDP 往页面送含中文的表达式或文本，用 `.agents/tasks/m2-panel/cdp.mjs` 的 `evalfile`、`typefile`。
- 旧工作名文件夹 `Desktop\Project\dsh-glm-dialect` 已于 2026-10-29 删除（`m1-cleanup`）；它的 4 份文档在 M0 迁入本仓库（提交 `c518317`），删除前核对过 4 份文件的 blob 都在本仓库的对象库里。
- gitleaks 8.30.1 装在 `%LOCALAPPDATA%\Programs\gitleaks\gitleaks.exe`（仓库外，`npm test` 的密钥扫描用它，没有它门禁失败；安装与升级见 `DEVELOPMENT.md` §11）。

## 7. 下一步

只看项目图（`npm run -s graph -- open`，或桌面版右侧栏的「项目图」）：进行中、可以开工与等人的事都在上面，节点批注里有接着做的要点。
