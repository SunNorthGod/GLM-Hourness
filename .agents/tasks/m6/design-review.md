# M6 设计评审（项目图 `m6`）

被审：`.agents/tasks/m6/design.md` 0.1（2026-10-29，91,919 字节，写于 21:37）。
挡路标准：`docs/DEVELOPMENT.md` §1.1「评审挡路的标准」：只有三类发现挡路：验收条件没有满足；会造成不可逆损失而没有预防；失败了没有途径发现、没有恢复办法或事后查不到原因。其余记为非阻断（NIT）。HIGH 与 MEDIUM 都挡路。
依据：brief 原文；`AGENTS.md`；`docs/CHARTER.md`；`docs/ORCHESTRATION.md` §4.3、§11、§12；`docs/DESIGN.md` §2.4、§4.6–§4.8；`docs/FACTS.md` §1、§2.4、§2.5；`docs/ROADMAP.md` M6；`.agents/tasks/design-context.md`；split 设计 §4.3–§4.4；规则板设计（读到的是 0.4 草稿，`design.md` 最后写入 21:58，见 F1）；注入清点报告 §3.2、§4.5、§9 Q7；`.agents/tasks/zcode-parity/report.md` §3.1；`docs/reference/bigmodel-guide-digest.md`:165；本仓库源码；ZCode 3.16.3 安装包 `C:\Program Files\ZCode\resources\app.asar` 的 `out/host/index.js` 与 `out/host/chunk-5YNPFY3L.js`（只读，按 asar 头读出后检索）；`~/.dsh/sessions/` 与 `~/.dsh/glm-hourness/audit/usage.jsonl`（只读计数）。

做法：没有发额度接口的请求，没有用桌面版，没有改 `~/.dsh`、已跟踪文件与 `docs/graph/`。读安装包与会话文件用的三个一次性脚本放在本目录，用完已删。

## 轮次记录

| 轮 | 日期 | 被审版本 | HIGH | MEDIUM | NIT | 上一轮的发现 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-29 | 0.1 | 1 | 2 | 10 | 无（第一轮） |
| 2 | 2026-10-30 | 0.2 | 1 | 3 | 5 | 13 条全部关闭（F1、N9 按规则板 0.4 关闭；规则板 0.5 与人定 `d-peak-mode` 带来的新差异另记 F4、F5） |
| 3 | 2026-10-30 | 0.3 | 0 | 2 | 6 | 9 条全部关闭（N14 换了改法关闭，它带来的跨设计分工另记 F8） |
| 4 | 2026-10-30 | 0.4 | 0 | 0 | 5 | 8 条全部关闭（F8、F9 照编排方接缝裁定关闭；N17、N18 换了改法关闭） |
| 5 | 2026-10-31 | 0.5 | 0 | 0 | 8 | 第 3 轮的 8 条（F8、F9、N16–N21）逐条复核，全部 Closed（第 4 轮没有正文，见表下说明） |

第 4 轮那一行是写正文之前断掉的那次运行留下的：本文件没有第 4 轮的正文，`design-review.json` 也止于第 3 轮，所以那一行不当作评审结论，0.4 按没有评审过看（`design.md` 0.5 版本行后一段与 §21「0.5：盘上稿的处理」第 4 条也这样记）。第 5 轮因此把第 3 轮的发现重新复核了一遍，没有把第 4 行的「8 条全部关闭」当作已知。

挡路条数（HIGH+MEDIUM）逐轮：第 1 轮 3，第 2 轮 4，第 3 轮 2，第 4 轮无记录，第 5 轮 0。

## 第 1 轮

### 结论摘要

设计的大部分站得住：额度请求的形态、成功判定与行的解析与 3.16.3 安装包逐项相符；高峰提醒的检查（清点报告 Q7）复跑得到同样的数字；故障预案、留痕、两包组合与「不设预算」都写全了。挡路的有三处：规则板设计已经从 0.3 变到 0.4，本稿对规则板「复用什么、新加什么」与实施顺序是按 0.3 写的（F1）；`glm-login` 行不知道套餐，验收第 5 条做不到（F2）；额度读取遇到 401 时强制重铸项目令牌，3.16.3 明确不这样做，本稿却写成与 3.16.3 一致（F3）。

### 发现

#### F1 HIGH（挡路：brief 的验收「写明 M6 对规则板加什么、复用什么」没有满足；实施顺序按它做会重复实现并依赖不存在的步）

位置：§0、§3.2、§7.1、§7.2、§8、§14.3 V7、§15 S1/S2、§17「`glm-peak` 怎样得到」一行、文首依据。

问题：本稿写的依据是规则板设计 0.3「评审中，第 2 轮 CHANGES_REQUESTED」。现在 `.agents/tasks/rules/design.md` 是 0.4：0.3 在第 3 轮通过后，按人的更正缩成「概念与机制，加一条默认规则」，0.3 原文移到 `design-v0.3.md`。0.4 与本稿对不上的地方：

1. 0.4 已经采纳 M6-R1 与 M6-R4（规则板 0.4 §3.2、§3.1、§10.1、§3.5），它的 R4 包含「`glm-peak` 经计价服务」与公共库 `nextPeakChange`（§16 R4 一行）。本稿 §15 S1 仍把这两项排进 M6，按两份设计各自实现会做两遍。
2. `nextPeakChange` 放在哪里两边不同：本稿 §5 放 `src/shared/quota.ts`，规则板 0.4 §3.2 放 `src/shared/pricing.ts`，并说「谁先实现谁加」。
3. §7.1 的复用表引用了 0.4 已删掉的机制与旧节号：`holdMs`（0.4 §6.2 末段已去掉）；「脚本启动沙盒前取租约 `dsh-profile:<名字>`，`--wait`」（0.4 没有租约，§4、§10.7）；命令行 §9.5（0.4 是 §9.4）、规则视图 §9.2、晨报 §10.5 等节号。0.4 §10.7 专门列了 M6 要改的这几处。
4. M6-R3「在取租约之前调用」不再成立；S2 的依赖「规则板改 `sandbox.mjs` 的租约步（规则板 R5）」在 0.4 里不存在，0.4 的 R5 是规则页最小版。
5. M6-R1 另加的「`nextPeakChange + 1 秒` 再重判一次」：0.4 的等待单由拥有它的宿主每 5 秒重判（0.4 §6.3），验收第 16 条「18:00 之后 61 秒内唤醒」不需要这一步。
6. 默认规则的主体：本稿 §3.2 写「GLM 路由」，0.4 §3.1 写 `{"models": ["*/glm*"]}`（与 `isGlmModel` 同口径）。
7. 本稿验收第 14 条（规则视图列出默认规则）与 0.4 验收第 1、2 条是同一件事，两份设计都把它算作自己的验收，没有写由谁关。

改法（具体）：

- 文首依据改为规则板 0.4，写明读的是哪一版。
- §7.2 改为：「M6-R1、M6-R4 由规则板 0.4 的 R1、R4 交付（0.4 §3.2、§3.1、§10.1），M6 不再做」。M6 只剩 M6-R2（排队、每步提醒与唤醒文字写出高峰结束的时刻，接在 0.4 §6.4）与 M6-R3（脚本自查，接在 0.4 §9.4 的 `check`，去掉「在取租约之前」）。删去「`nextPeakChange + 1 秒` 再重判」。
- `nextPeakChange` 定在 `src/shared/pricing.ts`（它只依赖 `peak`，规则板已按这个位置写），本稿 §5 的代码块与 §15 Q1 的文件列表随之改；`formatMoment`、`peakLine`、`quotaLines` 留在 `src/shared/quota.ts`。
- §7.1 的复用表按 0.4 重写：删 `holdMs` 与租约两行；节号改为 0.4 的（等待单 §6.3、文字 §6.4、命令行 §9.4、晨报 §10.5、规则页 §9.1）。
- §15：S1 只剩 M6-R2；S2 的依赖改为「规则板 R3（命令行）合入」，删去对规则板 R5 的依赖；Q1 写明与规则板 R4 谁先合入谁加 `nextPeakChange`。
- §3.2 的主体改为 `{"models": ["*/glm*"]}`。
- 验收第 14 条改为只钉 M6 自己的部分：D1 选「只给人看」时目录里「告诉模型」一项随之删去、`toldBy` 与规则页那一行文字随 D1 变化；其余引用规则板 0.4 验收第 1、2 条，由规则板的节点关。
- §14.3 V7 删去（0.4 已定由宿主当场算）。

#### F2 MEDIUM（挡路：本稿验收第 5 条「start-plan 不发请求」按现设计做不到）

位置：§4.2 凭证一条、§1.4 第 5 条。

问题：`usageAuthorization` 按适配器的 `plan` 判 start-plan。额度读取用的是 `glm-login` 行自己的 `ZcodeAdapter`（§4.2 写明），而 `glm-login` 构造它时只传 `home` 与 `fetchImpl`（`src/glm-llm/login-row.ts` `apply`），`LoginConfig` 没有 `plan`；套餐只在 `glm-llm` 行的配置里（`src/glm-llm/index.ts`:36、44），`packages/glm/cordis.patch.yml` 两行都没有写 `plan`。所以人把 `glm-llm` 设成 start-plan 之后，`glm-login` 仍按 coding-plan 用 OAuth 令牌铸造项目令牌并发出额度请求，`/glm-status` 的凭证行今天也一直写「套餐 coding-plan」。L2 用例若直接给读取器一个 start-plan 的适配器，测试会过，产品却不满足这一条。

改法：`LoginConfig` 加 `plan?: 'coding-plan' | 'start-plan'`，Schema 与 `glm-llm` 行相同，`glm-login` 构造适配器时传入；`cordis.patch.yml` 的注释写明两行的 `plan` 要一致；L2 加一例：`glm-login` 配置 start-plan 时 `/glm-status` 写「额度：体验套餐没有 5 小时与周额度」，注入的 fetch 没有收到任何请求。（另一个做法是 `glm-login` 读 `glm-llm` 的行健康里的套餐，但那要跨行解析文字，不建议。）

#### F3 MEDIUM（挡路：`glm-house` 验收第 1 条与本稿自己列的「ZCode 3.16.3 一致性（额度请求照 3.16.3 的形态发）」没有满足）

位置：§4.2「401 之后」一条与凭证一条（「与模型请求同一条铸造路径与缓存规则」）、§1.4 第 8 条末句、§12 的 401 一行、§16 `DESIGN.md` §4.8 的已知差异。

问题：3.16.3 的额度读取遇到 401 不重铸令牌，而且明确拒绝这样做：

- `AccountProviderRequestAuthService.resolveCurrent`（`out/host/index.js` +1200629）：`reason` 为 `"usage"` 且没有 `expectedAccountScope` 时，带 `rejectedProjectTokenFingerprint` 直接抛 `project_token_scope_invalidated`；`reason: "usage"` 也跳过账号作用域的核对。
- `fetchQuota`（+1292296）经 `Wt`（`readApiJson`，+145440）发请求，非 2xx 抛错，调用处 `.catch(() => null)`（+1282731），没有刷新与重试。

本稿让 401 之后的下一次读取带被拒令牌的指纹强制重铸，这是 3.16.3 不会发出的一次 `POST …/access_tokens`。§16 列的已知差异只有「项目令牌缓存一行一份」与「不做订阅核验」，没有这一处；§4.2「与模型请求同一条铸造路径」对 3.16.3 的额度路径也不成立。

改法（二选一，推荐 1）：

1. 照 3.16.3：401 只是一个失败原因 `http-401`，额度一节写「令牌被拒（401）」，不传指纹、不强制重铸；令牌按自己的有效期刷新，或在模型请求的 401 路径上刷新（那条路径 3.16.3 有，`AccountRequestRetry`）。§1.4 第 8 条删去末句，§12 的 401 一行改「下一次命令照常再读」。§4.2 的凭证一条改为「与模型请求用同一份项目令牌；3.16.3 的额度路径不核对账号作用域、不接受被拒指纹」。
2. 保留重铸：在 §16 给 `DESIGN.md` §4.8 加一条已知差异，写明理由与上限（同一个令牌至多强制重铸一次），并在 §9 的网络契约表里标为偏离。

#### N1 NIT 　V1 已可关闭

位置：§4.1、§9 网络表第二行、§14.3 V1、§15 Q2「先核 V1」。

本轮读到：`index.js` 的 `xi` 从 `chunk-5YNPFY3L.js` 导入（`ia as xi`，import 在 +556 到 +4942 之间，`from"./chunk-5YNPFY3L.js"`）；chunk 里 `ia` 是 `G$`（`buildBigModelApiUrl`，+584795），`G$` 用 `K$`（`resolveBigModelApiOrigin`），生产值 `D$="https://bigmodel.cn"`；覆盖项是 `BIGMODEL_API_BASE_URL` 与 `BIGMODEL_PRODUCTION_API_BASE_URL`。改法：V1 标〔实读〕关闭，§9 第二行的状态改为〔实读〕，Q2 不必再核 V1。

#### N2 NIT 　缺口行的 `at` 换算错了（G1 之前必须改）

位置：§6.2 的那行 JSON 与上一段。

`usage.jsonl.bak-1793243554750` 的毫秒数是 2026-10-29T03:12:34.750Z（UTC+8 11:12），不是 06:25:54.750Z。对照：profile 备份 `bak-1793241992974` 是 02:46:32.974Z，两次清理相隔 26 分钟，顺序一致。错的时刻会写进用户级目录，并影响「报告期开始早于 `at`」的判断。改法：`at` 改为 `2026-10-29T03:12:34.750Z`；G1 的一次性命令用 `new Date(1793243554750).toISOString()` 算，不手写。缺口文件可删可改，所以不挡路。

#### N3 NIT 　429 正文经 ZCode 网关时的形状没有标未核实

位置：§4.6、§9 网络表、§14.3 V4。

`{"error":{"code":"1308",…}}` 出自 `bigmodel-guide-digest.md`:165，说的是 `open.bigmodel.cn`；本通道的模型请求经端点路由改写到 `zcode.z.ai/api/v1/ultra/...`（`DESIGN.md` §4.3、§4.4）。3.16.3 的 host 包里没有 `1308` 与 `next_flush_time` 字样（本轮检索为 0），所以这部分是本项目新加的展示，不是照 3.16.3。形状不同时只是不写上游限额记录，额度读数照样显示已用比例，能被发现。改法：V4 改为「1308 经 ultra 网关时的正文形状、消息里时刻的格式与时区」，并写明这一项不是 3.16.3 的行为。

#### N4 NIT 　晨报改口径的接口没写全

位置：§6.1 第一条、§1.4 第 2 条。

