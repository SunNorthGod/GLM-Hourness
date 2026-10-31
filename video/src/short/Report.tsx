import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { GLASS, GradientText, Pill, Reveal } from "../parts";
import { CLAMP, COLORS, EASE } from "../theme";
import { BAR, BEAT } from "./timeline";

// Bars 21-22: the weekly report card. The four rows are the numbers
// CHARTER §3.2 item 5 names, taken from the system; there is no real data
// yet, so the card carries bars and trend arrows only, and says it is a
// sketch. Frames are counted from the start of bar 21.

const ROWS: { label: string; bars: number[] }[] = [
  { label: "被问的次数", bars: [64, 56, 48, 36, 28] },
  { label: "每次要读的字数", bars: [60, 58, 44, 40, 30] },
  { label: "拍板等待的时间", bars: [66, 52, 50, 38, 24] },
  { label: "因人的决定返工的次数", bars: [62, 54, 46, 32, 26] },
];

/** Height of a bar before its week is filled in. */
const GHOST = 8;

const Trend: React.FC<{ row: number; bars: number[] }> = ({ row, bars }) => {
  const frame = useCurrentFrame();
  const shown = interpolate(frame, [BAR + 30 + row * 6, BAR + 40 + row * 6], [0, 1], CLAMP);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 72 }}>
      {bars.map((h, j) => {
        const k = interpolate(frame, [BAR - 16 + row * 8 + j * 3, BAR - 6 + row * 8 + j * 3], [0, 1], {
          ...CLAMP,
          easing: EASE,
        });
        return (
          <div
            key={j}
            style={{
              width: 26,
              height: GHOST + (h - GHOST) * k,
              borderRadius: 6,
              background: k === 0 ? "rgba(255, 255, 255, 0.12)" : j === bars.length - 1 ? COLORS.mint : "rgba(142, 162, 255, 0.5)",
            }}
          />
        );
      })}
      <svg width={44} height={44} style={{ marginLeft: 12, opacity: shown }}>
        <path
          d="M8 10 L36 34 M36 34 L36 18 M36 34 L20 34"
          fill="none"
          stroke={COLORS.mint}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

export const Report: React.FC = () => (
  <AbsoluteFill>
    <Reveal
      at={0}
      style={{
        ...GLASS,
        position: "absolute",
        left: 45,
        top: 600,
        width: 900,
        boxSizing: "border-box",
        padding: "36px 40px 30px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <GradientText style={{ fontSize: 60, fontWeight: 700 }}>周报</GradientText>
        <Pill color={COLORS.dim} style={{ fontSize: 30 }}>
          示意，暂无真实数据
        </Pill>
      </div>
      {ROWS.map((row, i) => (
        <Reveal
          key={row.label}
          at={6 + i * BEAT}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 120,
            borderTop: "1.5px solid rgba(255,255,255,0.08)",
            fontSize: 40,
          }}
        >
          <span>{row.label}</span>
          <Trend row={i} bars={row.bars} />
        </Reveal>
      ))}
      <Reveal
        at={BAR + 40}
        style={{ borderTop: "1.5px solid rgba(255,255,255,0.08)", paddingTop: 22, fontSize: 38, color: COLORS.dim }}
      >
        对照：测试、评审发现、返工率
      </Reveal>
    </Reveal>
  </AbsoluteFill>
);
