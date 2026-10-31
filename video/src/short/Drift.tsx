import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { GLASS, Pill, Reveal } from "../parts";
import { CLAMP, COLORS } from "../theme";
import { Avatar, MODEL } from "./Avatar";
import { BAR } from "./timeline";

// Bars 3-4. A long chat scrolls up and its first line, the goal, fades out;
// then the model says it has tested, with nothing to show for it. Frames are
// counted from the start of bar 3.

type Message = { who: "user"; text: string; goal?: boolean } | { who: "model"; lines: number[] };

const CHAT: Message[] = [
  { who: "user", text: "给团队做一个订会议室的小工具", goal: true },
  { who: "model", lines: [520, 380] },
  { who: "user", text: "再加个提醒" },
  { who: "model", lines: [560, 460, 300] },
  { who: "user", text: "按钮颜色换一下" },
  { who: "model", lines: [440] },
  { who: "user", text: "管理页也要" },
  { who: "model", lines: [560, 520, 380] },
  { who: "user", text: "刚才那个改回去" },
  { who: "model", lines: [500, 340] },
  { who: "user", text: "再加个日历视图" },
  { who: "model", lines: [540, 480] },
  { who: "user", text: "怎么又报错了" },
  { who: "model", lines: [460, 400, 320] },
  { who: "user", text: "先别管这个，接着改" },
  { who: "model", lines: [520, 440] },
];

const SCROLL = 820;
const TESTED_AT = 66;

const UserBubble: React.FC<{ goal: boolean; children: React.ReactNode }> = ({ goal, children }) => (
  <div style={{ display: "flex", justifyContent: "flex-end" }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        background: "linear-gradient(135deg, rgba(142,162,255,0.32), rgba(195,166,255,0.22))",
        border: "2px solid rgba(195,166,255,0.38)",
        borderRadius: 30,
        padding: "20px 32px",
        fontSize: 40,
        maxWidth: 840,
      }}
    >
      {goal ? (
        <Pill color={COLORS.apricot} style={{ fontSize: 28 }}>
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
    <div style={{ ...GLASS, padding: "22px 30px", display: "flex", flexDirection: "column", gap: 12 }}>
      {lines.map((w, i) => (
        <div key={i} style={{ width: w, height: 16, borderRadius: 8, background: "rgba(255,255,255,0.16)" }} />
      ))}
    </div>
  </div>
);

export const Drift: React.FC = () => {
  const frame = useCurrentFrame();
  const scroll = interpolate(frame, [0, 2 * BAR], [0, SCROLL], { ...CLAMP, easing: Easing.in(Easing.quad) });
  const goal = interpolate(frame, [10, 66], [1, 0.1], CLAMP);
  const dim = interpolate(frame, [TESTED_AT - 4, TESTED_AT + 10], [1, 0.3], CLAMP);
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
            paddingTop: 90,
            display: "flex",
            flexDirection: "column",
            gap: 26,
            translate: `0px ${-scroll}px`,
          }}
        >
          {CHAT.map((m, i) =>
            m.who === "user" ? (
              <div key={i} style={m.goal ? { opacity: goal } : {}}>
                <UserBubble goal={m.goal === true}>{m.text}</UserBubble>
              </div>
            ) : (
              <ModelBubble key={i} lines={m.lines} />
            ),
          )}
        </div>
      </div>
      <Reveal at={TESTED_AT} style={{ position: "absolute", left: 45, top: 1190, width: 900 }}>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <Avatar {...MODEL} size={72} />
          <div>
            <div
              style={{
                ...GLASS,
                background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)), #0B0D18",
                padding: "22px 40px",
                fontSize: 60,
                fontWeight: 700,
              }}
            >
              ✓ 测过了
            </div>
            <div
              style={{
                marginTop: 16,
                background: "#0B0D18",
                border: `2.5px dashed ${COLORS.faint}`,
                borderRadius: 20,
                padding: "14px 30px",
                fontSize: 40,
                color: COLORS.dim,
              }}
            >
              证据：—
            </div>
          </div>
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
