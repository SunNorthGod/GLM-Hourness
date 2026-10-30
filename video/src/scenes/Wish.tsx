import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bold, Reveal, SceneFade, SceneLabel } from "../parts";
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
  const caret = frame < to + 20 && Math.floor(frame / 8) % 2 === 0;
  return (
    <span>
      {text.slice(0, shown)}
      <span style={{ opacity: caret ? 1 : 0, color: COLORS.teal }}>▍</span>
    </span>
  );
};

const UserBubble: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: "flex", justifyContent: "flex-end" }}>
    <div
      style={{
        background: "#22305A",
        borderRadius: 26,
        padding: "22px 34px",
        fontSize: 46,
      }}
    >
      {children}
    </div>
  </div>
);

const AgentBubble: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
    <div
      style={{
        flex: "0 0 auto",
        width: 64,
        height: 64,
        borderRadius: 32,
        background: COLORS.violet,
        color: COLORS.bg,
        fontSize: 30,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      主
    </div>
    <div
      style={{
        background: COLORS.panel,
        border: `2px solid ${COLORS.line}`,
        borderRadius: 26,
        padding: "24px 34px",
        fontSize: 42,
        lineHeight: 1.55,
      }}
    >
      {children}
    </div>
  </div>
);

export const Wish: React.FC = () => (
  <SceneFade>
    <SceneLabel text="① 一句话许愿" />
    <AbsoluteFill style={{ padding: "180px 260px 90px", gap: 30, display: "flex", flexDirection: "column" }}>
      <Reveal at={6}>
        <UserBubble>
          <Typed text={WISH} from={10} to={46} />
        </UserBubble>
      </Reveal>
      <Reveal at={58}>
        <AgentBubble>
          <div style={{ fontSize: 46, fontWeight: 700, marginBottom: 8 }}>{PROPOSAL.title}</div>
          {PROPOSAL.lines.map(([label, text], i) => (
            <Reveal key={label} at={68 + i * 12}>
              <div style={{ display: "flex", gap: 22 }}>
                <span style={{ color: COLORS.dim, flex: "0 0 auto" }}>{label}</span>
                <span>
                  <Bold text={text} />
                </span>
              </div>
            </Reveal>
          ))}
        </AgentBubble>
      </Reveal>
      <Reveal at={138}>
        <UserBubble>行</UserBubble>
      </Reveal>
      <Reveal at={156}>
        <AgentBubble>
          <span style={{ color: COLORS.teal }}>那我记成：</span>
          后订的人当场提示冲突、改订别的时段，不做候补。
        </AgentBubble>
      </Reveal>
    </AbsoluteFill>
  </SceneFade>
);