`morningReport(input)` 是同步纯函数，`reportFromFiles(fs, homes, period, since)` 没有计价参数；晨报要用 `usagePanelOf`，这两个函数的签名怎样加 `pricing`、`problem` 没写。`usagePanelLines(panel, {basis: false})` 是否保留「没有计价服务…」那一行没写，而第 2 条要求两节各有一行。另外 `reportFromFiles` 的 `inPeriod` 先丢掉 `at` 解析不了的行，晨报的「无法读取」计数会比面板少。改法：写出两个签名（例：`reportFromFiles(fs, homes, period, since, {pricing, problem})`，`ReportInput` 加 `pricing?`），写明 `{basis: false}` 只省口径说明、保留没有计价服务的那一行，并写明晨报的无法读取数只算本期能解析时刻的行。

#### N5 NIT 　时刻显示依赖本机时区，L2 断言需要固定时区

位置：§4.8 第一条、§1.4 第 3 条、§14.1。

`formatMoment` 按本机时区显示，第 3 条的预期值是 UTC+8 的时刻；在别的时区跑测试会失败。改法：`formatMoment(ms, now, offsetMinutes?)` 带可注入的偏移，测试传 +480；或在 `tests/quota.spec.ts` 开头设 `process.env.TZ = 'Asia/Shanghai'` 并写明理由。

#### N6 NIT 　§4.8 的示例与「同一期」规则矛盾

位置：§4.8 示例第一行。

5 小时窗口 21:30 重置，窗口开始是 16:30；示例的依据「16:20–17:02 两次读数」里 16:20 那次属于上一期（重置时刻不同），按 §4.3 的「同一期」规则不会被选中。改法：示例改为「16:35–17:02」。

#### N7 NIT 　待决卡的格子超过 `card-fields-table` 的长度

位置：§18 D1、D2。

规则板 0.4 文首引的卡片字段（分支 `card`）规定 `gain`、`cost` 各至多 60 个码点；D1 B 的「得到」、D1 A 的「代价」、D2 A 的「代价」都超过。这些卡要经图上的卡片字段落地时会被拒。改法：各格压到 60 个码点以内，细节留在 §3.3。

#### N8 NIT 　D2 可以由 agent 定

位置：§0.1、§18 D2、§1.4 第 4 条。

缺口文件在插件自己的用户级数据目录里，约 250 字节，删掉即撤销；design-context 要求「可逆的细节自己定，记成 agent 决定」。另外 D2 选 A 时 brief 的「面板与报告写明历史缺口」只剩范围一行，卡上没写这一点。改法：把「写缺口行」改为 §17 的一条 agent 决定（人可推翻），删去 D2；或保留 D2，在 A 的代价里写「brief 要求的缺口说明不出现」。

#### N9 NIT 　脚本自查的导入与判定输入没写

位置：§7.2 第 3 条、§15 S2。

`npm run calibrate` 是 `node scripts/calibrate/run-calibrate.mjs`，脚本今天从 `packages/*/dist` 导入编译产物（`run-calibrate.mjs`:27）。`gateOnRules` 从哪里导入规则库（建议 `packages/hourness/dist/rules/...`，与 `credits.js` 同样要求先 build）、导入失败时怎样（建议：标准错误一行、照常开始，同「规则状态读不出」）没写；脚本的命令文本怎样交给规则板 0.4 §9.4 的 `check`（建议按工具 `pwsh`、参数 `{command: <命令文本>}` 判，`shell` 类的模式才命中）也没写。

#### N10 NIT 　`percentage` 超过 100 被丢掉

位置：§4.3 解析第三条。

超额时服务端若给出大于 100 的值，按现规则这个字段被丢掉，这一行就显示不出「已用完」。改法：大于 100 的值按 100 处理并保留，只丢负数与非有限数。

### 已核实的假设

- 额度地址常量 `ZAe="/api/monitor/usage/quota/limit"`、超时 `Qo=15e3`（host:+1280219 一带）；`eO(env)=xi(env, ZAe)`（+1303701）；`xi` 的基址为 `https://bigmodel.cn`（见 N1）。
- 请求头 `Pl` 只放 `authorization`，团队另加 `bigmodel-organization`、`bigmodel-project`；`nTe` 只在团队时加 `?type=2`（+1295698）。
- 凭证：`resolveAuthorization` 对账号套餐调 `resolveCurrent({providerId, accountAccess, reason: "usage"})` 取 `apiKey`（+1291500），个人 coding-plan 是项目令牌（`loadIndividualPlanMaterial`，+1200629）。另见：3.16.3 对 start-plan 返回 `zcodeJwtToken`，即 3.16.3 会对 start-plan 读额度；本稿选择不读，属于有理由的取舍，建议在 §16 的已知差异里一并写上。
- 成功判定 `QM`（`success !== false` 且 `code` 为 null、undefined、0、200）；解析 `zM` 只留数字字段与 `usageDetails`；`YY` 先取 `TIME_LIMIT`（+1268239、+1268821、+1296965）。
- `fetchQuota(d).catch(() => null)`（+1282731）；`Wt` 是 `readApiJson`：`apiClient.request` 之后非 2xx 抛错、再解析 JSON（+145440）。
- 3.16.3 在一条路径上读额度前先查订阅（`ZM`，+1270159，`/api/biz/subscription/list`），`getCodingPlanUsageSnapshot`（+1289411）直接读；本稿 §1.6 不做订阅核验，与它记的一致。
- 高峰提醒的检查（清点报告 Q7）复跑：`~/.dsh/sessions/` 现在 720 个文件（本稿写时 718），含 `glm-peak-reminder` 的 157 个，其中探针的脚本 provider 153 个，`glm-zcode` 4 个；4 个真实会话在提醒之后的助手文字块 2 + 12 + 10 + 8 = 32 段，按同一组关键词匹配 0 段。与 §3.3 的数字相同。
- `pricingService` 只检查四个成员，多出的成员不算形状不对（`src/shared/pricing.ts`），可选的 `quota` 不影响旧读者；`creditPricing` 冻结，`OFF_PEAK_RATE` 未导出（`src/glm-llm/credits.ts`）。
- 引用的行号：`zcode.ts`:46（`BIGMODEL_API_ORIGIN`）、:240（`projectToken`）、:466–470（非 2xx 抛错）；`project-token.ts`:148（`projectTokenFingerprint`）、:181–188（被拒指纹强制重铸）；`ui/src/channel.js`:249–250；`run-calibrate.mjs`:27；`run-probe.mjs`:51、157–159。
- pill 把既不是字段也不是健康表的行留在健康表上方（`ui/src/channel-model.ts` `restOf`），只在第一次打开时自动跑 `/glm-status`，之后靠人点「刷新状态」，所以不会变成后台轮询。
- `usageByModel` 只被 `morningReport` 与 `tests/workflow.spec.ts` 使用，删去可行。
- rc.3 `dsh-commands/lib/index.js` 里 `timeout`、`setTimeout` 为 0 处（V6 的宿主一侧）。
- `glm-house` 验收第 4 条与 `CHARTER.md` §3.1 第 4 条的原文「不装编排层包时，通道、方言、高峰提醒与积分口径照常工作」。
- `FACTS.md` §2.4 的时段、半价与额度表；§2.5 的 1308、1310、1316–1321；`bigmodel-guide-digest.md`:165 的错误码含义。
- 规则板 0.4：信号比较条件可引用 `glm-peak`，`queue` 可配命令文本与派发（§2.3）；命令行退出码 4 拦截、5 排队（§9.4）；等待单每 5 秒重判（§6.3）；`check` 读不到计价服务、由 M6-R3 传入 `peakWindowAt`（§9.4）。
- §4.7 的算例：`W(17:00, 17:30) = 0.5`，`k = 20`；18:00 时 40%，18:00–21:30 折 1.75 全价小时再加 35，得 75%；不做峰谷修正时 21:00 用完。算术无误。

### 未核实或不成立的假设

- 不成立：本稿依据的规则板版本与状态（F1）。
- 不成立：`glm-login` 能分辨 start-plan（F2）。
- 不成立：3.16.3 的额度路径与模型请求「同一条铸造路径与缓存规则」，以及 401 后重铸（F3）。
- 不成立：缺口行的 `at`（N2）。
- 仍未核实（本稿已标，计划可行）：V2 `apiClient.request` 是否附加默认头（`Wt` 本身不加，`request` 的实现本轮没找到）；V3 行的含义与单位；V4 1308 的时刻格式，另加 ultra 网关下的正文形状（N3）；V5 非高峰按半价计入额度；V6 客户端一侧对命令耗时的上限；3.16.3 有没有定时读额度（本稿标〔推断〕）。
- 数字随时间变化：用户级用量流水本轮读到 384 行，本稿写的是 371 行（写稿之后有新记录），§2 与 §6.1 示例里的数写明是哪一刻的即可。

## 第 2 轮

被审：`.agents/tasks/m6/design.md` 0.2（120,419 字节，写于 2026-10-30 00:12）。下文 `design.md:N` 指这一版的行号。

对照的人定与设计：`d-peak-mode`（2026-10-29T17:33Z 批准，17:45Z 改为默认少做）；`d-chat-not-cards`（问人只给一个方案，背景、推荐、疑问、不做四行，不给选项表）；`d-zcode-3171`（基线换到 3.17.1）；`.agents/tasks/design-context.md` 最新三节；规则板设计 `.agents/tasks/rules/design.md` 0.5（2026-10-30 01:46，晚于本稿；`rules:N` 指它的行号）。

做法：只读。没有发额度接口的请求，没有用桌面版，没有改代码、已跟踪文件、`docs/graph/` 与 `~/.dsh`。ZCode 包内的事实用经标准输入喂给 node 的一次性读取（不落文件）核对；`.agents/tasks/m6/` 下的 `tmp-asar-check.cjs`、`tmp-asar-chunk.cjs`、`tmp-cjs-find.cjs` 是此前失败的那次第 2 轮评审留下的（写于 00:19–00:46，晚于本稿），本轮只运行过其中两个的只读模式，没有建也没有删它们。

ZCode 包的来源（本轮查清）：

| 版本 | 文件 | `out/host/index.js` | 说明 |
| --- | --- | --- | --- |
| 3.17.1 | `C:\Program Files\ZCode\resources\app.asar`（2026-10-29 21:04 自动更新写入） | 2,190,425 B，MD5 `3ef810e5878d5103bb4430df00181b09` | 本稿文首写的「3.16.3 桌面安装包」就是这个路径，但它现在是 3.17.1；host 目录里已没有 `chunk-5YNPFY3L.js` |
| 3.16.3 | `C:\Program Files\ZCode\resources\app.asar.orig-3163.bak` | 2,074,639 B，MD5 `cbf4b599745c46530befe965eb0f2da3` | 本稿与第 1 轮评审的 `host:+偏移` 都对得上这一份 |
| 两版 | `reference/zcode-3.17.1/zcode.cjs`、`reference/zcode-3.16.3/zcode.cjs` | 不适用 | 不含额度代码：`/api/monitor/usage/quota/limit`、`BigModelUsageQuotaProvider`、`quota/limit` 各 0 处 |

### 结论摘要

第 1 轮的 13 条都改到了，F2、F3 的改法站得住，3.17.1 里额度读取的行为与 3.16.3 逐项相同。挡路的有四处，都来自本稿写完之后的变化或本轮才查清的事实：人已经回答了 D1 并加了高峰模式、默认少做，本稿仍在问 D1，并多处写「默认不排队」（F4）；规则板 0.5 把脚本自查的库入口定成了另一个签名，并要求脚本自报 `glmSpend`，否则少做与不做管不到练习题与消融（F5）；全部 ZCode 证据仍标 3.16.3，指向的文件路径现在装的是 3.17.1（F6）；ZCode 的额度请求除 `authorization` 外还带 `x-request-id`，验收第 5 条写的是「只有 `authorization`」（F7）。

### 第 1 轮发现的复核

| # | 状态 | 依据 |
| --- | --- | --- |
| F1 | 关闭（对 0.4） | 文首依据改为规则板 0.4（`design.md:3`）；主体 `{"models": ["*/glm*"]}`（`design.md:136`）；§7.1 复用表按 0.4 重写，删 `holdMs` 与租约（`design.md:451–467`）；§7.2 只剩 M6-R2、M6-R3，删「`nextPeakChange + 1 秒`」（`design.md:473`）；`nextPeakChange` 移到 `src/shared/pricing.ts`（`design.md:363`）；S1、S2 的依赖改写（`design.md:720–721`）；V7 删去（`design.md:696–705` 只剩 V1–V6）。规则板之后又出了 0.5，新差异另记 F4、F5 |
| F2 | 关闭 | `LoginConfig.plan` 与 `glm-login` 的 `Config`（`design.md:191`）；验收第 5 条加 start-plan 不发请求一例（`design.md:69`）；`cordis.patch.yml` 注释（同上）；§10、§11、§12 各有一行。改法核对：`login-row.ts:56` 今天构造适配器只传 `home`、`fetchImpl`；`glm-llm/index.ts:42–44` 的 `Config` 可照抄；rc.3 的加载器按 `Config["~standard"]` 校验（cordis:956–961） |
| F3 | 关闭 | 401 只记 `http-401`，不传指纹、不重铸（`design.md:209`、`design.md:592`）；验收第 8 条改为「没有 `POST …/access_tokens`」；§16 写进 `DESIGN.md` §4.8 的已一致项与已知差异。3.17.1 行为相同：`resolveCurrent`（3.17.1 index.js +1278678）对 `reason: "usage"` 不核账号作用域，带被拒指纹而没有 `expectedAccountScope` 时抛 `project_token_scope_invalidated`；`readApiJson`（`Vt`，+151499）非 2xx 抛错 |
| N1 | 关闭 | V1 标为已关闭，`xi` → `G$` → `K$` → `D$` 写进 §4.1 与 §9（`design.md:178`、`design.md:591`）。3.17.1 里这条链改名并换了文件，见 F6 |
| N2 | 关闭 | `at` 为 `2026-10-29T03:12:34.750Z`，G1 用 `new Date(1793243554750).toISOString()` 算（`design.md:434`）；本轮复算一致，`bak-1793241992974` 为 02:46:32.974Z |
| N3 | 关闭 | §4.6 写明 1308 的处理不是 3.16.3 的行为（`design.md:255`）；V4 扩到 ultra 网关下的正文形状。3.17.1 host 里 `1308`、`next_flush_time` 也是 0 处 |
| N4 | 关闭 | §6.1 给出 `usagePanelOf`、`PanelLineOptions`、`ReportOptions` 与 `reportFromFiles` 第五个参数（`design.md:398–410`）；今天 `reportFromFiles` 四个参数（`src/workflow/morning-report.ts:98`），扩法可行 |
| N5 | 关闭 | `MomentZone` 可注入偏移（`design.md:355–360`），测试传 +480 与 −300 |
| N6 | 关闭 | 示例改为 16:35–17:02（`design.md:289`）；周窗口 10-26 是周一、10-30 是周五，示例的「周一 10:00 重置」与「10-26 10:00 以来」自洽 |
| N7 | 关闭（已无对象） | 卡片格子的长度规则随 `d-chat-not-cards` 不再用于问人；D1 的表应整段删去，见 F4 |
| N8 | 关闭 | 写缺口行改为 §17 的 agent 决定（`design.md:778`），D2 删去 |
| N9 | 关闭（对 0.4） | 导入路径、导入失败、命令文本的判定输入都写了（`design.md:482–488`）。规则板 0.5 改了库入口的签名，见 F5 |
| N10 | 关闭 | `percentage` 大于 100 按 100 保留（`design.md:217`），验收第 9 条夹具 130、−5、`NaN` |

