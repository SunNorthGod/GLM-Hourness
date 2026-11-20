# reading-1120 lane brief

Weekly engineering reading round (graph node `reading-digest`, due: last round
2026-11-05, today 2026-11-20 — two weeks of new material). Research-only lane:
no code changes, no merges, no pushes of main.

## Sources (node body's contract)

- Anthropic Engineering (https://www.anthropic.com/engineering) + Anthropic
  Research agent articles
- OpenAI Cookbook agents topic (https://cookbook.openai.com/topic/agents) +
  OpenAI agent guidance

Read what is NEW since 2026-11-05 (last round's file:
`.agents/tasks/reading-digest/2026-11-05.md` — its conclusions list tells you
what was already covered; skim its per-article titles to avoid re-summarizing).
If a source's index is hard to enumerate, fetch the index pages first, pick
agent/harness-relevant posts, then read each.

## Per article (node body's contract)

- 转述摘要 + 链接；引用不超过 30 个词
- 对照面：harness、guard、项目图、压缩、记忆、派发、评测与标定——每篇写清
  对本项目有什么用、和本项目定案冲突的地方（冲突要指名是哪条定案，如
  d-chat-not-cards、d-ui-look-not-operate、探针地板纪律）
- 值得改的提成待决或提议交给人，**不直接改代码**——你的产出是 digest 与
  提议，实现是后续的班

## Deliverables

1. `.agents/tasks/reading-digest/2026-11-20.md` — this round's digest（每篇一
   节：标题、链接、转述摘要、对照结论）。沿用上次文件的格式。
2. 分支 `reading-1120`，digest 与（若有）`.agents/tasks/reading-1120/` 记录随
   分支提交，推 origin（`https_proxy=http://127.0.0.1:7890`）。不推 main。
3. 汇报编排方：篇数清单、每篇一句对照结论、值得提成待决/提议的条目（编排方
   复核后落图批注与待决，不由本车道写图）。

## Discipline

- 文件与 commit 零人设零语气词；引用限额（≤30 词/篇）是硬约束——转述为主。
- 读不到的文章如实记（付费墙/404），不编造内容；每篇结论都注明你实际读到了
  哪一层（全文/摘要/只有标题）。
- 不碰仓库跟踪文件（digest 与任务目录除外）；不碰桌面；不碰人的鼠标键盘。
