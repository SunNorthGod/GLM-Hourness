import React from "react";
import { AbsoluteFill } from "remotion";
import { GLASS, Pill, Reveal } from "../parts";
import { COLORS } from "../theme";
import { Avatar, MODEL } from "./Avatar";

/**
 * The model's chat bubble 「✓ 全部完成」 with evidence lines under it. Frame 0
 * and the end card use this one layout, red lines in one and green in the
 * other, so a replay cuts between two pictures that line up.
 */

export type Evidence = { text: string; at: number };

const TONE = { red: COLORS.rose, green: COLORS.mint } as const;

export const Claim: React.FC<{
  tone: keyof typeof TONE;
  evidence: Evidence[];
  /** Placed under the evidence lines. */
  children?: React.ReactNode;
}> = ({ tone, evidence, children }) => {
  const color = TONE[tone];
  return (
    <AbsoluteFill style={{ padding: "620px 135px 0 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <Avatar {...MODEL} size={88} />
        <div style={{ ...GLASS, padding: "26px 44px", fontSize: 84, fontWeight: 700, whiteSpace: "nowrap" }}>
          ✓ 全部完成
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        {evidence.map((e) => (
          <Reveal
            key={e.text}
            at={e.at}
            style={{
              display: "flex",
              marginLeft: 42,
              paddingLeft: 61,
              paddingTop: 16,
              borderLeft: `3px solid ${color}55`,
            }}
          >
            <Pill color={color} style={{ fontSize: 50, padding: "14px 30px", borderRadius: 24 }}>
              {e.text}
            </Pill>
          </Reveal>
        ))}
      </div>
      {children}
    </AbsoluteFill>
  );
};
