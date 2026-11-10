# face-migration progress

每批一行记录:批 id、提交、门禁、棘轮、红名单增量。设计见同目录 design.md(0.1)。

## Batch A — 方言 wire 层

- 状态:完成并提交。
- 内容:契约 `src/shared/face-policy.ts`(FACES_SERVICE 'glmHournessFaces',FacePolicySource/Registry + facePolicyOf 形状守卫);wire 层 `src/glm-llm/face-wire.ts`(wireFace = 投影 + buildToolExposure 拆分;wireFaceProjection = 角色层 + 方言别名层,无延迟);glm-llm 行提供注册表服务并把 `facePolicy` 惰性闭包交给 ZcodeAdapter;ZcodeAdapter.stream 开头应用 wireFace,attribution 与 encodeRequest 吃 wire 后的 tools;探针 adapter 同一组合后 dump;toolsearch 的 pre-step 监听器自算曝光态(expose()/hide() 删除);glm-prompt 的 assemble 监听器只重写节,节判断与 todo 资格改读投影面(rewriteToolFace 与 tools===undefined 降级分支删除);PreStepPayload 补 modelSelection、ToolsLike 补 schemas、InjectableServices 补 glmHournessFaces;AssemblePayload.tools 保留(批 D 随最后一个监听器删)。
- 迁移的 L2:dialect-wiring(面断言改 wireFace)、toolsearch(执行类测试先走一次 preStep)、glm-prompt(memorySectionApplies 改投影面)、aliases(read_image 测试改 wireFace)、glm-zcode(session-features 测试喂曝光前面)、design-host/design-persona(FakeAgent.stagedFace)、contracts/env-timeout/execute-trunk/graph-*/guard-followup/lessons-*/memory-row/rules-row(ToolsLike.execute 改批形 `{calls:[…]}`,模型发起的调用带 log,`:deferred` 内层不带)。
- 对 design §4.4 的偏差(rc.1 契约):`ctx.tools.execute` 在 rc.1 是批形 `execute({calls, agent, signal, log?, toolSet?, maxParallelToolCalls?})` 返回 `{results, additionalContexts?, concluded?}`,不再是 rc.3 的单调用 `{callId, name, arguments, agent, signal}`。DeferredToolCall 的内层执行改为一次 calls 单元素批(`call.callId:deferred`),语义保持:not available 抛错、additionalContexts 转 deferContext、concluded 转 concludeTurn、isError 抛 error.message;批不带 log(rc.1 无 log 的批不落会话事件,与 rc.3 内层不落事件等价)。假宿主 ctx.tools.execute 同步 rc.1 批形。
- 基线探针(改动前,0f4eb740 树):exit 1,场景全部启动无 stderr,检查阶段在 guard-lift 的 lifts.jsonl 读取处崩(run-probe.mjs:5111,红名单「guard-lift lifts journal」;根因是 rc.1 上 current 曝光态无人设置,DeferredToolCall 报 not enabled,脚本第 3 步后流程终止)。
- 门禁:build exit 0;preflight exit 0;test exit 0(全套绿);probe 549/579 exit 1(失败分类见下);eslint 73 suppressed / knip 18 / jscpd 1(全部持平,无新增压制)。
- 探针 30 个 FAIL 全部归因,四类:
  1. 批 B/C/D 目标面(10):memory worker、design idle/main(one main)GLM+non-GLM、design persona、exec dispatch/plan 的 worker 面——角色面监听器仍被 85970b6b 停用,等对应批迁移。
  2. exit-1 簇(13):guard request worker、design release/modules、exec dispatch(GLM/non-GLM)、exec plan/review/docs/merge/merge-upstream/modules——除 `scenario.status === 0` 外全部断言通过。机制:主 Agent 末回合结束后 goal-round-driver 仍排进 `<goal_round>` 起下一回合,headless 的收尾弃置把该回合 abort(disposed),rc.1 headless 的退出码 = 最后一个 turn/end 是否 completed → exit 1。批前基线(pmtRz4,同 rc.1)的 exec-dispatch/design-release/exec-plan 会话日志尾部完全同形——rc.1 既有行为,非批 A 回归;rc.3 时代(2026-11-04 探针)无此尾形。影响批 E 的三连绿门槛(见报告)。
  3. rc.1 规则票生命周期(3):rules-peak-wake、rules-handover×2——票落 `cancelled` 而非检查期望的 `cleared`、journal 多一条 ticket-update;批前基线产物同值,非批 A 回归。
  4. 上游运行时漂移(4):glm execution×2(rc.1 的 fs-observation-policy 行 `disabled: true`,rc.3 启用 → 从未读即覆写的拒绝路径不可达,Glob 顺序连带);metrics×2(metrics 行报「没有 agents 服务」,L4 既有 finding)。
- 红名单增量:guard-lift lifts journal 崩溃消失;glm 工具面/非 GLM 工具面/A3 deferral 公告/子目录工具面/GLM 公告两半转绿;design/execute/memory 面仍红(批 B/C/D)。新红 0。
- 提交:本行随批 A 提交(单一提交,代码+测试+本文)。
