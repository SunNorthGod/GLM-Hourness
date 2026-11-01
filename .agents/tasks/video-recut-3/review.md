# Vertical promo short, third cut (iteration r3): title, end card and 24-bar score

The Short composition goes from 40 s to 48 s. Bars 1-2 are a title (GLM-Hourness, then 「DeepSeek Harness（DSH）的插件」), bars 3-10 are the old pain-and-turn section re-timed to one new element per beat, bars 11-22 are the graph and weekly-card section moved four bars later, and bars 23-24 are an end card that fades out with the score. `make-score.mjs` is extended to 24 bars; bars 3-22 carry the previous 20 bars note for note. The change is uncommitted in the main checkout. All five findings of the r2 review are fixed, and I re-checked the render, the loudness, the score and all 25 frames independently of `checks.md`.

Watch for: (1) `checks.md` records no root-gate results, although the brief's done-when lists them (confirmed; the root gates cannot see `video/`, so the risk is low); (2) five untracked files outside `video/` (three under `.kiro/hooks/`, `msg-refdir-gate.txt`, the root `package-lock.json`) sit in the working tree and must stay out of the commit (confirmed present, predate this change); (3) the AAC audio track of `out/Short-2k.mp4` peaks at -0.95 dBFS, 0.05 dB over the -1 dBFS ceiling, while `score.wav` itself is at -1.000 dBFS (confirmed; the record's -1.0 is a one-decimal rounding).

**Verdict**: APPROVED

## High-level view

The structure follows the brief. `Root.tsx` takes the duration from `BARS * BAR` (1440 frames), every Sequence boundary is on a bar line, captions run on bars 3-22 only, and the title and end card carry their own text. `Open.tsx`, `End.tsx`, the `immediate` caption prop and the green bubble variant are gone, and every remaining export is imported somewhere.

In bars 3-10 each beat brings in one element: the bubble, then one red line per beat, the clock, the label 「待返工」 on bar 4 beat 4, one pile row per beat in bar 5, one chat exchange per beat in bars 6-7, 「✓ 测过了」 and the empty evidence box on beats 2 and 3 of bar 8, and the parts of the name on beats 2-4 of bar 9. The label no longer shares a beat with the first pile row (r2 finding 5).

Every on-screen claim traces to `docs/CHARTER.md` or the `m3`/`m7` one-pages; the pain lines are framing and the README says so. The weekly card carries the pill 「示意，暂无真实数据」. No text on screen says the main agent cannot write files, and the README keeps the reason (M3 review finding S4-1).

The score keeps bars 3-22 identical at event level and measures -15.0 LUFS integrated. The README table and rules match the code, including the soft reverse cymbal in bar 2 (r2 finding 1). `Sample`, `make-music.mjs`, `get-soundbank.mjs`, `render.mjs`, `parts.tsx`, `theme.ts` and `Graph.tsx` are untouched.

<details>
<summary>Issues (6)</summary>

1. **Root-gate results not recorded** (confirmed) — `checks.md` lists lint, score, render, probe, loudness and frames, but no `npm run build`, `npm run preflight` or `npm test`, which the done-when requires. Run them before the commit and add the exit codes to the record. They cannot be affected by this change: `eslint.config.js` ignores `video/`, and `.jscpd.json`, `knip.js` and `tsconfig.json` do not include it.
2. **Untracked items outside `video/`** (confirmed present, predate the change) — `.kiro/hooks/graph-on-workflow-launch.json`, `.kiro/hooks/graph-sync-reminder.json`, `.kiro/hooks/reading-digest-weekly.json` (Oct 28-29), `msg-refdir-gate.txt` (Oct 30, 108 KB) and the root `package-lock.json` (Oct 30). No tracked file outside `video/` is modified. Stage by path under `video/` so none of these enter the commit.
3. **AAC track peak above -1 dBFS** (confirmed) — `out/Short-2k.mp4` audio has a sample and true peak of -0.95 dBFS (astats -0.952705, loudnorm `input_tp` -0.95); `score.wav` is -1.000184 dBFS sample peak and -1.00 true peak. The record's -1.0 for the mp4 is a rounding in `ebur128`. Non-blocking; if the ceiling matters for the mp4, lower the master peak target in `make-score.mjs` by about 0.1 dB (integrated loudness then reads about -15.1 LUFS), otherwise state in the record that the ceiling is measured on `score.wav`.
4. **Unused `at` parameter of `Wordmark`** (confirmed, NIT) — `Title.tsx` exports `Wordmark` with an `at` prop, and all three call sites (`Opening`, `Ending`, `Name`) use the default 0. Remove the prop and use fixed frame ranges.
5. **README precision** (confirmed, NIT) — the row for bars 9-10 says the parts come in "每拍一个", but bar 9 beat 1 is empty and the parts arrive on beats 2, 3 and 4. The content rule cites CHARTER §1 for 「DeepSeek Harness（DSH）的插件」; §1 says GLM lives in DSH, and the word 插件 is in §3.1/§3.2 (插件行) and §5 (包). Fix the row text and add §3.2 or §5 to the citation.
6. **Overlap on bar 8** (confirmed, cosmetic, carried over from the second cut) — at 15.5 s the bubble 「✓ 测过了」 sits on the dimmed last model reply, so two AI avatars stack at the left (y 407 and 432 on the 360x640 frame). Both texts stay readable. The same position (`top: 1190` over the chat window) is in HEAD. No action required for this cut.

