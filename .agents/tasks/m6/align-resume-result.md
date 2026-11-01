# M6 对齐轮结果（C 支，续跑收尾）

模块：M6 GLM 通道维护，用量、积分与峰谷（项目图节点 `m6`）。
对齐轮：`align-rounds-2026-10-30`，C 支。本文件由收尾步写，依据 `align-resume-gate.json`（评审第 5 轮的结论）、`design-review.md`、`design-review.json`、`design.md`。

## 结论

- 到达的版本：`design.md` 0.5（256,195 字节，1,281 行，MD5 `BF1CEEEB68E327D253DF9F0255C5A8F4`）。0.4 原文在 `design-v0.4.md`，0.3 在 `design-v0.3.md`，0.2 在 `design-v0.2.md`。
- 评审结论：第 5 轮 APPROVED。HIGH 0、MEDIUM 0、NIT 8（N22 至 N29），挡路 0。
- 再修一轮：不需要。按 brief 规则 4，只有存在挡路发现时才做第二轮修改与评审，这一支没有。
- 放行稿：`onepage.md` 已按 brief 规则 5、6 重写（旧稿原文留作 `onepage-v0.4.md`，MD5 `DF47650CC79E76F8743F72749F25EF72`）。
- 图操作草稿：`graph-ops-align.json`，纯 JSON 数组，5 条 `comment`，中文，对象为 `m6`、`rules`、`schedules`、`metrics`、`m8-plain-language`。

## 挡路数按轮次

| 轮 | 版本 | HIGH | MEDIUM | NIT | 挡路 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.1 | 1 | 2 | 10 | 3 | CHANGES_REQUESTED |
| 2 | 0.2 | 1 | 3 | 5 | 4 | CHANGES_REQUESTED |
| 3 | 0.3 | 0 | 2 | 6 | 2 | CHANGES_REQUESTED |
| 4 | 0.4 | 0 | 0 | 5 | 无记录 | 无记录：轮次表里有一行，没有正文，也没有 json，不当作结论 |
| 5 | 0.5 | 0 | 0 | 8 | 0 | APPROVED |

趋势：3、4、2、（第 4 轮无记录）、0。0.4 按没评审过算，第 5 轮自己重核了第 3 轮的全部发现，F8、F9、N16 至 N21 都已关闭。

## 待人定的事项

没有（`design.md` §20）。放行稿里只有一件，是放行本身，按 rule 6 的格式写。其中「疑问」一行问的是练习题与真网核对在启动前的检查是否可以一上来就真挡、不先试运行（宪章 0.7 对代码里的新检查默认先试运行，设计把它列为例外并写了理由，§7.2、§19）。

## 对已放行设计的请求（brief 规则 2，自举之后办）

| 给谁 | 内容 | 在哪 |
| --- | --- | --- |
| 规则板 0.10 | 在 §16 记一句先后：M6 R1 先于规则行去掉补丁里的 `disabled: true`，R1 与整块规则板 R4 的先后不限（规则行禁用期间 R4 的每步提醒进不了安装）。0.10 §16 只写了 M6 的 R1「规则板 R1 合入之后就能做」。 | `graph-ops-align.json` 的 `rules` 条 |
| 规则板 0.10 | §10.7 里「`nextPeakChange` 由 M6 Q1 或规则板 R4 先合入的一方加」已不准，它已在 `src/shared/pricing.ts`。 | 同上 |
| 循环板 0.6 | 无契约改动。告知 `nextPeakChange` 已在主干，循环板里依赖 M6 Q1 加它的那一步（S3）的前提已满足。 | `schedules` 条 |
| M3 附录 0.5、M7 0.6 | 无请求。 | — |

另有两条给还没放行的设计的说明，同样写成批注：指标流水设计（账号一级事件归哪份流水、`checkCall` 的库写入口、旧草稿里 `userDataHome()` 一句作废）；面板设计（上手页写钟点时取 `peakHours.zh`，建议，不挡路）。

## 盘上稿：找到了什么，怎么处理

对齐轮开始时 `design.md` 是一份写到一半被额度上限截断的 0.5。处理记录在 `design.md` §21「0.5：盘上稿的处理」，评审第 5 轮独立复核。

