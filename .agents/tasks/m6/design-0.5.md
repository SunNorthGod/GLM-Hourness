# M6 用量、积分与峰谷：设计（项目图 `m6`）

版本：0.5（2026-10-31，对齐轮 `align-rounds-2026-10-30` 的 C 支；0.5 还没有评审过，评审在对齐之后）。0.4 之后的新依据并进来：人定的 `d-main-agent-peak-exempt`（主 Agent 不受高峰模式影响，任何一档都随时回话），规则板最小一片在 main 上实际交出的高峰模式服务（`src/shared/peak-mode.ts` 的 `glmHournessPeakMode`，`src/shared/pricing.ts` 里已有的 `nextPeakChange`），`d-zcode-3171`（0.4 已按 3.17.1 写，0.5 重核了一遍，§4.1），规则板 0.10、循环板 0.6、M3 附录 0.5、M7 0.6、宪章 0.7，以及人在 0.4 之后定的 `d-rules-in-repo`、`d-memory-scope`、`d-boards-as-hooks`、`d-script-timeout`、`d-dogfood-scope`、`d-agent-examples`。没有新方向，没有待人定的事项（§20）。每处改动答的是哪一条，见 §21 末尾的「0.5」三张表：盘上稿的处理、对齐表、给其他设计的请求。0.4 原文原样留在同目录 `design-v0.4.md`（211,569 字节，MD5 `1EA411E5DF326BFAD5C45A951C09AB55`）；0.3 原文在 `design-v0.3.md`（MD5 `3692a82333369896adcd05176eee18aa`，第 3 轮评审的行号指那一份）；0.2 原文在 `design-v0.2.md`。

评审记录 `design-review.md` 的轮次表里有「第 4 轮、0.4、0/0/5」一行，正文里没有这一轮（正文止于第 3 轮的结论），`design-review.json` 也止于第 3 轮：写那一轮的运行在写正文之前断了。这一行不当作评审结论，0.4 按没有评审过看待，0.5 是 0.4 之后的第一次评审。

依据：

- 代码（0.5）：main `419b6ea`（2026-10-31 读）。`480e264..419b6ea` 里碰代码的提交：规则板最小一片（`c7e7fa4`、`ed80a99`、`0fa2e1c`、`81311db`、`98eff90`、`6bdffac`、`1b08241`、`d308cc3`，文档 `5b43e7f`）、M7 的 E0、E1a、E3（`a8dfc70`、`c3d66e0`、`af75fe8`）、M3 第 1 步（`9c346fb`）、宪章 0.7（`f2faa6f`，文档）。与本稿有关的变化：`src/shared/peak-mode.ts`（新：高峰模式的契约、读取函数 `peakModeService`、`PeakModeState` 的 `level`、`origin`、`at`、`peak`、`until`、`glmWorkerCap`，`PEAK_REDUCE_GLM_WORKERS` 为 1；规则行经服务 `glmHournessPeakMode` 交出，行在 `packages/hourness/cordis.patch.yml` 里仍是 `disabled: true`）；`src/shared/pricing.ts` 已有 `nextPeakChange(peak, fromMs, horizonMs?)`（规则板最小一片加的，M6 不再加，§5）；`src/data/project-root.ts`、`src/data/lock.ts`（项目根与写锁）；`scripts/probe/run-probe.mjs` 多了场景 `rules-peak`（GLM 路由，探针时钟 `PEAK_AT` 为周三 15:00 UTC+8，三步：出厂档位、`/rules peak 不做`、`/rules peak 无影响`）与 `rules-peak-hourness`，`PEAK_NOTICE` 现在在第 365 行，探针对 `PEAK_REMINDER_TEXT` 的导入在第 53–54 行。`src/glm-prompt/`、`src/glm-llm/`、`src/report/`、`src/workflow/`、`src/memory/`、`scripts/calibrate/run-calibrate.mjs`、`scripts/smoke-zcode-authorized.mjs` 自 `480e264` 起没有变（`git diff --stat 480e264 HEAD` 里没有它们），下文引的这些文件的行号仍对（抽查过：`peak-reminder.ts`:28、`zcode.ts`:46、:469、:557、`run-calibrate.mjs`:27、`health.ts`:84）。规则行的最小一片只交档位，不拦、不排队、不暂停任何东西（`docs/ORCHESTRATION.md` §16.1），也没有给主 Agent 的每步提醒、等待单、默认规则与它的附属条目、`checkCall`、规则页；下文凡写「规则板执行」「整块规则板」的，是自举开始之后才做的部分（`d-dogfood-scope`）。
- 代码（0.4 的依据，仍有效的部分）：main `480e264`（2026-10-30；它之前的几个提交只改 `docs/graph/`，代码最后一次变动是 `46e1884`）。0.3 依据 `4e26f79`。`4e26f79..480e264` 里碰代码的提交有 19 个：`zcode-3171-follow` 的 14 个（`11b1282` 到 `46e1884`，把通道与提示词换到 3.17.1），另有 `c17ff5d`（glm-prompt 的环境一节取会话头的工作目录）、`61be79a`（guard 拒绝文字的例外段）、`2618f37`、`87a4f21`、`823795a`（逐字检查脚本与它的测试）。`c17ff5d`、`61be79a` 不是 `4e26f79` 的祖先，是在它之后经 `823795a` 合入的，0.3 写成「在 `eb614ab` 与 `4e26f79` 之间」不对（设计评审第 3 轮 N20）。与本稿有关的变化两处：`8b12baf` 让 PAT 平面的请求失败带上 3.17.1 的码（`project_token_http_<status>`、`project_token_network_error`、`project_token_timeout`；`src/glm-llm/auth/project-token.ts`:81–108 的 `RequestFailure`、两个错误类与 `requestFailureCode`，:367–376 的映射；`zcode-wire.ts` 的 `PROJECT_TOKEN_HTTP_CODE_PREFIX`），登录被拒的铸造一路因此直接看抛出的码，不再加回调（§4.9）；`src/glm-prompt/index.ts` 改过，高峰提醒读档位与 `glm.peak-reminder` 事件的接线都落在它的 `apply` 与 `installDialect`（§16 R1、Q2）。本稿用到的其余文件（`src/glm-prompt/peak-reminder.ts`、`src/glm-llm/credits.ts`、`login-row.ts`、`auth/store.ts`、`src/report/`、`src/workflow/`、`src/shared/`、`scripts/calibrate/run-calibrate.mjs`、`scripts/smoke-zcode-authorized.mjs`）没有变；`zcode.ts` 改了第 422 行与 `failClosed` 的注释和一句行健康文字，行数不变，本稿引的行号仍对。M6 不加新行，所以不涉及语言文件。
- 规则板设计 `.agents/tasks/rules/design.md` 0.10（含最小一片跟进的六条修订，评审通过、人放行；下文 `rules:§` 指它的小节）。0.4 写的时候对着 0.8；0.8 到 0.10 之间本稿引用的节号（§2.3、§2.5、§2.6、§3.1–§3.6、§6.3、§6.4、§7.2、§9.1、§9.3、§9.4、§10.1、§10.5–§10.7、§12、§16）都还在，意思变了的地方在下面几条和 §21 的对齐表里：高峰模式的附属条目是四条（少做 `builtin:glm-peak-reduce`；不做 `builtin:glm-peak-stop`、`builtin:glm-peak-stop-dispatch`、`builtin:glm-peak-stop-scripts`），主 Agent 不受高峰模式影响，不做档只排 GLM 子 agent 的工具调用、派 GLM 子 agent 的调用与自报花 GLM 积分的脚本（rules:§3.6）；规则与条目的形状是 `when` 加 `filter` 加 `condition` 加 `action`（rules:§2.2）；人写的规则存在项目仓库的 `docs/rules/`，运行时的东西存在项目的 `.llm/rules/`，规则板不写用户级文件（`d-rules-in-repo`，rules:§7.1）；`checkCall` 会跑人同意过的拦路脚本，超时按条目的做法判、不在后台接着跑（rules:§9.4）；判定事件仍由 `checkCall` 写，写入口按项目根找到这个项目 `.llm/` 里的指标流水（rules:§9.4、§10.5）。高峰提醒的原文与各档措辞、`docs/ORCHESTRATION.md` §11.4 归 M6，规则板只交档位，0.10 仍照这条裁定写（rules:§3.4、§3.5、§10.6、§10.7）。
- 循环板设计 `.agents/tasks/schedules/design.md` 0.6（评审通过、人放行；0.4 写的时候对着 0.3）：它照 `loopDefaultsOf` 读本稿的四条条目，M6-L1 到 M6-L5 落在它的 §3.4，契约（`LoginView`、`ChannelTrigger`、`ChannelLoopDefault`、`loopDefaultsOf`）与四项条目不变，不请 M6 改契约；高峰开始与结束两项（第 13、14 项 `loops.peak-start`、`loops.peak-end`）是编排层的条目，循环行照计价服务的 `peak` 与 `nextPeakChange` 推出 `channel.peak-changed`（它的 §3.4、§4.3）；`loops.peak-end` 在少做与不做两档都叫醒主 Agent（它的 §6.9 第 4 条）；它 §17 给 M6 的几条本稿已照改（§8）。
- M3 附录 0.5（`.agents/tasks/m3/design-addendum.md`）、M7 设计 0.6（`.agents/tasks/m7/design.md`）、宪章 0.7（`docs/CHARTER.md`）：M3 问人一件事的示范题取「高峰时段派出去的活怎么排」，不做一行写「派活全排队，高峰后再开；主 Agent 照常回你话」（附录 §2.8，`d-main-agent-peak-exempt` 的批注），M3 不碰高峰提醒与档位，与本稿的分工一致；M7 在派活处读一次 `glmWorkerCap`、在空转判定处读一次 `peakHoldFor`（rules:§16.1），本稿不改它们；宪章 0.7 把「先影子后拦截」限定为写在代码里的门禁，板上人同意的条目即生效（§3.2 第 3 条、§6），存放表按「属于项目的都在项目里」重写（§9），整个账号的额度与用量留在用户级，所以 M6 的额度流水与缺口文件（§4.5、§6.2）仍在用户级目录。
- 人定与特性（项目图）：`d-peak-mode`、`d-main-agent-peak-exempt`、`d-defaults-readonly`、`d-rules-visible`、`d-chat-not-cards`、`d-zcode-3171`、`d-design-onepage`、`d-one-main-agent`、`d-auto-drive`、`d-rules-in-repo`、`d-memory-scope`、`d-boards-as-hooks`、`d-script-timeout`、`d-agent-examples`、`d-dogfood-scope`、`d-alignment-rounds`、`d-freeze-until-dogfood`、`d-rules-peak-slice`；特性 `schedules`、`metrics`（指标流水，设计还没有成稿）；节点 `m6` 的批注读到 2026-10-30T11:58Z（规则板 0.9 对 `d-main-agent-peak-exempt` 的请求、最小一片对 M6 的三点说明）；`.agents/tasks/design-context.md` 的全部小节，最新的几节是 Main agent and peak; stale entries; hook seam、Worked examples for the agent、Check entries seam、Dogfood implementation order and runtime paths、Rules thin slice: orchestrator rulings after its review（与 M6 有关的接缝裁定是高峰提醒原文、脚本自查的判定、高峰结束叫醒主 Agent、高峰里等高峰结束四条，§0.1）。
- 注入清点 `.agents/tasks/prompt-audit/report.md`（question-31 C）；split 设计 0.3 §4.3–§4.4。

范围：本稿只写设计。没有改代码、已跟踪文件、`docs/graph/` 与 `~/.dsh`，没有用桌面版，没有发额度接口的请求，没有提交、没有推送。要记到项目图上的事（批注与对其他设计的请求）写成草稿 `graph-ops-align.json`（同目录），由对齐轮的收尾步写、编排方执行；0.4 的草稿 `graph-ops-v04.json` 仍在，其中给 `metrics` 的一条写着「按 `userDataHome()` 与项目键追加」，已被 `d-rules-in-repo` 取代，不要照它上图。只读核对过：本仓库源码与 git 历史、规则板 0.10、循环板 0.6、M3 附录 0.5、M7 0.6、宪章 0.7、项目图（`npm run -s graph -- show`）、本机安装的 ZCode 包（用同目录 `tmp-asar-check.cjs` 的 `info` 与 `find` 两个只读模式核对 §4.1 的几处偏移，没有写任何东西；它与另两个 `tmp-*.cjs` 是此前一次失败的评审运行留下的，本稿没有建也没有删它们）与 pristine 副本 `reference/zcode-3.17.1/zcode.cjs`（只读搜索）。给人看的一页放行稿在同目录 `onepage.md`，它写在 0.4 上，0.5 评审通过之后再重写（`d-design-onepage`、`d-plain-questions`）。

证据写法：

- `host:+偏移` 指 ZCode 3.17.1 安装包 `C:\Program Files\ZCode\resources\app.asar`（2026-10-29 21:04 自动更新写入，包内 `package.json` 版本 3.17.1）里 `out/host/index.js` 按 UTF-8 解码后的字符偏移。这个文件 2,190,425 字节，MD5 `3ef810e5878d5103bb4430df00181b09`。安装版可能带用户补丁，只作机制参考（`AGENTS.md` 基线一节）；额度这几段与 3.16.3 原包逐项相同（§4.1 的表），看不出补丁。
- `chunk:+偏移` 指同一安装包的 `out/host/chunk-ZSDMP7DM.js`；`renderer:+偏移` 指同一安装包的 `out/renderer/assets/styles-C9n_FfEX.js`。
- 需要对比时，3.16.3 的偏移附在括号里，写作 `3.16.3 host:+偏移`，指用户备份 `C:\Program Files\ZCode\resources\app.asar.orig-3163.bak`（包内版本 3.16.3）里的 `out/host/index.js`（2,074,639 字节，MD5 `cbf4b599745c46530befe965eb0f2da3`）。
- 安装目录会随自动更新再变。§16 的 Q0 把 3.17.1 的 `out/host/index.js` 与 `out/host/chunk-ZSDMP7DM.js` 导出到 `reference/zcode-3.17.1/host/`（`reference/` 在 `.gitignore` 里，同 `reference/zcode-3.17.1/zcode.cjs` 的做法），MD5 记进 `docs/FACTS.md` §1；之后文档里的引用写成 `reference/zcode-3.17.1/host/index.js:+偏移`。仓库里的两份 `zcode.cjs` 不含额度代码（`/api/monitor/usage/quota/limit` 为 0 处，设计评审第 2 轮）。
- `zcode-api:文件:行` 指 `reference/zcode-api/src/` 下的文件；其余沿用 `docs/DESIGN.md`。〔实读〕读过源码；〔实测〕跑过；〔推断〕由源码或数据推出、没有运行；〔未核实〕列进 §15.3。

所依据的学科与标准（`docs/ORCHESTRATION.md` §4.3 架构栏）：

| 部分 | 学科与标准 | 用在哪 |
| --- | --- | --- |
| 预估耗尽 | 测量与预测：按时间加权的线性外推，每行写明依据与适用条件 | §4.7 |
| 额度读取、脚本自查 | 可靠性工程：超时、缓存、只追加的流水、失败不重试成风暴；建议性的数据与检查读不到时放行 | §4.4–§4.6、§7.2、§13 |
| 凭证 | 安全工程：凭证不落盘、不进输出与流水；额度接口只读 | §4.5、§12 |
| 给人看的输出 | 人机交互与认知负荷：每个窗口一行、绝对时刻、写明不确定性；问人按 `d-chat-not-cards` 的四行（本稿没有要问的） | §4.8、§6、§20 |
| 高峰模式 | 运维里的维护窗口：档位与执行在规则板，M6 给时刻、时段说明与按档位的提醒措辞；高峰模式只管子 agent 与重活，提醒从不叫主 Agent 停下或不回话（`d-main-agent-peak-exempt`）；读不出是不是高峰时不拦，读不到档位时提醒照今天的原文 | §3.3、§3.4、§7 |
| 与 ZCode 一致 | `d-zcode-3171` 与 `CHARTER.md` §3.1 第 1 条：额度请求的地址、头、超时、凭证与失败处理照 3.17.1；偏离之处列进 §17 给 `DESIGN.md` §4.8 的已知差异 | §4、§10 |
| 留痕与度量 | `CHARTER.md` §7.1 条款 7（失败要出声）、条款 11（处处留痕）；`metrics`（每个数由 harness 写） | §13、§14 |

## 0. 摘要

- 积分口径（`ORCHESTRATION.md` §11.2）已在 M6.1 做完，经计价服务 `glmHournessPricing` 给编排层的面板（§2）。M6 剩下的：晨报的「用量」一节改按积分（与面板同一个函数）；面板第一行写此刻是不是高峰、到几点；面板写明覆盖范围与历史缺口（2026-10-29 删掉的 806 条旧路由记录，§6.2）。
- 额度取数（`DESIGN.md` §4.7）：GLM 通道包照 ZCode 3.17.1 桌面壳的 `BigModelUsageQuotaProvider` 读 `GET https://bigmodel.cn/api/monitor/usage/quota/limit`。交给 fetch 的头恰好两个：`authorization` 为项目令牌原样，`x-request-id` 为每次新生成的 UUID（§4.1、§4.2）。超时 15 秒；失败照 3.17.1 只记一次、不重试，401 也不重铸令牌；体验套餐不发请求。读的时机：人敲 `/glm-status` 或 `/hourness` 时读；装了循环板时，它在 GLM 有新用量记录之后至多每 15 分钟读一次（§8）；60 秒内复用，与 ZCode 设置页用量快照的 60 秒相同（renderer:+6189443）。GLM 包自己不设定时器。读数写进用户级目录的额度流水 `audit/quota.jsonl`；服务端的读数包含 ZCode 等其他客户端与本机删掉的记录，所以额度一节不依赖本地用量流水。
- 预估耗尽（§4.7）：用同一窗口两次读数之间的变化，或窗口开始以来的平均速度，按高峰全价、其余半价折成「全价小时」的速度往后推；重置前用不完就报到重置时预计用到多少，依据写在每一行里。
- 高峰的分工（人定 `d-peak-mode`、`d-main-agent-peak-exempt`，编排方的接缝裁定，§3）：高峰继续提醒模型；另有人选的高峰模式，无影响、少做、不做三档，默认少做。高峰模式只管子 agent（少做限并发个数，不做排队到高峰结束）和自报花 GLM 积分的重活脚本；主 Agent 不受影响，任何一档都随时回话、照常用工具。档位的设定与执行、主 Agent 每步提醒里「此刻是不是高峰、哪一档」的那一行归规则板（rules:§3.6、§6.4），规则板经服务 `glmHournessPeakMode` 把档位交出（契约文件 `src/shared/peak-mode.ts` 与最小一片的服务已在 main）。M6 交付三样：GLM 包的高峰提醒原文与它在各档下的措辞；`docs/ORCHESTRATION.md` §11.4 的改写；高峰的计算（`peakWindowAt`、计价服务的 `peak`、时段说明 `peakHours`；`nextPeakChange` 已在 main 的 `src/shared/pricing.ts`，M6 直接用）。
- 提醒的措辞（§3.4）：每段高峰第一个 GLM 步读一次这个会话的档位（`stateFor(sessionId)` 的 `level`、`origin`、`peak`、`glmWorkerCap`）。读不到（只装 GLM 包、规则行没启用、会话没有项目）或档位是无影响时，正文与今天逐字相同；少做时末句换成「同时至多 N 个 GLM 子 agent（N 取服务给的 `glmWorkerCap`，没有就不写这一句）、不开始可挪的重活（由主 Agent 挪到高峰之后，派出去的也算）、必要的活与派给你的任务照做」；不做时换成「不派 GLM 子 agent、不起花 GLM 积分的脚本；子 agent 的调用被推迟时停下并交回停在哪；主 Agent 不被管，照常回话和干活」。两档都不再说「只是告知」与「不要暂停或推迟工作」，都保留「不要换模型或套餐，除非用户要求」。同一份正文给主 Agent 与子 agent 两种读者，从不叫主 Agent 停下、等待或不回话。
- 三档管到哪（§3.3、§7）：无影响时只提醒。少做（默认）时，高峰里同时至多 1 个 GLM 子 agent（M7 在派活处读规则板交出的 `glmWorkerCap`），自报「可挪」的仓库脚本排队，练习题与对照实验都经 `npm run calibrate`，所以都在内；真网冒烟自报「必要」，照常跑。不做时 GLM 子 agent 的工具调用、派 GLM 子 agent 的调用与自报花 GLM 积分的两个脚本都排队；主 Agent 自己的工具调用、回话和 goal 任何一档都不排队不暂停。这些排队都是整块规则板的执行，自举开始之后才有；最小一片只交档位与上限的数。M6 不加任何排队或拦截规则。
- 脚本自查（M6-R3，§7.2）：按规则板 0.10 §9.4 的库入口 `checkCall(call, options)`；`gateOnRules` 每次判定前现算 `signals: {'glm-peak': …}`，高峰里另给这一段的结束时刻 `peakUntil`，`--wait` 的重判给 `waitedMs`，并带上调用点写死的 `glmSpend`。每一次判定的指标事件由 `checkCall` 写（编排方裁定），`gateOnRules` 不写。DSH 里人设规则的排队与唤醒文字写出高峰结束的时刻（M6-R2）。项目状态读仓库根的 `docs/rules/` 与 `.llm/rules/`（`d-rules-in-repo`）；`checkCall` 命中人同意过的拦路脚本时会多等（默认 10 秒，每条至多 30 秒），超时按条目的做法判、不在后台接着跑（`d-boards-as-hooks`、`d-script-timeout`，rules:§9.4）。
- 循环板（§8）：GLM 包经计价服务交出四条默认条目的数据：高峰开始时提醒模型、看状态时读额度（这两条由 GLM 包自己执行，循环板只列出）；额度快用完时告诉人、登录失效时提醒重新登录（这两条由循环板执行，经主 Agent 转告人）。条目只能看（`d-defaults-readonly`）。高峰开始与结束时按档位收放活、高峰结束时叫醒闲着的主 Agent，是循环板上编排层自己的两条（编排方裁定）；高峰里只剩被挡的活时停住自动推进、高峰结束时 `resume-drive`，归 M7 与循环板。GLM 包对这几件只交高峰的计算，循环行照它推出高峰变化事件 `channel.peak-changed`，页面写明是 GLM 通道报的。
- 指标（§14）：额度读取、上游限额、登录被拒、高峰提醒四类事件交给指标流水，数由 harness 写；指标流水不在时不影响任何功能。脚本自查的判定事件由规则板的 `checkCall` 写。
- 契约（§5）：计价服务加三个可选成员：`quota`（额度与登录状态）、`peakHours`（时段说明）、`loopDefaults`（循环板条目）。旧的 GLM 包没有它们，读的一方各自降级。GLM 包另读规则板的服务 `glmHournessPeakMode`（契约归规则板，文件 `src/shared/peak-mode.ts` 与读取函数 `peakModeService` 已在 main），读不到就照今天的原文提醒。
- 只装一个包（§9）：只装编排层包时面板按 token 列，没有高峰行、额度与 GLM 条目；只装 GLM 包时 `/glm-status` 有高峰行、额度与预估，高峰提醒与今天逐字相同。
- 没有待人定的事项（§20）。替人定的事在 §19；最可能不对的是三处：少做档的那句措辞（它写「由主 Agent 挪」，免得正在做审查的子 agent 自己停下）、真网冒烟算「必要」，以及 `gateOnRules` 没有影子期（§7.2、§19：判定是规则板上人定的条目，不是新的判定，而宪章 0.7 对代码里的新门禁要求先影子），人可推翻。
- 实施（§16）：M6 的实现在自举开始之后由 DSH 里的主 Agent 做（`d-dogfood-scope`）。额度线（GLM 包）与面板线（编排层包）在公共契约之后并行；提醒线 R1 不再等规则板（档位的契约文件和最小一片的服务已在 main），要在规则行默认启用之前、也在整块规则板的每步提醒（规则板 R4）进入安装之前合入，否则那一段时间里模型会同时读到「不要推迟工作」与规则板那一行；缺口行随桌面版核对写一次；规则板线（S1–S3）等整块规则板的 R1–R4 合入，那是自举之后的事。循环板一侧没有 M6 的步：GLM 包的条目数据随额度线交付，执行由循环板的实现做。M6 不加新行。

## 0.1 人定与本稿的关系

0.2 的 D1（默认规则要不要也告诉模型）已由人回答，本稿没有待人定的事项（§20）。下表列出本稿依从的人定与它们落在哪里。

| 人定或特性 | 人的原话或要点 | 本稿怎样落 |
| --- | --- | --- |
| `d-peak-mode` | 「高峰继续提醒模型，但是加一个档位吧就是高峰模式，人可以选择无影响，少做，不做。要让主Agent知道现在是不是高峰，应该选哪个档位」；「默认少做，新手教程提醒用户就行了，只挪重活对的。少做或者慢做，减少并发数量，不做重活之类的」 | D1 关闭（§20）；提醒照旧，按档位换末句（§3.4）；分工（§3.3）；三档的验收（§1.4 第 15 条）；脚本自报（§7.2） |
| 编排方的接缝裁定（design-context「Seam rulings between designs」，2026-10-30，agent 定、可推翻） | 高峰提醒原文与各档措辞归 GLM 包（M6），M6 改写 `ORCHESTRATION.md` §11.4，规则板管档位并经服务交出，只装 GLM 包时提醒照今天的原文；脚本自查的判定事件由规则板的 `checkCall` 写，`gateOnRules` 不写；高峰结束时叫醒主 Agent 是循环板上编排层的条目（0.5：少做与不做两档都叫），GLM 包只给高峰变化事件与高峰的计算；高峰里只剩被挡的活时的轮次与 `resume-drive` 归 M7 与循环板 | §3.3、§3.4 与 §1.4 第 13 条（提醒）；§7.2、§14.1 与第 22 条（判定事件）；§8.3、§18（叫醒与 `resume-drive`） |
| `d-main-agent-peak-exempt` | 「主Agent应该不受高峰影响，随时回复的」 | 提醒的各档正文从不叫主 Agent 停下、等待或不回话，不做档只说 GLM 子 agent 与重活脚本（§3.4）；0.4 里「不做档拦 GLM 会话的工具调用」的说法（§0、§3.3、§3.4、§7.4、§9、§19）作废并改掉；验收第 13 条加不叫主 Agent 停下的断言，第 25 条在探针里从运行层面钉住主 Agent 没被拦 |
| `d-rules-in-repo`、`d-memory-scope` | 「一样进仓库和项目目录」「差不多都是进.llm，全局的似乎只剩下人设和登录信息之类的吧？」；关于人本人的记忆留全局，项目的经验进项目 | M6 自己的数据是整个账号的额度与用量，仍在用户级（额度流水、缺口文件，§4.5、§6.2；宪章 0.7 §9）；脚本自查读的规则状态、判定事件的写入口都按项目根（§7.2、§14.2）；M6 不存关于人的记忆，也没有项目经验 |
| `d-boards-as-hooks`、`d-script-timeout` | 「同意了直接运行就行」；拦路脚本超时先放行、接着跑完、晚到的「不行」马上告诉主 Agent，合入主干前的超时就挡住 | M6 不加规则、不写脚本条目；`gateOnRules` 经 `checkCall` 受人同意过的拦路脚本管，会多等，超时按条目的做法判（`checkCall` 不在后台接着跑），晚到的拦下只发生在 DSH 里的工具调用上、不是 M6 的事（§7.2） |
| `d-dogfood-scope`、`d-freeze-until-dogfood`、`d-alignment-rounds` | M6 的实现在自举之后交给 DSH 里的主 Agent；对齐轮不改已放行的设计 | §16 的实施者与先后；对规则板、循环板、M3、M7 的请求只写成批注（§18） |
| `d-agent-examples` | 主 Agent 要写的每种东西各配一道示范，放在写它的工具说明里 | M6 不加工具，也不加主 Agent 写给人或交给 harness 的东西；给模型的文字（高峰提醒、循环板的 `tell`）是 harness 自己的话，不是主 Agent 写的，所以不需要示范。§7.3 的两条规则只是测试夹具，写成规则板 0.10 的形状，L2 把它们交给规则板的校验，规则一改夹具跟着失败 |
| `d-defaults-readonly` | 插件带来的默认条目只能看，档位照旧能选（「档位当然能选。」） | §8 的四条 GLM 条目只读；档位不在 M6 |
| `d-rules-visible` | 「项目所有规则确实应该都在明面上」 | 能挡住动作的只有规则板上的条目，M6 不加门；脚本自查本身不带规则（§7.2）；GLM 包会自己去做的事列在循环板上（§8） |
| 循环板（特性 `schedules`） | GLM 插件自带的高峰开始与结束、额度快用完、登录过期做成循环板的默认条目，不写死在代码里 | §8；高峰开始与结束两条是循环板上编排层的条目，GLM 包只交高峰的计算（§8.3） |
| `d-chat-not-cards` | 问人改成聊天：一个方案，背景、推荐、疑问、不做四行，各成一段，每行的重点几个字加粗 | 本稿没有要问的；以后要问时照这个写（§20）；放行稿末尾的一件按这个写（`onepage.md`） |
| `d-zcode-3171` | 「你就彻底都换成新版zcode，工程环境声明那个照旧」 | 全部 ZCode 证据按 3.17.1 复核（§4.1、§10）；`AGENTS.md` 的基线条款由 `zcode-3171-follow` 改，M6 不改它；0.5 重核：安装包仍是 3.17.1、MD5 未变，pristine 副本里没有本地峰谷与额度代码（§4.1）；逐字文本只认 pristine 副本，安装包只作机制参考（`AGENTS.md` 基线） |
| `metrics` | 「指标能全记就全记下」 | §14.2 |
| `d-design-onepage` | 模块设计过评审之后给人一页人话放行稿 | `onepage.md` |

## 1. 需求

### 1.1 要解决的问题

1. 人看不到额度：5 小时窗口还剩多少、周额度用了几成、照现在的速度什么时候用完。本地用量流水只看得到经 DSH 发出的请求，同一账号在 ZCode 等客户端的消耗看不到，本地算出的剩余量会偏高（`ORCHESTRATION.md` §11.3）。
2. 面板不说自己的覆盖范围：2026-10-29 从用户级流水删掉了 806 条旧 pi-ai `glm` 路由的记录（`DESIGN.md` §2.4），面板与晨报从此不计那段时期的消耗，输出里看不出来。
3. 晨报的「用量」一节按 token 列，面板按积分列，同一个命令里两种口径（`src/workflow/morning-report.ts` `usageByModel`、`src/report/panel.ts` `usagePanel`）。
4. 人定了高峰模式、默认少做（`d-peak-mode`）。今天 GLM 包的高峰提醒末句叫模型「不要暂停或推迟工作」，规则板让档位生效之后，这句与少做、不做两档相反；Kiro 里跑的练习题、对照实验与真网冒烟不经过规则板的门，少做管不到它们；排队与唤醒的文字说不出高峰几点结束。
5. 额度快用完、登录失效时没有谁提前告诉人：人只能在请求失败之后看到错误。人要的是这类反应做成循环板上看得见的默认条目，不写死在代码里。
6. 系统看得到的数（额度读取成败、上游限额、登录被拒、高峰提醒）没有进统一的指标流水（`metrics`）。

### 1.2 功能需求

- F1 积分口径：保持 M6.1 的公式与峰谷修正；晨报的「用量」一节与面板用同一个计价函数。
- F2 高峰行：面板与 `/glm-status` 写此刻是否高峰与下一次变化的时刻。
- F3 覆盖与缺口：面板写明用量流水的条数、最早一条的时刻、只含经 DSH 发出的请求；缺口文件里的每条缺口一行；报告期开始于缺口之前时，那一期的「用量」一节也写这一行。
- F4 额度取数：GLM 包照 3.17.1 读额度接口，解析 5 小时窗口、周额度与 MCP 工具调用窗口的已用比例与重置时刻；读数与失败写进额度流水。
- F5 上游限额错误：模型请求返回 1308、1310、1316–1321 时，通道记下错误码与能解析出的恢复时刻，额度一节写「已用完」。
- F6 预估耗尽：按 §4.7 给出用完的时刻或重置时的比例，写明依据。
- F7 高峰提醒：照旧提醒模型；末句按规则板交出的档位选，读不到档位时与今天逐字相同；提醒里的时段与结束时刻取自积分规则所在的文件；`docs/ORCHESTRATION.md` §11.4 随之改写（§3.4）。
- F8 高峰的计算：`nextPeakChange` 与时段说明 `peakHours` 给规则板、面板与循环板共用；循环板照它推出高峰变化事件（§5、§8.3）。
- F9 错峰与脚本自查：排队、每步提醒与唤醒的文字写出高峰结束的时刻（M6-R2）；仓库脚本启动前按项目规则与高峰模式自查，带自报的 `glmSpend`、高峰的结束时刻与已等的时长（M6-R3）。
- F10 登录状态：GLM 包判出「登录被拒」并经计价服务交出（§4.9）。
- F11 循环板条目：GLM 包把自己的四条默认条目作为数据交给循环板（§8）。
- F12 指标：§14.2 的四类事件交给指标流水。
- F13 只装一个包时各自照常工作（§9）。

### 1.3 非功能需求

- 额度读数不拖慢命令：命令等额度至多 3 秒，超时用上一次读数，读取在后台继续。
- 额度接口的请求：每个 `glm-login` 行实例每 60 秒至多一次；只在有人调用 `quota()` 时发（命令，或循环板在 GLM 有新用量记录之后至多每 15 分钟一次）；GLM 包没有定时器。
- 凭证（项目令牌、OAuth 令牌、API Key）不进额度流水、命令输出、控制台与指标事件。
- 不加运行时依赖，不加插件行，不改用户 profile。
- 激活期不抛错，降级经行健康与控制台上报（`AGENTS.md`）。

### 1.4 验收条件

每条后面写实现所在的节与验证层级。L2 用假宿主 `tests/fake-rc3.ts` 与注入的 fetch、时钟、文件系统；L3 用 `npm run probe`；L4 在桌面版里看。

