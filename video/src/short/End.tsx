import React from "react";
import { Reveal } from "../parts";
import { COLORS } from "../theme";
import { Claim, type Evidence } from "./Claim";
import { BAR, BEAT } from "./timeline";

// Bars 19-20. The same bubble as frame 0, now with the evidence a finished
// task carries (ORCHESTRATION §2: a commit, a test run, the checker's result;
// CHARTER §3.2 item 3: the review). The short id is an example. The package
// line is CHARTER §3 and §5. A replay cuts from here to the red frame 0.
// Frames are counted from the start of bar 19.

const EVIDENCE: Evidence[] = [
  { text: "✓ 提交 a3f9c2e", at: BEAT },
  { text: "✓ 检查通过", at: 2 * BEAT },
  { text: "✓ 审查通过", at: 3 * BEAT },
];

export const End: React.FC = () => (
  <Claim tone="green" evidence={EVIDENCE}>
    <Reveal at={BAR} style={{ marginTop: 60, marginLeft: 108, fontSize: 36, color: COLORS.dim }}>
      GLM 通道是另一个包，两个包可以只装一个
    </Reveal>
  </Claim>
);
