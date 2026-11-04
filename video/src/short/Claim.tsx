import React from "react";
import { AbsoluteFill } from "remotion";
import { CARD, Pill, Reveal } from "../parts";
import { COLORS } from "../theme";
import { Avatar, MODEL } from "./Avatar";
import { BEAT } from "./timeline";

// Bars 3-5. The model's chat bubble 「✓ 全部完成」, then the evidence against
// it, one line to a beat. Frames are counted from the start of bar 3; the
// clock and the pile of rework join it in bars 4-5 (Rework.tsx).

const EVIDENCE = [
  { text: "✗ 测试没过", at: BEAT },
  { text: "✗ 改了不该碰的文件", at: 2 * BEAT },
];

export const Claim: React.FC = () => (
  <AbsoluteFill style={{ padding: "620px 135px 0 60px" }}>
    <Reveal at={0} style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <Avatar {...MODEL} size={88} />
      <div style={{ ...CARD, padding: "26px 44px", fontSize: 84, fontWeight: 700, whiteSpace: "nowrap" }}>
        ✓ 全部完成
      </div>
    </Reveal>
    <div style={{ marginTop: 6 }}>
      {EVIDENCE.map((e) => (
        <Reveal
          key={e.text}
          at={e.at}
          style={{
            display: "flex",
            marginLeft: 42,
            paddingLeft: 61,
            paddingTop: 16,
            borderLeft: `3px solid ${COLORS.red}55`,
          }}
        >
          <Pill color={COLORS.red} style={{ fontSize: 50, padding: "14px 30px" }}>
            {e.text}
          </Pill>
        </Reveal>
      ))}
    </div>
  </AbsoluteFill>
);
