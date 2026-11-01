# M6 用量、积分与峰谷：设计（项目图 `m6`）

版本：0.2（2026-10-29，按设计评审第 1 轮修订，逐条回应见 §19）。依据：main `eb614ab`（split 第 0–8 步已合入，两个包 `dsh-glm-zcode`、`dsh-hourness`；0.1 依据的 `6a6895e` 到 `eb614ab` 之间改的是项目图引擎、GLM 客户端包那一行的启用与探针的一个夹具，本稿用到的 `src/glm-llm/`、`src/report/`、`src/workflow/`、`src/shared/` 没有变，本轮复读了 `login-row.ts`、`glm-llm/index.ts`、`report/index.ts`、`report/panel.ts`、`morning-report.ts` 与 `auth/project-token.ts`）；规则板设计 `.agents/tasks/rules/design.md` 0.4（2026-10-29 22:01 写入的版本：0.3 第 3 轮评审 APPROVED 之后按人的更正缩成「概念与机制，加一条默认规则」，0.3 原文在同目录 `design-v0.3.md`；本稿只按 0.4 写，不再引用 0.3）；注入清点 `.agents/tasks/prompt-audit/report.md`（question-31 C）；split 设计 0.3 §4.3–§4.4；卡片字段按分支 `card` 的 `card-fields-table`（`label` 至多 20、`gain` 与 `cost` 各至多 60、`crux` 至多 60 个码点，规则板 0.4 文首引的同一份）。

范围：本稿只写设计。没有改代码、`docs/graph`、`~/.dsh`，没有用桌面版，没有发额度接口的请求。只读核对过的东西：ZCode 3.16.3 桌面安装包 `C:\Program Files\ZCode\resources\app.asar` 的 `out/host/index.js` 与 `out/host/chunk-5YNPFY3L.js`（按 asar 头读出文件后检索；chunk 里的结论来自设计评审第 1 轮的实读，见 §4.1）、`reference/zcode-api`、`reference/dsh-desktop-0.2.1-rc.3`（经 `docs/DESIGN.md` §2.4a 的对照表）、本仓库源码、用户级用量流水 `~/.dsh/glm-hourness/audit/usage.jsonl`（只读计数）与 `~/.dsh/sessions/` 下的会话文件（只读，§3）。读用的一次性脚本放在本目录、用完已删。

证据写法：`host:+偏移` 指 3.16.3 安装包 `app.asar` 里 `out/host/index.js` 按 UTF-8 读入后的字符偏移；`zcode-api:文件:行` 指 `reference/zcode-api/src/` 下的文件；其余沿用 `docs/DESIGN.md`。〔实读〕读过源码；〔实测〕跑过；〔推断〕由源码或数据推出、没有运行验证；〔未核实〕列进 §14.3 的核实项。

所依据的学科与标准（`docs/ORCHESTRATION.md` §4.3 架构栏）：测量与预测（预估耗尽用按时间加权的线性外推，写明依据与适用条件）；可靠性工程（超时、缓存、只追加的流水、失败不重试成风暴、建议性数据读不到时放行）；安全工程（凭证不落盘、不进输出，读接口只读）；人机交互与认知负荷（每个窗口一行、绝对时刻、写明不确定性，人的待决按 `d-option-card` 写成表）；ZCode 3.16.3 一致性（额度请求的形态、凭证与失败处理照 3.16.3：401 只是一次失败，不重铸令牌，`CHARTER.md` §3.1 第 1 条；偏离之处列进 §16 给 `DESIGN.md` §4.8 的已知差异）；`CHARTER.md` §7.1 条款 7（失败要出声）与条款 11（处处留痕）。

## 0. 摘要

- 积分口径（`ORCHESTRATION.md` §11.2）已在 M6.1 做完：公式、高峰全价、其余半价、按积分计的高峰占比，经计价服务 `glmHournessPricing` 给编排层面板（§2）。M6 剩下的是：晨报的「用量」一节改按积分（与面板同一个函数）；面板第一行写此刻是不是高峰、到几点；面板写明覆盖范围与历史缺口（2026-10-29 删掉的 806 条旧路由记录，§6.2；写缺口行是 agent 定的事，人可推翻，§17）。
- 额度取数（`DESIGN.md` §4.7）：GLM 通道包照 3.16.3 桌面壳的 `BigModelUsageQuotaProvider` 读 `GET https://bigmodel.cn/api/monitor/usage/quota/limit`，`authorization` 为项目令牌原样（§4）。只在人敲 `/glm-status` 或 `/hourness` 时读，60 秒内复用，不后台轮询。失败照 3.16.3 只记一次失败、不重试，401 也不重铸令牌。`glm-login` 行新增 `plan` 配置，体验套餐不发请求。读数写进用户级目录的额度流水 `audit/quota.jsonl`。服务端的读数包含 ZCode 等其他客户端与本机删掉的记录，所以额度一节不依赖本地用量流水。
- 预估耗尽（§4.7）：用同一窗口两次读数之间的变化，或窗口开始以来的平均速度，按高峰全价、其余半价折成「全价小时」的速度再往后推；窗口重置前用不完就报到重置时预计用到多少。依据写在每一行里。
- 计价服务契约加一个可选成员 `quota`（§5，split 0.3 §4.3 说过 m6 扩这份契约）。旧的 GLM 包没有它，面板写明「没有提供额度数据」。
- 默认规则只有一条（人 2026-10-29 更正，§3）：GLM 峰谷定价 `builtin:glm-peak-pricing`，工作日 14:00–18:00（UTC+8）按全价计积分，其余时段半价。它的定义、`glm-peak` 的当场计算与规则页上的一组由规则板 0.4 交付（0.4 §3、§10.1，规则板的 R1、R4）；M6 交付给人看的另外两处（`/glm-status` 与 `/hourness` 的高峰行），并决定告诉模型的那一半（D1）。在场、CPU 或内存限速、默认预算、Job Object、错峰排队都不是默认，是人以后可以自己加的规则的例子。
- 高峰提醒的检查（question-31 C，清点报告 §9 Q7）：718 个会话里 157 个收到过提醒，其中 153 个是探针的脚本 provider；4 个真实 GLM 会话收到提醒之后的 32 段助手文字里，0 段提到高峰或积分（§3.3）。没看到它给人添话，也没看到它改变模型的做法。推荐保留（D1 的「给人看，也告诉模型」），正文不改。
- 错峰排期经规则板（§7）：只在人自己设了引用 `glm-peak` 的规则时才有，M6 不设、不提议、不假定任何这样的规则。规则板 0.4 已经交付 `glm-peak` 的当场计算与默认规则进目录（0.1 的 M6-R1、M6-R4），M6 只给规则板加两样：排队、每步提醒与唤醒的文字写出高峰结束的时刻（M6-R2，接在 0.4 §6.4）；仓库脚本（标定、真网冒烟）启动前按项目规则自查（M6-R3，接在 0.4 §9.4 的 `check`），让人的规则也管得到 Kiro 里跑的脚本。复用规则板的条件、`queue`、等待单与每 5 秒的重判、唤醒、只由人写规则、命令行判定与退出码。花费只披露，不设上限（`ORCHESTRATION.md` §4.3）。
- 只装一个包（§8）：只装编排层包时面板按 token 列，没有高峰行与额度；只装 GLM 包时 `/glm-status` 有高峰行、额度与预估，高峰提醒照 D1。
- 实施（§15）：四条线。额度线（GLM 包）与面板线（编排层包）在公共契约之后并行；高峰提醒线等 D1；规则板线的文字一步等规则板 R1–R4 合入，脚本自查一步等规则板 R3（命令行）合入。M6 不加新行。

## 0.1 待人定的事项（摘要；表见 §18）

| # | 事项 | 推荐 |
| --- | --- | --- |
| D1 | 默认的峰谷定价规则做什么：只给人看，还是也告诉模型 | 也告诉模型（保留现有提醒） |

其余取舍由 agent 定、人可推翻，见 §17。0.1 的 D2（要不要写缺口行）改为 §17 的一条 agent 决定：缺口文件在插件自己的用户级数据目录里，约 250 字节，删掉即撤销。

## 1. 需求

### 1.1 要解决的问题

1. 人看不到额度：5 小时窗口还剩多少、周额度用了几成、照现在的速度什么时候用完。本地用量流水只看得到经 DSH 发出的请求，同一账号在 ZCode 等客户端的消耗看不到，本地算出的剩余量会偏高（`ORCHESTRATION.md` §11.3）。
2. 面板不说自己的覆盖范围：2026-10-29 从用户级流水删掉了 806 条旧 pi-ai `glm` 路由的记录（`DESIGN.md` §2.4），面板与晨报从此不计反代时期的消耗，但输出里看不出来。
3. 晨报的「用量」一节按 token 列，面板按积分列，同一个命令里两种口径（`src/workflow/morning-report.ts` `usageByModel`、`src/report/panel.ts` `usagePanel`）。
4. 峰谷定价是规则板唯一的默认规则（人 2026-10-29），今天它只以 GLM 包的高峰提醒存在：模型看得到，人只能在会话历史里看到，规则板也还没有它。它该告诉谁，清点报告留了一个待查项（Q7）。
5. 排期功能「要有」（`ORCHESTRATION.md` §11.4 定案），尚未实现，「高峰期排不排、排哪些，到时候由用户决定」。规则板 0.4 把它定为人写的一条引用 `glm-peak` 的规则（0.4 §2.6 的两条例子），`glm-peak` 由宿主当场算（0.4 §3.2）；但排队与唤醒的文字说不出高峰几点结束，Kiro 里跑的标定与真网冒烟也不经过规则板的门。

### 1.2 功能需求

- F1 积分口径：保持 M6.1 的公式与峰谷修正；晨报的「用量」一节与面板用同一个计价函数。
- F2 高峰行：面板与 `/glm-status` 写此刻是否高峰与下一次变化的时刻。
- F3 覆盖与缺口：面板写明用量流水的条数、最早一条的时刻、只含经 DSH 发出的请求；缺口文件里的每条缺口一行；一个报告期开始于缺口之前时，那一期的「用量」一节也写这一行。
- F4 额度取数：GLM 包读 3.16.3 用的额度接口，解析 5 小时窗口、周额度与 MCP 工具调用窗口的已用比例与重置时刻；读数与失败写进额度流水。
- F5 上游限额错误：模型请求返回 1308、1310、1316–1321 时，通道记下错误码与能解析出的恢复时刻，额度一节写「已用完」。
- F6 预估耗尽：按 §4.7 的方法给出用完的时刻或重置时的比例，写明依据。
- F7 默认规则：定义与规则页由规则板 0.4 交付（§3.2）；M6 交付 `/glm-status`、`/hourness` 的高峰行，并按 D1 定告诉模型的那一半（D1 决定 `toldBy` 有没有值）。
- F8 错峰排期的机制：排队、每步提醒与唤醒的文字写出高峰结束的时刻；脚本按项目规则自查。M6 不设也不提议任何排队规则；人设了才有排队。
- F9 只装一个包时各自照常工作（§8）。

### 1.3 非功能需求

- 额度读数不拖慢命令：命令等额度至多 3 秒，超时用上一次读数，读取在后台继续。
- 额度接口的请求每个宿主进程每 60 秒至多一次，没有命令就不发。
- 凭证（项目令牌、OAuth 令牌、API Key）不进额度流水、命令输出与控制台。
- 不加运行时依赖，不加插件行，不改用户 profile。
- 激活期不抛错，降级经行健康与控制台上报（`AGENTS.md`）。

### 1.4 验收条件

每条后面写实现所在的节与验证层级。L2 用假宿主 `tests/fake-rc3.ts` 与注入的 fetch、时钟、文件系统；L3 用 `npm run probe`；L4 在桌面版里看。

