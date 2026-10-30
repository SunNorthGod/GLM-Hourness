import React from "react";
import { AbsoluteFill } from "remotion";
import { Reveal, SceneFade } from "../parts";
import { COLORS } from "../theme";

export const End: React.FC = () => (
  <SceneFade>
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <Reveal at={6}>
        <div style={{ fontSize: 150, fontWeight: 800 }}>人在图上编程</div>
      </Reveal>
      <Reveal at={22} style={{ marginTop: 20 }}>
        <div style={{ fontSize: 80, color: COLORS.teal }}>图下的活，交给 harness</div>
      </Reveal>
      <Reveal at={50} style={{ marginTop: 80 }}>
        <div style={{ fontSize: 44, color: COLORS.text }}>dsh-hourness · DeepSeek Harness 编排层插件</div>
      </Reveal>
      <Reveal at={62} style={{ marginTop: 18 }}>
        <div style={{ fontSize: 34, color: COLORS.dim }}>
          GLM 通道（dsh-glm-zcode）是另一个包，两个可以只装一个
        </div>
      </Reveal>
    </AbsoluteFill>
  </SceneFade>
);
