import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CARD, Pill, Reveal, USER_BUBBLE } from "../parts";
import { CLAMP, COLORS, EASE, tint } from "../theme";
import { Avatar, MODEL } from "./Avatar";
import { BAR, BEAT } from "./timeline";

// Bars 6-8. In bars 6-7 a chat grows by one exchange to a beat and scrolls
// up, and its first line, the goal, fades out. In bar 8 the model says it has
// tested, with nothing to show for it. Frames are counted from the start of
// bar 6.

type Exchange = { user: string; goal?: boolean; lines: number[] };

const CHAT: Exchange[] = [
  { user: "给团队做一个订会议室的小工具", goal: true, lines: [520, 380] },
  { user: "再加个提醒", lines: [560, 460, 300] },
  { user: "按钮颜色换一下", lines: [440] },
  { user: "管理页也要", lines: [560, 520, 380] },
  { user: "刚才那个改回去", lines: [500, 340] },
  { user: "再加个日历视图", lines: [540, 480] },
  { user: "怎么又报错了", lines: [460, 400, 320] },
  { user: "先别管这个，接着改", lines: [520, 440] },
];

// Row heights are fixed so that the scroll can be worked out from them.
const PAD = 90;
const GAP = 26;
const USER_H = 96;
const modelH = (lines: number) => 35 + 28 * lines;
const exchangeH = (e: Exchange) => USER_H + GAP + modelH(e.lines.length);
/** Where the scroll has to be for exchange k to sit inside the window. */
const FOLLOW = 800;
const scrollTo = (k: number) => {
  if (k < 0) return 0;
  const bottom = PAD + CHAT.slice(0, k + 1).reduce((sum, e) => sum + exchangeH(e) + GAP, -GAP);
  return Math.max(0, bottom - FOLLOW);
};

const TESTED_AT = 2 * BAR + BEAT;

const UserBubble: React.FC<{ goal: boolean; children: React.ReactNode }> = ({ goal, children }) => (
  <div style={{ display: "flex", justifyContent: "flex-end" }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        height: USER_H,
        boxSizing: "border-box",
        ...USER_BUBBLE,
        padding: "0 32px",
        fontSize: 40,
        maxWidth: 840,
      }}
    >
      {goal ? (
        <Pill color={COLORS.text} style={{ fontSize: 28 }}>
          目标
        </Pill>
      ) : null}
      {children}
    </div>
  </div>
);

const ModelBubble: React.FC<{ lines: number[] }> = ({ lines }) => (
  <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
    <Avatar {...MODEL} size={56} />
    <div style={{ ...CARD, padding: "22px 30px", display: "flex", flexDirection: "column", gap: 12 }}>
      {lines.map((w, i) => (
        <div key={i} style={{ width: w, height: 16, borderRadius: 8, background: tint(COLORS.text, 0.16) }} />
      ))}
    </div>
  </div>
);

export const Drift: React.FC = () => {
  const frame = useCurrentFrame();
  const scroll = interpolate(
    frame,
    CHAT.flatMap((_, k) => [k * BEAT, k * BEAT + 12]),
    CHAT.flatMap((_, k) => [scrollTo(k - 1), scrollTo(k)]),
    { ...CLAMP, easing: EASE },
  );
  const goal = interpolate(frame, [2 * BEAT, 7 * BEAT], [1, 0.1], CLAMP);
  const dim = interpolate(frame, [2 * BAR, 2 * BAR + 10], [1, 0.3], CLAMP);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 45,
          top: 560,
          width: 900,
          height: 940,
          overflow: "hidden",
          opacity: dim,
          maskImage: "linear-gradient(to bottom, transparent 0%, black 9%, black 90%, transparent 100%)",
        }}
      >
        <div
          style={{
            paddingTop: PAD,
            display: "flex",
            flexDirection: "column",
            gap: GAP,
            translate: `0px ${-scroll}px`,
          }}
        >
          {CHAT.map((e, k) => (
            <Reveal key={e.user} at={k * BEAT} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
              <div style={e.goal ? { opacity: goal } : {}}>
                <UserBubble goal={e.goal === true}>{e.user}</UserBubble>
              </div>
              <div style={{ height: modelH(e.lines.length) }}>
                <ModelBubble lines={e.lines} />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", left: 45, top: 1190, width: 900 }}>
        <Reveal at={TESTED_AT} style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <Avatar {...MODEL} size={72} />
          <div style={{ ...CARD, padding: "22px 40px", fontSize: 60, fontWeight: 700 }}>✓ 测过了</div>
        </Reveal>
        <Reveal
          at={TESTED_AT + BEAT}
          style={{
            marginTop: 16,
            marginLeft: 92,
            width: "fit-content",
            background: COLORS.sheet,
            border: `2.5px dashed ${COLORS.faint}`,
            borderRadius: CARD.borderRadius,
            padding: "14px 30px",
            fontSize: 40,
            color: COLORS.dim,
          }}
        >
          证据：—
        </Reveal>
      </div>
    </AbsoluteFill>
  );
};