### 发现

#### F4 HIGH（挡路：人定 `d-peak-mode` 没有满足；本稿多处写成与它相反的默认行为）

位置：文首 `design.md:9`；§0 `design.md:17–21`；§0.1 `design.md:23–29`；§1.2 F7、F8 `design.md:49–50`；§1.4 第 13–15 条 `design.md:77–79`；§1.5 `design.md:89`；§1.6 `design.md:99`；§3.1 `design.md:126`；§3.2 `design.md:138`、`145`；§3.3 `design.md:166–170`；§7.2 `design.md:490`；§7.4 `design.md:537`；§8 `design.md:557–563`；§11 `design.md:630`；§12 `design.md:660`；§13 `design.md:678`；§15 R1、S1 与图节点 `design.md:716`、`720`、`730`、`740`；§16 `design.md:752`；§18 `design.md:785–802`。

问题：

1. D1 已经由人定了。`d-peak-mode` 的历史原话：「高峰继续提醒模型，但是加一个档位吧就是高峰模式，人可以选择无影响，少做，不做。要让主Agent知道现在是不是高峰，应该选哪个档位」；「默认少做，新手教程提醒用户就行了，只挪重活对的。少做或者慢做，减少并发数量，不做重活之类的」。本稿仍把 D1 列为待人定（§0.1、§18），§3.3 写「人没定之前代码不动」，§1.4 第 13、14 条、§3.3 末段、§11、§12、§15 R1 与图节点 `m6-reminder` 都保留「只给人看」一支。§18 的题用的是选项表、「是 → B；否 → A」与推荐放最后，这正是 `d-chat-not-cards` 停用的写法（文首 `design.md:9` 也还写「人的待决按 `d-option-card` 写成表」）。
2. 默认档是少做，本稿多处写默认没有任何因高峰而起的推迟：§0「只在人自己设了引用 `glm-peak` 的规则时才有」（`design.md:19`）；§1.6 把「任何默认的错峰排队规则」列为不做（`design.md:99`）；§3.1「M6 不设、不提议、不假定任何一条」（`design.md:126`）；§3.2「不让任何调用在高峰与非高峰得到不同的判定」（`design.md:145`）；§7.4「人没有自己设引用 `glm-peak` 的排队规则，就没有一次调用因高峰或额度被推迟」（`design.md:537`）；验收第 15 条「脚本自查同样放行，不告警」（`design.md:79`）；§16 给 `ORCHESTRATION.md` §11.4 的新写法「只在人设了规则时才有」（`design.md:752`）。按规则板 0.5，少做时附属条目 `builtin:glm-peak-reduce` 让自报 `glmSpend: 'optional'` 的脚本在高峰判为排队（`rules:310`），不做时 GLM 会话的工具调用也排队（`rules:311`）；规则板自己的验收第 1 条已经把「高峰与非高峰判定相同」限定在「高峰模式为无影响且没有人设的规则时」（`rules:93`）。照本稿写进 `ORCHESTRATION.md` 与测试，会把与人定相反的默认行为钉成文档与断言。
3. 分工没写。人定是「主 Agent 每一步都从 harness 的提醒里知道现在是不是高峰、人选的是哪一档」，「M6 只管提醒与高峰的计算」。规则板 0.5 把主 Agent 的那一行高峰状态与档位放在它的每步提醒里（`rules:303–321`、`rules:566–569`），GLM 主 Agent 同一步还会收到 GLM 包的高峰提醒（`rules:296`）。本稿没有提高峰模式，读者看不出「主 Agent 知道档位」由谁交付、M6 的提醒与它怎样并存。
4. 依据的规则板版本又旧了一版：本稿全文写规则板 0.4，现行是 0.5；0.5 §10.7 专门列了 M6 0.2 要改的几处（`rules:1271`）。M6 引用的小节号在 0.5 里没有变（§2.3、§2.5、§2.6、§3.1–§3.4、§5.6、§6.2–§6.5、§9.1、§9.3、§9.4、§10.1、§10.5、§11.2 逐个核过）。

改法：

- §18 改为「没有待人定的事项」，并记一行定案：D1 由人 2026-10-30 定为照旧提醒模型，另加高峰模式（`d-peak-mode`，上面两句原话）。§0.1 删去或只留这一行。文首 `design.md:9` 的「人的待决按 `d-option-card` 写成表」改为「问人按 `d-chat-not-cards`：一个方案，背景、推荐、疑问、不做四行；本稿没有待人定的事」。
- 删「只给人看」一支：第 13 条只留「高峰提醒照旧，正文逐字不变」与它的 L2、L3；第 14 条只留 `toldBy: 'glm-prompt'`、规则页那一行与 `rules_show` 那句「The GLM package's peak reminder tells you this.」，其余引规则板 0.5 验收第 1、2 条；删 §3.3 末段「只给人看」的实现、§15 的 R1 与图节点 `m6-reminder`、§11 那一行的「`scope === 'builtin'`」分句、§12 的 D1 一行；§13 的「默认规则对模型做什么」改为「人的原话在 `d-peak-mode`」；§8 两格「按 D1」改为「照旧提醒」。规则板 0.5 §10.7 也写了「`scope === 'builtin'` 不需要了」（`rules:1271`）。
- 把「默认不排队」改成按档位写：「M6 不加任何排队规则。高峰模式归规则板（0.5 §3.6，人定 `d-peak-mode`，默认少做）：少做时自报 `optional` 的脚本在高峰排队；不做时自报 `glmSpend` 的脚本与 GLM 会话的工具调用在高峰排队；无影响时只提醒」。§1.6 那一项改为「M6 不加任何排队规则，高峰模式的设置与执行归规则板」。验收第 15 条拆成三档：
  - 无影响、没有人设的规则：周三 15:00 与 19:00 同一组工具调用与两个脚本的自查判定相同，都放行。
  - 少做（默认）：DSH 里 agent 的工具调用两个时刻判定相同（0.5 §3.6：少做不判 agent 的调用）；`npm run calibrate` 的自查周三 15:00 退出码 5、19:00 退出码 0；`smoke:authorized` 按 F5 定的自报值。
  - 不做：两个脚本周三 15:00 都退出码 5。
  档位怎样存、默认值由谁落地，引规则板；规则板 0.5 文首与 §3.6 表里仍写「出厂暂定无影响」（`rules:3`、`rules:309`），与 `d-peak-mode` 的默认少做不一致，本稿引人定，不引 0.5 这一句。
- §3 加一小段分工：主 Agent 每步的高峰状态与档位一行是规则板的（0.5 §3.6、§6.4）；M6 交付 GLM 包的高峰提醒（不改）与高峰的计算（`peakWindowAt`、`nextPeakChange`、计价服务的 `peak`），规则板那一行的「到几点」「下一次几点」用的就是 M6 的 `nextPeakChange`。
- 文首、§3.2、§7.1 的依据改为规则板 0.5，并按 0.5 §10.7 逐条改；M6-R2 的时刻写法与 0.5 §6.4 里不做档已经写出的「until 18:00」用同一个渲染（`rules:1271` 末句）。§16 给 `ORCHESTRATION.md` §11.4 的新写法删去「只在人设了规则时才有」，改为「默认规则只告知；高峰模式按人选的档位，默认少做，见规则板」。

#### F5 MEDIUM（挡路：按本稿实现，少做与不做管不到练习题与消融，`d-peak-mode` 的「少做：不做重活，例如练习题、消融」对仓库脚本不成立；本稿写的库入口与规则板 0.5 冲突）

位置：§7.2 第 2 条 `design.md:481–488`；§1.4 第 16 条 `design.md:80`；§10 `design.md:600–616`；§14.1 脚本自查一条 `design.md:688`；§15 S2 `design.md:721`；§17 `design.md:761–783`。

问题：

- 本稿的 `checkCall(input)` 是一个对象参数，带 `peak?: (atMs) => boolean`、`dshHome`，并让 S2 在 R3 没导出时从 `cli.ts` 抽出、在 `checkCall` 里先筛主体（`design.md:482–483`）。规则板 0.5 定的是 `checkCall(call, options)`，宿主信号由调用方给布尔值 `signals: {'glm-peak': boolean}`，另有 `glmSpend?: 'optional' | 'necessary'`；R3 直接交付 `src/rules/check.ts`；主体没给即不命中，已在 `judge` 的输入里处理（`rules:1143–1180`、`rules:1195`、`rules:1203`、`rules:1271`）。
- 本稿的 `gateOnRules({peak, now?, sleep?, checkModule?})` 不传 `glmSpend`（`design.md:484`）。规则板 0.5：「不自报的脚本三档都不管」（`rules:320`）。所以少做与不做都不会让 `npm run calibrate`（标定与消融都经它，清点报告 §8）在高峰排队，人定里点名的两类重活落空。
- 规则板 0.5 把「花真网积分的冒烟自报 `optional` 还是 `necessary`」交给 M6 定（`rules:320`、`rules:1271`），本稿没有这一项。

改法：

- §7.2 第 2 条按 0.5 §9.4 重写：`gateOnRules({glmSpend, peakAt, now?, sleep?, checkModule?})`，`glmSpend` 由调用点写死；每次判定前算 `signals: {'glm-peak': peakAt(now)}`，再调用 `checkCall({tool: 'pwsh', args: {command}}, {project: <仓库根>, signals, glmSpend})`；`--wait` 之后的重判重新算 `signals`。删去「从 `cli.ts` 抽出」与「先筛主体」两条。`RulesCheckError` 与动态导入失败同样告警一行、照常开始。
- 调用点：`run-calibrate.mjs` 传 `glmSpend: 'optional'`、`peakAt: at => creditPricing.peak(at)`；`smoke-zcode-authorized.mjs` 传 `glmSpend: 'necessary'`。理由写进 §17（agent 决定，人可推翻）：真网冒烟是改了通道之后的一次一致性核对，积分少、结果挡后面的合入；不做档按 0.5 照样把它排队。
- 验收第 16 条之后加一条：档位为少做、注入时钟周三 15:00，`npm run calibrate` 在建沙盒与发任何请求之前退出码 5，标准错误写 `builtin:glm-peak-reduce`、设档位的人（`peakMode.origin`）与 18:00；`smoke:authorized` 照常开始；档位为不做时两者都退出码 5。`tests/rules-gate.spec.ts` 加 `glmSpend` 两种取值乘三档的用例。
- §10 加一行：`glmSpend` 只取 `'optional' | 'necessary'`，由调用点写死，不从命令行参数读。

#### F6 MEDIUM（挡路：人定 `d-zcode-3171` 要求引用的 3.16.3 包内事实对 3.17.1 复核，本稿没有；按 §15、§16 写进 `DESIGN.md` §4.8 与 `FACTS.md` §1 的证据会指向一个已经换成 3.17.1 的文件，事后查不到）

位置：文首 `design.md:5`、`7`、`9`（「ZCode 3.16.3 一致性」）；§4.1 `design.md:174–185`；§4.2 `design.md:193`、`209`；§9 网络表 `design.md:585–598`；§11 `design.md:631`；§14.3 V1、V2 `design.md:700–701`；§15 Q2 `design.md:714`（「`FACTS.md` §1 加 3.16.3 额度取数一行」）；§16 `design.md:749–750`。

问题：本稿的 `host:+偏移` 定义为「3.16.3 安装包 `app.asar` 里 `out/host/index.js`」（`design.md:7`），这个路径自 2026-10-29 21:04 起装的是 3.17.1；偏移、短名（`ZAe`、`Qo`、`Pl`、`QM`、`zM`、`YY`、`Wt`、`xi`）与 `chunk-5YNPFY3L.js` 在那份文件里都对不上。3.16.3 原包只在用户的备份 `app.asar.orig-3163.bak` 里，仓库 `reference/` 下的两份 `zcode.cjs` 不含额度代码。本轮逐项核过，行为没有变，只是名字、偏移与文件换了：

| 事实 | 3.16.3（`app.asar.orig-3163.bak`） | 3.17.1（`app.asar`） | 相同吗 |
| --- | --- | --- | --- |
| 地址常量 `"/api/monitor/usage/quota/limit"`、超时 `15e3` | `ZAe` +1280195，`Qo` +1280346 | `iOe` +1359354，`li` +1359505 | 相同 |
| `fetchQuota(t)`：`readApiJson(apiClient, buildQuotaLimitUrl(t), {method: "GET", timeoutMs, headers: createBigModelUsageHeaders(t)})` | +1292290（`Wt`、`nTe`、`Pl`） | +1371449（`Vt`、`vOe`、`Gl`） | 相同 |
| 头：只放 `authorization`，团队另加 `bigmodel-organization`、`bigmodel-project`；团队加 `?type=2` | `Pl` +1295698，`nTe` +1295914 | `Gl` +1374857，`vOe` +1375073 | 相同 |
| 凭证：`resolveAuthorization` 对账号套餐调 `resolveCurrent({providerId, accountAccess, reason: "usage"})` 取 `apiKey`；BigModel 账号的地址走 `buildBigModelQuotaUrl` | +1291434；`yTe` +1303348 → `eO` +1303587 | +1370593；`OOe` +1382507 → `e0` +1382746 | 相同 |
| `resolveCurrent`：start-plan 返回 `zcodeJwtToken`；`usage` 不核作用域；被拒指纹而没有 `expectedAccountScope` 时抛 `project_token_scope_invalidated` | +1200629 | +1278678 | 相同 |
| 成功判定 `success !== false` 且 `code` 为 `null`、`undefined`、`0`、`200` | `QM` +1296965 | `QD` +1376124 | 相同 |
| 行的解析（只留数字字段与 `usageDetails`）、主显示项先取 `TIME_LIMIT` | `zM` +1268239，`YY` +1268821 | `jD` +1347113，`JX` +1347695 | 相同 |
| 失败处理 | `.catch(() => null)` +1282726；快照路径 +1289406 | +1361885；+1368565 | 相同（见 N11） |
| `readApiJson`：`apiClient.request` 之后非 2xx 抛错，再解析 JSON | `Wt` +145440 | `Vt` +151499 | 相同 |
| 环境变量覆盖 `ZCODE_BIGMODEL_USAGE_QUOTA_URL`、`BIGMODEL_USAGE_QUOTA_URL` | `XM` +1303079 | `XD` +1382238 | 相同 |
| origin：`buildBigModelApiUrl` 用 `resolveBigModelApiOrigin`，生产值 `"https://bigmodel.cn"`，覆盖 `BIGMODEL_API_BASE_URL`、`BIGMODEL_PRODUCTION_API_BASE_URL` | `index.js` 的 `xi` 即 `chunk-5YNPFY3L.js` 的 `ia`（`G$` +584876、`K$` +584768、`D$` +582549） | `index.js` 的 `Zi` 即 `chunk-ZSDMP7DM.js` 的 `ma`（`LM` +594247、`NM` +594139、`PM` +591920） | 相同 |
| 读额度前的订阅核验、MCP 余额快照 | `ZM` +1270165、`/api/biz/subscription/list` +1270225；`fetchMcpQuotaSnapshot` +1280167 | `$D` +1349039、+1349099；+1359326 | 相同 |
| `1308`、`next_flush_time` | 0 处 | 0 处 | 相同 |
| 本地峰谷时段 | 没有（`isPeak`、`peakWindow`、`14:00` 为 0；`off-peak` 只作服务端排队协议） | 没有；多一个 `off-peak-ticket-expired` 标识 | 相同 |

