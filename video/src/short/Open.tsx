import React from "react";
import { AbsoluteFill, Easing, interpolate, interpolateColors, useCurrentFrame } from "remotion";
import { Pill, Reveal } from "../parts";
import { CLAMP, COLORS } from "../theme";
import { Claim, type Evidence } from "./Claim";

// Bars 1-2. Frame 0 is the model's 「✓ 全部完成」 with two red lines under it,
// readable at a glance. From the first beat a clock turns from night to
// morning while red changes pile up beside it. Frames are counted from the
// start of bar 1.

const EVIDENCE: Evidence[] = [
  { text: "✗ 测试没过", at: -12 },
  { text: "✗ 改了不该碰的文件", at: -12 },
];

const TURN = [8, 112] as const;
const FACE = 320;
const PILE_BARS = [
  [260, 170],
  [200, 260],
  [300, 140],
  [220, 210],
  [280, 190],
] as const;

const Clock: React.FC = () => {
  const frame = useCurrentFrame();
  const dawn = interpolate(frame, [TURN[0], TURN[1]], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.quad) });
  // The hour hand goes from 11 at night round to 8 in the morning; the minute hand turns twelve times as fast.
  const hour = 330 + 270 * dawn;
  const face = interpolateColors(dawn, [0, 1], ["rgba(76, 90, 190, 0.34)", "rgba(255, 208, 138, 0.30)"]);
  const ring = interpolateColors(dawn, [0, 1], ["rgba(142, 162, 255, 0.75)", "rgba(255, 208, 138, 0.95)"]);
  const c = FACE / 2;
  return (
    <>
      <Reveal at={6} style={{ position: "absolute", left: 70, top: 1090 }}>
        <Pill color={dawn < 0.5 ? COLORS.indigo : COLORS.apricot} style={{ fontSize: 34 }}>
          {dawn < 0.5 ? "深夜" : "早上"}
        </Pill>
      </Reveal>
      <Reveal at={8} style={{ position: "absolute", left: 70, top: 1150 }}>
        <svg width={FACE} height={FACE}>
          <circle cx={c} cy={c} r={c - 6} fill={face} stroke={ring} strokeWidth={6} />
          {Array.from({ length: 12 }, (_, i) => (
            <line
              key={i}
              x1={c}
              y1={20}
              x2={c}
              y2={i % 3 === 0 ? 40 : 32}
              stroke="rgba(255,255,255,0.55)"
              strokeWidth={i % 3 === 0 ? 5 : 3}
              strokeLinecap="round"
              transform={`rotate(${i * 30} ${c} ${c})`}
            />
          ))}
          <line
            x1={c}
            y1={c}
            x2={c}
            y2={c - 78}
            stroke={COLORS.text}
            strokeWidth={9}
            strokeLinecap="round"
            transform={`rotate(${hour} ${c} ${c})`}
          />
          <line
            x1={c}
            y1={c}
            x2={c}
            y2={c - 118}
            stroke={COLORS.text}
            strokeWidth={5}
            strokeLinecap="round"
            transform={`rotate(${hour * 12} ${c} ${c})`}
          />
          <circle cx={c} cy={c} r={9} fill={COLORS.text} />
        </svg>
      </Reveal>
    </>
  );
};

const PileRow: React.FC<{ at: number; widths: readonly [number, number] }> = ({ at, widths }) => (
  <Reveal
    at={at}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 18,
      height: 54,
      padding: "0 20px",
      borderRadius: 14,
      background: `${COLORS.rose}1F`,
      border: `1.5px solid ${COLORS.rose}70`,
    }}
  >
    <span style={{ color: COLORS.rose, fontSize: 30, fontWeight: 700 }}>✗</span>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {widths.map((w, i) => (
        <div key={i} style={{ width: w, height: 9, borderRadius: 5, background: `${COLORS.rose}80` }} />
      ))}
    </div>
  </Reveal>
);

const Pile: React.FC = () => (
  <>
    <Reveal at={20} style={{ position: "absolute", left: 470, top: 1090 }}>
      <Pill color={COLORS.rose} style={{ fontSize: 34 }}>
        待返工
      </Pill>
    </Reveal>
    <div
      style={{
        position: "absolute",
        left: 470,
        top: 1150,
        width: 475,
        height: 330,
        display: "flex",
        flexDirection: "column-reverse",
        gap: 12,
      }}
    >
      {PILE_BARS.map((widths, i) => (
        <PileRow key={i} at={20 + i * 17} widths={widths} />
      ))}
    </div>
  </>
);

export const Open: React.FC = () => (
  <AbsoluteFill>
    <Claim tone="red" evidence={EVIDENCE} />
    <Clock />
    <Pile />
  </AbsoluteFill>
);
