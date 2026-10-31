// The vertical short follows the bars of public/music/score.wav: 120 BPM,
// one bar is 60 frames at 30 fps, one beat 15. Every caption and every cut
// starts on a bar line; the events inside a bar land on its beats.

export const BAR = 60;
export const BEAT = 15;
/** First frame of bar n, counting bars from 1 as the score does. */
export const bar = (n: number) => (n - 1) * BAR;
export const BARS = 20;

/**
 * Captions, one per bar where the story changes every bar; a caption with
 * `bars: 2` stays for two bars while the picture changes under it. A title
 * keeps to ten characters, one line at 88 px; detail goes to the sub-line.
 *
 * Sources: bars 1-4 are the pain the product answers and are framing, not
 * claims about the product. Bars 5-6: CHARTER §1 (the weights cannot change,
 * the environment can). Bars 7-9: CHARTER §2 and §4 (decide on the graph;
 * three questions, four answers). Bars 11-16: .agents/tasks/{m3,m7}/onepage.md
 * and CHARTER §3.2 item 3 (evidence, not the model's word). Bars 17-18:
 * CHARTER §3.2 item 5. Bars 19-20: CHARTER §2.
 */
export const CAPTIONS: { bar: number; bars?: number; title: string; sub?: string }[] = [
  { bar: 1, title: "AI 说做完了", sub: "真做完了吗？" },
  { bar: 2, title: "想挂机收菜", sub: "醒来全是返工" },
  { bar: 3, title: "聊得越久", sub: "越忘了要做什么" },
  { bar: 4, title: "它说测过了", sub: "你只能信" },
  { bar: 5, bars: 2, title: "模型改不了", sub: "能改的是它干活的环境" },
  { bar: 7, title: "你只在图上做决定" },
  { bar: 8, title: "你问三句", sub: "为什么、怎么做、效果是" },
  { bar: 9, bars: 2, title: "它答四样", sub: "理由、架构、目标、规划" },
  { bar: 11, title: "各领一件活", sub: "每个子 Agent 一个单独的工作目录" },
  { bar: 12, title: "只能写划给它的文件" },
  { bar: 13, title: "每件活都过独立审查" },
  { bar: 14, title: "审查谁定深浅", sub: "主 Agent 定；必须全审的，一律全审" },
  { bar: 15, title: "主干只收检查过的提交" },
  { bar: 16, title: "检查结果由系统记", sub: "模型说的不算" },
  { bar: 17, bars: 2, title: "系统每周数给你看", sub: "问你几次、你读多少、等你多久" },
  { bar: 19, bars: 2, title: "人在图上编程", sub: "图下的活交给 harness" },
];

/**
 * Moments on the project graph, in frames of the whole video. The person's
 * nod is the first beat of bar 10; the blocks grow after it, and the
 * sub-agents arrive on the first three beats of bar 11.
 */
export const T = {
  goal: bar(7),
  modules: [bar(10) + 20, bar(10) + 30, bar(10) + 40],
  released: [bar(10) + 36, bar(10) + 46],
  designing: bar(10) + 48,
  tasks: [bar(11) - 10, bar(11) + 5, bar(11) + 20],
  arrive: [bar(11), bar(11) + BEAT, bar(11) + 2 * BEAT],
  reviewed: [bar(13) + BEAT, bar(13) + 3 * BEAT, bar(14) + BEAT],
  commits: [bar(15) + BEAT, bar(15) + 3 * BEAT, bar(16) + 3 * BEAT],
  rogue: bar(16),
  rogueRefused: bar(16) + BEAT + 5,
};