1. 积分口径不退：`tests/credits.spec.ts`、`tests/hourness.spec.ts` 现有用例照常通过；标定基线 12 次运行用 `credits.ts` 重算，积分与当时记录相同（§2；L2）。
2. 同一口径：`/hourness` 的「用量（今天）」一节与「面板」一节对同一批记录（夹具全部在今天、时刻都能解析）给出逐项相同的每模型调用次数、积分、高峰占比与缓存命中率；没有计价服务时两节都按 token 列，各有一行写明没有计价服务；口径说明（`basis`）只在面板一节出现（§6.1、§6.3；L2）。
3. 高峰行：有计价服务时，面板第一行与 `/glm-status` 的高峰行在以下时刻（UTC+8，测试给 `formatMoment` 注入偏移 +480 分钟，与跑测试的机器的时区无关）分别写：周三 13:59「不是高峰；下一个高峰 14:00」；周三 14:00 与 17:59「高峰中，到 18:00」；周三 18:00「不是高峰；下一个高峰 明天 14:00」；周五 18:00「…下一个高峰 周一 14:00」；周六 15:00「不是高峰；下一个高峰 周一 14:00」。没有计价服务时面板没有这一行（§4.8、§6.1；L2）。
4. 覆盖与缺口：面板的「范围」一行写出可读记录条数与最早一条的时刻，并写「只含经 DSH 发出的请求」；缺口文件里每条合法记录一行（日期、条数、理由）；不合法的缺口行计为「无法读取的缺口记录 N 条」；报告期开始早于某条缺口的 `at` 时，那一期的「用量」一节带这一行，否则不带（§6.2；L2）。G1 写入之后，桌面版 `/hourness` 显示 2026-10-29 删去 806 条的那一行（L4）。
5. 额度请求的形态：已登录的 coding-plan 凭证下，`/glm-status` 发出且只发出一个 `GET https://bigmodel.cn/api/monitor/usage/quota/limit`。交给 fetch 的请求头恰好两个：`authorization`，值是适配器的项目令牌原样（不加 `Bearer `）；`x-request-id`，值是一个 UUID（8-4-4-4-12 位十六进制），两次读取的值不同。超时 15 秒；未登录不发请求。`glm-login` 行配置 `plan: start-plan` 时（行配置，不看 `glm-llm` 行），凭证行写「套餐 start-plan」，额度一节写「额度：体验套餐没有 5 小时与周额度」，注入的 fetch 没有收到任何请求（包括铸造项目令牌的请求）；`Config` 解析 `{home, plan}` 时两个键都保留（§4.2；L2）。
6. 读取频率：60 秒内两次读取只发一个请求（命令与 `quota({waitMs: 0})` 都算）；并发的两次共用一个进行中的请求；额度流水里出现比缓存新的上游限额记录时，下一次读取不用缓存；`quota({read: false})` 不发请求，只返回缓存或流水末尾的最近读数与登录状态；没有命令、也没有调用方调 `quota()` 时，注入时钟走过 1 小时 GLM 包不发任何请求（§4.4；L2）。
7. 命令不被拖慢：额度请求一直不返回时，`/glm-status` 与 `/hourness` 在 3.5 秒内返回，额度一节用上一次读数并写「正在读取，稍后再看」；请求返回后的下一次命令显示新读数（§4.4；L2）。
8. 失败要出声：未登录、项目令牌拿不到、网络错误、15 秒超时、HTTP 非 2xx、信封不成功、数据形状认不出、响应超过 256 KiB，各自在额度一节写一行原因与上一次成功读数的时刻；命令不报错；`glm-login` 行健康的说明带「额度：读不到（原因）」；控制台每种原因只告警一次；额度流水里同一原因 10 分钟内只记一条。HTTP 401 写「额度：令牌被拒（401）」，同一次读取不重发；下一次读取用同一个缓存的令牌，不带被拒指纹，注入的 fetch 没有收到 `POST …/access_tokens`（照 3.17.1，§4.2、§13；L2）。
9. 解析与命名：按 §4.3 的规则，用这些夹具得到预期的窗口名与数值：zcode-api 2026-10-12 实测的三行形态（5 小时 `TOKENS_LIMIT`、MCP `TIME_LIMIT`、每周 `TOKENS_LIMIT`）；`nextResetTime` 为秒与为毫秒；两行 `TOKENS_LIMIT` 都在 5 小时内重置；`percentage` 为 130（按 100 保留，显示「已用完」）、为 −5 与 `NaN`（丢掉这个字段）；未知 `type`；超过 32 行；没有数值字段的行（§4.3；L2）。
10. 预估：§4.7 的算例逐项相等（跨 18:00 的峰谷修正、用完早于重置、到重置时的比例、已用完、没有消耗、没有重置时刻、两次读数之间比例下降即窗口已重置）（§4.7；L2）。
11. 上游限额：通道收到 HTTP 429、信封错误码 1308 的模型响应时，在额度流水里追加一条上游限额记录；`/glm-status` 写「已用完（服务端 1308）」，消息里解析得到时刻时加「预计 HH:MM 恢复」；1302、1313 等不记（§4.6；L2）。
12. 凭证不外泄：额度流水（含 `login-rejected` 记录）、命令输出、控制台与交给指标服务的事件里不出现注入的项目令牌字符串；`npm run check:secrets` 通过（§4.5、§12；L2）。
13. 高峰提醒按档位（`d-peak-mode`、`d-main-agent-peak-exempt`、编排方裁定，§3.4）。L2 在 `tests/reminder-wiring.spec.ts`，假宿主上提供或不提供服务 `glmHournessPeakMode`（假服务的形状取自 `src/shared/peak-mode.ts` 的 `PeakModeService`，返回的状态由 `peakModeState` 造，不另造字段）：
    - 读不到档位时正文与今天逐字相同：`PEAK_REMINDER_TEXT` 等于从 main `480e264` 的 `src/glm-prompt/peak-reminder.ts`:28 抄下的字面量。五种读不到的情形都发它，`source.peakModeNote` 分别是：没有这个服务（`no-service`）；`stateFor` 返回 `undefined`（`no-state`）；返回的 `peak` 为 `false` 或 `undefined`（`not-peak`）；服务形状不对、`stateFor` 抛错、返回的 `level` 或 `origin` 不在取值表里（`invalid`，告警一次）。今天的高峰用例与探针的平移时钟核对照常通过。
    - `glmWorkerCap` 不是正的安全整数（缺、0、负数、小数、字符串）时按没有这个上限算，正文去掉上限那半句，`source.peakWorkerCap` 不写，也不算 `invalid`；`level` 为 `inform` 或 `stop` 时即使服务给了 `glmWorkerCap` 也不写上限。
    - 无影响（`{level: 'inform', origin: 'human'}`）：正文同上。
    - 少做：出厂默认（`origin: 'default'`，`glmWorkerCap: 1`）时正文等于 §3.4 表里的少做原文，含「Peak mode: reduce (the default; the human can change it).」与「run at most 1 GLM subagent at a time」；人设的含「Peak mode set by the human: reduce.」；`glmWorkerCap` 为 2 时写「2 GLM subagents」，没有这个字段时整半句「run at most … at a time and 」不写，其余不变。不做（`origin: 'human'`）时正文等于不做原文。
    - 少做与不做的正文都不含 `information only`、`keep working`、`pause`、`postpone`，都以「Do not switch models or plans unless the user asks.」结尾；各档正文的前两句与今天相同，由 `credits.ts` 的 `PEAK_HOURS.en`、`PEAK_END_LABEL` 拼成。主 Agent 不受管（`d-main-agent-peak-exempt`）：不做的正文含「The main agent is not held on any level: it keeps answering the human and working.」，不含 `defers the tool calls`、`tells you when to continue`；任何一档的正文都没有一句把主 Agent 自己的工具调用、回话或 goal 说成会被推迟、排队或暂停（逐字相等加这几个禁用片段，防以后改字时带回）。
    - notice 的 `source` 带 `peakMode`（`none`、`inform`、`reduce`、`stop`）、有档位时的 `peakModeOrigin`、正文写了上限时的 `peakWorkerCap`（数）、读不到时的 `peakModeNote`，正文等于 `peakReminderText` 按前两项算出的那一段。服务只在要发提醒的那一步读一次（假服务记下调用：一段高峰里一个会话一次）；同一段高峰里档位改了不再提醒（仍按 `source.peakWindow` 判）。
    - `creditPricing.basis` 由 `PEAK_HOURS.zh` 拼成，与今天逐字相同；`creditPricing.peakHours` 就是 `PEAK_HOURS`。
    - L3（R1，规则板最小一片已在 main，§16 R1）：探针场景 `rules-peak`（规则行由覆盖层启用，GLM 路由，探针时钟周三 15:00 UTC+8，出厂档位）里，第一个 GLM 请求带恰好一条来源 `glm-peak-reminder` 的 notice，正文是少做原文（出厂默认，含「at most 1 GLM subagent」）；之后两步 `/rules peak 不做`、`/rules peak 无影响` 改了档位，后面的请求仍只带这一条（同一段高峰不重发）。规则行没启用的 `peak` 与 `glm-only` 场景里，notice 仍是 `PEAK_NOTICE`（今天的原文）。
    - L3（S3，整块规则板合入之后）：少做档（出厂默认）、注入时钟周三 15:00、两包都装时，GLM 主 Agent 那一步的请求里来源 `glm-peak-reminder` 的 notice 是少做原文，来源 `hourness-rules` 的 notice 也在；后者不含 `keep working`、`postpone`，也不含 `PEAK_REMINDER_TEXT` 的任何一句，前者不含 `information only`、`keep working`、`postpone`（规则板验收只看它自己那一段，这里在同一个请求里两段一起看）。两段里的档位句可以相同（§3.4 最后一条理由）。第 19 条只装 GLM 包的组合里，notice 仍是 `PEAK_REMINDER_TEXT`。
14. 默认规则里 M6 的部分（整块规则板合入后）：`GLM_PEAK_PRICING.toldBy` 为 `glm-prompt`；规则页的默认规则一行写「告诉模型：glm-prompt 行的高峰提醒」；`rules_show` 的默认规则一行带「The GLM package's peak reminder tells you this.」；规则页、`/glm-status`、`/hourness` 与规则板每步提醒里的「到几点」「下一次几点」对同一个注入时刻相同（都来自 `nextPeakChange`）；计价服务带 `peakHours` 时，规则板英文文字里的时段说明是 `peakHours.en`，规则页中文里的是 `peakHours.zh`（§18 M6-R6）。默认规则的其余部分（规则页列出它、不能解除、只装编排层包时读不出、档位与主 Agent 的那一行、档位的服务）是规则板验收里写这几件的几条（0.10 §1.4，编号以 0.10 为准），由规则板的节点关（§3；L2）。
15. 按档位（`d-peak-mode`；整块规则板的 R1、R3 合入后）。`tests/rules-gate.spec.ts` 用规则板 R3 的真实 `checkCall`，项目是一个临时 git 仓库（`gateOnRules` 的 `projectRoot` 注入，档位状态由规则板的引擎以人的身份写进去，`d-rules-in-repo`），注入时钟，`peakAt` 为 `creditPricing.peak`：
    - 无影响（项目状态里 `peakMode.level` 为 `inform`）且没有人设的规则：周三 15:00 与 19:00，`npm run calibrate` 与 `npm run smoke:authorized` 的自查都是退出码 0、标准错误为空。
    - 少做（项目从没设过档位，也就是出厂默认）：周三 15:00 `npm run calibrate` 在建沙盒与发出任何请求之前以退出码 5 结束；标准错误先是 `CheckResult.text` 原文（规则板 R3 的 `checkCall` 按 rules:§6.4 脚本自查一段渲染），其中有 `builtin:glm-peak-reduce`、「Peak mode: reduce (the default; the human can change it).」与「until 18:00」（时刻来自 `gateOnRules` 给的 `peakUntil`）；19:00 退出码 0；`smoke:authorized` 两个时刻都是退出码 0。人设过少做时那一句是「Peak mode set by the human at <YYYY-MM-DD HH:MM>: reduce.」。DSH 里 agent 的工具调用在两个时刻判定相同（规则板验收，由规则板的节点关）。
    - 不做（`peakMode.level` 为 `stop`）：周三 15:00 两个脚本都以退出码 5 结束，标准错误有 `builtin:glm-peak-stop-scripts`（不做档里管脚本的那一条，rules:§3.6）与「Peak mode set by the human at <YYYY-MM-DD HH:MM>: stop.」；19:00 都是退出码 0。
    - 周六 15:00 三档都是退出码 0。读不出是不是高峰（`peakAt` 抛错，也没有活的宿主心跳）时三档都是退出码 0，标准错误一行写读不出的原因（取自 `CheckResult.signals`）。
16. 脚本自查的输出与等待（§7.2 第 2 条；规则板 R3 合入后）：以 §7.3 第一条人设规则为夹具、档位无影响，周三 15:00 `npm run calibrate` 以退出码 5 结束，标准错误先是 `CheckResult.text` 原文，再一行「rules gate: r-offpeak-credit-runs queues this run; GLM peak ends at 18:00. Rerun with --wait to wait.」；带 `--wait` 时注入的睡眠函数收到的时长等于到 18:00:01 的毫秒数，之后重判放行、照常开始，`--wait` 不传给脚本自己的参数解析。人设规则不引用 `glm-peak`（夹具：开关 `code-freeze` 为开）时，标准错误不写时刻，`--wait` 每 60 秒重判一次、至多 8 小时，每次重算 `signals`。拦截规则：退出码 4，标准错误是四段式拒绝文字。规则板一侧（M6-R2，规则板 R4 合入后）：同一条规则在 DSH 里排队时，排队文字的 Boundary 段写「glm-peak is true until 18:00」，每步提醒的等待单一项写「, until 18:00」；18:00 之后规则板按自己的重判唤醒原来的 agent（rules:§6.3，每 5 秒；规则板验收里的 30 秒内（rules:§1.4 第 4 条）），唤醒文字写「Ticket q-<n> cleared: glm-peak ended at 18:00.」；没有计价服务时文字里没有时刻（§7.2 第 1 条；L2、L3）。
17. 脚本自查的失败放行：规则库的编译产物导入失败（没有 build、规则板未合入），或 `checkCall` 抛 `RulesCheckError`：标准错误一行「rules gate: rules board not available (<消息前 80 字符>); starting without the check」，照常开始。`glmSpend` 只由调用点给：命令行里带 `--glm-spend` 不改变它（`run-calibrate.mjs` 的 `parseArgs` 照旧把它当未知参数报错）（§7.2；L2）。
18. 不设预算：M6 不在 `tools/pre-execute`、`agent/pre-step` 上注册新监听器（高峰提醒用的 `agent/pre-step` 接缝今天已有）；M6 不加任何排队或拦截规则；额度的数值只经循环板「额度快用完」那一条进模型请求（§8，一句给主 Agent、叫它转告人的话），没有循环板时任何请求正文里都没有额度一节的文字；没有代码按额度或积分拦截、推迟、限速、换模型或换套餐（§7.4；L2、L3）。
19. 两包组合（L3）：只装编排层包时，`/hourness` 按 token 列，没有高峰行、额度一节与 GLM 条目，没有告警；只装 GLM 包时，`/glm-status` 有高峰行与「额度：未登录」，整次运行没有发往 `/api/monitor` 的请求；两包都装时，`/hourness` 有额度一节「未登录」（§9；L3）。
20. 登录状态（§4.9；L2）：`quota({read: false})` 返回的 `login.state`：没有凭证文件、凭证文件为空（`/glm-logout` 之后，`store.ts`:185–191 的 `clearCredential` 写空串）或读不出时为 `absent`；有凭证、没有登录被拒的记录时为 `ok`。模型请求在强制重铸之后的重试仍被拒（注入的 fetch 对两次模型请求都回 401 加项目令牌被拒的正文）后为 `rejected`，额度流水有一条 `login-rejected`，`since` 是那一刻，`login` 是登录令牌指纹（16 位十六进制，不是令牌本身）；铸造或定位时 PAT 平面回 401 或 403（抛 `project_token_http_401`、`project_token_http_403`）同样为 `rejected`；`project_token_network_error`、`project_token_timeout`、`project_token_http_429`、`project_token_http_503` 不算。之后：项目位置记录写回凭证文件（修改时刻变了、登录令牌没变）时仍是 `rejected`；重新登录（登录令牌变了）时回到 `ok`；`/glm-logout` 之后为 `absent`；有一次成功的额度读数也回到 `ok`。同一路径 10 分钟内只记一条。60 次 `read: false` 之间凭证文件没变时，凭证只解密一次（注入的文件系统记下读取次数）。
21. 循环板的 GLM 条目（GLM 包一侧，§8；L2）：计价服务的 `loopDefaults` 恰好四条，id 为 `glm:peak-reminder`、`glm:quota-on-command`、`glm:quota-low`、`glm:login-rejected`，各自的 `when`、`runBy`、`title`、`why` 与 §8.2 的表逐字相同；`tell` 只在 `runBy` 为 `loop-board` 的两条上有。`quotaLowOf(view, {usedPercent: 80, exhaustsWithinMinutes: 60}, now)` 对 5 小时窗口 79%、没有预估时返回 `undefined`；80% 时返回这个窗口；79% 但预计 50 分钟内用完时返回这个窗口；预计 70 分钟后用完时返回 `undefined`；MCP 窗口 95% 时返回 `undefined`。循环板怎样列出与执行这四条，是循环板设计的验收（§18 的 M6-L1 到 M6-L4）。
22. 指标（指标流水合入之后）：每次额度读取、每条上游限额记录、每条登录被拒记录、每条高峰提醒，各交给指标流水一条事件（字段见 §14.2），事件里没有令牌与请求头；指标服务不在时什么都不交，不告警（L2，用一个假的指标服务）。脚本自查的判定事件由规则板的 `checkCall` 写（编排方裁定，规则板验收第 13 条：每一次 `checkCall` 恰好一条 `rules.check`），M6 这边钉的是交给 `checkCall` 的选项与判定的次数（`tests/rules-gate.spec.ts`；`checkModule` 指向一个记下每次调用选项的假规则库，前两次答排队、第三次答放行，`CheckResult.signals` 照收到的 `signals` 回；注入时钟从周三 17:58:30.000 起，睡眠函数把时钟往前拨）：带 `--wait` 时 `checkCall` 恰好被调 3 次（17:58:30、18:00:01、18:01:01），也就是恰好 3 次判定、3 条 `rules.check`；第一次的选项带 `signals: {'glm-peak': true}` 与 `peakUntil`（`nextPeakChange` 算出的 18:00，ISO 8601 串），不带 `waitedMs`；第二、三次带 `signals: {'glm-peak': false}`，不带 `peakUntil`，`waitedMs` 分别为 91,000 与 151,000；`peakAt` 抛错的一例里那一次既不带 `signals` 也不带 `peakUntil`。另外，`scripts/rules-gate.mjs` 不导入任何指标出口、自己不写判定事件（静态检查）。规则板 R3 合入之后，同一组用例对真的 `checkCall` 与一个假的指标写入口再跑一遍，写入口恰好收到 3 条 `rules.check`。
23. 真机（L4，核实用的读取已预先授权，不花积分）：桌面版里一次真实读取，把返回的行（`type`、有哪些字段、离重置的时长、`level`）记进 `docs/FACTS.md` §2.4，按它确认或改正 §4.3 的命名；`/hourness` 显示高峰行、范围、额度一节；桌面版日志没有本包的新错误（§15；L4）。
24. 脚本自查与人同意过的拦路脚本（`d-boards-as-hooks`、`d-script-timeout`；整块规则板 R3 合入后，L2，`tests/rules-gate.spec.ts`）：规则板的真实 `checkCall` 配一条人同意过的拦路脚本规则（夹具照规则板 0.10 §6.7 的写法，注入假执行器 `runScript`）：脚本退出 2 拦下时，`gateOnRules` 的退出码是 4，标准错误是 `CheckResult.text` 原文（含「ran its script」与脚本的理由），不再另加一行；脚本退出 3（排队）时退出码 5，`--wait` 下不引用 `glm-peak` 的规则每 60 秒重判一次，每次重判都再跑一次脚本（假执行器记下的次数等于 `checkCall` 的判定次数）；脚本超时而条目写放行时 `CheckResult` 放行、退出码 0，`gateOnRules` 自己不设超时、不另起后台进程；脚本超时而条目写拦下时退出码 4。`gateOnRules` 的源码不含 `child_process`（静态检查）：脚本只由 `checkCall` 经共用的执行器跑。
25. 主 Agent 不被高峰模式管（`d-main-agent-peak-exempt`；规则板最小一片已在 main，L3）：探针新场景 `rules-peak-stop`（同 `rules-peak` 的 GLM 路由与周三 15:00 时钟；运行前把项目的档位设成不做，探针建工作区时用规则板的引擎、身份 `human`）：第一个 GLM 请求带不做原文，且满足第 13 条的不叫主 Agent 停下的断言；这一步里主 Agent 的 `Read` 照常执行、回话照常产生（同 `rules-peak` 现有检查「主 Agent 在任何一档都不被拦」的做法）。最小一片没有排队，所以这一条钉的是提醒的正文与主 Agent 没被拦；整块规则板合入后，规则板自己的验收钉不做档下主 Agent 的工具调用不排队，M6 不重复。

### 1.5 让人少做了什么（question-27 B）

- 今天：想知道额度要去 BigModel 控制台或 ZCode 的用量页；面板的数字为什么比控制台少，要人记得删过记录、记得 ZCode 也在用；额度用完或登录失效时，人在一串失败的请求之后才知道。
- 之后：敲一次 `/glm-status` 或 `/hourness`，额度、重置时刻与预估都在，覆盖范围与缺口写在同一屏；额度快用完、登录失效时，主 Agent 在下一次回话里说一句。高峰时练习题与对照实验在开始之前就停下，写明 18 点以后再跑，带 `--wait` 就自己等到 18 点（默认少做），人不用盯着时间。
- 不增加的：M6 不新增任何要人定期点的东西，不问人任何事；循环板上的 GLM 条目只能看。

### 1.6 不做的事

- 服务端积分明细（`/api/monitor/credit-usage/usage-detail`、`activity`、`model-usage` 等，zcode-parity 报告 §3.1）：用户已定加成与扣减「看不出来，按代码级别一样就行」（`DESIGN.md` §4.8），本地积分照公式估算，不与服务端对账。
- MCP 余额的独立接口（3.17.1 `fetchMcpQuota`，与额度读取并列，host:+1361889 一带）与本地 MCP 积分（每次 1.2，不在用量流水里）。额度接口里若有 MCP 工具调用窗口，照常显示。
- 积分余额（start-plan 的 `zcode-plan/billing/balance`，`zcode-api:server/routes-quota.ts`:178–187）：用户是 coding-plan。
- 团队套餐（`bigmodel-organization`、`bigmodel-project` 头与 `?type=2`，host:+1374857）。
- 读额度前的订阅核验（`/api/biz/subscription/list`，3.17.1 `$D` host:+1349039）。
- GLM 包里的定时器；节假日日历（高峰只按 `FACTS.md` §2.4 的周一至周五）。
- 按额度或积分自动拦截、推迟、换模型或换套餐；任何预算或上限（`ORCHESTRATION.md` §4.3「花费只披露」）。M6 不加排队规则；高峰模式的设定与执行归规则板（rules:§3.6）。
- 在场检测、CPU 与内存限速、默认预算、Job Object、沙盒租约：人已说明它们只是例子（§3.1），规则板也移到了它的附录 A，不是 M6 的依赖。
- 3.17.1 对 start-plan 用套餐 JWT 读额度（`resolveCurrent` 对 start-plan 返回 `zcodeJwtToken`，host:+1278678）：本包对 start-plan 不读，体验套餐没有 5 小时与周额度（`FACTS.md` §2.3、§2.4），记为已知差异（§17）。
- ZCode 的服务端错峰协议（`x-off-peak-ticket-id`、429/3105、3102、闲时任务工具 `OffPeakCreate`，`FACTS.md` §1、规则板评审 F49）：那是账号请求的另一种 mode 与服务端空闲算力上的闲时任务，用它要改模型请求的形态，也等于替人选套餐模式（`CHARTER.md` §6）。
- 新手教程里讲高峰模式的那一句：归上手页与规则页（rules:§9.1 的 `peakModeIntro`，上手页第 4 块归 plain-ui），M6 不写。
- 少做档的「减少并发」：上限的数归规则板（`PEAK_REDUCE_GLM_WORKERS`，经 `stateFor` 交出），M7 在派活处读（编排方裁定），M6 不写。
- 按高峰档位暂停、排队或推迟主 Agent 自己的工具调用、回话或 goal：不是 M6 的，也不是任何模块的（`d-main-agent-peak-exempt`）；0.4 里「不做档拦 GLM 会话的工具调用」的说法作废，现在只有 GLM 子 agent 的调用、派 GLM 子 agent 的调用与自报花 GLM 积分的脚本被排队（rules:§3.6）。
- 高峰结束时叫醒闲着的主 Agent：循环板上编排层的条目 `loops.peak-end`；高峰里主 Agent 只剩被挡的活时那几轮不算空转、停住自动推进、高峰结束时 `resume-drive`：M7 与循环板（编排方裁定，rules:§3.6）。M6 对这几件只交高峰的计算（§8.3）。
- GLM pill 上的高峰角标（随 M8 的界面设计）；派发按任务紧急程度排队（随 M7，§7.5）；巡检的定时（循环板）。

## 2. 现状（M6.1 已做的部分）〔实读，main `419b6ea`；与 0.4 读的 `480e264` 相比，下表只有「高峰模式的服务」一行是新的，「标定与探针」一行改了行号〕

| 部分 | 在哪 | 做什么 |
| --- | --- | --- |
| 积分公式与峰谷 | `src/glm-llm/credits.ts` | `CREDIT_RATES`（GLM-5.3 6.9 / 1.7 / 24，Flash 2.3 / 0.56 / 8）、`peakWindowAt`（周一至周五 14:00–18:00 UTC+8，按 UTC+8 判定）、`chargedCredits`（非高峰 × 0.5，常量 `OFF_PEAK_RATE` 未导出）、计价服务的值 `creditPricing`（冻结；`basis` 里写着「高峰为工作日 14:00–18:00（UTC+8）」） |
| 计价服务契约 | `src/shared/pricing.ts` | `PRICING_SERVICE = 'glmHournessPricing'`，成员 `basis`、`plan`、`charged`、`peak`；`pricingService(ctx, problem)` 只检查这四个成员，多出的成员不算形状不对 |
| 提供方 | `src/glm-llm/login-row.ts` | `glm-login` 行激活时 `ctx.provide(PRICING_SERVICE, creditPricing)`；失败时行健康为部分生效；构造 `ZcodeAdapter` 时只传 `home` 与 `fetchImpl` |
| 面板 | `src/report/panel.ts`、`src/report/index.ts` | `/hourness` 的「面板」一节：全部记录，按模型列积分、高峰占比、缓存命中率；没有计价服务时按 token 列；修正前与无法读取的记录只报条数 |
| 晨报 | `src/workflow/morning-report.ts` | `/hourness` 开头的晨报，本地日历日；「用量」一节按 token 列（`usageByModel`），不经计价服务 |
| 高峰提醒 | `src/glm-prompt/peak-reminder.ts`（`glm-prompt` 行；`src/glm-prompt/index.ts` 的 `installDialect` 第 232 行装上） | 每个高峰时段第一个 GLM 步追加一条 `<system-reminder>`，来源 `glm-peak-reminder`，`source.peakWindow` 记时段；正文 `PEAK_REMINDER_TEXT`（第 28 行）写死「weekdays 14:00-18:00 UTC+8」「Until 18:00」，末句「This is for your information only: keep working on the current task, and do not switch models or plans, or pause or postpone work, unless the user asks.」；文件头注释第 4–7 行写「Information only: the harness never switches models or plans and never blocks or postpones work; scheduling is the user's decision.」 |
| 高峰模式的服务（规则板最小一片，0.5 读） | `src/shared/peak-mode.ts`、`src/rules/peak.ts`、`src/rules/index.ts` | 规则行（`glm-hourness/rules`，补丁里 `disabled: true`）提供服务 `glmHournessPeakMode`：`stateFor(sessionId)` 与 `stateForProject(cwd)` 交 `PeakModeState`（`level`、`origin`、`at`、`peak`、`until`、`glmWorkerCap`），`peakHoldFor(sessionId)` 交 `{level, until}`；`peak` 与 `until` 来自计价服务的 `peak` 与 `nextPeakChange`，读不出时 `peak` 为 `undefined`；`glmWorkerCap` 只在高峰里的少做档有，值 1；只读内存与计价服务，不抛错；不拦、不排队、不暂停任何东西；GLM 包的提醒今天不读它 |
| PAT 平面的请求失败 | `src/glm-llm/auth/project-token.ts`:81–108、367–376（`8b12baf`） | 照 3.17.1 带上失败的种类：HTTP 状态 `project_token_http_<status>`（429、5xx 是暂时的失败，还在有效期内的令牌照用），网络 `project_token_network_error`，超时 `project_token_timeout`；登录令牌为空 `project_token_login_required`（:314） |
| 模型请求的 `x-request-id` | `src/glm-llm/zcode.ts`:436–437 | 每次尝试 `randomUUID()` |
| 模型请求的 401 | `src/glm-llm/zcode.ts`:455–469 | 照 ZCode 的 `AccountRequestRetry`：项目令牌被拒时带被拒指纹强制重铸一次、重试一次；仍失败时抛 `glm-zcode <status>: …` |
| 标定与探针 | `scripts/calibrate/run-calibrate.mjs`:27、`scripts/probe/run-probe.mjs`:53–54 | 直接导入 `packages/glm/dist/glm-llm/credits.js` 与 `packages/glm/dist/glm-prompt/peak-reminder.js` |

用户级用量流水在 2026-10-29T14:16Z（UTC+8 22:16）有 384 条，全部可读，最早 2026-10-27T09:30:22Z，最晚 2026-10-29T13:10:48Z；其中 GLM 记录（provider `glm-zcode`）87 条，最早 2026-10-28T02:43:33Z（只读计数；本稿示例里的条数都指这一刻）。2026-10-29 删掉的 806 条（`glm/glm-5.3` 796、`glm/glm-5.3-flash` 10）的起止时刻没有留下：改前备份已按用户要求删除（`DESIGN.md` §2.4）。

## 3. 默认规则、高峰提醒与高峰模式

### 3.1 人的两次决定

- 2026-10-29，对规则板的范围（编排方转述的原话）：「其余用电脑啊，llm限速啊默认额度啥的都只是我给你举的例子，没让你真加进我们项目里。唯一一个加进去的默认规则是峰谷定价的事情」。所以规则板出厂只带一条默认规则：峰谷定价。在场检测、CPU 或内存限速、默认预算都是例子。
- 2026-10-30，`d-peak-mode`（原话见 §0.1）：高峰继续提醒模型；另加人选的高峰模式，无影响、少做、不做三档；默认少做，新手教程告诉人；少做是「高峰时减少并发的 worker 数量，不做重活，例如练习题、消融、大的审查，必要的活照做」；不做是「高峰时不跑 GLM 的活，排队，高峰结束后自动接着做」；主 Agent 每一步都从 harness 的提醒里知道现在是不是高峰、人选的是哪一档，不靠模型自己算时间；设置与执行由规则板设计定，M6 只管提醒与高峰的计算。
- 2026-10-30，`d-main-agent-peak-exempt`（人：「主Agent应该不受高峰影响，随时回复的」）：高峰模式的三档都不管主 Agent 自己，它照常回话、照常用工具、照常和人商量，包括不做档的高峰里；高峰模式只管它派出去的子 agent（少做的并发上限，不做时排队）与自报的重活脚本（练习题、消融、大的审查）。规则板 0.9 在 `m6` 节点上请 M6：不做档下提醒不要对主 Agent 说「停下」。

时钟的事实（design-context 的 Peak mode and clock facts）：DSH 桌面版标准预设的会话每回合第一步、至多每 10 分钟收到一条带当前时刻的 `dsh-time-context` 消息，headless、沙盒与练习题的会话没有；ZCode 只给日期。所以高峰与时刻都由 harness 算，本稿不让模型从时钟推算。

### 3.2 默认规则（定义在规则板 0.10 §3.1）

本稿不重新定义，只摘与 M6 有关的字段：

| 字段 | 值（rules:§3.1） |
| --- | --- |
| id | `builtin:glm-peak-pricing` |
| 条件 | `{"signal": "glm-peak", "is": true}`；`glm-peak` 是宿主在判定时经 `pricingService(ctx)?.peak(now)` 当场算的信号（rules:§3.2） |
| 主体 | `filter.model: {"matches": "^[^/]*/glm"}`（0.8 写作 `subjects.models: ["*/glm*"]`）：调用方会话请求头的模型 id 以 `glm` 开头，与高峰提醒判 GLM 步的口径相同（`src/shared/route.ts` `isGlmModel`）；`when` 为 `rules.step`，动作 `inform`（rules:§3.1） |
| 动作、执行方式 | 无动作；只告知 |
| `toldBy` | `glm-prompt`：告诉模型的是 GLM 包的高峰提醒（人 2026-10-30 定照旧提醒） |
| 附属条目 | 四条，`partOf: 'builtin:glm-peak-pricing'`，按档位启用（rules:§3.6）：少做 `builtin:glm-peak-reduce`（自报可挪的脚本排队）；不做 `builtin:glm-peak-stop-dispatch`（派 GLM 子 agent 的调用排队）、`builtin:glm-peak-stop`（GLM 子 agent 会话的工具调用排队）、`builtin:glm-peak-stop-scripts`（自报花 GLM 积分的脚本排队）。没有一条管主 Agent 自己的工具调用 |
| 时段与系数 | 计算只在 GLM 包的 `src/glm-llm/credits.ts`（`FACTS.md` §2.4）；给人与模型看的时段说明经计价服务的 `peakHours` 读（§5，M6-R6） |

### 3.3 谁管什么

