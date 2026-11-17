# postwave-audit progress

- 2026-11-17T22:35:52+08:00 start: wave 4be028e8..0c5ebd21 (7 commits). Stage 1: gate deferral semantics.
- Stage 1 done: deferral semantics audited (gate.ts, execute-rules.ts, rules/gate.ts, followup.ts, request.ts; DSH pipeline.ts + rc.1 exports). No blocker; notes on silent-drop API, partial-commit onDeny, rules-row journal swallow. DSH payload identity + ordered batch pre-execute verified from reference source.
- Stage 4 done: withTakeoverLock TOCTOU — stale-eviction unlink race found (mutex double-hold, bounded harm via stat identity); main takeover TOCTOU closed. Orphan .trash-* noted.
- Stage 2 done: probe diff (666 lines) reviewed; only new async-settle-dependent assertion = exec-review pass-round (dispatchComments>=4 + doing/done) — same class as known red, coupled to the answer-race lane. pluginStderrClean breadth noted. 45s bound + dispatchChild>0 pre-existing.
- Stage 3 done: DESIGN 2.4a rows, FACTS rc.1 rows, HANDOFF counts (17/21+2=23) all verified against packages/*/cordis.patch.yml, src/shared/health.ts, reference/dsh-desktop-0.2.2-rc.1 exports, package.json, wake.ts:82, script-run.ts:75. All pass.
- Stage 5 done: m7-6..8 doing / m7-9 done — judged defensible, recommendation to keep; evidence (47782092, report-metrics.spec.ts, rollback filters) verified.
- findings.md written (F1-F11 + clean list + graph recommendation). Left uncommitted per instructions. Probe NOT run.
