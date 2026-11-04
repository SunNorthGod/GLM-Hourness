import React from "react";
import { AbsoluteFill, Easing, interpolate, interpolateColors, useCurrentFrame } from "remotion";
import { pill, Pill, Reveal } from "../parts";
import { CLAMP, COLORS, tint } from "../theme";
import { BAR, BEAT } from "./timeline";

// Bars 4-5, under the bubble of Claim.tsx. In bar 4 a clock turns from night
// to morning and, on the last beat, the label of the pile comes in; in bar 5
// the red changes pile up beside it, one to a beat. Frames are counted from
// the start of bar 4.

const TURN = [BEAT, BAR - 3] as const;
// The hour hand passes 6 o'clock (540 degrees) at dawn = 210 / 270, about 0.78;
// the label says morning only after that.
const MORNING = 0.8;
const FACE = 320;
/** The clock face at night (grey) and in the morning (white). */
const FACE_COLORS = ["#DCD6CA", COLORS.sheet];
const PILE_ROWS = [
  [260, 170],
  [200, 260],
  [300, 140],
  [220, 210],
] as const;

const Clock: React.FC = () => {
  const frame = useCurrentFrame();
  const dawn = interpolate(frame, [TURN[0], TURN[1]], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.quad) });
  // The hour hand goes from 11 at night round to 8 in the morning; the minute hand turns twelve times as fast.
  const hour = 330 + 270 * dawn;
  const face = interpolateColors(dawn, [0, 1], FACE_COLORS);
  const c = FACE / 2;
  return (
    <Reveal at={0} style={{ position: "absolute", left: 70, top: 1090 }}>
      <Pill color={dawn < MORNING ? COLORS.dim : COLORS.text} style={{ fontSize: 34, width: "fit-content" }}>
        {dawn < MORNING ? "深夜" : "早上"}
      </Pill>
      <svg width={FACE} height={FACE} style={{ marginTop: 16 }}>
        <circle cx={c} cy={c} r={c - 6} fill={face} stroke={COLORS.text} strokeWidth={6} />
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1={c}
            y1={20}
            x2={c}
            y2={i % 3 === 0 ? 40 : 32}
            stroke={tint(COLORS.text, 0.55)}
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
  );
};

const PileRow: React.FC<{ at: number; widths: readonly [number, number] }> = ({ at, widths }) => (
  <Reveal
    at={at}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 18,
      height: 66,
      padding: "0 20px",
      ...pill(COLORS.red),
    }}
  >
    <span style={{ color: COLORS.red, fontSize: 30, fontWeight: 700 }}>✗</span>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {widths.map((w, i) => (
        <div key={i} style={{ width: w, height: 9, borderRadius: 5, background: `${COLORS.red}80` }} />
      ))}
    </div>
  </Reveal>
);

const Pile: React.FC = () => (
  <>
    <Reveal at={BAR - BEAT} style={{ position: "absolute", left: 470, top: 1090 }}>
      <Pill color={COLORS.red} style={{ fontSize: 34 }}>
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
        gap: 16,
      }}
    >
      {PILE_ROWS.map((widths, i) => (
        <PileRow key={i} at={BAR + i * BEAT} widths={widths} />
      ))}
    </div>
  </>
);

export const Rework: React.FC = () => (
  <AbsoluteFill>
    <Clock />
    <Pile />
  </AbsoluteFill>
);
