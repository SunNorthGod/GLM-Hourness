import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Reveal, Rule, SceneFade } from "../parts";
import { CLAMP, COLORS, EASE, MONO, SERIF } from "../theme";

const Word: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  return <span style={{ opacity: interpolate(frame, [at, at + 12], [0, 1], CLAMP) }}>{children}</span>;
};

const Divider: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  return (
    <Rule style={{ marginTop: 44 }} width={interpolate(frame, [at, at + 24], [0, 560], { ...CLAMP, easing: EASE })} />
  );
};

export const Title: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <SceneFade>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 184,
            fontWeight: 700,
            letterSpacing: 2,
            opacity: interpolate(frame, [0, 18], [0, 1], CLAMP),
          }}
        >
          GLM-Hourness
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 52, marginTop: 6, display: "flex", gap: 26, color: COLORS.faint }}>
          <Word at={22}>GLM</Word>
          <Word at={26}>+</Word>
          <Word at={30}>
            <span style={{ color: COLORS.red }}>House</span>
          </Word>
          <Word at={34}>+</Word>
          <Word at={38}>
            <span style={{ color: COLORS.red }}>Harness</span>
          </Word>
        </div>
        <Divider at={42} />
        <Reveal at={50} style={{ marginTop: 44 }}>
          <div style={{ fontFamily: SERIF, fontSize: 76, fontWeight: 600 }}>让大模型按工程规矩，开发大项目</div>
        </Reveal>
        <Reveal at={64} style={{ marginTop: 28 }}>
          <div style={{ fontSize: 36, color: COLORS.dim, letterSpacing: 1 }}>
            DeepSeek Harness 的编排层插件 ·{" "}
            <span style={{ fontFamily: MONO, color: COLORS.text }}>dsh-hourness</span>
          </div>
        </Reveal>
      </AbsoluteFill>
    </SceneFade>
  );
};
