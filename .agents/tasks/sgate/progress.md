# sgate：工具调用门里跑脚本一步（ORCHESTRATION.md §16.16）

M6 收尾：规则板的工具调用门（`src/rules/gate.ts`）今天把人同意过的脚本判为
「is not run by the tool-call gate yet」（`judge` 的 `notRunHere`），按条目的失败做法
放行或拦下；本车道让门真的跑这些脚本，并把脚本结局折进现有的拦下/排队/放行流程。

## §16.16 的解读（动手前写下的设计阅读）

### 什么触发脚本

调用经过门（`tools/pre-execute`，最外层）：内层门放行 → `rules:files-only` 放行 →
`gateEvents` 造事件（`gate.tool-call` 恒有；派发另有 `gate.dispatch`；执行行交了
主干前进另有 `gate.trunk-advance`）→ `judge` 按人设规则 + 档位代码条目判定。
动作是脚本且命中的规则：

- 人批准过（`approvedScriptRules`：条目在生效、钉住的哈希与条目写的一致、有本机批准
  时刻）→ 进 `pending`，由调用方（现在是 `checkCall`，本步起还有门）经共用执行器跑；
- 没批准、时间超出范围 → `refused`，按条目的失败做法判（事件声明的
  `gateOnErrorDefault`，缺省放行；`gate.trunk-advance` 声明拦下），不起进程；
- 规则自己的动作已经拦下时 `pending` 为空（judge 保证）：不起脚本进程。

### 脚本收到什么、回到什么

执行器（`src/loops/script.ts`，两个板共用的唯一起进程处）：核对文件字节与钉住的哈希、
写私有副本到 `.llm/loops/run/`、无 shell 起解释器、白名单环境 + `HOURNESS_BOARD=rules`
等、标准输入一行 JSON 信封（`board: 'rules'`、`entry` 为规则 id、`event` 为命中的
事件、`payload` 为事件载荷）、cwd 为项目根、超时杀整棵进程树、gate 队
（每项目并发 4、排队 16、排队时间算进超时、封顶 30 秒、`signal` 可中止）。
脚本退出码的意思由规则板定（§16.16 的表，`src/rules/script-run.ts` 已实现）：
0 放行；2 拦下（理由 = 标准错误前 500 码点，控制字符去掉）；3 排队（筛 `writes`
的规则按拦下）；其余/起不来/超时/哈希对不上/文件不在 = 失败，按 `onError`。
最先拦下的结束等待，其余被中止；返回时不留进程。脚本标准输出/标准错误只以拦下与
排队的理由进拒绝文字，不进流水与指标。脚本环境有 `HOURNESS_BOARD=rules`，脚本里
自查不再跑脚本（递归保险，`checkCall` 已有，门不调用 `checkCall`、无此路）。

### 结局怎样接进门的现有流程

门内（`judgeCall`）：`judge` 之后若 `pending` 非空，用 `runPendingScripts`
并排跑，命中折成 `RuleHit`（`verdict` 句子 / `scriptFailed`）与规则自带的命中
`combine`（拦下强于排队）。之后一切走现有路：block → 四段式拒绝 + 流水 +
followup + `rules.judged`；queue → `TicketDesk.defer`（等待单、20 张上限、转交、
过期全不变）；record/inform/allow 照旧。门不抛错：脚本一路若漏出异常，监听器的
catch 放行并降级行健康（与读状态/判定抛错同一出口）。

### 排队结局与等待单（本步必须一起对的另一半）

脚本退出 3 在门里开出等待单——这是本步新出现的单（此前门不起脚本、脚本规则排不了队）。
设计第 24 条（`.agents/tasks/rules/design.md` §1.4 第 24 条）：拥有单的宿主
至多每 60 秒把同一个信封再交给脚本一次，脚本退出 0 或规则不再生效时单解除，
agent 收到唤醒。若重判（5 秒一轮）继续「不跑脚本」，脚本排出的单会在 5 秒后被
解除，agent 重试 → 门重跑脚本 → 又退出 3 → 又开单 → 又解除：唤醒循环。
所以重判对脚本规则改为：

- 重判本身仍不按 5 秒起进程；脚本规则仍命中（批准、时间在范围、条件成立）时，
  把它算作仍然挡着（`pending` 进 `queued`），单保持；
- 距上次喂脚本 ≥ 60 秒（`fedAt`，开单那一刻算第一次）时重喂：用原事件的信封经
  `runPendingScripts` 再跑一次。退出 2 → 单解除、原因「rule r-x blocks the call
  now」、唤醒；退出 0 → 单解除、原因「the script of rule r-x allows the call
  now」、唤醒；退出 3 / 失败 / 超时 / 不跑 → 单保持（保守：上一次已知的判定仍是
  排队，脚本一次没答成不撤销它开的排队）；