1. 积分口径不退：`tests/credits.spec.ts`、`tests/hourness.spec.ts` 现有用例照常通过；标定基线 12 次运行用 `credits.ts` 重算，积分与当时记录相同（§2；L2）。
2. 同一口径：`/hourness` 的「用量（今天）」一节与「面板」一节对同一批记录（夹具全部在今天、时刻都能解析）给出逐项相同的每模型调用次数、积分、高峰占比与缓存命中率；没有计价服务时两节都按 token 列，各有一行写明没有计价服务；口径说明（`basis`）只在面板一节出现（§6.1、§6.3；L2）。
3. 高峰行：有计价服务时，面板第一行与 `/glm-status` 的高峰行在以下时刻（UTC+8，测试给 `formatMoment` 注入偏移 +480 分钟，与跑测试的机器的时区无关）分别写：周三 13:59「不是高峰；下一个高峰 14:00」；周三 14:00 与 17:59「高峰中，到 18:00」；周三 18:00「不是高峰；下一个高峰 明天 14:00」；周五 18:00「…下一个高峰 周一 14:00」；周六 15:00「不是高峰；下一个高峰 周一 14:00」。没有计价服务时面板没有这一行（§4.8、§6.1；L2）。
4. 覆盖与缺口：面板的「范围」一行写出可读记录条数与最早一条的时刻，并写「只含经 DSH 发出的请求」；缺口文件里每条合法记录一行（日期、条数、理由）；不合法的缺口行计为「无法读取的缺口记录 N 条」；报告期开始早于某条缺口的 `at` 时，那一期的「用量」一节带这一行，否则不带（§6.2；L2）。G1 写入之后，桌面版 `/hourness` 显示 2026-10-29 删去 806 条的那一行（L4）。
5. 额度请求的形态：已登录的 coding-plan 凭证下，`/glm-status` 发出且只发出一个 `GET https://bigmodel.cn/api/monitor/usage/quota/limit`，请求头只有 `authorization`，值是适配器的项目令牌原样（不加 `Bearer `），超时 15 秒；未登录不发请求。`glm-login` 行配置 `plan: start-plan` 时（行配置，不看 `glm-llm` 行），`/glm-status` 的凭证行写「套餐 start-plan」，额度一节写「额度：体验套餐没有 5 小时与周额度」，注入的 fetch 没有收到任何请求（包括铸造项目令牌的请求）；`Config` 解析 `{home, plan}` 时两个键都保留（§4.2；L2）。
6. 读取频率：60 秒内两次命令只发一个请求；并发的两次命令共用一个进行中的请求；额度流水里出现比缓存新的上游限额记录时，下一次命令不用缓存；没有命令时，注入时钟走过 1 小时不发任何请求（§4.4；L2）。
7. 命令不被拖慢：额度请求一直不返回时，`/glm-status` 与 `/hourness` 在 3.5 秒内返回，额度一节用上一次读数并写「正在读取，稍后再看」；请求返回后的下一次命令显示新读数（§4.4；L2）。
8. 失败要出声：未登录、项目令牌拿不到、网络错误、15 秒超时、HTTP 非 2xx、信封不成功、数据形状认不出、响应超过 256 KiB，各自在额度一节写一行原因与上一次成功读数的时刻；命令不报错；`glm-login` 行健康的说明带「额度：读不到（原因）」；控制台每种原因只告警一次；额度流水里同一原因 10 分钟内只记一条。HTTP 401 写「额度：令牌被拒（401）」，同一次读取不重发；下一次读取用同一个缓存的令牌，不带被拒指纹，注入的 fetch 没有收到 `POST …/access_tokens`（照 3.16.3，§4.2、§12；L2）。
9. 解析与命名：按 §4.3 的规则，用这些夹具得到预期的窗口名与数值：zcode-api 2026-10-12 实测的三行形态（5 小时 `TOKENS_LIMIT`、MCP `TIME_LIMIT`、每周 `TOKENS_LIMIT`）；`nextResetTime` 为秒与为毫秒；两行 `TOKENS_LIMIT` 都在 5 小时内重置；`percentage` 为 130（按 100 保留，显示「已用完」）、为 −5 与 `NaN`（丢掉这个字段）；未知 `type`；超过 32 行；没有数值字段的行（§4.3；L2）。
10. 预估：§4.7 的算例逐项相等（跨 18:00 的峰谷修正、用完早于重置、到重置时的比例、已用完、没有消耗、没有重置时刻、两次读数之间比例下降即窗口已重置）（§4.7；L2）。
11. 上游限额：通道收到 HTTP 429、信封错误码 1308 的模型响应时，在额度流水里追加一条上游限额记录；`/glm-status` 写「已用完（服务端 1308）」，消息里解析得到时刻时加「预计 HH:MM 恢复」；1302、1313 等不记（§4.6；L2）。
12. 凭证不外泄：额度流水、命令输出与控制台里不出现注入的项目令牌字符串；`npm run check:secrets` 通过（§4.5、§13；L2）。
13. 默认规则对模型（D1）：选「给人看，也告诉模型」时，高峰提醒的现有用例（`tests/reminder-wiring.spec.ts`）与探针的平移时钟核对照常通过，正文逐字不变；选「只给人看」时，任何 GLM 请求里都没有来源为 `glm-peak-reminder` 的 notice（L2 改写；L3 在平移到周三 15:00 的时钟下，GLM 与只装 GLM 包两个场景各核对一次）（§3；L2、L3）。
14. 默认规则随 D1（规则板 R4 合入后）：D1 选「给人看，也告诉模型」时，`src/rules/builtin.ts` 的 `GLM_PEAK_PRICING.toldBy` 为 `glm-prompt`，规则页的默认规则一行写「告诉模型：glm-prompt 行的高峰提醒」与那一行是否生效；选「只给人看」时 `toldBy` 没有值，目录里「告诉模型」一项删去，规则页那一行写「只给人看，不告诉模型」，`rules_show` 的默认规则一行去掉「The GLM package's peak reminder tells you this.」；规则板的每步提醒在任何时刻、两种答案下都不含它（R1 把提醒渲染的过滤从「`toldBy` 有值」改为「`scope` 为 `builtin`」，否则 `toldBy` 删去之后它会进提醒，成了人没有选的一条新注入，规则板 0.4 §3.4）。默认规则的其余部分（规则页列出它、`glm-peak` 的值与下一次变化、不能解除、只装编排层包时读不出）是规则板 0.4 验收第 1、2 条，由规则板的节点关，本稿不重复计（§3.2；L2）。
15. 默认不排队：没有人设的规则时，注入时钟周三 15:00 与周三 19:00，同一组工具调用（含 `pwsh "npm run calibrate"`、`subagent`）的判定完全相同，都是放行；脚本自查同样放行，不告警（§7.4；L2）。
16. 人设了排队规则时（例子见 §7.3，M6 不设）：注入时钟周三 15:00，`pwsh "npm run calibrate"` 被排队，排队文字的 Boundary 段写「glm-peak is true until 18:00」，每步提醒的等待单一项写「(until 18:00)」；时钟走到 18:00 之后，规则板按自己的重判（0.4 §6.3，每 5 秒，0.4 验收第 4 条的 30 秒内）唤醒原来的 agent，唤醒文字写「Ticket q-<n> cleared: glm-peak ended at 18:00.」；周六 15:00 不排队；没有计价服务时 `glm-peak` 读不出，调用照常执行，文字里没有时刻。同一条规则下，`npm run calibrate` 在启动沙盒与发出任何网络请求之前以退出码 5 结束，标准错误写明规则、设的人与下一个非高峰时刻；带 `--wait` 时等到非高峰再开始；规则状态读不出、或规则库的编译产物导入失败时，标准错误告警一行后照常开始（§7.2；L2、L3）。
17. 不设预算：M6 不在 `tools/pre-execute`、`agent/pre-step` 上注册任何新监听器；额度与积分的数值不进任何模型请求（L3 核对请求正文里没有额度一节的文字）；规则板只按人设的规则排队（§7.4、§11；L2、L3）。
18. 两包组合（L3）：只装编排层包时，`/hourness` 按 token 列，没有高峰行与额度一节，没有告警；只装 GLM 包时，`/glm-status` 有高峰行与「额度：未登录」，整次运行没有发往 `/api/monitor` 的请求；两包都装时，`/hourness` 有额度一节「未登录」（§8；L3）。
19. 真机（L4，核实用的读取已预先授权，不花积分）：桌面版里一次真实读取，把返回的行（`type`、有哪些字段、离重置的时长、`level`）记进 `docs/FACTS.md` §2.4，按它确认或改正 §4.3 的命名；`/hourness` 显示高峰行、范围、额度一节；桌面版日志没有本包的新错误（§14；L4）。

### 1.5 让人少做了什么（question-27 B）

- 今天：想知道额度要去 BigModel 控制台或 ZCode 的用量页；面板的数字为什么比控制台少，要人记得删过记录、记得 ZCode 也在用。
- 之后：敲一次 `/glm-status` 或 `/hourness`，额度、重置时刻与预估都在，覆盖范围与缺口写在同一屏。人哪天想让积分重活等到谷段，设一条规则（或在对话里告诉主 Agent），之后由 harness 排队与唤醒，Kiro 里跑的脚本也照办。
- 不增加的：M6 不新增任何要人定期点的东西，不主动提议排队规则；只问 D1 一次。

### 1.6 不做的事

- 服务端积分明细（`/api/monitor/credit-usage/usage-detail`、`activity`、`model-usage` 等，zcode-parity 报告 §3.1）：用户已定加成与扣减「看不出来，按代码级别一样就行」（`DESIGN.md` §4.8），本地积分照公式估算，不与服务端对账。
- MCP 余额的独立接口（3.16.3 `fetchMcpQuotaSnapshot`，host:+1280167，URL 没有读到）与本地 MCP 积分（每次 1.2，不在用量流水里）。额度接口里若有 MCP 工具调用窗口，照常显示。
- 积分余额（start-plan 的 `zcode-plan/billing/balance`，`zcode-api:server/routes-quota.ts`:178–187）：用户是 coding-plan。
- 团队套餐（3.16.3 `bigmodel-organization`、`bigmodel-project` 头与 `?type=2`，host:+1295885）。
- 3.16.3 读额度前的订阅核验（`/api/biz/subscription/list`，host:+1269861 附近）。
- 后台定时读额度；节假日日历（高峰只按 `FACTS.md` §2.4 的周一至周五）。
- 按额度或积分自动拦截、推迟、换模型或换套餐；任何预算或上限；任何默认的错峰排队规则，以及替人提议这样的规则（人 2026-10-29：默认规则只有峰谷定价）。
- 在场检测、CPU 与内存限速、默认预算、Job Object、沙盒租约：人已说明它们只是例子（§3.1），规则板 0.4 也已移到它的附录 A，不是 M6 的依赖；M6 只用规则板 0.4 的核心（§7.1）。
- 3.16.3 对 start-plan 用套餐 JWT 读额度（`resolveAuthorization` 对 start-plan 返回 `zcodeJwtToken`，设计评审第 1 轮实读）：本包对 start-plan 不读，体验套餐没有 5 小时与周额度（`FACTS.md` §2.3、§2.4），记为已知差异（§16）。
- ZCode 的服务端错峰排队协议（`x-off-peak-ticket-id`、429/3105、3102，`FACTS.md` §1）：那是账号请求的另一种 mode，用它要改模型请求的形态，也等于替人选套餐模式（`CHARTER.md` §6）。
- GLM pill 上的高峰角标（随 M8 的界面设计）；派发按任务紧急程度排队（任务节点没有这个属性，随 M7 的派发设计，§7.5）；巡检的定时（M7 的运维会话）。

## 2. 现状（M6.1 已做的部分）〔实读，main `eb614ab`〕

| 部分 | 在哪 | 做什么 |
| --- | --- | --- |
| 积分公式与峰谷 | `src/glm-llm/credits.ts` | `CREDIT_RATES`（GLM-5.3 6.9 / 1.7 / 24，Flash 2.3 / 0.56 / 8）、`peakWindowAt`（周一至周五 14:00–18:00 UTC+8，按 UTC+8 判定）、`chargedCredits`（非高峰 × 0.5，常量 `OFF_PEAK_RATE` 未导出）、计价服务的值 `creditPricing` |
| 计价服务契约 | `src/shared/pricing.ts` | `PRICING_SERVICE = 'glmHournessPricing'`，成员 `basis`、`plan`、`charged`、`peak`；`pricingService(ctx, problem)` 只检查这四个成员，多出的成员不算形状不对 |
| 提供方 | `src/glm-llm/login-row.ts` | `glm-login` 行激活时 `ctx.provide(PRICING_SERVICE, creditPricing)`；失败时行健康为部分生效 |
| 面板 | `src/report/panel.ts`、`src/report/index.ts` | `/hourness` 的「面板」一节：全部记录，按模型列积分、高峰占比、缓存命中率；没有计价服务时按 token 列；修正前与无法读取的记录只报条数 |
| 晨报 | `src/workflow/morning-report.ts` | `/hourness` 开头的晨报，本地日历日；「用量」一节按 token 列（`usageByModel`），不经计价服务 |
| 高峰提醒 | `src/glm-prompt/peak-reminder.ts`（`glm-prompt` 行） | 每个高峰时段第一个 GLM 步追加一条 `<system-reminder>`，来源 `glm-peak-reminder` |
| 标定与探针 | `scripts/calibrate/run-calibrate.mjs`:27、`scripts/probe/run-probe.mjs`:51 | 直接导入 `packages/glm/dist/glm-llm/credits.js` |

用户级用量流水在 2026-10-29T14:16Z（UTC+8 22:16）有 384 条，全部可读，最早 2026-10-27T09:30:22Z，最晚 2026-10-29T13:10:48Z；其中 GLM 记录（provider `glm-zcode`）87 条，最早 2026-10-28T02:43:33Z（只读计数；0.1 写稿时是 371 条，之后有新记录，本稿示例里的条数都指这一刻）。2026-10-29 删掉的 806 条（`glm/glm-5.3` 796、`glm/glm-5.3-flash` 10）的起止时刻没有留下：改前备份已按用户要求删除（`DESIGN.md` §2.4）。

## 3. 默认规则：GLM 峰谷定价

### 3.1 人的更正（2026-10-29）

人对规则板的范围说（编排方转述的原话）：「其余用电脑啊，llm限速啊默认额度啥的都只是我给你举的例子，没让你真加进我们项目里。唯一一个加进去的默认规则是峰谷定价的事情」。对 M6 的含义：

- 规则板出厂只带一条默认规则：峰谷定价。
- 错峰排队、在场检测、CPU 或内存限速、默认预算都不是默认，是人以后可以自己加的规则的例子。M6 不设、不提议、不假定任何一条。

### 3.2 这条规则（定义在规则板 0.4 §3.1）

规则板 0.4 已经把它定义完并排进自己的 R1（`src/rules/builtin.ts` 的 `GLM_PEAK_PRICING`）与 R4（`glm-peak` 经计价服务当场算，规则页的默认规则一组）。本稿不重新定义，只摘与 M6 有关的字段：

| 字段 | 值（规则板 0.4 §3.1） |
| --- | --- |
| id | `builtin:glm-peak-pricing` |
| 条件 | `{"signal": "glm-peak", "is": true}`；`glm-peak` 是宿主在判定时经 `pricingService(ctx)?.peak(now)` 当场算的信号（0.4 §3.2） |
| 主体 | `{"models": ["*/glm*"]}`：调用方会话请求头的模型 id 以 `glm` 开头，与高峰提醒判 GLM 步的口径相同（`src/shared/route.ts` `isGlmModel`） |
| 动作、执行方式 | 无动作；只告知 |
| `toldBy` | `glm-prompt`（D1 选「给人看，也告诉模型」）；D1 选「只给人看」时没有（§1.4 第 14 条） |
| 时段与系数 | 只在 GLM 包的 `src/glm-llm/credits.ts`（`FACTS.md` §2.4），规则板不复制 |

M6 与这条规则有关的交付：

- 给人看的另外两处：`/glm-status` 的高峰行（`glm-login` 行，§4.8）与 `/hourness` 面板第一行（`hourness` 行，§6.1）。规则页上的一组是规则板 R4、R5 的交付。三处的「下一次变化」都用同一个 `nextPeakChange`（§5，放在 `src/shared/pricing.ts`，与规则板 0.4 §3.2 写的位置相同）。
- 告诉模型的一半（D1，§3.3）：只影响 GLM 包的高峰提醒与规则板目录里这一条的 `toldBy`。
- 计费在服务端，这条规则只是把计费规则摆到明处。它不排队、不拦截，不让任何调用在高峰与非高峰得到不同的判定（§1.4 第 15 条，规则板 0.4 验收第 1 条的末句）。
- 人想在高峰时让某些工作等，另写一条引用 `glm-peak` 的规则（§7.3 是例子，规则页上点「以它为模板新建」，0.4 §3.4）；默认规则本身不升级成排队。

### 3.3 给模型的那一半：检查结果（清点报告 Q7）

question-31 选 C，其中一项是「高峰提醒先查已有 GLM 会话里模型有没有向人复述过，再定去留」（清点报告 §9 Q7 的 C）。本稿做了这次检查。

方法〔实测，只读，2026-10-29〕：读 `~/.dsh/sessions/` 下全部 718 个 `session.v4.jsonl.zstd`（多帧 zstd，逐帧解码），挑出含来源 `glm-peak-reminder` 的会话，取这条 notice 之后全部 `assistant/message` 事件的文字块，按「peak、高峰、off-peak、谷段、低峰、credit、积分、14:00、18:00、半价、全价」不分大小写匹配；按会话的 `request/header` 与 `model/selection` 读 provider。

| 会话 | 个数 | notice 之后的助手文字块 | 提到高峰或积分的 |
| --- | --- | --- | --- |
| 探针的脚本 provider `glm-probe`（回复是脚本写死的） | 153 | 288 | 0（不算数） |
| 真实 GLM（provider `glm-zcode`） | 4 | 32 | 0 |

4 个真实会话是：桌面版 2026-10-28 17:38（UTC+8，周三）的一个 GLM-5.3-Flash 主会话（`session-30fb4486…`，用户让它派子 agent 读文件并汇总，回复带用户自己的人设）与它派出的子会话（`1eff0256…`），以及 2026-10-28 的两次截包运行（`.agents/tasks/cache-2026-10-28/runs/tap-1793168439212/{1,2}`）。用量流水里高峰时段的 GLM 调用也只有前两个会话的 12 次。

结论：样本小（4 个会话、32 段文字）。在这个样本里模型没有向人复述过提醒，也没有因它停下或换做法；清点报告担心的「让人多读一段」没有出现。两边的理由：

- 保留：规则板的说法是「agent 每步看到当前生效的规则」（项目图 `rules` 节点正文），默认规则照此最一致；只装 GLM 包时照样有；`glm-house` 的验收第 4 条「不装编排层包时，通道、方言、高峰提醒与积分口径照常工作」不用换读法。正文「do not … pause or postpone work, unless the user asks」与人以后写的排队规则不冲突：排队由 harness 执行，文字写明「set by the human」，那就是人的要求。代价是每个高峰时段每个 GLM 会话 1 条 336 字符（约 96 token，清点报告 §3.2 第 12 行）的提醒，GLM-5.3 第一次按普通输入计约 0.07 积分，之后按缓存命中计。
- 去掉：模型拿到它没有能做的事，它没有换模型的工具，人没设规则时也不该自己推迟（§3.1）；ZCode 3.16.3 没有本地高峰提醒（`FACTS.md` §1：off-peak 是服务端排队协议，客户端没有本地峰谷窗口常量），去掉它离 ZCode 的训练分布更近（`CHARTER.md` §3.1 第 1 条）。

