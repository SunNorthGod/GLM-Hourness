# lessons-enable 运行报告（2026-11-06，workflow `wf_7ed94028a156d1cb`）

结论：经验行 `glm-hourness/lessons` 在 main 上出厂启用。落地提交 `bad85a49c650503186b9b177f45167dbfd721b2e`（"feat: ship the lessons row enabled"），已推到 origin 与 github。人的桌面 profile 上的 L4 全部通过，没有改回禁用的提交。工作树与分支已清理。

## 缺的与补上的

审计（`audit.md`，基于 `origin/main` `eb45707a`）：

- lessons-3 的 (a)–(c) 已由 L2 与 2026-11-05 隔离实例 L4 满足；(d) 按设计读法（经验行或记忆行有一个就显示）满足。页面代码不改。
- 欠的：经验行出厂禁用，人的真实 profile 上从没做过 L4；启用门的 L3 结论来自较早提交上的 420/420，需要在新合并树上重跑。
- 两处字面差异按设计不改：(d)「两行都装上」与「有一个就显示」；「你说过不用记的习惯」末行没有「或在输入框打 ……」一半（`/memory` 没有对应的人命令）。

`bad85a49`（基点 `80f62ab`，8 个文件，+24 −11）补上的：

- `packages/hourness/cordis.patch.yml`：lessons 行删掉 `disabled: true`，`inject: [tools]` 保留，注释改写为出厂启用。
- L2：`tests/lessons-row.spec.ts`「the row ships enabled in the orchestration patch (no disabled key) and declares the tools service」。
- L3：`scripts/probe/run-probe.mjs` 新断言「lessons: the row ships enabled since the lessons enablement」，不带覆盖的启动场景在两条路由上都列出该行已加载；`LESSONS_ROW` 覆盖保留。
- 文档同批：DESIGN.md 行表与故障表、ORCHESTRATION.md §8.6 标题、HANDOFF.md 行表与 M5 行、DEVELOPMENT.md §14 第 5 条（补 `glm-lessons-failure`、`non-glm-lessons-failure`）、`packages/hourness/README.md` 行表。

## 门禁（工作树 `.worktrees/lessons-enable`，提交说明所记）

