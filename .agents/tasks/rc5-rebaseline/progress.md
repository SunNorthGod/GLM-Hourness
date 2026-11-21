# rc5-rebaseline 运行记录（attempt 2，2026-11-21）

任务：task-1 运行时升级后的全面体检。车道 hz/task-1，worktree
`.worktrees/hz-task-1`。attempt 1 交接现状：rc.5 安装确认、`npm run build` 绿。
本 attempt 记录桌面隔离实例点验、探针重跑与红项归因。

## 1. 全量探针（rc.5）

- 13:01 主车道起跑的第一轮（运行目录
  `glm-hourness-probe-2026-11-21T05-01-20-980Z-HkOE5s`）：52 个场景目录齐全、
  各场景 stderr.txt 全部 0 字节、probe-lock 干净释放。但判定行只进 stdout，
  attempt 1 的会话作业随会话丢失，绿数红项无法从产物侧得出（主车道 2026-11-21
  14:0x 拍板：不按间接证据记绿）。
- 重跑：14:02 本车道起跑全量探针，stdout/stderr 逐行落盘
  `logs/probe.log`（`scratch/run-probe-logged.mjs` 包装，探针离线不耗积分）。
  结果见 §1.1（跑完后回填）。

### 1.1 重跑结果与红项归因

- 汇总行（`logs/probe.log` 末尾）：`probe: 633/635 passed`，exit 1；运行目录
  `glm-hourness-probe-2026-11-21T06-02-35-960Z-QTgmYN`，14:02:35–14:25:35
  （23 分钟；attempt 1 实际 13:01–13:41 约 40 分钟，时长同级）。其余 633 项
  全部 PASS，stderr 零行。
- **红 1（memory）**「探针保持真实用户级记忆流水与检出所属项目流水原样，用户
  级目录无经验目录」：证据 `22690 -> 24193`——增长的是主检出
  `.llm/lessons.jsonl`（14:07:52，`seq 35/36`，`actor harness`，写入者
  `session-02bc89c4`（主车道会话），`tool propose`，evidence `task:task-5`）。
  主车道在探针窗内为 task-5 的交回登记经验提议，撞了「项目流水原样」断言。
- **红 2（data）**「用量只落用户级目录，不落项目目录与真实目录」：证据真实
  `~/.dsh/glm-hourness/audit/usage.jsonl` 在探针窗内 `218336 -> 227301`。窗口
  内共 48 行用量，写入者含并发编排会话：主车道 `session-02bc89c4…`
  （glm-5.3）与本车道 `hz-task-1-a2-gjejvg`（glm-start-plan / glm-5.3-flash，
  即工人会话自己的模型回合）。工人会话本身是 GLM 会话，探针运行期间它必然
  继续写真实用量，隔离断言无法满足。
- **归因分类**：两条都是**环境并撞（编排并发自写）**，不是运行时契约变化，
  不是基线漂移（非 rc 收尾形状那类），更不是产品缺陷；不涉任何一行代码。
  rc.5 全量面 633/635 无产品红。自举后的结构性事实：只要有编排会话活着
  （驱动探针的车道自己就是），这两条隔离断言必然红——探针需要按会话归属过滤
  （§4 发现 5），或在判定上挂「编排静默窗」豁免；本车道按实情记录，不改探针
  期望（不顺手修，另立车道）。
- 附带核对：attempt 1 的运行目录与本轮运行目录的场景集合一致（52 个场景目录
  同名），红灯位形相同（均为真实文件快照比较类），与「判定行丢失」无冲突。

## 2. 桌面隔离实例点验（rc.5，免锁路）

按主车道 2026-11-21 回话执行：全局桌面锁（主检出 `.llm/desktop-lock/`）在编排
方写域之外、物理上无人能占（见 §4 发现 1），本任务不占锁；起实例前核对进程表
无其他隔离实例（仅主人的主实例与本次查询进程自身，无残留 lane 实例），CDP 端口
9377 空闲未占用。实例参数：`%TEMP%\glm-hourness-rc5rb-desk-20261121T1308`
scratch home、junction 指向本 worktree 的 `packages/glm`、`packages/hourness`、
独立 user-data-dir、命令行标记 `--glm-hourness-rc5rb`。证据在 `scratch/shots/`，
脚本在 `scratch/`（setup.mjs / start.ps1 / check.mjs / check2-9.mjs /
teardown.mjs）。

### 2.1 结果

- 引导（onboarding）：rc.5 首启欢迎页在 profile 层无法跳过——rc.3 配方的
  `desktopNextOnboarding` 键在 rc.5 的 config catalog 已不存在（见 §4 发现 2）。
  应用内走完（开始设置 → 跳过 → 进入应用，`shots/10/20-*/31`）。
- 项目图面板渲染：工作区切到 ws-d（种子图 goal-1 + 决策 + 两模块）后，右侧栏
  项目图 tab 打开，渲染「rc.5 重基线样例目标」+「实时」标记，规则板/循环板/
  指标板页脚齐全（`shots/51-panel.png`、`60-glmstatus.png`、`shots/body6-panel.txt`）。
  hourness 客户端行（面板）正常工作。
