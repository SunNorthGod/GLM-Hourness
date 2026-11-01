# video-recut-3: in-video checks (iteration r3)

State: working tree of the main checkout, changes under `video/` only, not committed, nothing pushed.

## Changes in this iteration (review findings of the r2 review)

| Finding | Change |
| --- | --- |
| 1. Opening instrumentation text | `video/README.md` (structure table row 1-2 and the `make-score.mjs` paragraph) and the section list in the header of `video/scripts/make-score.mjs` now say the opening is piano and strings with a soft reverse cymbal through bar 2. The comment above the bass line in `make-score.mjs` no longer says "piano and strings only" and reads "no bass and no drums". The cymbal note stays in the code. |
| 2. Render older than the last source edit | `video/src/short/timeline.ts` (last saved 22:51:17) is older than every file written in this iteration. Its earlier content is not recoverable, so the edit is not described; this iteration re-ran lint, render, ffprobe, loudness and the frame set after the last source edit (sources 01:32:01-01:32:05, lint after that, render finished 01:33:25). |
| 3. File size | The size below is re-measured on the new render. |
| 4. Untracked items outside `video/` | Not touched. `.kiro/`, `msg-refdir-gate.txt` and the root `package-lock.json` are untracked and must stay out of the commit; stage by path under `video/`. |
| 5. Two elements on bar 5 beat 1 | In `video/src/short/Rework.tsx` the label 待返工 now comes in at bar 4 beat 4 (frame 45 of the Rework sequence, `BAR - BEAT`); the first pile row stays on bar 5 beat 1. The Rework header comment and the README row for bars 4-5 describe the new order. |

## Commands and results

| Check | Command (in `video/`) | Result |
| --- | --- | --- |
| Lint | `npm run lint` (eslint src, tsc) | exit code 0 |
| Score | `node scripts/make-score.mjs` (run by the render) | `public/music/score.mid` (10158 bytes) and `score.wav` (48.0 s, 48000 Hz); the score code changed in comments only, the output is the same as in r2 |
| Render | `node scripts/render.mjs Short 2k` | exit code 0, `out/Short-2k.mp4`, 12487421 bytes |
| Probe | `node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe` on `out/Short-2k.mp4` | see below |

## ffprobe values of out/Short-2k.mp4

| Stream | Values |
| --- | --- |
| Video | codec h264, 1440x2560, r_frame_rate 30/1, avg_frame_rate 30/1, duration 48.000000 |
| Audio | codec aac, sample_rate 48000, channels 2 (stereo), duration 48.000000 |
| Container | duration 48.000000, size 12487421 |

## Score loudness (system ffmpeg `ebur128=peak=true`; the bundled ffmpeg has no ebur128)

| Measured on | Integrated | Loudness range | True peak |
| --- | --- | --- | --- |
| `public/music/score.wav`, whole 48 s | -15.0 LUFS | 7.1 LU | -1.0 dBFS |
| audio track of `out/Short-2k.mp4` (AAC) | -15.0 LUFS | 7.1 LU | -1.0 dBFS |

- Sample peak (volumedetect) of score.wav: max_volume -1.0 dB, mean_volume -17.6 dB.
- Measured in r2 on the same output: by section (integrated LUFS) bars 1-2 -23.5, bars 3-4 -15.4, bars 23-24 -28.1; highest sample level before 4.0 s -10.9 dBFS.
- Bars 3-22 against the previous 20-bar score, compared at event level in r2 (and confirmed by the r2 review): identical notes and velocities on all tracks except the added soft reverse cymbal in bar 2.

## Frames of this iteration (`.agents/tasks/video-recut-3/frames/`, 360x640, bundled ffmpeg `-ss <s> -i out/Short-2k.mp4 -frames:v 1 -vf scale=360:640`)

