import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * The signature whiteboard effect: paths appear as if a marker is drawing
 * them, via stroke-dashoffset animated from path length to 0. Paths draw
 * sequentially; each path's share of the window is proportional to its length.
 */
export const StrokeDraw: React.FC<{
  paths: string[];
  pathLengths: number[];
  /** Frame (within the parent sequence) at which drawing starts. */
  startFrame: number;
  drawDurationMs: number;
  color: string;
  strokeWidthPx: number;
}> = ({ paths, pathLengths, startFrame, drawDurationMs, color, strokeWidthPx }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalLength = pathLengths.reduce((a, b) => a + b, 0) || 1;
  const durFrames = Math.max(1, (drawDurationMs / 1000) * fps);

  let cumulative = 0;
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
    >
      {paths.map((d, i) => {
        const len = pathLengths[i] ?? 1;
        const from = startFrame + (cumulative / totalLength) * durFrames;
        const to = from + (len / totalLength) * durFrames;
        cumulative += len;
        const progress = interpolate(frame, [from, to], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        if (progress <= 0.001) return null;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidthPx}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            strokeDasharray={len}
            strokeDashoffset={len * (1 - progress)}
          />
        );
      })}
    </svg>
  );
};