| 事 | 谁 | 在哪 | M6 的部分 |
| --- | --- | --- | --- |
| 档位的存放、出厂默认少做、只有人能改 | 规则板 | rules:§3.6、§7.2 `ProjectState.peakMode`、`effectivePeakMode` | 无 |
| 把此刻的档位交给别的行 | 规则板 | 服务 `glmHournessPeakMode`，契约 `src/shared/peak-mode.ts`（rules:§7.2）；契约文件与服务都已在 main（最小一片：`stateFor`、`stateForProject`、`peakHoldFor`，规则行默认禁用） | GLM 包的 `glm-prompt` 行在发提醒的那一步读一次 `stateFor(sessionId)`（§3.4） |
| 少做与不做在执行边界上的判定 | 规则板（四条附属条目，整块规则板，自举之后） | rules:§3.6、§2.3 的「任何工具」（只给不做档里 GLM 子 agent 的会话）、「派发」「自报花 GLM 积分的脚本」三类 | `glm-peak` 的值来自计价服务的 `peak`；仓库脚本自报 `glmSpend`（M6-R3，§7.2） |
| 主 Agent 每步提醒里的高峰与档位一行 | 规则板（整块规则板；最小一片没有这一行） | rules:§6.4 | 「到几点」「下一次几点」用 `nextPeakChange`；时段说明用 `peakHours`（M6-R6，规则板 0.10 已照做） |
| 主 Agent 不受高峰模式管 | 规则板（三档都不暂停主 Agent 的 goal、不拦它自己的工具调用；最小一片的行不注册工具调用门、不动每步的消息） | rules:§3.6、`docs/ORCHESTRATION.md` §16.1 | 提醒的正文从不叫主 Agent 停下、等待或不回话（§3.4） |
| 少做的「减少并发」 | 规则板定上限的数（`PEAK_REDUCE_GLM_WORKERS`，经 `stateFor` 的 `glmWorkerCap` 交出），M7 在派活处读 | rules:§3.6，编排方裁定 | 无 |
| 高峰里只剩被挡的活时那几轮不算空转、停住自动推进；高峰结束时 `resume-drive` 并叫醒主 Agent | M7（空转判定与 `resume-drive`）与循环板上编排层的条目 `loops.peak-end` | rules:§3.6、§10.7；循环板 §3.4、§6.9 | 只交高峰的计算（§8.3） |
| 新手教程里讲档位、默认少做、在哪里改 | 上手页与规则页 | rules:§9.1 `peakModeIntro`；plain-ui 的上手页 | 无 |
| GLM 会话的高峰提醒：原文、各档的措辞、`ORCHESTRATION.md` §11.4 | GLM 包的 `glm-prompt` 行（M6） | `src/glm-prompt/peak-reminder.ts`，编排方裁定 | 全部（§3.4）；规则板的任何一步不改这几处（rules:§3.5、§10.6） |
| 高峰的计算 | GLM 包 `credits.ts`；公共库 `src/shared/pricing.ts` | §5 | `peakWindowAt`、`creditPricing.peak`、`rateShareAt`、`PEAK_HOURS` 与 `peakHours`；`nextPeakChange` 已在 main，M6 只用不加 |
| 仓库脚本启动前的自查 | M6 调用，规则板判定并写判定事件 | `scripts/rules-gate.mjs`；`checkCall`（rules:§9.4） | 命令文本、`signals`、`peakUntil`、`waitedMs`、`glmSpend`、`--wait` 与退出（§7.2）；判定事件不写（编排方裁定） |
| 给人看的高峰行 | M6 | `/glm-status`（`glm-login` 行）、`/hourness`（`hourness` 行） | 全部（§4.8、§6.1） |
| 循环板上的条目 | 循环板 | §8 | GLM 包交出四条条目的数据；高峰开始与结束两条是编排层的，GLM 包只交高峰的计算（§8.3） |

由此，「主 Agent 始终知道此刻是不是高峰、哪一档」由规则板交付；M6 保证三处（规则页、`/glm-status`、`/hourness`）与规则板每步提醒用同一个 `nextPeakChange` 与同一份时段说明，对同一时刻写出同样的「到几点」，并让 GLM 会话收到的高峰提醒与规则板那一行在每一档都不相抵（§3.4）。只装 GLM 包时没有规则板，也就没有档位；GLM 会话收到的高峰提醒与今天逐字相同。在整块规则板的每步提醒合入之前（最小一片没有这一行，`d-dogfood-scope` 的已知代价），走 GLM 路由的主 Agent 只能从 M6 的提醒（每段高峰一次）得知档位，非 GLM 路由的主 Agent 得不到；这一段不由 M6 补，补法是规则板的 R4。

### 3.4 给模型的提醒

人定照旧提醒（`d-peak-mode`）。0.2 的检查结果保留，作为提醒没有给人添话的依据：

方法〔实测，只读，2026-10-29〕：读 `~/.dsh/sessions/` 下全部 718 个 `session.v4.jsonl.zstd`（多帧 zstd，逐帧解码），挑出含来源 `glm-peak-reminder` 的会话，取这条 notice 之后全部 `assistant/message` 事件的文字块，按「peak、高峰、off-peak、谷段、低峰、credit、积分、14:00、18:00、半价、全价」不分大小写匹配；按会话的 `request/header` 与 `model/selection` 读 provider。设计评审第 2 轮复跑时是 720 个会话，数字相同。

| 会话 | 个数 | notice 之后的助手文字块 | 提到高峰或积分的 |
| --- | --- | --- | --- |
| 探针的脚本 provider `glm-probe`（回复是脚本写死的） | 153 | 288 | 0（不算数） |
| 真实 GLM（provider `glm-zcode`） | 4 | 32 | 0 |

样本小（4 个会话、32 段文字）。在这个样本里模型没有向人复述过提醒，也没有因它停下或换做法。

谁定什么（编排方的接缝裁定，2026-10-30，agent 定、可推翻）：发给模型的提醒原文与它在各档下的措辞归 GLM 包，由 M6 写，`docs/ORCHESTRATION.md` §11.4 也由 M6 改写；规则板管档位，经服务 `glmHournessPeakMode` 交出此刻的档位；只装 GLM 包时提醒照今天的原文。规则板 0.10 仍照这条写（rules:§3.4、§3.5、§10.6）：它的每步提醒那一行不引用、不转述 GLM 包的提醒，规则板的任何一步不改 `PEAK_REMINDER_TEXT`、`peak-reminder.ts` 的注释与 §11.4 的任何一行。0.3 的做法（不管档位，一律去掉「不要暂停或推迟工作」）随这条裁定作废：只装 GLM 包时没有档位，今天的原文与谁都不相抵，没有理由改它。0.5：规则板最小一片已把服务放进 main，0.10 仍照这条分工写（rules:§3.4、§3.5、§10.6）；人随后定的 `d-main-agent-peak-exempt` 改的是各档正文怎么写，不改分工（下表与「为什么这样写」）。

各档的正文。前两句四档相同，与今天逐字相同；时段与结束时刻由 `credits.ts` 新导出的冻结常量 `PEAK_HOURS = {en: 'weekdays 14:00-18:00 UTC+8', zh: '工作日 14:00–18:00（UTC+8）'}` 与 `PEAK_END_LABEL = '18:00'` 拼成（下表把它们写成 `<hours>` 与 `<end>`）。

| 读到的档位 | 第三句起 |
| --- | --- |
| 读不到（服务不在、`stateFor` 为 `undefined`、读的结果不合 §11 的规则，或 `peak` 不是 `true`），或档位为无影响（`inform`） | `This is for your information only: keep working on the current task, and do not switch models or plans, or pause or postpone work, unless the user asks.`（今天的原文，就是 `PEAK_REMINDER_TEXT`） |
| 少做（`reduce`） | `<档位句> Until <end>, <上限半句>do not start optional work that spends many GLM credits (calibration runs, ablations, large reviews); the main agent moves such work to after peak, including work it dispatches. Necessary work, and a task you were dispatched for, go on. Do not switch models or plans unless the user asks.`；`<上限半句>` 是 `run at most <N> GLM subagent(s) at a time and `，只在服务给了正的安全整数 `glmWorkerCap` 时写（N 为 1 时是 `1 GLM subagent`），否则整半句不写 |
| 不做（`stop`） | `<档位句> Until <end>, do not dispatch a GLM subagent and do not start a script that spends GLM credits; a GLM subagent whose call comes back deferred stops and reports where it stopped. The main agent is not held on any level: it keeps answering the human and working. Do not switch models or plans unless the user asks.` |

前两句：`Peak hours have started (<hours>). Until <end>, GLM usage is charged at the full credit rate; outside peak hours it costs half.`。档位句照规则板那一行的两种说法（rules:§6.4，0.5 评审 F42）：`origin` 为 `default` 时 `Peak mode: <level> (the default; the human can change it).`，为 `human` 时 `Peak mode set by the human: <level>.`。出厂默认只有少做（`effectivePeakMode`，rules:§3.6），不做与无影响只会是人设的；档位句按 `origin` 一个规则写，不按档位分支。上限的数不是 M6 的：它是规则板的常量 `PEAK_REDUCE_GLM_WORKERS`（`src/shared/peak-mode.ts`，现在是 1），经服务的 `glmWorkerCap` 交出，M7 在派活处执行的数与这里写的是同一个数。

为什么这样写（措辞是 agent 定的，§19，人可推翻）：

- 读不到档位与无影响用今天的原文。只装 GLM 包、规则行没启用、会话没有项目（`stateFor` 为 `undefined`，rules:§7.2）时照今天的原文，是裁定的原话。无影响就是「只提醒」，原文的「keep working…unless the user asks」与它一致。`peak` 不是 `true`（规则板读不到计价服务，或 GLM 包与规则板在 18:00 前后一分钟内各读各的时钟）时规则板说「它此刻不生效」（rules:§6.4 的 `GLM peak: unknown` 一行），提醒也就不按档位说。
- 少做与不做两档去掉「This is for your information only」与「keep working…pause or postpone work」：规则板那一行在这两档要主 Agent 挪开可挪的重活、不派 GLM 子 agent（rules:§6.4），留着这两句，同一步里就有相反的两句话（规则板 0.5 评审 F45；本稿设计评审第 3 轮 N18 指出「only」会被读成高峰与做法无关）。
- 少做档写「由主 Agent 挪」「派给你的任务照做」：GLM 子 agent 收不到规则板那一行（rules:§3.6：只给主 Agent 与身上有不做档等待单的会话），它看到的档位就是这条提醒；它不知道自己的任务是不是可挪的，停在半截会丢掉已做的部分。挪不挪由主 Agent 在派之前定（规则板那一行写「including work you dispatch」），子 agent 自己跑练习题时还有脚本自查把它排队（§7.2）。主 Agent 自己走 GLM 时，这几句与规则板那一行说的是同一件事。上限半句照规则板那一行的意思（「Run at most 1 GLM subagent at a time」），数取服务的 `glmWorkerCap`；最小一片阶段规则板还没有那一行，这半句让 GLM 路由上的主 Agent 在派活被 M7 拒绝（`slots_full`）之前就知道上限。
- 不做档只说谁该做什么，不说怎么排队（`d-main-agent-peak-exempt`）。0.4 的正文「No GLM work until <end>: the harness defers the tool calls of GLM sessions and tells you when to continue」对 GLM 路由上的主 Agent 是错的：主 Agent 的工具调用任何一档都不排队，人要它随时回话（人：「主Agent应该不受高峰影响，随时回复的」），规则板 0.9 也为此在 `m6` 节点上请 M6 不要对主 Agent 说「停下」。新正文只说三件事：不派 GLM 子 agent、不起花 GLM 积分的脚本（对派活和起脚本的主 Agent 说）；子 agent 的调用被推迟时停下并交回停在哪（与规则板给子 agent 的排队文字一致，rules:§6.4）；主 Agent 不被管，照常回话和干活。怎么排、排了之后怎么唤醒由规则板的排队文字和唤醒消息说，提醒不重复。这样正文在最小一片阶段（还没有排队）和整块规则板阶段都是真的：它写的是这一档要谁做什么，不是 harness 已经做了什么。
- 「Do not switch models or plans unless the user asks」四档都留：这是 `CHARTER.md` §6 的边界，与档位无关。
- 档位句与规则板那一行用同一种说法：GLM 主 Agent 在同一步里会读到两次同一句，说法一致才不会被读成两件事；子 agent 只读到这一次。
- 同一份正文给两种读者。`glm-prompt` 行不知道读者是不是主 Agent（主 Agent 的判定在编排层，GLM 包不导入它的代码，split 0.3 §2.7；`stateFor` 也不带角色），所以正文用第三人称写主 Agent 与子 agent 各自要做的事，主语写在每一句里，不靠区分读者。代价是主 Agent 会读到几句只对子 agent 说的话（「子 agent 的调用被推迟时停下并交回」）；分角色写要给 `stateFor` 加角色，那是规则板的契约，M6 不为一句话去改它。

怎样读档位：

- `src/glm-prompt/index.ts` 的 `apply` 给每个 agent 做一个读取函数，经 `installDialect` 交给 `installPeakReminder`：先 `peakModeService(ctx, …)`（回调里记下 `shapeProblem` 再转给 `problem`），再 `readPeakMode(service, shapeProblem, sessionIdOf(agent), problem)`（`peakModeService` 与 `PEAK_MODE_SERVICE` 在已合入 main 的公共库 `src/shared/peak-mode.ts`；`ctx.get` 不需要 inject，规则行没激活时为 `undefined`，`apply` 的 `ctx` 类型加上 `ServiceLookup`）。只在要发提醒的那一步读一次（`peakWindowToAnnounce` 返回了时段之后），不缓存，同 rules:§7.2 对读的一方的要求。
- 读的结果经 `readPeakMode` 检查（§11），得出档位或一个读不到的原因：`peakModeService` 返回 `undefined` 为 `no-service`，但它为此回调过 `problem`（成员类型不对）时为 `invalid`；`sessionIdOf(agent)` 为 `undefined` 或 `stateFor` 返回 `undefined` 为 `no-state`；返回的 `peak` 不是 `true` 为 `not-peak`；不是对象、`level` 或 `origin` 不在取值表里、`stateFor` 抛错为 `invalid`。`invalid` 经 `problem` 告警（每个进程每种原因一次），其余三种是正常情形，不告警。`stateFor` 返回的 `glmWorkerCap` 是正的安全整数时一并带回，只给少做档写上限半句用；缺或不合只是没有这半句，不算 `invalid`，也不告警（它是 `PeakModeState` 的可选字段，规则板只在高峰里的少做档给它）。
- notice 的 `source` 在 `peakWindow` 之外记 `peakMode`（`none`、`inform`、`reduce`、`stop`），有档位时另记 `peakModeOrigin`，正文写了上限时另记 `peakWorkerCap`（数），读不到时记 `peakModeNote`（`no-service`、`no-state`、`not-peak`、`invalid` 之一）。事后从会话日志就查得到模型那一刻收到的是哪一段、为什么。
- 同一段高峰里档位改了，不再提醒：是否提醒仍按 `source.peakWindow` 判（`peakWindowToAnnounce`），不比档位与正文。主 Agent 由规则板那一行在档位改了时得知（rules:§6.4）；改成不做时，在跑的 GLM 子 agent 的下一次工具调用和主 Agent 派 GLM 子 agent 的调用收到排队文字；从不做改走时规则板的唤醒消息写明（这些都是整块规则板的执行，最小一片没有）。在整块规则板的每步提醒合入之前，GLM 路由上的主 Agent 只靠这一段高峰里收到的那一条提醒知道档位，高峰中途改了档位它不会再收到（§13）。少做改无影响时，已经收到少做原文的 GLM 子 agent 不会得知，最多少做一些可挪的活，记为已知的局限（§13）。
- 续跑的旧会话历史里留着别一档的 notice：同上，按 `source.peakWindow` 判，同一段高峰里不重复。

代码的形状（`src/glm-prompt/peak-reminder.ts`）：

```ts
import type { PeakLevel, PeakModeService } from '../shared/peak-mode.ts'
/** Today's text (M6.1), sent when no peak mode is readable or the mode is inform; built from PEAK_HOURS and PEAK_END_LABEL, byte-identical to main 480e264 line 28. */
export const PEAK_REMINDER_TEXT: string
export interface ReminderMode { readonly level: PeakLevel, readonly origin: 'default' | 'human', /** the service's glmWorkerCap when it is a positive safe integer; worded only for reduce */ readonly glmWorkerCap?: number }
/** The reminder body for a peak mode; PEAK_REMINDER_TEXT for undefined and for inform. */
export function peakReminderText(mode?: ReminderMode): string
export type PeakModeNote = 'no-service' | 'no-state' | 'not-peak' | 'invalid'
export type PeakModeRead = { readonly mode: ReminderMode } | { readonly note: PeakModeNote }
/**
 * The mode to word the reminder by. `service` is peakModeService's result and `shapeProblem` whether it reported a wrong shape;
 * a mode only when stateFor(sessionId) has peak true and known level and origin. Never throws; 'invalid' is reported to `problem`.
 */
export function readPeakMode(service: PeakModeService | undefined, shapeProblem: boolean, sessionId: string | undefined, problem?: (message: string) => void): PeakModeRead
/** `peakMode` is called once, on the step that announces; without it every notice is PEAK_REMINDER_TEXT with note 'no-service'. */
export function installPeakReminder(agent: AgentLike, eligible: () => boolean, now: () => number, peakMode?: () => PeakModeRead): (() => void) | undefined
```

其余：

- `creditPricing.basis` 改为 `` `全部用量记录；高峰为${PEAK_HOURS.zh}，其余时段按 50% 计积分；高峰占比按积分计` ``，与今天逐字相同；`creditPricing.peakHours` 就是 `PEAK_HOURS`（§5）。时段的说明与计算在同一个文件里，改时段只改 `credits.ts`。
- 文件头注释第 4–7 行（「Information only: the harness never switches models or plans and never blocks or postpones work; scheduling is the user's decision.」）整句重写为「Information on peak pricing, worded by the project's peak mode when the rules board provides it (glmHournessPeakMode); without it the M6.1 text. The reminder never switches models or plans; deferring work is the rules board's (docs/ORCHESTRATION.md §11.4).」。`ORCHESTRATION.md` §11.4 整节随同一个提交改写（§17）。
- 代价：今天原文的第三句 152 个字符；少做（出厂默认、带上限半句）的第三句起 400 个，多 248；不做（人设）345 个，多 193（实现用 `peakReminderText` 的测试钉住这几个数，正文变了要改这里）。每段高峰每个 GLM 会话只发一次，提示词缓存只在这一条处变，与今天相同。
- ZCode 3.17.1 没有本地高峰提醒（`FACTS.md` §1；设计评审第 2 轮：3.17.1 host 与 `zcode.cjs` 里都没有本地峰谷时段）；0.5 在 pristine `reference/zcode-3.17.1/zcode.cjs` 里重搜，`14:00`、`18:00`、`peak hours`、`Peak hours` 都是 0 处（§4.1）。这段文字不是镜像文本，仍在镜像文件之外。

## 4. 额度取数（GLM 通道包）

### 4.1 ZCode 3.17.1 怎么取〔实读〕

桌面壳的 `BigModelUsageQuotaProvider`（"BigModelUsageQuotaProvider" host:+1360141*；3.16.3 host:+1280982*）。下表的偏移带 * 的由本稿复核，其余取自设计评审第 2 轮的实读（它逐项比过 3.16.3 与 3.17.1）。

0.5 重核（`d-zcode-3171`，2026-10-31，只读）：本机安装包仍是 3.17.1（包内 `package.json` 版本 3.17.1），`app.asar` 374,627,566 字节、修改时刻 2026-10-29T13:04:46Z，`out/host/index.js` 2,190,425 字节、MD5 `3ef810e5878d5103bb4430df00181b09`，都与文首写的相同，所以下表的偏移仍指同一处，没有逐项重数。抽查两处，与表一致：带引号的 `"BigModelUsageQuotaProvider"` 起点在 host:+1360141，额度路径常量带引号的字符串起点在 +1359358。pristine 副本 `reference/zcode-3.17.1/zcode.cjs`（15,405,921 字节，MD5 `331AB13D0CB2E9504EA25420FF9AE663`）里 `usage/quota/limit`、`BigModelUsageQuotaProvider`、`14:00`、`18:00`、`peak hours`、`Peak hours` 都是 0 处：额度代码只在桌面壳，`zcode.cjs` 里没有本地峰谷时段。按 `d-zcode-3171` 与 `AGENTS.md` 的基线条款，逐字文本只认 pristine 副本，安装包（可能带用户补丁）只作机制参考；额度请求这一节引的是机制，不是逐字文本，Q0 导出的 host 包同样只作机制参考。

| 事实 | 3.17.1 | 3.16.3 | 相同吗 |
| --- | --- | --- | --- |
| 地址常量 `"/api/monitor/usage/quota/limit"`、超时 `15e3` | `iOe` host:+1359354（字符串 +1359358*）、`li` +1359505 | `ZAe` +1280195（字符串 +1280199*）、`Qo` +1280346 | 相同 |
| `fetchQuota(t)` 为 `readApiJson(apiClient, buildQuotaLimitUrl(t), {method: "GET", timeoutMs, headers: createBigModelUsageHeaders(t)})` | +1371449*（`Vt`、`vOe`、`Gl`） | +1292290*（`Wt`、`nTe`、`Pl`） | 相同 |
| `createBigModelUsageHeaders` 只放 `{authorization}`，团队另加 `bigmodel-organization`、`bigmodel-project`；`buildQuotaLimitUrl` 只在团队时加 `?type=2` | `Gl` +1374857*，`vOe` 紧随其后 | `Pl` +1295698*，`nTe` +1295914 | 相同 |
| 每个请求补 `x-request-id`：`NodeApiClient.request` 先经 `resolveRequestHeaders`（`isRequestForEndpoint` 比 origin，只有 ZCode 端点才加身份头，`bigmodel.cn` 不加），再经 `withRequestIdHeader`（头里没有 `x-request-id` 就补一个随机 UUID） | `request` +1645564*；`A$e` 即 `resolveRequestHeaders` +1643371*；`Cne` +1643061；`lc` +1610148、`va = "x-request-id"` +1610129* | `request` +1544561；`Ga` +1508322、`sa` +1508303；"isRequestForEndpoint" +1542142* | 相同 |
| 额度读取用的 `apiClient` 就是上面的 `NodeApiClient` | `n0({apiClient: k, accountRequestAuthService, …})` +1895288*，`k = createNodeApiClient(…)` | 未单独查 | 3.17.1 已确认；3.16.3 不影响本包 |
| 凭证：`resolveAuthorization` 对账号套餐调 `resolveCurrent({providerId, accountAccess, reason: "usage"})` 取 `apiKey`；BigModel 账号的地址走 `buildBigModelQuotaUrl` | +1370593；`OOe` +1382507 → `e0` +1382746 | +1291434；`yTe` +1303348 → `eO` +1303587 | 相同 |
| `resolveCurrent`：start-plan 返回 `zcodeJwtToken`；`reason: "usage"` 不核账号作用域；带被拒指纹而没有 `expectedAccountScope` 时抛 `project_token_scope_invalidated` | +1278678 | +1200629 | 相同 |
| 成功判定 `success !== false` 且 `code` 为 `null`、`undefined`、`0`、`200` | `QD` +1376124（"isSuccessfulBigModelEnvelope" +1376206*） | `QM` +1296965（+1297047*） | 相同 |
| 行的解析（`data.limits` 里 `type` 为非空字符串的项，只留数字字段与 `usageDetails`）；主显示项先取 `TIME_LIMIT` | `jD` +1347113，`JX` +1347695 | `zM` +1268239，`YY` +1268821 | 相同 |
| `readApiJson`：`apiClient.request` 之后非 2xx 抛错，再解析 JSON | `Vt` +151499 | `Wt` +145440 | 相同 |
| 环境变量覆盖 `ZCODE_BIGMODEL_USAGE_QUOTA_URL`、`BIGMODEL_USAGE_QUOTA_URL` | `XD` +1382238 | `XM` +1303079 | 相同 |
| origin `https://bigmodel.cn`（`buildBigModelApiUrl` 用 `resolveBigModelApiOrigin`，覆盖项 `BIGMODEL_API_BASE_URL`、`BIGMODEL_PRODUCTION_API_BASE_URL`） | `index.js` 的 `Zi` 即 `chunk-ZSDMP7DM.js` 的 `ma`（`LM` chunk:+594247、`NM` chunk:+594139、`PM` chunk:+591920） | `xi` 即 `chunk-5YNPFY3L.js` 的 `ia` | 相同 |
| 两条读额度的路径，都不重试、不重铸 | 订阅核验之后 `this.fetchQuota(d).catch(() => null)`（+1361885，与 `fetchMcpQuota` 并列），失败读作没有额度；`getCodingPlanUsageSnapshot`（+1368278*）里 `Promise.all([this.fetchQuota(n), …])` 不带 `catch`（+1368565），额度失败时整个用量快照失败 | +1282726；+1289119* | 相同 |
| 读的时机（设置页的用量快照） | renderer 的 hook 在挂载与参数变化时读，最近一次请求不足 60 秒时直接用缓存（`kYn`：`now - lastUpdatedAt >= 6e4` 才重读，renderer:+6189443*），人可以强制刷新；这一带没有定时器 | 未查 | 不适用 |
| `1308`、`next_flush_time` | 0 处 | 0 处 | 相同 |
| 本地峰谷时段 | 没有（`off-peak` 只作服务端排队协议与闲时任务） | 没有 | 相同 |

所以本包照 3.17.1：头恰好 `authorization` 与 `x-request-id`；不加 ZCode 的身份头（3.17.1 只给 ZCode 端点加）；不重试、不重铸。两条路径对外的差别只在失败时整个快照是否一起失败，本包把额度当作独立的一节，失败只影响这一节，与第一条路径的效果相同。ZCode 设置页的 60 秒复用与本包的 60 秒相同；renderer 别处有没有定时读，本稿没有查全〔未核实，V7〕，本包不设定时器的取舍不依赖它（§4.4）。

zcode-api 的实测〔实读，它记的是 2026-10-12 的一次真实读取，max 档，对照官方面板〕：`TOKENS_LIMIT` 是 5 小时与每周两个窗口，`TIME_LIMIT` 是 MCP 工具调用窗口（`remaining` 是调用次数，`percentage` 是已用比例）；按重置先后排位次贴标签会错位，要按「离重置还有多久」命名；`number` 不是能与 `remaining` 比较的总量（实测 `TIME_LIMIT` 一行 `remaining=3836`、`number=1`）；`nextResetTime` 有秒也有毫秒；上游网关对频繁查询限速，所以它不轮询（`zcode-api:server/routes-quota.ts`:45–62、124–143，`zcode-api:tui/frame.ts`:346–363、476–495，`reference/zcode-api/README.md`:228）。它用的是 `open.bigmodel.cn` 与 API Key，与 ZCode 不同；本包照 ZCode。两边对 `TIME_LIMIT` 的理解有冲突（ZCode 把它当主显示项），单位也不一致（ZCode 只留数字的 `unit`，zcode-api 的夹具里 `unit` 是字符串 `"prompt"`）：都留到 §15.3 的 L4 读取核实。

### 4.2 本包的请求

- 新文件 `src/glm-llm/quota.ts`（GLM 包）。bigmodel 的 API origin 今天是 `src/glm-llm/zcode.ts`:46 的模块内常量 `BIGMODEL_API_ORIGIN`，移到 `src/glm-llm/zcode-wire.ts`（ZCode 线上常量所在的文件）导出，`zcode.ts` 与 `quota.ts` 都从那里取；`quota.ts` 的地址常量 `QUOTA_URL` 是 `${BIGMODEL_API_ORIGIN}/api/monitor/usage/quota/limit`。不读环境变量覆盖（测试用注入的 fetch）。
- 凭证：`ZcodeAdapter` 加一个方法 `usageAuthorization(): Promise<string>`，没有参数。按顺序：适配器的 `plan` 为 start-plan 时抛 `start-plan`，不读凭证、不发任何请求（体验套餐没有 5 小时与周额度，`FACTS.md` §2.3、§2.4）；没有凭证抛 `not-logged-in`；coding-plan 时返回 `this.projectToken(credential)` 的令牌（`src/glm-llm/zcode.ts`:240），与模型请求用同一个项目令牌缓存（同一个适配器实例）；铸造失败按 `zcode-wire.ts` 的 `PROJECT_TOKEN_CODES` 抛。不接受被拒指纹：3.17.1 的额度路径不核对账号作用域、不接受被拒指纹（`resolveCurrent` 对 `reason: "usage"`，host:+1278678）。令牌按自己的有效期换新（到期前 120–180 秒，`src/glm-llm/auth/project-token.ts`:30–34）；人重新 `/glm-login` 之后登录令牌变了，项目令牌客户端换一代缓存（`project-token.ts`:317–321），下一次读取铸造新令牌。
- 套餐从哪来：额度读取用 `glm-login` 行自己的 `ZcodeAdapter`（`login-row.ts` `apply`），它今天只拿到 `home` 与 `fetchImpl`，不知道套餐。`LoginConfig` 加 `plan?: 'coding-plan' | 'start-plan'`；`login-row.ts` 新导出 `Config = Schema.object({home, plan})`，两个字段的 Schema 与说明照抄 `src/glm-llm/index.ts` 的 `Config`（`plan` 默认 `coding-plan`），这样它在插件管理器里是真开关，探针传的 `home` 也照样通过；`apply` 构造适配器时把 `plan` 传进去（只在配置里有值时传，满足 `exactOptionalPropertyTypes`）。`packages/glm/cordis.patch.yml` 两行仍是 `config: {}`，在 `glm-login` 行上加注释「`plan` 与 glm-llm 行的 `plan` 必须相同：glm-login 用它决定 /glm-status 的套餐与读不读额度」。两行设得不同时，人在 `/glm-status` 第一行就看得到 `glm-login` 用的套餐。
- 项目令牌缓存一行一份：`glm-login` 与 `glm-llm` 两行的适配器各有一份缓存，两行都在时一个令牌有效期内至多多铸造一次；模型请求的 401 让 `glm-llm` 的缓存换新，不影响 `glm-login` 的那一份。ZCode 一个进程一份缓存，这是一处已知差异，写进 `DESIGN.md` §4.8（§17）。
- 请求：`fetch(QUOTA_URL, {method: 'GET', headers: {authorization: <令牌原样>, 'x-request-id': randomUUID()}, signal})`，`randomUUID` 取自 `node:crypto`（`zcode.ts` 已在用），每次读取新生成；15 秒超时（`AbortController`）；其余用 fetch 的默认选项，不加别的头；不重试。
- 结果分类（每类一个原因码，写进额度流水与行健康）：

| 情况 | 原因码 | 额度一节写 |
| --- | --- | --- |
| 没有凭证 | `not-logged-in` | 额度：未登录 GLM（/glm-login） |
| start-plan | `start-plan` | 额度：体验套餐没有 5 小时与周额度 |
| 项目令牌拿不到 | `credential:<PROJECT_TOKEN_CODES 的码>` | 额度：项目令牌拿不到（码），运行 /glm-login |
| 网络错误 | `network` | 额度：读不到（网络错误） |
| 15 秒超时 | `timeout` | 额度：读不到（15 秒没有响应） |
| HTTP 401 | `http-401` | 额度：令牌被拒（401）；令牌到期换新后再读，或运行 /glm-login |
| 其他非 2xx | `http-<码>` | 额度：读不到（服务端返回 <码>） |
| 响应超过 256 KiB | `too-large` | 额度：读不到（响应过大） |
| 不是 JSON、信封不成功 | `envelope:<code>` | 额度：服务端拒绝（<code> <msg 前 80 字符>） |
| 信封成功但没有可用的行 | `no-windows` | 额度：服务端没有返回可识别的窗口 |

- 401：照 3.17.1，只是一个失败原因 `http-401`（`readApiJson` 对非 2xx 抛错，调用处 `.catch(() => null)`，host:+151499、+1361885）。不记被拒指纹、不强制重铸、不在同一次读取里重发；下一次读取照常再读，用的仍是缓存里的令牌，直到它按有效期换新或人重新登录。这样额度读取不会发出 3.17.1 不会发的 `POST …/access_tokens`。额度路径的 401 不算「登录被拒」（§4.9）：项目令牌可能只是还没换新。

### 4.3 解析与窗口命名

解析（与 3.17.1 `jD` 相同的取舍，另加上限）：

- 信封是对象；`code` 为数字、数字字符串、`null` 或没有；`success` 为布尔或没有；按 `QD` 判成功。
- `data.level`：字符串，去空白后 1–32 个字符才留。
- `data.limits`：数组，至多取前 32 项，多出的计入 `dropped`。每项 `type` 为非空字符串（至多 64 个字符）才留；`percentage`、`remaining`、`number`、`usage`、`currentValue`、`nextResetTime` 只在是有限数字时留；`percentage` 为负数时丢掉这一个字段，大于 100 时按 100 保留（超额时服务端可能给出大于 100 的值，这一行要能显示「已用完」）；`unit` 与 `usageDetails` 不留（单位语义未核实，§4.1；明细没有使用者）。`percentage` 与 `remaining` 都没有的项丢弃，计入 `dropped`。
- `nextResetTime`：小于 10^12 视为秒，乘 1000；换算后不在 [读取时刻 − 1 天, 读取时刻 + 45 天] 之内就丢掉这个字段。

命名（agent 定，§19；按 zcode-api 的实测，L4 读取后核对，§15.3）。设 `h` 为离重置的时长，5 小时上限取 5 小时 2 分钟（容读取与服务端的时钟差）：

1. `TIME_LIMIT` → `mcp`「MCP 工具调用」，只显示已用比例与重置时刻，不预估。
2. `TOKENS_LIMIT` 有重置时刻的各项：`h` 不超过 5 小时 2 分钟的是 5 小时候选，其余是每周候选。5 小时候选恰好一个、每周候选至多一个时，分别命名 `five-hour`「5 小时」与 `weekly`「每周」；只有一个 `TOKENS_LIMIT` 项时按它属于哪一类命名。其余情形（两个都在 5 小时内重置，或两个都在 5 小时之后）不猜，各自命名 `window`「额度窗口（HH:MM 重置）」，不用窗口平均法预估（§4.7）。
3. 没有重置时刻的 `TOKENS_LIMIT` 项：`window`「额度窗口」。
4. 其他 `type`：`other`，显示原样的类型名。

名字按每次读数自己的读取时刻算（流水里只存行，不存名字）。同一个窗口的「同一期」：名字相同、重置时刻相差不超过 120 秒的两次读数。

### 4.4 读取时机与缓存

- 谁会发起读取：`/glm-status`（GLM 包）；`/hourness`（编排层包，经计价服务的 `quota` 成员，§5）；装了循环板时，循环板的「额度快用完」条目在 GLM 有新用量记录、上一次读数满 15 分钟之后调一次 `quota({waitMs: 3000})`（§8.4 M6-L2）。GLM 包自己没有定时器。理由：读数主要给人看，人看的时候读就够了；「快用完」要在人干活时提前说，所以只在 GLM 正在被用时读；没人用 GLM 时一个请求也不发。zcode-api 记录了网关对频繁查询限速；按 15 分钟一次，一小时至多 4 次。
- 缓存：每个 `glm-login` 行实例一份。最近一次成功读数不足 60 秒就直接用（与 ZCode 设置页相同的 60 秒，§4.1）；有进行中的读取就等它，不另发。额度流水里最新一条上游限额记录（§4.6）晚于缓存的读数时，不用缓存。
- `quota({read: false})`：不发起读取，返回缓存的读数（没有时从流水末尾读回）与登录状态（§4.9）。循环板每分钟看一次登录状态就用它（§8.4 M6-L3），所以这一类调用不会变成请求。
- 命令等待上限 3 秒：`quota({waitMs: 3000})` 先发起（或加入）读取，3 秒内返回就用新读数；否则返回上一次成功读数（或「还没有读数」），带 `pending: true`，额度一节加一句「正在读取，稍后再看」。读取在后台继续，至多 15 秒，结果进缓存与额度流水。`waitMs: 0` 同理，立刻返回。
- 进程重启：第一次读取前，从额度流水末尾读回最近 32 条读数作为历史（§4.5），所以重启之后「两次读数」的预估依据还在。

