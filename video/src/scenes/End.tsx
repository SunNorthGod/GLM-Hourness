import React from "react";
import { AbsoluteFill } from "remotion";
import { GradientText, Reveal, SceneFade } from "../parts";
import { ACCENT, COLORS, SILVER } from "../theme";

export const End: React.FC = () => (
  <SceneFade>
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <Reveal at={4}>
        <div style={{ fontSize: 144, fontWeight: 700, letterSpacing: 4 }}>
          <GradientText gradient={SILVER}>人在图上编程</GradientText>
        </div>
      </Reveal>
      <Reveal at={19} style={{ marginTop: 18 }}>
        <div style={{ fontSize: 72, fontWeight: 600 }}>
          <GradientText gradient={ACCENT}>图下的活，交给 harness</GradientText>
        </div>
      </Reveal>
      <Reveal at={45} style={{ marginTop: 84 }}>
        <div style={{ fontSize: 40, color: COLORS.text, letterSpacing: 1 }}>
          dsh-hourness · DeepSeek Harness 编排层插件
        </div>
      </Reveal>
      <Reveal at={57} style={{ marginTop: 16 }}>
        <div style={{ fontSize: 30, color: COLORS.faint }}>
          GLM 通道（dsh-glm-zcode）是另一个包，两个可以只装一个
        </div>
      </Reveal>
    </AbsoluteFill>
  </SceneFade>
);