</details>

<details>
<summary>Details</summary>

## Frame check

I opened all 25 frames of iteration r3 in `frames/`: the 16 times of the brief plus 7.0, 7.5, 8.0, 15.5, 19.5, 23.0, 29.5, 35.5 and 39.0 s. The frames are 360x640, so the limits are x 315 and y 512.

Captions are readable at every sample and nothing is clipped. The widest caption, 「主干只收检查过的提交」 at 37 s, spans x 18-312. The two long sub-lines (29.5 s, x 38-291; 35.5 s, x 30-299) stay on one line. Nothing sits right of x 315: the user bubbles in the chat, the module 「管理页」, the pile of rework and the weekly card end at 315. The lowest elements are the `main` label of the trunk (about y 510) and the pile (y 493). The bottom fifth is empty on all 25 frames.

The title reads as a title: the name alone at a third of full brightness at 0 s, full at 1 s, the plugin line and the rule at 3 s, all inside x 25-302 during the push-in. The end card reads as an ending: name alone at 44.5 s, three lines at 46 s, and at 47.9 s the same lines at a few percent opacity on the dark backdrop, with no cut back to the title. The smallest text on the end card (38 px, dim) is the GLM-package line; it is readable at 360 px width.

Beat by beat, bars 3-10 bring in one element at a time. The one simultaneous change is on bar 4 beat 4: the clock label turns to 「早上」 about two frames before 「待返工」 enters, which is the clock finishing its turn, not a new element (frames 7.0, 7.5 and 8.0 s).

## Claims against the sources

The name, 「Harness 原意是驾驭」 and 「模型改不了／能改的是它干活的环境」 are CHARTER §1. 「你只在图上做决定」 is §2, the three questions and four answers are §4, and the weekly rows 「被问的次数」, 「每次要读的字数」, 「拍板等待的时间」, 「因人的决定返工的次数」 and the comparison line are §3.2 item 5. 「GLM 通道是另一个包，两个包可以只装一个」 is §3 and §5.

「各领一件活／每个子 Agent 一个单独的工作目录」, 「只能写划给它的文件」, 「审查谁定深浅／主 Agent 定；必须全审的，一律全审」, 「主干只收检查过的提交」 and 「检查结果由系统记录／模型说的不算」 are `m7/onepage.md` ("会自己发生的事": 派活, 审查, 合入). The graph shows the meeting-room booking tool as the example project. Nothing on screen comes from `rules` or `schedules`. The caption 「只能写划给它的文件」 follows the sub-agent caption and names no main-agent restriction. A search of `video/src` for 写文件, 不写, 不能写, 从来不 and 只读 finds nothing.

## Score and loudness

