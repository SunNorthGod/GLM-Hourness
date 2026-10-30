import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CLAMP, COLORS, EASE, FONT } from "./theme";

/** Background shared by every scene: a dark field with one soft glow. */
export const Backdrop: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(circle at 30% 20%, #1A2445 0%, ${COLORS.bg} 55%)`,
    }}
  />
);

/** Fades a whole scene in at its start and out at its end. */
export const SceneFade: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        color: COLORS.text,
        opacity: interpolate(
          frame,
          [0, 12, durationInFrames - 12, durationInFrames],
          [0, 1, 1, 0],
          CLAMP,
        ),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Rises and fades in from `at` (frames). */
export const Reveal: React.FC<{
  at: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ at, children, style }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        ...style,
        opacity: interpolate(frame, [at, at + 14], [0, 1], { ...CLAMP, easing: EASE }),
        translate: interpolate(frame, [at, at + 18], ["0px 28px", "0px 0px"], {
          ...CLAMP,
          easing: EASE,
        }),
      }}
    >
      {children}
    </div>
  );
};

/** Small label in the top-left corner naming the scene. */
export const SceneLabel: React.FC<{ text: string }> = ({ text }) => (
  <Reveal at={4} style={{ position: "absolute", left: 110, top: 90 }}>
    <div style={{ fontSize: 40, color: COLORS.teal, letterSpacing: 4 }}>{text}</div>
  </Reveal>
);

/** Renders text where **phrase** is drawn in the accent colour, as in the four-line proposals. */
export const Bold: React.FC<{ text: string; color?: string }> = ({
  text,
  color = COLORS.amber,
}) => {
  const parts = text.split("**");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} style={{ color, fontWeight: 700 }}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};