- agent 自己重试且脚本放行（调用真的跑了）时，`passed` 把签名相同、由刚放行的
  脚本规则持有的 `deferred` 单收尾（人已经用重试回答了这张单，不再等 60 秒的
  唤醒）。只认脚本规则 id 相交，不碰人设规则与不做档的单。

### 不做（留在「没有做」清单）

超时之后脚本在后台接着跑与晚到的拦下（`d-script-timeout` 的后台一半：执行器的
`late`、违规流水 `mode: 'late'`、`rules.late-verdict`、当场告诉主 Agent）、
notices 的投递、探针场景 `rules-script`、agent 估计超时（`d-timeout-measured`）。

## 实施

- `src/rules/gate.ts`：去掉 `notRunHere`，接 `runPendingScripts`，`combine`，
  `passed` 带上放行脚本的规则 id；头注释同步。
- `src/rules/tickets.ts`：`rejudge` 带 `pending`；`Held.fedAt`；重喂与解除；
  `passed` 收尾脚本单。
- `src/rules/judge.ts`：删 `NOT_RUN_BY_THE_GATE` 与 `notRunHere`（两处调用方都不
  再用；不留死代码）；注释同步。
- `src/rules/proposal.ts`：cautions 一句改为「命令行、仓库脚本的自查与会话里的
  工具调用门都会跑它」。
- 测试：`tests/rules-gate.spec.ts`（真脚本真批准：退出 0/2/3、失败两向、超时、
  未批准不起进程、与 `checkCall` 文字逐字相同、自带拦截先判不起脚本）；
  `tests/rules-tickets.spec.ts`（脚本排队开单、重喂三向、`passed` 收尾）；
  `tests/rules-judge.spec.ts`（`notRunHere` 用例随选项删除改写）。
- 文档：§16.16 重写状态行与「没有做」段并补门的描述；§16.11、§16.6 余项段、
  §16.15 的 caution 引述、`HANDOFF.md` §10 M6 行同批改。

## 进度

- 2026-11-17：设计阅读完成，工作树与分支就绪；尚未动代码。
- 2026-11-17：实现完成。`gate.ts` 判完自带动作后经 `runJudgedScripts`（`script-run.ts` 新抽的共用入口，`checkCall` 与等待单重喂同走）跑 `pending`，结局折成 `RuleHit` 进 `combine`，放行时把说放行的脚本规则交给 `passed`；`tickets.ts` 重判把仍命中的脚本规则算作挡着（`pending` 进 `queued`），`Held.fedAt` 记上次喂脚本的时刻，`refeed` 每 60 秒用原事件重问：退 2 解除（原因 rule blocks now）、退 0 解除（原因 the script of rule allows the call now）、其余保持；`passed` 对签名相同、由刚放行脚本规则持有的 `deferred` 单收尾；`judge.ts` 删 `NOT_RUN_BY_THE_GATE` 与 `notRunHere`（无调用方，死代码）；`proposal.ts` 的 cautions 与 `script-run.ts` 的节号引用同步。单复用（defer）与子 agent 接手（takeOver）都刷新 `fedAt`：门刚才跑过脚本算一喂。
- 2026-11-17：L2 完成。`tests/rules-gate.spec.ts` 新 6 例（真批准真进程：退 0 放行与信封内容含无 `caller`、退 2 拒绝与 `checkCall` 逐字同文与流水、退 3 开单、失败两向、超时杀树、自带拦截不起脚本）；`tests/rules-tickets.spec.ts` 新 4 例（开单、60 秒重喂三向、重试收尾无唤醒），用字节不变、读旗标文件变向的脚本绕开哈希钉住；`tests/rules-judge.spec.ts` 删 `notRunHere` 用例；`tests/rules-proposal.spec.ts` 的 caution 断言随文案改；`tests/rules-script.spec.ts` 的 `approve` 改为调 `rules-helpers.ts` 共享的 `approveScript`（jscpd 克隆）；两处旧「门还不跑」用例改题为「未批准的脚本不被门跑」。棘轮：eslint 73、knip 18、jscpd 1，全平。
- 2026-11-17：文档同批改：§16.16 标题与状态行、意思表退 3 一行（门开单）、门跑脚本与重喂两段、「没有做」整段重写；§16.6 余项、§16.11 第 4 步、§16.12 排队与重判两段、§16.15 的 cautions 与余项、HANDOFF §10 M6 行。

