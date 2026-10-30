import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bold, GLASS, Pill } from "../parts";
import { CLAMP, COLORS, EASE } from "../theme";
import { BAR, BEAT } from "./timeline";

// Bars 3-6: the wish, the four-line proposal, the short answer and the
// restatement, then the main agent's one hard limit. Frames are counted from
// the start of bar 3.

const WISH = "/wish 给团队做一个订会议室的小工具";
const PROPOSAL = {
  title: "同一间会议室被订重了怎么办",
  lines: [
    ["背景", "两个人同时订**同一个时段**"],
    ["推荐", "后订的人**当场看到冲突**"],
    ["疑问", "**部门负责人**能不能抢订"],
    ["不做", "**排队候补**，小团队用不上"],
  ],
} as const;

const In: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, children, style }) => {
  const frame = useCurrentFrame();
  const k = interpolate(frame, [at, at + 10], [0, 1], { ...CLAMP, easing: EASE });
  return (
    <div style={{ ...style, opacity: k, translate: `0px ${interpolate(k, [0, 1], [26, 0])}px` }}>{children}</div>
  );
};

const Typed: React.FC<{ text: string; from: number; to: number }> = ({ text, from, to }) => {
  const frame = useCurrentFrame();
  const shown = Math.round(interpolate(frame, [from, to], [0, text.length], CLAMP));
  const caret = frame < to + 20 && Math.floor(frame / 8) % 2 === 0;
  return (
    <span>
      {text.slice(0, shown)}
      <span style={{ opacity: caret ? 1 : 0, color: COLORS.indigo }}>▍</span>
    </span>
  );
};

const User: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: "flex", justifyContent: "flex-end" }}>
    <div
      style={{
        background: "linear-gradient(135deg, rgba(142,162,255,0.32), rgba(195,166,255,0.22))",
        border: "2px solid rgba(195,166,255,0.38)",
        borderRadius: 30,
        padding: "22px 34px",
        fontSize: 44,
        maxWidth: 820,
      }}
    >
      {children}
    </div>
  </div>
);

const Avatar: React.FC = () => (
  <div
    style={{
      flex: "0 0 auto",
      width: 72,
      height: 72,
      borderRadius: 36,
      background: `linear-gradient(135deg, ${COLORS.indigo}, ${COLORS.lilac})`,
      boxShadow: "0 0 30px rgba(160, 150, 255, 0.45)",
      color: COLORS.bg,
      fontSize: 32,
      fontWeight: 700,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    主
  </div>
);

const Agent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
    <Avatar />
    <div style={{ ...GLASS, padding: "24px 32px", fontSize: 42, lineHeight: 1.55, maxWidth: 770 }}>{children}</div>
  </div>
);

export const Chat: React.FC = () => (
  <AbsoluteFill style={{ padding: "600px 135px 0 60px", display: "flex", flexDirection: "column", gap: 28 }}>
    <In at={2}>
      <User>
        <Typed text={WISH} from={4} to={34} />
      </User>
    </In>
    <In at={BAR}>
      <Agent>
        <div style={{ fontSize: 44, fontWeight: 700, marginBottom: 8 }}>{PROPOSAL.title}</div>
        {PROPOSAL.lines.map(([label, text], i) => (
          <In key={label} at={BAR + 3 + i * BEAT}>
            <div style={{ display: "flex", gap: 22 }}>
              <span style={{ color: COLORS.faint, flex: "0 0 auto", letterSpacing: 2 }}>{label}</span>
              <span>
                <Bold text={text} />
              </span>
            </div>
          </In>
        ))}
      </Agent>
    </In>
    <In at={2 * BAR}>
      <User>行</User>
    </In>
    <In at={2 * BAR + BEAT + 5}>
      <Agent>
        <span style={{ color: COLORS.mint }}>那我记成：</span>后订的人当场看到冲突，不做候补。
      </Agent>
    </In>
    <In at={3 * BAR} style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
      <Pill color={COLORS.rose} style={{ fontSize: 34, padding: "10px 26px" }}>
        主 Agent · 没有写文件的工具
      </Pill>
    </In>
  </AbsoluteFill>
);