推荐保留：检查没找到它的害处，去掉要换 `glm-house` 一条验收的读法，而它的代价按积分算可以忽略。是否留在训练分布之外的问题，交给 question-30 的消融（清点报告 §8）去量：消融第一期若加一臂去掉它、指标不变差，再按那时的数据去掉。这是 D1（§18），人没定之前代码不动，D1 不挡其他线。

D1 选「给人看，也告诉模型」的实现：高峰提醒的代码不变，规则板 0.4 的 `toldBy: 'glm-prompt'` 照写；给人看的部分是 Q2（`/glm-status`）、P1（`/hourness`）与规则板 R4、R5（规则页）。

D1 选「只给人看」的实现（§15 R1，给人看的部分同上）：删 `src/glm-prompt/peak-reminder.ts` 与 `src/glm-prompt/index.ts` 里装它的那几行，删 `PEAK_REMINDER_SOURCE`、`PEAK_REMINDER_TEXT` 的全部使用者；`tests/reminder-wiring.spec.ts` 的高峰用例改为「任何时刻都没有这条 notice」；探针的平移时钟场景改为核对 0 条（`scripts/probe/run-probe.mjs`:362、804 一带）；`ORCHESTRATION.md` §11.4 第一、二、三、四条整条重写。续跑的旧会话历史里留着的旧 notice 没有代码再读，留着无害。来源名 `glm-peak-reminder` 从 split 0.3 §3.3 的持久化标识清单里删去。规则板一侧（规则板 R4 已合入时在 R1 里做；R4 还没合入时，R1 在 `m6-reminder` 节点上批注，由规则板 R4 按这里的写法实现）：`GLM_PEAK_PRICING` 去掉 `toldBy`；每步提醒的渲染按 `scope === 'builtin'` 跳过代码规则，不再按 `toldBy`（规则板 0.4 §6.4 与 §13「默认规则告诉模型只有一份」一行的写法随之改）；`rules_show` 与规则页的那一行文字按 §1.4 第 14 条。

## 4. 额度取数（GLM 通道包）

### 4.1 3.16.3 怎么取〔实读，host 偏移见 §9〕

桌面壳的 `BigModelUsageQuotaProvider`：

- 地址 `ZAe = "/api/monitor/usage/quota/limit"`（host:+1280219），由 `eO(env) = xi(env, ZAe)` 拼成（host:+1303701）。环境变量 `ZCODE_BIGMODEL_USAGE_QUOTA_URL` 或 `BIGMODEL_USAGE_QUOTA_URL` 可覆盖（`XM`，host:+1303107）。基址〔实读，设计评审第 1 轮〕：`index.js` 的 `xi` 从 `chunk-5YNPFY3L.js` 导入（`ia as xi`）；chunk 里 `ia` 是 `G$`（`buildBigModelApiUrl`，chunk:+584795），它用 `K$`（`resolveBigModelApiOrigin`），生产值 `D$ = "https://bigmodel.cn"`，覆盖项 `BIGMODEL_API_BASE_URL`、`BIGMODEL_PRODUCTION_API_BASE_URL`。与 zcode-parity 报告 §3.1 的 `https://bigmodel.cn/api/monitor/usage/quota/limit` 及 `FACTS.md` §1 一致。
- 请求 `fetchQuota(t) = Wt(this.apiClient, nTe(t), {method: "GET", timeoutMs: Qo, headers: Pl(t)})`，`Qo = 15e3`（host:+1292296、+1280219）。`Pl` 只放 `{authorization: e.authorization}`，团队套餐另加两个头（host:+1295885）；`nTe` 只在团队时加 `?type=2`。`Wt` 是 `readApiJson`（host:+145440）：`apiClient.request` 之后非 2xx 抛错、再解析 JSON，它本身不加头；`apiClient.request` 会不会附加默认头没有找到实现（`DESIGN.md` §4.8 已记同一个未核项）〔未核实，V2〕。
- 凭证：`accountRequestAuthService.resolveCurrent({providerId, accountAccess, reason: "usage"})` 的 `apiKey`（host:+1291500），账号模式下是项目令牌，不加 `Bearer `（zcode-parity 报告 §3.1）。`resolveCurrent`（host:+1200629）对 `reason: "usage"` 不核对账号作用域；带被拒指纹而没有 `expectedAccountScope` 时直接抛 `project_token_scope_invalidated`，即额度路径不会因 401 重铸令牌〔实读，设计评审第 1 轮〕。start-plan 时它返回套餐 JWT（`zcodeJwtToken`），即 3.16.3 对 start-plan 也读额度；本包不读（§1.6、§16）。
- 成功判定 `QM`：`success !== false` 且 `code` 为 `null`、`undefined`、`0` 或 `200`（host:+1297048）。
- 解析 `zM`：`data.limits` 是数组时，留 `type` 为非空字符串的项，各字段只在是数字时保留：`unit`、`number`、`usage`、`currentValue`、`remaining`、`percentage`、`nextResetTime`，另有 `usageDetails`（host:+1268239）。`pickPrimaryLimit`（`YY`）先取 `type === "TIME_LIMIT"` 的项（host:+1268830）。
- 失败处理：`this.fetchQuota(d).catch(() => null)`，读不到额度时快照的 `quota` 为 `null`，不重试、不刷新令牌（host:+1282731）。

zcode-api 的实测〔实读，它记的是 2026-10-12 的一次真实读取，max 档，对照官方面板〕：`TOKENS_LIMIT` 是 5 小时与每周两个窗口，`TIME_LIMIT` 是 MCP 工具调用窗口（`remaining` 是调用次数，`percentage` 是已用比例）；按重置先后排位次贴标签会错位，要按「离重置还有多久」命名；`number` 不是能与 `remaining` 比较的总量（实测 `TIME_LIMIT` 一行 `remaining=3836`、`number=1`）；`nextResetTime` 有秒也有毫秒；上游网关对频繁查询限速，所以它不轮询（`zcode-api:server/routes-quota.ts`:45–62、124–143，`zcode-api:tui/frame.ts`:346–363、476–495，`reference/zcode-api/README.md`:228）。它用的是 `open.bigmodel.cn` 与 API Key，与 3.16.3 不同；本包照 3.16.3。两边对 `TIME_LIMIT` 的理解有冲突（3.16.3 把它当主显示项），单位也不一致（3.16.3 只留数字的 `unit`，zcode-api 的夹具里 `unit` 是字符串 `"prompt"`）：都留到 §14.3 的 L4 读取核实。

### 4.2 本包的请求

- 新文件 `src/glm-llm/quota.ts`（GLM 包）。bigmodel 的 API origin 今天是 `src/glm-llm/zcode.ts`:46 的模块内常量 `BIGMODEL_API_ORIGIN`，移到 `src/glm-llm/zcode-wire.ts`（3.16.3 线上常量所在的文件）导出，`zcode.ts` 与 `quota.ts` 都从那里取；`quota.ts` 的地址常量 `QUOTA_URL` 是 `${BIGMODEL_API_ORIGIN}/api/monitor/usage/quota/limit`。不读环境变量覆盖（测试用注入的 fetch）。
- 凭证：`ZcodeAdapter` 加一个方法 `usageAuthorization(): Promise<string>`，没有参数。按顺序：适配器的 `plan` 为 start-plan 时抛 `start-plan`，不读凭证、不发任何请求（体验套餐没有 5 小时与周额度，`FACTS.md` §2.3、§2.4）；没有凭证抛 `not-logged-in`；coding-plan 时返回 `this.projectToken(credential)` 的令牌（`src/glm-llm/zcode.ts`:240），与模型请求用同一个项目令牌缓存（同一个适配器实例）；铸造失败按 `zcode-wire.ts` 的 3.16.3 错误码抛。不接受被拒指纹：3.16.3 的额度路径不核对账号作用域、不接受被拒指纹（`resolveCurrent` 对 `reason: "usage"`，host:+1200629，§4.1）。令牌按自己的有效期换新（到期前 120–180 秒，`src/glm-llm/auth/project-token.ts`:28–31）；人重新 `/glm-login` 之后登录令牌变了，项目令牌客户端换一代缓存（`project-token.ts`:281），下一次读取铸造新令牌。
- 套餐从哪来（设计评审 F2）：额度读取用 `glm-login` 行自己的 `ZcodeAdapter`（`login-row.ts` `apply`），它今天只拿到 `home` 与 `fetchImpl`，不知道套餐，`/glm-status` 的凭证行因此一直写「套餐 coding-plan」。改法：`LoginConfig` 加 `plan?: 'coding-plan' | 'start-plan'`；`login-row.ts` 新导出 `Config = Schema.object({home, plan})`，两个字段的 Schema 与说明照抄 `src/glm-llm/index.ts` 的 `Config` 里的 `home`、`plan`（`plan` 默认 `coding-plan`），这样它在插件管理器里是真开关，探针传的 `home` 也照样通过；`apply` 构造适配器时把 `plan` 传进去（只在配置里有值时传，同 `glm-llm` 的写法，满足 `exactOptionalPropertyTypes`）。`packages/glm/cordis.patch.yml` 两行仍是 `config: {}`，在 `glm-login` 行上加注释「`plan` 与 glm-llm 行的 `plan` 必须相同：glm-login 用它决定 /glm-status 的套餐与读不读额度」。不让 `glm-login` 去读 `glm-llm` 行的配置或行健康：行之间没有读配置的契约，从行健康的文字里解析套餐又会把一段给人看的文字变成接口。两行设得不同时人在 `/glm-status` 第一行就能看到套餐写的是哪个（凭证行用的就是这个适配器的 `plan`）。
- 项目令牌缓存一行一份：`glm-login` 与 `glm-llm` 两行的适配器各有一份缓存，两行都在时一个令牌有效期内至多多铸造一次；模型请求的 401 让 `glm-llm` 的缓存换新，不影响 `glm-login` 的那一份。3.16.3 一个进程一份缓存，这是一处已知差异，写进 `DESIGN.md` §4.8（§16）。
- 请求：`fetch(QUOTA_URL, {method: 'GET', headers: {authorization: <令牌原样>}, signal})`，15 秒超时（`AbortController`），其余用 fetch 的默认选项，不加别的头；不重试。
- 结果分类（每类一个原因码，写进额度流水与行健康）：

| 情况 | 原因码 | 额度一节写 |
| --- | --- | --- |
| 没有凭证 | `not-logged-in` | 额度：未登录 GLM（/glm-login） |
| start-plan | `start-plan` | 额度：体验套餐没有 5 小时与周额度 |
| 项目令牌拿不到 | `credential:<3.16.3 码>` | 额度：项目令牌拿不到（码），运行 /glm-login |
| 网络错误 | `network` | 额度：读不到（网络错误） |
| 15 秒超时 | `timeout` | 额度：读不到（15 秒没有响应） |
| HTTP 401 | `http-401` | 额度：令牌被拒（401）；令牌到期换新后再读，或运行 /glm-login |
| 其他非 2xx | `http-<码>` | 额度：读不到（服务端返回 <码>） |
| 响应超过 256 KiB | `too-large` | 额度：读不到（响应过大） |
| 不是 JSON、信封不成功 | `envelope:<code>` | 额度：服务端拒绝（<code> <msg 前 80 字符>） |
| 信封成功但没有可用的行 | `no-windows` | 额度：服务端没有返回可识别的窗口 |

- 401：照 3.16.3，只是一个失败原因 `http-401`（`readApiJson` 对非 2xx 抛错，调用处 `.catch(() => null)`，host:+145440、+1282731）。不记被拒指纹、不强制重铸、不在同一次读取里重发；下一次命令照常再读，用的仍是缓存里的令牌，直到它按有效期换新或人重新登录（见上面凭证一条）。这样额度读取不会发出 3.16.3 不会发的 `POST …/access_tokens`。

### 4.3 解析与窗口命名

解析（与 3.16.3 `zM` 相同的取舍，另加上限）：

- 信封是对象；`code` 为数字、数字字符串、`null` 或没有；`success` 为布尔或没有；按 `QM` 判成功。
- `data.level`：字符串，去空白后 1–32 个字符才留。
- `data.limits`：数组，至多取前 32 项，多出的计入 `dropped`。每项 `type` 为非空字符串（至多 64 个字符）才留；`percentage`、`remaining`、`number`、`usage`、`currentValue`、`nextResetTime` 只在是有限数字时留；`percentage` 为负数时丢掉这一个字段，大于 100 时按 100 保留（超额时服务端可能给出大于 100 的值，这一行要能显示「已用完」）；`unit` 与 `usageDetails` 不留（单位语义未核实，§4.1；明细没有使用者）。`percentage` 与 `remaining` 都没有的项丢弃，计入 `dropped`。
- `nextResetTime`：小于 10^12 视为秒，乘 1000；换算后不在 [读取时刻 − 1 天, 读取时刻 + 45 天] 之内就丢掉这个字段。

命名（agent 定，§17；按 zcode-api 的实测，L4 读取后核对，§14.3）。设 `h` 为离重置的时长，5 小时上限取 5 小时 2 分钟（容读取与服务端的时钟差）：

1. `TIME_LIMIT` → `mcp`「MCP 工具调用」，只显示已用比例与重置时刻，不预估。
2. `TOKENS_LIMIT` 有重置时刻的各项：`h` 不超过 5 小时 2 分钟的是 5 小时候选，其余是每周候选。5 小时候选恰好一个、每周候选至多一个时，分别命名 `five-hour`「5 小时」与 `weekly`「每周」；只有一个 `TOKENS_LIMIT` 项时按它属于哪一类命名。其余情形（两个都在 5 小时内重置，或两个都在 5 小时之后）不猜，各自命名 `window`「额度窗口（HH:MM 重置）」，不用窗口平均法预估（§4.7）。
3. 没有重置时刻的 `TOKENS_LIMIT` 项：`window`「额度窗口」。
4. 其他 `type`：`other`，显示原样的类型名。

名字按每次读数自己的读取时刻算（流水里只存行，不存名字）。同一个窗口的「同一期」：名字相同、重置时刻相差不超过 120 秒的两次读数。

### 4.4 读取时机与缓存

- 只在命令里读：`/glm-status`（GLM 包）与 `/hourness`（编排层包，经计价服务的 `quota` 成员，§5）。不设后台定时器。理由：读数只给人看，人看的时候读就够了；3.16.3 的额度读取挂在用量快照的查询上（`getCodingPlanUsageSnapshot`，host:+1289411），本轮没有看到定时器〔推断，调用点没有找全〕；zcode-api 记录了网关对频繁查询限速。
- 缓存：每个 `glm-login` 行实例一份。最近一次成功读数不足 60 秒就直接用；有进行中的读取就等它，不另发。额度流水里最新一条上游限额记录（§4.6）晚于缓存的读数时，不用缓存。
- 命令等待上限 3 秒：`quota({waitMs: 3000})` 先发起（或加入）读取，3 秒内返回就用新读数；否则返回上一次成功读数（或「还没有读数」），带 `pending: true`，额度一节加一句「正在读取，稍后再看」。读取在后台继续，至多 15 秒，结果进缓存与额度流水。
- 进程重启：第一次读取前，从额度流水末尾读回最近 32 条读数作为历史（§4.5），所以重启之后「两次读数」的预估依据还在。

### 4.5 额度流水

