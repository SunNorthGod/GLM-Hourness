import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { GLASS, GradientText, Pill } from "../parts";
import { CLAMP, COLORS, EASE } from "../theme";
import { BAR, BEAT } from "./timeline";

// Bars 17-18: the rules board, then the loop board. Rows come from the two
// boards' one-page notes. Frames are counted from the start of bar 17.

const RULES: [string, string][] = [
  ["合入前的检查清单", "会挡住动作"],
  ["必须全审的改动", "会挡住动作"],
  ["今晚 21 点以后别推送", "你定的"],
];
const LOOPS: [string, string][] = [
  ["晨报", "每天 08:30"],
  ["周报", "周一 09:00"],
  ["夜间巡检", "每天 02:30"],
];

const Panel: React.FC<{ at: number; title: string; rows: [string, string][]; tagColor: string }> = ({
  at,
  title,
  rows,
  tagColor,
}) => {
  const frame = useCurrentFrame();
  const k = interpolate(frame, [at, at + 10], [0, 1], { ...CLAMP, easing: EASE });
  return (
    <div
      style={{
        ...GLASS,
        width: 900,
        padding: "34px 40px",
        boxSizing: "border-box",
        opacity: k,
        translate: `0px ${interpolate(k, [0, 1], [30, 0])}px`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <GradientText style={{ fontSize: 50, fontWeight: 700 }}>{title}</GradientText>
        <Pill color={COLORS.dim} style={{ fontSize: 26 }}>
          只能看 · 改要跟主 Agent 说
        </Pill>
      </div>
      {rows.map(([name, note], i) => {
        const r = interpolate(frame, [at + 6 + i * BEAT, at + 14 + i * BEAT], [0, 1], { ...CLAMP, easing: EASE });
        return (
          <div
            key={name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "18px 0",
              borderTop: i === 0 ? "none" : "1.5px solid rgba(255,255,255,0.08)",
              fontSize: 42,
              opacity: r,
              translate: `${interpolate(r, [0, 1], [-24, 0])}px 0px`,
            }}
          >
            <span>{name}</span>
            <Pill color={note === "你定的" ? COLORS.apricot : tagColor} style={{ fontSize: 28 }}>
              {note}
            </Pill>
          </div>
        );
      })}
    </div>
  );
};

export const Boards: React.FC = () => (
  <AbsoluteFill style={{ alignItems: "center", paddingTop: 610, gap: 50 }}>
    <Panel at={0} title="规则板" rows={RULES} tagColor={COLORS.rose} />
    <Panel at={BAR} title="循环板" rows={LOOPS} tagColor={COLORS.cyan} />
  </AbsoluteFill>
);