- 包注册：插件页列出「GLM ZCode 通道」「Hourness 编排层」两条本包条目
  （`shots/70-plugins.png`、`shots/body8-plugins.txt`）。
- 行健康全行（/glm-status）：未能从桌面 UI 取得——composer 提交的 CDP 自动化
  不通（insertText 与逐字符 keyDown 都能让 DOM 有文本、发送键点击后清空，但
  会话无消息落记录，ws-d 的 session.v4 只有 header；`/hourness` 同样）。列为
  点验限制，行健康由无头探针覆盖。GLM 行存活的旁证：接管卡与 /wish 提示正常
  渲染（glm 客户端行存活）。
- 实例日志：整段会话（约 50 分钟）错误类事件只有两类，均与本包无关——
  ① `ws://127.0.0.1:9231/ingest` 反复连接失败：官方
  `dsh-experimental-inspector` 桥接端点在隔离 home 里没有 worker 监听，纯环境
  噪声（asar 全文检索 9231 无硬编码端口，命中均为压缩数据巧合）；
  ② `dsh-app://app/plugins/events` 每 5 分钟 `net::ERR_FAILED` 一次：宿主级
  插件事件流，非本包行错误。无 Runtime 异常、无 glm/hourness 相关错误
  （`shots/console6-errors-noningest.txt`、`console3/4/5-errors-noningest.txt`）。
- 拆场：CDP `Browser.close` 后实例干净退出（进程表 0 残留、9377 端口关闭、
  无 #32770 退出确认框）。scratch home 留在 %TEMP%（`teardown.mjs` 按纪律不删
  用户数据，lane 一次性目录）。

### 2.2 check 脚本的工程注记（给后续 lane）

- 隐藏/遮挡窗口上 `Page.captureScreenshot` 会永久挂起：先 `Page.bringToFront`
  且每条 CDP 命令带超时（check.mjs 已加）。
- CDP 合成鼠标事件点不动物 onboarding 页按钮（9 次点击坐标正确无效果），改
  DOM `el.click()` 后通（check4）。
- composer 文本注入：CDP `Input.insertText` 只进 DOM 不进应用状态；逐字符
  `keyDown` 进了状态但发送后不落记录。桌面 UI 的 composer 自动化在本环境不可
  靠，行健康类核验走无头探针。

## 3. 回交检查

- `npm run build`：绿（attempt 1 确认，本 attempt 未改 src/ui/tests 代码）。
- `npm run preflight` + `npm test`：见 §3.1（回填）。
- 种子文件：`.agents/tasks/m5/lessons-seed.json` 按设计不入库，已从主检出复制
  进本 worktree（主 Agent 2026-11-21 补进写域后落实）。

### 3.1 preflight 与 npm test

- `npm run preflight`：exit 0（2026-11-21 14:2x，worktree 内）。
- `npm test`：exit 0，三段全过、零失败（日志中两处 `not ok` 字样为测试描述
  文本，非失败）。

## 4. 发现（供主车道立后续任务/改文档）

1. **桌面锁是自举后的真缺口**：锁文件在主检出 `.llm/desktop-lock/`，工人的
   Write 工具按 worktree 边界拒绝写它（即便写域名单含此路径），壳文件命令也被
   拦。锁假设了「会写文件的编排方」，现在编排方自己写不了。本任务改走免锁路
   （进程表核对 + 独占端口 + 独立 home）。需要重设计：锁改放各 worktree 可写
   位置，或由宿主 gate 代持。经验板 L-04abb1 的「写进 writeScope」修法不够。
2. **rc.5 onboarding 键变更（运行时契约变化）**：rc.3 用 profile
   `desktopNextOnboarding`（v1/completed）抑制首启引导；rc.5 的
   `@deepseek-ai/dsh-client-ui-settings-account` config 才是 onboarding 状态
   （`version/step/purpose/process/completion`，设备本地，见安装 asar 的
   `docs/config-catalog.md` §dsh-client-ui-settings-account），profile 旧键
   无效。l4rc3 配方与 probe 里相关 fixture 需要跟（probe 若依赖该键，属探针
   基线漂移候选）。
3. **desktop 检查脚本的截图挂起点**：见 §2.2，后续 lane 直接复用
   check.mjs 的超时 + bringToFront 模式。
4. **探针判定行不落盘**：run-probe.mjs 的汇总只进 stdout，attempt 1 因此丢
   判定。建议给 runner 加 `--log <file>` 或在 runDir 写 verdict 文件（本车道
   用包装脚本绕过，属临时手段）。
5. **探针的文件隔离断言与自举后的编排并存冲突**：memory/data 两场景对真实
   用户级用量流水与检出项目流水做前后快照比较，而自举后编排会话（含驱动探针
   的车道自己）必然在窗内写这些文件——633/635 里的两条红全因于此（§1.1）。
   需要探针按会话归属过滤、或判定豁免「编排静默窗」，另立车道改。

## 5. 写域缺口记录

- `.agents/tasks/m5/lessons-seed.json`：spec 固定路径、设计不入库，每个新
  worktree 都要手工复制；主 Agent 已补进本任务写域。长期解法（候选）：spec
  降级为跳过提示，或种子挪进 git。
- `.llm/desktop-lock/owner.txt`：见 §4 发现 1。