- 位置：`<home>/audit/quota.jsonl`，`home` 是 `credentialHome(config.home)`（`src/shared/data-home.ts`，默认 `$DSH_HOME/glm-hourness`，与用量流水同一个用户级目录，`DESIGN.md` §2.4）。`glm-login` 与 `glm-llm` 两行都按这条规则解析，bundle 里两行都不设 `home`，所以写的是同一个文件；探针与测试显式传临时目录。
- 写法：每行一个 JSON 对象，只追加；第一次写时建目录；写失败不抛，每种失败控制台告警一次（同 `src/memory/audit.ts` 的 `rowJournal`）。
- 三种记录：

```json
{"at":"2026-10-30T09:02:03.120Z","kind":"reading","level":"pro","limits":[{"type":"TOKENS_LIMIT","percentage":41,"nextResetTime":1793355400000},{"type":"TIME_LIMIT","percentage":4,"remaining":3836,"nextResetTime":1793566000000},{"type":"TOKENS_LIMIT","percentage":63,"nextResetTime":1793573200000}],"dropped":0}
{"at":"2026-10-30T09:20:00.004Z","kind":"failure","reason":"timeout"}
{"at":"2026-10-30T12:41:09.880Z","kind":"upstream-limit","code":"1308","until":"2026-10-30T13:30:00.000Z"}
```

  `reading` 存解析后的行（§4.3 的字段，不含名字：名字随时刻变化，显示时再算），不存原始响应；`failure` 同一原因 10 分钟内只记一条；`upstream-limit` 由 `glm-llm` 行的适配器写（§4.6）。三种记录都不含任何令牌、Key 或请求头。
- 读回：显示时读文件末尾至多 256 KiB，跳过不是 JSON 或字段不合法的行（计数，写进行健康）。按每小时 4 次命令、每次一行约 300 字节估，一年约 4 MB；不轮换，到 8 MiB 时再处理（写进 `DESIGN.md` §2.4 的数据表）。

### 4.6 上游限额错误

- 来源：`ZcodeAdapter.stream` 在响应非 2xx 时抛 `glm-zcode <status>: <正文前 400 字符>`（`src/glm-llm/zcode.ts`:466–470）。在抛之前，状态为 429 时解析正文：JSON 的 `error.code`（字符串或数字）属于 `1308`、`1310`、`1316`–`1321` 时，追加一条 `upstream-limit` 记录。错误码的含义见 `docs/reference/bigmodel-guide-digest.md`:165（1308 达到用量上限，消息里带 `${next_flush_time}`；1310 周或月上限；1316–1321 团队与子账号的各类上限）与 `FACTS.md` §2.5。
- 恢复时刻：在 `error.message` 里找第一个 `YYYY-MM-DD HH:MM[:SS]` 或 `YYYY-MM-DDTHH:MM[:SS]`，按 UTC+8 解释（BigModel 是国内服务；消息里时刻的格式与时区都没有实测〔未核实〕）；得到的时刻不在 [现在, 现在 + 8 天] 之内就不写 `until`。
- 这一节不是 3.16.3 的行为：3.16.3 的 host 包里没有 `1308` 与 `next_flush_time` 字样（设计评审第 1 轮检索为 0），是本项目加的展示，写进 §16 给 `DESIGN.md` §4.8 的已知差异。正文形状 `{"error": {"code": "1308", …}}` 出自 `bigmodel-guide-digest.md`:165，说的是 `open.bigmodel.cn`；本通道的模型请求经端点路由改写到 `zcode.z.ai/api/v1/ultra/...`（`DESIGN.md` §4.3、§4.4），经这个网关时正文是不是同一个形状没有核实〔未核实，V4〕。形状不同时只是不写上游限额记录，额度一节照常按服务端读数显示已用比例，人仍看得到额度用完（读数 100%）；模型请求的错误照原样交回 DSH，不受影响。
- 适配器写记录用的是它自己的 `home`（`ZcodeAdapter` 构造参数），不依赖 `glm-login` 行在不在；写失败只在控制台告警一次，不影响抛出的错误。不改错误文本、不改重试行为（3.16.3 的重试规则不变，`DESIGN.md` §4.1）。
- 显示：额度一节若有晚于最近读数的 `upstream-limit` 记录，第一行写「额度已用完（服务端 1308），预计 21:30 恢复」或不带时刻的同一句；它让下一次命令不用缓存（§4.4）。

### 4.7 预估耗尽（峰谷修正）

记号：`m(t)` 是时刻 `t` 的计费比例，高峰为 1，其余为 0.5（`credits.ts` 新导出 `rateShareAt(ms)`，用 `peakWindowAt` 与 `OFF_PEAK_RATE`，积分规则仍只在这一处）。`W(a, b)` 是 `[a, b)` 上的「全价小时」：按整分钟累加 `m × 1/60`，两端不满一分钟的按比例。比例 `p` 是服务端的已用百分比。假设：额度按积分计，非高峰的消耗按半价计入额度（`FACTS.md` §2.4「积分按 50% 抵扣」，额度表以积分为单位）〔推断〕；这个假设不成立时速度最多差一倍，预估行写明依据，L4 之后的读数可以复算（§13）。

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

- 时刻按本机时区显示（公共库 `formatMoment(ms, now, zone?)`，§5）：同一天写 `HH:MM`；将来的次日写「明天 HH:MM」，将来 2–6 天写「周X HH:MM」；更远的将来与以前各天写 `MM-DD HH:MM`。「同一天」「明天」「周X」都按显示用的时区算。`zone.offsetMinutes` 不给时取本机在 `ms` 那一刻的偏移（`-new Date(ms).getTimezoneOffset()`）；测试传 `{offsetMinutes: 480}`，断言因此与跑测试的机器的时区无关。高峰的判定仍按 UTC+8（`peakWindowAt`），与本机时区无关。
- 高峰行的「下一次变化」用公共库的 `nextPeakChange(peak, fromMs)`（`src/shared/pricing.ts`，§5），GLM 包传 `creditPricing.peak`。
- 测试注入：`LoginConfig` 加两个只给测试用的字段 `now?: () => number` 与 `offsetMinutes?: number`（同已有的 `fetchImpl`，不进 `Config` 的 Schema，所以插件管理器里看不到、行配置里写了也会被 Schema 去掉）；`/hourness` 的 `RenderOptions` 已有 `now`，加 `offsetMinutes`。
- 设置页只解析第一行（凭证行），GLM pill 把既不是字段也不是行健康的行留在健康表上方显示（`ui/src/channel.js`:249–250 的 `restOf`），所以这一段在 pill 里照常显示；`tests/health.spec.ts` 里交给 pill 解析函数的用例按新输出改写「剩下的行」的断言。
- `glm-login` 行健康的说明在原有文字后加「额度：读于 17:02」或「额度：读不到（原因码）」。状态不因额度降级：额度是给人看的数据，不影响任何请求。

## 5. 两包之间的契约

计价服务加一个可选成员（split 0.3 §4.3 末条：m6 扩这份契约，通道包取数，编排层展示）。不另开服务：额度与积分同属一个套餐，提供方同是 `glm-login` 行，使用方同是 `/hourness`；多一个服务就多一套提供、撤销与形状检查。

```ts
// src/shared/pricing.ts（扩展）
export interface UsagePricing {
  readonly basis: string
  readonly plan: string
  charged(model: string, usage: TokenUsage, atMs: number): number | undefined
  peak(atMs: number): boolean
  /** The plan's quota windows as the channel reads them (M6); channel packages before M6 do not have it. */
  quota?(request?: QuotaRequest): Promise<QuotaView>
}
/** The quota reader of a pricing service; undefined when the member is absent or not a function (reported to `problem` once). */
export function quotaOf(pricing: UsagePricing, problem?: (message: string) => void): ((request?: QuotaRequest) => Promise<QuotaView>) | undefined
/** The first minute after `fromMs` at which `peak` differs from `peak(fromMs)`; undefined within `horizonMs` (default 8 days). Shared with the rules board (rules design 0.4 §3.2). */
export function nextPeakChange(peak: (atMs: number) => boolean, fromMs: number, horizonMs?: number): number | undefined
```

```ts
// src/shared/quota.ts（新，公共库：类型与纯函数，两包都编进去）
export interface QuotaRequest { readonly waitMs?: number }
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
export interface QuotaView {
  /** The last successful reading, if any. */
  readonly reading?: QuotaReading
  /** The latest failure when it is newer than `reading`: the reason code (§4.2) and its line. */
  readonly failure?: { readonly at: number, readonly reason: string, readonly text: string }
  /** The latest upstream-limit record newer than `reading` (§4.6). */
  readonly limited?: { readonly at: number, readonly code: string, readonly until?: number }
  /** A read is still running past `waitMs`. */
  readonly pending: boolean
}
/** The display time zone; without `offsetMinutes` the host's offset at each instant. */
export interface MomentZone { readonly offsetMinutes?: number }
export function quotaLines(view: QuotaView, now: number, zone?: MomentZone): string[]
/** Uses nextPeakChange from ./pricing.ts. */
export function peakLine(plan: string, peak: (atMs: number) => boolean, now: number, zone?: MomentZone): string
export function formatMoment(ms: number, now: number, zone?: MomentZone): string
```

- `nextPeakChange` 放在 `src/shared/pricing.ts`：它只依赖 `peak`，规则板 0.4 §3.2 与 R4 也按这个位置写。从 `fromMs` 之后的下一个整分钟起按分钟调用 `peak`，返回第一个与 `peak(fromMs)` 不同的时刻；默认看 8 天（11,520 次调用），看不到返回 `undefined`。不知道套餐时段的形状，所以按分钟走；高峰在整点起止，结果精确到分钟。M6 的 Q1 与规则板的 R4 谁先合入谁加这个函数与它的测试，后到的一方直接导入（§15）。`formatMoment`、`peakLine`、`quotaLines` 留在 `src/shared/quota.ts`。
- `peakLine` 的文字只用服务给的 `plan`：「高峰：高峰中，到 18:00（GLM 积分套餐）」「高峰：不是高峰；下一个高峰 明天 14:00（GLM 积分套餐）」。编排层不写任何套餐的系数与时段（`CHARTER.md` §3 两组目标的边界）。
- `quotaLines` 渲染 §4.8 的额度一段；GLM 包与编排层包用同一个函数，两处输出相同。
- `quotaOf` 的形状检查：`quota` 不存在时返回 `undefined`，不告警（旧 GLM 包）；存在但不是函数时告警一次、当作不存在，不影响其余四个成员。`quota()` 抛错或 promise 被拒时，使用方显示「额度：读取出错（消息前 80 字符）」并告警一次。
- 提供方：`login-row.ts` 激活时把 `{...creditPricing, quota: request => reader.view(request)}` 交给 `ctx.provide`，`reader` 是 `src/glm-llm/quota.ts` 的 `createQuotaReader({adapter, home, fetchImpl, now})`。`creditPricing` 本身仍是不带 `quota` 的冻结常量（标定与探针脚本用）。`credits.ts` 新导出 `rateShareAt(ms)`。
- 契约测试（`tests/contracts.spec.ts`）：有 `quota` 与没有 `quota` 的服务都能读出积分；`quota` 形状不对只丢额度；`quota` 被拒时面板照常输出。

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
- 缺口记录：文件 `<userHome>/audit/usage-gaps.jsonl`，`auditPaths` 加 `gaps`。写 2026-10-29 那一行是 agent 定的事（§17，人可推翻）：文件在插件自己的用户级数据目录里，约 250 字节，删掉即撤销；不写时 brief 要求的「面板与报告写明历史缺口」只剩范围一行，看不出删过 806 条。用量流水本身仍只有用量记录一种形状：它的读者（面板的 `usagePanelOf`、标定运行器）都按用量记录解析，混进别的形状会被计为无法读取。一行的字段：

| 字段 | 必填 | 类型与上限 | 含义 |
| --- | --- | --- | --- |
| `at` | 是 | ISO 8601，能解析 | 删记录的时刻 |
| `removed` | 是 | 整数，1–10,000,000 | 删了多少条 |
| `reason` | 是 | 字符串，1–300 个字符 | 为什么删、谁要求的 |
| `detail` | 否 | 字符串，至多 300 个字符 | 按 provider 与模型的条数 |
| `from`、`to` | 否 | ISO 8601，`from` 不晚于 `to` | 被删记录的时间范围 |
| `ref` | 否 | 字符串，至多 200 个字符 | 留痕的出处 |

  不合法的行计为「无法读取的缺口记录 N 条」，其余照常。多出的字段忽略。
- 2026-10-29 那次删除的一行（P1 合入后由主 Agent 写一次，§15 G1；`at` 取改前备份文件名里的毫秒数 `usage.jsonl.bak-1793243554750`，`DESIGN.md` §2.4。G1 的命令用 `new Date(1793243554750).toISOString()` 算出 `at`，不手写；本稿按同一个算式得到 2026-10-29T03:12:34.750Z，UTC+8 11:12。对照：profile 备份 `bak-1793241992974` 是 02:46:32.974Z，两次清理相隔 26 分钟，先后一致）：

```json
{"at":"2026-10-29T03:12:34.750Z","removed":806,"reason":"旧 pi-ai glm 路由（8317 反代）留下的记录，按用户要求删除","detail":"glm/glm-5.3 796、glm/glm-5.3-flash 10","ref":"docs/DESIGN.md §2.4"}
```

  被删记录的起止时刻没有留下（备份已删），所以不写 `from`、`to`。数据里写到反代只是在陈述历史，没有任何代码识别或依赖反代路由（`AGENTS.md` 基线）。
- 面板：每条缺口一行（§6.1 的样子）。报告期：缺口没有 `from`、`to` 时，报告期开始早于 `at` 就在那一期的「用量」一节带这一行；有 `from`、`to` 时与报告期有交集才带。今天的报告期开始于删除之后，不带；M7 的周报若覆盖 10-29 之前就带。
- 以后谁删用量记录，就往缺口文件追加一行：写进 `docs/DEVELOPMENT.md` 的数据处理一节，作为流程约定（`CHARTER.md` §7.1 条款 11）。
- 额度一节不受缺口影响：服务端的读数包含删掉的那些调用与其他客户端。

### 6.3 晨报的「用量」一节

今天的晨报只有 `/hourness` 开头的本地日历日一份（`src/report/index.ts` `renderHourness`）。M6 只把它的「用量」一节换成 §6.1 的积分口径，标题改为「用量（今天）」。M7 的四答晨报（`ORCHESTRATION.md` §12「花费（积分、峰谷占比）」）沿用 `usagePanelOf`、`usagePanelLines` 与缺口规则，不另写一套。

## 7. 错峰排期：经规则板

### 7.1 复用规则板的什么（规则板设计 0.4）

| 复用 | 规则板 0.4 的出处 |
| --- | --- |
| 默认规则 `builtin:glm-peak-pricing` 的定义、代码规则目录、规则页上的默认规则一组、不能解除与「以它为模板新建」（0.1 的 M6-R4） | §3.1、§3.4、§10.1，规则板 R1、R4、R5 |
| `glm-peak` 由宿主在判定时经计价服务当场算，不进状态与流水；没有计价服务时读不出并写原因（0.1 的 M6-R1） | §3.2、§3.3、§5.6，规则板 R4 |
| 信号比较条件 `{"signal": "glm-peak", "is": true}`；条件读不出默认不生效（`onUnknown: skip`） | §2.3 |
| 动作 `shell`（命令文本，不区分大小写的正则，只看前 8 KiB）与 `dispatch`（`DISPATCH_TOOL_NAMES`） | §2.3、§6.5 |
| 执行方式 `queue`：当场拒绝并开等待单（0.4 没有 `holdMs`） | §2.2、§6.2 |
| 等待单：同签名去重、子 agent 结束后转交派发链的根、由拥有它的宿主每 5 秒重判、条件解除时按 agent 状态 `steer`、`inject` 或 `followup` 唤醒、24 小时过期 | §6.3 |
| 给模型的排队文字、每步提醒、唤醒消息的格式 | §6.4 |
| 规则只由人写；agent 经 `rules_propose` 提议，人的原话经 `graph_decide` 转述生效 | §2.5、§9.3 |
| 命令行 `check` 与工具调用门同一个判定 `judge`，退出码 4 拦截、5 排队；命令行不开等待单 | §9.4 |
| 规则页列出生效的规则、默认规则与在等的单 | §9.1 |
| 晨报的规则板一节列等待单（M7） | §10.5，规则板 R7 |