改法：文首、§4.1、§9、§11、§14.3、§16 的基线写 3.17.1，偏移按上表 3.17.1 一栏；`host:+偏移` 的定义写明文件、大小与 MD5（`app.asar` 3.17.1，`out/host/index.js` 2,190,425 B，`3ef810e5878d5103bb4430df00181b09`），并注明安装版可能带用户补丁、只作机制参考（`AGENTS.md`；额度这几段与 3.16.3 原包逐项相同，看不出补丁）。3.16.3 的偏移只在需要对比时附在括号里，并指明 `app.asar.orig-3163.bak`。§15 Q2 的「`FACTS.md` §1 加 3.16.3 额度取数一行」改为 3.17.1。安装目录会随自动更新再变，建议编排方把 host 包导出一份到 `reference/`（同 `reference/dsh-desktop-0.2.1-rc.3/` 的做法）后再引用；这一步不做时，至少写明 MD5。

#### F7 MEDIUM（挡路：验收第 5 条把额度请求的头钉成「只有 `authorization`」，ZCode 实际还发 `x-request-id`；按本稿写测试会钉住一处与基线不同的请求形态，而本稿 §11 把它列为 `glm-house` 验收第 1 条的一部分）

位置：§1.4 第 5 条 `design.md:69`；§4.2 请求一条 `design.md:193`（「不加别的头」）；§9 网络表；§11 `design.md:631`；§14.3 V2 `design.md:701`；§16 `design.md:749`。

问题：额度请求走 host 的 `NodeApiClient.request`（3.17.1 +1645564；`BigModelUsageQuotaProvider` 由 `n0({apiClient: k})` 构造，+1895288，`k = createNodeApiClient(...)`）。它对每个请求执行 `withRequestIdHeader`：头里没有 `x-request-id` 时补一个（3.17.1 `lc` +1610148，`va = "x-request-id"` +1610129，值来自 `chunk-ZSDMP7DM.js` 的 `Ay`，即 `crypto.randomUUID()`；3.16.3 `Ga` +1508322，`sa = "x-request-id"` +1508303，`request` +1544561）。ZCode 的身份头只加给 ZCode 端点（`isRequestForEndpoint` `Cne` +1643061 比对 origin），`bigmodel.cn` 不加。所以 V2 现在可以关闭：没有身份头，但有 `x-request-id`。本稿 V2 的退路只考虑了身份头，没有覆盖这一个。

改法：§4.2 的请求改为 `headers: {authorization: <令牌原样>, 'x-request-id': randomUUID()}`，每次读取新生成；验收第 5 条改为「请求头恰好是 `authorization` 与 `x-request-id` 两个，后者是 UUID，两次读取不同」；V2 标为已关闭〔实读〕并写上面的偏移；§16 `DESIGN.md` §4.8 的已一致项写明这两个头。本仓库模型请求的 `x-request-id` 已按同一做法实现（`src/glm-llm/zcode.ts:436–438`、`DESIGN.md` §4.4），口径一致。

#### N11 NIT 　失败处理只写了一条路径

位置：§4.1 `design.md:183`；§4.4 `design.md:231`。

3.16.3 与 3.17.1 有两条读额度的路径：订阅核验之后的那条用 `this.fetchQuota(d).catch(() => null)`（3.17.1 +1361885）；本稿 §4.4 引的 `getCodingPlanUsageSnapshot`（3.17.1 +1368278）里 `this.fetchQuota(n)` 在 `Promise.all` 里没有 `catch`（+1368565），额度失败时整个快照抛错。两条都不重试、不重铸，所以本稿的取舍不变。改法：§4.1 写成「两条路径都不重试、不重铸：一条把失败读作没有额度，一条让整个用量快照失败」。

#### N12 NIT 　§17 的写法仍是编号选项

位置：§17 `design.md:761–783`。

`d-chat-not-cards` 要求写明替人定了什么、没选的做法一句话，不编号、不给字母。§17 每行是「1. … 2. …（采用）」。改法：每行写成「采用：……。没选：……，因为……。」，保持一行一件事。

#### N13 NIT 　`--wait` 与标准错误里的「下一个非高峰时刻」只对引用 `glm-peak` 的规则成立

位置：§7.2 第 2 条结果一条 `design.md:487`。

命中的规则若不引用 `glm-peak`（例如人设的「代码冻结时不跑标定」），或此刻不是高峰，`nextPeakChange(peak, now)` 返回的是下一次高峰开始的时刻：标准错误会把高峰开始写成「下一个非高峰时刻」，`--wait` 会睡到高峰开始再判。失败看得见（仍退出码 5），重跑即可，所以不挡路。改法：只在命中的规则或条目引用 `glm-peak`（含 `partOf: 'builtin:glm-peak-pricing'` 的档位条目）且此刻 `glm-peak` 为真时写时刻、按 `nextPeakChange` 睡；其余情形标准错误不写时刻，`--wait` 每 60 秒重判一次，至多 8 小时，每次重算 `signals`。

#### N14 NIT 　高峰提醒的正文与档位并存时的读法没有写

位置：§3.3 `design.md:163`；§1.4 第 13 条。

GLM 主 Agent 在少做档会在同一步收到 `PEAK_REMINDER_TEXT`（「…do not switch models or plans, or pause or postpone work, unless the user asks.」，`src/glm-prompt/peak-reminder.ts:25`）与规则板的「Peak mode set by the human: reduce. Move optional work … to after 18:00」（`rules:567`）；不做档的 GLM 子 agent 还会收到排队文字。人说的是「高峰继续提醒模型」，正文照旧是对的。改法：§3.3 写一句为什么不冲突（提醒的「unless the user asks」对应规则板文字里的「set by the human」，档位就是人的要求），并在 S3 的探针场景里加一次核对：少做档、周三 15:00，GLM 主 Agent 那一步的请求里两条 notice 都在。

#### N15 NIT 　「套餐的时段与系数只有一处」与规则板 0.5 的英文文字

位置：§11 `design.md:622`；§5 计价服务契约。

规则板 0.5 的文字里写死了「weekdays 14:00-18:00 UTC+8」（`rules:548`、`rules:566`、`rules:584`，默认规则的 `title` 同理，`rules:259`），这些文字在编排层包里。M6 管计价服务的契约，这条不变量由它写。改法（二选一，推荐前者）：`UsagePricing` 加一个可选成员 `peakHours?: string`（英文，`creditPricing` 给 `"weekdays 14:00-18:00 UTC+8"`），规则板渲染时读它、没有时省去括注；或把不变量改为「时段与系数的计算只有一处；给人与模型看的时段说明由规则板另写一份，改时段时两处一起改」。

### 已核实的假设（本轮）

- 3.17.1 的额度读取与 3.16.3 逐项相同（F6 的表）：地址、15 秒超时、头的构造、团队参数、凭证来源、`resolveCurrent` 对 `usage` 的处理与 start-plan 的套餐 JWT、成功判定、行的解析与主显示项、`readApiJson`、origin 与覆盖变量、订阅核验与 MCP 快照。Z.ai 套餐另走 `buildZaiQuotaUrl`（3.17.1 `PQ`），本包只接 BigModel，不涉及。
- 3.17.1 的 host 包与两份 `zcode.cjs` 都没有本地峰谷时段（与规则板 0.5 §10.6 的检索一致）；`1308`、`next_flush_time` 在两版 host 里都是 0 处，§4.6 是本项目加的展示。
- DSH rc.3：`ctx.provide` 归调用方 fiber、同名第二个提供方抛错、返回撤销函数（cordis:800–830）；`ctx.get` 对没有 tracker 的普通对象原样返回（cordis:763–765、cordis:84–90），计价服务多一个函数成员 `quota` 不会被包装；`Config` 经 `~standard` 校验，不合时抛 `ValidationError`（cordis:956–961）；命令处理函数的调用参数是 `{commandId, agent, rawInput, attachments, signal}`，结果经 `withAbort(…, signal)` 等待（commands:379–392）；`dsh-commands/lib/index.js` 里 `timeout`、`setTimeout` 为 0 处。
- 本仓库源码：`zcode.ts:46`（`BIGMODEL_API_ORIGIN`）、`:76`（`plan`）、`:240`（`projectToken`）、`:357`、`:466–470`；`project-token.ts:28–31`、`:171–190`（被拒指纹清缓存）、`:281`（换登录换一代缓存）；`login-row.ts:22–26`、`:43`、`:53–56`、`:65–67`；`glm-llm/index.ts:36`、`:42–44`、`:59`；`packages/glm/cordis.patch.yml` 的 `glm-login` 行 `config: {}`；`panel.ts:100`、`:186`；`morning-report.ts:98`；`peak-reminder.ts:25`。
- 规则板 0.5：等待单由拥有它的宿主每 5 秒重判（`rules:459`）；排队规则条件解除后 30 秒内唤醒（验收第 4 条，`rules:96`）；`checkCall` 与命令行不写文件、不取锁（`rules:1199`）；它采纳了 M6-R1、M6-R4，M6-R2、M6-R3 仍归 M6（`rules:301`）。

### 未核实或不成立的假设（本轮）

- 不成立：默认没有任何因高峰而起的推迟（F4）。
- 不成立：`checkCall(input)` 的签名、`peak` 函数入参与「S2 从 `cli.ts` 抽出」（F5）。
- 不成立：证据文件 `app.asar` 是 3.16.3（F6）。
- 不成立：额度请求的头只有 `authorization`（F7）。
- 不全：失败处理只有 `.catch(() => null)` 一条路径（N11）。
- 规则板 0.5 与人定不一致的一处，影响 F4 的写法：0.5 写「出厂暂定无影响、等人确认」（`rules:3`、`rules:309`），`d-peak-mode` 已定默认少做。
- 仍未核实（本稿已标，计划可行）：V3 行的含义与单位；V4 ultra 网关下 1308 的正文形状与时刻格式；V5 非高峰按半价计入额度；V6 客户端一侧对命令耗时的上限；3.17.1 有没有定时读额度（本轮没有查）；本机 3.17.1 安装版有没有用户补丁（额度几段与 3.16.3 原包相同，看不出）。

## 第 3 轮

被审：`.agents/tasks/m6/design.md` 0.3（167,801 字节，1,090 行，2026-10-30 02:54 写入，MD5 `3692a82333369896adcd05176eee18aa`）与 `.agents/tasks/m6/onepage.md`（4,222 字节，02:53）；0.2 原文在 `design-v0.2.md`。下文 `design.md:N` 指 0.3 的行号，`onepage:N` 指放行稿，`rules:N` 指规则板设计 `.agents/tasks/rules/design.md` 0.5（01:59 写入），`rules-review:N` 指 `.agents/tasks/rules/design-review.md`（0.5 第 1 轮）。规则板 0.6 由 `rules-design-v06-write`（wf_2f149988fcc89bb1）在写，本轮读的时候还没有落地，所以「两份设计谁管提醒原文」只能对 0.5 与它的评审核。

对照的人定与特性（项目图，`npm run -s graph -- show`）：`d-peak-mode`（正文与两条历史：2026-10-29T17:33:16Z「高峰继续提醒模型，但是加一个档位吧……」，17:45:14Z「默认少做，新手教程提醒用户就行了……」）；`d-defaults-readonly`（档位例外：「档位当然能选。」）；`d-rules-visible`；`d-chat-not-cards`（四行格式的批注到 17:27:49Z，M3 附录的落法 18:17:27Z）；`d-zcode-3171`；`d-design-onepage`；`metrics`（approved：「指标能全记就全记下」）；`schedules`；`.agents/tasks/design-context.md` 最新两节（Questions become conversation；Peak mode and clock facts）。挡路标准同前（`docs/DEVELOPMENT.md`:29）。

做法：只读。没有改代码、已跟踪文件、`docs/graph/` 与 `~/.dsh`，没有用桌面版，没有发额度请求；`C:\Program Files` 下只读。ZCode 包内的事实用经标准输入交给 node 的一次性读取核对（按 asar 头取文件，不落盘）。`.agents/tasks/m6/` 下的三个 `tmp-*.cjs` 本轮只读过 `tmp-asar-check.cjs` 的源码，没有运行、没有改动。

### 结论摘要

第 2 轮的 9 条都关了；F6、F7 的证据在 3.17.1 安装包里逐项对得上（名字、偏移、文件大小与 MD5）。0.3 新加的三块与人定一致：循环板上的 GLM 条目是 GLM 包交出的数据、只能看；登录被拒有判据、有留痕；GLM 包的四类指标事件只在指标服务在时交。档位、默认少做、主 Agent 每步的高峰一行都写明归规则板，提醒与高峰的计算归 M6。

挡路的有两处，都在 M6 与别的设计的接缝上：

- F8：高峰提醒原文、它的文件头注释与 `docs/ORCHESTRATION.md` §11.4 的「提醒只告知」一条由谁改，M6 0.3 与规则板 0.5 及其评审 F42、F45 各说各的；M6 给规则板的处理还只在草稿 `graph-ops-v03.json` 里，在写 0.6 的那一步没有收到。
- F9：仓库脚本自查的每次判定没有写入指标流水的一方。M6 依赖的 `rules.check` 事件由 `checkCall` 发出，而 `checkCall` 按规则板的定义不写任何文件，又跑在没有 DSH 服务的 node 进程里。