I rebuilt the HEAD `make-score.mjs` and the current one in a temporary directory outside the repository (cut before the render section, so only the MIDI is written) and compared the two files event by event, old events shifted by two bars. Every note-on, note-off, controller change and pedal event of bars 1-20 in HEAD equals the same event in bars 3-22 now, velocities included, on all eleven instrument tracks. The differences are the tick-0 setup events (program, volume, pan, reverb and chorus sends), which stay at tick 0; the piano pedal release at the end of the old score, which the coda's pedal change now replaces at the bar 22/23 line (tick 42240); and the note-off of the added reverse cymbal at the end of bar 2. The 49 note-ons outside bars 3-22 (piano 21, pad 17, melody 9, bass 1, sweep 1) are the opening, the coda and the cymbal; HEAD has 1199 notes and the current script 1248. The `score.mid` on disk (10158 bytes) is byte-identical to what the current script writes.

The measured loudness agrees with `checks.md`. `score.wav`: -15.0 LUFS integrated, 7.1 LU range, sample peak -1.000184 dBFS. The audio track of the mp4: -15.0 LUFS (loudnorm -15.05), 7.1 LU, peak -0.95 dBFS as in issue 3. The soft-clip drive went from 1.2 to 1.5 to hold -15 LUFS with the quiet opening and the fade. It applies to the whole mix, so bars 3-22 pass through a harder soft clip than in the previous score even though their notes and velocities are the same; the record states this.

ffprobe on `out/Short-2k.mp4`: h264 1440x2560, r_frame_rate 30/1; aac 48000 Hz, 2 channels; stream and container duration 48.000000; size 12487421 bytes, as in `checks.md`.

## State of the r2 findings and the record

The newest source file (README) is dated 01:32:05 on Nov 1, `score.wav` 01:32:32, the mp4 01:33:25 and the frames 01:33:49-01:33:53, so the render and the frames are newer than every source file. `timeline.ts` (22:51:17) is older than the render, and the record's statement that it cannot describe that earlier edit is moot because lint, render, probe, loudness and frames were all re-run afterwards. The size in the record now equals the file. The opening instrumentation text in the README table, the README score paragraph and the header of `make-score.mjs` now name the reverse cymbal, and the bass comment reads "no bass and no drums" (checked against the code: no bass line and no drum hits in the opening).

I did not re-run lint, the render or the root gates, as instructed; the lint result is taken from `checks.md` (exit 0, run after the last source edit).

## Outside `video/`

`git diff HEAD --name-only` lists only `video/` paths and nothing is staged. `.agents/` is ignored by git, so the task directory does not show in `git status`. The pending `graph-ops.json` in the task directory (a comment on `field-trial`) is the author's draft for the orchestrator. This review did not touch the graph or any file outside the task directory.

## Done-when still open

The change is not committed or pushed yet, and the root gates still need their result in the record (issue 1). Everything else in the done-when list holds.

</details>

<details>
<summary>File map</summary>

Full diff: `git diff HEAD -- video` plus the untracked `Rework.tsx` and `Title.tsx`.

- `video/README.md`: intro, structure table, rules, file list, score paragraph and content rules rewritten for 48 s and 24 bars.
- `video/scripts/make-score.mjs`: 24 bars, `START` section table, fixed-velocity opening and coda, soft reverse cymbal in bar 2, Cadd9 coda with a 2.5 s fade, drive 1.5.
- `video/src/Root.tsx`: duration from `BARS * BAR`.
- `video/src/short/timeline.ts`: `BARS`, captions and graph moments at the new bar numbers.
- `video/src/short/Short.tsx`: new Sequence layout.
- `video/src/short/Title.tsx` (new): `Wordmark`, `Opening`, `Ending`.
- `video/src/short/Rework.tsx` (new): clock and pile of rework, split out of the deleted `Open.tsx`; label on bar 4 beat 4.
- `video/src/short/Claim.tsx`: bubble and two red lines, one per beat.
- `video/src/short/Drift.tsx`: chat grows one exchange per beat, then the 「测过了」 beat.
- `video/src/short/Name.tsx`: name taken apart on beats 2-4 of bar 9, whole name from `Wordmark`.
- `video/src/short/Ask.tsx`, `Report.tsx`: bar numbers in comments; weekly bars start filling in bar 21.
- `video/src/short/Caption.tsx`: `immediate` prop removed.
- `video/src/short/Open.tsx`, `End.tsx`: deleted.

</details>
