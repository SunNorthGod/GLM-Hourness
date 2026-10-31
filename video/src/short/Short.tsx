import React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Backdrop } from "../parts";
import { COLORS, FONT } from "../theme";
import { Ask } from "./Ask";
import { Caption } from "./Caption";
import { Claim } from "./Claim";
import { Drift } from "./Drift";
import { GraphStage } from "./Graph";
import { Name } from "./Name";
import { Report } from "./Report";
import { Rework } from "./Rework";
import { Ending, Opening } from "./Title";
import { BAR, bar, CAPTIONS } from "./timeline";

// Vertical short, 1080x1920, 48 s. Cuts and captions fall on the bar lines of
// the score: the title (bars 1-2), the pain, one thing to a beat (3-8), the
// name taken apart (9-10), the person decides on the graph (11-14), the work,
// where the question of bar 3 is answered (15-20), the weekly report (21-22),
// and the end card (23-24), which fades out with the score.

const Work: React.FC = () => {
  const frame = useCurrentFrame();
  return <GraphStage t={bar(11) + frame} />;
};

export const Short: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.text }}>
    <Backdrop />
    <Sequence name="Title" from={bar(1)} durationInFrames={2 * BAR}>
      <Opening />
    </Sequence>
    <Sequence name="Claim" from={bar(3)} durationInFrames={3 * BAR}>
      <Claim />
    </Sequence>
    <Sequence name="Rework" from={bar(4)} durationInFrames={2 * BAR}>
      <Rework />
    </Sequence>
    <Sequence name="Drift" from={bar(6)} durationInFrames={3 * BAR}>
      <Drift />
    </Sequence>
    <Sequence name="Name" from={bar(9)} durationInFrames={2 * BAR}>
      <Name />
    </Sequence>
    <Sequence name="Graph" from={bar(11)} durationInFrames={10 * BAR}>
      <Work />
    </Sequence>
    <Sequence name="Ask" from={bar(11)} durationInFrames={4 * BAR}>
      <Ask />
    </Sequence>
    <Sequence name="Report" from={bar(21)} durationInFrames={2 * BAR}>
      <Report />
    </Sequence>
    <Sequence name="End card" from={bar(23)} durationInFrames={2 * BAR}>
      <Ending />
    </Sequence>
    {CAPTIONS.map((c) => (
      <Sequence key={c.bar} name={`Caption ${c.bar}`} from={bar(c.bar)} durationInFrames={(c.bars ?? 1) * BAR}>
        <Caption title={c.title} {...(c.sub ? { sub: c.sub } : {})} />
      </Sequence>
    ))}
    <Audio name="Score" src={staticFile("music/score.wav")} />
  </AbsoluteFill>
);