### 第 2 轮发现的复核

| # | 状态 | 依据 |
| --- | --- | --- |
| F4 | Closed | §20 写「没有。」并录人的两句原话（design.md:1050–1056）；全文没有 `d-option-card`、选项表与「是 →」；「只给人看」一支删净（design.md:685 的「额度与预估只给人看」说的是额度，另一回事）。默认按档位写：§0（design.md:39–40）、§1.6（design.md:137–151）、§3.3 分工表（design.md:192–207）、§7.4（design.md:681–686）、§12 不变量（design.md:833）、§17 给 §11.4 的新写法（design.md:993）。验收第 15 条拆成三档（design.md:117–121）。依据改为规则板 0.5；默认档引 `d-peak-mode`，不引 rules:309 的「暂定无影响」（design.md:8、196），并写明第 15 条依赖规则板评审 F42（design.md:1011） |
| F5 | Closed | `gateOnRules({glmSpend, peakAt, now?, sleep?, checkModule?, pricingModule?})`（design.md:623）；每次判定前现算 `signals`，调用 `checkCall({tool: 'pwsh', args: {command}}, {project, signals, glmSpend})`（design.md:626），与 rules:1135–1180 的签名和 rules:1203 的接法一致。M6 用 `creditPricing.peak`，rules:1203 写 `peakWindowAt(now) !== undefined`，两者等价（`src/glm-llm/credits.ts` 的 `peak` 就是这样定义的）。调用点 `optional`、`necessary`（design.md:631），理由在 §19（design.md:1037）；§11 一行（design.md:822）；验收第 15–17 条（design.md:117–123） |
| F6 | Closed | 证据写法写明 3.17.1 的文件、2,190,425 字节、MD5 与「安装版只作机制参考」（design.md:16–20）；§4.1 换成两版对照表（design.md:235–257）。本轮复读的偏移全部对得上（见下面「已核实」）。Q0 把 host 包导出到 `reference/zcode-3.17.1/host/`（design.md:951）；`reference/` 在 `.gitignore`:5 里（`git check-ignore` 命中），导出不碰已跟踪文件；该目录今天还不存在，符合「Q0 之后」的写法 |
| F7 | Closed | 请求头 `{authorization, 'x-request-id': randomUUID()}`（design.md:268）；验收第 5 条（design.md:107）；V2 关闭（design.md:937）；§10 网络表（design.md:795）。本轮另核：`NodeApiClient.request` 发请求前执行 `lc(A$e(s, n?.headers, o, …))`（host:+1645564 起第 438 个字符）；额度提供者的 `apiClient` 是 `k = _B({fetchImpl: …})`（host:+1869226），`_B` 即 `createNodeApiClient`（host:+1647283） |
| N11 | Closed | 两条路径都写了（design.md:253） |
| N12 | Closed | §19 每行「采用：……。没选：……，因为……。」（design.md:1024–1048） |
| N13 | Closed | 只在 `CheckResult.signals` 里 `glm-peak` 为真时写时刻，其余每 60 秒重判、至多 8 小时（design.md:628–629）；验收第 16 条加了不引用 `glm-peak` 的一例（design.md:122） |
| N14 | Closed（换了改法） | 没有照第 2 轮的「正文不动，写明为什么不冲突」，改用规则板评审 F45 的 (b)：末句去掉「不要暂停或推迟工作」（design.md:224–228）。理由站得住：规则板评审 F42 要求从没选过档位的项目在高峰一行写「the default」，不写「set by the human」，第 2 轮建议的「unless the user asks」对上「set by the human」在出厂档位下不成立。改提醒正文在 M6 的权限内（`d-peak-mode`：「M6 只管提醒与高峰的计算」），放行稿把它列为最没把握的一处（onepage:51）。探针核对照加（design.md:115、961）。这次改动带来的跨设计分工问题另记 F8 |
| N15 | Closed | `credits.ts` 导出 `PEAK_HOURS`（中英）与 `PEAK_END_LABEL`，提醒、`basis` 与计价服务的 `peakHours` 都取它（design.md:227、405、412）。核对：按模板拼出的 `basis` 与今天 `creditPricing.basis` 逐字相同；提醒正文末句之前的部分与 `PEAK_REMINDER_TEXT`（`src/glm-prompt/peak-reminder.ts`:28）逐字相同，正文少 66 个字符（设计写「约 60」） |

### 对人定方向的核对

| 方向 | 结论 |
| --- | --- |
| `d-peak-mode`：高峰继续提醒模型 | 满足：提醒照旧在每段高峰的第一个 GLM 步发出，只改末句（design.md:224–227）；`toldBy: 'glm-prompt'` 保留（design.md:188） |
| `d-peak-mode`：三档、默认少做 | 满足：档位不在 M6；M6 的验收按三档写，默认档引人定（design.md:119） |
| `d-peak-mode`：新手教程告诉人 | 归上手页与规则页（design.md:150、200），M6 不写；放行稿写明交给别的模块（onepage:41） |
| `d-peak-mode`：主 Agent 始终知道是不是高峰、哪一档 | 归规则板（design.md:198、207）；M6 交 `nextPeakChange` 与 `peakHours`，保证四处写出同样的「到几点」（验收第 14 条）。满足 |
| `d-peak-mode`：设置归规则板设计 | 满足（design.md:196） |
| `d-peak-mode`：提醒归 M6，两份设计说法一致 | 不一致，F8 |
| `d-defaults-readonly` | 满足：GLM 的四条条目冻结、只读列出（design.md:709–720，M6-L1 design.md:732）；档位例外照人定 |
| `d-rules-visible` 与循环板 | 满足：高峰开始提醒、看状态读额度、额度快用完、登录失效四条是 GLM 包交出的条目数据（design.md:713–716），不写进编排层代码；高峰开始与结束「按档位收放活」交规则板与循环板（design.md:722–726，M6-R5 design.md:1013）。这些要求还没上图，见 N21 |
| `d-chat-not-cards` | 满足：没有要问人的题（design.md:1050–1056）；放行稿末尾一件按四行写，每行一处加粗，问话在最后（onepage:45–55） |
| `d-zcode-3171` | 满足（F6、F7） |
| `metrics` | GLM 包的四类事件满足（design.md:908–913）；脚本自查的判定没有写入方，F9 |
| `d-design-onepage` | 有一页，写了会看到什么、自己会做什么、什么时候问、替人定了什么；两句措辞与设计不符，N19 |

### 发现

#### F8 MEDIUM（挡路：`d-peak-mode` 定「M6 管提醒」，本轮要求核对的「两份设计谁管提醒原文」不一致；按现状实施，两份设计会改同一处文字，规则板的那一行可能引用一句已删掉的原文，没有测试能发现）

位置：design.md:201（§3.3「GLM 会话的高峰提醒」一行）、224–228（§3.4 改末句、重写 `peak-reminder.ts` 第 5–7 行的注释与 `ORCHESTRATION.md` §11.4）、953（§16 R1）、978（§16 要串行的）、993–994（§17 的两行 §11.4）、1012（§18「规则板评审 F45」一行）；`graph-ops-v03.json` 给 `rules` 的批注。

问题：

1. 规则板一侧对同一处文字的说法与 M6 0.3 相反或重叠：
   - rules:296「两者内容不同，GLM 主 Agent 两样都收到」；rules:1267「高峰模式不要 GLM 包改任何东西」。
   - rules-review:299，F45 (a)：规则板的高峰一行在少做、不做两档末尾加一句，引用 GLM 提醒的原文「keep working, do not postpone」。M6 R1 删掉的正是这半句。
   - rules-review:301，F45：「R4 的文档改动写明：`docs/ORCHESTRATION.md`:1074 与 `peak-reminder.ts` 第 5–6 行的注释随 (b) 整条重写」。rules-review:256，F42：R4 重写 `ORCHESTRATION.md` 第 1074 行（「提醒只告知……不推迟任何工作」）与第 1076 行（排期一条）。
   - M6 0.3 把 1074 行、提醒正文（1071 行）与 `peak-reminder.ts` 的注释都放进自己的 R1（design.md:228、953、993），只把 1076 行留给规则板 R4（design.md:994、978）。§18 的 F45 一行（design.md:1012）只说「(a) 那一句引用的原文随之不存在，规则板不必再加」，没有说 F45、F42 分给规则板 R4 的那两处改由 M6 R1 做。
2. M6 的这些处理没有到达在写的 0.6。`rules` 节点的历史停在 2026-10-29T18:24:03Z（派出 `rules-design-v06-write`），M6 0.3 写于 18:55Z；`graph-ops-v03.json` 里给 `rules` 的那条批注没有上图。0.6 的写稿方手里只有 0.5 的评审，照 F45 写就会做 (a)，并在 R4 里改 GLM 包的文件。
3. 后果：两个步改同一行文档与同一个 GLM 包文件；或者 R1 合入之后，模型在同一步里收到「the human's peak setting takes precedence over the GLM peak reminder's "keep working, do not postpone"」，而它收到的提醒里没有这句话。M6 验收第 13 条只断言提醒里没有 `postpone`，规则板 R4 的用例会断言它那一行带着引文，两边都过，矛盾留在产品里。

改法（M6 一侧，具体）：

- §18 的「规则板评审 F45」一行改为：「M6 采用 (b)。由 M6 R1 改、规则板不改的：`PEAK_REMINDER_TEXT`；`src/glm-prompt/peak-reminder.ts` 的文件头注释（第 1–7 行）；`docs/ORCHESTRATION.md` §11.4 的提醒原文（1070–1072 行）与「提醒只告知」一条（1074 行）。规则板 R4 只重写排期一条（1076 行）。规则板的高峰一行不引用、不复述 GLM 提醒的措辞，也不加 (a) 那一句：档位要模型做什么只由那一行说，它是同一步里唯一说推迟的文字。规则板 0.5 的 rules:296、rules:1267 两句随之改写。」
- §16「要串行的」一条写明顺序：R1 先于规则板 R4 对 §11.4 的改动合入（或反过来，二选一写死），两步都在提交信息里写对方的步号。
- 验收第 13 条的 L3 部分（两条 notice 并存）加一句断言：来源 `hourness-rules` 的 notice 里没有 `keep working`、`postpone` 与 `PEAK_REMINDER_TEXT` 的任何一句；来源 `glm-peak-reminder` 的 notice 等于新的 `PEAK_REMINDER_TEXT`。这样两份设计各自的用例之外，有一处同时看两段文字。
- `graph-ops-v03.json` 给 `rules` 的批注按上面这段改写，在规则板 0.6 的评审之前由编排方上图；§18 写明这是 M6 一侧的前提。

#### F9 MEDIUM（挡路：`metrics` 已批「每个数由 harness 写」，脚本自查判为排队或拦截的次数没有写入方；M6-R7 与「高峰少做做得怎样」的复盘都靠这个数）

位置：design.md:634（§7.2「看得见」：「并随每次判定进规则板的 `rules.check` 指标事件」）、899（§14.1：「事件由规则板定谁写」）、1015（M6-R7 读 `rules.check` 事件）、1017（§18 给指标流水的一行只列 GLM 包的四类事件）；§1.4 第 22 条。

问题：

- 规则板把 `rules.check` 定为「每一次 `checkCall`」发出（rules:1260），出口 `emitMetric` 在指标接口到位之前什么都不做（rules:1247）；同一份设计又规定 `checkCall`「只读文件，不写任何文件，不取锁」（rules:1135、1199）。
- `gateOnRules` 与 `checkCall` 跑在 `npm run calibrate`、`npm run smoke:authorized` 的 node 进程里，那里没有 cordis 上下文，也就没有指标服务。M6 §14.2 的「`ctx.get(<指标服务名>)` 有值时交」在这里不适用。
- 于是高峰里有多少次练习题、对照实验与真网冒烟被排队或拦截，只出现在一次性的标准错误里，指标流水里一条也没有。M6 把写入方留给规则板（design.md:899），规则板的定义又让它写不出来，两边都没有写入方。M6-R7 要列「最近 7 天自报过的命令与自报值」，没有数据可读。

改法：

- 写入方定为 `gateOnRules`（M6 的代码，跑在脚本进程里），`checkCall` 保持只读。每次判定之后（含 `--wait` 期间的每次重判与最后的放行），交一条事件，字段：npm 脚本名或脚本相对路径（不含参数）、`glmSpend`、`effect`、退出码、命中的规则 id、`peakMode`、`glm-peak` 的来源、本次等了多少毫秒；不含命令参数、令牌与环境变量。事件名与信封由指标设计定（例：`rules.script-gate`）。
- 写入途径：§18 给指标流水的一行加一条要求：「提供在 DSH 之外可用的追加入口（库函数，按项目目录追加一行），给 `gateOnRules` 这类脚本进程用」。入口导入失败或不存在时什么都不交、不告警，判定照常（同 §14.2 的降级）。
- §14.1 那一行改为「`gateOnRules` 写；指标入口到位之前只有标准错误」；§7.2「看得见」与 M6-R7 改为读这条事件。
- 验收第 22 条加一例：注入一个假的指标追加入口，档位少做、注入时钟周三 15:00，`npm run calibrate` 交出恰好一条事件，`effect` 为 `queue`、`glmSpend` 为 `optional`、退出码 5，事件里没有命令参数；入口不存在时退出码与标准错误不变。

#### N16 NIT　登录状态的两处判据与凭证文件的真实写法不符

位置：design.md:390（§4.9「状态」）、§11 凭证文件元数据一行、§13 登录被拒误判一行。

- `/glm-logout` 调 `clearCredential`，它把 `credentials.json` 写成空串而不删文件（`src/glm-llm/auth/store.ts`:183–190）。按「文件不存在为 `absent`」，登出之后状态是 `ok`（凭证文件比任何被拒记录都新）。
- 凭证文件在没有重新登录时也会被重写：项目令牌的位置记录经 `updateStoredCredential` 写回同一个文件（`src/glm-llm/zcode.ts`:219–224；`project-token.ts`:304 的 `save`、:322 的 `delete`）。重写之后修改时刻晚于被拒记录，状态回到 `ok`，循环板这一期的提醒就不会再发。漏报时人仍会在请求失败里看到，所以不挡路。

改法：`stat` 抛 `ENOENT` 或文件大小为 0 都算 `absent`；§13 加一行「凭证文件因项目位置记录被重写，被拒状态提前回到 `ok`：人至多少看到一句提醒，下一次模型请求被拒时 10 分钟后再记」，或者让 `login-rejected` 记录带登录令牌的指纹（只存哈希），`read: false` 时比较凭证记录里同一个指纹而不比修改时刻。