### 4.5 额度流水

- 位置：`<home>/audit/quota.jsonl`，`home` 是 `credentialHome(config.home)`（`src/shared/data-home.ts`，默认 `$DSH_HOME/glm-hourness`，与用量流水同一个用户级目录，`DESIGN.md` §2.4）。`glm-login` 与 `glm-llm` 两行都按这条规则解析，bundle 里两行都不设 `home`，所以写的是同一个文件；探针与测试显式传临时目录。额度与用量是整个账号的事，所以留在用户级目录，不进项目的 `.llm/`（宪章 0.7 §9，`d-rules-in-repo`、`d-memory-scope`）。
- 写法：每行一个 JSON 对象，只追加；第一次写时建目录；写失败不抛，每种失败控制台告警一次（同 `src/memory/audit.ts` 的 `rowJournal`）。
- 四种记录：

```json
{"at":"2026-10-30T09:02:03.120Z","kind":"reading","level":"pro","limits":[{"type":"TOKENS_LIMIT","percentage":41,"nextResetTime":1793355400000},{"type":"TIME_LIMIT","percentage":4,"remaining":3836,"nextResetTime":1793566000000},{"type":"TOKENS_LIMIT","percentage":63,"nextResetTime":1793573200000}],"dropped":0}
{"at":"2026-10-30T09:20:00.004Z","kind":"failure","reason":"timeout"}
{"at":"2026-10-30T12:41:09.880Z","kind":"upstream-limit","code":"1308","until":"2026-10-30T13:30:00.000Z"}
{"at":"2026-10-30T12:50:31.006Z","kind":"login-rejected","path":"model","status":401,"login":"9f3c2a71d0b4e865"}
```

  `reading` 存解析后的行（§4.3 的字段，不含名字：名字随时刻变化，显示时再算），不存原始响应；`failure` 同一原因 10 分钟内只记一条；`upstream-limit` 由 `glm-llm` 行的适配器写（§4.6）；`login-rejected` 由两行的适配器写（§4.9），`path` 为 `model` 或 `mint`，`status` 为 401 或 403，或者没有 `status`、带 `code: "project_token_login_required"`；`login` 是被拒的登录令牌的指纹（SHA-256 十六进制的前 16 位，§4.9），登录令牌为空时没有这一项。四种记录都不含任何令牌、Key 或请求头。
- 读回：显示时读文件末尾至多 256 KiB，跳过不是 JSON 或字段不合法的行（计数，写进行健康）。`read: false` 的调用先比文件的大小与修改时刻，没变就不重读。按每小时 4 次读取、每次一行约 300 字节估，一年约 10 MB；不轮换，到 8 MiB 时由行健康提示一次，轮换留到那时设计（写进 `DESIGN.md` §2.4 的数据表）。

### 4.6 上游限额错误

- 来源：`ZcodeAdapter.stream` 在响应非 2xx 时抛 `glm-zcode <status>: <正文前 400 字符>`（`src/glm-llm/zcode.ts`:469）。在抛之前，状态为 429 时解析正文：JSON 的 `error.code`（字符串或数字）属于 `1308`、`1310`、`1316`–`1321` 时，追加一条 `upstream-limit` 记录。错误码的含义见 `docs/reference/bigmodel-guide-digest.md`:165（1308 达到用量上限，消息里带 `${next_flush_time}`；1310 周或月上限；1316–1321 团队与子账号的各类上限）与 `FACTS.md` §2.5。
- 恢复时刻：在 `error.message` 里找第一个 `YYYY-MM-DD HH:MM[:SS]` 或 `YYYY-MM-DDTHH:MM[:SS]`，按 UTC+8 解释（BigModel 是国内服务；消息里时刻的格式与时区都没有实测〔未核实，V4〕）；得到的时刻不在 [现在, 现在 + 8 天] 之内就不写 `until`。
- 这一节不是 ZCode 的行为：3.16.3 与 3.17.1 的 host 包里都没有 `1308` 与 `next_flush_time` 字样（§4.1），是本项目加的展示，写进 §17 给 `DESIGN.md` §4.8 的已知差异。正文形状 `{"error": {"code": "1308", …}}` 出自 `bigmodel-guide-digest.md`:165，说的是 `open.bigmodel.cn`；本通道的模型请求经端点路由改写到 `zcode.z.ai/api/v1/ultra/...`（`DESIGN.md` §4.3、§4.4），经这个网关时正文是不是同一个形状没有核实〔未核实，V4〕。形状不同时只是不写上游限额记录，额度一节照常按服务端读数显示已用比例（100% 即「已用完」）；模型请求的错误照原样交回 DSH。
- 适配器写记录用的是它自己的 `home`（`ZcodeAdapter` 构造参数），不依赖 `glm-login` 行在不在；写失败只在控制台告警一次，不影响抛出的错误。不改错误文本、不改重试行为（`DESIGN.md` §4.1）。
- 显示：额度一节若有晚于最近读数的 `upstream-limit` 记录，第一行写「额度已用完（服务端 1308），预计 21:30 恢复」或不带时刻的同一句；它让下一次读取不用缓存（§4.4）。

### 4.7 预估耗尽（峰谷修正）

记号：`m(t)` 是时刻 `t` 的计费比例，高峰为 1，其余为 0.5（`credits.ts` 新导出 `rateShareAt(ms)`，用 `peakWindowAt` 与 `OFF_PEAK_RATE`，积分规则仍只在这一处）。`W(a, b)` 是 `[a, b)` 上的「全价小时」：按整分钟累加 `m × 1/60`，两端不满一分钟的按比例。比例 `p` 是服务端的已用百分比。假设：额度按积分计，非高峰的消耗按半价计入额度（`FACTS.md` §2.4「积分按 50% 抵扣」，额度表以积分为单位）〔推断，V5〕；这个假设不成立时速度最多差一倍，预估行写明依据，L4 之后的读数可以复算（§14）。

速度（每全价小时多少个百分点），按顺序取第一个可用的：

1. 最近两次（`recent`）：同一期的更早读数里，取离本次 10–90 分钟之间最早的一次 `(t1, p1)`；`p2 < p1` 说明窗口已经刷新，不用；`k = (p2 − p1) / W(t1, t2)`。
2. 窗口平均（`window`）：只用于 `five-hour` 与 `weekly`，要有重置时刻 `R`。窗口长度 `L` 为 5 小时或 7 天，窗口开始 `S = R − L`（5 小时额度从消耗起点刷新，周额度自下单起 7 天一个周期，`FACTS.md` §2.4）；`S < t2` 且 `p2 > 0` 时，`k = p2 / W(S, t2)`。
3. 都不可用：不预估，写原因。

结果：

- `p2 ≥ 100`：「已用完，HH:MM 重置」。
- `k = 0`：「最近没有消耗」。
- 否则从 `t2` 起按分钟累加 `p = p2 + k × W(t2, τ)`：在重置之前到 100，报「预计 HH:MM 用完」（取整到分钟，向下）；到重置也没到 100，报「到重置时约 N%」（四舍五入）；没有重置时刻时只在 7 天内找，找不到报「7 天内用不完」。
- 依据写在同一行：「按 18:20–19:02 两次读数的速度」或「按本窗口 16:30 以来的平均速度」。周额度的窗口平均把夜里不干活的时间也算进去，速度偏低，所以这种依据的周额度行另写「（含夜间，偏低）」。

算例（钉进 L2，周三，UTC+8）：5 小时窗口 21:30 重置。17:00 读到 20%，17:30 读到 30%。两次都在高峰，`W = 0.5`，`k = 20`。往后：17:30–18:00 仍是高峰，`+20 × 0.5 = 10`，18:00 时 40%；18:00 之后 `m = 0.5`，每钟点 `+10`，到 21:30 再加 35，得 75%。结果「到 21:30 重置时约 75%，按 17:00–17:30 两次读数的速度」。不做峰谷修正（每钟点一律 +20）时会得到「预计 21:00 用完」。

预估只在 GLM 包里算（`src/glm-llm/quota-projection.ts`，纯函数，输入是读数历史、当前时刻与 `rateShareAt`），给编排层的是算好的结构（§5）。

### 4.8 `/glm-status` 的呈现

`/glm-status` 的输出（`login-row.ts` `statusCommand`）在凭证一行之后、行健康表之前插入一段，空行隔开：

```text
glm-zcode：已登录（套餐 coding-plan，Key …）

高峰：高峰中，到 18:00（GLM 积分套餐）
额度（服务端读数，含 ZCode 等其他客户端，读于 17:02）：pro
- 5 小时：已用 41% · 21:30 重置 · 到重置时约 75%，按 16:35–17:02 两次读数的速度
- 每周：已用 63% · 周一 10:00 重置 · 到重置时约 97%，按本窗口 10-26 10:00 以来的平均速度（含夜间，偏低）
- MCP 工具调用：已用 4% · 周一 08:00 重置

| 包 | 行 | 状态 | 说明 |
…
```

- 登录被拒时（§4.9），这一段的第一行是「登录：被拒（17:40，模型请求在重新取令牌之后仍被拒），运行 /glm-login」。凭证一行的格式不变（设置页解析它，`ui/src/channel.js`:249–250）。
- 时刻按本机时区显示（公共库 `formatMoment(ms, now, zone?)`，§5）：同一天写 `HH:MM`；将来的次日写「明天 HH:MM」，将来 2–6 天写「周X HH:MM」；更远的将来与以前各天写 `MM-DD HH:MM`。「同一天」「明天」「周X」都按显示用的时区算。`zone.offsetMinutes` 不给时取本机在 `ms` 那一刻的偏移（`-new Date(ms).getTimezoneOffset()`）；测试传 `{offsetMinutes: 480}`，断言因此与跑测试的机器的时区无关。高峰的判定仍按 UTC+8（`peakWindowAt`），与本机时区无关。
- 高峰行的「下一次变化」用公共库的 `nextPeakChange(peak, fromMs)`（`src/shared/pricing.ts`，§5），GLM 包传 `creditPricing.peak`。
- 测试注入：`LoginConfig` 加两个只给测试用的字段 `now?: () => number` 与 `offsetMinutes?: number`（同已有的 `fetchImpl`，不进 `Config` 的 Schema，所以插件管理器里看不到、行配置里写了也会被 Schema 去掉）；`/hourness` 的 `RenderOptions` 已有 `now`，加 `offsetMinutes`。
- GLM pill 把既不是字段也不是行健康的行留在健康表上方显示（`ui/src/channel.js`:249–250 的 `restOf`），所以这一段在 pill 里照常显示；`tests/health.spec.ts` 里交给 pill 解析函数的用例按新输出改写「剩下的行」的断言。
- `glm-login` 行健康的说明在原有文字后加「额度：读于 17:02」或「额度：读不到（原因码）」，登录被拒时再加「登录被拒」。状态不因额度降级：额度是给人看的数据，不影响任何请求。

### 4.9 登录状态

人要的是「登录过期时提醒重登」（循环板，§8）。GLM 包判出「登录被拒」，经计价服务的 `quota()` 交出；提醒由循环板做。

- 判据（agent 定，§19）：三种情形写一条 `login-rejected` 记录，同一 `path` 10 分钟内只记一条：
  - `path: 'model'`：模型请求的项目令牌被拒，照 ZCode 带被拒指纹强制重铸一次、重试一次之后仍被拒（`zcode.ts`:458–469 那一条路径走完）。这是最强的信号：刚铸出的令牌也不被接受。
  - `path: 'mint'`：定位个人套餐的 Key 或铸造项目令牌时 PAT 平面回 401 或 403。`8b12baf` 之后这两种失败照 3.17.1 抛 `project_token_http_401`、`project_token_http_403`（`project-token.ts`:81–108 的 `requestFailureCode`，:367–376 的映射，前缀是 `zcode-wire.ts` 的 `PROJECT_TOKEN_HTTP_CODE_PREFIX`），所以适配器在它的 `projectToken`（`zcode.ts`:240）里看抛出的码就够了：`.catch` 里码是这两个时写记录，再原样抛出。0.3 要的构造参数 `onRejected` 不再需要，`project-token.ts` 不改。两行的适配器都会铸造，所以两行都可能写。
  - 登录令牌为空（`project_token_login_required`，`project-token.ts`:314），记 `path: 'mint'`、`code`。
  - 不算的：`project_token_network_error`、`project_token_timeout`、`project_token_http_429` 与 `project_token_http_5xx`（暂时的失败，`ProjectAccessTokenTransientError`）；额度路径的 `http-401`（§4.2）；`project_token_disabled`、`project_token_project_unavailable`（账号或项目的状态，不是登录过期）；`project_token_invalid_response`。
  - 每条记录带 `login`：被拒的那个登录令牌的指纹，SHA-256 十六进制的前 16 位（令牌先去掉 `Bearer ` 前缀与空白，同 `project-token.ts`:313 的规整）。指纹不能还原令牌，只用来认「是不是同一次登录」。
- 状态：`QuotaView.login` 为 `{state: 'ok' | 'rejected' | 'absent', since?: number, path?: 'model' | 'mint'}`，`glm-login` 在每次 `quota()` 时算：
  - `absent`：凭证文件 `credentials.json` 不存在、大小为 0（`/glm-logout` 调 `clearCredential`，写空串而不删文件，`src/glm-llm/auth/store.ts`:185–191）、解不开或记录里没有登录令牌。解不开时行健康另写一次「凭证文件读不出，运行 /glm-login」。
  - `rejected`：最新一条 `login-rejected` 记录的 `login` 等于当前凭证里登录令牌的指纹，而且晚于最新一条成功读数；`since` 取那条记录的时刻。
  - 其余为 `ok`。重新 `/glm-login` 换了登录令牌，指纹不同，状态随之回到 `ok`；登录其实没坏、只是一时被拒时，下一次成功的额度读数也让它回到 `ok`。
  - 0.3 按凭证文件的修改时刻判「重新登录」不对（设计评审第 3 轮 N16）：项目 Key 的位置记录经 `updateStoredCredential` 写回同一个文件（`zcode.ts`:218–227 的 `locationStore`，`project-token.ts` 的 `save`、`delete`），没有重新登录修改时刻也会变，状态就会提前回到 `ok`，循环板的提醒也就不发了。比指纹不受这类写回影响。
  - 算的成本：`read: false`（循环板每分钟一次，§8.4 M6-L3）先比凭证文件的大小与修改时刻，没变就用上一次算出的指纹，不解密；变了才解密一次、重算指纹，指纹只放内存。额度流水同样先比大小与修改时刻（§4.5）。
- 用在哪：`/glm-status` 那一段的第一行（§4.8）、`glm-login` 的行健康、循环板的「登录失效」条目（§8）。登录被拒不改变任何请求的行为：模型请求照 ZCode 的重试规则，失败照原样交回 DSH。

## 5. 两包之间的契约

计价服务加三个可选成员（split 0.3 §4.3 末条：m6 扩这份契约，通道包取数，编排层展示）。不另开服务：额度、登录状态与积分同属一个套餐，提供方同是 `glm-login` 行，使用方同是编排层包；多一个服务就多一套提供、撤销与形状检查（§19）。

```ts
// src/shared/pricing.ts（扩展）
export interface UsagePricing {
  readonly basis: string
  readonly plan: string
  charged(model: string, usage: TokenUsage, atMs: number): number | undefined
  peak(atMs: number): boolean
  /** The plan's peak hours as text for people and models (M6); absent before M6. */
  readonly peakHours?: PeakHoursText
  /** The plan's quota windows and login state as the channel reads them (M6); absent before M6. */
  quota?(request?: QuotaRequest): Promise<QuotaView>
  /** The channel package's default loop-board entries, as data (M6); absent before M6. */
  readonly loopDefaults?: readonly ChannelLoopDefault[]
}
/** e.g. {en: "weekdays 14:00-18:00 UTC+8", zh: "工作日 14:00–18:00（UTC+8）"} */
export interface PeakHoursText { readonly en: string, readonly zh: string }
/** The peak-hours text when both strings are single lines of 1-80 characters, else undefined (a wrong type is reported to `problem` once). */
export function peakHoursOf(pricing: UsagePricing, problem?: (message: string) => void): PeakHoursText | undefined
/** The quota reader; undefined when the member is absent or not a function (reported to `problem` once). */
export function quotaOf(pricing: UsagePricing, problem?: (message: string) => void): ((request?: QuotaRequest) => Promise<QuotaView>) | undefined
/** The first minute after `fromMs` at which `peak` differs from `peak(fromMs)`; undefined within `horizonMs` (default 8 days). Already on main since the rules board's first slice (src/shared/pricing.ts); M6 adds no second copy. Shared with the rules board (rules design 0.10 §3.2) and the loop board (its channel.peak-changed event). */
export function nextPeakChange(peak: (atMs: number) => boolean, fromMs: number, horizonMs?: number): number | undefined
```

```ts
// src/shared/quota.ts（新，公共库：类型与纯函数，两包都编进去）
export interface QuotaRequest {
  /** How long the caller waits for a read it starts or joins; default 0. */
  readonly waitMs?: number
  /** false: start no read, return the cached or journalled view; default true. */
  readonly read?: boolean
}
export type QuotaWindowName = 'five-hour' | 'weekly' | 'mcp' | 'window' | 'other'
export type QuotaBasis =
  | { readonly kind: 'recent', readonly from: number, readonly to: number }
  | { readonly kind: 'window', readonly since: number, readonly includesNights: boolean }
export type QuotaProjection =
  | { readonly kind: 'exhausts', readonly at: number, readonly basis: QuotaBasis }
  | { readonly kind: 'at-reset', readonly percent: number, readonly basis: QuotaBasis }
  | { readonly kind: 'spent' }
  | { readonly kind: 'idle', readonly basis: QuotaBasis }
  | { readonly kind: 'none', readonly reason: string }
export interface QuotaWindowView {
  readonly name: QuotaWindowName
  /** 「5 小时」「每周」「MCP 工具调用」「额度窗口（21:30 重置）」或原样的类型名 */
  readonly label: string
  readonly usedPercent?: number
  readonly resetAt?: number
  readonly projection: QuotaProjection
}
export interface QuotaReading { readonly at: number, readonly level?: string, readonly windows: readonly QuotaWindowView[] }
export interface LoginView { readonly state: 'ok' | 'rejected' | 'absent', readonly since?: number, readonly path?: 'model' | 'mint' }
export interface QuotaView {
  /** The last successful reading, if any. */
  readonly reading?: QuotaReading
  /** The latest failure when it is newer than `reading`: the reason code (§4.2) and its line. */
  readonly failure?: { readonly at: number, readonly reason: string, readonly text: string }
  /** The latest upstream-limit record newer than `reading` (§4.6). */
  readonly limited?: { readonly at: number, readonly code: string, readonly until?: number }
  /** The login state (§4.9). */
  readonly login: LoginView
  /** A read is still running past `waitMs`. */
  readonly pending: boolean
}
/** The display time zone; without `offsetMinutes` the host's offset at each instant. */
export interface MomentZone { readonly offsetMinutes?: number }
export interface QuotaLowRule { readonly usedPercent: number, readonly exhaustsWithinMinutes: number }
export function quotaLines(view: QuotaView, now: number, zone?: MomentZone): string[]
/** Uses nextPeakChange from ./pricing.ts. */
export function peakLine(plan: string, peak: (atMs: number) => boolean, now: number, zone?: MomentZone): string
export function formatMoment(ms: number, now: number, zone?: MomentZone): string
/** The five-hour or weekly window that is running low (the higher used share wins); undefined when none is. */
export function quotaLowOf(view: QuotaView, rule: QuotaLowRule, now: number): QuotaWindowView | undefined
/** 「5 小时额度已用 85%，21:30 重置，预计 20:40 用完」 */
export function quotaLowLine(window: QuotaWindowView, now: number, zone?: MomentZone): string
/** 「GLM 登录在 17:40 被服务端拒绝，GLM 的请求会失败；运行 /glm-login 重新登录」 */
export function loginLine(login: LoginView, now: number, zone?: MomentZone): string
```

```ts
// src/shared/channel-loop.ts（新，公共库：通道包交给循环板的默认条目）
export type ChannelTrigger =
  | { readonly kind: 'peak-start' }
  | { readonly kind: 'command', readonly names: readonly string[] }
  | { readonly kind: 'quota-low', readonly usedPercent: number, readonly exhaustsWithinMinutes: number, readonly afterUsageMinutes: number }
  | { readonly kind: 'login-rejected' }
export interface ChannelLoopDefault {
  /** `<channel>:<name>`, matching /^[a-z0-9-]{1,16}:[a-z0-9-]{1,48}$/ */
  readonly id: string
  /** For people, plain words, 1-60 code points. */
  readonly title: string
  /** For people, plain words, 1-150 code points. */
  readonly why: string
  readonly when: ChannelTrigger
  /** channel: the channel package runs it and the loop board only lists it; loop-board: the loop board runs it. */
  readonly runBy: 'channel' | 'loop-board'
  /** runBy loop-board only: the English notice to the main agent, 1-400 characters; `{line}` is replaced with quotaLowLine or loginLine. */
  readonly tell?: string
}
/** The valid entries of a pricing service's `loopDefaults`; each invalid entry is dropped and reported to `problem` once by id. */
export function loopDefaultsOf(pricing: UsagePricing, problem?: (message: string) => void): readonly ChannelLoopDefault[]
```

- `nextPeakChange` 放在 `src/shared/pricing.ts`：它只依赖 `peak`，规则板 0.10 §3.2 与循环板 0.6 §4.3 也按这个位置写。从 `fromMs` 之后的下一个整分钟起按分钟调用 `peak`，返回第一个与 `peak(fromMs)` 不同的时刻；默认看 8 天（11,520 次调用），看不到返回 `undefined`。不知道套餐时段的形状，所以按分钟走；高峰在整点起止，结果精确到分钟。规则板最小一片已经把它加进 main（签名 `nextPeakChange(peak, fromMs, horizonMs?)`，与这里写的相同，测试在 `tests/peak-mode.spec.ts`），M6 不再加；Q1 只补测试里缺的时刻（§1.4 第 3 条的六个时刻，§15.1）。
- 高峰变化事件的来源（编排方裁定：GLM 包给高峰变化事件与高峰的计算）：GLM 包不调编排层的代码（split 0.3 §2.7 的边界），也不为此加推送或定时器；它给的是计价服务的 `peak(atMs)` 与公共库的 `nextPeakChange`，循环行照它们推出 `channel.peak-changed`（边、边界时刻、这一段的结束或下一段的开始），页面上「谁报」写 GLM 通道（循环板 §4.3）。GLM 包对这件事保证三点：`peak` 是时刻的纯函数（不读文件、不发请求、不看本机时区，`peakWindowAt` 按 UTC+8 判），所以每个项目、每个进程算出的边界相同；边界落在整分钟上；计价服务卸载时 `peak` 跟着没了，循环行按「计价服务不在」处理（循环板 §4.3：三个通道事件都不在事件表里）。
- 档位的服务不是本稿的契约：`glmHournessPeakMode` 的形状、`peakModeService` 与 `PeakModeState` 由规则板定（rules:§7.2），文件 `src/shared/peak-mode.ts` 已在 main。GLM 包只是读的一方，读 `stateFor(sessionId)` 的 `level`、`origin`、`peak` 与 `glmWorkerCap` 四项（§3.4；`at`、`until` 不读：提醒里的结束时刻取 `PEAK_END_LABEL`，它与 `until` 在 `creditPricing` 下都是 18:00）。服务形状不对时 `peakModeService` 回调 `problem` 并当作没有，GLM 包把它记成 `invalid`（§11）。
- `peakHours` 与 `peakHoursOf`：GLM 包给 `credits.ts` 的 `PEAK_HOURS`（§3.4）。读的一方：规则板的英文文字（rules:§6.4 的高峰一行、脚本自查的文字与默认规则一行）用 `en`，规则页与默认规则 `title`（rules:§3.1）的中文用 `zh`，没有时省去括注（M6-R6，规则板 0.10 已照做）；`/glm-status` 与面板的高峰行不用它（中文行已有「GLM 积分套餐」与 `basis` 的时段说明，`basis` 本身由 `PEAK_HOURS.zh` 拼成）。不是对象或两个成员不是字符串时告警一次、当作没有；任一个超过 80 个字符或含换行时当作没有。
- `peakLine` 的文字只用服务给的 `plan`：「高峰：高峰中，到 18:00（GLM 积分套餐）」「高峰：不是高峰；下一个高峰 明天 14:00（GLM 积分套餐）」。编排层不写任何套餐的系数与时段（`CHARTER.md` §3 两组目标的边界）。
- `quotaLines` 渲染 §4.8 的额度一段（含登录被拒那一行）；GLM 包与编排层包用同一个函数，两处输出相同。
- `quotaLowOf`：只看 `five-hour` 与 `weekly`；`usedPercent ≥ rule.usedPercent`，或预估为 `exhausts` 且 `at − now ≤ rule.exhaustsWithinMinutes` 分钟时算「快用完」；两个窗口都算时取已用比例高的；`spent`（已用完）也算。MCP 窗口不算：它用完时 GLM 的模型请求照常。
- `quotaOf`、`loopDefaultsOf` 的形状检查：成员不存在时返回 `undefined` 或空数组，不告警（旧 GLM 包）；存在但类型不对时告警一次、当作不存在，不影响其余成员。`quota()` 抛错或 promise 被拒时，使用方显示「额度：读取出错（消息前 80 字符）」并告警一次。`loopDefaultsOf` 按 §11 的规则逐条校验。
- 提供方：`login-row.ts` 激活时把 `{...creditPricing, quota: request => reader.view(request), loopDefaults: GLM_LOOP_DEFAULTS}` 交给 `ctx.provide`。`reader` 是 `src/glm-llm/quota.ts` 的 `createQuotaReader({adapter, home, fetchImpl, now})`；`GLM_LOOP_DEFAULTS` 是新文件 `src/glm-llm/loop-defaults.ts` 里冻结的四条（§8.2）。`creditPricing` 本身仍是不带 `quota` 与 `loopDefaults` 的冻结常量（标定与探针脚本用），带 `peakHours`。`credits.ts` 新导出 `rateShareAt(ms)`、`PEAK_HOURS`、`PEAK_END_LABEL`。
- 契约测试（`tests/contracts.spec.ts`）：有与没有三个新成员的服务都能读出积分；任一个新成员形状不对只丢它自己；`quota` 被拒时面板照常输出；`loopDefaultsOf` 丢掉 id 不合格、`runBy: 'loop-board'` 而没有 `tell`、`title` 超长的条目，各告警一次。

## 6. 面板与晨报（编排层包）

### 6.1 `/hourness` 的输出

```text
# 晨报 2026-10-30
## 例外（先看）
…
## 决策曲线
…
## 用量（今天）
- 合计：积分 12.40 · 高峰 35% · 缓存命中 71%
- glm-5.3-flash：40 次 · 积分 9.10 · 高峰 30% · 缓存命中 74%
- 不计积分（不在 GLM 积分套餐内）：deepseek-flash 12 次

## 面板
- 高峰：高峰中，到 18:00（GLM 积分套餐）
- 全部用量记录；高峰为工作日 14:00–18:00（UTC+8），其余时段按 50% 计积分；高峰占比按积分计
- 范围：384 条用量记录，最早 10-27 17:30；只含经 DSH 发出的请求，ZCode 等其他客户端的消耗不在内
- 缺口：10-29 11:12 删去 806 条（旧 pi-ai glm 路由的记录，按用户要求删除）；这些调用不在本节的数字里
- 合计：积分 … · 高峰 …% · 缓存命中 …%
- glm-5.3：19 次 · 积分 …
…

## 额度
（§4.8 的额度一段，来自计价服务的 quota）
```

- 「用量（今天）」与「面板」用同一个函数。签名（`src/report/panel.ts`、`src/workflow/morning-report.ts`）：

```ts
// panel.ts
export function usagePanelOf(values: readonly unknown[], pricing?: UsagePricing, problem?: (message: string) => void, unparsed?: number): UsagePanelData
export function usagePanel(usageRaw: string, pricing?: UsagePricing, problem?: (message: string) => void): UsagePanelData // 解析每行，JSON 不合法的行计数后作为 unparsed 交给 usagePanelOf
export interface PanelLineOptions { readonly basis?: boolean } // 默认 true
export function usagePanelLines(panel: UsagePanelData, options?: PanelLineOptions): string[]

// morning-report.ts
export interface ReportInput { /* 现有四个字段不变 */ readonly pricing?: UsagePricing; readonly problem?: (message: string) => void }
export interface ReportOptions { readonly pricing?: UsagePricing; readonly problem?: (message: string) => void }
export async function reportFromFiles(fs: ReportFs, homes: DataHomes, period: string, since?: string, options?: ReportOptions): Promise<string>
```

  `morningReport(input)` 仍是同步纯函数：它把 `input.usage` 交给 `usagePanelOf(input.usage, input.pricing, input.problem)`，用 `usagePanelLines(panel, {basis: false})` 渲染。`{basis: false}` 只省去口径说明那一行（`pricing.basis`，在面板一节写一次）；没有计价服务时的「没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token」一行照常保留，两节各有一行（§1.4 第 2 条）。`renderHourness` 把 `options.pricing`、`options.problem` 经 `reportFromFiles` 的第五个参数传下去。晨报的「无法读取的记录 N 条」只算本期里时刻能解析的行：`reportFromFiles` 的 `inPeriod` 先按 `at` 筛掉时刻解析不了的行，这些行只在面板一节计入（面板读全部记录）。`morning-report.ts` 的 `usageByModel` 没有别的使用者（只有 `morningReport` 与 `tests/workflow.spec.ts`），删去，测试里它的用例改为新口径。
- 高峰行只在有计价服务时出现，放在面板第一行。
- 额度一节只在计价服务有 `quota` 时出现；服务在而没有 `quota` 时写一行「额度：GLM 通道包没有提供额度数据」；没有计价服务时不写这一节（面板第一行已经说了没有计价服务）。
- `/hourness` 等额度至多 3 秒（`quota({waitMs: 3000})`）。
- `hourness` 行健康的说明在「积分口径：…」之后加「额度：已提供」或「额度：未提供」，状态不变。

### 6.2 覆盖范围与历史缺口

- 范围一行：可读的用量记录条数与最早一条的时刻（`formatMoment`），以及「只含经 DSH 发出的请求，ZCode 等其他客户端的消耗不在内」。修正前与无法读取的记录照旧另起一行报条数。
- 缺口记录：文件 `<userHome>/audit/usage-gaps.jsonl`，`auditPaths` 加 `gaps`。写 2026-10-29 那一行是 agent 定的事（§19，人可推翻）：文件在插件自己的用户级数据目录里，约 250 字节，删掉即撤销；不写时面板看不出删过 806 条。用量流水本身仍只有用量记录一种形状：它的读者（面板的 `usagePanelOf`、标定运行器）都按用量记录解析，混进别的形状会被计为无法读取。一行的字段：

| 字段 | 必填 | 类型与上限 | 含义 |
| --- | --- | --- | --- |
| `at` | 是 | ISO 8601，能解析 | 删记录的时刻 |
| `removed` | 是 | 整数，1–10,000,000 | 删了多少条 |
| `reason` | 是 | 字符串，1–300 个字符 | 为什么删、谁要求的 |
| `detail` | 否 | 字符串，至多 300 个字符 | 按 provider 与模型的条数 |
| `from`、`to` | 否 | ISO 8601，`from` 不晚于 `to` | 被删记录的时间范围 |
| `ref` | 否 | 字符串，至多 200 个字符 | 留痕的出处 |

  不合法的行计为「无法读取的缺口记录 N 条」，其余照常。多出的字段忽略。
- 2026-10-29 那次删除的一行（P1 合入后由主 Agent 写一次，§16 G1；`at` 取改前备份文件名里的毫秒数 `usage.jsonl.bak-1793243554750`，`DESIGN.md` §2.4。G1 的命令用 `new Date(1793243554750).toISOString()` 算出 `at`，不手写；按同一个算式得 2026-10-29T03:12:34.750Z，UTC+8 11:12。对照：profile 备份 `bak-1793241992974` 是 02:46:32.974Z，两次清理相隔 26 分钟，先后一致）：

```json
{"at":"2026-10-29T03:12:34.750Z","removed":806,"reason":"旧 pi-ai glm 路由（8317 反代）留下的记录，按用户要求删除","detail":"glm/glm-5.3 796、glm/glm-5.3-flash 10","ref":"docs/DESIGN.md §2.4"}
```

  被删记录的起止时刻没有留下（备份已删），所以不写 `from`、`to`。数据里写到反代只是在陈述历史，没有任何代码识别或依赖反代路由（`AGENTS.md` 基线）。
- 面板：每条缺口一行（§6.1 的样子）。报告期：缺口没有 `from`、`to` 时，报告期开始早于 `at` 就在那一期的「用量」一节带这一行；有 `from`、`to` 时与报告期有交集才带。今天的报告期开始于删除之后，不带；M7 的周报若覆盖 10-29 之前就带。
- 以后谁删用量记录，就往缺口文件追加一行：写进 `docs/DEVELOPMENT.md` 的数据处理一节，作为流程约定（`CHARTER.md` §7.1 条款 11）。
- 额度一节不受缺口影响：服务端的读数包含删掉的那些调用与其他客户端。

### 6.3 晨报的「用量」一节

今天的晨报只有 `/hourness` 开头的本地日历日一份（`src/report/index.ts` `renderHourness`）。M6 只把它的「用量」一节换成 §6.1 的积分口径，标题改为「用量（今天）」。M7 的四答晨报（`ORCHESTRATION.md` §12「花费（积分、峰谷占比）」）沿用 `usagePanelOf`、`usagePanelLines` 与缺口规则，不另写一套。

## 7. 错峰与脚本自查：经规则板

### 7.1 复用规则板的什么（规则板设计 0.10；0.4 按 0.8 写，节号没变，意思变了的在表里写明）

