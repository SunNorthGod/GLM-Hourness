import React from "react";
import { AbsoluteFill } from "remotion";
import { Reveal, SceneFade } from "../parts";
import { COLORS, MONO, SERIF } from "../theme";

export const End: React.FC = () => (
  <SceneFade>
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <Reveal at={4}>
        <div style={{ fontFamily: SERIF, fontSize: 144, fontWeight: 700, letterSpacing: 4 }}>人在图上编程</div>
      </Reveal>
      <Reveal at={19} style={{ marginTop: 18 }}>
        <div style={{ fontFamily: SERIF, fontSize: 72, fontWeight: 600, color: COLORS.red }}>
          图下的活，交给 harness
        </div>
      </Reveal>
      <Reveal at={45} style={{ marginTop: 84 }}>
        <div style={{ fontSize: 40, color: COLORS.text, letterSpacing: 1 }}>
          <span style={{ fontFamily: MONO }}>dsh-hourness</span> · DeepSeek Harness 编排层插件
        </div>
      </Reveal>
      <Reveal at={57} style={{ marginTop: 16 }}>
        <div style={{ fontSize: 30, color: COLORS.faint }}>GLM 通道（dsh-glm-zcode）是另一个包，两个可以只装一个</div>
      </Reveal>
    </AbsoluteFill>
  </SceneFade>
);