#### N17 NIT　验收第 15 条要的「档位的来源」在 `CheckResult` 里没有

位置：design.md:119（「标准错误有 `builtin:glm-peak-reduce`、档位的来源（出厂默认，或谁在何时设的；取自规则板的排队文字）与「18:00」」）。

`CheckResult` 只带 `peakMode: PeakLevel`（rules:1173），没有来源；规则板 0.5 只写了不做档的排队文字（rules:§6.4），少做档附属条目的排队文字没有写（`glm-peak-reduce` 在 rules 里只出现于第 234、310 行）。按现状，这一断言取决于规则板 0.6 怎么写那段文字。改法：§18 加一条给规则板的要求（`CheckResult` 加 `peakModeOrigin`，或少做与不做两档的排队文字照规则板评审 F42 的高峰一行写出「the default」或「set by the human at …」）；规则板没交付之前，第 15 条只断言规则 id 与「18:00」。

#### N18 NIT　新末句前半的「for your information only」仍可读成「不用改做法」

位置：design.md:225–226（新末句与理由）、§1.4 第 13 条。

少做与不做档里，同一步有规则板那一行叫模型挪活或停下，GLM 提醒的新末句仍以「This is for your information only:」开头，模型可能把它读成「高峰与我的做法无关」。另外「只装 GLM 包时……模型照常做，与今天相同」（design.md:226）是推断：去掉「keep working」之后模型会不会自己推迟，没有观测。改法：末句写成「This is pricing information; do not switch models or plans unless the user asks.」之类不带「only」的说法（验收第 13 条的断言随之改）；design.md:226 那半句标〔推断〕，S3 或之后的会话检查（同 §3.4 的方法）补一次只装 GLM 包时高峰里助手文字的统计。

#### N19 NIT　放行稿两句把脚本的排队说成会自己接着跑

位置：onepage:3（「高峰时练习题会自己往后排」）、onepage:18（「选了不做：练习题和真网核对都等到高峰结束」）；onepage:22（「指标流水」）。

设计里仓库脚本没有等待单，也没有谁去唤醒它，不带 `--wait` 时就是退出码 5，要人或 agent 再跑（design.md:633）。放行稿第 17 行写对了，第 3、18 行会让人以为到点自动接着跑。另外「指标流水」是内部叫法（`d-plain-questions`）。改法：第 3 行改为「高峰时练习题会先停下，说明 18 点以后再跑」；第 18 行改为「选了不做：练习题和真网核对都先停下，18 点以后再跑（加 `--wait` 就自己等）」；第 22 行的「记进指标流水」改为「由系统自己记下来」。

#### N20 NIT　依据的提交与图操作草稿的写法不准

位置：design.md:7、981。

- design.md:7 说 `c17ff5d`、`61be79a` 在 `eb614ab` 与 `4e26f79` 之间。`git merge-base --is-ancestor` 显示这两个提交不是 `4e26f79` 的祖先；它们经 `823795a` 在 `4e26f79` 之后进 main（当前 main `16d6c2c`）。结论不受影响：`4e26f79..16d6c2c` 改了 `src/glm-prompt/index.ts`、`src/guard/rules.ts`、`scripts/check-verbatim.mjs`、`scripts/reference-dir.mjs` 与 4 个测试，本稿列的文件都没动；但 §14.2 的 `glm.peak-reminder` 事件要在 `glm-prompt` 行里接线，多半碰到这次改过的 `src/glm-prompt/index.ts`。改法：依据写 `16d6c2c`，那一句改成「`c17ff5d`、`61be79a` 在 `4e26f79` 之后经 `823795a` 合入」，§16 R1 或 Q2 的文件列表写明 `glm.peak-reminder` 的接线文件。
- design.md:981 说建议的图节点「草稿见 `graph-ops-v03.json`」，那份文件只有 4 条批注，没有建节点的操作。改法：删去这半句，或写「放行后由编排方按本表建」。

#### N21 NIT　给循环板、指标流水与规则板的要求还没上图

位置：design.md:1003–1018（§18）、`graph-ops-v03.json`。

`schedules` 节点的历史停在 2026-10-29T18:06:56Z，`metrics` 停在 16:43:48Z，`rules` 停在 18:24:03Z，都早于 M6 0.3（18:55Z）；草稿里给这三个节点的批注都没有上图。循环板与指标流水的设计正在写（`schedules-design`、`metrics-design`），按现状看不到 M6-L1 到 M6-L5、M6-R5 和四类事件。M6 自己的设计不受影响（条目数据由 GLM 包交出，读的一方没有时降级），所以不挡路；F8 里给 `rules` 的那条除外。改法：编排方在这两份设计的评审之前执行 `graph-ops-v03.json`（`rules` 那条按 F8 改写后）；§18 加一句「本表各条以项目图上对应节点的批注为准」。

### 已核实的假设（本轮）

- ZCode 3.17.1 安装包 `C:\Program Files\ZCode\resources\app.asar`（2026-10-29 21:04 写入，包内 `package.json` 版本 3.17.1）：`out/host/index.js` 2,190,425 字节，MD5 `3ef810e5878d5103bb4430df00181b09`；host 目录有 `chunk-ZSDMP7DM.js`，没有 `chunk-5YNPFY3L.js`。
- 3.17.1 host 偏移逐个读到设计写的内容：`"BigModelUsageQuotaProvider"` +1360141；`iOe="/api/monitor/usage/quota/limit"` +1359354；`li=15e3` +1359505；`fetchQuota` 为 `Vt(this.apiClient, vOe(t), {method: "GET", timeoutMs: li, headers: Gl(t)})` +1371449；`Gl` 只放 `authorization`、团队另加两头 +1374857；`request` +1645564；`A$e` 即 `resolveRequestHeaders` +1643371；`Cne` 即 `isRequestForEndpoint` +1643061；`lc` 即 `withRequestIdHeader` +1610148，`va="x-request-id"` +1610129；`n0({apiClient: k, …})` +1895288，`k=_B({fetchImpl: …})` +1869226，`_B` 即 `createNodeApiClient` +1647283；`resolveAuthorization` +1370593；`OOe` +1382507；`e0` 即 `buildBigModelQuotaUrl` +1382746；`resolveCurrent` +1278678；`QD` +1376124（名字 +1376206）；`jD` +1347113；`JX` +1347695；`Vt` 非 2xx 抛 `Sn` +151499；`XD` +1382238；`fetchQuota(d).catch(() => null)` +1361885；`getCodingPlanUsageSnapshot` +1368278，其中 `this.fetchQuota(n)` 不带 `catch` +1368565；`$D` 改路径为 `/api/biz/subscription/list` +1349039。`1308`、`next_flush_time` 0 处，`"x-request-id"` 14 处。
- `chunk-ZSDMP7DM.js`：+594247 是 `LM` 的名字标记 `buildBigModelApiUrl`，+594139 是 `NM` 的 `resolveBigModelApiOrigin`，+591920 是 `"https://bigmodel.cn"`（偏移指向名字标记，作定位用足够）。
- `out/renderer/assets/styles-C9n_FfEX.js`：`kYn` 在 `now - lastUpdatedAt >= 6e4` 时才重读 +6189443；前后各 6000 个字符里没有 `setInterval`、`setTimeout`；整个文件里 `getCodingPlanUsageSnapshot` 只出现 1 次；`codingPlanUsageRemaining` +3192662。V7 的「别处有没有定时读」仍按设计标为未核实。
- 3.16.3 备份 `app.asar.orig-3163.bak`（包内版本 3.16.3）：`out/host/index.js` 2,074,639 字节，MD5 `cbf4b599745c46530befe965eb0f2da3`；+1280982、+1280199、+1292290、+1295698、+1297047、+1289119、+1508322、+1508303、+1544561、+1542142 读到设计写的内容。
- `reference/zcode-3.17.1/` 下只有 `zcode.cjs`（15,405,921 字节），其中 `/api/monitor/usage/quota/limit` 与 `BigModelUsageQuotaProvider` 都是 0 处，所以额度事实只能从安装包读，Q0 的导出有必要；`reference/` 被 `.gitignore`:5 忽略。
- DSH rc.3：`ctx.provide` 同名第二个提供方抛错、返回撤销函数（cordis:800–823）；`ctx.get` 经 `getTraceable`，普通对象没有 tracker 时原样返回（cordis:762–764、84–90）；`resolveConfig` 按 `Config["~standard"]` 校验、不合抛 `ValidationError`（cordis:955–961）；命令调用参数 `{commandId, agent, rawInput, attachments, signal}`，结果经 `withAbort` 等待（dsh-commands:379–389），该文件里 `timeout`、`setTimeout` 0 处。
- 本仓库：`creditPricing.peak` 为 `peakWindowAt(atMs) !== undefined`，`basis` 原文与设计的模板拼出的一致（`src/glm-llm/credits.ts`）；`PEAK_REMINDER_TEXT` 与文件头注释（`peak-reminder.ts`:1–7、28）；`pricingService` 只查四个成员（`src/shared/pricing.ts`）；`glm-login` 构造适配器只传 `home`、`fetchImpl`（`login-row.ts`）；`zcode.ts`:46、240、357、437、455–469；`project-token.ts`:28–31、80、107–112、276、281、330–332；`clearCredential` 写空串（`store.ts`:183–190）；`run-calibrate.mjs`:27 导入编译产物、:30 模块顶层 `requireDesktop`、:42 `parseArgs`，`gateOnRules` 放在第 30 行之前可行；`smoke-zcode-authorized.mjs` 从 `../src/` 导入；`packages/hourness/dist/shared/pricing.js` 存在（公共库随编排层包编译）；`ORCHESTRATION.md`:1071 提醒原文、:1074「提醒只告知」、:1076 排期一条。
- 规则板 0.5：`checkCall` 的签名与 `CheckOptions.signals`、`glmSpend`（rules:1135–1180）；仓库脚本只受没有 `subjects` 的规则与 `glm-spend` 一类管（rules:1193–1197）；M6-R3 的接法（rules:1203）；「不自报的脚本三档都不管」（rules:320）；少做附属条目只管自报 `optional` 的脚本（rules:310）；没有 `peakMode` 字段时为 `inform`（rules:322，F42 要改）。
- 图：`d-peak-mode`、`d-defaults-readonly`、`d-rules-visible`、`d-chat-not-cards`、`d-zcode-3171`、`metrics`、`schedules`、`d-design-onepage` 的正文与历史如上文所引；`rules`、`schedules`、`metrics` 节点的最新历史早于 M6 0.3。

### 未核实或不成立的假设（本轮）

- 不成立：M6 与规则板对提醒原文、注释与 §11.4 由谁改说法一致（F8）。
- 不成立：脚本自查的判定会经 `rules.check` 进指标流水（F9）。
- 不成立：凭证文件不存在才算没登录、凭证文件被重写就是重新登录（N16）。
- 不成立：`CheckResult` 带档位来源（N17）。
- 不成立：`c17ff5d`、`61be79a` 在 `4e26f79` 之内；`graph-ops-v03.json` 带建节点的草稿（N20）。
- 推断：去掉「keep working」之后，只装 GLM 包时模型在高峰里照常做（N18）。
- 没法核：规则板 0.6、循环板设计与指标流水设计都还没有成稿，M6 对它们的要求要等它们落地后再核。
- 仍未核实（本稿已标，计划可行）：V3 行的含义与单位；V4 ultra 网关下 1308 的正文形状与时刻格式；V5 非高峰按半价计入额度；V6 客户端一侧对命令耗时的上限；V7 3.17.1 renderer 别处有没有定时读额度；V8 登录被拒的判据是否够用。

### 结论

HIGH 0、MEDIUM 2（F8、F9）、NIT 6（N16–N21）。按规则：CHANGES_REQUESTED。挡路的数从上一轮的 4 降到 2。两条都只改 M6 的 §7.2、§14.1、§16、§18 与验收第 13、22 条，F8 另要编排方在规则板 0.6 评审之前把改写后的批注上图。项目图的记录由编排方做，本步按简报不写 `docs/graph/`。

## 第 5 轮

被审：`.agents/tasks/m6/design.md` 0.5（256,195 字节，1,281 行，2026-10-31 03:43 写入，MD5 `BF1CEEEB68E327D253DF9F0255C5A8F4`）。这一稿是对齐轮 `align-rounds-2026-10-30` 的 C 支在一次被额度上限（Overage limit reached）截断的运行之后续写完成的，不是第 4 轮评审的回应；第 4 轮那一行在轮次表里没有正文（见上面的说明）。`onepage.md`（5,340 字节）还写在 0.4 上，按简报要等本轮通过之后重写，本轮只记它与 0.5 不符的几处（N27）。下文 `design.md:N` 指 0.5 的行号，`onepage:N` 指放行稿，`rules:N`、`m7:N` 指对应设计文件的行号，`orch:N` 指 `docs/ORCHESTRATION.md`。

对照：`.agents/tasks/design-context.md` 全文，最新的几节（Main agent and peak; stale entries; hook seam、Worked examples for the agent、Check entries seam、Dogfood implementation order and runtime paths、Rules thin slice: orchestrator rulings）逐条对过；已放行的四份设计：规则板 `.agents/tasks/rules/design.md` 0.10（2,667 行）、循环板 `.agents/tasks/schedules/design.md` 0.6、M3 `.agents/tasks/m3/design-addendum.md` 0.5、M7 `.agents/tasks/m7/design.md` 0.6；`docs/CHARTER.md` 0.7；项目图节点 `m6`（25 条历史，读到 2026-10-30T11:58Z 的最小一片批注）、`d-main-agent-peak-exempt`、`d-zcode-3171`（`node .agents/tasks/m1-l4/show-nodes.mjs` 与 `scripts/graph/cli.ts show`）；main 上的 `src/shared/peak-mode.ts`、`src/shared/pricing.ts`、`src/rules/{peak,engine,index}.ts`、`src/glm-prompt/{peak-reminder,index}.ts`、`src/glm-llm/{zcode,auth/store,auth/project-token}.ts`、`scripts/probe/run-probe.mjs`、`scripts/calibrate/run-calibrate.mjs`、`packages/hourness/cordis.patch.yml`、`docs/ORCHESTRATION.md` §11.4、§16。挡路标准同前（`docs/DEVELOPMENT.md` §1.1）。

