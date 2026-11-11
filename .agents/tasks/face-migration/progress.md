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

## Batch B — 角色层 + design

- 状态:完成并提交。工作树带着上一车道中断的批 B 半成品(5 文件),按蓝图审齐后续做:修三处中断遗留(knip 新导出 MAIN_AGENT_REMOVALS/ORDINARY_REMOVALS 改模块内;jscpd 新克隆 faceSourceOf 助手提去 design-host;人设节并入 prepend 身份监听器破坏 design-persona 钉死的两种安装次序与节序——恢复双监听器结构,身份 prepend、人设行内非 prepend,面改写删净)。
- 内容:design 行面改写迁 wireFace 角色层。`src/design/role-face.ts` 重写为 `designFaceSource`(FacePolicySource:主 Agent removals={write,edit,ask_user_question} + str_replace_editor→view narrowing;其余会话 removals={propose_to_human,record_human_answer};isMain 经 agents 服务按会话 id 活读,解不出=不去,roleForStep 的降级语义照旧);`src/design/index.ts` 删其 assemble 面监听器(连 85970b6b 的 tools===undefined 降级分支),source 经 `ctx.inject([glmHournessFaces])` 在注册表到达时上——glm-llm 行激活在后也等得到(本地 lab:两只假行+真 runtime bin,延迟 inject 实触发,排除宿主隔离假设);facesNote 改纯信息不降级(无 GLM 通道的安装没有 wire 层,面保持全集是设计态,design §4.6「健康语义不变」,探针 hourness-only 的「已加载,本会话未触发」钉住);注册失败仍 warn 出声。design-host 的假注入器补 glmHournessFaces(与 store 同一实例);design-mode/propose-to-human 的面断言迁 source.removals/narrowing + wireFace(wireFace 输入补 propose/record 两工具)。
- 探针修正:runScenario 在带 glm 包的 profile 上启用 `glm-hourness/glm-llm`(行随 bundle disabled,桌面 profile 开它,探针照做;探针 adapter 走 glm-probe/deepseek-probe,注册的 glm-zcode 路由无人用)——此前无人提供 glmHournessFaces,角色层在探针里结构性缺席(探针 1 的 30 处 stderr 警告即它);probe-llm 在渠道行缺席时补提供注册表(probe-hourness 单包 profile 的非 GLM 场景照常断言角色面,design §0)。
- 门禁:build exit 0;preflight exit 0;test exit 0;probe 553/579 exit 1;eslint 73 suppressed / knip 18 / jscpd 1(全部持平,无新增压制)。
- 红名单增量(对批 A 基线 30):转绿 5——design idle(GLM+非 GLM)、design persona(GLM+非 GLM)、design one-main(此刻连 fork 检查也过,rc.1 headless 尾形是竞态,批 A 记录的 exit-1 簇时红时绿)。仍红 26 全部归因:memory worker(批 D)、design main GLM+非 GLM 与 exec dispatch/plan 的 worker 面 5(批 C 的 execute source 负责普通面无 execute 工具这一半)、rc.1 exit-1 簇 13、规则票生命周期 3、上游运行时漂移 4(glm execution×2、metrics×2)。新红 0。
- 提交:本行随批 B 提交(单一提交,代码+测试+探针+本文)。

## Batch C — execute

- 状态:完成并提交。
- 内容:`src/execute/faces.ts` 的 `faceOfRole(tools, role)` 重写为 `removalsOfRole(role): ReadonlySet<string>`(纯函数,角色→要去掉的注册名集合:非主 Agent 去 execute+operate 工具、非 worker/非 reviewer 去 worker 工具、reviewer 去 submit_plan、派发链去九个图写),新增 `executeFaceSource(deps)`(removals 按 agents 服务解会话,解不出=不去;roleOfAgent 照旧活读主 Agent/登记/派发链,不再导出);`src/execute/index.ts` 删其 per-agent assemble 面监听器与 installed WeakSet(source 一次注册覆盖全部会话,不再需要 agent/pre-step 兜底装面),经 `ctx.inject([glmHournessFaces])` 注册 source,facesNote 与 design 同款信息注(不降级);dispatch 通知照旧(安装点改名注释)。execute-row 的面断言迁 removalsOfRole。
- 门禁:build exit 0;preflight exit 0;test exit 0;probe 558/579 exit 1;eslint 73 / knip 18 / jscpd 1(持平)。
- 红名单增量(对批 B 的 26):转绿 5——design main(GLM+非 GLM,普通面无 execute/operate 工具这一半随本批闭合)、exec dispatch/plan 的 worker 面(GLM+非 GLM 共 3)。仍红 21 全部归因:memory worker(批 D)、rc.1 exit-1 簇 13、规则票 3、上游漂移 4。新红 0。
- 提交:本行随批 C 提交(单一提交,代码+测试+本文)。