规则板 0.4 没有租约（0.4 §4、§10.7），所以 0.1 写的「脚本启动沙盒前取租约」不复用；脚本自查直接调用 `check` 的判定（§7.2 第 2 条）。

没有用 DSH 的定时提醒 `schedule` 做推迟（先搜再造）：它在一个时刻往创建它的会话投递一条用户消息，不看条件、不去重、子 agent 的会话不能创建（`ORCHESTRATION.md` §11.4 的实读）；规则板的等待单按条件解除唤醒，去重并能转交。`schedule` 留给 M7 运维会话的巡检定时。

### 7.2 M6 加的（M6-R2、M6-R3）

0.1 给规则板提了四处改动。规则板 0.4 采纳了 M6-R1（`glm-peak` 由宿主当场算）与 M6-R4（默认规则进目录），由它自己的 R1、R4 交付（0.4 §3.5、§3.2、§3.1、§10.1），M6 不再做。0.1 的 M6-R1 里「在 `nextPeakChange + 1 秒` 另重判一次」也删去：0.4 的等待单由拥有它的宿主每 5 秒重判（0.4 §6.3），18:00 之后至多 5 秒就发现条件不再成立，用不着这一步。M6 剩下两处：

1. M6-R2 文字写出时刻（接在 0.4 §6.4）。规则的条件里引用了 `glm-peak`、而且此刻 `glm-peak` 读得出时，三处文字带上时刻，时刻是 `nextPeakChange(peak, now)`（`src/shared/pricing.ts`），按 `formatMoment` 写（同一天写 `HH:MM`）：
   - 排队文字的 Boundary 段，在「defers it while」之后写「glm-peak is true until 18:00」；拦截文字同理写「blocks it now: glm-peak is true until 18:00」。
   - 每步提醒的等待单一项，在「(deferred since 14:06)」之后加「, until 18:00」。
   - 唤醒写「[rules board] Ticket q-12 cleared: glm-peak ended at 18:00. You may run the deferred call again: …」。时刻是 `nextPeakChange(peak, 单的开单时刻)`，在唤醒时现算，不往单上加字段（0.4 的单已经记着开单时刻，存储格式不变）。只在重判时 `glm-peak` 已为假时这样写；条件里还有别的项、是别的项先变的，照 0.4 §6.4 原样写。
   - `nextPeakChange` 返回 `undefined`（8 天内看不到变化，只在 `peak` 不是 GLM 的时段表时可能）或 `glm-peak` 读不出时不写时刻，文字照 0.4 §6.4 原样。其余文字照 0.4 §6.4，不改。
   - 实现位置：规则板的文字渲染（R4 的 `src/rules/` 下渲染函数）加一个可选参数 `peakUntil`；L2 用例在规则板的测试文件里（§14.1）。
2. M6-R3 脚本按项目规则自查（接在 0.4 §9.4 的 `check`）。今天只有 DSH 里 agent 的工具调用经过规则板的门；Kiro 里的 agent 与人直接跑的 `npm run calibrate`、`npm run smoke:authorized` 不经过它，而它们正是花积分的运行。
   - 判定函数：规则板 R3 的命令行 `check` 子命令调用的判定，导出为 `checkCall(input)`（`src/rules/check.ts`；R3 若把它写在 `cli.ts` 里没有导出，S2 把它抽到这个文件，`cli.ts` 改为调用它，行为不变）。输入 `{tool: string, args: unknown, project: string, model?: string, session?: string, peak?: (atMs: number) => boolean, now?: number, dshHome?: string}`，输出与 `check` 的 JSON 相同（执行方式、命中的规则、拒绝文字）。`peak` 给了时作为 `glm-peak` 的来源（0.4 §9.4 已写「M6-R3 让脚本传入 `peakWindowAt`」）；没给时 `glm-peak` 读不出，同命令行。
   - 主体：没有 `session` 与 `model` 的调用（脚本就是这样）只匹配没有 `subjects` 的规则：脚本不是 agent，角色、模型与会话都描述 agent 的会话，把它们读作「读不出」再按 `onUnknown: apply` 处理，会让一条为 GLM 会话写的规则去排队脚本。0.4 的 `judge` 若对缺会话的主体另有处理，S2 以这一条为准在 `checkCall` 里先筛规则，不改 `judge`。
   - 入口：新文件 `scripts/rules-gate.mjs` 导出 `gateOnRules({peak, now?, sleep?, checkModule?})`；后三项只给测试注入（时钟、睡眠函数、规则库模块的路径，默认 `packages/hourness/dist/rules/check.js`）。命令文本：`npm_lifecycle_event` 存在且匹配 `^[a-z0-9:_-]{1,64}$` 时为 `npm run <它>` 加 `process.argv.slice(2)` 以空格连接；否则为 `node <脚本相对仓库根的路径，斜杠写法>` 加同样的参数。判定按工具 `pwsh`、参数 `{command: <命令文本>}`（`shell` 类的模式看的就是 `pwsh` 的 `command`，0.4 §2.3），`project` 为仓库根。
   - 导入：`gateOnRules` 用动态 `import()` 取 `packages/hourness/dist/rules/check.js` 的 `checkCall` 与 `packages/hourness/dist/shared/pricing.js` 的 `nextPeakChange`（公共库编进每个包，split 设计；同 `run-calibrate.mjs`:27 从 `packages/glm/dist` 取 `credits.js`，要求先 `npm run build`）。导入失败（没有 build、规则板还没合入、文件坏了）：标准错误写一行「rules gate: rules board not available (<消息前 80 字符>); starting without the check」，照常开始。
   - `peak` 由调用方传：`run-calibrate.mjs` 把它已有的 `credits.js` 导入加上 `creditPricing`，传 `creditPricing.peak`；`smoke-zcode-authorized.mjs`（经 `--experimental-strip-types` 跑，已从 `../src/` 导入）从 `../src/glm-llm/credits.ts` 导入 `creditPricing` 传 `peak`。
   - 结果：放行或只告知时照常开始，不输出；排队时标准错误写规则 id 与标题、设的人、下一个非高峰时刻（`nextPeakChange`）与「rerun with --wait to wait」，`process.exit(5)`；带 `--wait` 时睡到下一个非高峰时刻之后 1 秒再判一次，至多睡 8 小时，仍判为排队就照上一句退出；拦截时标准错误写拒绝文字，`process.exit(4)`；项目还没有任何规则状态（目录不存在）时照常开始，不告警；规则状态读不出（`checkCall` 抛错或返回引擎错误）时标准错误告警一行，照常开始（规则板自己的故障偏向放行，0.4 §11.2）。`--wait` 由 `gateOnRules` 自己从 `process.argv` 里取出并去掉，不传给脚本原来的参数解析（`run-calibrate.mjs` 用 `parseArgs`，未知参数会报错）。
   - 调用点：`run-calibrate.mjs` 与 `smoke-zcode-authorized.mjs` 在解析参数与做任何事（包括 `requireDesktop`、建沙盒、读凭证、发请求）之前 `await gateOnRules(…)`。探针不花积分，不调用。

M6 不设、不提议任何排队规则。人想要时，在规则页里加（或以默认规则为模板新建），或在对话里告诉主 Agent，由它经 `rules_propose` 加人的原话转述设上（0.4 §2.5、§9.3）。

### 7.3 人以后可以加的规则（例子，M6 不设）

这两条只是写法示例，用来钉 §1.4 第 16 条的测试夹具，不进任何默认状态，也不由 agent 提议。

积分重活排到谷段：

```json
{
  "id": "r-offpeak-credit-runs",
  "title": "高峰时积分重活排到高峰结束以后",
  "scope": "project",
  "when": { "signal": "glm-peak", "is": true },
  "action": { "class": "shell", "patterns": [
    "^\\s*npm\\s+run\\s+(calibrate|smoke:authorized)\\b",
    "^\\s*node\\s+scripts[\\\\/](calibrate[\\\\/]run-calibrate|smoke-zcode-authorized)\\.mjs\\b"
  ] },
  "effect": "queue",
  "lifetime": { "kind": "until-lifted" },
  "reason": "（人写）高峰时 GLM 按全价计积分，标定、消融与真网冒烟等到高峰结束"
}
```

- 用 `shell` 类的命令模式：0.4 的出厂词汇里管命令的就是这一类（0.4 §2.3；0.3 的「重活」类随附录 A 去掉了）。同 0.4 §2.6 的例子「高峰时不跑标定」，这里多了真网冒烟与 `node` 直接跑的写法（脚本自查的命令文本就是这两种形式，§7.2 第 2 条）。
- 没有 `subjects`：DSH 里任何 agent 与仓库脚本都受它约束（脚本只匹配没有 `subjects` 的规则，§7.2 第 2 条）。消融也是 `npm run calibrate`（清点报告 §8），所以一并排队。

高峰时 GLM 会话的新派发等到谷段（M7 的派发工具做出来之前，规则板对 `subagent`、`subagent_fork` 的门已经能管）：

```json
{
  "id": "r-offpeak-dispatch",
  "title": "高峰时 GLM 会话的新派发排到高峰结束以后",
  "scope": "project",
  "when": { "signal": "glm-peak", "is": true },
  "subjects": { "models": ["*/glm*"] },
  "action": { "class": "dispatch" },
  "effect": "queue",
  "lifetime": { "kind": "until-lifted" },
  "reason": "（人写）高峰时 GLM 会话派出的子 agent 等到高峰结束"
}
```

它就是 0.4 §2.6 的例子「GLM 高峰时新的派发等到谷段」，主体与默认规则相同（`*/glm*`，规则页「以它为模板新建」预填的就是这个）。`subjects.models` 看的是调用方会话的路由（0.4 §2.3），不是子 agent 用的模型；GLM 主 Agent 派出的子 agent 今天也是 GLM，M7 按档位派别的模型时要再看这条（§7.5）。

### 7.4 不设预算

- 默认没有排队：默认规则只告知；M6 合入之后，人没有自己设引用 `glm-peak` 的排队规则，就没有一次调用因高峰或额度被推迟（`ORCHESTRATION.md` §4.3「不设积分与轮次预算」，§1.4 第 15 条）。
- 排队只是推迟到高峰结束，不是拒绝：工作日高峰至多 4 小时；周末与夜间不排。等待单 24 小时过期（0.4 §6.3）在这里不会触发。
- 额度与预估只给人看：没有代码按额度、积分或预估去拦截、推迟、限速、换模型或换套餐（`CHARTER.md` §6）。额度用完时请求由服务端拒绝（1308），通道照常把错误交回 DSH。
- 交互中的对话不受影响：规则只匹配所列的命令与派发，不碰模型的步。

### 7.5 留给以后的

- 派发按任务是否紧急排队：任务节点今天没有这个属性（`src/graph/schema.ts` 的派发属性只有 `kind`、`tier`、`worktree`、`outputSchema`、`writeScope`），加属性要改图的 schema 与 M7 的派发设计；没有使用者之前不加（`CHARTER.md` §7.1 条款 2）。记给 M7。
- `dispatch` 动作按被派子 agent 的模型匹配：0.4 的派发经工具调用门判定，主体只看调用方会话（0.4 §6.5，0.3 的 `glmHournessRules.admit` 已去掉）；要按被派的模型匹配，是在词汇里加一种主体，经设计与评审（0.4 §2.3 末段）。记给 M7。
- 巡检定时避开高峰：M7 在固定运维会话里用 `schedule` 的 `cron` 或 `daily` 设时刻时，取高峰之外的时刻；M6 只提供 `nextPeakChange`。

## 8. 只装一个包

| 能力 | 两包都装 | 只装编排层包 `dsh-hourness` | 只装 GLM 包 `dsh-glm-zcode` |
| --- | --- | --- | --- |
| 用量面板与「用量（今天）」 | 按积分 | 按 token，各一行「没有计价服务」 | 没有（用量流水由编排层的 memory 行写，`/hourness` 也在编排层） |
| 高峰行 | `/hourness` 与 `/glm-status` | 没有 | `/glm-status` |
| 额度与预估 | `/hourness` 与 `/glm-status` | 没有 | `/glm-status` |
| 覆盖与缺口 | `/hourness` | `/hourness` | 没有（没有用量流水） |
| 上游限额记录 | 写额度流水，两处显示 | 没有 | 写额度流水，`/glm-status` 显示 |
| 错峰排队 | 只在人设了规则时有；`glm-peak` 由计价服务算，文字带高峰结束的时刻 | 人设的规则引用 `glm-peak` 时读不出，按 `onUnknown` 处理，规则页写明（0.4 §3.3） | 没有规则板 |
| 脚本自查 | 有 | 有 | 有（三种组合相同：脚本在仓库里跑，从仓库源码或产物取 `creditPricing.peak` 与规则库，规则状态在用户级目录，与桌面版装了哪个包无关；没设过规则时照常开始） |
| 默认规则在规则页里（规则板 0.4 交付，验收第 1、2 条） | 有，带 `glm-peak` 的值；`toldBy` 按 D1 | 有，`glm-peak` 读不出 | 没有规则板 |
| 新的配置项 `glm-login.plan` | 与 `glm-llm.plan` 设成相同 | 不涉及 | 与 `glm-llm.plan` 设成相同 |
| 默认规则告诉模型（高峰提醒） | 按 D1 | 没有（它在 GLM 包） | 按 D1 |

`CHARTER.md` §3.1 第 4 条「不装编排层包时，通道、方言、高峰提醒与积分口径照常工作」：积分口径由 `credits.ts` 与计价服务保证；高峰提醒按 D1，推荐项下与今天相同，选「只给人看」时是 `/glm-status` 的高峰行。

## 9. 宿主与网络契约（证据）

DSH（rc.3，接口对照表 `DESIGN.md` §2.4a）：M6 不新增任何钩子或服务种类，只扩已有用法。

| 契约 | M6 怎么用 | 证据 | 状态 |
| --- | --- | --- | --- |
| `ctx.provide(name, value)`：值归提供方 fiber，卸载时撤销，同名第二个提供方抛错 | `glm-login` 提供的计价服务值多一个函数成员 `quota` | cordis:800–830 | 〔实读〕已在用；激活期的抛错照旧降级为部分生效 |
| `ctx.get(name)`：不需要 inject，提供方未激活时为 `undefined` | `/hourness` 每次调用时读计价服务 | cordis:763–766 | 〔实读〕已在用 |
| `commands.register`：处理函数可以是 async，结果 `success` 带 `text` | `/glm-status`、`/hourness` 等额度至多 3 秒 | `DESIGN.md` §2.4a 的 `commands.register` 一行；commands:379–385 | 〔实读〕已在用；先例是 `/glm-login` 的处理函数等网络（`login.start()`，`login-row.ts`），桌面版 L4 用过；`dsh-commands` 的 lib 里没有超时，客户端一侧未查（§14.3 V6） |
| 规则板的执行边界（`tools/pre-execute` 前置、`agent/pre-step`、`session/disposed`、唤醒用的 `steer`/`inject`/`followup`） | 不直接用；M6-R2 只改规则板的文字渲染，M6-R3 只调用规则库的 `checkCall`（不在 DSH 里） | 规则板设计 0.4 §6.1–§6.6 的证据 | 归规则板设计与它的 L3 |
| 行配置的 Schema（`Config` 导出，加载器按它校验与填默认值） | `glm-login` 行新导出 `Config`，带 `home`、`plan` | 先例：`glm-llm` 行的 `Config`（`src/glm-llm/index.ts`），已经桌面版 L4 | 〔实读〕已在用的写法；新的是 `glm-login` 一行也导出 |