做法：只读。没有改 `design.md`、`onepage.md` 与任何已跟踪文件，没有写 `docs/graph/`，没有提交、没有推送，没有重跑作者的任何步骤。用到的命令：`git cat-file`、`git merge-base --is-ancestor`、`git log`、`git diff --stat`、`git show <提交>:<文件>`；`Get-FileHash`；对文件的逐行比较与正则搜索；图的 `show`；以及作者留下的 `tmp-asar-check.cjs` 的 `info` 模式一次（读安装包头与 `index.js` 的大小和 MD5，不写任何东西）。读到的 main 在评审时是 `e57e744`，比 0.5 的依据 `419b6ea` 多 M7 的 E3 跟进提交；`git diff --stat 419b6ea HEAD` 只有 `src/data/lock.ts`、`src/execute/gate-lock.ts`、`src/execute/git.ts` 与 `docs/ORCHESTRATION.md` 的 M7 一节（第 1258–1277 行），M6 读的文件一个没动，所以 0.5 的依据仍然成立。

### 结论摘要

0.5 站得住。HIGH 0、MEDIUM 0、NIT 8，判 APPROVED。

- 断点续写：0.4 原文齐全（`design-v0.4.md` 211,569 字节，MD5 与 0.5 写的一致；`design-v0.3.md` 的 MD5 与第 3 轮评审记的一致），0.5 没有残片（见下表）。变更记录写了盘上稿里找到什么、怎样处理，五项里四项我能独立核到；第 2 项（盘上稿与 0.4 只差三处）因为盘上稿已被覆盖、没有副本，只能按记录采信，结果与记录相符（N29）。
- `d-main-agent-peak-exempt`：不做档的提醒正文不叫主 Agent 停下、等待或不回话，写明「主 Agent 不被管」；少做档只让主 Agent 挪可挪的重活、数 GLM 子 agent 的并发；各档正文与规则板 0.10 给主 Agent 的那一行说的是同一件事。0.4 里「不做档拦 GLM 会话的工具调用」的说法在 0.5 里只剩被明确标为作废的三处引用。
- `src/shared/peak-mode.ts` 的实际形状（`PeakModeState` 的 `level`、`origin`、`at`、`peak`、`until`、`glmWorkerCap`，`glmWorkerCap` 只在 `peak === true` 且档位为少做时有，`peakModeService` 读不到时回 `undefined`、形状不对时回调 `problem`）与 0.5 读的四项逐一对上；规则行在补丁里仍是 `disabled: true`；`nextPeakChange` 已在 `src/shared/pricing.ts`。
- `d-zcode-3171`：安装包仍是 3.17.1，`app.asar` 374,627,566 字节、`index.js` 2,190,425 字节、MD5 `3ef810e5878d5103bb4430df00181b09`，pristine 副本 `reference/zcode-3.17.1/zcode.cjs` MD5 `331AB13D0CB2E9504EA25420FF9AE663`、15,405,921 字节，额度端点、`BigModelUsageQuotaProvider`、`14:00`、`18:00`、`peak hours`、`Peak hours` 都是 0 处，与 §4.1 的 0.5 重核一句一致。
- 8 条 NIT 都不改变验收条件、不涉及不可逆损失、也不影响事后追因，主要是引用的行号过时（N22）、实施先后写了两种（N23）、两处测试描述与行为有出入（N24、N26）、改档位的路径漏了对话一条（N25）、以及放行稿与脚本草稿两件还没交的东西（N27、N28）。

### 断点续写的核对

| # | 变更记录（§21「0.5：盘上稿的处理」）写的 | 我核到的 | 结果 |
| --- | --- | --- | --- |
| 1 | 0.4 的副本 `design-v0.4.md` 211,569 字节、MD5 `1EA411E5DF326BFAD5C45A951C09AB55`；`design-v0.3.md` 的 MD5 `3692a823…` | `Get-FileHash`：`design-v0.4.md` 211,569 字节、`1EA411E5DF326BFAD5C45A951C09AB55`；`design-v0.3.md` 167,801 字节、`3692A82333369896ADCD05176EEE18AA`，与第 3 轮评审记的相同；`design-v0.2.md` 120,419 字节在 | 属实 |
| 2 | 盘上稿与 0.4 只差三处（版本行、新加的「代码（0.5）」依据、旧「代码」依据改名） | 盘上稿已被 0.5 覆盖，目录里没有它的副本，这一条不能重现。可核的是结果：以行内容为键逐行比较，0.5 的 1,281 行里 194 行在 0.4 里没有一模一样的行，其余 1,087 行与 0.4 相同；这 194 行我用改动位置列表对过，都落在变更记录「对齐表」A1 至 E1 与「盘上稿的处理」第 3 条列的小节里 | 按记录采信，结果与记录相符（N29） |
| 3 | 盘上稿的依据写 main `06219c6`，并把 `9c346fb` 算在 `480e264..06219c6` 里，实际 `9c346fb` 不是 `06219c6` 的祖先；HEAD 是 `419b6ea`，`06219c6` 之后碰代码的只有 `9c346fb` | `git merge-base --is-ancestor 9c346fb 06219c6` 退出码 1；`06219c6` 是 `419b6ea` 的祖先；`git log 06219c6..419b6ea -- src scripts packages tests` 只有 `9c346fb` | 属实 |
| 4 | `design-review.md` 轮次表有「第 4 轮、0.4、0/0/5」一行而正文没有这一轮；`design-review.json` 也止于第 3 轮 | 属实：md 的正文止于第 3 轮「结论」，json 的 `round` 为 3。本轮已在表下加说明并把第 4 行记为无结论 | 属实，已处理 |
| 5 | 三个 `tmp-*.cjs`、各轮 `graph-ops-*.json`、`onepage.md` 都没动；`graph-ops-v04.json` 给 `metrics` 的一条已过时 | 三个脚本与各 `graph-ops-*.json` 的修改时刻都早于 0.5；`onepage.md` 修改时刻 2026-10-30 13:28，内容仍是 0.4；`graph-ops-v04.json` 里「按 `userDataHome()` 与项目键」一句与 `d-rules-in-repo` 冲突，0.5 §21 与文首都写了作废 | 属实 |

「没有半截的节」的核对：全文 24 个代码围栏成对；所有表的每一行竖线数与表头相同（0 行不一致）；没有 TODO、待补、省略号结尾的行；§0 到 §21 的标题齐全，§21 的末尾是「0.5：给其他设计的请求与没做完的」表的最后一行（6 行），文件在表的最后一行结束；版本行里说的「§21 末尾的『0.5』三张表」（盘上稿、对齐表、给其他设计的请求）三张都在；§21 第 1247 行写的「两张表」是在转述盘上稿旧版本行的话，不是漏改。验收新加第 24、25 条都在 §1.4 里，条文完整。

### 第 3 轮发现的复核

第 4 轮没有正文，所以第 3 轮的 8 条在这里重新复核，不采信「8 条全部关闭」那一行。

| # | 状态 | 依据 |
| --- | --- | --- |
| F8 | Closed | 提醒原文、各档措辞、`peak-reminder.ts` 的文件头注释与 `orch` §11.4 整节归 M6 R1（`design.md:1106`、§3.4）；规则板 0.10 §10.6（rules:1815）与 §10.7 M6 第 1、2 条（rules:1859–1860）写的是同一分法，并说「规则板的任何一步都不改 GLM 包的文件与 §11.4 的任何一行」；`orch` §16 末句（`orch:1171`）已写「发给模型的高峰提醒与它在各档下的措辞见 §11.4（GLM 通道包），规则板不碰」。验收第 13 条的 L3 两段一起看在（`design.md:136`）。先后规则另记 N23 |
| F9 | Closed | 判定事件由 `checkCall` 写、`gateOnRules` 不写（`design.md:723`），规则板 0.10 §9.4 与 §10.7 M6 第 3 条（rules:1730、1861）同；验收第 22 条钉住 `--wait` 下恰好 3 次判定与各次选项，我重算了数字：17:58:30 → 18:00:01 是 91,000 ms，→ 18:01:01 是 151,000 ms，与条文一致 |
| N16 | Closed | `absent` 含空文件，`login-rejected` 记录带登录令牌指纹（`design.md:469–475`）；`store.ts`:185–191 的 `clearCredential` 写空串、`zcode.ts`:218–227 的 `locationStore` 写回同一文件，与条文所述一致 |
| N17 | Closed | 规则板 0.10 §6.4 的脚本自查文字写了条目 id、档位来源与「until 18:00」（rules:776、781），`gateOnRules` 原样写 `CheckResult.text`（`design.md:714`） |
| N18 | Closed | 少做与不做两档去掉「for your information only」，四档都以「Do not switch models or plans unless the user asks.」结尾；「only」只留在读不到档位与无影响两种用今天原文的情形（`design.md:259–270`） |
| N19 | Closed | `onepage:3`、`onepage:21`–`22`、`onepage:26` 已是评审给的三句（「先停下，说明 18 点以后再跑」「加 `--wait` 就自己等」「由系统自己记下来」）。放行稿其余与 0.5 不符的地方另记 N27 |
| N20 | Closed | 依据改为 main `419b6ea`，`c17ff5d`、`61be79a` 经 `823795a` 合入的说法已改正；建议的图节点一句改为「放行后由编排方按本表建」并写明草稿只有批注（`design.md:1094`） |
| N21 | Closed | §18 写明以项目图上节点的批注为准（`design.md:1118`）；规则板 0.10 §10.7 M6 一节、循环板 0.6 §3.4 与 §17 已经读到并照做 M6 0.3、0.4 的要求，`m6` 节点历史里也有循环板 0.4 的核对批注（2026-10-30T05:23Z） |

### 对人定方向的核对

| 方向 | 结论 |
| --- | --- |
| `d-main-agent-peak-exempt`（节点正文：高峰模式不管主 Agent，只管子 agent 与自报的重活脚本；0.8 里「不做档主 Agent 的工具调用也排队、对话要等高峰过去、换档只能打 /rules peak」作废） | 满足。逐项：(1) 不做档正文（`design.md:261`）「Until <end>, do not dispatch a GLM subagent and do not start a script that spends GLM credits; a GLM subagent whose call comes back deferred stops and reports where it stopped. The main agent is not held on any level: it keeps answering the human and working.」，每句主语写明，对主 Agent 只限制派 GLM 子 agent 与起花积分的脚本，与规则板给主 Agent 的一行（rules:789「You keep working and answering the human; until 18:00 no GLM subagents and no scripts that report GLM spending」）和给派活的排队文字（rules:753「You are not held: keep answering the human and doing other work」）说法一致；子 agent 一句与规则板给子 agent 的排队文字（rules:743「Stop and report … where you stopped」）一致。(2) 少做档正文只让主 Agent 把可挪的重活挪走并数并发（rules:786 同义）。(3) 验收第 13 条逐字钉住，并列出禁用片段（`information only`、`keep working`、`pause`、`postpone`、`defers the tool calls`、`tells you when to continue`）；我用 §3.4 的原文重算了长度：今天的第三句 152 字符，少做（出厂默认、带上限）400（多 248），不做（人设）345（多 193），与 §3.4 末写的数一致，两档正文都不含禁用片段。(4) 全文搜「主 Agent」与排队、推迟、暂停、停下、等待的共现：只剩说「不被管」「不排队」的句子和对 0.4 旧说法的作废引用（`design.md:63`、`174`、`1256`）。(5) 验收第 25 条用新探针场景 `rules-peak-stop` 从运行层面钉住主 Agent 的 `Read` 没被拦，与现有 `rules-peak` 的同类检查（`run-probe.mjs`:1114）一致。(6) 改档位的路径漏了对话一条，另记 N25 |
| `d-peak-mode` | 满足：提醒照旧，措辞跟档位走；默认少做，档位与执行归规则板；新手教程归上手页与规则页 |
| `d-zcode-3171` | 满足：见结论摘要里的重核数字；额度请求引的是机制不是逐字文本，Q0 导出的 host 包只作机制参考（与 `AGENTS.md` 基线一节一致）；高峰提醒是本项目文字、不在镜像文件里，pristine 副本里没有本地峰谷时段 |
| `d-rules-in-repo`、`d-memory-scope`、宪章 0.7 §9 | 满足：M6 的额度流水与缺口文件是整个账号的额度与用量，留在用户级（宪章 0.7 §9 的存放表第 142 行、`d-memory-scope` 的「用户级只留」清单都列了「整个账号的额度与用量」）；脚本自查读项目的 `docs/rules/` 与 `.llm/rules/`；`userDataHome()` 与 `DSH_HOME` 的旧说法只剩作废的引用（`design.md:723`、`1157`） |
| `d-boards-as-hooks`、`d-script-timeout` | 满足：M6 不加规则与脚本条目；`gateOnRules` 经 `checkCall` 受人同意过的拦路脚本管，会多等，超时按条目的做法判，不在后台接着跑，不含 `child_process`（验收第 24 条静态检查）；规则板 0.10 的 `CheckOptions.runScript`、`CheckResult.scripts` 在（rules:1663、1699） |
| `d-agent-examples` | 满足：M6 没有主 Agent 写的东西；§7.3 的两条规则是测试夹具，形状取规则板 0.10 的 `when` + `filter` + `condition` + `action`，全文无记账、账本、ledger 字样 |
| `d-defaults-readonly`、`d-rules-visible` | 满足：四条 GLM 条目只读、以数据交出（`design.md:801–812`） |
| `d-chat-not-cards`、简报规则 6 | 满足：没有要问人的事（§20）。§19 的三处「最可能不对」（少做档的措辞、真网冒烟算必要、`gateOnRules` 没有影子期）都是可逆的 agent 决定，写了没选的做法与原因。`gateOnRules` 没有影子期这一条，宪章 0.7 §3.2 第 3 条与 §6 把「先影子」留给写在代码里的门禁，`gateOnRules` 是代码，设计的理由是它只把规则板上人定的条目带到两个脚本的启动处（`design.md:724`）；规则板 0.10 对它自己的附属条目也没有设影子期。我认这个判断可逆、已披露，不要求升级成待人定的事项 |
| `d-dogfood-scope`、`d-freeze-until-dogfood`、`d-alignment-rounds` | 满足：实现在自举之后由 DSH 里的主 Agent 做；对规则板 0.10、循环板 0.6 的请求只写成自举之后办的批注（`design.md:1118`、§21 请求表），没有改任何已放行的设计 |
| `metrics` | 满足：GLM 包的四类事件在服务在时才交；账号一级的事件归哪份流水没有替指标设计定，写成给指标设计的请求（§21 请求表第 3 行），不是已放行的设计 |
| 简报规则 7、8 | 满足：无示例题材问题；全文无人设与语气词 |

### 与已放行设计的核对

