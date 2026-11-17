# panel-desktop-L4：第 11 条（单装组合）与第 13 条（读到已登录）桌面 L4

Lane: panel-desktop-L4。基点 main `0c5ebd21`（干净，本 lane 零代码改动）。
HANDOFF §10 panel 行挂起的两项：「单装组合（第 11 条）与读到已登录一支（第 13 条）
随合入后的批次 L4」。

方法：沿用 desktop-l4-w1 的隔离实例配方。CDP 端口 9353，标记
`--glm-hourness-pl4`，DSH_HOME `.llm/panel-l4-11-13/dsh-home`（B10 版式：bundles
dsh-base + dsh-web-app + 两个本仓包 + 9 experimental；patch 层开 GLM 通道 +
glm-5.3-flash + danger-full-access；两包 link: 指向本检出 packages/，dist 与
`0c5ebd21` 同步构建）。凭证/设备 mid 只读取自真实 home 拷入 scratch home，测后
已删（见收尾）。全程只经 CDP 驱动自己的实例，无系统输入。工作区
`%TEMP%\l4p11\ws-guide`（git init，夹具节点 `l4p11-seed.json`，llm-only 历史）。

会话延续说明：本 lane 2026-11-17 13:40 的上一轮会话建好了锁、scratch home、
脚本后被中断，未做任何检查、无截图；本轮复用其产物，核验 junction 与凭证副本
后继续。

## 环境事件（影响证据归属，先记）

