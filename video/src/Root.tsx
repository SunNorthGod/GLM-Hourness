import React from "react";
import { Composition } from "remotion";
import { Sample } from "./Sample";

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
    </>
  );
};