| 复用 | 规则板 0.10 的出处 |
| --- | --- |
| 默认规则 `builtin:glm-peak-pricing` 的定义、代码规则目录、规则页上的默认规则一组、不能解除与「以它为模板新建」（0.1 的 M6-R4） | §3.1、§3.4、§10.1，规则板 R1、R4、R5 |
| `glm-peak` 由宿主在判定时经计价服务当场算，不进状态与流水；没有计价服务时读不出并写原因（0.1 的 M6-R1） | §3.2、§3.3、§5.6，规则板 R4 |
| 高峰模式：档位按项目存、只有人能改、四条附属条目（少做一条，不做三条：派 GLM 子 agent 的调用、GLM 子 agent 会话的工具调用、自报花 GLM 积分的脚本）、主 Agent 每步提醒里的高峰与档位一行；主 Agent 自己不受管（`d-main-agent-peak-exempt`）；读不出是不是高峰时三档都不拦；档位经服务 `glmHournessPeakMode` 交出（GLM 包的提醒读它，§3.4） | §3.6、§6.4、§7.2 |
| 条件 `condition` 的信号比较 `{"signal": "glm-peak", "is": true}`；条件读不出默认不生效（`onUnknown: skip`） | §2.3 |
| 事件与筛选（0.8 叫动作类）：`gate.tool-call`（`filter.command` 用不区分大小写的 `matches` 正则，只看前 8 KiB；`filter.glmSpend`，只在 `checkCall` 里有，只给代码里的条目）、`gate.dispatch`（`filter.model`、`targetModel`） | §2.2 的对照表、§2.3、§6.5 |
| 执行方式 `queue`：当场拒绝并开等待单 | §2.2、§6.2 |
| 等待单：同签名去重、子 agent 结束后转交派发链的根、由拥有它的宿主每 5 秒重判、条件解除时按 agent 状态 `steer`、`inject` 或 `followup` 唤醒、24 小时过期 | §6.3 |
| 给模型的排队文字、每步提醒、唤醒消息的格式（不做档给子 agent 与派活的文字已写出「until 18:00」；主 Agent 不收到不做档的工具调用排队文字）；脚本自查命中两条附属条目时的文字（写出条目 id、档位的来源与「until 18:00」，时刻取 `CheckOptions.peakUntil`） | §6.4 |
| 规则与档位只由人写；agent 经 `rules_propose` 提议，人的原话经 `graph_decide` 转述生效 | §2.5、§9.3 |
| 库入口 `checkCall(call, options)` 与命令行 `check`：与工具调用门同一个判定，退出码 4 拦截、5 排队；不开等待单、不写规则板的文件、不取锁；`glm-peak` 先取调用方给的 `signals`，否则 45 秒内的宿主心跳，都没有时读不出；选项另有 `peakUntil`（这一段高峰的结束）与 `waitedMs`（从第一次判定起等了多久）；每一次判定恰好交一条指标事件 `rules.check`，经指标流水在 DSH 之外的库写入口写，写入口不在时什么都不写、判定不变；命中人同意过的拦路脚本时经共用的执行器跑它，超时按条目的做法判、不在后台接着跑 | §9.4、§6.7、§10.5 |
| 规则页列出生效的规则、默认规则、档位与在等的单 | §9.1 |
| 晨报的规则板一节与其余指标事件 | §10.5，规则板 R7 |

规则板没有租约（rules:§4、§10.7），所以 0.1 写的「脚本启动沙盒前取租约」不复用；脚本自查直接调用 `checkCall`（§7.2 第 2 条）。

没有用 DSH 的定时提醒 `schedule` 做推迟（先搜再造）：它在一个时刻往创建它的会话投递一条用户消息，不看条件、不去重、子 agent 的会话不能创建（`ORCHESTRATION.md` §11.4 的实读）；规则板的等待单按条件解除唤醒，去重并能转交。时间触发的例行工作归循环板，它复用 `schedule`（design-context 的 Schedules 一条）。

### 7.2 M6 加的（M6-R2、M6-R3）

规则板采纳了 0.1 的 M6-R1（`glm-peak` 由宿主当场算）与 M6-R4（默认规则进目录），由它自己的 R1、R4 交付（rules:§3.5），M6 不再做；M6-R6（时段说明读 `peakHours`）规则板 0.10 也已写进它的 §3.1、§3.2、§6.4、§9.1。0.1 的「在 `nextPeakChange + 1 秒` 另重判一次」也不要：等待单由拥有它的宿主每 5 秒重判（rules:§6.3）。M6 剩下两处：

1. M6-R2 文字写出时刻（接在 rules:§6.4）。规则的条件里引用了 `glm-peak`、而且此刻 `glm-peak` 读得出时，三处文字带上时刻，时刻是 `nextPeakChange(peak, now)`，按 `formatMoment` 写（同一天写 `HH:MM`）：
   - 排队文字的 Boundary 段，在「defers it while」之后写「glm-peak is true until 18:00」；拦截文字同理写「blocks it now: glm-peak is true until 18:00」。
   - 每步提醒的等待单一项，在「(deferred since 14:06)」之后加「, until 18:00」。
   - 唤醒写「[rules board] Ticket q-12 cleared: glm-peak ended at 18:00. You may run the deferred call again: …」。时刻是 `nextPeakChange(peak, 单的开单时刻)`，在唤醒时现算，不往单上加字段（单已经记着开单时刻，存储格式不变）。只在重判时 `glm-peak` 已为假时这样写；条件里还有别的项、是别的项先变的，照 rules:§6.4 原样写。
   - `nextPeakChange` 返回 `undefined`（8 天内看不到变化，只在 `peak` 不是 GLM 的时段表时可能）或 `glm-peak` 读不出时不写时刻，文字照 rules:§6.4 原样。
   - 不做档的排队与唤醒文字（rules:§6.4）已写出「until 18:00」「at 18:00」：用同一个渲染函数，时刻同样来自 `nextPeakChange`。
   - 实现位置：规则板的文字渲染（R4 的 `src/rules/` 下渲染函数）加一个可选参数 `peakUntil`；L2 用例在规则板的测试文件里（§15.1）。
2. M6-R3 脚本按项目规则与高峰模式自查（接在 rules:§9.4 的 `checkCall`）。今天只有 DSH 里 agent 的工具调用经过规则板的门；Kiro 里的 agent 与人直接跑的 `npm run calibrate`、`npm run smoke:authorized` 不经过它，而它们正是花积分的运行，`d-peak-mode` 点名的练习题与消融也都经 `npm run calibrate`（注入清点报告 §8）。
   - 入口：新文件 `scripts/rules-gate.mjs` 导出 `gateOnRules({glmSpend, peakAt, now?, sleep?, checkModule?, pricingModule?, projectRoot?})`。`glmSpend` 必填，`'optional' | 'necessary'`，由调用点写死（§11）；`peakAt` 必填，`(atMs: number) => boolean`；后五项只给测试注入（时钟、睡眠函数、规则库与公共库编译产物的路径、仓库根；编译产物默认 `packages/hourness/dist/rules/check.js` 与 `packages/hourness/dist/shared/pricing.js`，仓库根默认 `scripts/` 的上一级）。
   - 命令文本：`npm_lifecycle_event` 存在且匹配 `^[a-z0-9:_-]{1,64}$` 时为 `npm run <它>` 加 `process.argv.slice(2)` 以空格连接；否则为 `node <脚本相对仓库根的路径，斜杠写法>` 加同样的参数。
   - 导入：`gateOnRules` 用动态 `import()` 取 `checkCall` 与 `nextPeakChange`（公共库编进每个包，split 设计；同 `run-calibrate.mjs`:27 从 `packages/glm/dist` 取 `credits.js`，要求先 `npm run build`）。导入失败（没有 build、规则板还没合入、文件坏了）或没有这两个导出：标准错误写一行「rules gate: rules board not available (<消息前 80 字符>); starting without the check」，照常开始。
   - 判定：每次判定前现算 `signals`。`peakAt(now())` 返回布尔时给 `{'glm-peak': 值}`；为真时另给 `peakUntil`，即 `new Date(nextPeakChange(peakAt, now())).toISOString()`（`nextPeakChange` 返回 `undefined` 时不给），规则板的脚本文字里的「until 18:00」「after 18:00」取它（rules:§6.4）；抛错或不是布尔时 `signals` 与 `peakUntil` 都不给（`checkCall` 改读宿主心跳，rules:§9.4），标准错误一行写原因。`--wait` 的第二次起另给 `waitedMs`：从第一次判定起的毫秒数，取整，至多 8 小时（rules:§12 的上限）。然后调用 `checkCall({tool: 'pwsh', args: {command}}, {project: <仓库根>, signals?, peakUntil?, glmSpend, waitedMs?})`，没有值的选项不写键（`exactOptionalPropertyTypes`）。仓库根默认是 `scripts/` 的上一级（`new URL('..', import.meta.url)`，测试用 `projectRoot` 换成临时仓库）；`checkCall` 按 `projectOf`（`src/data/project-root.ts`）算项目根，工作树经 `commondir` 回到主检出，同一个项目，规则状态读 `<项目根>/docs/rules/` 与 `<项目根>/.llm/rules/`（`d-rules-in-repo`，rules:§7.1、§9.4），不读用户级目录。没有会话、模型与角色，所以只有不带 `subjects` 的规则与 `glm-spend` 一类的条目管得到脚本（rules:§9.4 的表，主体没给即不命中；`judge` 不另开口子，0.2 的「先筛主体」与「从 `cli.ts` 抽出」都删去）。
   - 结果：`exitCode` 为 0（放行、只告知、只记录）时照常开始，不输出。为 4 时标准错误写 `CheckResult.text`（四段式拒绝文字；命中人同意过的拦路脚本时 `text` 里写脚本的路径和它的理由，rules:§6.4），`process.exit(4)`。为 5 时标准错误先原样写 `CheckResult.text`（规则板的排队文字：命中附属条目时写条目 id、档位的来源与结束时刻，rules:§6.4；命中人设规则时写规则、设的人与条件），再写一行「rules gate: <命中的规则 id，逗号分隔> queues this run[; GLM peak ends at 18:00]. Rerun with --wait to wait.」，`process.exit(5)`。
   - 拦路脚本（`d-boards-as-hooks`、`d-script-timeout`）：`checkCall` 对命中的人同意过的拦路脚本经共用的执行器跑，退出 2 判拦下、3 判排队、0 放行，超时或崩溃按条目的做法判（缺省放行）、不在后台接着跑（rules:§9.4、§6.7）。所以 `gateOnRules` 比 0.4 写的时候可能多等：命中的脚本里最长的那个超时（缺省 10 秒，每条至多 30 秒，rules:§1.3）。`gateOnRules` 不设自己的超时，不跑脚本，不起后台进程；晚到的拦下和跑满 10 分钟的后台处理只发生在 DSH 里的工具调用上（规则板的门，rules:§6.7），仓库脚本启动前没有这一路，因为 `checkCall` 本来就不留后台进程。`--wait` 下每次重判都会再跑一次命中的脚本。M6 不写、不提议任何脚本条目。
   - 时刻只在 `CheckResult.signals` 里有 `glm-peak` 一项且值为真时写（`signals` 只列命中的规则在条件里引用到的信号，rules:§9.4）；这时 `until = nextPeakChange(peakAt, now)`，与交给 `checkCall` 的 `peakUntil` 是同一个值。命中的规则不引用 `glm-peak`，或此刻 `glm-peak` 为假，都不写时刻（设计评审 N13）。
   - `--wait`：由 `gateOnRules` 从 `process.argv` 里取出并去掉，不传给脚本原来的参数解析（`run-calibrate.mjs` 用 `parseArgs`，未知参数会报错）。知道 `until` 时标准错误写「rules gate: waiting until 18:00」，睡到 `until + 1 秒`（至多 8 小时）再判；不知道时写「rules gate: re-checking every 60 s for up to 8 h」，每 60 秒重判一次。每次重判都重新算 `signals`。重判放行就照常开始；累计 8 小时仍是排队，就照上面写结果并 `process.exit(5)`。
   - `checkCall` 抛 `RulesCheckError`（`usage` 或 `io`）：标准错误告警一行（带 `code`），照常开始（规则板自己的故障偏向放行，rules:§11.2）。`usage` 只会来自本文件交错了选项（例如 `waitedMs` 超过上限），L2 钉住每种选项组合都合规则板 §12 的校验。项目还没有任何规则状态时，`checkCall` 按空状态判（rules:§9.4）；档位缺省为少做（`d-peak-mode`，`effectivePeakMode`），所以从没碰过规则板的项目里，`npm run calibrate` 在高峰同样排队。
   - 调用点：`run-calibrate.mjs` 在解析参数与做任何事（包括 `requireDesktop`、建沙盒、读凭证、发请求）之前 `await gateOnRules({glmSpend: 'optional', peakAt: at => creditPricing.peak(at)})`，`creditPricing` 加进它已有的 `credits.js` 导入。`smoke-zcode-authorized.mjs`（经 `--experimental-strip-types` 跑，已从 `../src/` 导入）同样在最前面调用，`glmSpend: 'necessary'`，`peakAt` 用 `../src/glm-llm/credits.ts` 的 `creditPricing.peak`。探针不花积分，不调用。
   - 自报值的理由：练习题与对照实验是 `d-peak-mode` 点名的重活，可挪，所以 `optional`。真网冒烟是改了通道之后的一次一致性核对，结果挡后面的合入，积分少（一次几十次调用），算 `necessary`：少做档照常跑，不做档照样排队（agent 决定，§19，人可推翻）。
   - 仓库脚本没有等待单，也没有谁去唤醒它：`d-peak-mode` 里「高峰结束后自动接着做」在脚本上的做法是 `--wait`。没带 `--wait` 时由跑它的人或 Kiro 里的 agent 决定什么时候重跑；退出码 5 的那一行写明了 `--wait`。
   - 看得见（`d-rules-visible`）：`gateOnRules` 自己不带任何规则，挡住脚本的只有规则板上的条目（默认规则管脚本的两条附属条目，少做的 `builtin:glm-peak-reduce` 与不做的 `builtin:glm-peak-stop-scripts`，加上人设的规则与人同意过的拦路脚本），它们都在规则页上。每个脚本自报什么写在调用点、`docs/DEVELOPMENT.md` 的练习题与真网冒烟两节（§17）。
   - 留痕（编排方裁定，设计评审第 3 轮 F9）：每一次判定（含 `--wait` 期间的每一次重判与最后放行的那一次）的指标事件由 `checkCall` 自己写，一次判定恰好一条 `rules.check`，带执行方式、退出码、命中的规则、档位与它的来源、`glmSpend`、`glm-peak` 的来源、读不出的信号名、`waitedMs` 与调用方（rules:§9.4、§10.5）；`checkCall` 在 DSH 之外经指标流水的库写入口写，按项目根找到这个项目 `.llm/` 里的指标流水（`d-rules-in-repo`，rules:§9.4；0.4 写的 `userDataHome()` 作废）。`gateOnRules` 不写判定事件，也不导入任何指标出口：同一件事只有一个写的人，事件的字段也只在规则板一处定。`gateOnRules` 对留痕负责的是交对选项：`glmSpend` 由调用点写死，`waitedMs` 只在重判时给，`peakUntil` 只在 `glm-peak` 为真时给（§1.4 第 22 条钉住）。指标流水的库写入口没到位之前，判定只出现在运行的标准错误里，这是指标流水那一步的事，M6 不另设临时写法。
   - 没有影子期（agent 定，§19，人可推翻）：宪章 0.7 §6 要求写在代码里的新门禁先影子后拦截。`gateOnRules` 不是新的判定：挡住脚本的是规则板上人定的条目（`d-peak-mode` 的默认档位少做与它的附属条目，或人自己设的规则），`gateOnRules` 只是把这个判定带到两个脚本的启动处；条件是工作日 14:00–18:00 加脚本自报的值，误伤面小；读不出、导入失败、规则状态读不出时都放行；人随时可以用 `/rules peak 无影响` 撤下。没选先影子：那样默认档位在这两个脚本上要晚几天才生效，而这是人已经定了的做法（「默认少做」「不做重活，例如练习题」）。`rules.check` 事件本来就记每一次判定，要看误伤随时可以从里面数。
   - 0.3 的 M6-R7（附属条目一行列出最近 7 天自报过的命令与自报值，读 `rules.check`）规则板 0.10 仍推后到指标流水有读接口之后（rules:§10.7 M6 第 5 条，附录 E），M6 不挡。

M6 不设、不提议任何排队或拦截规则。人想要更严的，在规则页里加（或以默认规则为模板新建），或在对话里告诉主 Agent，由它经 `rules_propose` 加人的原话转述设上（rules:§2.5、§9.3）；想改档位，在规则页或 `/rules peak` 里选。

### 7.3 人以后可以加的规则（例子，M6 不设）

这两条只是写法示例，用来钉 §1.4 第 16 条的测试夹具，不进任何默认状态，也不由 agent 提议。形状取规则板 0.10 的「什么时候 + 筛选 + 条件 + 动作」（rules:§2.2）；0.4 写的 `when` 为条件、`action: {class: …}`、`effect` 是 0.8 的写法，作废。L2 把夹具交给规则板的规则校验，规则板的形状一改，夹具跟着失败。它们不是给主 Agent 的示范：写规则的示范归规则板的 `rules_propose`（`d-agent-examples`）。

积分重活排到谷段（档位为无影响时，人想管住花真网积分的冒烟，就要这样一条；少做与不做档已经管到练习题）：

```json
{
  "id": "r-offpeak-credit-runs",
  "title": "高峰时积分重活排到高峰结束以后",
  "scope": "project",
  "when": { "kind": "event", "events": ["gate.tool-call"] },
  "filter": { "command": { "matches": "^\\s*npm\\s+run\\s+(calibrate|smoke:authorized)\\b|^\\s*node\\s+scripts[\\\\/](calibrate[\\\\/]run-calibrate|smoke-zcode-authorized)\\.mjs\\b" } },
  "condition": { "signal": "glm-peak", "is": true },
  "action": { "kind": "queue" },
  "lifetime": { "kind": "until-lifted" },
  "reason": "（人写）高峰时 GLM 按全价计积分，练习题、对照实验与真网冒烟等到高峰结束"
}
```

- 命令文本用 `filter.command` 的 `matches`（一个不区分大小写的正则，只看前 8 KiB，rules:§2.3）；0.8 的 `patterns` 数组要用 `|` 合成一个正则。这里有真网冒烟与 `node` 直接跑的写法（脚本自查的命令文本就是这两种形式，§7.2 第 2 条）。
- 没有 `role`、`model`、`session` 筛选：DSH 里任何 agent 与仓库脚本都受它约束（脚本只受没有这几个筛选的规则管，§7.2 第 2 条）。
- 它是普通条目，不带脚本；存在项目仓库的 `docs/rules/rules.json`，人同意后即刻生效，没有试运行（`d-boards-as-hooks`）。

高峰时 GLM 会话的新派发等到谷段：

```json
{
  "id": "r-offpeak-dispatch",
  "title": "高峰时 GLM 会话的新派发排到高峰结束以后",
  "scope": "project",
  "when": { "kind": "event", "events": ["gate.dispatch"] },
  "filter": { "model": { "matches": "^[^/]*/glm" } },
  "condition": { "signal": "glm-peak", "is": true },
  "action": { "kind": "queue" },
  "lifetime": { "kind": "until-lifted" },
  "reason": "（人写）高峰时 GLM 会话派出的子 agent 等到高峰结束"
}
```

它就是 rules:§2.6 的例子「GLM 高峰时新的派发等到谷段」，筛选与默认规则相同（`filter.model` 的 `^[^/]*/glm`，即 0.8 的 `*/glm*`，规则页「以它为模板新建」预填的就是这个）。`filter.model` 看的是调用方会话的路由（rules:§2.3），不是子 agent 用的模型；要按被派的模型筛是 `targetModel`（`dispatch_task` 的 `model` 参数，rules:§2.3）。

### 7.4 不设预算

- M6 不加排队或拦截规则。高峰里被推迟的只来自两处：人选的档位（规则板的附属条目：少做时自报可挪的脚本；不做时自报的脚本、GLM 子 agent 的工具调用与派 GLM 子 agent 的调用；主 Agent 自己的不在内），与人自己设的规则。出厂档位少做是人定的（`d-peak-mode`），不是 M6 替人定的。
- 排队只是推迟到高峰结束，不是拒绝：工作日高峰至多 4 小时；周末与夜间不排。等待单 24 小时过期（rules:§6.3）在这里不会触发。
- 额度与预估只给人看：没有代码按额度、积分或预估去拦截、推迟、限速、换模型或换套餐（`CHARTER.md` §6）。循环板「额度快用完」那一条只叫主 Agent 转告人，并写明「不要因此换模型或套餐，除非人要求」。额度用完时请求由服务端拒绝（1308），通道照常把错误交回 DSH。
- 交互中的对话与主 Agent 自己的工具调用：任何一档都不拦、不排队、不暂停 goal（`d-main-agent-peak-exempt`）；不做档只排 GLM 子 agent 的工具调用与派 GLM 子 agent 的调用（规则板，rules:§3.6），那是人选的，对象是被派的子 agent。

### 7.5 留给以后的

- 派发按任务是否紧急排队：任务节点今天没有这个属性（`src/graph/schema.ts` 的派发属性只有 `kind`、`tier`、`worktree`、`outputSchema`、`writeScope`），加属性要改图的 schema 与 M7 的派发设计；没有使用者之前不加（`CHARTER.md` §7.1 条款 2）。记给 M7。
- `dispatch` 动作按被派子 agent 的模型匹配：主体今天只看调用方会话（rules:§6.5）；要按被派的模型匹配，是在词汇里加一种主体（rules:§2.3 末段）。记给 M7。
- 巡检定时避开高峰：循环板设巡检时刻时，取高峰之外的时刻；M6 只提供 `nextPeakChange`。

## 8. 循环板上的 GLM 条目

### 8.1 人的要求与边界

人对循环板（特性 `schedules`）的话：「新增一个循环任务或者定时任务面板如何？我们那些美化工作放成默认的，用户也可以自定义一些任务比如服务器巡查啊之类的，和钩子系统联动起来」；「我想让你把这些和GLM插件自带的功能做到这个面板的默认功能里去，而不是写死进代码里」；「默认的东西先暂时不能修改、开关，只能看」。编排方把联动分了三层，其中 GLM 插件自带的一层是：高峰开始与结束时按高峰模式收放活；额度快用完时提前告诉人；登录过期时提醒重登（`schedules` 节点 2026-10-30 的批注）。

本节只定 GLM 包这一侧：交出哪几条条目、条目的数据长什么样、背后的事实（额度、登录状态、高峰时刻）从哪读；条目怎样显示、怎样触发与投递，写成对循环板设计的要求（§8.4）。循环板设计 0.3 照本稿 0.3 的形状读（它的 §3.4：`channelEntries` 把四条换成自己的条目，M6-L1 到 M6-L5 逐条落实），契约不用改；条目的最终格式以循环板设计为准，它与这里不同时只改 `src/shared/channel-loop.ts` 与 `src/glm-llm/loop-defaults.ts` 两个文件。

两条边界：

- 条目由 GLM 包声明，循环板只读列出与执行。编排层包不含任何模型的方言（`hourness` 目标的非目标「模型专属的提示词、工具别名与计价口径由各自的通道包提供」），所以 GLM 专属的条目不写进循环板的代码；别的通道包以后也可以用同一个成员交出自己的条目。
- 只装 GLM 包时没有循环板，也没有主 Agent。GLM 包自己必须照常做的事（高峰提醒、看状态时读额度）仍由 GLM 包执行（`glm-house` 验收第 4 条），循环板只把它们列出来，让人看得见（`d-rules-visible`）；这同规则板只读列出代码里的规则（rules:§10.1）。

四条是插件带来的默认条目（数据）。它们的动作是「告诉主 Agent」（`tell`）或由 GLM 包自己做（`channel`），没有一条在循环板上跑命令、检查或脚本，所以不走人加条目的那条批准路径（design-context 的 Check entries seam、循环板 0.6 §7.1 管的是会跑东西的条目）。

### 8.2 四条条目

`src/glm-llm/loop-defaults.ts` 导出冻结的 `GLM_LOOP_DEFAULTS`：

| id | `title`（给人看） | `why`（给人看） | `when` | `runBy` | `tell`（给主 Agent，英文） |
| --- | --- | --- | --- | --- | --- |
| `glm:peak-reminder` | GLM 高峰开始时提醒模型 | 高峰时段里 GLM 按全价算积分，其余时段半价。每段高峰里，GLM 会话的第一步会收到一句提醒，说法跟着你选的高峰档位走。这一条由 GLM 通道包自己做，不装编排层也照常。 | `{kind: 'peak-start'}` | `channel` | 无 |
| `glm:quota-on-command` | 看状态时读一次 GLM 额度 | 你敲 /glm-status 或 /hourness 时，向服务端读一次额度，60 秒内不重复读。这一条由 GLM 通道包自己做。 | `{kind: 'command', names: ['glm-status', 'hourness']}` | `channel` | 无 |
| `glm:quota-low` | GLM 额度快用完时告诉你 | 5 小时或每周额度用到 80%，或照现在的速度一小时内会用完时，主 Agent 在下一次回话里告诉你一句。每个额度周期只说一次。只在 GLM 有新用量、上次读数满 15 分钟时才去读额度。 | `{kind: 'quota-low', usedPercent: 80, exhaustsWithinMinutes: 60, afterUsageMinutes: 15}` | `loop-board` | `[GLM] Quota running low. Tell the human this line in your next reply: "{line}". Do not switch models or plans because of it unless the human asks.` |
| `glm:login-rejected` | GLM 登录失效时提醒你重新登录 | GLM 的登录被服务端拒绝后，GLM 的请求都会失败。主 Agent 在下一次回话里告诉你运行 /glm-login。 | `{kind: 'login-rejected'}` | `loop-board` | `[GLM] The GLM login was rejected; GLM requests fail until the human signs in again. Tell the human this line in your next reply: "{line}".` |

- `title` 与 `why` 只用人话（`d-plain-questions` 的换词表；M3 附录的 `plainWordsIn` 合入后由 L2 检查）。`why` 里不写时段的钟点：时段说明只有 `peakHours` 一份（§5），循环板要写钟点时取它。
- `{line}` 由循环板换成 `quotaLowLine` 或 `loginLine` 的中文一行（§5），主 Agent 原样转给人；外面的指示是英文，同本项目给模型的其他提醒。
- 门槛 80%、一小时、15 分钟是 agent 定的（§19）；默认条目只能看（`d-defaults-readonly`），人以后要别的门槛，加自己的条目。

### 8.3 高峰开始与结束：编排层的两条，GLM 包只交高峰的计算

编排方的接缝裁定（design-context「Seam rulings between designs」第 4 条，2026-10-30 按循环板第 2 轮评审 F19 修订；末条是对规则板 0.7 评审 F59 的裁定）把这几件分给了别的模块：

- 高峰开始与结束时按档位收放活：执行在规则板（少做档主 Agent 的每步提醒、不做档对 GLM 子 agent 与派活的排队与解除，主 Agent 自己两档都不被管，rules:§3.6、§6.3、§6.4）；循环板上列为编排层自己的第 13 项 `loops.peak-start`（循环板 §5.2）。
- 高峰结束时叫醒闲着的主 Agent，少做与不做两档都叫（0.3 提的 M6-R5；两档里主 Agent 自己都照常干活，挪到高峰之后的活两档都有，循环板 0.6 §6.9 第 4 条）：循环板上编排层自己的第 14 项 `loops.peak-end`，来源写「项目编排带来的」。它要的是规则板的档位与主 Agent（M3 的持有者记录、M7 的 goal），GLM 包有档位可读（`glmHournessPeakMode`，§3.4），但没有主 Agent，所以这一项不归 GLM 包。0.3 写的理由「GLM 包不知道档位」不准，随裁定改成这一句（循环板 §17 对 M6 的第 2 条）。
- 高峰里主 Agent 剩下的只有被高峰模式挡着的活时：那几轮不计入 M7 的空转判定，M7 以自己的原因码（例 `hourness-peak-wait`）停住自动推进，经 `glmHournessExecute.runAction` 交 harness 动作 `resume-drive`；高峰结束时第 14 项先跑 `resume-drive` 再提醒主 Agent。规则板只交档位与「挡着的是不是高峰」（`peakHoldFor`，rules:§3.6、§10.7）。

GLM 包对这几件只交高峰的计算：计价服务的 `peak` 与公共库的 `nextPeakChange`，循环行照它们推出高峰变化事件 `channel.peak-changed`，页面上「谁报」写 GLM 通道（循环板 §3.4、§4.3；GLM 包对这个事件的保证见 §5）。`GLM_LOOP_DEFAULTS` 仍是四条，不加 `glm:peak-end`，`ChannelTrigger` 不加 `peak-end`（循环板 0.3 撤回了第 2 轮评审 F19 的这项请求）。时段说明用 `peakHours`（M6-R6）。`glm:peak-reminder` 在循环板上听的也是 `channel.peak-changed` 的开始一边，只是列出；GLM 包自己的高峰提醒照旧在 GLM 的请求里按 `source.peakWindow` 判，不听这个事件。

### 8.4 对循环板设计的要求

| # | 要求 | 读什么 |
| --- | --- | --- |
| M6-L1 列出 | 在「来自 GLM 通道包」一组只读列出 `loopDefaultsOf(pricing)` 的条目（`d-defaults-readonly`）：标题、为什么、什么时候做、谁执行；`runBy: 'channel'` 的写「GLM 通道包自己执行，这里只列出」。没有计价服务时这一组不显示（循环板 §3.4 照 plain-ui §2：只装编排层包时面板上不出现模型名；0.3 要的那一行「GLM 通道包未装，或它的 glm-login 行未启用」删去）。 | `pricingService(ctx)` 与 `loopDefaultsOf` |
| M6-L2 额度快用完 | 用量流水里出现新的 GLM 记录（`isGlmModel`）、而上一次读数（`quota({read: false}).reading.at`）已满 `afterUsageMinutes` 分钟时，调 `quota({waitMs: 3000})`；读完用 `quotaLowOf(view, when, now)` 判；命中、且这一期（窗口名相同、重置时刻相差 120 秒以内，§4.3）还没说过时，把 `tell` 的 `{line}` 换成 `quotaLowLine` 交给主 Agent。说过的期记在循环板自己的状态里。 | 编排层的用量流水；`quota`；`quotaLowOf`、`quotaLowLine` |
| M6-L3 登录失效 | 至多每分钟一次调 `quota({waitMs: 0, read: false})`（不发请求，§4.4）；`login.state` 由别的值变成 `rejected` 时交一次 `tell`（`{line}` 为 `loginLine`）；回到 `ok` 之后再变成 `rejected` 时再交一次。 | `quota`；`loginLine` |
| M6-L4 交给谁 | 额度与登录是账号一级的事，同一台机器上的项目共用一个 GLM 账号；同一件事只交一次，交给最近一次有活动的那个项目的主 Agent（`d-one-main-agent`）。主 Agent 自己用 GLM 而登录被拒时，它收到消息也回不了话；这时人会在 DSH 里看到请求失败，`/glm-status` 与 GLM pill 也写着登录被拒。循环板若有「主 Agent 回不了话时改在面板的『需要你』里显示」，这一条照用。 | 循环板自己的投递 |
| M6-L5 留痕 | 每次执行（交给主 Agent、读额度）记一条指标事件，由循环板写（§14.2 只列 GLM 包自己写的）。 | 指标流水 |

循环板合入之前，这四条条目的数据已经在计价服务里，没有谁读它们；GLM 包自己执行的两条照今天的样子工作。

### 8.5 为什么这样分

- 读额度的时机放在循环板：它在编排层包里，读得到用量流水，知道 GLM 是不是正在被用；GLM 包读不到用量流水（那是编排层 memory 行写的），也不该为此加定时器。只装 GLM 包时没有主 Agent 可告诉，「快用完」也就没有去处，不读是对的。
- 判「快用完」与「登录被拒」的函数在公共库与 GLM 包里：循环板只按条目的数据调用，不知道 GLM 窗口与令牌的细节。
- 投递交给循环板：一个项目只有一个主 Agent（`d-one-main-agent`），到点的事由 harness 交给它（design-context 的 Main agent direction），同晨报与巡检。

## 9. 只装一个包

| 能力 | 两包都装 | 只装编排层包 `dsh-hourness` | 只装 GLM 包 `dsh-glm-zcode` |
| --- | --- | --- | --- |
| 用量面板与「用量（今天）」 | 按积分 | 按 token，各一行「没有计价服务」 | 没有（用量流水由编排层的 memory 行写，`/hourness` 也在编排层） |
| 高峰行 | `/hourness` 与 `/glm-status` | 没有 | `/glm-status` |
| 额度与预估 | `/hourness` 与 `/glm-status` | 没有 | `/glm-status` |
| 覆盖与缺口 | `/hourness` | `/hourness` | 没有（没有用量流水） |
| 上游限额记录 | 写额度流水，两处显示 | 没有 | 写额度流水，`/glm-status` 显示 |
| 登录被拒 | `/glm-status`、行健康、循环板的提醒 | 没有 | `/glm-status`、行健康 |
| 高峰提醒（告诉模型） | 照旧，末句按规则板交出的档位选（§3.4） | 没有（它在 GLM 包） | 与今天逐字相同（读不到档位） |
| 高峰模式与主 Agent 的那一行 | 规则板（整块；最小一片只交档位）；`glm-peak` 由计价服务算；主 Agent 不受管 | 规则板；`glm-peak` 读不出，三档都不拦（rules:§3.3） | 没有规则板，没有档位 |
| 默认规则在规则页里 | 有，带 `glm-peak` 的值 | 有，`glm-peak` 读不出 | 没有规则板 |
| 脚本自查 | 有 | 有 | 有（三种组合相同：脚本在仓库里跑，从仓库源码或产物取 `creditPricing.peak` 与规则库，规则状态在项目的 `docs/rules/` 与 `.llm/rules/`（`d-rules-in-repo`），与桌面版装了哪个包无关） |
| 循环板上的 GLM 条目 | 四条列出，两条由循环板执行；高峰开始与结束两条是编排层的，依据 GLM 通道的高峰时刻 | 没有，这一组不显示；也没有 `channel.peak-changed` | 没有循环板；GLM 包自己执行的两条照常 |
| 指标事件 | 交给指标服务 | 没有 GLM 事件 | 没有指标服务，不交 |
| 新的配置项 `glm-login.plan` | 与 `glm-llm.plan` 设成相同 | 不涉及 | 与 `glm-llm.plan` 设成相同 |

`CHARTER.md` §3.1 第 4 条「不装编排层包时，通道、方言、高峰提醒与积分口径照常工作」：积分口径由 `credits.ts` 与计价服务保证；高峰提醒读不到档位，正文与今天逐字相同。