- 22:56 桌面应用自动更新：0.2.2-rc.3 静默安装（desktop-out.txt：`Executing:
  …deepseek-harness-0.2.2-rc.3-win-x64.exe with args: --updated,/S,--force-run`），
  正在跑的隔离实例被杀，且 rc.3 的强制重启没有成功（无进程残留）。条件 13 的
  证据采自更新前构建；条件 11 三个组合与恢复核验在 rc.3 上完成。两个包的客户端
  bundle（packages/*/ui/client.js）全部来自同一份本仓 dist（19:23 构建），
  跨这些启动不变，证据可比。
- rc.3 首启在隔离 user-data-dir 上重新弹出自家欢迎页（「欢迎使用 DeepSeek
  Harness / 开始设置」），覆盖主界面约一分钟，点一次「开始设置」后回到主界面；
  profile 里 `desktopNextOnboarding: {version:1, outcome:"completed"}` 未挡住它。
  后续隔离实例 lane 要预留这一步。
- rc.3 的 CDP 少了 `Browser.getWindowForTarget`/`Browser.setWindowBounds`；
  窗口被遮挡时 `Page.captureScreenshot` 不返回（w1 已记录的行为，rc.3 依旧），
  文本判定全部走 DOM 读取，截图在窗口偶尔到前台时补拍。
- rc.3 侧栏底部入口从「更多」变为账号按钮（AMD YES!），设置项文本是
  「设置Ctrl+,」——按精确文本「设置」点不中，按全文本可点。

## 第 13 条（读到已登录一支）——成立

验收原文（onboarding 节点）：本机没有 GLM 上手记录时，开场画面和会话里都有
「GLM · 上手」入口，点开是三步：登录、选模型、发一句话。读到已登录、点了
「跳过」，或者开场的小按钮在 3 个不同会话里出现过，就记作完成，入口收起。
设置页能重新打开。本轮核了「读到已登录」一支与设置页重开（2026-11-05 桌面批次
没看的一格）。

清掉两个本机键（`glm-hourness.onboarding.glm.v1`、`…glm.seen.v1`）+ 重载后：

1. 入口两处：开场画面 hero「GLM · 上手」visible（DOM + 截图
   shots/c13-0-before.png）；会话 composer dock 的 pill 同名（先发一条最短真实
   消息把会话切到对话视图后挂载——空会话的开场视图没有 dock；文案「请只回复：
   好」，回复「好」，这是本轮唯一的模型消耗）。
2. 三步：点 pill 开「GLM 通道」对话框，自动 /glm-status（本轮唯一的自动命令），
   拷入凭证读到 `logged: true`——标题「GLM 通道已登录」，OnboardingBlock 三步
   逐字在（登录 ZCode 账号…／在输入框右下角的模型选择器里…／发一句话试试），
   第 1 步当场打勾，详情区 状态=已登录、套餐=coding-plan、Key=5acebe…、
   账号=15971788070203140、读取于 22:50。截图 shots/c13-2-dialog-logged.png
   （会话流里也能看到 `>. glm-status · glm-zcode: 已登录 (套餐 coding-plan, …)`）。
3. 记完成、入口收起：`glm-hourness.onboarding.glm.v1` 当场写入
   （2026-11-17T14:50:22.508Z）；Esc 关对话框后 pill 标签「GLM · 上手」→「GLM」；
   新开会话的开场画面 hero 消失（shots/c13-3-hero-gone.png，对照 c13-0）。
4. 设置页重开：设置 → GLM-Hourness → 「重新看上手说明」→ `…glm.v1` 记录被清
   （值回 null），hero 与 pill 标签恢复「GLM · 上手」
   （shots/c13-5-settings-glm.png、c13-6-settings-reopen.png、
   c13-7-pill-restored.png）。
5. 附带（非本支目标）：「3 个不同会话」分支在后续操作中自然触发——hero 先后在
   a0757beb、febcf827、752a2db2 三个会话出现，第三个出现时 `…glm.v1` 被
   自动写上（15:00:21Z），入口照例收起。该支同样成立。

## 第 11 条（单装组合）——成立（做法上有一处扩展，见 11-A）

验收原文：只装项目编排、只装 GLM、两个都装，各自的引导都出现，且不提另一个
插件的界面。判「上手页全文没有「GLM」、没有高峰几句」与「引导里没有项目图的字」。

基线（两个都装，pl4-guide 工作区夹具图，上手页首开自动出现）：全文含「GLM」
「高峰」「三档」「积分」「少做」，第 4 块带高峰三档句与「现在是：少做」，第 6 块
带「额度用完时推进会停住」句（shots/c11-baseline-guide-both.json，len 1050）。

### 11-A 只装编排层——成立

- 开关：在隔离 profile 的 cordis.patch.yml 追加 `glm-hourness/glm-ui disabled`
  （impl-plan-2 记录的做法：关另一个包的客户端行）+ `glm-hourness/glm-login
  disabled`。扩展理由：高峰几句的门是 rules 板的 `peakApplies`，读 host 写的
  view.json，计价服务随 glm-login 行来去（src/rules/peak.ts：没有计价服务时
  `peak.applies=false`）；只关 glm-ui 时计价仍在、高峰几句不会消失，出不了
  「只装编排层」的真状态。glm-ui（无人看见 GLM 界面）+ glm-login（无 /glm 命令、
  无计价）合起来才是单装编排层。重启后生效。
- 结果：上手页全文 len 824，checks 全 false（hasGLM/hasPeak/hasSanDang/
  hasJiFen/hasShaoZuo/hasEDu）——正文零「GLM」、零高峰几句、零额度句；第 4 块
  规则板只剩门与改动两句。DOM 里 glmh 元素 0 个（无 pill、无 hero），设置导航
  无 GLM-Hourness 节，整页 body 无「GLM」词。截图
  shots/c11A-guide-hourness-only.png。模型选择器回落到 DeepSeek-V4.1-Flash
  （glm-login 关后 GLM 通道不可选）——属通道降级，不在引导文字里。
- 控制台：该轮启动 13 条已知宿主噪音（9230 ingest 与 events 插件），0 错误，
  0 条涉及本仓两包。

### 11-B 只装 GLM——成立

- 开关：还原 patch 后追加 `glm-hourness/ui disabled`（编排层客户端行）。重启，
  走过 rc.3 欢迎页后核验。
- 结果：项目图页签 body 不再挂载——侧栏残留上一会话布局里的「项目图」页签头，
  点开正文只有「这类内容还没有可用的查看方式。」，DOM 无任何 glmg 元素（编排层
  引导整页不在）。GLM 面全部在场：设置导航有 GLM-Hourness 节，节内全文零
  「项目图」（shots/c11B-glm-settings.json；「项目令牌」「项目 key 预览」是通道
  自身用词，不是编排层界面）；hero 对话框（OnboardingBlock 三步）全文零
  「项目图」、连「项目」二字都无（shots/c11B-hero-dialog.json）；pill 对话框
  内容与 hero 同族，其完整样子见 c13-2-dialog-logged.png（同一客户端 bundle，
  含详情/高峰/额度/各行健康，零「项目图」）。截图
  shots/c11B-hero-dialog.png（对话框与孤儿页签同框）、c11B-state-check.png。

### 恢复核验

- cordis.patch.yml 恢复为测前字节（SHA-256 `662179cfdab9eeb9…`，与测前记录一致；
  测前副本留在 .llm/panel-l4-11-13/cordis.patch.yml.pretetest-backup）。
  package.json 全程未动（测前 SHA `ad8a9e29…`）。
- 重启后双装在场：hero/pill「GLM · 上手」挂载，项目图页签 body 重新挂载
  （glmg 52 个元素），控制台 11 条已知噪音、0 错误。本轮结束状态即双装可用。

## 额度

- 模型消耗：一轮 flash（glm-5.3-flash、reasoningEffort low）最小对话
  （「请只回复：好」→「好」），回复面显示 13.3K tok（含系统上下文计费）。
  另有打字探针残留「x」混入同一条消息，未多消耗回合。
- /glm-status 自动读与设置页额度读数（窗口已用 8%／33%）是命令与只读接口，
  不走模型。其余全部为 UI 检查，无模型回合。

## 收尾状态

- 实例：Browser.close 干净退出（23:20，无 #32770 退出确认弹窗，无进程残留，
  9353 无监听）。实例未再启动。
- 凭证副本：dsh-home/glm-hourness/credentials.json 与 device-mid.txt 已删
  （rm 输出在上）；目录里剩 host 自己写的 audit/ 与 loops/，无凭证。
- 桌面锁：.llm/desktop-lock 已删（释放）。
- 工作区：%TEMP%\l4p11\ws-guide（夹具图在内），仓库 .llm 之外，未清理（临时区）。
- 本文件在主检出工作树，未提交（main 冻结，编排方解冻后随记录提交）。

## 产物

- 截图：.llm/panel-l4-11-13/shots/c13-0-before.png、c13-1-pill-before.png、
  c13-2-dialog-logged.png、c13-3-hero-gone.png、c13-5-settings-glm.png、
  c13-6-settings-reopen.png、c13-7-pill-restored.png、
  c11-baseline-guide.png（空档，文本证据在 json）、c11A-guide-hourness-only.png、
  c11B-state-check.png、c11B-hero-dialog.png、c11-restored-both.png（失败，遮挡）。
- 文本证据：同目录 c11-baseline-guide-both.json、c11A-guide-hourness-only.json、
  c11A-extra.json、c11B-glm-settings.json、c11B-hero-dialog.json、
  c11B-plugins.json（空结果，rc.3 欢迎页所致）。
- CDP 台账：scripts/actions.jsonl、scripts/cdp-log.jsonl（每步守卫与控制台采集；
  已知噪音过滤后各轮 0 错误、0 条涉及本仓两包）。
