import React from "react";
import { Composition } from "remotion";
import type { TimedPlan } from "@felttip/engine";
import { Whiteboard } from "./Whiteboard";

/** Placeholder so the composition mounts without input props. */
const DEFAULT_PLAN: TimedPlan = {
  title: "Felttip",
  language: "en",
  aspectRatio: "16:9",
  width: 1920,
  height: 1080,
  fps: 30,
  totalDurationMs: 3000,
  scenes: [
    {
      id: "s1",
      layout: "center",
      narration: "Felttip placeholder",
      startMs: 0,
      durationMs: 3000,
      words: [],
      elements: [
        {
          id: "s1e1",
          kind: "text",
          text: "Felttip",
          position: { x: 0.5, y: 0.5 },
          size: 0.12,
          revealAtMs: 200,
          drawDurationMs: 900,
          strokes: [],
        },
      ],
    },
  ],
};

export const Root: React.FC = () => (
  <Composition
    id="Felttip"
    component={Whiteboard}
    durationInFrames={90}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{ plan: DEFAULT_PLAN }}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(1, Math.ceil((props.plan.totalDurationMs / 1000) * props.plan.fps)),
      fps: props.plan.fps,
      width: props.plan.width,
      height: props.plan.height,
    })}
  />
);
