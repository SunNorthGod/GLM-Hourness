# m4-reqcard 车道进度

2026-11-19 开工。main 2818d130，分支 `m4-reqcard`（工作树 `.worktrees/m4-reqcard`，node_modules junction 到主检出）。

## 0. 开工发现（改变车道范围）

节点 `m4-request-card` 的实现主体已在 main：11306b6e（2026-11-04，G4，原 m4 分支）
随 0553cd40 / cdbcdffb 入树；M7 接缝（execute-rules.ts 的 peekGrant/outsideDenial）、
自动推进停等（drive.ts D3）、晨报申报行、ORCHESTRATION §5/§6.1、L2（guard-request
等）与 L3（guard-request / guard-request-plain / guard-request-refuse /
guard-request-goal / guard-request-worker）都在。图节点停在 `approved` 没收口。
逐条判定与证据见 design.md §2。车道实际剩余：第 10 条面板半边（plain-ui 0.9
留给 M4）与 ROADMAP M4 一行。

## 1. 提交

| 提交 | 内容 |
| --- | --- |
| 84f53027 | 设计补记 design.md（发现、逐条判定、剩余工作、偏差） |
| 486c4369 | 第 10 条面板半边：graphLive `requests` 折叠（stateVersion 4）、shownRequestOf、needsOf request 类与 2 小时上限、RequestCard 渲染（首页与需要你页）、L2 |
| aeea1d59 | ROADMAP M4 加申报通道一行 |

## 2. 门禁（worktree 内跑，日志写主检出 .llm/logs/rc-*.log）

收尾全量重跑（HEAD 0a76b958），退出码直传，全部通过：

- build 0 / preflight 0 / test 0；棘轮 eslint 69 suppressed / knip 18 baseline / jscpd 1 clone 持平。
- 日志副本（主检出 .llm/logs 的 rc-*.log 被并行车道反复删除，系统临时目录的副本为持久证据，
  SHA-256 前 16 位）：rc-build 1b75f8ed7bf76a9e、rc-preflight 9e2798806e735d3f、
  rc-test c20331e434901a02，路径 `%TEMP%/m4-reqcard-rc-*.log`；收尾时已回拷主检出。
- 注：tests/lessons-seed.spec 需要 `.agents/tasks/m5/lessons-seed.json`（不进 git 的
  设置文件），已从主检出复制到 worktree。
- 首轮跑出的两个棘轮新发现已修：knip 报 ui/src/graph/common.tsx Bold 的多余导出
  （RequestCard 收进 common.tsx 后内部化）、jscpd 报 tool-names.ts 两段工具结果解析
  样板重复（提为 resultObject 一份）。

## 3. 待人动作（编排方转交）

- m8-plain-language 验收第 6 条「需要你只列三种事」→「四种事」：验收只能由人改
  （plain-ui 0.9 预留），本车道未动图。
- 桌面版 L4：需要你页与首页的申报卡（题目 + 四行 + 回话指引），面板不批；建议与
  U6/U7 的 L4 攒一批。
- brief shaping guidance 与落地实现的偏差（同意词表独立于 AGREE_WORDS）记录在
  design.md §4，属改权限，本车道未动，待人裁定。

## 4. 探针

- 第 1 次（03:01 起跑，slot 等 ~20 分钟）：595/620，25 败。根因是本车道自己的错误：
  探针在跑的同时我重跑了 `npm run build`（clean-dist 删 packages/*/dist，探针场景经
  junction 加载），后半段场景 0 request、runtime 起不来。25 个失败全部是这个形状
  （exec skeleton / exec walk / user graph / guard-request-worker 的 worker steps 0），
  与改动无关。证据 `$TEMP/m4-reqcard-rc-probe.log`（运行目录
  `glm-hourness-probe-2026-11-18T19-01-34-553Z-jRmxCg`）。
- 第 2 次（05:2x 完成，干净重跑，跑前清 GIT_CONFIG_*，无并发构建）：**620/620，exit 0**。
  证据 `$TEMP/m4-reqcard-rc-probe2.log`，回拷主检出 `.llm/logs/rc-probe.log`。
  地板 620 持平；车道不加新 L3 场景（五条 guard-request 系列已在 run-probe.mjs）。

## 5. 收尾清单

- [x] 设计补记
- [x] 实现与 L2
- [x] ROADMAP
- [x] 收尾门禁重跑（build/preflight/test，日志 rc-build/rc-preflight/rc-test.log + 临时目录副本）
- [x] 全量探针 620/620（runner 自管锁，跑前清 GIT_CONFIG_*，证据留系统临时目录）
- [x] 推分支 origin（代理 127.0.0.1:7890；不推 main、不合并 main）：0818c510 推成 origin/m4-reqcard
