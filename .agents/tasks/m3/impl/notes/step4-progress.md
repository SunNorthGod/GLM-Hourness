# Step 4 progress (worktree .worktrees/m3, branch m3 fast-forwarded to main 72fa3d6)

Read: brief, addendum step 4 + §2.1 §2.5 §3.11, design.md §3.1.4 and step table row 4.
Draft backup in step4-draft/ is byte-identical to the uncommitted worktree files.

## Draft verdict (git-snapshot.ts was 609 lines; ended after outboundRefusal)
KEPT: rules.ts (fileWriteTarget, shellWriteOf, isFileWrite), graph-files.ts, shell.ts (simpleCommands, commandName export),
  main-agent-rules.ts, git-snapshot.ts recognition (gitInvocations, flagsOf, gitRisk, isKnownSubcommand),
  refusal codes + snapshotCorrection texts, execGit, gitCaller, tempIndex, SnapshotEntry, journalRoot/writeJournal, journalShas, outbound check.
REDONE in draft: wildcard refspec check (was static samples; now real snapshot refs), `config --bool` for mirror, `--mirror` removed from push risk,
  runner got stdin input, SnapshotEntry.ref optional.
MISSING in draft (written by me): takeSnapshot, guardGit, alias lookup, notice, main-agent.ts, wiring, tests, probe, docs.
INTERPRETATIONS: non-literal args judged by POSSIBLE table not blanket `both`; `unreadable` refusal for push with non-literal args;
  worktree remove with only ignored files still journals + short notice; clean -n "Would skip repository" accepted; stash drop/clear skip S;
  checkout write-out class = -f or `<tree> -- paths`; reset to descendant/same commit gets no K_h; push K_h when remote value is published;
  ensureIgnored AND .llm/.gitignore both called.

## Status
- [x] src/guard/git-snapshot.ts takeSnapshot/guardGit written (not yet compiled)
- [ ] compile + fix
- [ ] src/guard/main-agent.ts (installMainAgentRules: no-write, ask, git)
- [ ] design/index.ts wiring (isMainAgent, journal, health, inject notice) + DesignContext.on tools/pre-execute
- [ ] tests/design-host.ts: tools/pre-execute dispatch; tests/design-guard.spec.ts, tests/git-snapshot.spec.ts, contracts.spec.ts additions
- [ ] L3 probe scenario steps (scripts/probe glm-design-main)
- [ ] docs: ORCHESTRATION.md §6.1 etc.
- [ ] gates: build, preflight, test; commit with full message
