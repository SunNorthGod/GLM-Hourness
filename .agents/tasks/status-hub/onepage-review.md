# 一页稿评审（status hub onepage）

Pass 2（先前有 Pass 1：`onepage-review.md` 存在，裁决 CHANGES_REQUESTED、2 MEDIUM + 2 LOW；`onepage-gate.json` 当时未落盘）。被审文件：`.agents/tasks/status-hub/onepage.md`（已按 Pass 1 修订）。对照：已通过的 `design.md` 0.3（`design-gate.json` verdict APPROVED、designVersion 0.3、pass 3）、`design-context.md` 的一页稿规则（`d-ask-three-gates`、`d-plain-questions`、问题带前因后果）、本轮 brief 的硬限。

## 机械限额核对

- 字符数：node 计 `s.length` = 949、`[...s].length` = 949，均 ≤ 1500。通过。
- 禁用词（验收 / 标定 / 门禁 / 影子）：node 计各 0 次。通过。一页稿用「怎样算做完」「合入前检查」等替换词，符合 `d-plain-questions`。
- 编码：无 BOM、无 CRLF（node 读首字节与 `\r` 核对）。通过。
- 开场为具体场景：有（周四早上打开右侧栏「项目图」首页「现在」，再问主 Agent 额度），与 brief 示例一致。
- 变化条目：「对你有什么变化」1–5，正好 5 条，≤ 5。通过。
- 决定项：「要你定的」仅 ① 一项，≤ 3。通过。① 为 `d-ask-three-gates` 形 (a)（一个是非问 + 推荐 + 一句真实代价「定下之后再改要你出手」），带背景（哪部分、来自 design.md §1.4、为何只能人定）。通过。
- 「替你定的方向」属 gate 1 的「可撤回技术选择，一句话告知」，非 ask，不计入 3 项决定上限。通过。
- 标题「设计 0.3，评审已通过」与 `design-gate.json`（0.3、APPROVED）一致。

## 先前发现复核（Pass 1 → 本稿）

- OPR1-01（MEDIUM，额度细节被放到 ui/ 面板首页）：**已关闭**。开场首页「现在」改为「谁在跑、此刻不是高峰」，不含额度百分比；额度改为人问主 Agent 得到，并说明「主 Agent 读的那份和 /hourness 报告里的额度一节是同一份」（报告路），与 design.md §3.4 覆盖范围、§4.2 表下段、§10 SH2-01 一致。
- OPR1-02（MEDIUM，减负数字被当成只给人看）：**已关闭**。指标板的例子改为「各模型、各版本的质量对照」（`scoresFor` 比率，person-only，design.md §3.4/§4.3）；三个减负数字（每周被问几次、每次读多少字、等多久）移入「对你有什么变化」第 2 条的主 Agent 能读、周报转述那一类，与 design.md §4.2 行（`metrics/load`、`audience: agent`）、§6 一致。
- OPR1-03（LOW，「6 条」只列 5 句）：**已关闭**。① 现枚举 6 句（四处数字一致 / 主 Agent 拿不到只给你看的条目 / 报告里不含那些只给你看的比较 / 读不到时写明不顶替 / 陈旧的标出时间 / 用量清单不各算一遍），与 design.md §1.4 的 6 条一一对应。
- OPR1-04（LOW，「四处」枚举与决定措辞不符）：**已关闭**。第 1 条改列决定 `d-status-hub` 命名的四个视图：晨报、周报、面板、主 Agent 的回答。

## 本稿发现

无 HIGH / MEDIUM / LOW 发现。开场场景、受众机制、6 条「怎样算做完」、复用登记表、读不到写占位、无新工具等陈述均与 design.md 0.3 一致。

## 已核对的断定（Verified）

- `design-gate.json` verdict = APPROVED、designVersion 0.3、pass 3；据此进入一页稿评审。〔实读〕
- 字符数 949、禁用词 0、无 BOM、无 CRLF：node 计数。〔实读〕
- 开场首页「现在」= 谁在跑 + 是否高峰（停住时推进停住），无额度百分比：plain-ui/design.md §0；一页稿开场与之一致。〔实读〕
- 面板高峰一行 = 规则板 homeLine（反映 `rules/peak` 的 `text`，`audience: agent`），主 Agent 亦读 `rules/peak`，故面板高峰与主 Agent 所说同源：design.md §3.4、§4.2。〔实读〕
- `glm/quota`（`audience: agent`）仅经报告路显示（`collectStatus` → `/hourness` 报告额度一节），不作为 ui/ 面板板块 items；一页稿「额度那份与 /hourness 报告额度一节同一份」与之一致：design.md §3.4 覆盖范围、§4.2 表下段、§10 SH2-01。〔实读〕
- 三个减负数字 = `metrics/load`、`audience: agent`、主 Agent 转述、入周报；`scoresFor` 比率在指标板（`MetricsBoardView`）只给人看：design.md §4.2 行与表下段、§4.3、§6、§3.4。〔实读〕
- 周报（`weeklyReport`）读 `collectStatus(..., 'agent')` 取高峰、额度、用量、推进停住、汇报、三个减负数字等，故一页稿「操作要用的 + 三个减负数字……周报里会转述」属实：design.md §6。〔实读〕
- 主 Agent 无新工具、经读晨报周报的入口只拿 `agent` 条目（一页稿第 3 条）：design.md §4.3。〔实读〕
- 读不到写占位、不顶替、不猜（一页稿第 4 条）：design.md §7。〔实读〕
- 复用现有板块登记表、只加 items、不另起（一页稿第 5 条）：design.md §3.4。〔实读〕
- 「替你定的方向」对应 design.md §12 对接改动表、可撤回：design.md §12、§0。〔实读〕
- ① 的 6 条与 design.md §1.4 的 6 条验收一一对应。〔实读〕

## 未核对 / 存疑的断定（Unverified / Wrong）

- 无「错误但未改」的残留。Pass 1 的两条 MEDIUM 与两条 LOW 均已在本稿关闭。
- 一页稿标题「评审已通过」仅据 `design-gate.json`；设计文本本身的两条残留 LOW（SH3-01、SH3-02）属设计评审范围、不在本评审内。
- 未跑 L2/L3/L4、未读源码：一页稿为人面说明，核对以 design.md 0.3 与 plain-ui/design.md 1.3 文本为准。

## 裁决

HIGH 0、MEDIUM 0、LOW 0。无 HIGH / MEDIUM，APPROVED。