GLM 包内部（本仓库代码）：

| 契约 | 证据 | 状态 |
| --- | --- | --- |
| 非 2xx 响应在 `ZcodeAdapter.stream` 里抛 `glm-zcode <status>: <正文前 400 字符>` | `src/glm-llm/zcode.ts`:466–470 | 〔实读〕 |
| 项目令牌经 `ZcodeAdapter.projectToken(credential)` 铸造与缓存，缓存按适配器实例，到期前 120–180 秒换新，重新登录换一代缓存；额度读取不传被拒指纹 | `src/glm-llm/zcode.ts`:186、207、240；`src/glm-llm/auth/project-token.ts`:28–31、171–220、281（`ProjectAccessTokenCache`，3.16.3 `Urt`） | 〔实读〕；铸造路径 m1-parity 沙盒真网验证过（`FACTS.md` §1） |
| `ZcodeAdapter` 的 `plan` 构造参数决定 `status()` 写的套餐与 `usageAuthorization` 读不读额度 | `src/glm-llm/zcode.ts`:76、357；`login-row.ts` 今天不传 `plan`（设计评审 F2） | 〔实读〕；M6 改为传入 |
| `/glm-status` 的第一行由设置页解析；其余非字段、非健康表的行由 pill 原样显示 | `src/glm-llm/login-row.ts` `statusCommand`；`ui/src/channel.js`:249–250（`parseHealth`、`restOf`） | 〔实读〕 |

网络（只读接口，不是模型请求，不花积分）：

| 契约 | 证据 | 状态 |
| --- | --- | --- |
| `GET <bigmodel API origin>/api/monitor/usage/quota/limit`，`authorization: <项目令牌>`，超时 15 秒 | host:+1280219（`ZAe`、`Qo`）、+1292296（`fetchQuota`）、+1291500（`resolveAuthorization` → `resolveCurrent({reason: "usage"})`）、+1295885（`Pl`、`nTe`）、+1303701（`eO`） | 〔实读〕 |
| origin 为 `https://bigmodel.cn` | `index.js` 的 `xi` 即 `chunk-5YNPFY3L.js` 的 `ia`（`G$` `buildBigModelApiUrl`，chunk:+584795，用 `K$` `resolveBigModelApiOrigin`，生产值 `D$`）；zcode-parity 报告 §3.1；`FACTS.md` §1 | 〔实读〕（V1 已关闭） |
| 401 与其他非 2xx：抛错后被 `.catch(() => null)` 吞掉，不重试、不重铸；`reason: "usage"` 带被拒指纹而没有 `expectedAccountScope` 时 `resolveCurrent` 抛 `project_token_scope_invalidated` | host:+145440（`Wt` 即 `readApiJson`）、+1282731、+1200629 | 〔实读〕；本包照做（§4.2） |
| 3.16.3 的 `apiClient.request` 是否附加默认头 | `Wt` 本身不加头；`request` 的实现没有找到；`DESIGN.md` §4.8 已列为未核 | 〔未核实，V2〕 |
| 成功判定与行的解析 | host:+1297048（`QM`）、+1268239（`zM`）、+1268830（`YY`） | 〔实读〕 |
| 行的含义：`TOKENS_LIMIT` 为 5 小时与每周，`TIME_LIMIT` 为 MCP 工具调用；`number` 不可与 `remaining` 比较；`nextResetTime` 有秒有毫秒 | `zcode-api:server/routes-quota.ts`:45–62、124–143；`zcode-api:tui/frame.ts`:346–363、476–495 | 〔实读，他人 2026-10-12 的实测〕；与 3.16.3 `YY` 先取 `TIME_LIMIT` 的做法有出入，单位不明〔未核实，V3〕 |
| 网关对频繁查询限速 | `reference/zcode-api/README.md`:228 | 〔他人观察〕 |
| 429 正文 `{"error": {"code": "1308", "message": "…"}}`；1308、1310、1316–1321 的含义；1308 的消息带 `${next_flush_time}` | `docs/reference/bigmodel-guide-digest.md`:165（说的是 `open.bigmodel.cn`）；`FACTS.md` §2.5 | 〔文档〕；经 `zcode.z.ai/api/v1/ultra` 网关时正文的形状、消息里时刻的格式与时区〔未核实，V4〕；3.16.3 没有这项处理（host 里 `1308`、`next_flush_time` 为 0 处），是本项目加的展示 |
| 额度按积分计，非高峰的消耗按半价计入 | `FACTS.md` §2.4（「积分按 50% 抵扣」，额度表以积分为单位） | 〔推断，V5〕 |

## 10. 外部输入的校验

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| 额度接口的响应正文 | 是 | 至多 256 KiB；JSON 对象 | 超长：`too-large`；不是 JSON 或不是对象：`envelope:not-json`；都按 §4.2 的表显示，可恢复，下一次命令再读 |
| 信封 `code`、`success` | 否 | `code` 为数字、数字字符串、`null`；`success` 为布尔 | 类型不对按不成功处理（`envelope:<code>`） |
| `data.level` | 否 | 字符串，去空白后 1–32 个字符 | 丢掉，不显示套餐档位 |
| `data.limits` 与每行 | 是（没有可用的行即 `no-windows`） | 数组，至多 32 行；每行的规则见 §4.3 | 不合法的行丢弃并计数；流水记丢弃数与出现过的键名（只记键名，不记值），供以后对照形状 |
| 429 正文的 `error.code`、`error.message` | 否 | `code` 为字符串或数字；`message` 为字符串，已截到 400 字符 | 不是 JSON 或没有这两个字段：不记上游限额，错误照常抛出 |
| 消息里的恢复时刻 | 否 | `YYYY-MM-DD[ T]HH:MM[:SS]`，按 UTC+8；须在 [现在, 现在 + 8 天] | 不写 `until` |
| 读回的额度流水行 | 是 | JSON 对象；`at` 能解析；`kind` 为三种之一；`reading` 的行符合 §4.3 | 跳过并计数，写进 `glm-login` 的行健康 |
| 缺口文件的行 | 是 | §6.2 的表 | 计为无法读取的缺口记录，其余照常 |
| 计价服务的 `quota` 成员 | 否 | 函数；返回的 promise 解析为对象 | 不是函数：告警一次、当作没有；被拒或解析为非对象：「额度：读取出错」，告警一次 |
| 脚本的 `npm_lifecycle_event` | 否 | `^[a-z0-9:_-]{1,64}$` | 改用 `node <脚本路径>` 作命令文本 |
| `glm-login` 行配置的 `plan` | 否 | `coding-plan` 或 `start-plan`，默认 `coding-plan`（`Config` Schema） | 加载器按 Schema 拒绝这一行的配置（同 `glm-llm` 行今天的行为）；单元测试直接调用 `apply` 时传不在联合里的值是类型错误，不在运行时另判 |
| 规则库编译产物 `packages/hourness/dist/rules/check.js` | 否 | 能动态导入，导出 `checkCall` 函数 | 导入失败或没有这个导出：标准错误一行，脚本照常开始（§7.2 第 2 条） |
| `peak(atMs)` 的返回值（规则板与面板读） | 是 | 布尔 | 不是布尔或抛错：`glm-peak` 读不出，面板不写高峰行，原因进行健康 |

## 11. 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 套餐的时段与系数只有一处 | GLM 包的 `src/glm-llm/credits.ts`；编排层只经计价服务读，ESLint 的目录边界拦住导入（split 0.3 §2.7） | 已有强制；M6 新增的 `rateShareAt` 也在这里 |
| 没有代码按额度、积分或高峰去拦截、推迟或改变调用 | 结构：M6 不在 `tools/pre-execute`、`agent/pre-step` 上注册监听器；规则板只执行人写的规则，默认规则只告知 | `ORCHESTRATION.md` §4.3、`CHARTER.md` §6；§1.4 第 15、17 条钉住 |
| 凭证不进流水、输出与控制台 | `src/glm-llm/quota.ts`：令牌只进请求头；流水只写解析后的字段；错误文字不带请求头 | 凭证泄露不可逆；L2 断言加 `check:secrets` |
| 每个宿主进程每 60 秒至多一次额度请求，没有命令就不请求 | `createQuotaReader` 的缓存与进行中的 promise | 网关限速；L2 钉住 |
| 命令等额度至多约 3 秒 | `createQuotaReader.view({waitMs})` | 命令是人在等；L2 钉住 |
| 高峰判定与本机时区无关 | `credits.ts` `peakWindowAt` | 已有 |
| 用量流水只有一种记录形状 | 缺口记录放单独文件（§6.2） | 用量流水有多个读者，都按用量记录解析 |
| 预估能复算 | `quota-projection.ts` 是纯函数，输入全在额度流水里 | 事后查错（§13） |
| 告诉模型高峰只有一处 | GLM 包的高峰提醒；规则板的每步提醒不列默认规则（0.4 §6.4；D1 选「只给人看」时 R1 把过滤条件改为 `scope === 'builtin'`，§3.3） | 两包都装时不重复；D1 两种答案下规则板都不新加注入 |
| 额度读取不发 3.16.3 不会发的请求 | `usageAuthorization`：start-plan 先返回、不接受被拒指纹；`quota.ts` 不重试 | `glm-house` 验收第 1 条（代码级与 3.16.3 一致）；§1.4 第 5、8 条钉住 |
| `glm-login` 与 `glm-llm` 的套餐一致 | 人在配置里设；`cordis.patch.yml` 的注释写明；`/glm-status` 第一行写出 `glm-login` 用的套餐 | 行之间没有读配置的契约（§4.2）；设错时人在第一行看得到 |

## 12. 故障预案

规则：额度、预估与高峰行都是给人看的数据，读不到就说读不到，从不因此让命令失败或改变任何调用；每次失败都有一行可见的原因、一条控制台告警（每种原因一次）与一条流水记录（同一原因 10 分钟一条）。

| 故障 | 怎样发现 | 之后怎样 | 可恢复 | 调用方拿到 | 记在哪 |
| --- | --- | --- | --- | --- | --- |
| 额度接口网络错误、超时、5xx、429 | fetch 抛错、`AbortController` 到时、状态码 | 不重试；保留上一次读数；下一次命令再读 | 是 | 额度一节的原因行加上一次读数的时刻 | 流水 `failure`；控制台；行健康 |
| 401 | 状态码 | 照 3.16.3：不重试、不重铸；下一次命令照常再读，令牌按有效期换新或人重新登录之后恢复 | 是 | 「令牌被拒（401）；令牌到期换新后再读，或运行 /glm-login」 | 同上 |
| 未登录、令牌铸造失败 | `usageAuthorization` 抛出的码 | 不发请求 | 人登录后是 | 原因行（带 /glm-login 的正路） | 流水 `failure`；行健康 |
| start-plan | `glm-login` 行配置的 `plan` | 不读凭证、不发任何请求 | 不需要（体验套餐没有这两种额度） | 「额度：体验套餐没有 5 小时与周额度」 | 行健康；不进流水（不是失败） |
| `glm-login` 与 `glm-llm` 的 `plan` 设得不同 | 人看 `/glm-status` 第一行的套餐 | 额度按 `glm-login` 的套餐读或不读；模型请求按 `glm-llm` 的 | 改配置后是 | 第一行写出 `glm-login` 用的套餐 | 行健康（两行各写自己的套餐） |
| 响应形状变了（字段改名、`type` 换名、行全被丢弃） | 解析计数 | 认不出的行丢弃，未知 `type` 原样显示；没有可用的行时写 `no-windows` | 改代码后是 | 「服务端没有返回可识别的窗口」或原样类型名 | 流水记丢弃数与键名；L4 读取后记进 `FACTS.md` |
| 预估的假设不成立（额度不按半价计） | 不能自动发现 | 每行写明依据；流水里有全部读数，可以换假设复算 | 是 | 带依据的预估行 | 流水；V5 |
| 本机与服务端的时钟差 | 重置时刻已过 | 写「即将重置」；5 小时命名容差 2 分钟 | 是 | 原样显示 | 无需另记 |
| 额度流水写不进（没有用户级目录、磁盘错误） | `appendFile` 失败 | 读数只在内存里，本进程内「最近两次」照常可用 | 是 | 照常显示 | 控制台一次；行健康 |
| 额度流水有坏行 | 读回时解析失败 | 跳过 | 是 | 照常显示 | 行健康写坏行数 |
| 计价服务的 `quota` 抛错或被拒 | `quotaOf` 的调用 | 面板其余部分照常 | 是 | 「额度：读取出错」 | 控制台一次 |
| GLM 包是旧版本，没有 `quota` | 成员不存在 | 面板写一行 | 升级后是 | 「GLM 通道包没有提供额度数据」 | 不告警 |
| 缺口文件有坏行 | 校验 | 跳过 | 是 | 「无法读取的缺口记录 N 条」 | 面板 |
| 429 消息里读不出时刻 | 正则不中或越界 | 不写 `until` | 是 | 「已用完（服务端 1308）」不带时刻；额度一节的重置时刻照常 | 流水 `upstream-limit` 没有 `until` |
| 适配器写上游限额记录失败 | `appendFile` 失败 | 错误照原样抛出 | 是 | DSH 照常拿到模型请求的错误 | 控制台一次 |
| `glm-peak` 读不出（没有计价服务、`peak` 抛错） | 规则板判定 | 引用它的规则按 `onUnknown`（默认不生效）；面板不写高峰行 | 是 | 规则页写原因；排队与唤醒文字不写时刻 | 规则板的判定记录；行健康 |
| 人设了排队规则，18:00 时宿主在休眠 | 拥有等待单的宿主每 5 秒重判（0.4 §6.3） | 醒来后的第一次重判唤醒 agent；单 24 小时过期 | 是 | 唤醒消息（时刻按开单时刻现算，§7.2 第 1 条） | 规则板流水 |
| 脚本自查时规则状态读不出 | `checkCall` 抛错或返回引擎错误 | 告警一行，照常开始 | 是 | 运行照常 | 运行的标准错误 |
| 脚本自查时规则库导入失败（没有 build、规则板未合入） | 动态 `import()` 被拒或没有 `checkCall` | 告警一行，照常开始 | 是（build 之后） | 运行照常 | 运行的标准错误 |
| `--wait` 期间脚本被结束 | 进程退出 | 没有半截状态：命令行不开等待单（0.4 §9.4），规则板 0.4 没有租约 | 是 | 重跑 | 无需另记 |
| D1 选「只给人看」之后续跑旧会话 | 无 | 旧 notice 留在历史里，没有代码再读 | 不需要 | 无 | 无 |
| `glm-login` 被热重载 | 模块重新加载 | 内存缓存清空；下一次命令从流水末尾读回历史 | 是 | 照常 | 无 |

不可逆的东西：M6 不删任何数据；两个新文件（额度流水、缺口文件）只追加；缺口文件的那一行由 agent 定（§17，人可推翻），删掉文件即撤销；不改用户 profile；模型请求的形态与重试行为不变，适配器只在 429 时多写一行流水。

## 13. 留痕

