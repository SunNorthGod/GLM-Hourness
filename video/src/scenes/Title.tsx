import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Reveal, SceneFade } from "../parts";
import { CLAMP, COLORS, EASE } from "../theme";

const Word: React.FC<{ at: number; text: string; lit: boolean }> = ({ at, text, lit }) => {
  const frame = useCurrentFrame();
  return (
    <span
      style={{
        color: lit ? COLORS.teal : COLORS.dim,
        opacity: interpolate(frame, [at, at + 12], [0, 1], CLAMP),
      }}
    >
      {text}
    </span>
  );
};

export const Title: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <SceneFade>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            fontSize: 190,
            fontWeight: 800,
            letterSpacing: interpolate(frame, [0, 40], [30, 4], { ...CLAMP, easing: EASE }),
            opacity: interpolate(frame, [0, 22], [0, 1], CLAMP),
            scale: interpolate(frame, [0, 40], [0.94, 1], {
              ...CLAMP,
              easing: EASE,
              output: "perceptual-scale",
            }),
          }}
        >
          GLM-Hourness
        </div>
        <div style={{ fontSize: 56, marginTop: 10, display: "flex", gap: 28 }}>
          <Word at={30} text="GLM" lit={false} />
          <Word at={36} text="+" lit={false} />
          <Word at={42} text="House" lit />
          <Word at={48} text="+" lit={false} />
          <Word at={54} text="Harness" lit />
        </div>
        <Reveal at={74} style={{ marginTop: 70 }}>
          <div style={{ fontSize: 80, fontWeight: 600 }}>让大模型按工程规矩，开发大项目</div>
        </Reveal>
        <Reveal at={96} style={{ marginTop: 34 }}>
          <div style={{ fontSize: 40, color: COLORS.dim }}>
            DeepSeek Harness 的编排层插件 · dsh-hourness
          </div>
        </Reveal>
      </AbsoluteFill>
    </SceneFade>
  );
};