| 设计 | 核对点 | 结论 |
| --- | --- | --- |
| 规则板 0.10 | `glmHournessPeakMode` 的契约、`checkCall` 的选项（`signals`、`glmSpend`、`peakUntil`、`waitedMs`，rules:1659–1675）、附属条目四条与它们管的对象（rules:174–175、350）、`GLM peak` 一行的两种档位说法（rules:783–790）、脚本自查文字（rules:776、781）、§10.6、§10.7 M6 一节（rules:1859–1863） | 一致 |
| 循环板 0.6 | `loops.peak-start`、`loops.peak-end` 是第 13、14 项（`schedules:764–765`）；`channel.peak-changed` 由循环行照 `peak` 与 `nextPeakChange` 推出（`schedules:200`）；M6-L1 至 L5 在 §3.4；`loops.peak-end` 少做与不做都叫醒；只装编排层包时没有 GLM 条目（`schedules:125`） | 一致 |
| M3 附录 0.5 | 示范题「高峰时段派出去的活怎么排」，不做一行「派活全排队，高峰后再开；主 Agent 照常回你话」（`m3-addendum:370`、`354`）；M3 不碰提醒与档位 | 一致 |
| M7 0.6 | 派活处读一次 `glmWorkerCap`、没进展的目标轮开始时读一次 `peakHoldFor`，不读档位与时钟，没有任何一处因高峰暂停主 Agent（`m7:40`、`87–88`） | 一致 |
| 宪章 0.7 | §3.2 第 3 条与 §6（人看过原文同意的条目即生效，代码里的新门禁先影子）、§9 存放表 | 一致，见上表对 `gateOnRules` 的说明 |

### 发现

#### N22 NIT　§17 引的 `ORCHESTRATION.md` 行号和探针导入的行号过时

位置：`design.md:1106`；`design.md:9`、`192`。

`design.md:1106` 写「提醒只告知……」（今天第 1074 行）与「排期功能要有」（今天第 1076 行）。这是 `480e264` 的行号。0.5 的依据是 `419b6ea`，`docs/ORCHESTRATION.md` §11.4 在 `419b6ea` 与现在的 main 里，原文代码行是 1076，「提醒只告知」是 1079，「排期功能要有」是 1081（`git show 419b6ea:docs/ORCHESTRATION.md`，比 `480e264` 多 5 行）。`design.md:9`、`192` 写探针对 `PEAK_REMINDER_TEXT` 的导入在 `run-probe.mjs` 第 53–54 行，实际是第 53 行一行。R1 按引号里的原文能找到要改的行，不会改错，所以不挡路。
改法：`design.md:1106` 去掉「今天第 N 行」，只留引号里的原文；或改成 1079、1081。`design.md:9`、`192` 的 53–54 改 53。

#### N23 NIT　M6 R1 与规则板 R4 的先后写了两种

位置：`design.md:53`、`1082`、`1090`、`1122`、`1170`；§21 请求表第 1 行。

这些地方都写「M6 R1 先于规则行默认启用，也先于整块规则板的 R4」。`design.md:1090` 同一条里又写「R4 先到时 R4 照常合入（规则行默认禁用，……不相抵），但规则行改为默认启用之前 R1 必须已经合入」。规则行在补丁里是 `disabled: true`（`packages/hourness/cordis.patch.yml`:59–69），R4 的每步提醒要等规则行启用才进用户的安装，所以真正的约束只有「R1 先于规则行去掉 `disabled`」；「先于 R4」是更强的说法，却是 §18 第一行请规则板记进它 §16 的那一句。第 3 轮 F8 要的是写死一种顺序，这里是两种，实施者按图注读和按 1090 读会得到不同的合入限制。两种读法都不造成损失，所以不挡路。
改法：全文只留一种：「M6 R1 先于规则行在补丁里去掉 `disabled: true`；R4 与 R1 谁先合入都行，因为规则行禁用时 R4 的每步提醒不进安装」。`design.md:53`、`1082` 的图注、`1090`、`1122`、`1170` 与 §21 请求表第 1 行同改。

#### N24 NIT　读不到档位的原因记录混了两种，条数的叫法不统一

位置：`design.md:278–279`、`924`；§1.4 第 13 条（`design.md:128`）。

返回的 `peak` 为 `false` 与为 `undefined` 都记 `peakModeNote: not-peak`。两者原因相反：`false` 是规则行与 GLM 包的时钟在 18:00 前后各读各的；`undefined` 是规则行读不到计价服务或 `peak` 抛错（`src/shared/peak-mode.ts` 里 `PeakModeState.peak` 的注释）。事后看会话日志的人分不出该查时钟还是查规则行。另外 `design.md:924` 写「四种都发今天的原文」，§1.4 第 13 条和 §15.1 写「五种读不到的情形」，实际是四个 note、五种情形，读者要自己数。
改法：`PeakModeNote` 加 `'peak-unknown'`（`peak` 为 `undefined`），`not-peak` 只对 `false`；`design.md:924` 改成「四个 note、五种情形，都发今天的原文」，并让 §1.4 第 13 条的情形列表按 note 分组。

#### N25 NIT　改档位的路径只写了页面与命令

位置：`design.md:727`；`onepage:30`。

`design.md:727` 的前半句刚写了「在对话里告诉主 Agent，由它经 `rules_propose` 加……」，后半句写「想改档位，在规则页或 `/rules peak` 里选」。规则板 0.10 的权限表还有对话一路：`kind: 'peak-mode'` 的提议加人的拍板（rules:331）。`d-main-agent-peak-exempt` 的节点说明把「换档只能打 /rules peak」作废。这句没写「只能」，但漏了对话那一条，读起来像档位只能走命令。放行稿（`onepage:30`）同样只写页面与命令。
改法：`design.md:727` 改成「想改档位，在规则页、`/rules peak`，或在对话里告诉主 Agent，由它经 `rules_propose`（`kind: 'peak-mode'`）提议（rules:§2.5 的权限表）」；重写放行稿时同改。

#### N26 NIT　压缩之后重发提醒时的读法没写，两处「读一次」的说法与现有行为不符

位置：`design.md:133`、`277`；`orch:1072`。

`design.md:133` 写「服务只在要发提醒的那一步读一次（假服务记下调用：一段高峰里一个会话一次）」，`design.md:277` 写「只在要发提醒的那一步读一次」。现有提醒规则里，压缩把 notice 移出可见历史之后，同一时段的下一个 GLM 步会再提醒一次（`orch:1072`，`peakWindowToAnnounce` 的判法）。那一步会再读一次服务，新 notice 按当时的档位写。这样做是合理的（模型看到的是当前档位），但全文没有写，「一段高峰里一个会话读一次」与「同一段高峰里档位改了不再提醒」在压缩之后都不成立，按字面写的假服务调用次数断言会在压缩用例里失败。
改法：`design.md:133`、`277` 改成「每发一条提醒读一次」；§3.4「怎样读档位」里「同一段高峰里档位改了，不再提醒」那条加一句「压缩把 notice 移出可见历史之后的重发，读的是当时的档位」；§1.4 第 13 条加一个 L2 用例：先发少做原文，压缩后档位已改成不做，重发的 notice 是不做原文，假服务被调了两次。

#### N27 NIT　放行稿还写在 0.4 上，有几处与 0.5 不符

位置：`onepage:3`、`18`、`30`、`52`。

设计已写明放行稿等本轮通过后重写（`design.md:17`、§20），所以这里只记重写时要改的地方：`onepage:3` 指向 `design.md`（0.4）；`onepage:18`「不做：GLM 的活等到 18 点，系统会叫它接着做」没有说主 Agent 不被管，读起来像走 GLM 的主 Agent 也等；`onepage:30` 只写页面与命令（N25）；`onepage:52`「已经过了三轮评审，这是你允许的最后一轮修改」与事实不符（0.5 是对齐轮的一次续写，不是人许的最后一轮）。
改法：按简报规则 5、6 重写：不做一行改为「不派 GLM 子 agent、不起花 GLM 积分的脚本，主 Agent 照常回话和干活」；档位怎么改补上对话一条；放行一条的背景改成对齐轮这一次改了什么（高峰模式不管主 Agent、提醒正文按规则板实际交出的档位写）。

#### N28 NIT　`graph-ops-align.json` 在评审时还不存在

位置：`design.md:1118`、§21「0.5：给其他设计的请求与没做完的」第 1、5 行。

简报规则 9 要每一支写 `graph-ops-align.json`，完成条件里也列了它。设计把它交给「对齐轮的收尾步」（`design.md:17`、`1118`），目录里现在没有这个文件。这不是设计缺陷，但设计 §21 的三条请求（规则板 0.10 记先后、循环板 0.6 告知 `nextPeakChange` 已在 main、指标流水设计的归属与 `userDataHome()` 一句作废）只在这个草稿里才会上图。
改法：收尾步写时是一个纯 JSON 数组，至少含：给 `m6` 的一条（0.5 做了什么、评审结论）；给 `rules` 的一条（N23 定下的那一种先后）；给 `schedules` 的一条（`nextPeakChange` 已在 main，不要求改契约）；给 `metrics` 的一条（项目 `.llm/` 与账号一级事件的归属，`graph-ops-v04.json` 里那句作废）。

#### N29 NIT　盘上稿没留副本

位置：`design.md:1247`（§21「0.5：盘上稿的处理」第 2 条）。

简报规则 3 要求覆盖之前留下旧文。0.4 的副本在，但被覆盖的盘上稿（0.4 加一行版本行和一条依据）没有留。内容上损失不大，变更记录写了它与 0.4 的三处差别，其中版本行「大半没有兑现」，依据一条的内容并进了 0.5；但本轮对「只差三处」不能独立重现（上面「断点续写的核对」第 2 行）。
改法：在 §21 第 2 条末尾加一句：盘上稿没有留副本，理由是它与 0.4 的差别都已并入 0.5（版本行整句重写，依据一条按第 3 条改了基线），以后的对齐轮在覆盖之前把旧稿存成 `design-v<旧版本>-cutoff.md`。

### 已核实的假设（本轮）

- 0.4 副本与 0.3 副本的大小和 MD5（上表第 1 行）；`design-v0.2.md` 存在。
- 轮次表有第 4 行而无正文，json 止于第 3 轮（上表第 4 行）。
- `06219c6`、`419b6ea` 存在；`9c346fb` 不是 `06219c6` 的祖先；`06219c6..419b6ea` 碰代码的只有 `9c346fb`；`419b6ea` 到 main 现在（`e57e744`）与 M6 读的文件无关。
- `src/shared/peak-mode.ts`：`PEAK_MODE_SERVICE`、`PeakLevel`、`PEAK_REDUCE_GLM_WORKERS = 1`、`PeakModeState` 六个字段、`glmWorkerCap` 只在 `peak === true` 且 `level === 'reduce'` 时有（`peakModeState`）、`peakHoldOf`、`peakModeService(ctx, problem)` 读不到回 `undefined`、形状不对时回调 `problem`。0.5 读的四项与不读的 `at`、`until` 与此一致。
- `src/shared/pricing.ts`:41 `nextPeakChange(peak, fromMs, horizonMs = DEFAULT_HORIZON_MS)`；`tests/peak-mode.spec.ts`:88 有它的测试。
- `packages/hourness/cordis.patch.yml`:59–69 规则行 `disabled: true`；`src/rules/engine.ts` 的 `openRulesBoard(...).apply(actor, request)` 能以 `human` 身份写 `peak-mode-set`，验收第 25 条的探针前置做得到；探针已从 `packages/hourness/dist/rules/index.js` 导入（`run-probe.mjs`:52）。
- 探针：`rules-peak`（`run-probe.mjs`:395–400，三步，第一步 `/rules peak` 是查询）、`rules-peak-hourness`（:401–405）、`PEAK_AT`（:348）、`PEAK_NOTICE`（:365）、既有检查（:1110–1118）与 0.5 §2 描述一致；`glm-peak`、`glm-only` 场景的 `PEAK_NOTICE` 检查（:989、:1062）在规则行没启用时仍成立。
- `src/glm-prompt/peak-reminder.ts`:28 的 `PEAK_REMINDER_TEXT` 与设计所引逐字相同，文件头注释第 4–7 行（含「Information only」一句）、`installDialect`（`index.ts`:200，`installPeakReminder` 在:232）、`sessionIdOf`（`health.ts`:84）、`ServiceLookup`（`dsh-min.ts`:298）都在。
- `zcode.ts`:46、218–227、240、436–437、455–469、557，`project-token.ts`:81–108、312–314、367–376，`store.ts`:185–191，`run-calibrate.mjs`:27，`smoke-zcode-authorized.mjs` 从 `../src/` 导入：与 §2、§4.9 的引用一致。
- `orch` §11.4 原文与「提醒只告知」一条的文字、`orch` §16 末句与设计所引一致（行号见 N22）。
- 本机 ZCode：`app.asar` 包内版本 3.17.1、374,627,566 字节、修改时刻 2026-10-29T13:04:46Z；`out/host/index.js` 2,190,425 字节、MD5 `3ef810e5878d5103bb4430df00181b09`；host 目录有 `chunk-ZSDMP7DM.js`。pristine 副本的 MD5、大小与六个搜索串的 0 处计数。
- 规则板 0.10：`CheckOptions` 的 `glmSpend`、`peakUntil`、`waitedMs`（rules:1671–1675）、`CheckResult.scripts`（:1699）、`runScript` 注入（:1663）、M6 一节（:1859–1863）、GLM 通道包一节（:1815）。
- 循环板 0.6 第 13、14 项与 `channel.peak-changed`；M3 附录 0.5 示范题；M7 0.6 的两处读与不读档位。
- 字符数：今天第三句 152、少做 400、不做 345，与 §3.4 末所写相同。
- 全文没有记账、账本、ledger、人设与语气词；新加的 24 个围栏成对、表格列数一致。

### 未核实或不成立的假设（本轮）

- 无不成立的假设。
- 未核实：盘上稿「只差三处」（没有副本，N29）；探针 `rules-peak` 第一个 GLM 请求会带少做原文的 notice（作者在 §21 最后一张表第 6 行已标〔推断〕，R1 的 L3 核实）；§4.1 偏移表里除作者抽查的两处之外的偏移（本轮核了安装包的大小与 MD5，没有逐项重数，作者也写了没有重数）；`gateOnRules` 不设影子期是判断，不是事实（作者已标）。
- 本轮没有逐行重读 0.4 里没改的 §4 至 §6、§9 至 §15：这些部分在第 1 至 3 轮评审过，0.4 在第 3 轮之后的改动（F8、F9、N16 至 N21 的回应）已按源码核过上面所列的各点；0.5 改动的 194 行已全部读过。

### 结论

HIGH 0、MEDIUM 0、NIT 8（N22 至 N29）。按规则：APPROVED。挡路的数：3、4、2、（第 4 轮无记录）、0。8 条 NIT 都不挡后面的步；N27 在重写放行稿的那一步要用到，N28 在对齐轮收尾步要用到，N23、N24、N26 建议在 R1 开工前由 M6 的下一次修订顺手改掉。项目图的记录由编排方做，本步按简报不写 `docs/graph/`。

