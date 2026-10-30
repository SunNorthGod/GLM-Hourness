import React from "react";
import { Composition } from "remotion";
import { Sample } from "./Sample";
import { Short } from "./short/Short";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Sample"
        component={Sample}
        durationInFrames={720}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Short"
        component={Short}
        durationInFrames={1200}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
