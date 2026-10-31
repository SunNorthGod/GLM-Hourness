import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { GradientText, Reveal } from "../parts";
import { CLAMP, COLORS, EASE, SILVER } from "../theme";
import { BAR, BEAT } from "./timeline";

// The title (bars 1-2) and the end card (bars 23-24). Both show the name and
// the line 「DeepSeek Harness（DSH）的插件」 (CHARTER §1: GLM lives in DeepSeek
// Harness, a DSH plugin), one element to a beat or a bar. The end card adds
// the line about the GLM package (CHARTER §3 and §5) and fades out with the
// score. Frames are counted from the start of the section.

/** The name, in the column the content keeps to; fades in from part-way so no frame is empty. */
export const Wordmark: React.FC<{ at?: number }> = ({ at = 0 }) => {
  const frame = useCurrentFrame();
  const shown = interpolate(frame, [at, at + 20], [0.35, 1], { ...CLAMP, easing: EASE });
  return (
    <div
      style={{
        fontSize: 112,
        fontWeight: 700,
        letterSpacing: 2,
        whiteSpace: "nowrap",
        opacity: shown,
        scale: interpolate(frame, [at, at + 40], [0.96, 1], { ...CLAMP, easing: EASE, output: "perceptual-scale" }),
      }}
    >
      <GradientText gradient={SILVER}>GLM-Hourness</GradientText>
    </div>
  );
};

const Plugin: React.FC<{ at: number }> = ({ at }) => (
  <Reveal at={at} style={{ marginTop: 30, fontSize: 48, color: COLORS.dim, letterSpacing: 1, whiteSpace: "nowrap" }}>
    DeepSeek Harness（DSH）的插件
  </Reveal>
);

const Centered: React.FC<{ opacity: number; scale?: number; children: React.ReactNode }> = ({
  opacity,
  scale = 1,
  children,
}) => (
  <AbsoluteFill
    style={{
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      paddingLeft: 45,
      paddingRight: 135,
      paddingBottom: 120,
      opacity,
      scale,
    }}
  >
    {children}
  </AbsoluteFill>
);

/** Bars 1-2. The name on the first note of the sound logo, the line on its last, a rule drawn under both in bar 2. */
export const Opening: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Centered opacity={1} scale={interpolate(frame, [0, 2 * BAR], [1, 1.04], CLAMP)}>
      <Wordmark />
      <Plugin at={2 * BEAT} />
      <div
        style={{
          marginTop: 44,
          height: 2,
          width: interpolate(frame, [BAR, BAR + 24], [0, 560], { ...CLAMP, easing: EASE }),
          background: "linear-gradient(90deg, rgba(142,162,255,0), rgba(195,166,255,0.8), rgba(142,162,255,0))",
        }}
      />
    </Centered>
  );
};

/** Bars 23-24. The name, the line, the note on the GLM package, then the whole card fades out over bar 24. */
export const Ending: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Centered opacity={interpolate(frame, [BAR, 2 * BAR], [1, 0], CLAMP)}>
      <Wordmark />
      <Plugin at={BEAT} />
      <Reveal at={2 * BEAT} style={{ marginTop: 64, fontSize: 38, color: COLORS.dim, whiteSpace: "nowrap" }}>
        GLM 通道是另一个包，两个包可以只装一个
      </Reveal>
    </Centered>
  );
};
