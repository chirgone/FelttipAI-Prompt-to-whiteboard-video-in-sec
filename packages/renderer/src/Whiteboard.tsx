import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { TimedPlan } from "@chalkline/engine";
import { SceneView } from "./SceneView";
import { PAPER_NOISE_URI, THEME } from "./theme";

export const Whiteboard: React.FC<{ plan: TimedPlan }> = ({ plan }) => {
  const { fps } = useVideoConfig();
  const msToFrames = (ms: number): number => Math.round((ms / 1000) * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.paper }}>
      <AbsoluteFill
        style={{ backgroundImage: `url("${PAPER_NOISE_URI}")`, backgroundRepeat: "repeat" }}
      />
      {plan.scenes.map((scene, i) => (
        <Sequence
          key={scene.id}
          from={msToFrames(scene.startMs)}
          durationInFrames={Math.max(1, msToFrames(scene.durationMs))}
          name={scene.id}
        >
          <SceneView scene={scene} isFirst={i === 0} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