## 10. 宿主与网络契约（证据）

DSH（rc.3，接口对照表 `DESIGN.md` §2.4a）：M6 不新增任何钩子或服务种类，只扩已有用法。

| 契约 | M6 怎么用 | 证据 | 状态 |
| --- | --- | --- | --- |
| `ctx.provide(name, value)`：值归提供方 fiber，卸载时撤销，同名第二个提供方抛错 | `glm-login` 提供的计价服务值多三个成员（`peakHours` 字符串、`quota` 函数、`loopDefaults` 冻结数组） | cordis:800–830 | 〔实读〕已在用；激活期的抛错照旧降级为部分生效 |
| `ctx.get(name)`：不需要 inject，提供方未激活时为 `undefined`；对没有 tracker 的普通对象原样返回 | `/hourness`、规则板与循环板每次调用时读计价服务；函数成员与数组不被包装。`glm-prompt` 行在发高峰提醒的那一步读规则行提供的 `glmHournessPeakMode`（同一个读法，方向相反：编排层提供、GLM 包读，rules:§7.2） | cordis:763–766、84–90 | 〔实读〕已在用（设计评审第 2 轮复核）；`glmHournessPeakMode` 的形状与撤回由规则板最小一片的 `tests/peak-mode.spec.ts`、`tests/rules-row.spec.ts` 钉住（已在 main），GLM 包一侧由 §1.4 第 13 条的假服务钉住 |
| 会话 id：`sessionIdOf(agent)`（`agent.session.id`，rc.3 里 agent 与会话同 id） | `stateFor(sessionId)` 的参数 | `src/shared/health.ts`:84–87；rules:§2.3 主体「会话」一行 | 〔实读〕已在用（行健康按它报） |
| `commands.register`：处理函数可以是 async，结果 `success` 带 `text`；调用参数 `{commandId, agent, rawInput, attachments, signal}`，结果经 `withAbort(…, signal)` 等待 | `/glm-status`、`/hourness` 等额度至多 3 秒 | `DESIGN.md` §2.4a；commands:379–392 | 〔实读〕已在用；`dsh-commands` 的 lib 里没有超时，客户端一侧未查（§15.3 V6） |
| 规则板的执行边界（`tools/pre-execute`、`agent/pre-step`、`session/disposed`、唤醒用的 `steer`/`inject`/`followup`） | 不直接用；M6-R2 只改规则板的文字渲染，M6-R3 只调用规则库的 `checkCall`（不在 DSH 里） | rules:§6.1–§6.6 的证据 | 归规则板设计与它的 L3 |
| 行配置的 Schema（`Config` 导出，加载器按 `~standard` 校验与填默认值，不合时抛 `ValidationError`） | `glm-login` 行新导出 `Config`，带 `home`、`plan` | cordis:956–961；先例 `src/glm-llm/index.ts` 的 `Config`，已经桌面版 L4 | 〔实读〕 |

GLM 包内部（本仓库代码）：

| 契约 | 证据 | 状态 |
| --- | --- | --- |
| 非 2xx 响应在 `ZcodeAdapter.stream` 里抛 `glm-zcode <status>: <正文前 400 字符>` | `src/glm-llm/zcode.ts`:469 | 〔实读〕 |
| 模型请求的项目令牌被拒时带被拒指纹强制重铸一次、重试一次 | `src/glm-llm/zcode.ts`:455–469（`isProjectTokenRejection` :557） | 〔实读〕；`login-rejected` 的 `model` 路径接在这条路走完之后 |
| PAT 平面的请求失败照 3.17.1 带种类抛出：HTTP 状态为 `project_token_http_<status>`（429、5xx 是暂时的失败，还在有效期内的令牌照用），网络为 `project_token_network_error`，超时为 `project_token_timeout`；登录令牌为空为 `project_token_login_required` | `src/glm-llm/auth/project-token.ts`:81–108、313–314、367–376；`zcode-wire.ts` 的 `PROJECT_TOKEN_CODES`、`PROJECT_TOKEN_HTTP_CODE_PREFIX`（`8b12baf`） | 〔实读〕；`login-rejected` 的 `mint` 路径只看 `project_token_http_401`、`project_token_http_403` 与 `project_token_login_required`，在 `ZcodeAdapter.projectToken` 的 `.catch` 里写，抛出的码不变（§4.9） |
| 项目令牌经 `ZcodeAdapter.projectToken(credential)` 铸造与缓存，缓存按适配器实例，到期前 120–180 秒换新，重新登录换一代缓存；额度读取不传被拒指纹 | `src/glm-llm/zcode.ts`:240；`project-token.ts`:30–34、209–272、317–321 | 〔实读〕；铸造路径 m1-parity 沙盒真网验证过（`FACTS.md` §1） |
| `ZcodeAdapter` 的 `plan` 构造参数决定 `status()` 写的套餐与 `usageAuthorization` 读不读额度 | `src/glm-llm/zcode.ts`:355–358；`login-row.ts` 今天不传 `plan` | 〔实读〕；M6 改为传入 |
| 模型请求的 `x-request-id` 每次尝试新生成 | `src/glm-llm/zcode.ts`:436–437 | 〔实读〕；额度请求按同一做法 |
| `/glm-status` 的第一行由设置页解析；其余非字段、非健康表的行由 pill 原样显示 | `src/glm-llm/login-row.ts` `statusCommand`；`ui/src/channel.js`:249–250（`parseHealth`、`restOf`） | 〔实读〕 |

网络（只读接口，不是模型请求，不花积分）：

| 契约 | 证据（§4.1 的表） | 状态 |
| --- | --- | --- |
| `GET https://bigmodel.cn/api/monitor/usage/quota/limit`，超时 15 秒 | host:+1359354、+1359505、+1371449；origin 经 chunk:+594139 | 〔实读〕 |
| 请求头恰好 `authorization`（项目令牌原样）与 `x-request-id`（随机 UUID）；不加 ZCode 身份头 | host:+1374857（只放 `authorization`）、+1645564（`request`）、+1643371 与 +1643061（身份头只给 ZCode 端点）、+1610148（补 `x-request-id`）、+1895288（额度用这个 `apiClient`） | 〔实读〕（V2 关闭，设计评审 F7） |
| 401 与其他非 2xx：抛错，一条路径被 `.catch(() => null)` 吞掉，另一条让用量快照失败；都不重试、不重铸；`reason: "usage"` 带被拒指纹而没有 `expectedAccountScope` 时抛 `project_token_scope_invalidated` | host:+151499、+1361885、+1368565、+1278678 | 〔实读〕；本包照做（§4.2） |
| 成功判定与行的解析 | host:+1376124、+1347113、+1347695 | 〔实读〕 |
| ZCode 设置页 60 秒内复用用量快照 | renderer:+6189443 | 〔实读〕；别处有没有定时读〔未核实，V7〕 |
| 行的含义：`TOKENS_LIMIT` 为 5 小时与每周，`TIME_LIMIT` 为 MCP 工具调用；`number` 不可与 `remaining` 比较；`nextResetTime` 有秒有毫秒 | `zcode-api:server/routes-quota.ts`:45–62、124–143；`zcode-api:tui/frame.ts`:346–363、476–495 | 〔实读，他人 2026-10-12 的实测〕；与 ZCode 先取 `TIME_LIMIT` 的做法有出入，单位不明〔未核实，V3〕 |
| 网关对频繁查询限速 | `reference/zcode-api/README.md`:228 | 〔他人观察〕 |
| 429 正文 `{"error": {"code": "1308", "message": "…"}}`；1308、1310、1316–1321 的含义；1308 的消息带 `${next_flush_time}` | `docs/reference/bigmodel-guide-digest.md`:165（说的是 `open.bigmodel.cn`）；`FACTS.md` §2.5 | 〔文档〕；经 ultra 网关时的形状、时刻格式与时区〔未核实，V4〕；ZCode 没有这项处理 |
| 额度按积分计，非高峰的消耗按半价计入 | `FACTS.md` §2.4 | 〔推断，V5〕 |

## 11. 外部输入的校验

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| 额度接口的响应正文 | 是 | 至多 256 KiB；JSON 对象 | 超长：`too-large`；不是 JSON 或不是对象：`envelope:not-json`；按 §4.2 的表显示，可恢复，下一次读取再读 |
| 信封 `code`、`success` | 否 | `code` 为数字、数字字符串、`null`；`success` 为布尔 | 类型不对按不成功处理（`envelope:<code>`） |
| `data.level` | 否 | 字符串，去空白后 1–32 个字符 | 丢掉，不显示套餐档位 |
| `data.limits` 与每行 | 是（没有可用的行即 `no-windows`） | 数组，至多 32 行；每行的规则见 §4.3 | 不合法的行丢弃并计数；流水记丢弃数与出现过的键名（只记键名，不记值） |
| 429 正文的 `error.code`、`error.message` | 否 | `code` 为字符串或数字；`message` 为字符串，已截到 400 字符 | 不是 JSON 或没有这两个字段：不记上游限额，错误照常抛出 |
| 消息里的恢复时刻 | 否 | `YYYY-MM-DD[ T]HH:MM[:SS]`，按 UTC+8；须在 [现在, 现在 + 8 天] | 不写 `until` |
| 读回的额度流水行 | 是 | JSON 对象；`at` 能解析；`kind` 为四种之一；`reading` 的行符合 §4.3；`login-rejected` 的 `path` 为 `model` 或 `mint`，`status` 为 401 或 403，或 `code` 为 `project_token_login_required`；`login` 有时是 16 位小写十六进制 | 跳过并计数，写进 `glm-login` 的行健康 |
| 凭证文件（`credentials.json`）：元数据与登录令牌 | 否 | `stat` 成功；大小、修改时刻与上一次不同时才解密，记录里要有登录令牌 | `stat` 抛 `ENOENT`、大小为 0、解不开或没有登录令牌：`absent`（解不开时行健康写「凭证文件读不出，运行 /glm-login」一次）；`stat` 的其他错误：登录状态按 `ok` 算（不因读不到元数据误报被拒），行健康写原因一次 |
| 缺口文件的行 | 是 | §6.2 的表 | 计为无法读取的缺口记录，其余照常 |
| 计价服务的 `quota` 成员 | 否 | 函数；返回的 promise 解析为对象 | 不是函数：告警一次、当作没有；被拒或解析为非对象：「额度：读取出错」，告警一次 |
| 计价服务的 `peakHours` 成员 | 否 | 对象，`en` 与 `zh` 都是 1–80 个字符、没有换行的字符串 | 不是对象或成员不是字符串：告警一次、当作没有；超长或有换行：当作没有 |
| 计价服务的 `loopDefaults` 成员 | 否 | 数组，至多 16 项；每项：`id` 匹配 `^[a-z0-9-]{1,16}:[a-z0-9-]{1,48}$` 且不重复，`title` 1–60 个码点，`why` 1–150 个码点，`when.kind` 为四种之一且字段齐全（`usedPercent` 1–100、`exhaustsWithinMinutes` 1–1440、`afterUsageMinutes` 1–1440、`names` 1–8 个命令名），`runBy` 为两种之一，`runBy: 'loop-board'` 时 `tell` 为 1–400 个字符 | 不是数组：告警一次、当作空；不合格的项按 id 各告警一次、丢弃，其余照常 |
| `QuotaRequest` | 否 | `waitMs` 为 0–15,000 的有限数，`read` 为布尔 | `waitMs` 越界按 0 或 15,000 夹住；`read` 不是布尔按 `true`；类型由 TypeScript 约束，运行时只夹住数值 |
| 脚本的 `npm_lifecycle_event` | 否 | `^[a-z0-9:_-]{1,64}$` | 改用 `node <脚本路径>` 作命令文本 |
| `gateOnRules` 的 `glmSpend` | 是 | `'optional'` 或 `'necessary'`，由调用点写死，不从命令行参数或环境变量读 | 其他值：标准错误一行「rules gate: invalid glmSpend」，照常开始（失败放行，同规则板读不出） |
| `peakAt(atMs)` 的返回值（脚本自查） | 是 | 布尔 | 抛错或不是布尔：这次不给 `signals`，`checkCall` 改读宿主心跳，标准错误一行写原因 |
| `glm-login` 行配置的 `plan` | 否 | `coding-plan` 或 `start-plan`，默认 `coding-plan`（`Config` Schema） | 加载器按 Schema 拒绝这一行的配置（同 `glm-llm` 行今天的行为） |
| 规则库与公共库的编译产物 | 否 | 能动态导入，分别导出 `checkCall` 与 `nextPeakChange` 函数 | 导入失败或没有这个导出：标准错误一行，脚本照常开始（§7.2 第 2 条） |
| `peak(atMs)` 的返回值（规则板与面板读） | 是 | 布尔 | 不是布尔或抛错：`glm-peak` 读不出，面板不写高峰行，原因进行健康 |
| `glmHournessPeakMode.stateFor(sessionId)` 的返回值（`glm-prompt` 行读，§3.4） | 否 | 对象；`peak` 为 `true`；`level` 为 `inform`、`reduce`、`stop` 之一；`origin` 为 `default`、`human` 之一；`glmWorkerCap` 可选，正的安全整数才用，其余不合只当没有（不算 `invalid`）；其余成员（`at`、`until`）不读 | 服务不在：`peakModeNote: no-service`；`undefined`：`no-state`；`peak` 不是 `true`：`not-peak`；服务形状不对、抛错或 `level`、`origin` 不在取值表里：`invalid`，告警一次。四种都发今天的原文，提醒照常发出 |
| `gateOnRules` 交给 `checkCall` 的选项 | 是 | `signals['glm-peak']` 为布尔；`peakUntil` 为 ISO 8601，只在 `glm-peak` 为真时给；`waitedMs` 为非负整数、至多 28,800,000，只在重判时给；`glmSpend` 两种之一（rules:§12） | 由 `gateOnRules` 自己保证，规则板仍按 rules:§12 校验；不合时 `checkCall` 抛 `RulesCheckError('usage')`，照上面一行告警、照常开始；§1.4 第 22 条的 L2 钉住不会发生 |
| `gateOnRules` 的 `projectRoot` | 否（只给测试注入） | 存在的目录 | 不是目录或读不出：`checkCall` 抛 `RulesCheckError`（`usage` 或 `io`），照 §7.2 告警一行、照常开始 |

## 12. 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 套餐的时段与系数只在一个文件里 | GLM 包的 `src/glm-llm/credits.ts`：计算（`peakWindowAt`、`OFF_PEAK_RATE`、`rateShareAt`）与说明（`PEAK_HOURS`、`PEAK_END_LABEL`，提醒正文、`basis` 与 `peakHours` 都取它们）；编排层只经计价服务读，ESLint 的目录边界拦住导入（split 0.3 §2.7） | 改时段只改一处；规则板的文字取 `peakHours`（§18 M6-R6） |
| 没有代码按额度或积分拦截、推迟或改变调用 | 结构：M6 不在 `tools/pre-execute`、`agent/pre-step` 上注册新监听器，不加规则；高峰里的推迟只来自人选的档位与人设的规则，由规则板执行，主 Agent 自己的调用不在内（`d-main-agent-peak-exempt`） | `ORCHESTRATION.md` §4.3、`CHARTER.md` §6；§1.4 第 15、18 条钉住 |
| 凭证不进流水、输出、控制台与指标事件 | `src/glm-llm/quota.ts`：令牌只进请求头；流水与事件只写解析后的字段；错误文字不带请求头 | 凭证泄露不可逆；L2 断言加 `check:secrets` |
| 额度请求的头恰好 `authorization` 与 `x-request-id` | `quota.ts` 的请求构造 | 与 3.17.1 一致（`glm-house` 验收第 1 条）；§1.4 第 5 条钉住 |
| 每个 `glm-login` 行实例每 60 秒至多一次额度请求；GLM 包没有定时器 | `createQuotaReader` 的缓存与进行中的 promise；`read: false` 不发请求 | 网关限速；L2 钉住 |
| 命令等额度至多约 3 秒 | `createQuotaReader.view({waitMs})` | 命令是人在等；L2 钉住 |
| 高峰判定与本机时区无关 | `credits.ts` `peakWindowAt` | 已有 |
| 用量流水只有一种记录形状 | 缺口记录放单独文件（§6.2） | 用量流水有多个读者，都按用量记录解析 |
| 预估能复算 | `quota-projection.ts` 是纯函数，输入全在额度流水里 | 事后查错（§14） |
| 告诉模型峰谷计价只有一处 | GLM 包的高峰提醒；规则板的每步提醒不列默认规则（`toldBy`，rules:§3.4），它那一行只说档位与要做的事 | 两包都装时计价的话不重复 |
| 给模型的高峰文字里没有相反的两句 | GLM 包的提醒按规则板交出的档位选正文（§3.4）：少做与不做两档不说「只是告知」「不要推迟」；读不到档位时规则板那一行也不在（规则行不在，或会话没有项目），或说档位此刻不生效（`peak` 不是真）；规则板那一行不引用提醒（rules:§3.4） | 规则板 0.5 评审 F45、编排方裁定；§1.4 第 13 条钉住，L3 在同一个请求里两段一起看 |
| 高峰提醒从不叫主 Agent 停下、等待或不回话 | GLM 包的 `peakReminderText`：每档正文都由常量拼成，主语写在每一句里；不做档的正文写明主 Agent 不被管 | `d-main-agent-peak-exempt`（人：「主Agent应该不受高峰影响，随时回复的」）；§1.4 第 13 条逐字钉住，禁用片段防以后改字时带回，第 25 条在探针里钉住主 Agent 没被拦 |
| 只装 GLM 包时提醒与今天逐字相同 | `PEAK_REMINDER_TEXT` 由常量拼成、与 main `480e264` 的字面量相同；读不到服务就发它 | 编排方裁定；`glm-house` 验收第 4 条；§1.4 第 13、19 条钉住 |
| 脚本自查的每一次判定恰好一条判定事件 | 规则板的 `checkCall`（rules:§9.4）；`gateOnRules` 不写 | 编排方裁定；同一件事一个写的人；§1.4 第 22 条钉住次数与选项 |
| 登录状态的「同一次登录」按登录令牌认，不按文件的修改时刻 | `login-rejected` 记录带登录令牌的指纹；`glm-login` 比当前凭证的指纹（§4.9） | 项目 Key 的位置记录会写回凭证文件；§1.4 第 20 条钉住 |
| 额度读取不发 3.17.1 不会发的请求 | `usageAuthorization`：start-plan 先返回、不接受被拒指纹；`quota.ts` 不重试 | `glm-house` 验收第 1 条；§1.4 第 5、8 条钉住 |
| 循环板上的 GLM 条目只能看 | GLM 包交出冻结的数据；循环板只读列出（M6-L1） | `d-defaults-readonly` |
| 脚本的 `glmSpend` 由调用点写死 | `gateOnRules` 的参数，不读命令行与环境 | 跑脚本的人或 agent 不能靠加参数绕过档位；改自报值要改代码、过评审 |
| 脚本自查里没有第二个跑脚本的地方 | 脚本只由 `checkCall` 经共用的执行器跑；`gateOnRules` 不含 `child_process`，也不起后台进程 | `d-boards-as-hooks`：执行器只有一个（循环板 §6.6）；§1.4 第 24 条静态检查 |
| `glm-login` 与 `glm-llm` 的套餐一致 | 人在配置里设；`cordis.patch.yml` 的注释写明；`/glm-status` 第一行写出 `glm-login` 用的套餐 | 行之间没有读配置的契约（§4.2）；设错时人在第一行看得到 |

## 13. 故障预案

规则：额度、预估、登录状态与高峰行都是给人看的数据，读不到就说读不到，从不因此让命令失败或改变任何调用；每次失败都有一行可见的原因、一条控制台告警（每种原因一次）与一条流水记录（同一原因 10 分钟一条）。脚本自查是建议性的门：规则板自己出问题时放行，并在标准错误写一行。

| 故障 | 怎样发现 | 之后怎样 | 可恢复 | 调用方拿到 | 记在哪 |
| --- | --- | --- | --- | --- | --- |
| 额度接口网络错误、超时、5xx、429 | fetch 抛错、`AbortController` 到时、状态码 | 不重试；保留上一次读数；下一次读取再读 | 是 | 额度一节的原因行加上一次读数的时刻 | 流水 `failure`；控制台；行健康；指标事件 |
| 额度接口 401 | 状态码 | 照 3.17.1：不重试、不重铸；令牌按有效期换新或人重新登录之后恢复；不算登录被拒 | 是 | 「令牌被拒（401）；令牌到期换新后再读，或运行 /glm-login」 | 同上 |
| 未登录、令牌铸造失败 | `usageAuthorization` 抛出的码 | 不发额度请求 | 人登录后是 | 原因行（带 /glm-login 的正路） | 流水 `failure`；行健康 |
| 登录被拒（模型请求重铸后仍被拒，或铸造时 401、403） | 适配器在那条路径走完时 | 写 `login-rejected`；模型请求的错误照原样交回 DSH；`/glm-status` 与行健康写被拒；循环板提醒人（装了时） | 人重新登录、或下一次额度读数成功之后是 | `/glm-status` 那一段的第一行；主 Agent 转告的一句 | 流水 `login-rejected`；指标事件 |
| 登录被拒误判（一时的服务端问题） | 下一次成功的额度读数 | 状态回到 `ok`；循环板已交出的提醒不撤回 | 是 | 人至多多看到一句提醒 | 流水里先后两条记录 |
| start-plan | `glm-login` 行配置的 `plan` | 不读凭证、不发任何请求 | 不需要 | 「额度：体验套餐没有 5 小时与周额度」 | 行健康；不进流水（不是失败） |
| `glm-login` 与 `glm-llm` 的 `plan` 设得不同 | 人看 `/glm-status` 第一行的套餐 | 额度按 `glm-login` 的套餐读或不读；模型请求按 `glm-llm` 的 | 改配置后是 | 第一行写出 `glm-login` 用的套餐 | 行健康（两行各写自己的套餐） |
| 响应形状变了（字段改名、`type` 换名、行全被丢弃） | 解析计数 | 认不出的行丢弃，未知 `type` 原样显示；没有可用的行时写 `no-windows` | 改代码后是 | 「服务端没有返回可识别的窗口」或原样类型名 | 流水记丢弃数与键名；L4 读取后记进 `FACTS.md` |
| 预估的假设不成立（额度不按半价计） | 不能自动发现 | 每行写明依据；流水里有全部读数，可以换假设复算 | 是 | 带依据的预估行 | 流水；V5 |
| 本机与服务端的时钟差 | 重置时刻已过 | 写「即将重置」；5 小时命名容差 2 分钟 | 是 | 原样显示 | 无需另记 |
| 额度流水写不进（没有用户级目录、磁盘错误） | `appendFile` 失败 | 读数只在内存里，本进程内「最近两次」照常可用；登录状态只看本进程见过的被拒 | 是 | 照常显示 | 控制台一次；行健康 |
| 额度流水有坏行 | 读回时解析失败 | 跳过 | 是 | 照常显示 | 行健康写坏行数 |
| 计价服务的 `quota`、`peakHours` 或 `loopDefaults` 形状不对 | `quotaOf`、`peakHoursOf`、`loopDefaultsOf` | 只丢这一个成员（或这一条条目），其余照常 | 升级后是 | 面板写「额度：读取出错」；规则板文字省去时段括注；循环板少列这一条 | 控制台一次 |
| GLM 包是旧版本，没有新成员 | 成员不存在 | 面板写一行；规则板文字省去括注；循环板这一组为空 | 升级后是 | 「GLM 通道包没有提供额度数据」 | 不告警 |
| 缺口文件有坏行 | 校验 | 跳过 | 是 | 「无法读取的缺口记录 N 条」 | 面板 |
| 429 消息里读不出时刻 | 正则不中或越界 | 不写 `until` | 是 | 「已用完（服务端 1308）」不带时刻 | 流水 `upstream-limit` 没有 `until` |
| 适配器写流水失败（上游限额、登录被拒） | `appendFile` 失败 | 错误照原样抛出 | 是 | DSH 照常拿到模型请求的错误 | 控制台一次 |
| `glm-peak` 读不出（没有计价服务、`peak` 抛错） | 规则板判定 | 引用它的规则按 `onUnknown`；三档都不拦；面板不写高峰行 | 是 | 规则页写原因；排队与唤醒文字不写时刻 | 规则板的判定记录；行健康 |
| 人设了排队规则，18:00 时宿主在休眠 | 拥有等待单的宿主每 5 秒重判（rules:§6.3） | 醒来后的第一次重判唤醒 agent；单 24 小时过期 | 是 | 唤醒消息（时刻按开单时刻现算） | 规则板流水 |
| 脚本自查时规则状态读不出 | `checkCall` 抛 `RulesCheckError` | 告警一行，照常开始 | 是 | 运行照常 | 运行的标准错误；`checkCall` 抛错时没有判定，也就没有 `rules.check` |
| 脚本自查时指标流水的写入口不在或写失败 | `checkCall` 内部（rules:§9.4） | 判定、退出码与标准错误不变 | 是（指标流水合入后） | 运行照常 | 只有运行的标准错误 |
| 脚本自查时规则库导入失败（没有 build、规则板未合入） | 动态 `import()` 被拒或没有导出 | 告警一行，照常开始 | 是（build 之后） | 运行照常 | 运行的标准错误 |
| 脚本自查时人同意过的拦路脚本超时、崩溃或哈希对不上 | `checkCall` 里共用执行器的结果 | 按条目的做法判（缺省放行），不在后台接着跑；哈希对不上的脚本不跑，同样按条目的失败做法判 | 是（人再同意之后） | 放行则运行照常；拦下则退出码 4 和 `CheckResult.text` | `CheckResult.scripts`（rules:§9.4）；判定事件由规则板写 |
| 脚本自查时 `peakAt` 抛错 | 调用时 | 不给 `signals`，改读宿主心跳；都没有时 `glm-peak` 读不出，档位不拦 | 是 | 一行原因；运行照常（除非别的规则命中） | 运行的标准错误 |
| `--wait` 等满 8 小时仍是排队 | 计时 | 照排队写结果并退出码 5 | 是（之后重跑） | 排队文字 | 运行的标准错误 |
| `--wait` 期间脚本被结束 | 进程退出 | 没有半截状态：命令行不开等待单、不写文件（rules:§9.4） | 是 | 重跑 | 无需另记 |
| 循环板读额度时读不到 | `quota()` 返回 `failure` | 不判「快用完」，等下一次有新用量时再读 | 是 | 无（人敲命令时照常看到原因） | 额度流水 `failure` |
| 主 Agent 自己用 GLM 而登录被拒 | 循环板交出提醒后主 Agent 回不了话 | 人在 DSH 里看到请求失败；`/glm-status` 与 pill 写登录被拒 | 人重新登录后是 | 请求失败的错误 | 循环板的投递记录（M6-L4） |
| 续跑的旧会话里留着旧正文或别一档的高峰提醒 | 无 | 是否再提醒按 `source.peakWindow` 判，不比正文与档位 | 不需要 | 无 | 无 |
| 读不到档位（规则行没装、没启用，会话没有项目，服务形状不对或抛错） | `peakModeService`、`readPeakMode` | 发今天的原文；形状不对或抛错时告警一次 | 是（规则行启用后的下一段高峰） | GLM 会话照今天收到提醒 | notice 的 `source.peakModeNote`；控制台一次 |
| 同一段高峰里档位改了 | 无（提醒每段高峰只发一次） | 不重发；整块规则板合入后，主 Agent 由规则板那一行得知，不做档由子 agent 与派活的排队文字和唤醒消息告知；在那之前（最小一片）GLM 主 Agent 不知道档位变了，仍按这段高峰第一条提醒行事，最多多做或少做一些可挪的活，因为最小一片没有被挡的调用；少做改无影响时，已收到少做原文的 GLM 子 agent 不知道，最多少做一些可挪的活 | 是（下一段高峰） | 无 | notice 的 `source.peakMode` 记着发的是哪一档 |
| 凭证文件因项目 Key 的位置记录被写回 | 大小、修改时刻变了 | 重新解密、算指纹；指纹没变，登录状态不变 | 不需要 | 无 | 无 |
| `glm-login` 被热重载 | 模块重新加载 | 内存缓存清空；下一次读取从流水末尾读回历史与登录状态 | 是 | 照常 | 无 |

不可逆的东西：M6 不删任何数据；两个新文件（额度流水、缺口文件）只追加；缺口文件的那一行由 agent 定（§19，人可推翻），删掉文件即撤销；不改用户 profile；模型请求的形态与重试行为不变，适配器只在 429 与登录被拒时多写一行流水。

## 14. 留痕与指标

### 14.1 留痕

一处动作只记一个事实源（`CHARTER.md` §7.1 条款 11）。

| 发生了什么 | 记在哪 | 谁写 | 字段 |
| --- | --- | --- | --- |
| 一次额度读取（成功或失败） | `<userHome>/audit/quota.jsonl` | `glm-login` 行 | 时刻、`kind`、解析后的行或原因码、丢弃数（失败时另有键名） |
| 一次上游限额拒绝 | 同上 | `glm-llm` 行的适配器 | 时刻、错误码、恢复时刻（读得出时） |
| 一次登录被拒 | 同上 | 两行的适配器 | 时刻、`path`、`status` 或 `code`、登录令牌的指纹 |
| 一次预估 | 不另存：输入是流水里的读数，函数是纯的，输出行写明依据 | 无 | 依据的两次读数时刻或窗口起点 |
| 删用量记录 | `<userHome>/audit/usage-gaps.jsonl` | 删的人或 agent（流程约定，`DEVELOPMENT.md`） | §6.2 的表 |
| 人设、改、解除规则，改档位；等待单的开、清、唤醒 | 规则板的项目流水 | 规则板 | rules:§7、§10.5 |
| 脚本自查的每一次判定（放行、排队、拦截，含 `--wait` 的每次重判） | 规则板的 `rules.check` 指标事件（rules:§9.4、§10.5）；排队与拦截另在运行的标准错误 | 事件由规则板的 `checkCall` 写（编排方裁定），`gateOnRules` 不写；标准错误由 `gateOnRules` 写 | 事件：执行方式、退出码、命中的规则、档位与来源、`glmSpend`、`glm-peak` 的来源、读不出的信号、`waitedMs`、调用方，时刻在信封里；不带命令原文与参数 |
| 发给模型的是哪一段高峰提醒 | 会话日志里 notice 的 `source`（`peakWindow`、`peakMode`、`peakModeOrigin`、`peakWorkerCap`、`peakModeNote`）；指标事件 `glm.peak-reminder` | `glm-prompt` 行 | 见 §3.4 |
| 循环板交给主 Agent 的提醒 | 循环板自己的记录与指标事件 | 循环板（M6-L5） | 条目 id、时刻 |
| 写缺口行 | 缺口文件本身；`m6` 节点上 G1 的批注 | 主 Agent | §6.2 的那一行 |
| 高峰提醒按档位的措辞 | 本稿 §3.4 与 §19；`ORCHESTRATION.md` §11.4；实现提交的提交信息 | 本稿 | 四档的原文、理由 |

### 14.2 交给指标流水的事件

指标流水（特性 `metrics`）的设计还没有成稿：每个项目一份只追加的事件流水，数由 harness 写，模型写的数不算。GLM 包交的事件如下；写入的服务名与信封（事件名的写法、时刻、项目归属）以指标设计为准。GLM 包在 `ctx.get(<指标服务名>)` 有值时交，没有时什么都不做、不告警（只装 GLM 包时没有它）。事件里带会话 id 时由指标服务按会话的工作目录定项目。指标流水按 `d-rules-in-repo` 放在项目的 `.llm/`；额度读取、上游限额与登录被拒是整个账号的事，命令发起的额度读取带命令所在的会话，循环板发起的没有会话，这类事件归哪份流水（最近走过步的项目，或没有项目时不写）由指标设计定，M6 不替它定（§18）。

| 事件 | 谁写 | 什么时候 | 字段（只有数与引用，不含令牌、请求头与正文） |
| --- | --- | --- | --- |
| `glm.quota-read` | `glm-login` 行 | 每次额度读取结束 | 成功与否、原因码、耗时毫秒、发起方（`command` 或 `service`）、命令所在的会话 id（有时）、每个窗口的名字与已用比例、丢弃的行数 |
| `glm.upstream-limit` | `glm-llm` 行的适配器 | 每条上游限额记录 | 错误码、有没有恢复时刻、会话 id |
| `glm.login-rejected` | 两行的适配器 | 每条登录被拒记录 | `path`、`status` 或 `code`、会话 id（模型路径时） |
| `glm.peak-reminder` | `glm-prompt` 行 | 每条高峰提醒 | 高峰时段的日期（`peakWindow`）、发的是哪一档（`peakMode`，读不到时为 `none` 与 `peakModeNote`）、写了上限时的数（`peakWorkerCap`）、会话 id |

积分、token 与每次调用的耗时已在用量流水里（memory 行），指标流水由它算，GLM 包不重复交。规则板的判定、等待单与档位事件由规则板交（rules:§10.5），仓库脚本自查的判定事件 `rules.check` 也由规则板的 `checkCall` 交（编排方裁定），M6 的 `gateOnRules` 不交；循环板的执行事件与它照计价服务推出的 `channel.peak-changed` 由循环板交（M6-L5，循环板 §6.10）。

## 15. 可测性与验证

### 15.1 各层测什么

