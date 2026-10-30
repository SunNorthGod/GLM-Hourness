import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ACCENT, CLAMP, COLORS, EASE, FONT } from "./theme";

/** A soft colour glow that drifts slowly across the whole video. */
const Glow: React.FC<{
  size: number;
  color: string;
  from: string;
  to: string;
}> = ({ size, color, from, to }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color} 0%, rgba(0,0,0,0) 62%)`,
        translate: interpolate(frame, [0, durationInFrames], [from, to], CLAMP),
      }}
    />
  );
};

/** Background shared by every scene: dark ground, two drifting glows, a faint grid, grain and a vignette. */
export const Backdrop: React.FC = () => (
  <AbsoluteFill style={{ background: COLORS.bg, overflow: "hidden" }}>
    <Glow size={1500} color="rgba(110, 126, 255, 0.20)" from="-520px -760px" to="-300px -640px" />
    <Glow size={1300} color="rgba(186, 140, 255, 0.13)" from="1050px 360px" to="880px 300px" />
    <Glow size={900} color="rgba(110, 210, 240, 0.07)" from="300px 620px" to="420px 560px" />
    <AbsoluteFill
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)",
        backgroundSize: "80px 80px",
        maskImage: "radial-gradient(ellipse at 50% 45%, black 0%, transparent 72%)",
      }}
    />
    <svg width={1920} height={1080} style={{ position: "absolute", opacity: 0.06 }}>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.6) 100%)",
      }}
    />
  </AbsoluteFill>
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
          [0, 10, durationInFrames - 12, durationInFrames],
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
        translate: interpolate(frame, [at, at + 20], ["0px 24px", "0px 0px"], {
          ...CLAMP,
          easing: EASE,
        }),
      }}
    >
      {children}
    </div>
  );
};

/** Text painted with a gradient. */
export const GradientText: React.FC<{
  children: React.ReactNode;
  gradient?: string;
  style?: React.CSSProperties;
}> = ({ children, gradient = ACCENT, style }) => (
  <span
    style={{
      backgroundImage: gradient,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      ...style,
    }}
  >
    {children}
  </span>
);

/** Scene number and name in the top-left corner. */
export const SceneLabel: React.FC<{ index: string; text: string }> = ({ index, text }) => (
  <Reveal
    at={4}
    style={{ position: "absolute", left: 110, top: 84, display: "flex", alignItems: "center", gap: 22 }}
  >
    <GradientText style={{ fontSize: 34, fontWeight: 700, letterSpacing: 2 }}>{index}</GradientText>
    <div style={{ width: 56, height: 2, background: "rgba(255,255,255,0.16)" }} />
    <div style={{ fontSize: 38, letterSpacing: 2, color: COLORS.text }}>{text}</div>
  </Reveal>
);

/** Translucent card with a hairline border and a soft shadow. */
export const GLASS: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.065), rgba(255,255,255,0.025))",
  border: "1.5px solid rgba(255,255,255,0.10)",
  borderRadius: 24,
  boxShadow: "0 24px 70px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)",
};

/** Small outlined label tinted with one colour (a six-digit hex). */
export const Pill: React.FC<{
  color: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ color, children, style }) => (
  <div
    style={{
      background: `${color}1F`,
      border: `1.5px solid ${color}70`,
      color,
      borderRadius: 999,
      padding: "4px 16px",
      fontSize: 24,
      fontWeight: 600,
      letterSpacing: 1,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Renders text where **phrase** is drawn in the emphasis colour, as in the four-line proposals. */
export const Bold: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split("**");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} style={{ color: COLORS.apricot, fontWeight: 600 }}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};
