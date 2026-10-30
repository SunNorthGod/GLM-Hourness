// The vertical short follows the bars of public/music/score.wav: 120 BPM,
// one bar is 60 frames at 30 fps, one beat 15. Every caption and every cut
// starts on a bar line; the events inside a bar land on its beats.

export const BAR = 60;
export const BEAT = 15;
/** First frame of bar n, counting bars from 1 as the score does. */
export const bar = (n: number) => (n - 1) * BAR;
export const BARS = 20;

/**
 * One caption per bar, so the screen changes every two seconds and the video
 * reads with the sound off. Every sentence comes from a released design's
 * one-page note (.agents/tasks/{m3,m7,rules,schedules}/onepage.md). A title
 * keeps to ten characters, one line at 88 px; detail goes to the sub-line.
 */
export const CAPTIONS: { bar: number; title: string; sub?: string }[] = [
  { bar: 1, title: "把大项目交给 AI" },
  { bar: 2, title: "它怎么保证不乱改？" },
  { bar: 3, title: "一句话说你想要什么" },
  { bar: 4, title: "它出一个方案", sub: "四行，说人话" },
  { bar: 5, title: "你点头，它才记下", sub: "随口一句「行」，它先复述一遍" },
  { bar: 6, title: "它自己从来不写文件", sub: "改代码只能派子 Agent 去做" },
  { bar: 7, title: "先定框架，分成几块" },
  { bar: 8, title: "每一块，你各放行一次" },
  { bar: 9, title: "没放行，就派不出活" },
  { bar: 10, title: "放行之后……" },
  { bar: 11, title: "子 Agent 各领一件活", sub: "每件活一个单独的工作目录" },
  { bar: 12, title: "只能写划给它的文件" },
  { bar: 13, title: "每件活都过独立审查" },
  { bar: 14, title: "审查深浅由主 Agent 定", sub: "碰到必须全审的，一律全审" },
  { bar: 15, title: "主干只收检查过的提交" },
  { bar: 16, title: "检查结果由系统记", sub: "模型说的不算" },
  { bar: 17, title: "规矩写在规则板上", sub: "人看得见，不靠 AI 自觉" },
  { bar: 18, title: "到点的事交给循环板" },
];

/** Moments on the project graph, in frames of the whole video. */
export const T = {
  goal: bar(7),
  modules: [bar(7) + BEAT, bar(7) + 2 * BEAT, bar(7) + 3 * BEAT],
  released: [bar(8), bar(8) + 2 * BEAT],
  designing: bar(8) + BEAT,
  refusedTry: bar(9),
  refused: bar(9) + BEAT + 5,
  tasks: [bar(10) + BEAT, bar(10) + 2 * BEAT, bar(10) + 3 * BEAT],
  arrive: [bar(11), bar(11) + BEAT, bar(11) + 2 * BEAT],
  reviewed: [bar(13) + BEAT, bar(13) + 3 * BEAT, bar(14) + BEAT],
  commits: [bar(15) + BEAT, bar(15) + 3 * BEAT, bar(16) + 3 * BEAT],
  rogue: bar(16),
  rogueRefused: bar(16) + BEAT + 5,
};

/** The hook (bars 1-2) shows bars 15-16 of the graph ahead of time: the answer before the question. */
export const HOOK_OFFSET = bar(15);
