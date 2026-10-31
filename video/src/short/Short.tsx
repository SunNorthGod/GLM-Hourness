import React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Backdrop } from "../parts";
import { COLORS, FONT } from "../theme";
import { Ask } from "./Ask";
import { Caption } from "./Caption";
import { Drift } from "./Drift";
import { End } from "./End";
import { GraphStage } from "./Graph";
import { Name } from "./Name";
import { Open } from "./Open";
import { Report } from "./Report";
import { BAR, bar, CAPTIONS } from "./timeline";

// Vertical short, 1080x1920, 40 s. Cuts and captions fall on the bar lines of
// the score: the claim and the pain (1-4), the name (5-6), the person decides
// on the graph (7-10), the work, where frame 0's question is answered
// (11-16), the weekly report (17-18), and the end card (19-20), which shows
// frame 0's bubble again with green evidence under it.

const Work: React.FC = () => {
  const frame = useCurrentFrame();
  return <GraphStage t={bar(7) + frame} />;
};

export const Short: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.text }}>
    <Backdrop />
    <Sequence name="Claim" from={bar(1)} durationInFrames={2 * BAR}>
      <Open />
    </Sequence>
    <Sequence name="Drift" from={bar(3)} durationInFrames={2 * BAR}>
      <Drift />
    </Sequence>
    <Sequence name="Name" from={bar(5)} durationInFrames={2 * BAR}>
      <Name />
    </Sequence>
    <Sequence name="Graph" from={bar(7)} durationInFrames={10 * BAR}>
      <Work />
    </Sequence>
    <Sequence name="Ask" from={bar(7)} durationInFrames={4 * BAR}>
      <Ask />
    </Sequence>
    <Sequence name="Report" from={bar(17)} durationInFrames={2 * BAR}>
      <Report />
    </Sequence>
    <Sequence name="End" from={bar(19)} durationInFrames={2 * BAR}>
      <End />
    </Sequence>
    {CAPTIONS.map((c) => (
      <Sequence key={c.bar} name={`Caption ${c.bar}`} from={bar(c.bar)} durationInFrames={(c.bars ?? 1) * BAR}>
        <Caption title={c.title} {...(c.sub ? { sub: c.sub } : {})} immediate={c.bar === 1} />
      </Sequence>
    ))}
    <Audio name="Score" src={staticFile("music/score.wav")} />
  </AbsoluteFill>
);