一处动作只记一个事实源（`CHARTER.md` §7.1 条款 11）。

| 发生了什么 | 记在哪 | 谁写 | 字段 |
| --- | --- | --- | --- |
| 一次额度读取（成功或失败） | `<userHome>/audit/quota.jsonl` | `glm-login` 行 | 时刻、`kind`、解析后的行或原因码、丢弃数（失败时另有键名） |
| 一次上游限额拒绝 | 同上 | `glm-llm` 行的适配器 | 时刻、错误码、恢复时刻（读得出时） |
| 一次预估 | 不另存：输入是流水里的读数，函数是纯的，输出行写明依据 | 无 | 依据的两次读数时刻或窗口起点 |
| 删用量记录 | `<userHome>/audit/usage-gaps.jsonl` | 删的人或 agent（流程约定，`DEVELOPMENT.md`） | §6.2 的表 |
| 人设、改、解除排队规则；等待单的开、清、唤醒 | 规则板的项目流水 | 规则板 | 规则板设计 0.4 §7.2、§10.5 |
| 脚本自查判为排队或拦截 | 运行的标准错误（命令行不开等待单、不写状态，0.4 §9.4） | `gateOnRules` | 规则 id、设的人、下一个非高峰时刻 |
| 写缺口行 | 缺口文件本身；`m6` 节点上 G1 的批注 | 主 Agent | §6.2 的那一行 |
| 默认规则对模型做什么 | 项目图上 D1 的待决与实现提交的提交信息 | 人；主 Agent 转述 | 人的原话 |
| 高峰提醒的检查 | 本稿 §3.3（方法与数字） | 本稿 | 由编排方批注到 `m6` 与 `prompt-audit` 节点 |

## 14. 可测性与验证

### 14.1 各层测什么

- L2 纯函数（新文件 `tests/quota.spec.ts`，加进 `package.json` 的 `test` 列表）：§4.3 的解析与命名夹具（含 `percentage` 130、−5、`NaN`）；§4.7 的算例与各种情形；`nextPeakChange` 的边界（§1.4 第 3 条的六个时刻，周五 18:00、跨周末；放在 `tests/quota.spec.ts`，导入自 `src/shared/pricing.ts`；规则板 R4 先合入时它的测试已在规则板的测试里，Q1 只补缺的时刻）；`formatMoment` 的五种写法，一律传 `{offsetMinutes: 480}`，另一例传 `{offsetMinutes: -300}` 核对「明天」按显示时区算；`quotaLines` 与 `peakLine` 的文字；缺口行的校验与报告期规则。
- L2 行与适配器（`tests/glm-quota.spec.ts` 新文件；`tests/glm-zcode.spec.ts`、`tests/health.spec.ts`、`tests/hourness.spec.ts`、`tests/workflow.spec.ts`、`tests/contracts.spec.ts`、`tests/credits.spec.ts` 扩充）：注入 fetch 替身核对请求的地址、方法与头（§1.4 第 5 条）；`glm-login` 配置 `plan: start-plan` 时凭证行写 start-plan、额度一节写体验套餐、fetch 替身收到 0 个请求，`Config` 解析 `{plan: 'start-plan'}` 保留它（第 5 条）；缓存、并发、上游限额绕过缓存、1 小时不请求（第 6 条）；永不返回的替身与 3 秒上限（第 7 条）；每种失败（第 8 条），其中 401 之后再读一次：fetch 替身只收到第二个额度 GET，没有 `POST …/access_tokens`；适配器 429 写流水（第 11 条）；注入的令牌字符串不出现在流水、输出与控制台（第 12 条）；pill 解析函数对新输出的「剩下的行」；`/hourness` 的两节同口径与没有计价服务的情形（第 2 条）。文件系统用 `os.tmpdir()` 下的临时目录（`DEVELOPMENT.md` §1 允许 mock 文件系统与网络，不 mock DSH 契约）。
- L2 规则板（规则板实现的测试文件里）：默认不排队（第 15 条）；人写规则时排队、每步提醒与唤醒文字里的时刻（第 16 条，注入时钟与假宿主的 `steer`；`glm-peak` 读不出时文字里没有时刻）；`toldBy` 与规则页那一行随 D1（第 14 条）。
- L2 脚本自查（新文件 `tests/rules-gate.spec.ts`）：以子进程跑一个只调用 `gateOnRules` 的临时脚本，环境变量 `DSH_HOME` 指向临时目录（规则库按 `userDataHome()` 解析，0.4 §9.4）：没有规则状态时退出码 0、标准错误为空；预置 §7.3 第一条规则、注入 `peak` 恒为真时退出码 5、标准错误有规则 id 与下一个非高峰时刻；带 `subjects` 的规则不命中；拦截规则退出码 4；`checkCall` 的模块路径指向不存在的文件时标准错误一行、退出码 0；`--wait` 从参数里被去掉（注入时钟，不真睡）。命令文本两种形式（有、无 `npm_lifecycle_event`）各一例。
- L3 探针（`scripts/probe/run-probe.mjs`）：新的覆盖层 `scripts/probe/probe-net.mjs`（同 `probe-clock.mjs`，只在探针的覆盖补丁里，不进 bundle）在宿主进程里包一层 `globalThis.fetch`，把每个请求的 URL（只记 origin 与路径）写进场景目录；核对所有场景里没有发往 `/api/monitor` 的请求（探针的 `glm-login` home 没有凭证，`run-probe.mjs`:157–159）；只装编排层包、只装 GLM 包、两包都装三种组合的输出（第 18 条）；请求正文里没有额度一节的文字（第 17 条）；高峰 notice 的条数按 D1（第 13 条）；规则板合入后，时钟平移到周三 17:59:30 的场景：人写规则的夹具下 `pwsh "npm run calibrate"` 被排队，18:00 之后的重判唤醒（第 16 条）。
- L4（批次，`DEVELOPMENT.md` §1.1；桌面版一次只给一个占用者）：§1.4 第 19 条；G1 之后第 4 条的最后一句；规则页上的默认规则一行随规则板自己的 L4 批次。

### 14.2 今天必败

新检查在今天的代码上怎样失败：`quota.spec.ts` 导入的模块不存在；`/glm-status` 没有高峰行与额度一段；`glm-login` 配置 `plan: start-plan` 时凭证行今天仍写「套餐 coding-plan」（F2 的现象）；`/hourness` 的「用量」一节按 token 列，与面板不同口径；`ZcodeAdapter` 没有 `usageAuthorization`；探针没有 `probe-net` 的记录文件；`scripts/rules-gate.mjs` 不存在；规则板的排队文字里没有「until 18:00」。

### 14.3 未核实的假设

| # | 假设 | 在哪一步核实 | 不成立时 |
| --- | --- | --- | --- |
| V1 | 3.16.3 的额度地址 origin 是 `https://bigmodel.cn` | 已关闭〔实读，设计评审第 1 轮〕：`xi` 即 chunk 的 `G$`，生产值 `D$`（§4.1） | 不适用 |
| V2 | 3.16.3 的 `apiClient.request` 不给额度请求附加身份头（`Wt` 本身不加，已读） | Q2 开工前在安装包里找 `apiClient` 的实现（只读）；找不到时按「只有 `authorization`」实现，`DESIGN.md` §4.8 保留未核标记 | 照它补头，写进 `DESIGN.md` §4.8 已一致的一项 |
| V3 | 行的含义与单位：`TOKENS_LIMIT` 是 5 小时与每周，`TIME_LIMIT` 是 MCP | Q4 的一次真实读取 | 改 §4.3 的命名函数（一个文件），重跑夹具 |
| V4 | 经 `zcode.z.ai/api/v1/ultra` 网关时 1308 的正文形状（文档写的是 `open.bigmodel.cn` 的 `{"error": {"code", "message"}}`），以及消息里恢复时刻的格式与时区。这一项是本项目加的展示，不是 3.16.3 的行为 | 真实遇到一次 1308 时（不刻意制造：要把额度用完）：适配器抛出的错误文本里有正文前 400 字符，会话日志里查得到 | 形状不同：不写上游限额记录，额度一节照常按读数显示已用比例（100% 即「已用完」）；改 §4.6 的解析一处。时刻读不出：不写 `until` |
| V5 | 非高峰的消耗按半价计入额度 | Q4 之后的日常读数：同一窗口里跨 18:00 的两段速度（流水复算，不另花积分） | 预估去掉峰谷修正，改一处 `rateShareAt` 的使用 |
| V6 | 命令处理函数等 3 秒不被打断 | 宿主一侧已查：rc.3 `dsh-commands/lib/index.js` 里没有任何超时（本稿检索 `timeout`、`setTimeout` 为 0）；客户端一侧（pill 经 `remote.commands.execute`）在 Q4 的真实读取里看一次 `/glm-status` 的耗时 | 把等待上限降到客户端允许的值 |

## 15. 实施顺序、档位与并行

开工条件：split 已合入（main `eb614ab`）。每步一个提交，提交信息带节点 id，文档与代码同一批；门禁「全」指 `npm run build`、`npm run preflight`、`npm test`，碰运行时的步另跑 `npm run probe`（`AGENTS.md`）。M6 不加新行，所以没有「默认禁用、验证后启用」的步；`glm-login` 行多一个配置项 `plan`，默认值与今天的行为相同（coding-plan）。

| 步 | 内容 | 主要文件 | 线 | 依赖 | 档位 | 层 | 独立评审 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 公共契约：`quota` 成员与 `quotaOf`；`nextPeakChange` 加在 `src/shared/pricing.ts`（规则板 R4 已先加时直接用，只补测试里缺的时刻）；`src/shared/quota.ts` 的类型、`quotaLines`、`peakLine`、`formatMoment`（带 `MomentZone`） | `src/shared/pricing.ts`、`src/shared/quota.ts`、`tests/quota.spec.ts`、`tests/contracts.spec.ts`、`package.json`（测试列表） | Q | 无 | standard | L1、L2 | 否 |
| Q2 | 额度读取：先核 V2（只读安装包）；`LoginConfig.plan` 与 `login-row.ts` 的 `Config`，构造适配器时传 `plan`；`usageAuthorization()`（start-plan 先返回、不接受被拒指纹）；`quota.ts`（401 照 3.16.3 只记失败）、`quota-projection.ts`、`rateShareAt`、429 写流水、origin 常量移到 `zcode-wire.ts`、`glm-login` 提供 `quota` 与 `/glm-status` 的一段与行健康；`cordis.patch.yml` 在 `glm-login` 行加 `plan` 的注释；`DESIGN.md` §4.7 重写为已实现、§2.4 数据表、§2.2 行表、§4.8（§16）；`FACTS.md` §1 加 3.16.3 额度取数一行 | `src/glm-llm/{quota,quota-projection,credits,zcode,zcode-wire,login-row}.ts`、`packages/glm/cordis.patch.yml`、`tests/glm-quota.spec.ts`、`tests/{glm-zcode,health,credits}.spec.ts`、`package.json` | Q | Q1 | hard | L2 | 是（凭证、网络与流水） |
| P1 | 面板与晨报：`usagePanelOf`、`PanelLineOptions`、`reportFromFiles` 的第五个参数与 `ReportInput.pricing`、高峰行、范围行、缺口文件的读取与 `auditPaths.gaps`、额度一节、3 秒上限、行健康；晨报「用量（今天）」改积分、删 `usageByModel`；`ORCHESTRATION.md` §11.3 重写、§12 用量一条；`DESIGN.md` §2.4（缺口文件）；`DEVELOPMENT.md` 加「删用量记录要留缺口行」 | `src/report/{panel,index}.ts`、`src/workflow/morning-report.ts`、`src/memory/audit.ts`、`tests/{hourness,workflow}.spec.ts` | P | Q1 | standard | L2 | 否 |
| R1 | 只在 D1 选「只给人看」时做：§3.3 末段的删除与改写（GLM 包一侧）；规则板 R4 已合入时同一步改规则板一侧（`toldBy`、提醒过滤改按 `scope`、两处文字），没合入时在 `m6-reminder` 上批注交规则板 R4；`ORCHESTRATION.md` §11.4 前四条重写 | `src/glm-prompt/{peak-reminder,index}.ts`、`tests/reminder-wiring.spec.ts`、`scripts/probe/run-probe.mjs`；（R4 已合入时）`src/rules/builtin.ts` 与提醒渲染文件、规则板测试 | R | D1 | simple | L2、L3 | 否 |
| Q3 | 探针：`probe-net.mjs` 覆盖层；三种组合、无额度请求、请求正文 | `scripts/probe/{probe-net,run-probe}.mjs` | Q | Q2、P1（R1 若做，先合入） | standard | L3 | 否 |
| Q4 | 批次 L4：重启桌面版，真实读取一次（V3），记进 `FACTS.md` §2.4；`/glm-status` 与 `/hourness` 的样子；桌面版日志 | `docs/FACTS.md`；必要时 §4.3 的命名函数 | Q | Q2、P1、Q3 | standard | L4 | 否 |
| G1 | 主 Agent 用一条一次性的 node 命令（不留脚本）往 `~/.dsh/glm-hourness/audit/usage-gaps.jsonl` 写 §6.2 的那一行，`at` 由 `new Date(1793243554750).toISOString()` 算出；核对 `/hourness` 显示「10-29 11:12 删去 806 条」；在 `m6` 节点上批注写了什么与「删掉这个文件即撤销」 | 用户级目录（插件自己的数据目录，§17 的 agent 决定） | G | P1 合入并在桌面版加载（随 Q4） | simple | L4 | 否 |
| S1 | 规则板文字写出高峰结束的时刻（M6-R2，§7.2 第 1 条）；`ORCHESTRATION.md` §11.4 排期一条重写为「经规则板，只在人设了规则时才有；默认规则只告知」 | 规则板 R4 的文字渲染文件（`src/rules/` 下）与规则板测试 | S | 规则板 R1–R4 合入；Q1 | standard | L2 | 否（只改三处文字的渲染，规则板的门由它自己的评审覆盖） |
| S2 | 脚本自查（M6-R3，§7.2 第 2 条）：`src/rules/check.ts` 导出 `checkCall`（R3 没有导出时从 `cli.ts` 抽出，行为不变）；`scripts/rules-gate.mjs`；两个脚本的调用点；`DEVELOPMENT.md` 的标定与真网冒烟两节各加一句「启动前按项目规则自查」 | `src/rules/{check,cli}.ts`、`scripts/rules-gate.mjs`、`scripts/calibrate/run-calibrate.mjs`、`scripts/smoke-zcode-authorized.mjs`、`tests/rules-gate.spec.ts`、`package.json`（测试列表） | S | 规则板 R3（命令行）合入；Q1 | standard | L2 | 否 |
| S3 | 探针：在规则板的 `rules-peak` 场景上加一个人设排队规则的夹具（§7.3 第一条），时钟平移到周三 17:59:30：`pwsh "npm run calibrate"` 被排队、文字带「until 18:00」，18:00 之后的重判唤醒且唤醒文字带「glm-peak ended at 18:00」 | `scripts/probe/run-probe.mjs` | S | S1；规则板 R4 的探针场景 `rules-peak` | standard | L3 | 否 |

并行（question-28 C：没有副作用的尽量并行）：

```text
Q1 ──┬── Q2 ──────────┐
     ├── P1 ──────────┼── Q3 ── Q4（桌面版） ── G1
     │                │
D1 ── R1（只在「只给人看」时）┘（R1 的探针改动排在 Q3 之前）

规则板 R1–R4 合入 + Q1 ── S1 ── S3
规则板 R3 合入 + Q1 ───── S2
```