- L2 纯函数（新文件 `tests/quota.spec.ts`，加进 `package.json` 的 `test` 列表）：§4.3 的解析与命名夹具（含 `percentage` 130、−5、`NaN`）；§4.7 的算例与各种情形；`nextPeakChange` 的边界（§1.4 第 3 条的六个时刻，周五 18:00、跨周末；导入自 `src/shared/pricing.ts`；函数与它的测试 `tests/peak-mode.spec.ts` 已在 main，Q1 只补缺的时刻）；`formatMoment` 的五种写法，一律传 `{offsetMinutes: 480}`，另一例传 `{offsetMinutes: -300}` 核对「明天」按显示时区算；`quotaLines`、`peakLine`、`quotaLowOf`、`quotaLowLine`、`loginLine` 的文字与边界（§1.4 第 21 条）；`peakHoursOf`、`loopDefaultsOf` 的校验（§11）；缺口行的校验与报告期规则。
- L2 行与适配器（`tests/glm-quota.spec.ts` 新文件；`tests/glm-zcode.spec.ts`、`tests/health.spec.ts`、`tests/hourness.spec.ts`、`tests/workflow.spec.ts`、`tests/contracts.spec.ts`、`tests/credits.spec.ts`、`tests/reminder-wiring.spec.ts` 扩充）：注入 fetch 替身核对请求的地址、方法与恰好两个头，`x-request-id` 两次不同（第 5 条）；start-plan 不发请求（第 5 条）；缓存、并发、上游限额绕过缓存、`read: false` 不发请求、1 小时不请求（第 6 条）；永不返回的替身与 3 秒上限（第 7 条）；每种失败（第 8 条），其中额度 401 之后再读一次：fetch 替身只收到第二个额度 GET，没有 `POST …/access_tokens`；适配器 429 写流水（第 11 条）；登录状态的各种转变（第 20 条：模型请求两次 401；PAT 平面 401、403；网络错误、超时、429 与 503 不算；项目 Key 的位置写回不改状态；重新登录、`/glm-logout` 写空串；之后的成功读数；凭证没变时不重复解密）；注入的令牌字符串不出现在流水、输出、控制台与假指标服务收到的事件里（第 12、22 条）；提醒按档位的四种正文（少做带与不带上限、人设与出厂各一）、读不到档位的五种情形、`glmWorkerCap` 不合的几种、不叫主 Agent 停下的禁用片段、`source` 的各项与只读一次（第 13 条，假宿主上的假 `glmHournessPeakMode`，状态由 `peakModeState` 造）；`loopDefaults` 的四条（第 21 条）；pill 解析函数对新输出的「剩下的行」；`/hourness` 的两节同口径与没有计价服务的情形（第 2 条）。文件系统用 `os.tmpdir()` 下的临时目录（`DEVELOPMENT.md` §1 允许 mock 文件系统与网络，不 mock DSH 契约）。
- L2 规则板（规则板实现的测试文件里）：人写规则时排队、每步提醒与唤醒文字里的时刻（第 16 条的规则板一侧，注入时钟与假宿主的 `steer`；`glm-peak` 读不出时文字里没有时刻）；`toldBy`、规则页那一行与 `peakHours` 括注（第 14 条）。
- L2 脚本自查（新文件 `tests/rules-gate.spec.ts`）：先以假规则库钉交给 `checkCall` 的选项与判定次数（第 22 条，规则板 R3 合入之前就能跑）；再以子进程跑一个只调用 `gateOnRules` 的临时脚本，项目是一个临时 git 仓库（`projectRoot` 注入，状态由规则板的引擎以人的身份写进去；规则库不读用户级目录，rules:§9.4），`checkModule` 指向规则板 R3 的真实编译产物：`glmSpend` 两种取值乘三档乘周三 15:00、19:00 与周六 15:00（第 15 条）；人设规则的输出、时刻与 `--wait`（第 16 条，注入时钟与睡眠函数，不真睡）；不引用 `glm-peak` 的规则不写时刻、每 60 秒重判；拦截退出码 4；模块路径指向不存在的文件时标准错误一行、退出码 0；`peakAt` 抛错（第 15、17 条）；命令文本两种形式（有、无 `npm_lifecycle_event`）各一例。人同意过的拦路脚本的几种结果（第 24 条，注入假执行器）。
- L3 探针（`scripts/probe/run-probe.mjs`）：新的覆盖层 `scripts/probe/probe-net.mjs`（同 `probe-clock.mjs`，只在探针的覆盖补丁里，不进 bundle）在宿主进程里包一层 `globalThis.fetch`，把每个请求的 URL（只记 origin 与路径）写进场景目录；核对所有场景里没有发往 `/api/monitor` 的请求（探针的 `glm-login` home 没有凭证，`run-probe.mjs`:157–159）；三种组合的输出（第 19 条）；请求正文里没有额度一节的文字（第 18 条）；高峰 notice 的条数与正文（第 13、25 条；规则行在场景里没启用时正文是 `PEAK_REMINDER_TEXT`，启用了就按场景的档位比 `peakReminderText`，`run-probe.mjs`:365 的 `PEAK_NOTICE` 随之改成按场景算；最小一片已有场景 `rules-peak`，R1 在它上面加检查并新加 `rules-peak-stop`）；规则板合入后，时钟平移到周三 17:59:30 的场景：人写规则的夹具下 `pwsh "npm run calibrate"` 被排队，18:00 之后的重判唤醒（第 16 条）；少做档周三 15:00 两条 notice 并存且不相抵（第 13 条）。
- L4（批次，`DEVELOPMENT.md` §1.1；桌面版一次只给一个占用者）：§1.4 第 23 条；G1 之后第 4 条的最后一句；规则页上的默认规则一行随规则板自己的 L4 批次。

### 15.2 今天必败

新检查在今天的代码上怎样失败：`quota.spec.ts` 导入的模块不存在；`/glm-status` 没有高峰行与额度一段；`glm-login` 配置 `plan: start-plan` 时凭证行今天仍写「套餐 coding-plan」；`/hourness` 的「用量」一节按 token 列，与面板不同口径；`ZcodeAdapter` 没有 `usageAuthorization`；假宿主提供少做档的 `glmHournessPeakMode` 时，高峰提醒的正文仍是今天的原文（含「postpone」），`source` 没有 `peakMode`；提供不做档时正文同样是今天的原文，没有「The main agent is not held」；`credits.ts` 没有 `PEAK_HOURS`；`/glm-logout` 之后登录状态没有 `absent` 这一说；计价服务没有 `loopDefaults`；探针没有 `probe-net` 的记录文件；`scripts/rules-gate.mjs` 不存在（第 22 条的假规则库收不到任何调用）；规则板的人设规则排队文字里没有「until 18:00」。

### 15.3 未核实的假设

| # | 假设 | 在哪一步核实 | 不成立时 |
| --- | --- | --- | --- |
| V1 | 额度地址的 origin 是 `https://bigmodel.cn` | 已关闭〔实读，设计评审第 1、2 轮〕：3.17.1 经 `chunk-ZSDMP7DM.js` 的 `ma`（§4.1） | 不适用 |
| V2 | 额度请求除 `authorization` 之外有没有别的头 | 已关闭〔实读，设计评审第 2 轮 F7，本稿复核〕：`NodeApiClient.request` 只补 `x-request-id`，ZCode 身份头只给 ZCode 端点（§4.1） | 不适用 |
| V3 | 行的含义与单位：`TOKENS_LIMIT` 是 5 小时与每周，`TIME_LIMIT` 是 MCP | Q4 的一次真实读取 | 改 §4.3 的命名函数（一个文件），重跑夹具 |
| V4 | 经 `zcode.z.ai/api/v1/ultra` 网关时 1308 的正文形状，以及消息里恢复时刻的格式与时区。这一项是本项目加的展示，不是 ZCode 的行为 | 真实遇到一次 1308 时（不刻意制造）：适配器抛出的错误文本里有正文前 400 字符，会话日志里查得到 | 形状不同：不写上游限额记录，额度一节照常按读数显示已用比例；改 §4.6 的解析一处。时刻读不出：不写 `until` |
| V5 | 非高峰的消耗按半价计入额度 | Q4 之后的日常读数：同一窗口里跨 18:00 的两段速度（流水复算，不另花积分） | 预估去掉峰谷修正，改一处 `rateShareAt` 的使用 |
| V6 | 命令处理函数等 3 秒不被打断 | 宿主一侧已查：rc.3 `dsh-commands/lib/index.js` 里没有任何超时；客户端一侧（pill 经 `remote.commands.execute`）在 Q4 的真实读取里看一次 `/glm-status` 的耗时 | 把等待上限降到客户端允许的值 |
| V7 | ZCode 3.17.1 除设置页挂载与刷新之外，有没有定时读额度（例如聊天输入框旁的剩余额度 `codingPlanUsageRemaining`，renderer:+3192662 一带） | Q0 导出 host 包之后，在 renderer 包里查 `getCodingPlanUsageSnapshot` 的全部调用方（只读） | 本包不设定时器的取舍不变（循环板只在 GLM 在用时读）；把 ZCode 的读法写进 `DESIGN.md` §4.8 的已知差异 |
| V8 | 「登录被拒」的三种判据足够：PAT 平面在 OAuth 登录令牌失效时回 401 或 403（定位或铸造时），模型请求在重铸后仍被拒说明登录不再有效 | 码的来源已实读（`8b12baf` 照 3.17.1 的 `KAr` 抛 `project_token_http_<status>`，§4.9）；服务端在登录失效时回的是不是 401 或 403，等日常使用中第一次真实的登录失效（会话日志与额度流水里都查得到） | 判据改一处（`projectToken` 的 `.catch` 认的码，或 `model` 路径的条件）；误报只多一句提醒，漏报时人仍在请求失败里看到 |

## 16. 实施顺序、档位与并行

开工条件：split 已合入（满足，main `419b6ea`）；规则板最小一片已合入（满足：契约文件和服务都在 main）；人看过一页放行稿并放行（`d-design-onepage`）。M6 的实现在自举开始之后由 DSH 里的主 Agent 做（`d-dogfood-scope`），步的顺序和下面的先后照旧，只是做的人是它。每步一个提交，提交信息带节点 id，文档与代码同一批；门禁「全」指 `npm run build`、`npm run preflight`、`npm test`，碰运行时的步另跑 `npm run probe`（`AGENTS.md`）。M6 不加新行，所以没有「默认禁用、验证后启用」的步；`glm-login` 行多一个配置项 `plan`，默认值与今天的行为相同（coding-plan）。下文「规则板 R1–R7」指规则板 0.10 §16 的步，也就是整块规则板的步；最小一片（0.10 §16.1）是其中 R1 到 R4 的一个子集，已在 main，下文写「最小一片」。

| 步 | 内容 | 主要文件 | 线 | 依赖 | 档位 | 层 | 独立评审 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q0 | 把 3.17.1 安装包的 `out/host/index.js` 与 `out/host/chunk-ZSDMP7DM.js` 只读导出到 `reference/zcode-3.17.1/host/`（`reference/` 不进 git），核对 MD5 与文首证据写法里的一致，目录里放一个说明文件：这是安装包的导出，可能带用户补丁，只作机制参考，逐字文本以上一级的 pristine `zcode.cjs` 为准（`d-zcode-3171`）；顺带核 V7 | `reference/zcode-3.17.1/host/`（本机） | Q | 无 | simple | 无 | 否 |
| Q1 | 公共契约：`UsagePricing` 的三个可选成员、`peakHoursOf`、`quotaOf`、`nextPeakChange`（规则板最小一片已在 main 加好，直接用，只补 `tests/quota.spec.ts` 里缺的时刻）；`src/shared/quota.ts` 的类型与 `quotaLines`、`peakLine`、`formatMoment`、`quotaLowOf`、`quotaLowLine`、`loginLine`；`src/shared/channel-loop.ts` 与 `loopDefaultsOf` | `src/shared/{pricing,quota,channel-loop}.ts`、`tests/quota.spec.ts`、`tests/contracts.spec.ts`、`package.json`（测试列表） | Q | 无 | standard | L1、L2 | 否 |
| R1 | 高峰提醒按档位、上限与时段常量：`credits.ts` 导出 `PEAK_HOURS`、`PEAK_END_LABEL`，`creditPricing` 带 `peakHours`、`basis` 由 `PEAK_HOURS.zh` 拼成（字符串不变）；`peak-reminder.ts` 的 `PEAK_REMINDER_TEXT`（由常量拼成，与今天逐字相同）、`peakReminderText`、`readPeakMode`（带 `glmWorkerCap`），`installPeakReminder` 多一个读档位的参数，notice 的 `source` 多四项，文件头注释重写；`src/glm-prompt/index.ts` 的 `apply` 读 `glmHournessPeakMode` 并经 `installDialect` 传下去（`apply` 的 `ctx` 类型加 `ServiceLookup`）；`ORCHESTRATION.md` §11.4 整节改写（§17）；探针 `rules-peak` 加提醒正文的检查、新场景 `rules-peak-stop`（§1.4 第 13、25 条） | `src/glm-llm/credits.ts`、`src/glm-prompt/{peak-reminder,index}.ts`、`tests/{reminder-wiring,credits}.spec.ts`、`scripts/probe/run-probe.mjs`、`docs/ORCHESTRATION.md` | R | Q1；`src/shared/peak-mode.ts` 的 `peakModeService`、`PeakLevel`、`PeakModeState`（已在 main，规则板最小一片） | standard | L2、L3 | 否 |
| Q2 | 额度读取与登录状态：`LoginConfig.plan` 与 `login-row.ts` 的 `Config`；`usageAuthorization()`；`quota.ts`（两个头、401 只记失败、`read: false`、登录状态）、`quota-projection.ts`、`rateShareAt`；适配器在 429 与登录被拒时写流水（`projectToken` 的 `.catch` 认 `project_token_http_401`、`project_token_http_403` 与 `project_token_login_required`，记录带登录令牌的指纹）；登录状态按指纹判、凭证没变不重复解密；`loop-defaults.ts`；origin 常量移到 `zcode-wire.ts`；`glm-login` 提供三个新成员、`/glm-status` 的一段与行健康；GLM 包的四类指标事件（指标服务在时；`glm.peak-reminder` 在 `src/glm-prompt/peak-reminder.ts` 发，服务经 `src/glm-prompt/index.ts` 的 `apply` 读，同 R1 读档位的做法）；`cordis.patch.yml` 的注释；`DESIGN.md` §4.7、§2.4、§2.2、§4.8，`FACTS.md` §1（§17） | `src/glm-llm/{quota,quota-projection,loop-defaults,credits,zcode,zcode-wire,login-row}.ts`、`src/glm-prompt/{index,peak-reminder}.ts`、`packages/glm/cordis.patch.yml`、`tests/glm-quota.spec.ts`、`tests/{glm-zcode,health,credits,reminder-wiring}.spec.ts`、`package.json` | Q | Q0、Q1、R1（`credits.ts`、`peak-reminder.ts`、`index.ts` 与它们的测试同文件，R1 先合入） | hard | L2 | 是（凭证、网络、流水与登录判据） |
| P1 | 面板与晨报：`usagePanelOf`、`PanelLineOptions`、`reportFromFiles` 的第五个参数与 `ReportInput.pricing`、高峰行、范围行、缺口文件的读取与 `auditPaths.gaps`、额度一节（含登录被拒那一行）、3 秒上限、行健康；晨报「用量（今天）」改积分、删 `usageByModel`；`ORCHESTRATION.md` §11.3 重写、§12 用量一条；`DESIGN.md` §2.4（缺口文件）；`DEVELOPMENT.md` 加「删用量记录要留缺口行」 | `src/report/{panel,index}.ts`、`src/workflow/morning-report.ts`、`src/memory/audit.ts`、`tests/{hourness,workflow}.spec.ts` | P | Q1 | standard | L2 | 否 |
| Q3 | 探针：`probe-net.mjs` 覆盖层；三种组合、无额度请求、请求正文、提醒正文 | `scripts/probe/{probe-net,run-probe}.mjs` | Q | Q2、P1、R1 | standard | L3 | 否 |
| Q4 | 批次 L4：重启桌面版，真实读取一次（V3），记进 `FACTS.md` §2.4；`/glm-status` 与 `/hourness` 的样子；桌面版日志 | `docs/FACTS.md`；必要时 §4.3 的命名函数 | Q | Q2、P1、Q3 | standard | L4 | 否 |
| G1 | 主 Agent 用一条一次性的 node 命令（不留脚本）往 `~/.dsh/glm-hourness/audit/usage-gaps.jsonl` 写 §6.2 的那一行，`at` 由 `new Date(1793243554750).toISOString()` 算出；核对 `/hourness` 显示「10-29 11:12 删去 806 条」；在 `m6` 节点上批注写了什么与「删掉这个文件即撤销」 | 用户级目录（插件自己的数据目录，§19 的 agent 决定） | G | P1 合入并在桌面版加载（随 Q4） | simple | L4 | 否 |
| S1 | 规则板文字写出高峰结束的时刻（M6-R2，§7.2 第 1 条） | 规则板 R4 的文字渲染文件（`src/rules/` 下）与规则板测试 | S | 整块规则板 R1–R4 合入（自举之后）；Q1 | standard | L2 | 否（只改三处文字的渲染，规则板的门由它自己的评审覆盖） |
| S2 | 脚本自查（M6-R3，§7.2 第 2 条）：`scripts/rules-gate.mjs`（`signals`、`peakUntil`、`waitedMs`、`glmSpend`；不写判定事件、不跑脚本；`projectRoot` 只给测试注入）；两个脚本的调用点；`DEVELOPMENT.md` 的练习题与真网冒烟两节；`ORCHESTRATION.md` §11.4 排期一条加一句（在 R1 改写的那一条之后） | `scripts/rules-gate.mjs`、`scripts/calibrate/run-calibrate.mjs`、`scripts/smoke-zcode-authorized.mjs`、`tests/rules-gate.spec.ts`、`package.json`（测试列表）、`docs/DEVELOPMENT.md`、`docs/ORCHESTRATION.md` | S | 整块规则板 R1（附属条目与缺省档位）、R3（`src/rules/check.ts`）合入（自举之后）；Q1 | standard | L2 | 否 |
| S3 | 探针：在规则板的 `rules-peak` 场景上加一个人设排队规则的夹具（§7.3 第一条），时钟平移到周三 17:59:30：`pwsh "npm run calibrate"` 被排队、文字带「until 18:00」，18:00 之后的重判唤醒且唤醒文字带「glm-peak ended at 18:00」；少做档（出厂默认）周三 15:00 GLM 主 Agent 的请求里两条 notice 都在，`glm-peak-reminder` 的是少做原文，两段不相抵（§1.4 第 13 条的 L3） | `scripts/probe/run-probe.mjs` | S | S1、R1；整块规则板 R4 的探针场景（最小一片已建 `rules-peak`，S3 在它上面加） | standard | L3 | 否 |

循环板一侧没有 M6 的步：GLM 包的四条条目数据随 Q2 交付；循环板怎样列出与执行它们，写在 §8.4，由循环板的实现步做、由循环板的节点关。

并行（question-28 C：没有副作用的尽量并行）：

```text
Q0 ─────────────────────┐
Q1 ──┬── R1 ── Q2 ──────┼── Q3 ── Q4（桌面版） ── G1
     └── P1 ────────────┘
（R1 不再等规则板：契约与服务已在 main；R1 先于规则行默认启用，也先于整块规则板的 R4）

整块规则板 R1–R4 合入 + Q1 ── S1 ──┐
整块规则板 R1、R3 合入 + Q1 ── S2    ├── S3（还要 R1）
                              ┘
```

- 同时可开的：Q0、Q1；Q1 之后 P1；R1 现在就能开（契约在 main）；Q2 可以与 R1 同时开发，合入排在 R1 之后（同文件）；S1 与 S2 文件不交叠，可以同时开；S 线与 Q、P 线文件不交叠（S2 与 Q2 都不碰对方的文件）。S2 的假规则库用例（§1.4 第 22 条）在规则板 R3 合入之前就能写。
- R1 与规则板的先后（设计评审第 3 轮 F8 要写死的顺序，0.5 按最小一片已在 main 改写）：规则板最小一片 → M6 R1 → 规则行默认启用 → 整块规则板 R4。最小一片已合入，`src/shared/peak-mode.ts` 和服务都在 main，所以 R1 不再等谁，也是自举之后 M6 里第一个该做的步；它要先于两件事：规则行去掉补丁里的 `disabled: true`（规则板 §16：L3 与第一批 L4 之后），和整块规则板的 R4（每步提醒进安装）。原因：规则行一启用，人就能选不做、少做，而提醒还是今天的「不要暂停或推迟工作」；R4 的每步提醒进来之后，同一步里就有相反的两句话。R4 先到时 R4 照常合入（规则行默认禁用，用户的安装里没有档位的服务，GLM 会话收到的仍是今天的原文，不相抵），但规则行改为默认启用之前 R1 必须已经合入。两步的提交信息各写对方的步号。
- 要串行的（由编排方排合入顺序）：`scripts/probe/run-probe.mjs`（R1、Q3、S3）；`docs/ORCHESTRATION.md` §11（R1 改写 §11.4 整节、P1 改 §11.3、S2 在 §11.4 排期一条后加一句；规则板 R4 只在它新增的规则板一节里加一句指向 §11.4，不改 §11.4 的任何一行，rules:§16 R4）；`docs/DESIGN.md` §2.4（Q2、P1）；`package.json` 的测试列表（Q1、Q2、S2）；`src/glm-llm/credits.ts`、`src/glm-prompt/{index,peak-reminder}.ts` 与它们的测试（R1、Q2）；`src/rules/` 下的文件（S1 与规则板自己在做的步）；`nextPeakChange` 已在 main，不再有谁要加；桌面版（Q4、G1，一次一个占用者）。
- 批次 L4 一次（Q4 带上 G1）；S 线的界面核对随规则板自己的 L4 批次。

建议的图节点（放行后由编排方按本表建）：`m6-host-export`（Q0）、`m6-quota-contract`（Q1）、`m6-reminder-text`（R1）、`m6-quota-read`（Q2）、`m6-panel`（P1）、`m6-probe`（Q3）、`m6-l4`（Q4）、`m6-gap`（G1）、`m6-rules-text`（S1）、`m6-script-gate`（S2）、`m6-rules-probe`（S3）。0.2 建议的 `m6-reminder`（删除提醒）不再要。0.3 这里写的「草稿见 `graph-ops-v03.json`」不对：那份草稿只有批注，没有建节点（设计评审第 3 轮 N20），0.4 的草稿 `graph-ops-v04.json` 也只有批注。

## 17. 文档改动（随各步同一批提交）

| 文档 | 节 | 改什么 | 步 |
| --- | --- | --- | --- |
| `docs/DESIGN.md` | §4.7 | 整条重写：已实现，地址、两个头、凭证、读取时机、缓存、流水、上游限额、登录被拒、预估，未核项 | Q2 |
| `docs/DESIGN.md` | §2.4 | 数据表加额度流水（四种记录）与缺口文件 | Q2、P1 |
| `docs/DESIGN.md` | §2.2 | `glm-login` 行的说明加「额度、登录状态、循环板条目」与配置项 `plan`（须与 `glm-llm` 行相同） | Q2 |
| `docs/DESIGN.md` | §4.8 | 已一致一项：额度请求的地址、两个头（`authorization` 为项目令牌原样，`x-request-id` 每次新的 UUID）、超时、凭证与失败处理（不重试，401 不重铸），60 秒复用；偏移按 3.17.1。已知差异六项，各写理由：项目令牌缓存一行一份（两行各一个适配器，至多多铸一次）；不做读额度前的订阅核验（结果不改变显示，多一个 OAuth 请求）；start-plan 不读额度（体验套餐没有 5 小时与周额度，ZCode 用套餐 JWT 照读）；模型请求 429 的 1308 等上游限额记录与展示（ZCode 没有，本项目加的，正文形状经 ultra 网关未核实）；读取时机（ZCode 在设置页挂载与刷新时读；本包在命令时读，装了循环板时另在 GLM 有新用量后至多每 15 分钟读一次）；登录被拒的判定（ZCode 没有，本项目加的） | Q2 |
| `docs/FACTS.md` | §1、§2.4、§2.5 | 3.17.1 额度取数的事实与偏移，host 包的大小与 MD5、导出位置；L4 读到的行；1308 时刻格式（遇到时） | Q2、Q4 |
| `docs/ORCHESTRATION.md` | §11.3 | 面板的高峰行、范围与缺口、额度一节；「尚未实现」一段删去 | P1 |
| `docs/ORCHESTRATION.md` | §11.4 | 整节归 M6（编排方裁定；规则板的任何一步不改这一节，rules:§10.7 M6 第 2 条）。R1 改写：「进入高峰时提醒 LLM」一条加「正文按规则板交出的档位选（`glmHournessPeakMode`），读不到档位时用 M6.1 的原文」；原文代码块换成 §3.4 的表（前两句、四档的第三句起、档位句的两种说法）；「提醒只告知：不换模型、不换套餐、不拦截、不推迟任何工作」（今天第 1074 行）整条重写为「提醒只说峰谷计价与此刻的档位要谁做什么，从不换模型、换套餐，也从不叫主 Agent 停下或不回话（`d-main-agent-peak-exempt`）；推迟哪些工作由人选的高峰模式定，档位与执行在规则板（出厂少做，`d-peak-mode`）」；验证一条加四档与读不到档位的 L2、两段 notice 一起看的 L3；「排期功能要有」一条（今天第 1076 行，其中「高峰期排不排、排哪些，到时候由用户决定〔定案〕」已被 `d-peak-mode` 取代）整条重写为「高峰时推迟哪些工作由人选的高峰模式定（无影响、少做、不做，出厂少做〔定案 2026-10-30，`d-peak-mode`〕）：设置与执行在规则板，少做的并行上限由 M7 在派活处执行，高峰里只剩被挡的活时 M7 停住自动推进，高峰结束时循环板上编排层的一条 `resume-drive` 并提醒主 Agent。高峰模式只管子 agent 与重活脚本，主 Agent 自己的回话和工具调用任何一档都不受影响；模型与套餐不自动更换。」；`schedule` 边界一条与「不设预算」一条不动 | R1 |
| `docs/ORCHESTRATION.md` | §11.4 | S2 在 R1 改写的排期一条之后加一句「仓库脚本启动前按项目规则与高峰模式自查（练习题自报可挪，真网冒烟自报必要），退出码 5 为排队，`--wait` 等到可以跑；每一次判定由规则板记进指标流水」 | S2 |
| `docs/ORCHESTRATION.md` | §12 | 晨报的「用量」按积分、缺口规则 | P1 |
| `docs/DEVELOPMENT.md` | 数据处理 | 删用量记录要往缺口文件写一行 | P1 |
| `docs/DEVELOPMENT.md` | 练习题（标定）、真网冒烟 | 启动前按项目规则与高峰模式自查；各自的自报值与理由；退出码 5 为排队，`--wait` 等到可以跑 | S2 |
| `docs/ROADMAP.md` | M6 | 条目不变；验收见图上的节点 | 无 |
| `docs/HANDOFF.md` | 当前状态 | 各步合入时更新 | 各步 |

`CHARTER.md` 不改（0.7 已由编排方改好，`f2faa6f`）。`AGENTS.md` 的基线条款由 `zcode-3171-follow` 改到 3.17.1，M6 不碰。`docs/ORCHESTRATION.md` §16（规则板最小一片）与 §11.4 互相指：§16 说「发给模型的高峰提醒与它在各档下的措辞见 §11.4（GLM 通道包），规则板不碰」，R1 改写 §11.4 时保留这个指向，不改 §16。

## 18. 对其他设计的要求

各自下一次修订时改，本稿不动它们的文件。项目图上对应节点的批注为准（设计评审第 3 轮 N21）：0.3 的草稿 `graph-ops-v03.json` 里给 `rules`、`schedules`、`metrics` 的三条批注没有上图，0.4 按下表重写成草稿 `graph-ops-v04.json`（同目录），由编排方在规则板放行、循环板 0.4 与指标流水的评审之前执行。0.5 的请求（含下表新增和改过的几行）写成 `graph-ops-align.json`，由对齐轮的收尾步写；`graph-ops-v04.json` 里给 `metrics` 的一条已过时（§21）。已放行的设计（规则板 0.10、循环板 0.6、M3 附录 0.5、M7 0.6）和在跑的实现现在不接新请求（`d-freeze-until-dogfood`），下表给它们的请求都是自举之后办的批注。

| # | 给谁 | 要求 | 与 M6 的关系 |
| --- | --- | --- | --- |
| 高峰提醒原文 | 规则板 | 编排方裁定，规则板 0.10 仍照做（rules:§3.4、§3.5、§10.6、§10.7 M6 第 1、2 条）：提醒原文、各档措辞、`peak-reminder.ts` 的注释与 `ORCHESTRATION.md` §11.4 整节只由 M6 R1 改；规则板那一行不引用、不转述提醒，不加 0.5 评审 F45 的 (a)；`src/shared/peak-mode.ts` 与服务最小一片已在 main（0.10 §16.1）。0.10 §16 末段只写了 M6 的 R1「R1 合入之后就能做」，没有写先后：请规则板在自举之后把「M6 R1 先于规则行默认启用、先于整块规则板的 R4」记进它 §16（§16） | M6 R1 只读已在 main 的 `src/shared/peak-mode.ts`，不等规则板；§1.4 第 13 条的 L3 两段一起看 |
| M6-R2 | 规则板 | 人设规则的排队、每步提醒与唤醒文字写出高峰结束的时刻（§7.2 第 1 条）；脚本自查的文字规则板 0.10 已写出（rules:§6.4） | M6 做（S1），接在 rules:§6.4 |
| M6-R3 | 规则板 | `checkCall` 收 `signals`、`peakUntil`、`waitedMs` 与 `glmSpend`（§7.2 第 2 条）；每一次判定由 `checkCall` 写一条 `rules.check`，`gateOnRules` 不写（编排方裁定） | 规则板 0.10 已照做（rules:§9.4、§10.5、§10.7 M6 第 3、4 条）；M6 做 S2 |
| M6-R5 | 循环板、M7 | 高峰结束时叫醒闲着的主 Agent（少做与不做两档都叫）：循环板上编排层的第 14 项 `loops.peak-end`；高峰里只剩被挡的活时不计空转、停住自动推进与 `resume-drive` 归 M7（编排方裁定） | 关闭：循环板 0.6 §3.4、§6.9 与规则板 0.10 §3.6、§10.7 接了；M6 只交高峰的计算（§8.3） |
| M6-R6 | 规则板 | 文字里的时段说明读计价服务的 `peakHours` | 关闭：规则板 0.10 §3.1、§3.2、§6.4、§9.1 已照做 |
| M6-R7 | 规则板 | 附属条目一行列出最近 7 天自报过的命令与自报值（读 `rules.check`） | 规则板 0.10 仍推后到指标流水有读接口之后（rules:附录 E）；建议，不挡 |
| M6-L1–L5 | 循环板 | 列出、额度快用完、登录失效、交给谁、留痕（§8.4）；M6-L1 的「GLM 通道包未装」一行已删（循环板 §17 对 M6 第 1 条） | 循环板 0.6 §3.4 逐条落实；GLM 包的数据随 Q2 |
| `channel.peak-changed` | 循环板 | 循环行照计价服务的 `peak` 与 `nextPeakChange` 推出，「谁报」写 GLM 通道（循环板 §4.3）；GLM 包保证 `peak` 是时刻的纯函数、边界在整分钟（§5） | GLM 包不另交事件；`nextPeakChange` 已在 main（规则板最小一片），循环板 S3 的这条依赖已满足，批注告诉循环板即可 |
| 指标 | 指标流水 | 接收 §14.2 的 GLM 四类事件（`glm.peak-reminder` 多带 `peakMode` 与 `peakWorkerCap`）；定服务名、信封，以及账号一级的、不带会话的事件（循环板发起的额度读取）归哪份流水：指标流水按 `d-rules-in-repo` 放在项目的 `.llm/`，这类事件没有项目；给规则板的 `checkCall` 一个 DSH 之外可用的库写入口（rules:§10.7 指标一条），写入口不在时什么都不做 | GLM 包在服务在时交；脚本自查的判定事件经规则板写 |
| 脚本自查与拦路脚本 | 规则板 | 无新请求：`checkCall` 的选项、退出码和 `text` 照旧（rules:§9.4）；0.5 只是把「会多等、超时按条目判、不在后台接着跑」写进 M6 一侧（§7.2） | M6 做 S2 |
| 上手页 | plain-ui | 讲高峰模式的那一句若写钟点，取 `peakHours.zh` | 建议 |

## 19. 由 agent 定、人可推翻的事项

每行一件事：采用的做法，没选的做法与原因。