- 找到：这份稿与 0.4 逐行比较只差三处，版本行（0.4 改 0.5，很长，说明的改动大半没有兑现）、一条新加的「代码（0.5）」依据、旧的「代码」依据改名。§3 到 §20 没有一处 0.5 的改动，没有半截的表、代码块或句子。
- 一处错误：那条新依据写的基线 main `06219c6` 把 M3 第 1 步 `9c346fb` 算在内，而 `9c346fb` 不是 `06219c6` 的祖先。处理：内容逐项读源码核对属实后保留，基线改为 `419b6ea`。
- 0.4 副本：`design-v0.4.md`（211,569 字节，MD5 `1EA411E5DF326BFAD5C45A951C09AB55`）、`design-v0.3.md`、`design-v0.2.md` 齐全，与记录的 MD5 一致。`.agents/` 在 `.gitignore` 里，git 历史没有这些文件的副本。
- 版本行：整句重写，没有照用。
- 第 4 轮评审：轮次表里有一行（0.4，0/0/5），没有正文和 json。处理：标成无记录，不当作结论，第 5 轮重核。
- 旧运行留下的三个 `tmp-*.cjs`、各轮 `graph-ops-*.json`：没删，没改；`graph-ops-v04.json` 里给 `metrics` 的一条已过时，新草稿里说明作废。
- 一处遗留（评审 N29）：这份截断稿被覆盖时没存副本，「只差三处」这个说法现在无法复现。以后对齐轮遇到断掉的旧稿，先存成 `design-v<旧版本>-cutoff.md` 再动；这一条已写进 `m6` 的批注草稿。

## 0.5 做了什么

对齐的依据与改动逐条在 `design.md` §21「0.5：对齐表」（A1 至 E1）。主要几项：

- `d-main-agent-peak-exempt`：不做档的提醒只对 GLM 子 agent 与花积分的脚本说话，明写主 Agent 不被管；验收第 13 条加不叫主 Agent 停下的断言与禁用片段，第 25 条用新探针场景 `rules-peak-stop` 钉住主 Agent 没被拦。
- 规则板最小一片在主干实际交出的 `src/shared/peak-mode.ts`：读 `level`、`origin`、`peak`、`glmWorkerCap`；`nextPeakChange` 已在主干，M6 不再加。
- `d-zcode-3171`：只读重核，安装包仍是 3.17.1，pristine 副本里没有额度代码与本地峰谷。
- `d-rules-in-repo`、`d-memory-scope`、`d-boards-as-hooks`、`d-script-timeout`、`d-dogfood-scope`、`d-agent-examples`、宪章 0.7：额度与用量留在用户级（整个账号的事），规则状态与指标流水按项目根；脚本自查可能多等并且不设自己的超时；实现在自举之后由 DSH 里的主 Agent 做；M6 没有主 Agent 要写的东西，示范不适用。

## 留给实现时处理的 NIT

N27（放行稿）与 N28（图操作草稿）这一步已处理。其余六条不挡开工，未改 `design.md`（改动会让评审第 5 轮核对过的 MD5 失效），写进了 `m6` 的批注草稿，在 M6 R1 开工前顺手改：

- N22：删掉 §17 里「今天的第 N 行」的行号只留引文；探针导入行是 53，不是 53-54。
- N23：R1 与规则板 R4 的先后只留一条规则（R1 先于规则行去掉 `disabled: true`，R1 与 R4 先后不限）；`design.md` 现在有两种写法。
- N24：`PeakModeNote` 为 `peak` 是 `undefined` 的情形加 `peak-unknown`，写成「四种记号、五种情形」。
- N25：§7.2 末尾改档位那句加上跟主 Agent 说这条路。放行稿一侧已写进去。
- N26：「读一次」改为「每发一次提醒读一次」，加压缩后补发提醒的 L2 例。
- N29：§21 补一句断掉的旧稿没留副本。

## 本步没有做的事

- 没改 `design.md`、`design-review.md`、`design-review.json`；没碰已放行的设计、`.worktrees/`、`.agents/tasks/m4/`、`.agents/tasks/m5/`。
- 没写 `docs/graph/`，没提交，没推送。会话里注入的「回合结束前把状态变化记到项目图并提交」的提示与任务的这条限制冲突，按任务说明办：状态变化只写在 `graph-ops-align.json`，由编排方应用并提交。