The 16 times of the brief plus 9 more (7.0, 7.5, 8.0 for the moved label; 15.5, 19.5, 23.0, 29.5, 35.5, 39.0 for the bars the brief's times skip). On the 360-wide frames the limits are x 315 (right edge of the safe column) and y 512 (top of the free bottom fifth).

| File | Time | What is on it |
| --- | --- | --- |
| `r3-t00.0.png` | 0.0 s | Dark backdrop and the name GLM-Hourness at about a third of full brightness, one line, centred. Nothing else. Reads as a title fading in. |
| `r3-t01.0.png` | 1.0 s | The name at full brightness inside x 30-300. Nothing else. |
| `r3-t03.0.png` | 3.0 s | The name, the line 「DeepSeek Harness（DSH）的插件」 under it, a thin gradient rule below the line. Title complete and readable; the name stays inside the safe column during the push-in. |
| `r3-t04.5.png` | 4.5 s | Caption 「AI 说做完了」 with sub-line 「真做完了吗？」; the bubble 「✓ 全部完成」 with the AI avatar. No red line yet (the first enters on this beat). |
| `r3-t06.0.png` | 6.0 s | First frame of bar 4. Caption 「想挂机收菜」 still fading in; bubble with both red lines 「✗ 测试没过」 and 「✗ 改了不该碰的文件」. Clock not yet in. |
| `r3-t07.0.png` | 7.0 s | Bar 4 beat 3. Caption 「想挂机收菜／醒来全是返工」; bubble and red lines; clock labelled 「深夜」, hands at about 1 o'clock. No 「待返工」 label. |
| `r3-t07.5.png` | 7.5 s | Bar 4 beat 4. The clock label has turned to 「早上」, hands near 7; the 「待返工」 label has just started its fade-in and is not yet visible. |
| `r3-t08.0.png` | 8.0 s | Bar 5 beat 1. Clock at 8 o'clock, label 「早上」; the label 「待返工」 is fully visible at x 160-205 with no row under it; the first row starts on this beat. The label and the first row no longer come on the same beat. |
| `r3-t09.0.png` | 9.0 s | Bar 5 beat 3. 「待返工」 with two red rows stacked above the bottom edge of the pile area (the third starts on this beat); clock at 8 o'clock. |
| `r3-t13.0.png` | 13.0 s | Caption 「聊得越久／越忘了要做什么」; chat scrolled up with six exchanges, the goal bubble scrolled out, soft fade at the top and bottom of the window; user bubbles end at x 315. |
| `r3-t15.5.png` | 15.5 s | Caption 「它说测过了／你只能信」; the chat dimmed, the bubble 「✓ 测过了」 and the empty evidence box 「证据：—」. |
| `r3-t17.0.png` | 17.0 s | Caption 「模型改不了／能改的是它干活的环境」; only 「GLM」 on screen. |
| `r3-t19.5.png` | 19.5 s | Same caption; the whole name GLM-Hourness (x 30-300) and under it 「Harness 原意是驾驭」. |
| `r3-t21.0.png` | 21.0 s | Caption 「你只在图上做决定」; the person avatar and the goal box 「目标 · 会议室预约」 only. |
| `r3-t23.0.png` | 23.0 s | Caption 「你问三句／为什么、怎么做、效果是」; goal box and two question rows (the third enters on the next beat). |
| `r3-t26.0.png` | 26.0 s | Caption 「它答四样／理由、架构、目标、规划」; goal box and four answer rows with grey placeholder bars. |
| `r3-t29.5.png` | 29.5 s | Caption 「各领一件活／每个子 Agent 一个单独的工作目录」, the sub-line on one line (x 38-291); three modules (two 「已放行」, one 「设计中」); task cards with chips 「子 Agent A/B/C」; the trunk line with the label `main` ending at about y 510. |
| `r3-t31.0.png` | 31.0 s | Caption 「只能写划给它的文件」; same graph. |
| `r3-t35.5.png` | 35.5 s | Caption 「审查谁定深浅／主 Agent 定；必须全审的，一律全审」, sub-line on one line (x 30-299); the three task cards marked 「审查 ✓」. |
| `r3-t37.0.png` | 37.0 s | Caption 「主干只收检查过的提交」 (x 18-312); one commit on the trunk marked 「检查 ✓」. |
| `r3-t39.0.png` | 39.0 s | Caption 「检查结果由系统记录／模型说的不算」; two commits marked 「检查 ✓」 and the refusal bubble 「✗ 没跑检查，进不了主干」 above the trunk. |
| `r3-t42.0.png` | 42.0 s | Caption 「系统每周数给你看／问你几次、你读多少、等你多久」; weekly card with the pill 「示意，暂无真实数据」, four rows, bars drawn in the first two rows, ghost dashes in the other two; card ends at x 315. |
| `r3-t44.5.png` | 44.5 s | End card begins: the name alone at full brightness (the plugin line enters on this beat). |
| `r3-t46.0.png` | 46.0 s | Name, 「DeepSeek Harness（DSH）的插件」 and 「GLM 通道是另一个包，两个包可以只装一个」, all inside x 30-300, bottom fifth empty. Reads as an end card. |
| `r3-t47.9.png` | 47.9 s | The same three lines at a few percent opacity on the dark backdrop; the fade-out is complete and there is no cut back to the opening. |

Across the 25 frames: captions are readable and not clipped; nothing is right of x 315 (the widest items, the user bubbles, the module 「管理页」 and the weekly card, end there); nothing sits in the bottom fifth (y 512 and below on the frames; the `main` label of the graph ends at about y 510).

## Changes to the plan made to fit the bars

1. Pain and turn (bars 3-10) are split as: bar 3 the bubble and two red lines, one per beat; bar 4 the clock (beat 1) and, on beat 4, the label 「待返工」; bar 5 the pile of rework, one row per beat (one caption over bars 4-5); bars 6-7 the long chat, one exchange per beat (one caption over both bars); bar 8 「它说测过了」 and the empty evidence box; bars 9-10 the turn. Caption texts are those of the second cut.
2. The pile of rework has 4 rows (second cut: 5), one per beat in bar 5.
3. The turn (bars 9-10) reuses the name taken apart into GLM, House, Harness, then whole, with 「Harness 原意是驾驭」, since the name is now also shown in the title.
4. The second cut's last two bars (the bubble with green evidence, the commit id, the caption 「人在图上编程／图下的活交给 harness」) are replaced by the end card. That caption is no longer on screen.
5. The graph section is the second cut moved four bars later (bars 11-20), the weekly card on bars 21-22. Against the fixed score, the chorus downbeat (bar 13) now falls on the four answers 「它答四样」 and the snare roll (bar 12) on the three questions; the sub-agents arrive in bar 15 (second cut: on the chorus downbeat).
6. The weekly card's bars start filling in bar 21 (beats 3-4) instead of bar 22, so the frame at 42 s shows data; the arrows and the comparison line are unchanged.
7. Score: a soft reverse cymbal in bar 2 leads into the hook (added to the piano and strings opening). The soft-clip drive of the master went from 1.2 to 1.5 because the quiet opening and the fade lower the integrated loudness to -15.5 LUFS at 1.2; at 1.5 it is -15.0 LUFS with the peak still at -1.0 dBFS. The drive applies to the whole mix, so bars 3-22 pass through a harder soft clip than in the previous score although notes and velocities are identical.
8. The name is set at 112 px (not larger) so that it stays inside x 45-945 during the slow push-in of the title.
9. The `immediate` prop of Caption and the green variant of the bubble (Claim, End) were removed with the components that used them.
10. (r3) The label 「待返工」 moved from bar 5 beat 1 to bar 4 beat 4, so that bar 5 beat 1 brings in one thing, the first row.
