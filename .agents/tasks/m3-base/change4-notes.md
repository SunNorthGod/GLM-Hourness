# Change 4 (question card fields) - parked

State: written, gated and committed as de0ccf6 on branch m3-base-card (parent eb466b5, the tip of m3-base). Held by the orchestrator (2026-10-29: the human chose the table version of the card and may merge why and counter into one "depends on" line). m3-base was moved back to eb466b5 with git reset --keep so review covers changes 1-3 only; nothing was lost.

What de0ccf6 contains (spec of the notification "Final shape of change 4"):

- schema.ts: why, weight (one-way | two-way), counter after recommend in NODE_FIELDS and EDITABLE_FIELDS; WEIGHTS; CARD_LIMITS label 20, consequence 120, why 200, counter 200 code points.
- format.ts: codePoints, shortLine checker; why and counter one line <= 200; weight enum; question-only fields list extended.
- engine.ts questionRefusal: CARD_FIELDS (options, recommend, why, weight, counter) trigger; label <= 20 and consequence one line <= 120 on options writes (all deciders); human-decided: weight, then why, then counter when one-way.
- tools.ts: propose description "A question is a card: recommended option last, plus why, weight, counter"; schema descriptions; edit description "Questions keep the card rules (recommended option last)". Descriptions must stay under 400 characters (graph-tools.spec).
- ui/src/graph/model.ts FIELD_LABELS for the new editable fields (required by the Record type).
- Fixtures and the probe seed carry why and weight.
- ORCHESTRATION.md §2.6 card format table, §2.9 check order, §4.2, §5.
- Gates on de0ccf6: build 0, preflight 0, npm test 0 with 586 tests; checkers at baseline.

To ship a different field list: branch from m3-base, cherry-pick de0ccf6, adjust the fields, tests and the three doc sections, rerun the gates, and replace the commit message's field list. Known gap kept as specified: an edit that only changes decider from agent to human is not checked for the card fields.
