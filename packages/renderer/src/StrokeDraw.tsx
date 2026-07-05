import React, { useEffect, useRef, useState } from "react";
import {
  continueRender,
  delayRender,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/** Share of the draw window spent with the pen lifted between paths. */
const PEN_LIFT_SHARE = 0.12;

/**
 * The signature whiteboard effect: paths appear as if a marker is drawing
 * them, via stroke-dashoffset animated from path length to 0.
 *
 * Path lengths are measured IN THE BROWSER (getTotalLength) — Node-side
 * measurements differ slightly from Chrome's on curves, and an undersized
 * dasharray repeats, leaving permanent gaps mid-stroke. Engine-provided
 * lengths are used only to apportion time between paths. Once a path
 * finishes, dash attributes are dropped entirely: a completed stroke is a
 * plain path, so an incomplete final state is impossible.
 */
export const StrokeDraw: React.FC<{
  paths: string[];
  /** Engine-side estimates; drive time apportionment, not dash metrics. */
  pathLengths: number[];
  /** Frame (within the parent sequence) at which drawing starts. */
  startFrame: number;
  drawDurationMs: number;
  color: string;
  strokeWidthPx: number;
  /** Width of the element-local coordinate box (height is always 100). */
  viewBoxWidth?: number;
}> = ({
  paths,
  pathLengths,
  startFrame,
  drawDurationMs,
  color,
  strokeWidthPx,
  viewBoxWidth = 100,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const refs = useRef<(SVGPathElement | null)[]>([]);
  const [measured, setMeasured] = useState<number[] | null>(null);
  const [handle] = useState(() => delayRender("measure stroke paths"));

  useEffect(() => {
    setMeasured(
      paths.map((_, i) => {
        const el = refs.current[i];
        return el ? el.getTotalLength() : (pathLengths[i] ?? 1);
      }),
    );
    continueRender(handle);
    // Paths are immutable per element; measure once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalEstimate = pathLengths.reduce((a, b) => a + b, 0) || 1;
  const durFrames = Math.max(1, (drawDurationMs / 1000) * fps);
  const drawFrames = durFrames * (1 - PEN_LIFT_SHARE);
  const liftFrames =
    paths.length > 1 ? (durFrames * PEN_LIFT_SHARE) / (paths.length - 1) : 0;

  let cursor = startFrame;
  return (
    <svg
      viewBox={`0 0 ${viewBoxWidth} 100`}
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
      }}
    >
      {paths.map((d, i) => {
        const estimate = pathLengths[i] ?? 1;
        const from = cursor;
        const to = from + (estimate / totalEstimate) * drawFrames;
        cursor = to + liftFrames;
        const progress = interpolate(frame, [from, to], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const len = measured?.[i];
        const drawing = progress > 0.001 && progress < 1 && len !== undefined;
        return (
          <path
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidthPx}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{
              // Invisible until its turn (and until measurement lands).
              opacity: progress > 0.001 && measured ? 1 : 0,
              ...(drawing
                ? { strokeDasharray: len, strokeDashoffset: len * (1 - progress) }
                : {}),
            }}
          />
        );
      })}
    </svg>
  );
};
