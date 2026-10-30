import React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Series, staticFile, useVideoConfig } from "remotion";
import { Backdrop } from "./parts";
import { Drive } from "./scenes/Drive";
import { End } from "./scenes/End";
import { Title } from "./scenes/Title";
import { Wish } from "./scenes/Wish";

// Scene lengths follow the bars of the music (120 BPM, 2 s per bar):
// title 2 bars, /wish 4 bars from the drop, the graph 4 bars at the peak,
// end card 2 bars over the outro.
export const Sample: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Backdrop />
      <Series>
        <Series.Sequence name="Title" durationInFrames={4 * fps}>
          <Title />
        </Series.Sequence>
        <Series.Sequence name="Wish" durationInFrames={8 * fps}>
          <Wish />
        </Series.Sequence>
        <Series.Sequence name="Drive" durationInFrames={8 * fps}>
          <Drive />
        </Series.Sequence>
        <Series.Sequence name="End" durationInFrames={4 * fps}>
          <End />
        </Series.Sequence>
      </Series>
      <Audio name="Music" src={staticFile("music/sample.wav")} />
    </AbsoluteFill>
  );
};
