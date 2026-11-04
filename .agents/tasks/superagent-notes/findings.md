# dsh-superagent-prototype 精读 findings（2026-11-03）

来源：《Super-agent 设计探索：迈向更自主的 Agent 系统》（DSH 团队 2026-10-31 公众号文章，原文反爬未直读，经 IT 之家详报转引）与官方开源原型 github.com/deepseek-ai/dsh-superagent-prototype（MIT，浅克隆全读：docs/000–008、prompts/、cordis.patch.yml、部分 src）。

本文档不入库（.agents/tasks 下不进 git）。事实行已按仓库规矩写入 docs/FACTS.md §3（提交 a007257）。图上落点：m7、m7-3、status-hub、metrics、m4-gate 五条评注。

## 原型是什么

面向单个 GitHub 仓库（可选 Feishu）的 proactive coding agent，DSH bundle 形态，MIT。监听事件、被授权的人开口才开工，每个工单独立会话+独立目录，干完开 PR 回原对话。声明是 research prototype、非正式产品，与内部版本和论文实现不完全一致。src 15.2k 行 + tests 15k 行，单 SQLite 状态库。

## 文章是方向、原型是落地（差距）

- Watchdog：文章有（独立监控 Session 判断 Worker 是否真有进展），原型代码与文档中无。
- 异步 ReAct loop：文章称「已在 DeepSeek Harness 实现但未默认开启」，原型无（检索无 startTool/stopTool 类机制）；这是宿主能力，DSH 默认开启之日需跑探针复核工具面假设。
- Inline & Spill、链式召回：原型无；命名了本项目「图即外部记忆」路线。
- 原型真正落地的是：事件驱动 + Router/Worker + stored-work 副作用队列 + stage 表 + 授权模型（gate/Mandate/admission 表）+ 面板三问。

## 一、M7 设计输入（已落图 m7、m7-3 评注）

1. Stored-work 三件套（007 Effects 表 + 003 Stored work）:决定后的每个动作先落库、事务提交后执行；失败退避重试（2s 起倍增至 60s，Channel 消息 5s 起至 300s）；同一 Ticket 同一会话的消息严格保序（前一条未出后一条等待，除非前一条连续失败 3 次升为问题）；同 key 等待项合并替换、不重排队；连续失败 3 次才升健康告警；投递失败显示在所属 Ticket 上而不占全局健康。对应本项目 loops §18.10 投递与 M7 派发队列。m4-gate 的「journal 写失败留缺口、下条记录落地前先补」已是同款语义的日志侧。
2. Stage 表（003 开头）:任务生命周期不用状态枚举，用「在等什么」的表，自上而下首条命中：person/delivery、person/answer、person/review、person/blocked|failed、working/queued、idle、working。人的消息一到，受阻/失败自动释放（不卡人）。Ticket 状态自带、不跟随宿主 session（001 rejected concepts 明确拒绝「Ticket state follows DSH Session」）。M7 派发生命周期规格照此写。
3. 派发工具形状（007 main session tools）:orchestrator_route 一次收 1–20 个决定、每项独立处理（一项被拒不挡其余）；Trigger id 由输入派生（同输入同 id），重复接受一个 Trigger 只生成一个 Ticket（幂等，重启不重放）。M7 派发工具照此：一次派多个任务节点，缺栏拒掉不挡其他；派发键 = 任务节点 id + 尝试号，重启后重发不双开。
4. Observe 梯子（002 accept mode）:off → observe（默认，只记录 would accept）→ auto。自动工作先记录后放开，人审 Decisions。M7 若做自动推进照此部署（与新行默认 disabled、标定后才启用同构）。
5. 并发槽位（003 Concurrency）:主并发上限之外留一个「人的消息」专用槽,唤醒优先于新派发——新工作永远挤不掉人的消息。M7 槽位设计可参。
6. 策略版本化（002）:Policy version 变更不立即吊销进行中的 Mandate，只通知 + 到 resume 时重验。对应本项目规则/档位变更时的在途任务处理。

## 二、status-hub 设计输入（已落图 status-hub 评注）

- 面板三问（005）:现在需要我吗/系统健康吗/这件事的历史。每个元素必须答其一否则删。
- 诚实状态（005 原则 5）:计数必须等于所链列表长度;无状态自相矛盾。
- 健康默认安静（005 原则 6）:一次性网络错误不上面板;问题必须可行动（actionable）。
- 问题老化（002 unavailable Decision）:待人工告警 24 小时内才追问，过期只留记录可 evaluate again 或 dismiss。

## 三、仓库卫生（已落图 metrics 评注）

- model-surface.spec.ts:模型读到的一切（工具、提示词、技能、输入）按角色尺寸预算门禁 + 与工具 schema 对账，防漂移。graph-tools 400 字符测试是其雏形;M7 主 Agent 工具面升级为全工具面门禁。
- class-docs.spec:src 每个类前必须有 JSDoc。考虑引入与否待定（成本：存量类补 JSDoc）。
- docs.spec:编号文档只引用更早编号、模块表与测试表必须列全，缺则测试挂。ORCHESTRATION 编号节稳定后可考虑。
- 退出码语义（006）:status 0=正常 / 1=重启可能好 / 2=部件错误重启没用要人看 / 3=等配置;--respect-stop 尊重人工停止标记,自动恢复永不覆盖人工 stop。巡检脚本化时可用此语义。

## 四、背书类（不改代码，设计文档可引）

- 文本优先级阶梯（004）:工具/宿主强制 > 内置段 > 工单匹配规则 > 团队段 > 外部文本;外部文本是数据，永远改不了规则与授权。guard/m4-gate 的哲学与官方同款（已落 m4-gate 评注）。
- 一状态一写者（007 dependency rules）:每类状态唯一写者，其余只读或问写者。graph 引擎独占写、loops 单锁同向。
- 薄提示词厚代码:路由提示词 16 行、worker 10 行、shared 7 行,全部业务规则在代码。身份节长度上限由测试钉住的做法与本项目相同（主 Agent 身份节 1500+1400 字符上限）。
- 授权最小概念（001 rejected concepts）:「人」不是领域概念,是 Trigger 元数据;跨源身份映射是提示词文本不是代码。
- Bundle 机制先例（cordis.patch.yml）:官方原型插 preset 行、`!!js` 平台切换、cordis:group isolate 都是本仓库行可用机制;两处预设描述都写「不供手动选择」。

## 五、明确不抄的

- SQLite:本项目 JSONL 可 grep、可 git、人可读;不换。
- Router/Worker preset:定案不用 preset（§3.2）,子 agent 沿用父面、guard 限边界。
- 独立 profile + 账号 shim/OS 隔离:单用户仓库不需要。
- Watchdog、异步 ReAct、Inline & Spill:原型没实现,没有可抄的代码;等宿主能力出现再复核。
- tmux 启动脚本、管理 HTTP API:咱们宿主就是 DSH 本身,不需要第二套进程管理。