- 同时可开的：Q2、P1、R1（三者文件不交叠）；S1 与 S2 文件不交叠，可以同时开；S 线与 Q、P 线文件不交叠。
- 要串行的（由编排方排合入顺序）：`scripts/probe/run-probe.mjs`（R1、Q3、S3）；`docs/ORCHESTRATION.md` §11（P1、R1、S1）；`docs/DESIGN.md` §2.4（Q2、P1）；`package.json` 的测试列表（Q1、Q2、S2）；`src/rules/` 下的文件（R1 的规则板一侧、S1、S2，以及规则板自己在做的步）；`nextPeakChange` 由 Q1 与规则板 R4 中先合入的一方加；桌面版（Q4、G1，一次一个占用者）。
- 批次 L4 一次（Q4 带上 G1）；S 线的界面核对随规则板自己的 L4 批次。

建议的图节点（编排方建）：`m6-quota-contract`（Q1）、`m6-quota-read`（Q2）、`m6-panel`（P1）、`m6-reminder`（R1，按 D1）、`m6-probe`（Q3）、`m6-l4`（Q4）、`m6-gap`（G1）、`m6-rules-text`（S1）、`m6-script-gate`（S2）、`m6-rules-probe`（S3）；待决 D1 决定者为人。规则板一侧的默认规则与 `glm-peak` 由 `rules` 节点（R1、R4）关，不另建 M6 节点。

## 16. 文档改动（随各步同一批提交）

| 文档 | 节 | 改什么 | 步 |
| --- | --- | --- | --- |
| `docs/DESIGN.md` | §4.7 | 整条重写：已实现，地址、凭证、缓存、流水、上游限额、预估，未核项 | Q2 |
| `docs/DESIGN.md` | §2.4 | 数据表加额度流水与缺口文件 | Q2、P1 |
| `docs/DESIGN.md` | §2.2 | `glm-login` 行的说明加「额度」与配置项 `plan`（须与 `glm-llm` 行相同） | Q2 |
| `docs/DESIGN.md` | §4.8 | 已一致一项：额度请求的地址、头、超时、凭证（项目令牌原样）与失败处理（不重试，401 不重铸）。已知差异四项，各写理由：项目令牌缓存一行一份（两行各一个适配器，至多多铸一次）；不做读额度前的订阅核验（结果不改变显示，多一个 OAuth 请求）；start-plan 不读额度（体验套餐没有 5 小时与周额度，3.16.3 用套餐 JWT 照读）；模型请求 429 的 1308 等上游限额记录与展示（3.16.3 没有，本项目加的，正文形状经 ultra 网关未核实） | Q2 |
| `docs/FACTS.md` | §1、§2.4、§2.5 | 3.16.3 额度取数的事实与偏移；L4 读到的行；1308 时刻格式（遇到时） | Q2、Q4 |
| `docs/ORCHESTRATION.md` | §11.3 | 面板的高峰行、范围与缺口、额度一节；「尚未实现」一段删去 | P1 |
| `docs/ORCHESTRATION.md` | §11.4 | 排期一条重写为「经规则板，只在人设了规则时才有；默认规则只告知；排队与唤醒写出高峰结束的时刻；仓库脚本启动前自查」；高峰提醒四条按 D1 | S1、R1 |
| `docs/ORCHESTRATION.md` | §12 | 晨报的「用量」按积分、缺口规则 | P1 |
| `docs/DEVELOPMENT.md` | 数据处理 | 删用量记录要往缺口文件写一行 | P1 |
| `docs/DEVELOPMENT.md` | 标定、真网冒烟 | 启动前按项目规则自查，退出码 5 为排队，`--wait` 等到非高峰 | S2 |
| `docs/ROADMAP.md` | M6 | 条目不变；验收见图上的节点 | 无 |
| `docs/HANDOFF.md` | 当前状态 | 各步合入时更新 | 各步 |

`CHARTER.md` 不改（design-context：宪章保持原样）。

## 17. 由 agent 定、人可推翻的事项

每项的采用项在最后。

| 事项 | 选项 |
| --- | --- |
| 什么时候读额度 | 1. 后台每 15 分钟：预估随时有，代价是没人看时也在发请求，本轮没有看到 3.16.3 定时读，网关对频繁查询限速。2. 只在 `/glm-status`、`/hourness` 时读，60 秒内复用（采用，§4.4） |
| 预估的速度从哪来 | 1. 本地用量流水的积分：看不到其他客户端，额度窗口的总量单位不明，换算不了。2. 服务端读数的变化（采用，§4.7） |
| 读数存哪 | 1. 只在内存：重启后「两次读数」的依据丢失，事后查错没有材料。2. 用户级目录的额度流水（采用，§4.5） |
| 上游限额错误怎样捕获 | 1. `glm-login` 在 `llm/stream` 上观察错误：要核实错误经过瀑布的路径。2. 适配器在抛错之前写流水（采用，§4.6）：代码在自己的错误分支里，L2 能直接测 |
| 窗口怎样命名 | 1. 按重置先后排位次：zcode-api 实测会错位。2. 按类型与离重置的时长，分不清时不猜（采用，§4.3） |
| 额度放哪个服务 | 1. 新服务 `glmHournessQuota`：多一套提供与检查。2. 计价服务加可选成员（采用，§5） |
| 时刻怎样显示 | 1. 一律 UTC+8：与套餐一致，代价是本机时区不同时人要换算。2. 本机时区，高峰判定仍按 UTC+8（采用） |
| 额度读取遇到 401 | 1. 带被拒指纹强制重铸一次（0.1）：3.16.3 不会发这个铸造请求，要另记一条已知差异。2. 照 3.16.3 只记一次失败，令牌按有效期换新（采用，§4.2；设计评审 F3 推荐） |
| `glm-login` 怎样知道套餐 | 1. 读 `glm-llm` 行的行健康文字里的套餐：把给人看的文字变成接口。2. 读 `glm-llm` 行的配置：行之间没有这种契约。3. `glm-login` 自己的配置项 `plan`，注释写明两行要相同（采用，§4.2；设计评审 F2） |
| `nextPeakChange` 放哪 | 1. `src/shared/quota.ts`（0.1）：与规则板 0.4 写的位置不同。2. `src/shared/pricing.ts`，谁先合入谁加（采用，§5） |
| 脚本自查的入口放哪 | 1. `scripts/sandbox.mjs`（0.1）：`smoke-zcode-authorized.mjs` 不导入它，又要与沙盒脚本的改动串行。2. 新文件 `scripts/rules-gate.mjs`，规则库按编译产物动态导入（采用，§7.2 第 2 条） |
| 写不写 2026-10-29 的缺口行 | 1. 不写，只报范围：用户级目录不动，代价是面板与以后的周报看不出删过 806 条，brief 要求的缺口说明不出现。2. 写一行（采用，§6.2、§15 G1）：插件自己的数据目录里多一个约 250 字节的文件，删掉即撤销（0.1 的 D2，按设计评审 N8 改为 agent 决定） |
| 缺口记录放哪 | 1. 写进用量流水：现有读者会把它计为无法读取，晨报的旧聚合会出错。2. 单独的缺口文件（采用，§6.2） |
| 时刻显示怎样测 | 1. 测试里设 `process.env.TZ`：只对新进程生效，同一进程里的其他测试也受影响。2. `formatMoment` 带可注入的显示时区，测试传 +480（采用，§4.8） |
| 3.16.3 读额度前的订阅核验 | 1. 照做：多一个用 OAuth 令牌的请求，结果不改变显示。2. 不做，记为已知差异（采用） |
| 命令等额度多久 | 1. 等满 15 秒：人在等。2. 3 秒，之后用上一次读数（采用） |
| 脚本在规则状态读不出时 | 1. 拒绝启动：规则板一坏，标定就跑不了。2. 告警一行后照常开始（采用，同规则板「自己出问题时偏向放行」） |

## 18. 待人定的事项

按 `d-option-card` 与 design-context 的表格版：每题一行「取决于」，表的列是选项、怎么做（加粗，不超过 20 字）、得到、代价，另加至多一列差别所在；表下一行「是 → …；否 → …」；推荐项在最后。格子按 `card-fields-table` 的上限写（`label` 至多 20、`gain` 与 `cost` 各至多 60、`crux` 至多 60 个码点），细节在 §3.3。只有一题，双向门。

### D1 默认的峰谷定价规则做什么

取决于：高峰时段要不要让模型也知道？它不能因此换模型，也不会自己推迟工作

已查 4 个真实 GLM 会话：收到提醒之后的 32 段回复里，0 段向人提到高峰或积分（§3.3）。

| 选项 | 怎么做 | 得到 | 代价 | 模型收到 |
| --- | --- | --- | --- | --- |
| A | **只给人看** | 人在 /glm-status、/hourness 与规则页看到高峰；模型请求少一段 336 字符 | 模型不知道高峰；glm-house 验收第 4 条改读作给人看的高峰行 | 0 条 |
| B | **给人看，也告诉模型** | 人看的三处同 A；模型照今天，每个高峰时段第一步收到一条提醒 | 每个 GLM 会话每个高峰时段多约 96 token，约 0.07 积分 | 每个高峰时段 1 条 |

是 → B；否 → A。

0.1 的 D2（写不写缺口行）按设计评审 N8 改为 §17 的一条 agent 决定。

## 19. 修订记录

- 0.1（2026-10-29）：初稿。写作中途收到人的更正（§3.1：默认规则只有峰谷定价，其余是例子），据此改写了 §0、§1、§3、§7、§8、§18：原先的「高峰时要不要排积分重活」一题删去（M6 不假定任何排队规则），高峰提醒的去留并入「默认规则做什么」（D1），推荐由「只给人看」改为「给人看，也告诉模型」（理由见 §3.3）；缺口文件一题由 D3 改编为 D2。
- 0.2（2026-10-29）：按设计评审第 1 轮（`design-review.md`，1 HIGH、2 MEDIUM、10 NIT）修订。依据改为 main `eb614ab` 与规则板设计 0.4。逐条：
  - F1（HIGH，规则板版本）：改。文首依据改为规则板 0.4；§3.2 改为摘录 0.4 §3.1，主体 `{"models": ["*/glm*"]}`；§7.1 复用表按 0.4 重写，删 `holdMs` 与租约两行，节号改为 0.4 的（等待单 §6.3、文字 §6.4、命令行 §9.4、规则页 §9.1、晨报 §10.5），另加两行写明 M6-R1、M6-R4 由规则板 R1、R4 交付；§7.2 只剩 M6-R2（接 0.4 §6.4）与 M6-R3（接 0.4 §9.4，去掉「在取租约之前」），删去「`nextPeakChange + 1 秒` 再重判」；`nextPeakChange` 移到 `src/shared/pricing.ts`（§5），`formatMoment`、`peakLine`、`quotaLines` 留在 `quota.ts`；§15 的 S1 只剩 M6-R2，依赖规则板 R1–R4，S2 依赖规则板 R3 与 Q1，删去对规则板 R5 与 `sandbox.mjs` 的依赖，Q1 写明与规则板 R4 谁先合入谁加 `nextPeakChange`；验收第 14 条只钉随 D1 变化的 `toldBy` 与规则页、`rules_show` 那一行文字，其余写明由规则板 0.4 验收第 1、2 条关；V7 删去；§0、§1、§8、§9、§12、§13、§14 里引用 0.3 的地方随之改。另补了评审没提、但 D1 选 A 时会出现的一处：0.4 的提醒按 `toldBy` 过滤，`toldBy` 删去后默认规则会进规则板的每步提醒，所以 R1 把过滤改为 `scope === 'builtin'`（§1.4 第 14 条、§3.3、§11）。
  - F2（MEDIUM，`glm-login` 不知道套餐）：改。`LoginConfig` 加 `plan`，`login-row.ts` 导出与 `glm-llm` 相同的 `Config` Schema，构造适配器时传入；`cordis.patch.yml` 的注释写明两行要相同；验收第 5 条加 L2 一例（`glm-login` 配 start-plan：凭证行写 start-plan、额度一节写体验套餐、fetch 收到 0 个请求）；`usageAuthorization` 先判 start-plan，不读凭证（§4.2、§10、§11、§12、§14.1）。不采用「读 `glm-llm` 的行健康」，理由写在 §4.2 与 §17。
  - F3（MEDIUM，401 后重铸）：按评审推荐的第 1 种改。401 只是失败原因 `http-401`，不记被拒指纹、不强制重铸；`usageAuthorization` 不再有参数；验收第 8 条删去末句，改为「401 之后再读一次，fetch 没有收到 `POST …/access_tokens`」；§4.1 补 `resolveCurrent` 对 `reason: "usage"` 的行为与 `.catch(() => null)` 的偏移；§4.2 凭证一条改为「与模型请求用同一个适配器的项目令牌缓存；3.16.3 的额度路径不核对账号作用域、不接受被拒指纹」；§12 的 401 一行改为下一次命令照常再读；§16 给 `DESIGN.md` §4.8 写已一致一项与四条已知差异（含评审「已核实的假设」里建议的 start-plan 一条）。
  - N1：改。V1 标为已关闭〔实读〕，§4.1 与 §9 写出 `xi` → `G$` → `K$` → `D$` 与两个覆盖变量，Q2 不再先核 V1。
  - N2：改。缺口行的 `at` 改为 2026-10-29T03:12:34.750Z（本轮用 `new Date(1793243554750).toISOString()` 复算一致），G1 写明用这个算式，不手写；面板示例改为「10-29 11:12」。
  - N3：改。§4.6 写明 1308 的处理不是 3.16.3 的行为、正文形状出自 `open.bigmodel.cn` 的文档；V4 扩为「经 ultra 网关时的正文形状、时刻格式与时区」；§9 网络表同步；§16 的已知差异加这一条。
  - N4：改。§6.1 写出 `usagePanelOf`、`usagePanel`、`PanelLineOptions`、`usagePanelLines`、`ReportInput.pricing`、`ReportOptions` 与 `reportFromFiles` 的第五个参数；写明 `{basis: false}` 只省口径说明、保留没有计价服务那一行；写明晨报的无法读取数只算本期时刻能解析的行；验收第 2 条的夹具限定为时刻都能解析。
  - N5：改。`formatMoment`、`peakLine`、`quotaLines` 带可注入的 `MomentZone`，测试传 +480，另一例传 −300；`LoginConfig` 加只给测试的 `now`、`offsetMinutes`（不进 Schema）；不用 `process.env.TZ` 的理由写进 §17。
  - N6：改。§4.8 示例改为「16:35–17:02」。
  - N7：改。D1 的各格压到 60 个码点以内（本轮逐格数过，最长 46），`crux` 32 个码点；D2 删去。
  - N8：按第一种改法改。写缺口行改为 §17 的 agent 决定（人可推翻），写明不写时 brief 要求的缺口说明不出现；D2 删去，§0.1 只剩 D1；G1 不再依赖人的决定。
  - N9：改。§7.2 第 2 条写明：规则库按 `packages/hourness/dist/rules/check.js` 动态导入（要求先 build），导入失败时标准错误一行、照常开始；判定按工具 `pwsh`、参数 `{command: <命令文本>}`；`check` 的判定导出为 `checkCall`；入口改到新文件 `scripts/rules-gate.mjs`（`smoke-zcode-authorized.mjs` 不导入 `sandbox.mjs`）；`--wait` 由入口自己取出；L2 用例在 `tests/rules-gate.spec.ts`。
  - N10：改。`percentage` 大于 100 按 100 保留，只丢负数与非有限数；验收第 9 条的夹具改为 130、−5、`NaN`。
  - 「数字随时间变化」（评审末段）：§2 与 §6.1 的条数改为本轮只读计数的 384 条，并写明是哪一刻的数。
