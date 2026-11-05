import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CARD, Pill, Reveal } from "../parts";
import { CLAMP, COLORS, tint } from "../theme";
import { Avatar, MAIN_AGENT, PERSON } from "./Avatar";
import { BAR, BEAT } from "./timeline";

// Bars 11-14, over the project graph. The person asks three questions
// (bar 12), the main agent answers four things (bar 13), the person nods once
// (bar 14) and the graph grows (Graph.tsx). Questions and answers are
// CHARTER §4. Frames are counted from the start of bar 11.

const QUESTIONS = ["为什么", "怎么做", "效果是"];
const ANSWERS: [string, number][] = [
  ["理由", 260],
  ["架构", 330],
  ["目标", 220],
  ["规划", 300],
];

const Row: React.FC<{ at: number; tag: string; height: number; children: React.ReactNode }> = ({
  at,
  tag,
  height,
  children,
}) => (
  <Reveal
    at={at}
    style={{
      ...CARD,
      height,
      boxSizing: "border-box",
      padding: "0 32px",
      display: "flex",
      alignItems: "center",
      gap: 24,
      fontSize: 52,
    }}
  >
    <Pill color={COLORS.text} style={{ fontSize: 30 }}>
      {tag}
    </Pill>
    {children}
  </Reveal>
);

export const Ask: React.FC = () => {
  const frame = useCurrentFrame();
  const speaker = frame >= BAR * 2 && frame < BAR * 3 ? MAIN_AGENT : PERSON;
  const nod = interpolate(frame, [BAR * 3, BAR * 3 + 8, BAR * 3 + 18], [0, 16, 0], CLAMP);
  const questions = interpolate(frame, [BAR * 2 - 8, BAR * 2], [1, 0], CLAMP);
  const answers = interpolate(frame, [BAR * 3 + 6, BAR * 3 + 18], [1, 0], CLAMP);
  return (
    <AbsoluteFill>
      <Reveal at={4} style={{ position: "absolute", left: 55, top: 650 }}>
        <div style={{ transform: `translateY(${nod}px)` }}>
          <Avatar {...speaker} size={80} />
        </div>
      </Reveal>
      {/* Above the avatar: below it, the connector from the goal to 预约 turns at x 175, y 797. */}
      <Reveal at={BAR * 3 + 8} style={{ position: "absolute", left: 45, top: 560 }}>
        <div style={{ opacity: interpolate(frame, [BAR * 3 + 40, BAR * 3 + 52], [1, 0], CLAMP) }}>
          <Pill color={COLORS.green} style={{ fontSize: 32 }}>
            点头 ✓
          </Pill>
        </div>
      </Reveal>
      <div
        style={{
          position: "absolute",
          left: 165,
          top: 880,
          width: 700,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          opacity: questions,
        }}
      >
        {QUESTIONS.map((q, i) => (
          <Row key={q} at={BAR + 2 + i * BEAT} tag="问" height={100}>
            {q}
          </Row>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 165,
          top: 880,
          width: 700,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          opacity: answers,
        }}
      >
        {ANSWERS.map(([label, width], i) => (
          <Row key={label} at={BAR * 2 + 2 + i * BEAT} tag="答" height={84}>
            {label}
            <div style={{ width, height: 14, borderRadius: 7, background: tint(COLORS.text, 0.16) }} />
          </Row>
        ))}
      </div>
    </AbsoluteFill>
  );
};
