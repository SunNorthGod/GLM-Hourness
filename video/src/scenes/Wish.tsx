import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bold, GLASS, Reveal, SceneFade, SceneLabel } from "../parts";
import { CLAMP, COLORS } from "../theme";

const WISH = "/wish 给团队做一个订会议室的小工具";

// One worked proposal in the four-line form the person fixed
// (d-chat-not-cards): a title, then 背景 / 推荐 / 疑问 / 不做,
// one bold phrase in each line.
const PROPOSAL = {
  title: "同一间会议室被订重了怎么办",
  lines: [
    ["背景", "两个人同时订**同一个时段**，现在两份都会成功"],
    ["推荐", "后订的人**当场看到冲突**，改订别的时段"],
    ["疑问", "要不要让**部门负责人**能抢订，这点我最没底"],
    ["不做", "**排队候补**，小团队用不上"],
  ],
} as const;

const Typed: React.FC<{ text: string; from: number; to: number }> = ({ text, from, to }) => {
  const frame = useCurrentFrame();
  const shown = Math.round(interpolate(frame, [from, to], [0, text.length], CLAMP));
  const caret = frame < to + 24 && Math.floor(frame / 8) % 2 === 0;
  return (
    <span>
      {text.slice(0, shown)}
      <span style={{ opacity: caret ? 1 : 0, color: COLORS.indigo }}>▍</span>
    </span>
  );
};

const UserBubble: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: "flex", justifyContent: "flex-end" }}>
    <div
      style={{
        background: "linear-gradient(135deg, rgba(142,162,255,0.30), rgba(195,166,255,0.20))",
        border: "1.5px solid rgba(195,166,255,0.35)",
        boxShadow: "0 18px 50px rgba(60, 70, 160, 0.30)",
        borderRadius: 28,
        padding: "20px 34px",
        fontSize: 44,
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
      width: 62,
      height: 62,
      borderRadius: 31,
      background: `linear-gradient(135deg, ${COLORS.indigo}, ${COLORS.lilac})`,
      boxShadow: "0 0 28px rgba(160, 150, 255, 0.45)",
      color: COLORS.bg,
      fontSize: 28,
      fontWeight: 700,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    主
  </div>
);

const AgentBubble: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
    <Avatar />
    <div style={{ ...GLASS, padding: "24px 36px", fontSize: 40, lineHeight: 1.6 }}>{children}</div>
  </div>
);

export const Wish: React.FC = () => (
  <SceneFade>
    <SceneLabel index="01" text="一句话许愿" />
    <AbsoluteFill
      style={{ padding: "190px 260px 90px", gap: 30, display: "flex", flexDirection: "column" }}
    >
      <Reveal at={4}>
        <UserBubble>
          <Typed text={WISH} from={6} to={36} />
        </UserBubble>
      </Reveal>
      <Reveal at={45}>
        <AgentBubble>
          <div style={{ fontSize: 44, fontWeight: 700, marginBottom: 10 }}>{PROPOSAL.title}</div>
          {PROPOSAL.lines.map(([label, text], i) => (
            <Reveal key={label} at={54 + i * 12}>
              <div style={{ display: "flex", gap: 24 }}>
                <span style={{ color: COLORS.faint, flex: "0 0 auto", letterSpacing: 2 }}>{label}</span>
                <span>
                  <Bold text={text} />
                </span>
              </div>
            </Reveal>
          ))}
        </AgentBubble>
      </Reveal>
      <Reveal at={150}>
        <UserBubble>行</UserBubble>
      </Reveal>
      <Reveal at={175}>
        <AgentBubble>
          <span style={{ color: COLORS.mint }}>那我记成：</span>
          后订的人当场提示冲突、改订别的时段，不做候补。
        </AgentBubble>
      </Reveal>
    </AbsoluteFill>
  </SceneFade>
);
