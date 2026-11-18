# probe-singlerun 车道进度

任务：给 `scripts/probe/run-probe.mjs` 加 `--only <name>[,<name>…]`，只跑点名的场景；默认行为（无旗标）逐字节不变。仓库 main 起点 `2818d130`，工作树 `.worktrees/probe-singlerun`（node_modules 为指向主检出的 junction）。

## 实现形状

- 参数解析（严格）：只认 `--only`（`--only=a,b` 或下一参数），值按逗号拆、去空；其余参数（含 `--help`）一律以 2 退出并打印 usage——此前 `npm run probe -- --help` 会真跑全套件，此处关死。名字校验发生在取锁与生成 profile 之前。
- 已知场景名来自对本文件自身 boot 位点的静态扫描（`runScenario`/`runPath`/`designScenario`/`execScenario`/`stopProbe`/`runFailure` 的字面量与场景名常量，ablation 的 `ablation-${arm}` 按 arms 数组展开）。扫描 fail-closed：boot 位点漏扫只会让该场景选不了（可见），不会让不存在的名字被接受。
- `runScenario` 对未选中场景不启动宿主、不进 `scenarioNames`，返回 stand-in（自相似 Proxy）：属性读返回自身、迭代为空、字符串化空串、`toJSON` 返回说明文字、`then` 不可调用（`runPath` await 的结果否则按 thenable 挂死）、展开产生结果形状（ownKeys 含函数目标的不可配置键，Proxy 不变量）。跨场景清扫（net、quota、data）遍历 `scenarioNames`，自动只覆盖启动了的场景。
- 检查归属表 `CHECK_SCENARIO_PREFIXES`（按标签前缀）+ `CHECK_SCENARIO_LABELS`（同前缀跨场景时按整标签）+ `calibration ablation <arm>` 规则；空数组 = 与启动无关（机器守卫与跨场景清扫），恒评。没登记的检查按未选中跳过、摘要点名——新检查必须登记，跨场景断言不会在子集上悄悄通过。表由全部 620 条运行时标签核对过（桩运行 + 静态展开，0 未登记）。
- 摘要：`--only` 下打印 `probe: partial run (N scenarios: …)`、通过/跳过两行（跳过里注明未登记条数与未启动场景数）、一句「net、quota、data 清扫只覆盖本轮启动的场景」；退出 0 仅当选中的检查全过。无旗标路径输出与原版逐字节一致。
- 桩安全修正（全桩模式下实跑撞出，逐处守卫，全量跑行为不变）：env-checks-timeout 第二段的 `approve` 读第一段 boot 写的提案，加 `booted('env-checks-timeout')` 门；`metricsChecks` 的 `readdirSync(ws/.llm)` 加 existsSync；`questionChecks` 的 `nodeOf` 套 try 并按 `interviewChecks` 既有约定返回 `{history: []}`；glm execution 的 `unread.txt` 与 guard lift 的 `lifts.jsonl` 读加 existsSync；`glm peak`/`non-glm peak` 的 detail 里 `new Date(clock).toISOString()` 加 `Number.isFinite` 门（与 rules-peak-wake 同式）。
- sandbox 检查（「launcher 重写了每个生成的 profile」）在 `--only` 下按实际 boot 过的 profile 收窄：runScenario 登记 `bootedProfiles`，期望集合 `expectedRewritten = 全量或 boot 过的`，泄漏检查（生成的名字出现在真实 profiles 目录）保持全量。
- 跨场景依赖登记的例子：`env-checks-timeout` 的三条检查同时要求 `env-checks-timeout-run`；`glm-only` 的 glm:memory 对照要求 `glm`；`rules-page: glm-rules` 的面板对照要求 `glm`；`health`/`graph row`/`subdirectory instructions` 等按整标签拆。

## 验证

- 门禁（日志在主检出 `.llm/logs/`）：build `ps-build.log` 0；preflight `ps-preflight.log` 0；test `ps-test.log` 0（4014 测试 0 败）；棘轮 eslint 69 / knip 18 / jscpd 1 持平。首次 test 有 3 败，是工作树缺 git 忽略的 `.agents/tasks/m5/lessons-seed.json`（tests/lessons-seed.spec.ts 的本地夹具），从主检出复制后全绿。
- 桩安全迭代：`ps-dev-stub.log`（全桩、无旗标；撞出并修掉 6 处后跑完，620 条全评，36 过 584 败——全部失败是桩上的预期形状）；`ps-dev-stub2.log`（全桩 + `--only glm-flash`，分类路径全通：610 跳过、0 未登记、partial 摘要三行齐全）。桩运行以工作树内的临时改（两处 DEV-TEMP）强制，验证后已还原。
- `--only nosuchscenario`：退出 2，列最接近的名字（`ps-probe-unknown.log`）；`--help`、`-x`、空值、`--only` 缺值、混合未知名均 2。
- 部分跑：`--only hourness-only,client-modules` 与 `--only glm-flash` 真实启动，选中检查全过、退出 0、摘要写 partial（`ps-probe-partial1.log`、`ps-probe-partial2.log`）。
- 落地全量：`ps-probe-full.log`，620/620、退出 0（floor 不动）。第一轮全量（同日志的历史内容被第二轮覆盖；当时 618/620）在两条外来探针并发时跑出，2 条红都在 `rules-peak-stop` 的高峰钟窗口（30 秒内复活的时刻窗与唤醒文本变体），属并发负载下的计时摆动，非本改动引入；等外来车道跑完、双槽清空后单机重跑即全绿。锁协议按设计工作：本车道第二轮等过 slot 1（外来 pid 54364/54464 持有）后取 slot 2，单机轮直接取 slot 1。

## 纪律

- 不碰 `.worktrees/ablation-trial`、`.worktrees/comms-split`、主检出跟踪文件、人的 `~/.dsh` 与桌面；探针锁 runner 自管，未手删锁；每次探针前清 `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0`/`GIT_CONFIG_VALUE_0`。
- 工作树 `.agents/tasks/m5/lessons-seed.json` 为主检出夹具副本（git 忽略，不入提交）。
