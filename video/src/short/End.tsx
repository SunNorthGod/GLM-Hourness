import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { GradientText } from "../parts";
import { ACCENT, CLAMP, COLORS, EASE, SILVER } from "../theme";
import { GraphStage } from "./Graph";
import { BAR, BEAT, HOOK_OFFSET } from "./timeline";

// Bars 19-20. The text sits over the graph as it looks at frame 0; in the
// last beat the text leaves and the graph comes back to full strength, so a
// replay continues without a jump.

const LOOP_BACK = 2 * BAR - BEAT;

const Line: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, children, style }) => {
  const frame = useCurrentFrame();
  const k = interpolate(frame, [at, at + 10], [0, 1], { ...CLAMP, easing: EASE });
  const out = interpolate(frame, [LOOP_BACK, LOOP_BACK + 10], [1, 0], CLAMP);
  return <div style={{ ...style, opacity: k * out, translate: `0px ${interpolate(k, [0, 1], [24, 0])}px` }}>{children}</div>;
};

export const End: React.FC = () => {
  const frame = useCurrentFrame();
  const graph = interpolate(frame, [0, 8, LOOP_BACK, 2 * BAR], [1, 0.16, 0.16, 1], CLAMP);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: graph }}>
        <GraphStage t={HOOK_OFFSET} />
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", paddingBottom: 160 }}>
        <Line at={2}>
          <div style={{ fontSize: 130, fontWeight: 700, letterSpacing: 4 }}>
            <GradientText gradient={SILVER}>人在图上编程</GradientText>
          </div>
        </Line>
        <Line at={BEAT + 2} style={{ marginTop: 24 }}>
          <div style={{ fontSize: 70, fontWeight: 600 }}>
            <GradientText gradient={ACCENT}>图下的活，交给 harness</GradientText>
          </div>
        </Line>
        <Line at={BAR} style={{ marginTop: 110 }}>
          <div style={{ fontSize: 48 }}>dsh-hourness</div>
          <div style={{ fontSize: 38, color: COLORS.dim, marginTop: 10 }}>DeepSeek Harness 编排层插件</div>
        </Line>
        <Line at={BAR + BEAT} style={{ marginTop: 24 }}>
          <div style={{ fontSize: 32, color: COLORS.faint }}>GLM 通道是另一个包，可以只装一个</div>
        </Line>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
