import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { GradientText, Reveal, SceneFade } from "../parts";
import { CLAMP, COLORS, EASE, SILVER } from "../theme";

const Word: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  return (
    <span style={{ opacity: interpolate(frame, [at, at + 12], [0, 1], CLAMP) }}>{children}</span>
  );
};

const Divider: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        marginTop: 44,
        height: 2,
        width: interpolate(frame, [at, at + 24], [0, 560], { ...CLAMP, easing: EASE }),
        background: "linear-gradient(90deg, rgba(142,162,255,0), rgba(195,166,255,0.8), rgba(142,162,255,0))",
      }}
    />
  );
};

export const Title: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <SceneFade>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            fontSize: 184,
            fontWeight: 700,
            letterSpacing: interpolate(frame, [0, 36], [24, 2], { ...CLAMP, easing: EASE }),
            opacity: interpolate(frame, [0, 18], [0, 1], CLAMP),
            scale: interpolate(frame, [0, 36], [0.95, 1], {
              ...CLAMP,
              easing: EASE,
              output: "perceptual-scale",
            }),
          }}
        >
          <GradientText gradient={SILVER}>GLM-Hourness</GradientText>
        </div>
        <div style={{ fontSize: 52, marginTop: 6, display: "flex", gap: 26, color: COLORS.faint }}>
          <Word at={22}>GLM</Word>
          <Word at={26}>+</Word>
          <Word at={30}>
            <GradientText>House</GradientText>
          </Word>
          <Word at={34}>+</Word>
          <Word at={38}>
            <GradientText>Harness</GradientText>
          </Word>
        </div>
        <Divider at={42} />
        <Reveal at={50} style={{ marginTop: 44 }}>
          <div style={{ fontSize: 76, fontWeight: 600 }}>让大模型按工程规矩，开发大项目</div>
        </Reveal>
        <Reveal at={64} style={{ marginTop: 28 }}>
          <div style={{ fontSize: 36, color: COLORS.dim, letterSpacing: 1 }}>
            DeepSeek Harness 的编排层插件 · <span style={{ color: COLORS.indigo }}>dsh-hourness</span>
          </div>
        </Reveal>
      </AbsoluteFill>
    </SceneFade>
  );
};
