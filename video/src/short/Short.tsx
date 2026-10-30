import React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Backdrop } from "../parts";
import { COLORS, FONT } from "../theme";
import { Boards } from "./Boards";
import { Caption } from "./Caption";
import { Chat } from "./Chat";
import { End } from "./End";
import { GraphStage } from "./Graph";
import { BAR, bar, CAPTIONS, HOOK_OFFSET } from "./timeline";

// Vertical short, 1080x1920, 40 s. Cuts and captions fall on the bar lines of
// the score: hook (1-2) shows the graph's best moment ahead of time with the
// question; the wish (3-6); the two-level loop and the work (7-16), where the
// question is answered; the boards (17-18); the end card (19-20), which hands
// back to frame 0 for a seamless replay.

const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  return <GraphStage t={HOOK_OFFSET + frame} />;
};

const Work: React.FC = () => {
  const frame = useCurrentFrame();
  return <GraphStage t={bar(7) + frame} />;
};

export const Short: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.text }}>
    <Backdrop />
    <Sequence name="Hook" from={bar(1)} durationInFrames={2 * BAR}>
      <Hook />
    </Sequence>
    <Sequence name="Wish" from={bar(3)} durationInFrames={4 * BAR}>
      <Chat />
    </Sequence>
    <Sequence name="Work" from={bar(7)} durationInFrames={10 * BAR}>
      <Work />
    </Sequence>
    <Sequence name="Boards" from={bar(17)} durationInFrames={2 * BAR}>
      <Boards />
    </Sequence>
    <Sequence name="End" from={bar(19)} durationInFrames={2 * BAR}>
      <End />
    </Sequence>
    {CAPTIONS.map((c) => (
      <Sequence key={c.bar} name={`Caption ${c.bar}`} from={bar(c.bar)} durationInFrames={BAR}>
        <Caption title={c.title} {...(c.sub ? { sub: c.sub } : {})} immediate={c.bar === 1} />
      </Sequence>
    ))}
    <Audio name="Score" src={staticFile("music/score.wav")} />
  </AbsoluteFill>
);