| 门 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run build` | 0 | |
| `npm run preflight` | 0 | |
| `npm test` | 0 | |
| `node scripts/check-lint.mjs` | 0 | eslint 73 压制、knip 18、jscpd 1，与基线相同，没有上升 |
| `npm run -s probe` | 0 | 437/437；经验相关 27/27：glm-lessons 7、non-glm-lessons 7、glm-lessons-failure 6、non-glm-lessons-failure 6、出厂启用断言 1 |

落地步 `git merge origin/main` 为 "Already up to date."，没有带入改动，门禁没有重跑。合入后主检出 `npm run build` 退出码 0。L4 步在 main 上跑 `node --test tests/lessons-panel-model.spec.ts`，退出码 0，18/18。

## 评审

一轮（`review.md`），对象 `origin/main...lessons-enable`，没有挡路发现，判定可合入。核对项：翻开行、L2 与 L3 钉住出厂启用、(a)–(d)、文档同批无残留的出厂禁用说法、门禁齐全、8 个文件 UTF-8 无 BOM、没有超出简报的改动。

## 落地

- `git fetch origin` 0；`git merge origin/main` 0（Already up to date）；主检出入库文件干净（`git status --porcelain --untracked-files=no` 0，输出空）；`git merge --ff-only lessons-enable` 0，`80f62abf..bad85a49`。
- `git push origin main` 0、`git push github main` 0，都是 `80f62abf..bad85a49`，只推 main，没有强推。推送时两端 `ls-remote` 都是 `bad85a49c650503186b9b177f45167dbfd721b2e`。
- 本报告写成时 main 为 `870d223a697a82c8398e19e7d27dc0f70e2efd82`，`git ls-remote origin main` 与 `git ls-remote github main` 都返回该 sha（退出码 0）；`bad85a49` 是它的祖先（`merge-base --is-ancestor` 0），之后只有 `docs/graph/` 的提交。main 上 lessons 行块没有 `disabled:`。

## 桌面 L4（`l4.md`，人的 userData，CDP 9333，构建 `bad85a4`）

| 项 | 结果 | 依据 |
| --- | --- | --- |
| (a) 页面内容 | 通过 | 本项目页「本项目 21 条经验」，21 条都有坑、解法、「1 天前确认」、情况标签、证据、「要改」行。本项目没有候选、收起或删掉的经验、记忆，这几部分在临时工作区 `glmh-l4-ws` 用经真实流水追加写入的夹具看：候选数、「agent 收起的」「你删掉的」「你说过不用记的习惯」默认折起（`open: false`）、偏好原话、「原话未核对」、确认的习惯带问话与「要记的」、「内容在你确认之后改过」、事实带出处与强度 100%、汇报细度一行；10/10 带「要改」 |
| (b) 没有控件 | 通过 | 页面根元素内按钮、输入、表单、开关、`role=button`、contenteditable、链接都是 0，只有折叠节的展开；L2 静态检查 18/18 |
| (c) 15 秒内更新 | 通过 | 临时工作区追加 `retire`、`delete` 后 1.95 秒页面更新 |
| (d) 页脚 | 显示的一半通过 | 两行都加载时页脚有「经验 ›」；不显示的一半要改 profile 才能看，本步没做，由 L2 钉住 |
| `lessons_query` | 通过 | 会话 `session-5bae619b-…`（GLM-Hourness 工作区，`glm-5.3-flash`）一次调用 `{"file":"src/guard/shell.ts"}`，返回 `L-04dca2`、`L-7247e8`，都 active，回合正常结束 |
| 控制台 | 通过 | 0 条异常；没有出自 `dsh-hourness`、`dsh-glm-zcode` 的错误或警告；只有宿主自己的 inspector ingest 连接失败与旧会话的 `changes.summary` 404；没有新 crash log |

`/hourness-status` 写 lessons 行「已加载」。桌面版经一次 `Browser.close` 关闭（无确认框），dsh-auth cookie 11 条，没有动；17:50:42 用人的 userData 重启，仍在运行（pid 84912）。桌面锁 19:11:34 释放。

## 行状态

出厂启用。启用门的 L3 四个场景在合并树上 27/27 通过，桌面版首轮在人的 profile 上全部通过，没有触发「不过就改回禁用」的条件。

## 清理

- 工作树：先删掉 `.worktrees/lessons-enable/node_modules` 下 340 个 junction（只删链接本身，主检出 `node_modules` 顶层条目删前删后都是 100）。`git worktree remove` 因路径过长删目录失败（退出码 255），工作树登记已去掉；确认目录下没有剩余的 reparse point 后用长路径安全的方式删掉剩余目录（退出码 0，目录不在），`git worktree prune` 0，`git worktree list` 里不再有该工作树。
- 分支：`git branch -d lessons-enable` 0（"was bad85a49"，已合入 main）。L4 通过，桌面步没有建改回禁用的分支，没有别的分支要删。
- 主检出入库文件干净（`git status --porcelain --untracked-files=no` 0）。
- L4 夹具：临时工作区的 `lessons.jsonl`、`memory.jsonl` 与 `~/.dsh/glm-hourness/memory/` 已删；主检出 `.llm/lessons.jsonl` 仍是 21 行。侧栏留有两个测试会话；原始证据在 `.llm/lessons-l4/`（被忽略）。

## 不挡路的后续

1. 本项目真实产生候选、收起或删掉的经验、记忆之后，可以在本项目页复看 (a) 的这几部分。
2. 图记录（落地 `bad85a49`、`lessons-3` 的 L4 通过）由编排方写，本运行没有碰 `docs/graph`。
