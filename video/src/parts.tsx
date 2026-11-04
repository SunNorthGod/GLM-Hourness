import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP, COLORS, EASE, FONT, MONO, tint } from "./theme";

/** Background shared by every scene: flat paper with a hairline page frame. */
export const Backdrop: React.FC = () => (
  <AbsoluteFill style={{ background: COLORS.bg }}>
    <div
      style={{
        position: "absolute",
        left: 32,
        top: 32,
        right: 32,
        bottom: 32,
        border: `1.5px solid ${tint(COLORS.text, 0.35)}`,
      }}
    />
  </AbsoluteFill>
);

/** Fades a whole scene in at its start and out at its end. */
export const SceneFade: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        color: COLORS.text,
        opacity: interpolate(frame, [0, 10, durationInFrames - 12, durationInFrames], [0, 1, 1, 0], CLAMP),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Rises 12 px and fades in from `at` (frames). */
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
        translate: interpolate(frame, [at, at + 20], ["0px 12px", "0px 0px"], { ...CLAMP, easing: EASE }),
      }}
    >
      {children}
    </div>
  );
};

/** A thick and a thin rule under a title, as under a printed heading, `width` px wide. */
export const Rule: React.FC<{ width: number; style?: React.CSSProperties }> = ({ width, style }) => (
  <div
    style={{
      ...style,
      height: 8,
      boxSizing: "border-box",
      borderTop: `3px solid ${COLORS.text}`,
      borderBottom: `1px solid ${COLORS.text}`,
      width,
    }}
  />
);

/** Scene number and name in the top-left corner. */
export const SceneLabel: React.FC<{ index: string; text: string }> = ({ index, text }) => (
  <Reveal at={4} style={{ position: "absolute", left: 110, top: 84, display: "flex", alignItems: "center", gap: 22 }}>
    <span style={{ color: COLORS.red, fontFamily: MONO, fontSize: 34, fontWeight: 700, letterSpacing: 2 }}>
      {index}
    </span>
    <div style={{ width: 56, height: 2, background: tint(COLORS.text, 0.16) }} />
    <div style={{ fontSize: 38, letterSpacing: 2, color: COLORS.text }}>{text}</div>
  </Reveal>
);

/** Card on the page: a near-white ground in a black hairline box. */
export const CARD: React.CSSProperties = {
  background: COLORS.sheet,
  border: `1.5px solid ${COLORS.text}`,
  borderRadius: 3,
};

/** The person's chat bubble: light grey, no edge. */
export const USER_BUBBLE: React.CSSProperties = { background: COLORS.bubble, borderRadius: 3 };

/** Ground, edge and text colour of a small label drawn in one colour (a six-digit hex). */
export const pill = (color: string): React.CSSProperties => ({
  background: COLORS.sheet,
  border: `1.5px solid ${color}`,
  color,
  borderRadius: 3,
});

/** Small label drawn in one colour. */
export const Pill: React.FC<{
  color: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ color, children, style }) => (
  <div
    style={{
      ...pill(color),
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

/** What a card on the project graph stands for: the goal, a task being worked on, a task that passed review. */
export type CardState = "plain" | "goal" | "working" | "done";

/**
 * The edge of a card that carries a state, over a card edge `width` px wide:
 * the goal in red, a task being worked on in a dashed amber line, a task that
 * passed review in a heavier green one. Line and colour both tell the states
 * apart.
 */
export const stateEdge = (kind: CardState, width: number): React.CSSProperties => {
  switch (kind) {
    case "plain":
      return {};
    case "goal":
      return { border: `${width + 0.5}px solid ${COLORS.red}` };
    case "working":
      return { border: `${width + 0.5}px dashed ${COLORS.amber}` };
    case "done":
      return { border: `${width + 1.5}px solid ${COLORS.green}` };
  }
};

/** A right-angled line from (x1, y1) down to (x2, y2), turning half-way down. */
export const edgePath = (x1: number, y1: number, x2: number, y2: number) => {
  const mid = (y1 + y2) / 2;
  return `M ${x1} ${y1} L ${x1} ${mid} L ${x2} ${mid} L ${x2} ${y2}`;
};

/** Renders text where **phrase** is drawn in bold red, as in the four-line proposals. */
export const Bold: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split("**");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} style={{ color: COLORS.red, fontWeight: 700 }}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};
