import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { GradientText, Reveal } from "../parts";
import { CLAMP, COLORS, EASE, SILVER } from "../theme";
import { BAR, BEAT } from "./timeline";

// Bars 5-6. The name is built from its three parts (CHARTER §1), then said
// whole. Frames are counted from the start of bar 5.

const Part: React.FC<{ at: number; plus?: boolean; children: React.ReactNode }> = ({ at, plus = false, children }) => (
  <Reveal at={at} style={{ fontSize: 112, fontWeight: 700, letterSpacing: 2 }}>
    {plus ? <span style={{ color: COLORS.faint, marginRight: 28 }}>+</span> : null}
    {children}
  </Reveal>
);

export const Name: React.FC = () => {
  const frame = useCurrentFrame();
  const parts = interpolate(frame, [BAR - 4, BAR + 6], [1, 0], CLAMP);
  const whole = interpolate(frame, [BAR + 2, BAR + 16], [0, 1], { ...CLAMP, easing: EASE });
  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", paddingTop: 60, paddingLeft: 45, paddingRight: 135 }}
    >
      <div style={{ position: "absolute", opacity: parts, textAlign: "center" }}>
        <Part at={4}>
          <GradientText gradient={SILVER}>GLM</GradientText>
        </Part>
        <Part at={BEAT + 4} plus>
          <GradientText>House</GradientText>
        </Part>
        <Part at={2 * BEAT + 4} plus>
          <GradientText>Harness</GradientText>
        </Part>
      </div>
      <div
        style={{
          position: "absolute",
          textAlign: "center",
          opacity: whole,
          scale: interpolate(whole, [0, 1], [0.92, 1], { output: "perceptual-scale" }),
        }}
      >
        <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: 2 }}>
          <GradientText gradient={SILVER}>GLM-Hourness</GradientText>
        </div>
      </div>
      <Reveal at={BAR + BEAT + 5} style={{ position: "absolute", top: 1090, fontSize: 46, color: COLORS.dim }}>
        Harness 原意是驾驭
      </Reveal>
    </AbsoluteFill>
  );
};