| 事项 | 定了什么 |
| --- | --- |
| 什么时候读额度 | 采用：人敲 `/glm-status`、`/hourness` 时读；装了循环板时，GLM 有新用量、上次读数满 15 分钟再读一次；60 秒内复用（§4.4）。没选：后台每 15 分钟定时读，因为没人用 GLM 时也在发请求，网关对频繁查询限速。 |
| 预估的速度从哪来 | 采用：服务端读数的变化（§4.7）。没选：本地用量流水的积分，因为看不到其他客户端，额度窗口的总量单位不明，换算不了。 |
| 读数存哪 | 采用：用户级目录的额度流水（§4.5；整个账号的额度与用量留在用户级，宪章 0.7 §9，`d-rules-in-repo`、`d-memory-scope`）。没选：只放内存，因为重启后「两次读数」的依据丢失，事后查错没有材料。 |
| 上游限额错误怎样捕获 | 采用：适配器在抛错之前写流水（§4.6）。没选：`glm-login` 在 `llm/stream` 上观察错误，因为错误经过瀑布的路径没有核实。 |
| 窗口怎样命名 | 采用：按类型与离重置的时长，分不清时不猜（§4.3）。没选：按重置先后排位次，因为 zcode-api 实测会错位。 |
| 额度、时段说明与条目放哪个服务 | 采用：计价服务加三个可选成员（§5）。没选：每样另开一个服务，因为每多一个就多一套提供、撤销与形状检查，提供方与使用方又都相同。 |
| 时刻怎样显示 | 采用：本机时区，高峰判定仍按 UTC+8（§4.8）。没选：一律 UTC+8，因为本机时区不同时人要换算。 |
| 额度读取遇到 401 | 采用：照 3.17.1 只记一次失败，令牌按有效期换新（§4.2）。没选：带被拒指纹强制重铸一次，因为 ZCode 不发这个铸造请求。 |
| `glm-login` 怎样知道套餐 | 采用：它自己的配置项 `plan`，注释写明两行要相同（§4.2）。没选：读 `glm-llm` 行的行健康文字，因为那会把给人看的文字变成接口。 |
| `nextPeakChange` 放哪 | 采用：`src/shared/pricing.ts`（§5）；规则板最小一片已加好，M6 不再加。没选：`src/shared/quota.ts`，因为与规则板写的位置不同。 |
| 脚本自查的入口放哪 | 采用：新文件 `scripts/rules-gate.mjs`，规则库按编译产物动态导入（§7.2）。没选：`scripts/sandbox.mjs`，因为真网冒烟脚本不导入它。 |
| 真网冒烟自报什么 | 采用：`necessary`，少做档照常跑，不做档排队（§7.2）。没选：`optional`，因为它是改了通道之后挡在合入前的一次核对，积分少，挪到 18 点后会拖住合入。 |
| 高峰提醒各档的措辞 | 采用：读不到档位与无影响时用今天的原文；少做时说「同时至多 N 个 GLM 子 agent（服务给了 `glmWorkerCap` 才写）、不开始可挪的重活，由主 Agent 挪到高峰之后（派出去的也算），必要的活与派给你的任务照做」；不做时说「不派 GLM 子 agent、不起花 GLM 积分的脚本；子 agent 的调用被推迟时停下并交回停在哪；主 Agent 不被管，照常回话和干活」；两档都不说「只是告知」，四档都说「不要换模型或套餐，除非用户要求」（§3.4）。没选：0.3 的一律去掉「不要推迟工作」，因为只装 GLM 包时没有档位，今天的原文与谁都不相抵，裁定也要它不变；也没选 0.4 的不做正文「GLM 的活等到 18:00，harness 会叫你接着做」，因为它对 GLM 路由上的主 Agent 是错的（`d-main-agent-peak-exempt`）。 |
| 少做档对子 agent 怎样说 | 采用：「派给你的任务照做」，挪不挪由主 Agent 在派之前定（§3.4）。没选：叫正在做的子 agent 自己停下可挪的活，因为它不知道自己的任务是不是可挪的，停在半截会丢掉已做的部分。 |
| 不做档的正文对谁说 | 采用：同一份正文给主 Agent 与子 agent，主语写在每一句里（§3.4）。没选：分角色写两份，因为 `stateFor` 不带角色，加角色是改规则板的契约，GLM 包也没有别的信号能判出主 Agent（主 Agent 的判定在编排层）。 |
| 少做档要不要写上限 | 采用：服务给了 `glmWorkerCap` 才写「at most N GLM subagent(s) at a time」，数不是 M6 的（§3.4）。没选：写死 1，因为数归规则板，写死了会与 M7 执行的数不同；没选：不写，因为最小一片阶段规则板还没有每步提醒那一行，不写则 GLM 主 Agent 在派活被 `slots_full` 拒绝之前不知道上限。 |
| `gateOnRules` 要不要先影子 | 采用：不设影子期，理由与反面写在 §7.2。没选：先只记录再拦截（宪章 0.7 对代码里的新门禁的默认做法），因为判定是规则板上人定的条目，不是 M6 的新判定。 |
| 脚本自查的仓库根怎么给 | 采用：默认 `scripts/` 的上一级，`projectRoot` 只给测试注入（§7.2）。没选：用环境变量 `DSH_HOME` 指向临时目录（0.4 的做法），因为规则状态已在项目里，不在用户级目录（`d-rules-in-repo`）。 |
| 提醒什么时候读档位 | 采用：每段高峰里第一个 GLM 步、要发提醒时读一次，同一段高峰里档位改了不重发（§3.4）。没选：每个 GLM 步都读、档位一变就再提醒，因为多出的 notice 会打断提示词缓存，主 Agent 已由规则板那一行得知，不做档另有排队文字与唤醒消息。 |
| 时段说明从哪来 | 采用：`credits.ts` 的 `PEAK_HOURS`（中英两份），提醒、`basis` 与计价服务的 `peakHours` 都取它（§3.4、§5）。没选：规则板与提醒各写一份，因为改时段要改几处。 |
| 额度快用完的门槛 | 采用：5 小时或每周已用 80%，或预计一小时内用完，每个额度周期说一次（§8.2）。没选：用完时才说，因为那时已经来不及挪活。 |
| 怎样算登录被拒 | 采用：模型请求在强制重铸之后仍被拒、定位或铸造时服务端回 401 或 403（`project_token_http_401`、`project_token_http_403`）、登录令牌为空（§4.9）。没选：凡是铸造失败都算，因为网络、超时、429 与 5xx 也会让铸造失败。 |
| 「同一次登录」怎样认 | 采用：被拒记录带登录令牌的指纹，与当前凭证的指纹比（§4.9）。没选：比凭证文件的修改时刻，因为项目 Key 的位置记录会写回同一个文件，没重新登录时间也会变。 |
| 循环板的 GLM 条目由谁声明 | 采用：GLM 包经计价服务交出条目数据，循环板只读列出与执行（§8.1）。没选：循环板代码里写 GLM 的条目，因为编排层包不带模型专属的内容。 |
| 写不写 2026-10-29 的缺口行 | 采用：写一行，删掉文件即撤销（§6.2、§16 G1）。没选：不写，只报范围，因为面板与以后的周报看不出删过 806 条。 |
| 缺口记录放哪 | 采用：单独的缺口文件（§6.2）。没选：写进用量流水，因为现有读者会把它计为无法读取。 |
| 时刻显示怎样测 | 采用：`formatMoment` 带可注入的显示时区，测试传 +480（§4.8）。没选：测试里设 `process.env.TZ`，因为它只对新进程生效，同一进程里的其他测试也受影响。 |
| 读额度前的订阅核验 | 采用：不做，记为已知差异（§17）。没选：照做，因为多一个用 OAuth 令牌的请求，结果不改变显示。 |
| 命令等额度多久 | 采用：3 秒，之后用上一次读数（§4.4）。没选：等满 15 秒，因为人在等。 |
| 脚本在规则状态读不出时 | 采用：告警一行后照常开始（§7.2）。没选：拒绝启动，因为规则板一坏，练习题就跑不了。 |
| M6 R1 与规则板 R4 的先后 | 采用：规则板最小一片 → M6 R1 → 规则行默认启用 → 整块规则板 R4（§16）。没选：反过来，因为那一段时间里 GLM 会话会同时读到「不要推迟工作」与「把可挪的活挪到 18 点以后」。 |

## 20. 待人定的事项

没有。

0.2 的 D1（默认规则做什么：只给人看，还是也告诉模型）由人在 2026-10-30 定了，记在 `d-peak-mode`：「高峰继续提醒模型，但是加一个档位吧就是高峰模式，人可以选择无影响，少做，不做。要让主Agent知道现在是不是高峰，应该选哪个档位」；之后又定默认档：「默认少做，新手教程提醒用户就行了，只挪重活对的。少做或者慢做，减少并发数量，不做重活之类的」。本稿据此删去 0.2 的「只给人看」一支与它的步（0.2 的 R1、图节点 `m6-reminder`）。

0.4 照做的编排方接缝裁定（§0.1）是 agent 定的、可推翻，不是人定的；人放行时可以推翻其中任何一条，放行稿里写明了（`onepage.md`）。

0.5 没有新的待人定事项。`d-main-agent-peak-exempt` 与规则板最小一片带来的改动都落在已有的人定里；0.5 新增的两处 agent 定的事项（`gateOnRules` 不设影子期、少做档的提醒写不写上限）在 §19，人可推翻。放行稿 `onepage.md` 仍写在 0.4 上，评审通过后重写，那时再核对它里面的每一句（尤其「不做」一档的说法）。

以后若要问人，照 `d-chat-not-cards`：一个方案，背景、推荐、疑问、不做四行，各成一段，每行的重点几个字加粗，问话放在最后；不列选项表。M3 附录的 `propose_to_human` 落地之后照它的长度规则写。

## 21. 修订记录

- 0.1（2026-10-29）：初稿。写作中途收到人的更正（§3.1：默认规则只有峰谷定价，其余是例子），据此改写了摘要、需求、默认规则、错峰、待决各节。
- 0.2（2026-10-29）：按设计评审第 1 轮（1 HIGH、2 MEDIUM、10 NIT）修订：依据改为规则板 0.4；`glm-login` 加 `plan`；额度路径的 401 照 ZCode 只记失败；缺口行改为 agent 决定；其余见 `design-v0.2.md` §19。
- 0.3（2026-10-30）：按设计评审第 2 轮（1 HIGH、3 MEDIUM、5 NIT）修订，并按编排方转来的人定与特性补了循环板（§8）、指标（§14.2）、登录状态（§4.9）与给人看的一页（`onepage.md`）。依据改为 main `4e26f79`、规则板 0.5 与它的第 1 轮评审、ZCode 3.17.1。小节号：0.2 的 §8–§13 顺延为 §9–§14.1，§14–§16 为 §15–§17，§17 为 §19，§18 为 §20；新加 §4.9、§8、§14.2、§18。
- 0.4（2026-10-30）：人在第 3 轮评审之后再给一轮（「行，改吧」）。按设计评审第 3 轮（0 HIGH、2 MEDIUM、6 NIT）与编排方的接缝裁定修订；依据改为 main `480e264`、规则板 0.8、循环板 0.3。小节号不变。0.3 原文在 `design-v0.3.md`。逐条回应在本节末尾的「0.4：第 3 轮评审逐条回应」。
- 0.5（2026-10-31）：对齐轮的 C 支，不是评审的回应。盘上有一份写到一半断了的 0.5（只有新的版本行和新的代码依据一条，正文全是 0.4 原文），本稿先核对它再接着做，处理见「0.5：盘上稿的处理」；然后按 `d-main-agent-peak-exempt`、规则板最小一片在 main 上实际交出的服务、`d-zcode-3171` 与 0.4 之后的其他决定改正文，见「0.5：对齐表」；对其他设计的请求在 §18 和「0.5：给其他设计的请求与没做完的」。0.4 原文在 `design-v0.4.md`。小节号不变，验收新加第 24、25 条。0.5 还没有评审。

0.3：第 2 轮评审逐条回应：

| # | 处理 | 改在哪 |
| --- | --- | --- |
| F4（HIGH，`d-peak-mode` 没有满足） | 改。D1 按人的原话关闭，§20 写「没有」，文首不再写选项表；删去「只给人看」一支（0.2 的 R1、图节点 `m6-reminder`、按 `scope === 'builtin'` 过滤、§8 两格「按 D1」、§12 与 §13 的 D1 行）。「默认不排队」全部改为按档位写：§0、§1.6、§3.3、§7.4、§12 的不变量、§17 给 `ORCHESTRATION.md` §11.4 的写法；验收第 15 条拆成无影响、少做（出厂默认：`npm run calibrate` 周三 15:00 退出码 5、19:00 退出码 0，agent 的工具调用两时刻相同）、不做三档。§3.3 加分工表：档位与主 Agent 那一行归规则板，M6 交付提醒与高峰的计算。依据改为规则板 0.5，按它 §10.7 的 M6 一条逐项改（`checkCall` 签名、`check.ts`、不必从 `cli.ts` 抽、不必另筛主体、`toldBy` 过滤不改、小节号）。默认档引 `d-peak-mode`，不引 0.5 的「出厂暂定无影响」，并在 §18 写明第 15 条依赖规则板评审 F42 | §0、§0.1、§1.4 第 13–15 条、§3、§7、§9、§12、§16、§17、§18、§20 |
| F5（MEDIUM，M6-R3 与规则板 0.5 §9.4 不一致） | 改。`gateOnRules({glmSpend, peakAt, now?, sleep?, checkModule?, pricingModule?})`；每次判定前现算 `signals: {'glm-peak': peakAt(now)}`，调用 `checkCall({tool: 'pwsh', args: {command}}, {project, signals, glmSpend})`，`--wait` 的每次重判重算；删去「从 `cli.ts` 抽出」与「先筛主体」；`RulesCheckError` 与导入失败同样告警一行、照常开始。调用点：`run-calibrate.mjs` 传 `optional`，`smoke-zcode-authorized.mjs` 传 `necessary`，理由进 §19。验收第 15 条覆盖两种自报乘三档；第 17 条钉住 `glmSpend` 不从命令行读；§11 加 `glmSpend` 一行 | §7.2 第 2 条、§1.4 第 15–17 条、§11、§15.1、§16 S2、§19 |
| F6（MEDIUM，没有按 3.17.1 复核） | 改。`host:+偏移` 改为 3.17.1 安装包，文首写明文件、大小、MD5 与「安装版可能带用户补丁，只作机制参考」；3.16.3 的偏移只在对比时附在括号里，指明 `app.asar.orig-3163.bak`。§4.1 换成两版对照表（地址、超时、`fetchQuota`、头、团队参数、`x-request-id`、凭证、`resolveCurrent`、成功判定、解析、`readApiJson`、覆盖变量、origin、两条路径、1308、本地峰谷），带 * 的偏移本稿复读确认。加 Q0：把 3.17.1 的 host 包导出到 `reference/zcode-3.17.1/host/`（不进 git），之后引用改到那里；`FACTS.md` §1 那一行改为 3.17.1 | 文首、§4.1、§4.2、§10、§12、§15.3、§16 Q0、§17 |
| F7（MEDIUM，额度请求还带 `x-request-id`） | 改。请求头为 `{authorization: <令牌原样>, 'x-request-id': randomUUID()}`，每次读取新生成；验收第 5 条断言恰好这两个头、后者是 UUID、两次不同；V2 关闭并写上偏移（`request`、`resolveRequestHeaders`、`isRequestForEndpoint`、`withRequestIdHeader`、额度用的 `apiClient`）；`DESIGN.md` §4.8 的已一致一项写明这两个头 | §4.1、§4.2、§1.4 第 5 条、§10、§12、§15.3、§17 |
| N11（两条读额度的路径） | 改。§4.1 表里写明两条路径：一条把失败读作没有额度，一条让整个用量快照失败，都不重试、不重铸；本包把额度当独立一节，效果同第一条 | §4.1、§10 |
| N12（§17 仍是编号选项） | 改。§19 每行写成「采用：……。没选：……，因为……。」 | §19 |
| N13（`--wait` 与时刻只对引用 `glm-peak` 的规则成立） | 改。只在 `CheckResult.signals` 里有 `glm-peak` 且为真时写时刻、按 `nextPeakChange` 睡；其余情形不写时刻，`--wait` 每 60 秒重判、至多 8 小时，每次重算 `signals`；验收第 16 条加一例 | §7.2 第 2 条、§1.4 第 16 条 |
| N14（提醒与档位并存时的读法） | 改，但没有照评审的改法。评审建议正文不动、说明「unless the user asks」对上规则板的「set by the human」。规则板 0.5 第 1 轮评审 F42 要求出厂档位不写「set by the human」，从没选过档位的项目里这个对应不成立；F45 也指出两句相反。所以采用 F45 的 (b)：改掉提醒末句里「不要暂停或推迟工作」那半句，理由写在 §3.4 并记为 §19 的 agent 决定。评审要的探针核对照加：少做档周三 15:00 GLM 主 Agent 的请求里两条 notice 都在 | §3.4、§1.4 第 13 条、§16 S3、§19 |
| N15（时段说明只有一处） | 改，用推荐的做法并扩到中文：`credits.ts` 导出 `PEAK_HOURS`（`en`、`zh`）与 `PEAK_END_LABEL`，提醒正文、`basis` 与计价服务的 `peakHours` 都取它们；规则板的文字读 `peakHours`，没有时省去括注（§18 M6-R6） | §3.4、§5、§12、§18 |
| 评审「未核实」里的「3.17.1 有没有定时读额度」 | 部分核实：设置页的 hook 60 秒内复用，挂载与刷新时读，这一带没有定时器（renderer:+6189443）；别处留作 V7 | §4.1、§15.3 |
| 评审「未核实」里的「本机 3.17.1 安装版有没有用户补丁」 | 照旧看不出；文首写明只作机制参考，Q0 导出后以导出的文件与 MD5 为准 | 文首、§16 Q0 |

0.3：按编排方转来的人定新加的部分（不是评审发现）：

| 人定或特性 | 本稿怎样落 | 改在哪 |
| --- | --- | --- |
| 循环板：GLM 插件的默认（高峰开始与结束、额度快用完、登录过期）做成循环板条目，不写死在代码里 | GLM 包经计价服务交出四条条目数据；高峰开始与结束的执行留在规则板，提出 M6-R5 的缺口；对循环板的要求 M6-L1 到 M6-L5 | §8、§18 |
| `d-defaults-readonly` | 四条条目只能看；门槛写在条目数据里，人要别的门槛就加自己的条目 | §8.2、§12 |
| `d-rules-visible` | M6 不加门；脚本自查本身不带规则；GLM 包自己执行的两条也列在循环板上；M6-R7 建议规则板列出自报过的脚本 | §7.2、§8.1、§18 |
| `d-chat-not-cards` | 没有要问的；以后问人的格式写明；放行稿末尾的一件按四行写 | §20、`onepage.md` |
| `metrics` | GLM 包交四类事件，服务在时才交 | §14.2 |
| 登录过期提醒要有可靠的事实 | 新的登录状态（三种判据），经 `quota()` 交出 | §4.9 |

0.4：第 3 轮评审逐条回应（`design-review.md` 第 3 轮，`design-review.json`；行号指 `design-v0.3.md`）：

| # | 处理 | 改在哪 |
| --- | --- | --- |
| F8（MEDIUM，谁改高峰提醒原文与 §11.4） | 改，照编排方裁定，不照评审写的分法。评审要的是「规则板 R4 改 §11.4 第 1076 行，其余归 M6 R1；规则板那一行不引用提醒」；裁定把 §11.4 整节（含 1074、1076 行）、提醒原文与各档措辞都给 M6，规则板只管档位并经 `glmHournessPeakMode` 交出，只装 GLM 包时提醒照今天的原文。规则板 0.8 已照这条写好它那一侧（rules:§3.4、§3.5、§10.6、§10.7 M6 第 1、2 条），0.3 §18 里只是草稿的那条批注不再需要上图才能生效。M6 一侧：提醒按档位选正文，读不到档位与无影响时与今天逐字相同，少做与不做两档去掉「只是告知」与「不要推迟」（§3.4）；R1 改写 §11.4 整节（§17）；先后写死为规则板 R1 → M6 R1 → 规则板 R4，至少在规则行默认启用之前（§16）；验收第 13 条按四档与五种读不到的情形重写，L3 在同一个请求里两段一起看：规则板那段不含 `keep working`、`postpone` 与 `PEAK_REMINDER_TEXT` 的任何一句，提醒那段是少做原文、不含 `information only`（§1.4 第 13 条、§16 S3） | 文首、§0、§0.1、§1.2 F7、§1.4 第 13 条、§3.3、§3.4、§9、§10、§11、§12、§13、§16、§17、§18、§19 |
| F9（MEDIUM，脚本自查的判定没有写入方） | 改，照编排方裁定，不照评审写的改法。评审要 `gateOnRules` 写事件；裁定定为规则板的 `checkCall` 每判一次写一条 `rules.check`，`gateOnRules` 不写。规则板 0.8 已照做：`checkCall` 在 DSH 之外经指标流水的库写入口写，写入口不在时判定不变（rules:§9.4、§10.5）。M6 一侧：`gateOnRules` 交 `peakUntil` 与 `waitedMs`，不导入任何指标出口（§7.2）；§14.1 那一行写定写的人；§18 给指标流水的一行加「给 `checkCall` 一个 DSH 之外的库写入口」；M6-R7 照规则板 0.8 推后；验收第 22 条加一例：`--wait` 下恰好 3 次判定、3 条 `rules.check`，各次交的选项逐项钉住，规则板 R3 合入后对真的 `checkCall` 与假的写入口再跑一遍 | §0、§3.3、§7.1、§7.2、§11、§12、§13、§14.1、§14.2、§15、§18、§1.4 第 22 条 |
| N16（登录状态的判据与凭证文件的写法不符） | 改，用评审给的第二种做法。凭证文件不存在、大小为 0（`/glm-logout` 写空串）、解不开或没有登录令牌都算 `absent`；`login-rejected` 记录带登录令牌的指纹（SHA-256 前 16 位），按指纹认「同一次登录」，不再比修改时刻，项目 Key 的位置写回不会让状态提前回到 `ok`；凭证文件没变时不重复解密。另据 `8b12baf`（PAT 平面的失败照 3.17.1 抛 `project_token_http_<status>`），铸造一路直接认码，0.3 要的 `onRejected` 构造参数删去，`project-token.ts` 不改 | §4.5、§4.9、§10、§11、§12、§13、§14.1、§15、§16 Q2、§19、§1.4 第 20 条 |
| N17（验收第 15 条要的档位来源 `CheckResult` 里没有） | 换了改法关闭：不给规则板加新要求。规则板 0.8 给脚本自查命中附属条目时写了专门的文字，写出条目 id、档位的来源（「the default」或「set by the human at <时刻>」）与「until 18:00」（rules:§6.4，0.6 评审 F62、0.7 评审 F72），`gateOnRules` 原样写 `CheckResult.text`；第 15 条按那段原文断言 | §1.4 第 15 条、§7.1、§7.2 |
| N18（新末句的「only」与只装 GLM 包时的推断） | 换了改法关闭。少做与不做两档的正文去掉「This is for your information only」，四档都以「Do not switch models or plans unless the user asks.」结尾；读不到档位与无影响时用今天的原文（裁定的要求），「only」在这两种情形下说的就是实情。只装 GLM 包时的「模型照常做，与今天相同」不再是推断：正文与今天逐字相同，行为也就是今天的行为，0.3 那半句删去，不需要另做会话检查 | §3.3、§3.4、§1.4 第 13 条、§19 |
| N19（放行稿把脚本的排队说成会自己接着跑） | 改，照评审给的三句：开头改为「高峰时练习题会先停下，说明 18 点以后再跑」；不做一句改为「练习题和真网核对都先停下，18 点以后再跑（加 `--wait` 就自己等）」；「记进指标流水」改为「由系统自己记下来」。放行稿另随 F8 改了提醒一条与「交给别的模块的」一节 | `onepage.md` |
| N20（依据的提交与图操作草稿的写法不准） | 改。依据改为 main `480e264`，写明 `c17ff5d`、`61be79a` 是在 `4e26f79` 之后经 `823795a` 合入的，并列出与本稿有关的两处变化（`8b12baf` 的码、`src/glm-prompt/index.ts`）；读档位与 `glm.peak-reminder` 的接线文件写进 R1、Q2 的文件列表；「草稿见 `graph-ops-v03.json`」改为「放行后由编排方按本表建」，并写明那份草稿只有批注 | 文首、§2、§16 |
| N21（给循环板、指标流水与规则板的要求没上图） | 改。§18 写明以项目图上的批注为准；三条批注按现状重写进 `graph-ops-v04.json`，由编排方执行。核对过：规则板 0.8 与循环板 0.3 已经读到并照做了本稿 0.3 的要求（rules:§10.7 M6 一条，循环板 §3.4、§17），所以挡路的只剩指标流水那一条（库写入口与 GLM 四类事件），它的设计还没有成稿 | §18、`graph-ops-v04.json` |

0.4：按最新的裁定对齐（不是评审发现）：

| 裁定 | 本稿怎样落 | 改在哪 |
| --- | --- | --- |
| 高峰提醒原文与各档措辞归 M6，§11.4 由 M6 改写；规则板经服务交档位；只装 GLM 包时照今天的原文 | 见上表 F8 | 同上 |
| 脚本自查的判定事件由 `checkCall` 写，`gateOnRules` 不写 | 见上表 F9 | 同上 |
| 少做的并行上限的数归规则板，经服务交出，M7 在派活处读 | §1.6、§3.3 写明归谁；M6 不写 | §1.6、§3.3 |
| 少做的高峰结束时叫醒主 Agent 是循环板上编排层的条目，GLM 包只给高峰变化事件与高峰的计算 | §8.3 整节重写：0.3 的理由「GLM 包不知道档位」改为「GLM 包没有主 Agent」；M6-R5 关闭；`GLM_LOOP_DEFAULTS` 仍是四条；§5 写明 GLM 包怎样「给」高峰变化事件（`peak` 与 `nextPeakChange`，循环行推出 `channel.peak-changed`）与它保证的三点；M6-L1 那半句删去 | §0、§0.1、§5、§8.1、§8.3、§8.4、§9、§18 |
| 高峰里只剩被挡的活时的轮次与 `resume-drive` 归 M7 与循环板 | §1.6、§3.3、§8.3 写明，M6 不做；§17 给 §11.4 排期一条的新写法里写出这条分工 | §1.6、§3.3、§8.3、§17 |

0.5：盘上稿的处理（对齐轮开始时 `design.md` 已写到一半断了；下表的核对都是只读的）：

| # | 找到什么 | 怎么核对 | 处理 |
| --- | --- | --- | --- |
| 1 | 同目录有 `design-v0.4.md`，211,569 字节，MD5 `1EA411E5DF326BFAD5C45A951C09AB55`，与盘上稿版本行写的一致；`design-v0.3.md` 的 MD5 也与 0.4 记的 `3692a823…` 一致，`design-v0.2.md` 在。`.agents/` 在 `.gitignore` 里，git 历史里本来就没有这些文件，不需要也找不到别处的副本 | `Get-FileHash -Algorithm MD5` | 0.4 的副本齐全，不改它们 |
| 2 | `design.md` 与 `design-v0.4.md` 逐行比较只差三处：版本行（0.4 改 0.5，很长，说「每处改动答的是哪一条，见 §21 末尾的「0.5」两张表」）；新加的一条「代码（0.5）」依据；旧的「代码」依据改名为「代码（0.4 的依据，仍有效的部分）」。其余 1,200 多行与 0.4 逐字相同，§21 里没有 0.5 的表，§3 到 §20 没有一处 0.5 的改动，也没有被截断的表、代码块或半句话 | `Compare-Object` 逐行比较 | 没有要删的残片。版本行里的话大半没有兑现，按没写完看：整句重写，不照用；改名的那条依据保留；「代码（0.5）」那条按 3 处理 |
| 3 | 「代码（0.5）」依据写 main `06219c6`，并把 M3 第 1 步 `9c346fb` 算在 `480e264..06219c6` 里 | `git merge-base --is-ancestor`：`9c346fb` 不是 `06219c6` 的祖先，是它之后的提交；现在的 HEAD 是 `419b6ea`，`06219c6` 之后碰代码的只有 `9c346fb`。其余内容（规则板最小一片的提交清单、`peak-mode.ts`、`nextPeakChange`、`project-root.ts`、`lock.ts`、探针场景 `rules-peak` 与 `rules-peak-hourness`、`PEAK_NOTICE` 在第 365 行、`src/glm-prompt` 等目录没变）逐项读源码核对属实 | 内容保留，基线改为 `419b6ea`，补上限字段、探针场景的步骤、抽查过的行号（文首「依据」第一条） |
| 4 | 版本行说 `design-review.md` 的轮次表有「第 4 轮、0.4、0/0/5」一行而正文没有这一轮 | 属实：表里有这一行，正文止于第 3 轮的「结论」，`design-review.json` 也止于第 3 轮 | 这句话保留（版本行后一段）。0.4 按没有评审过看；这一行要由评审步处理，本步不写评审文件 |
| 5 | 同目录的 `tmp-asar-check.cjs`、`tmp-asar-chunk.cjs`、`tmp-cjs-find.cjs`（更早一次失败的评审运行留下的，文件头写「用完删除」）、各轮 `graph-ops-*.json`、`onepage.md`（写在 0.4 上） | 读过 | 脚本没删，本步只读地用了 `tmp-asar-check.cjs` 的 `info` 与 `find` 两个模式；`graph-ops-*.json` 不动，其中 `graph-ops-v04.json` 给 `metrics` 的一条已过时（文首「范围」一段）；`onepage.md` 不动，评审通过后重写 |

0.5：对齐表（来源 → 0.4 的写法 → 0.5 改成什么 → 改在哪）：

| # | 来源 | 0.4 的写法 | 0.5 改成 | 改在哪 |
| --- | --- | --- | --- | --- |
| A1 | `d-main-agent-peak-exempt`；`m6` 节点 2026-10-30T08:12Z 的批注（规则板 0.9 请 M6 在不做档下不要对主 Agent 说「停下」） | 不做档正文「No GLM work until <end>: the harness defers the tool calls of GLM sessions and tells you when to continue」；摘要、§3.3、§7.4、§8.3 里「不做时 GLM 会话的工具调用也排队」 | 不做档正文只说谁该做什么：不派 GLM 子 agent、不起花 GLM 积分的脚本，子 agent 的调用被推迟时停下并交回，主 Agent 不被管、照常回话和干活；排队的说法只留给 GLM 子 agent 与派活。正文不写怎么排、怎么唤醒，所以在最小一片阶段（没有排队）也是真的 | 摘要、§0.1、§1.6、§3.1、§3.2、§3.3、§3.4（表、理由、读法、代价）、§7.1、§7.4、§8.3、§9、§12、§13、§19；验收 13、25 |
| A2 | 同上 | 少做档正文没有上限，只说「由主 Agent 挪」 | 加上限半句（服务给了 `glmWorkerCap` 才写）与「including work it dispatches」，与规则板那一行的意思一致 | §3.4、验收 13 |
| A3 | 同上 | 同一份正文给谁读没有说 | 写明同一份正文给主 Agent 与子 agent，主语写在每一句里；不分角色的理由（`stateFor` 不带角色）记在 §3.4 与 §19 | §3.4、§19 |
| B1 | 规则板最小一片在 main 上实际交出的服务（`src/shared/peak-mode.ts`、`src/rules/peak.ts`） | 按规则板 0.8 §7.2 的设想读 `level`、`origin`、`peak` 三项；文件与服务「规则板 R1 建、R4 提供」 | 文件与服务已在 main（行默认禁用）；读 `level`、`origin`、`peak`、`glmWorkerCap` 四项；`ReminderMode` 加 `glmWorkerCap`；notice 的 `source` 加 `peakWorkerCap`；校验行加 `glmWorkerCap`；§2 加一行现状 | 依据、摘要、§2、§3.3、§3.4、§5、§11、§14.1、§14.2、§16 |
| B2 | 同上，`pricing.ts` 里的 `nextPeakChange` | Q1 或规则板 R4 谁先合入谁加 | 已在 main，签名与 §5 写的相同；M6 不再加，Q1 只补测试里缺的时刻 | §5、§16 Q1、§19、§18 |
| B3 | 规则板 0.10 的附属条目与形状 | 附属条目两条（少做一条、不做一条）；§7.3 的规则示例用 0.8 的 `when`、`action: {class: …}`、`effect` | 附属条目四条（不做三条）；§7.3 的两条示例改成 `when` + `filter` + `condition` + `action` 的形状；验收 15 里不做档管脚本的是 `builtin:glm-peak-stop-scripts` | §3.2、§3.3、§7.1、§7.3、验收 15 |
| B4 | 探针 `rules-peak` 已在 main | 没有这个场景，L3 要等规则板 R4 | R1 的 L3 直接用 `rules-peak`，再加 `rules-peak-stop`；L3 的两段一起看留给整块规则板 | 验收 13、25、§15.1、§16 R1、S3 |
| C1 | `d-rules-in-repo` | `checkCall` 的指标写入口「按 `userDataHome()` 与项目键」；脚本自查的测试用 `DSH_HOME` 临时目录；§9 写「规则状态在用户级目录」 | 按项目根找项目 `.llm/` 里的指标流水；测试用临时 git 仓库加 `projectRoot` 注入；规则状态在项目的 `docs/rules/` 与 `.llm/rules/` | §7.2、§9、§14.2、§15.1、验收 15、§19 |
| C2 | `d-memory-scope`；宪章 0.7 §9 | 没有写 M6 的数据放哪一级的依据 | 额度流水与缺口文件是整个账号的额度与用量，留在用户级；M6 不存关于人的记忆，也没有项目经验 | §0.1、§4.5、§19 |
| C3 | `d-boards-as-hooks`、`d-script-timeout` | `checkCall` 只按规则表判 | `checkCall` 会跑人同意过的拦路脚本：`gateOnRules` 可能多等（缺省 10 秒、每条至多 30 秒），超时按条目的做法判、不在后台接着跑；`gateOnRules` 不设超时、不跑脚本；`--wait` 每次重判再跑一次 | §0、§0.1、§7.1、§7.2、§12、§13、验收 24 |
| C4 | 宪章 0.7 §6（代码里的新门禁先影子） | 没有说 | `gateOnRules` 不设影子期，理由和没选的做法写明，列为最可能不对的三处之一 | §0、§7.2、§19 |
| C5 | `d-dogfood-scope`、`d-freeze-until-dogfood`、`d-alignment-rounds` | 规则板线等规则板 R1–R4，提醒线 R1 等规则板 R1 | 实现在自举之后由 DSH 里的主 Agent 做；R1 不再等规则板，是自举之后第一个该做的步，要先于规则行默认启用和整块规则板 R4；S1 到 S3 等整块规则板 | 摘要、§0.1、§16、§18 |
| C6 | `d-agent-examples` | 没有说 | 写明不适用：M6 没有主 Agent 写的东西；§7.3 的两条规则是测试夹具，不是示范 | §0.1、§7.3 |
| D1 | `d-zcode-3171` | 已按 3.17.1 写，但没有写重核 | 只读重核：安装包仍是 3.17.1，`index.js` 的大小与 MD5 未变，两处偏移抽查一致；pristine 副本里没有额度代码与本地峰谷；Q0 导出的 host 目录加一个只作机制参考的说明文件 | §4.1、§3.4 末条、§16 Q0、§0.1 |
| E1 | 循环板 0.6、M3 附录 0.5、M7 0.6 | 依据写循环板 0.3 | 依据改到 0.6、0.5、0.6；两档都叫醒主 Agent；GLM 四条是数据，不走人加条目的批准路径 | 依据、§8.1、§8.3、§18 |

0.5：给其他设计的请求与没做完的：

| # | 给谁 | 内容 | 状态 |
| --- | --- | --- | --- |
| 1 | 规则板 0.10（已放行，自举之后办的批注） | 在 §16 记下「M6 R1 先于规则行默认启用、先于整块规则板 R4」；0.10 只写了 R1「合入之后就能做」（§18 第一行） | 写进 `graph-ops-align.json`，由对齐轮的收尾步写 |
| 2 | 循环板 0.6（已放行，同上） | 告知 `nextPeakChange` 已在 main，S3 的这条依赖已满足；规则板 0.10 §10.7 里「`nextPeakChange` 由 M6 Q1 或规则板 R4 先合入的一方加」的话也已不准 | 同上；不要求改契约 |
| 3 | 指标流水设计（同批对齐中，不是已放行的设计） | 指标流水按 `d-rules-in-repo` 在项目 `.llm/`；循环板发起的额度读取、上游限额等账号一级的事件没有项目，归哪份流水请指标设计定；`checkCall` 要 DSH 之外的库写入口（0.4 已请）；`graph-ops-v04.json` 里「按 `userDataHome()` 与项目键」一句作废 | 同上 |
| 4 | M3、M7、plain-ui | 没有新请求 | — |
| 5 | 本步没做 | `graph-ops-align.json`（任务说明要求本步不写）；`onepage.md` 的重写（评审通过之后）；`design-review.md`、`design-review.json` 的新一轮和第 4 轮那一行的处理（评审步） | 留给后面的步 |
| 6 | 没有核实到的 | 探针 `rules-peak` 的第一个 GLM 请求带不带高峰 notice（读了场景与 `peak` 场景的同款检查后〔推断〕，R1 的 L3 核实）；`gateOnRules` 不设影子期是 agent 的判断，不是核实的事实；§4.1 的偏移只抽查了两处，没有逐项重数 | 记在这里，评审可以挑 |
