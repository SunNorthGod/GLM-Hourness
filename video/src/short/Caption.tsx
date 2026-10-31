import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CLAMP, COLORS, EASE } from "../theme";

/**
 * One caption, burnt in so the video reads with the sound off. It sits in the
 * top third, centred on x = 495 (the middle of the 45-945 column the content
 * keeps to), clear of the platforms' overlays at the bottom and the right.
 */
export const Caption: React.FC<{ title: string; sub?: string }> = ({ title, sub }) => {
  const frame = useCurrentFrame();
  // Starts part-way visible, so no frame on a bar line is left without a caption.
  const enter = interpolate(frame, [0, 7], [0.35, 1], { ...CLAMP, easing: EASE });
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 230, paddingLeft: 45, paddingRight: 135 }}>
      <div
        style={{
          fontSize: 88,
          fontWeight: 700,
          lineHeight: 1.2,
          textAlign: "center",
          textShadow: "0 6px 30px rgba(0,0,0,0.6)",
          opacity: enter,
          scale: interpolate(enter, [0.35, 1], [1.06, 1], { ...CLAMP, output: "perceptual-scale" }),
        }}
      >
        {title}
      </div>
      {sub ? (
        <div
          style={{
            marginTop: 26,
            fontSize: 50,
            color: COLORS.dim,
            textAlign: "center",
            opacity: interpolate(frame, [6, 14], [0, 1], CLAMP),
          }}
        >
          {sub}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
