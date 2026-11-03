# 社区收录调研（2026-11-04）

结论：两个包在所有 DSH 社区渠道（dsh-plugin.org、四个 registry/目录、awesome 列表）均未收录；npm `dsh` 相关搜索搜不到。首因是 GitHub 仓库 `SunNorthGod/GLM-Hourness` 2026-11-03 才创建（stars=0），各爬虫渠道（2 小时至每日一轮）还没轮到。可主动修复的缺口三项，见 §5。

## 1. DSH Plugin Hub（dsh-plugin.org）——未收录，机制已查明

- 数据来源是 GitHub `dsh-plugin` topic（站点自述：「We collect plugins tagged dsh-plugin, sort them into eleven primary categories」），每日人工审核更新，无投稿表单——「tag your repo dsh-plugin to submit it」。
- 站内检索（site:dsh-plugin.org，2026-11-04）返回 10 个 GLM/ZCode 同类插件页（含竞品 dsh-zcode-start、dsh-zcode-cli-proxy、dsh-glm-mode），对 hourness / glm-zcode / SunNorthGod 零命中。本机对该站出站连接持续重置，未能直接实证 404 页；缺失结论基于站内搜索零命中 + 机制时序。
- 我们 topic 已具备（deepseek-harness, dsh-plugin, glm，GitHub API 实查）。**无需动作，等每日人工队列**；无自助加速通道。

## 2. 社区 registry 实况

| 渠道 | 实体 | 机制 | 提交入口 |
|---|---|---|---|
| DSH Plugin Registry | github.com/dshplugin-app/deepseek-harness-plugins（站 dshplugin.app） | 目录 repo 由过审条目生成；自动发现 + 人工 | 网页表单 dshplugin.app/submit（仓库 URL 必填） |
| dsplugin.app | github.com/vbarter/dsh-plugin-registry | Issue → Action 预检 → PR → 维护者合并；每 2h 扫 topic | Issue 模板 plugin_submission.yml |
| Harness Registry | github.com/majiayu000/dsh-plugin-registry（站 plugin.dshdesk.com） | 纯自动：topic + 根（或 dsh.bundles 路径）dsh.bundle 校验，2h 同步；curated 走 sources/curated.json PR | 自动发现，无需投稿 |
| dsh-plugins 组织市场 | github.com/dsh-plugins/dsh-plugin-market | plugins/ 目录加一个 JSON，push/PR 后自动聚合 | PR/push 到 main |
| Wanbinyu 社区目录 | github.com/Wanbinyu/deepseek-harness-community-catalog | 官方仓库讨论帖 #1045 跟帖报名，维护者核验 | 跟帖 |
| awesome-dsh-plugin | github.com/awesome-dsh-plugin/awesome-dsh-plugin（18.9k stars，CC0） | PR 加一个 YAML，README 双语自动生成 | PR |

收录要求要点（各 contributing/README 实读，2026-11-04）：

- awesome-dsh-plugin：`data/plugins/<owner>__<repo>.yml` 一文件；`url` 与仓库精确一致；`description.en` 必填；category 固定集；monorepo 子包 url 指子目录、name 写 `owner/repo#subname`、文件名 `owner__repo--packages-xxx.yml`。硬性要求：`dsh.bundle` manifest（「Most rejected submissions declare only dsh.client」）、真实代码、仓库创建满 1 天（CI 自动查）、活跃维护、`dsh-plugin` topic、描述属实。
- majiayu：根 package.json（或 `dsh.bundles` 列的路径）必须有合法 `dsh.bundle` 对象且 patch 为顶层 YAML 数组。当前快照 21,187 published / 4,532 pendingReview / 4,512 manifestRejected——我们不在其中（全文件零命中）。
- vbarter：topic 含 dsh-plugin 且根 package.json 有 dsh.bundle / dsh.plugin / 名称简介明显 DSH 相关，过预检直接收录，否则进 submissions 待审。
- 我们的状态：两个子包 package.json 均声明 `dsh.bundle.patch: ./cordis.patch.yml`（本地与 npm registry 双侧核实）；**根 package.json 无 dsh 字段**——majiayu 的根级校验认不出这个 monorepo。

## 3. npm 可发现性

- npm 实查：`text=dsh` 26,637 条，前 250 无我们；`keywords:dsh-plugin` 12,173 条，我们不在内。
- 我们的关键词缺 `dsh-plugin`（生态事实上的发现关键词；竞品几乎清一色带它，大量再带 cordis、deepseek）。修复 = 改 keywords 重发版。
- 搜索排序靠 quality/popularity/maintenance，新包排不进前 250 属预期；关键词只修「被匹配」，排名靠时间与 stars。

## 4. 官方侧

- 官方不收外部 PR、不运营 registry（dsh-plugin.org FAQ 与 dshplugin-app 目录均转述）：加 topic 就是全部官方动作。
- 官方仓库讨论区两条社区帖（#1045 目录帖 2026-08-14 起、#6142 dsplugin.app 发布帖）均无我们。

## 5. 缺口清单（按性价比）

1. npm keywords 补 `dsh-plugin`（两包同补，建议加 `cordis`、`deepseek`），发 0.3.1。
2. 等爬虫（仓库已满 1 天）：vbarter/majiayu 每 2h、dsh-plugin.org 每日；一周后复查。
3. 主动投稿三条通道可同时走（草稿见 submissions-draft.md，待人批准后提交）：awesome（PR，格式最明确，门槛已达标）、dsh-plugin-market（JSON PR）、dsplugin.app（Issue）。
4. 可选：根 package.json 加 `dsh` 字段（`dsh.bundles` 指向子包）解锁 majiayu 的 manifest-verified。须先读 `reference/deepseek-harness` 官方源码确认 schema，不猜字段；官方 loader 无此字段则放弃。
5. stars=0 是所有热门排序的劣势项，无速修。

## 可靠性

实读层：dsh-plugin.org 主页、两个 registry 仓库 README/contributing、majiayu curated.json 与 31MB 快照、vbarter 19.6MB plugins-lite、npm registry 元数据与搜索、GitHub API（仓库/topics/树），均 2026-11-04 实拉。推断层（已标注）：dsh-plugin.org 未收录来自站内搜索零命中 + 时序（未能直抓 404 页）；majiayu 把我们归在哪个桶未定。草稿中的 display name 与中文文案是新拟的，提交前定稿。
